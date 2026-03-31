import 'dotenv/config';
import http from 'http';
import { config } from './config';
import { Store } from './store';
import { createWebSocketChannel } from './channels';
import { BotManager } from './bot';
import { createApp } from './server';
import { CronService } from './cron/service';
import { startHeartbeatScheduler } from './heartbeat';
import { logger, dbLogWriter } from './infrastructure/logger';

/**
 * 将 Node.js http 请求桥接到 Hono 处理
 * 将 Node 的 IncomingMessage 转换为标准 Request 对象，交给 Hono 处理
 * 这样可以在同一个 http 服务器上同时支持 Hono 路由和 ws 库的 WebSocket
 */
function bridgeToHono(honoFetch: (req: Request) => Response | Promise<Response>) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      // 构造完整 URL
      const protocol = 'http';
      const host = req.headers.host || `localhost:${config.port}`;
      const url = new URL(req.url!, `${protocol}://${host}`);

      // 收集请求体
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) {
        chunks.push(new Uint8Array(chunk as ArrayBuffer));
      }
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

      // 构造标准 Request 对象
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
      }

      const webRequest = new Request(url.toString(), {
        method: req.method || 'GET',
        headers,
        body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : body,
      });

      // 交给 Hono 处理
      const webResponse = await honoFetch(webRequest);

      // 将 Hono 响应写回 Node 响应
      res.statusCode = webResponse.status;
      webResponse.headers.forEach((v, k) => {
        res.setHeader(k, v);
      });

      if (webResponse.body) {
        const reader = webResponse.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err) {
      logger.error('[app] request bridge error=%s', (err as Error).message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  };
}

async function main() {
  logger.info('[app] starting health advisor agent...');
  if (config.testMode) logger.info('[app] TEST_MODE enabled: no history, no summaries');

  // 1. 初始化存储
  const store = new Store(config.dbPath);
  dbLogWriter.init(store.logs);
  logger.info('[app] database initialized path=%s', config.dbPath);

  // 2. Bot 管理器（管理所有用户的独立 Bot 实例）
  const botManager = new BotManager(store);

  // 3. 定时任务服务（任务定义存储在 SQLite，调度由 node-cron 负责）
  const cronService = new CronService({
    store: store.cronJobs,
    onJob: async (job) => {
      const userId = job.userId;
      if (!userId) return;

      logger.info('[cron] executing id=%s name=%s userId=%s', job.id, job.name, userId);
      cronService.setCronContext(true);
      try {
        // 统一通过 BotManager 获取/创建 Bot，复用 Agent + Session
        const bot = await botManager.getOrCreateBot(userId);
        await bot.promptAndDeliver(job.message, job.deliver);
      } catch (err) {
        logger.error('[cron] execute failed id=%s error=%s', job.id, (err as Error).message);
      } finally {
        cronService.setCronContext(false);
      }
    },
  });
  await cronService.start();

  // 4. 创建 Hono 应用（API 路由 + 前端静态文件）
  const honoApp = createApp(botManager);

  // 5. 创建 HTTP 服务器，桥接 Hono
  const server = http.createServer(bridgeToHono(honoApp.fetch));

  // 6. WebSocket 通道（保留作为开发/调试用途）
  const wsChannel = createWebSocketChannel({ server, path: '/ws' });
  wsChannel.onMessage(async (message, context) => {
    // 统一通过 BotManager 获取/创建 Bot，复用 Agent + Session + Handler
    const bot = await botManager.getOrCreateBot(message.userId);
    await bot.handleIncomingMessage(message, context);
  });

  await wsChannel.start();

  // 7. 从数据库恢复已绑定用户的 Bot 实例
  await botManager.init();

  // 8. 监听端口
  server.listen(config.port, () => {
    logger.info('[app] server started port=%d', config.port);
    logger.info('[app] websocket ws://localhost:%d/ws', config.port);
    logger.info('[app] login page http://localhost:%d', config.port);
  });

  // 9. 启动心跳调度器
  const heartbeat = startHeartbeatScheduler({
    store,
    intervalMs: config.heartbeat.intervalMs,
    /** 从 BotManager 获取所有活跃用户（替代原生 SQL 查询） */
    getUserIds: () => botManager.getAllBots().map(b => b.userId),
    /** 通过 UserBot 推送心跳关怀消息 */
    sendToUser: async (userId, message) => {
      const bot = botManager.getBot(userId);
      if (bot) {
        await bot.sendToUser(message);
      }
    },
  });

  // 10. 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info('[app] received %s, shutting down...', signal);

    const timeout = setTimeout(() => {
      logger.warn('[app] shutdown timeout (%dms), forcing exit', config.shutdownTimeout);
      process.exit(1);
    }, config.shutdownTimeout);

    try {
      cronService.stop();
      heartbeat.stop();
      await botManager.stopAll();
      await wsChannel.stop();

      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

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
