import type { Store } from '../store';
import { runHeartbeat, type HeartbeatResult } from './runner';
import { logger } from '../infrastructure/logger';

/**
 * 心跳调度器配置选项
 */
export interface HeartbeatOptions {
  /** Store 实例，用于访问数据库 */
  store: Store;
  /** 扫描间隔（毫秒），默认 15 分钟 */
  intervalMs: number;
  /** 获取所有需要检查的用户ID列表（由 BotManager 提供） */
  getUserIds: () => string[];
  /** 向用户发送消息的回调函数 */
  sendToUser: (userId: string, message: string) => Promise<void>;
}

/**
 * 启动心跳调度器
 * 定期扫描所有用户的健康数据，由 LLM 判断是否需要主动推送关怀消息
 *
 * 调度器工作流程：
 * 1. 每隔 intervalMs 执行一次 tick
 * 2. 对每个有心跳任务的用户：读取 DB 中的任务 → 收集用户上下文 → 发给 LLM 决策
 * 3. 对 LLM 决定 run 的用户，通过 sendToUser 回调推送关怀消息
 *
 * @param options 配置选项
 * @returns 包含 stop 方法的对象，用于停止调度器
 */
export function startHeartbeatScheduler(options: HeartbeatOptions): { stop: () => void } {
  const { store, intervalMs, getUserIds, sendToUser } = options;

  /**
   * 单次心跳检查
   * 执行 runHeartbeat 获取 LLM 决策结果，逐个推送关怀消息
   */
  const tick = async () => {
    try {
      logger.info('[heartbeat] tick');
      const userIds = getUserIds();
      const results = await runHeartbeat(store, userIds);
      // 逐个发送关怀消息
      for (const result of results) {
        try {
          await sendToUser(result.userId, result.message);
          logger.info('[heartbeat] sent userId=%s', result.userId);
        } catch (err) {
          logger.error('[heartbeat] send failed userId=%s error=%s', result.userId, (err as Error).message);
        }
      }
    } catch (err) {
      logger.error('[heartbeat] error=%s', (err as Error).message);
    }
  };

  // 使用 setInterval 定期执行心跳检查
  const timer = setInterval(tick, intervalMs);

  logger.info('[heartbeat] started interval=%dms', intervalMs);

  return {
    /** 停止心跳调度器，清除定时器 */
    stop: () => {
      clearInterval(timer);
      logger.info('[heartbeat] stopped');
    },
  };
}
