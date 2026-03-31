import pino from 'pino';
import type { LogStore } from '../store/logs';

/**
 * 数据库日志写入器
 * 通过 init() 注入数据库连接，初始化前日志缓冲在内存中
 * 避免循环依赖：logger 在 store 之前创建，数据库准备好后注入
 */
class DbLogWriter {
  /** 缓冲区：存储数据库初始化前的日志 */
  private buffer: Array<{ level: number; msg: string; time: string; data: string | null; module: string | null }> = [];
  private logStore: LogStore | null = null;

  /**
   * 注入日志存储模块，同时刷入缓冲区中的历史日志
   * @param store 日志存储模块实例
   */
  init(store: LogStore): void {
    this.logStore = store;
    // 将缓冲区的日志刷入数据库
    for (const entry of this.buffer) {
      store.write(entry.level, entry.msg, entry.time, entry.data, entry.module);
    }
    this.buffer = [];
  }

  /**
   * 写入一条日志
   * 数据库未初始化时缓冲，初始化后直接写入
   */
  write(level: number, msg: string, time: string, data?: string | null, module?: string | null): void {
    if (this.logStore) {
      this.logStore.write(level, msg, time, data, module);
    } else {
      this.buffer.push({ level, msg, time, data: data ?? null, module: module ?? null });
    }
  }
}

/** 全局数据库日志写入器单例 */
export const dbLogWriter = new DbLogWriter();

const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * Pino 自定义 Stream：拦截所有日志
 * - info 及以上级别：写入数据库
 * - warn 及以上级别：同时输出到控制台
 * - debug/trace：仅写入数据库
 */
const dbStream = {
  write(chunk: string): void {
    try {
      const log = JSON.parse(chunk);
      const level = log.level as number;
      const msg = log.msg as string;
      const time = new Date(log.time as number).toISOString();
      // 从 bindings 中提取模块名（如果有的话）
      const module = log.module ?? null;

      // 提取附加数据（排除 pino 内部字段）
      const { level: _l, time: _t, msg: _m, module: _mod, ...rest } = log;
      const data = Object.keys(rest).length > 0 ? JSON.stringify(rest) : null;

      // info 及以上写入数据库
      if (level >= 30) {
        dbLogWriter.write(level, msg, time, data, module);
      }
    } catch {
      // 解析失败时静默处理
    }
  },
};

/**
 * 控制台输出 Stream
 * 只输出 warn 及以上级别的日志，保持控制台干净
 * 使用 pino-pretty 格式化输出
 */
const consoleLevel = process.env.CONSOLE_LOG_LEVEL || 'info';

export const logger = pino(
  { level: process.env.LOG_LEVEL || 'info' },
  pino.multistream([
    // 数据库 Stream：捕获所有级别日志
    { stream: dbStream, level: 'info' },
    // 控制台 Stream：只显示 warn 及以上
    {
      stream: nodeEnv !== 'production'
        ? pino.transport({ target: 'pino-pretty', options: { colorize: true } })
        : process.stdout,
      level: consoleLevel,
    },
  ])
);

// 兼容旧代码的默认导出
export default logger;
