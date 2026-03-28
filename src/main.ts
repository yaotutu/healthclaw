import 'dotenv/config';
import http from 'http';
import { Store } from './store';
import { createHealthAgent } from './agent';
import { createSessionManager } from './session';
import { createMessageHandler, createWebSocketChannel, createQQChannel } from './channels';
import type { ChannelAdapter } from './channels';
import { logger } from './infrastructure/logger';

const PORT = parseInt(process.env.PORT || '3001', 10);
const DB_PATH = process.env.DB_PATH || './workspace/healthclaw.db';
const SHUTDOWN_TIMEOUT = 10000;

async function main() {
  logger.info('[app] starting health advisor agent...');

  // 1. 初始化存储
  const store = new Store(DB_PATH);
  logger.info('[app] database initialized path=%s', DB_PATH);

  // 2. 创建 Agent 工厂（异步函数，因为需要查询用户档案）
  const createAgent = async (userId: string, messages: Parameters<typeof createHealthAgent>[0]['messages']) =>
    createHealthAgent({ store, userId, messages });

  // 3. 会话管理
  const sessions = createSessionManager({ createAgent, store });

  // 4. 消息处理器
  const handleMessage = createMessageHandler({ sessions, store });

  // 5. 收集所有通道（用于关闭）
  const channels: ChannelAdapter[] = [];

  // 6. 创建 HTTP 服务器
  const server = http.createServer();

  // 7. 启动 WebSocket 通道
  const wsChannel = createWebSocketChannel({ server, path: '/ws' });
  wsChannel.onMessage(handleMessage);
  wsChannel.onAbort((userId) => sessions.abort(userId));
  await wsChannel.start();
  channels.push(wsChannel);

  // 8. 启动 QQ Bot 通道（可选）
  if (process.env.QQBOT_APP_ID && process.env.QQBOT_APP_SECRET) {
    try {
      const qqChannel = createQQChannel({
        appId: process.env.QQBOT_APP_ID,
        clientSecret: process.env.QQBOT_CLIENT_SECRET || process.env.QQBOT_APP_SECRET,
      });
      qqChannel.onMessage(handleMessage);
      await qqChannel.start();
      channels.push(qqChannel);
      logger.info('[app] qq bot started');
    } catch (err) {
      logger.error('[app] qq bot failed to start: %s', (err as Error).message);
    }
  }

  // 9. 监听端口
  server.listen(PORT, () => {
    logger.info('[app] server started port=%d', PORT);
    logger.info('[app] websocket ws://localhost:%d/ws', PORT);
  });

  // 10. 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info('[app] received %s, shutting down...', signal);

    const timeout = setTimeout(() => {
      logger.warn('[app] shutdown timeout (%dms), forcing exit', SHUTDOWN_TIMEOUT);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT);

    try {
      // 1. 停止所有通道
      for (const channel of channels) {
        await channel.stop();
      }

      // 2. 关闭 HTTP 服务器 (promisified)
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

      // 3. 清理会话
      sessions.close();

      // 4. 关闭存储
      store.close();

      clearTimeout(timeout);
      logger.info('[app] shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('[app] shutdown error=%s', (err as Error).message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('[app] fatal error=%s', err.message);
  process.exit(1);
});
