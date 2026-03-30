/**
 * 定时任务服务
 * 参考 nanobot 的 CronService 实现
 *
 * 核心设计：
 * - 单计时器模式：始终只为最近要到期的任务设置 setTimeout
 * - JSON 文件持久化：任务数据存储在文件中，支持外部修改检测
 * - 三种调度模式：at（一次性）、every（间隔）、cron（cron表达式）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { dirname } from 'path';
import { CronExpressionParser } from 'cron-parser';
import type { CronExpressionOptions } from 'cron-parser';
import type { CronJob, CronStore, CronSchedule, CronRunRecord } from './types';
import { logger } from '../infrastructure/logger';

/** 执行历史最大保留条数 */
const MAX_RUN_HISTORY = 20;

/**
 * 生成 8 位随机 ID
 */
function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * 计算下次执行时间
 * @param schedule 调度配置
 * @param nowMs 当前时间戳（毫秒）
 * @returns 下次执行时间戳，如果不会再执行则返回 undefined
 */
function computeNextRun(schedule: CronSchedule, nowMs: number): number | undefined {
  switch (schedule.kind) {
    case 'at':
      // 一次性任务：只在指定时间执行一次
      return schedule.atMs && schedule.atMs > nowMs ? schedule.atMs : undefined;

    case 'every':
      // 间隔任务：当前时间 + 间隔
      return nowMs + (schedule.everyMs ?? 0);

    case 'cron': {
      // cron 表达式任务：使用 cron-parser 计算下次执行时间
      if (!schedule.expr) return undefined;
      try {
        const options: CronExpressionOptions = {
          currentDate: new Date(nowMs),
          ...(schedule.tz ? { tz: schedule.tz } : {}),
        };
        const interval = CronExpressionParser.parse(schedule.expr, options);
        const next = interval.next();
        return next.toDate().getTime();
      } catch {
        return undefined;
      }
    }

    default:
      return undefined;
  }
}

/**
 * CronService 配置选项
 */
export interface CronServiceOptions {
  /** 任务存储文件路径（如 ./data/cron/jobs.json） */
  storePath: string;
  /** 任务执行回调 */
  onJob: (job: CronJob) => Promise<void>;
}

/**
 * 定时任务服务
 * 管理定时任务的创建、调度、执行和持久化
 */
export class CronService {
  private storePath: string;
  private onJob: (job: CronJob) => Promise<void>;
  private jobs: Map<string, CronJob> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  /** 标记当前是否在 cron 执行上下文中（防止递归创建任务） */
  private _isCronContext = false;
  /** 上次读取文件时的修改时间，用于检测外部修改 */
  private lastMtime = 0;

  constructor(options: CronServiceOptions) {
    this.storePath = options.storePath;
    this.onJob = options.onJob;
  }

  /** 当前是否在 cron 执行上下文中 */
  get isCronContext(): boolean {
    return this._isCronContext;
  }

  /** 设置 cron 上下文标记（防止递归创建任务） */
  setCronContext(value: boolean): void {
    this._isCronContext = value;
  }

  /**
   * 启动定时任务服务
   * 从文件加载任务，计算下次执行时间，启动计时器
   */
  async start(): Promise<void> {
    this.running = true;
    this.loadStore();
    // 启动时重新计算所有任务的下次执行时间
    this.recomputeNextRuns();
    this.armTimer();
    logger.info('[cron] started jobs=%d', this.jobs.size);
  }

  /**
   * 停止定时任务服务
   * 清除计时器，停止调度
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('[cron] stopped');
  }

  /**
   * 添加定时任务
   * @param name 任务名称
   * @param schedule 调度配置
   * @param payload 触发行为
   * @param deleteAfterRun 一次性任务执行后是否删除
   * @returns 创建的任务
   */
  addJob(
    name: string,
    schedule: CronSchedule,
    payload: { message: string; deliver: boolean; channel?: string; to?: string },
    deleteAfterRun = false
  ): CronJob {
    const now = Date.now();
    const nextRunAtMs = computeNextRun(schedule, now);

    const job: CronJob = {
      id: generateId(),
      name,
      enabled: true,
      schedule,
      payload,
      state: {
        nextRunAtMs,
        runHistory: [],
      },
      createdAtMs: now,
      updatedAtMs: now,
      deleteAfterRun,
    };

    this.jobs.set(job.id, job);
    this.saveStore();
    this.armTimer();

    logger.info('[cron] job added id=%s name=%s nextRun=%s', job.id, name,
      nextRunAtMs ? new Date(nextRunAtMs).toISOString() : 'none');

    return job;
  }

  /**
   * 删除定时任务
   * @param jobId 任务ID
   * @returns 是否删除成功
   */
  removeJob(jobId: string): boolean {
    const removed = this.jobs.delete(jobId);
    if (removed) {
      this.saveStore();
      this.armTimer();
      logger.info('[cron] job removed id=%s', jobId);
    }
    return removed;
  }

  /**
   * 获取所有任务
   * @param includeDisabled 是否包含已禁用的任务
   */
  listJobs(includeDisabled = false): CronJob[] {
    const all = Array.from(this.jobs.values());
    return includeDisabled ? all : all.filter(j => j.enabled);
  }

