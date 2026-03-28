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
  /** 发送消息的回调函数，用于向用户推送关怀消息 */
  sendMessage: (userId: string, message: string) => Promise<void>;
}

/**
 * 启动心跳调度器
 * 定期扫描所有用户的健康数据，发现异常时主动推送关怀消息
 * 调度器会在指定间隔内反复执行心跳检查：
 * 1. 读取 heartbeat.md 中的活跃任务
 * 2. 遍历所有用户进行异常检测
 * 3. 对有异常的用户通过 sendMessage 回调推送关怀消息
 * @param options 配置选项，包含 store、间隔时间和消息发送回调
 * @returns 包含 stop 方法的对象，用于停止调度器
 */
export function startHeartbeatScheduler(options: HeartbeatOptions): { stop: () => void } {
  const { store, intervalMs, sendMessage } = options;

  /**
   * 单次心跳检查
   * 执行心跳任务，获取异常用户列表并逐个推送消息
   */
  const tick = async () => {
    try {
      logger.info('[heartbeat] tick');
      const results = await runHeartbeat(store);
      // 逐个发送关怀消息
      for (const result of results) {
        try {
          await sendMessage(result.userId, result.message);
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
