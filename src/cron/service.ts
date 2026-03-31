/**
 * 定时任务服务
 *
 * 核心设计：
 * - 任务定义持久化到 SQLite（统一存储，重启恢复）
 * - 调度由 node-cron（cron 表达式）/ setInterval（间隔）/ setTimeout（一次性）负责
 * - 每个任务有独立的调度器，添加/删除时实时注册/取消
 */
import cron, { type ScheduledTask } from 'node-cron';
import type { CronJobStore } from '../store/cron-store';
import type { CronJobRecord } from '../store/schema';
import { logger } from '../infrastructure/logger';

/**
 * CronService 配置选项
 */
export interface CronServiceOptions {
  /** 定时任务存储层 */
  store: CronJobStore;
  /** 任务执行回调 */
  onJob: (job: CronJobRecord) => Promise<void>;
}

/**
 * 定时任务服务
 * 管理定时任务的创建、调度、执行和持久化
 */
export class CronService {
  private store: CronJobStore;
  private onJob: (job: CronJobRecord) => Promise<void>;
  /** 调度器映射：jobId → 定时器/ScheduledTask/timeout */
  private schedulers: Map<string, ScheduledTask | ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>> = new Map();
  /** 标记当前是否在 cron 执行上下文中（防止递归创建任务） */
  private _isCronContext = false;
  /** 服务是否运行中 */
  private running = false;

  constructor(options: CronServiceOptions) {
    this.store = options.store;
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
   * 从数据库加载所有启用的任务，注册调度器
   */
  async start(): Promise<void> {
    this.running = true;
    const jobs = await this.store.listEnabled();
    for (const job of jobs) {
      this.scheduleJob(job);
    }
    logger.info('[cron] started jobs=%d', jobs.length);
  }

  /**
   * 停止定时任务服务
   * 取消所有调度器
   */
  stop(): void {
    this.running = false;
    for (const [id, scheduler] of this.schedulers) {
      this.cancelScheduler(scheduler);
    }
    this.schedulers.clear();
    logger.info('[cron] stopped');
  }

  /**
   * 添加定时任务
   * 写入数据库 + 注册调度器
   */
  async addJob(
    name: string,
    schedule: { kind: 'at' | 'every' | 'cron'; atMs?: number; everyMs?: number; expr?: string; tz?: string },
    payload: { message: string; deliver: boolean; channel?: string; to?: string },
    deleteAfterRun = false,
  ): Promise<CronJobRecord> {
    const now = Date.now();
    const id = Math.random().toString(36).slice(2, 10);

    const record = await this.store.insert({
      id,
      userId: payload.to ?? '',
      name,
      enabled: true,
      scheduleKind: schedule.kind,
      scheduleAt: schedule.atMs ?? null,
      scheduleEvery: schedule.everyMs ?? null,
      scheduleExpr: schedule.expr ?? null,
      scheduleTz: schedule.tz ?? null,
      message: payload.message,
      deliver: payload.deliver,
      channel: payload.channel ?? null,
      deleteAfterRun,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });

    this.scheduleJob(record);

    logger.info('[cron] job added id=%s name=%s kind=%s', id, name, schedule.kind);
    return record;
  }

  /**
   * 删除定时任务
   * 从数据库删除 + 取消调度器
   */
  async removeJob(jobId: string): Promise<boolean> {
    this.cancelScheduler(jobId);
    const removed = await this.store.remove(jobId);
    if (removed) {
      logger.info('[cron] job removed id=%s', jobId);
    }
    return removed;
  }

  /**
   * 获取指定用户的启用任务
   */
  async listJobsByUser(userId: string): Promise<CronJobRecord[]> {
    return this.store.listByUser(userId);
  }

  /**
   * 获取单个任务
   */
  async getJob(jobId: string): Promise<CronJobRecord | undefined> {
    return this.store.getById(jobId);
  }

  /**
   * 获取所有启用的任务
   */
  async listJobs(): Promise<CronJobRecord[]> {
    return this.store.listEnabled();
  }

  // ==================== 调度器管理 ====================

  /**
   * 为任务注册调度器
   * 根据调度类型选择不同的调度方式：
   * - cron: 使用 node-cron
   * - every: 使用 setInterval
   * - at: 使用 setTimeout（一次性）
   */
  private scheduleJob(job: CronJobRecord): void {
    if (!job.enabled) return;

    switch (job.scheduleKind) {
      case 'cron': {
        // cron 表达式模式：使用 node-cron 调度
        if (!job.scheduleExpr) return;
        const task = cron.schedule(job.scheduleExpr, () => this.executeJob(job), {
          timezone: job.scheduleTz ?? undefined,
        });
        this.schedulers.set(job.id, task);
        break;
      }

      case 'every': {
        // 间隔循环模式：使用 setInterval
        if (!job.scheduleEvery) return;
        const interval = setInterval(() => this.executeJob(job), job.scheduleEvery);
        this.schedulers.set(job.id, interval);
        break;
      }

      case 'at': {
        // 一次性模式：使用 setTimeout
        if (!job.scheduleAt) return;
        const delay = job.scheduleAt - Date.now();
        if (delay <= 0) {
          // 已过期，立即执行
          this.executeJob(job);
          return;
        }
        const timeout = setTimeout(() => this.executeJob(job), delay);
        this.schedulers.set(job.id, timeout);
        break;
      }
    }
  }

  /**
   * 执行单个任务
   * 调用 onJob 回调，更新执行状态，处理一次性任务清理
   */
  private async executeJob(job: CronJobRecord): Promise<void> {
    logger.info('[cron] executing id=%s name=%s userId=%s', job.id, job.name, job.userId);

    try {
      await this.onJob(job);
      await this.store.updateStatus(job.id, 'ok');
    } catch (err) {
      await this.store.updateStatus(job.id, 'error', (err as Error).message);
      logger.error('[cron] execute failed id=%s error=%s', job.id, (err as Error).message);
    }

    // 一次性任务执行后清理
    if (job.scheduleKind === 'at') {
      this.cancelScheduler(job.id);
      if (job.deleteAfterRun) {
        await this.store.remove(job.id);
        logger.info('[cron] one-shot job deleted id=%s', job.id);
      } else {
        await this.store.disable(job.id);
      }
    }
  }

  /**
   * 取消调度器（支持按 ID 或直接传调度器引用）
   */
  private cancelScheduler(idOrScheduler: string | ScheduledTask | ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): void {
    if (typeof idOrScheduler === 'string') {
      const scheduler = this.schedulers.get(idOrScheduler);
      if (scheduler) {
        this.doCancel(scheduler);
        this.schedulers.delete(idOrScheduler);
      }
    } else {
      this.doCancel(idOrScheduler);
    }
  }

  /**
   * 根据调度器类型执行取消操作
   */
  private doCancel(scheduler: ScheduledTask | ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): void {
    if ('stop' in scheduler) {
      // node-cron ScheduledTask
      (scheduler as ScheduledTask).stop();
    } else {
      // setInterval / setTimeout
      clearTimeout(scheduler as ReturnType<typeof setTimeout>);
    }
  }
}