  /**
   * 获取指定用户的任务
   * @param userId 用户ID
   */
  listJobsByUser(userId: string): CronJob[] {
    return this.listJobs().filter(j => j.payload.to === userId);
  }

  /**
   * 获取单个任务
   */
  getJob(jobId: string): CronJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * 从文件加载任务数据
   * 支持检测外部修改：如果文件被外部编辑（mtime 变化），重新加载
   */
  private loadStore(): void {
    try {
      if (!existsSync(this.storePath)) {
        this.jobs = new Map();
        return;
      }

      // 检测文件修改时间，如果未修改则跳过重新加载
      try {
        const stats = statSync(this.storePath);
        if (stats.mtimeMs === this.lastMtime && this.jobs.size > 0) {
          return;
        }
        this.lastMtime = stats.mtimeMs;
      } catch {
        // stat 失败，继续加载
      }

      const content = readFileSync(this.storePath, 'utf-8');
      const store: CronStore = JSON.parse(content);

      this.jobs = new Map();
      for (const job of store.jobs) {
        this.jobs.set(job.id, job);
      }

      logger.debug('[cron] loaded jobs=%d', this.jobs.size);
    } catch (err) {
      logger.error('[cron] load failed error=%s', (err as Error).message);
      this.jobs = new Map();
    }
  }

  /**
   * 保存任务数据到文件
   */
  private saveStore(): void {
    try {
      const store: CronStore = {
        version: 1,
        jobs: Array.from(this.jobs.values()),
      };

      // 确保目录存在
      const dir = dirname(this.storePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');

      // 更新 mtime
      try {
        const stats = statSync(this.storePath);
        this.lastMtime = stats.mtimeMs;
      } catch {
        // ignore
      }
    } catch (err) {
      logger.error('[cron] save failed error=%s', (err as Error).message);
    }
  }

  /**
   * 重新计算所有启用任务的下次执行时间
   * 在服务启动时调用
   */
  private recomputeNextRuns(): void {
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      job.state.nextRunAtMs = computeNextRun(job.schedule, now);
    }
  }

  /**
   * 设置计时器
   * 找到最近要到期的任务，设置 setTimeout
   * 使用单计时器模式，每次只追踪最近的一个到期时间
   */
  private armTimer(): void {
    // 清除现有计时器
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.running) return;

    // 找到最近要到期的任务
    let earliest: number | undefined;
    for (const job of this.jobs.values()) {
      if (!job.enabled || !job.state.nextRunAtMs) continue;
      if (earliest === undefined || job.state.nextRunAtMs < earliest) {
        earliest = job.state.nextRunAtMs;
      }
    }

    if (earliest === undefined) return;

    const delay = Math.max(0, earliest - Date.now());
    // setTimeout 最大安全延迟约 24.8 天
    const safeDelay = Math.min(delay, 2147483647);

    this.timer = setTimeout(() => this.onTimer(), safeDelay);
  }

  /**
   * 计时器触发回调
   * 执行所有到期的任务，然后重新 arm 计时器
   */
  private async onTimer(): Promise<void> {
    if (!this.running) return;

    // 重新加载（支持外部修改）
    this.loadStore();

    const now = Date.now();
    const dueJobs: CronJob[] = [];

    // 收集所有到期的任务
    for (const job of this.jobs.values()) {
      if (!job.enabled || !job.state.nextRunAtMs) continue;
      if (job.state.nextRunAtMs <= now) {
        dueJobs.push(job);
      }
    }

    // 逐个执行到期的任务
    for (const job of dueJobs) {
      await this.executeJob(job);
    }

    // 保存状态并重新 arm 计时器
    if (dueJobs.length > 0) {
      this.saveStore();
    }
    this.armTimer();
  }

  /**
   * 执行单个任务
   * 记录执行结果、处理一次性任务清理、计算下次执行时间
   */
  private async executeJob(job: CronJob): Promise<void> {
    const startMs = Date.now();
    const record: CronRunRecord = {
      runAtMs: startMs,
      status: 'ok',
      durationMs: 0,
    };

    try {
      logger.info('[cron] executing id=%s name=%s', job.id, job.name);
      await this.onJob(job);
      record.durationMs = Date.now() - startMs;
    } catch (err) {
      record.status = 'error';
      record.error = (err as Error).message;
      record.durationMs = Date.now() - startMs;
      logger.error('[cron] execute failed id=%s error=%s', job.id, (err as Error).message);
    }

    // 更新任务状态
    job.state.lastRunAtMs = startMs;
    job.state.lastStatus = record.status;
    if (record.error) job.state.lastError = record.error;
    job.state.runHistory.push(record);
    // 限制历史记录数量
    if (job.state.runHistory.length > MAX_RUN_HISTORY) {
      job.state.runHistory = job.state.runHistory.slice(-MAX_RUN_HISTORY);
    }
    job.updatedAtMs = Date.now();

    // 处理一次性任务
    if (job.schedule.kind === 'at') {
      if (job.deleteAfterRun) {
        this.jobs.delete(job.id);
        logger.info('[cron] one-shot job deleted id=%s', job.id);
      } else {
        job.enabled = false;
        job.state.nextRunAtMs = undefined;
      }
    } else {
      // 计算循环任务的下次执行时间
      job.state.nextRunAtMs = computeNextRun(job.schedule, Date.now());
    }
  }
}
