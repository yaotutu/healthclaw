/**
 * 定时任务系统类型定义
 * 参考 nanobot 的 cron 设计，支持三种调度模式：
 * - at: 一次性定时任务
 * - every: 间隔循环任务
 * - cron: cron 表达式任务
 */

/** 定时任务调度配置 */
export interface CronSchedule {
  /** 调度类型：at=一次性, every=间隔循环, cron=cron表达式 */
  kind: 'at' | 'every' | 'cron';
  /** 一次性执行的时间戳（毫秒），kind=at 时使用 */
  atMs?: number;
  /** 间隔循环的间隔时间（毫秒），kind=every 时使用 */
  everyMs?: number;
  /** cron 表达式（如 "0 9 * * *" 表示每天9点），kind=cron 时使用 */
  expr?: string;
  /** 时区（如 "Asia/Shanghai"），仅 cron 类型使用 */
  tz?: string;
}

/** 任务触发时的行为配置 */
export interface CronPayload {
  /** 发送给 Agent 的指令内容 */
  message: string;
  /** 是否将 Agent 的回复推送给用户 */
  deliver: boolean;
  /** 指定推送的通道（如 "websocket"、"qq"） */
  channel?: string;
  /** 目标用户ID */
  to?: string;
}

/** 单次执行记录 */
export interface CronRunRecord {
  /** 执行时间戳（毫秒） */
  runAtMs: number;
  /** 执行状态 */
  status: 'ok' | 'error' | 'skipped';
  /** 执行耗时（毫秒） */
  durationMs: number;
  /** 错误信息（status=error 时） */
  error?: string;
}

/** 任务运行时状态 */
export interface CronJobState {
  /** 下次执行时间戳（毫秒） */
  nextRunAtMs?: number;
  /** 上次执行时间戳（毫秒） */
  lastRunAtMs?: number;
  /** 上次执行状态 */
  lastStatus?: 'ok' | 'error' | 'skipped';
  /** 上次执行错误信息 */
  lastError?: string;
  /** 执行历史（最多保留 20 条） */
  runHistory: CronRunRecord[];
}

/** 定时任务定义 */
export interface CronJob {
  /** 任务唯一ID（8位随机字符串） */
  id: string;
  /** 任务名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 调度配置 */
  schedule: CronSchedule;
  /** 触发行为配置 */
  payload: CronPayload;
  /** 运行时状态 */
  state: CronJobState;
  /** 创建时间戳（毫秒） */
  createdAtMs: number;
  /** 更新时间戳（毫秒） */
  updatedAtMs: number;
  /** 一次性任务执行后自动删除 */
  deleteAfterRun: boolean;
}

/** 定时任务持久化存储结构 */
export interface CronStore {
  /** 存储格式版本 */
  version: number;
  /** 任务列表 */
  jobs: CronJob[];
}
