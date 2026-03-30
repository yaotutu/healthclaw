import 'dotenv/config';
import http from 'http';
import { config } from './config';
import { Store } from './store';
import { createHealthAgent } from './agent';
import { createSessionManager, generateConversationSummary } from './session';
import { createMessageHandler, createWebSocketChannel, createQQChannel } from './channels';
import type { ChannelAdapter, DeliverableChannel } from './channels';
import { startHeartbeatScheduler } from './heartbeat';
import { CronService } from './cron/service';
import { logger, dbLogWriter } from './infrastructure/logger';

async function main() {
  logger.info('[app] starting health advisor agent...');
  if (config.testMode) logger.info('[app] TEST_MODE enabled: no history, no summaries');

  // 1. 初始化存储
  const store = new Store(config.dbPath);
  // 将日志存储注入 logger，之后所有日志将写入数据库
  dbLogWriter.init(store.logs);
  logger.info('[app] database initialized path=%s', config.dbPath);

  // 2. 定时任务服务（需要在 Agent 工厂之前初始化，因为 Agent 需要注入 cron 工具）
  const cronService = new CronService({
    storePath: config.cron.storePath,
    onJob: async (job) => {
      const userId = job.payload.to;
      if (!userId) return;

      logger.info('[cron] executing id=%s name=%s userId=%s', job.id, job.name, userId);

      // 标记 cron 上下文，防止递归创建任务
      cronService.setCronContext(true);
      try {
        // 为目标用户创建 Agent 并执行任务
        const agent = await createHealthAgent({
          store,
          userId,
          channel: job.payload.channel || 'websocket',
          cronService,
        });

        // 收集 Agent 事件流
        const events: any[] = [];
        agent.subscribe((event: any) => {
          events.push(event);
        });

        // 发送任务消息给 Agent
        await agent.prompt(job.payload.message);

        // 如果需要推送回复给用户
        if (job.payload.deliver) {
          // 从事件流中提取 Agent 响应文本
          let responseText = '';
          for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].type === 'done' && events[i].message) {
              responseText = events[i].message.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('');
              break;
            }
          }

          if (responseText) {
            // 存储到消息历史
            await store.messages.appendMessage(userId, {
              role: 'assistant',
              content: responseText,
              timestamp: Date.now(),
            });
            // 主动推送给用户
            await sendToUser(userId, responseText);
          }
        }
      } catch (err) {
        logger.error('[cron] execute failed id=%s error=%s', job.id, (err as Error).message);
      } finally {
        cronService.setCronContext(false);
      }
    },
  });

  // 3. 创建 Agent 工厂（注入 cronService 使 Agent 拥有定时任务工具）
  const createAgent = async (userId: string, messages: Parameters<typeof createHealthAgent>[0]['messages']) =>
    createHealthAgent({ store, userId, messages, cronService });

  // 4. 会话管理（包含过期时的对话摘要生成回调）
  const sessions = createSessionManager({
    createAgent,
    store,
    noHistory: config.testMode,
    /** 会话过期时自动生成对话摘要并保存到数据库（测试模式下跳过） */
    onSessionExpired: config.testMode ? undefined : async (userId: string) => {
      try {
        const messages = await store.messages.getMessages(userId);
        // 至少需要2轮对话（4条消息）才生成摘要
        if (messages.length < 4) return;

        const summary = await generateConversationSummary(messages);
        await store.summary.save(userId, {
          summary,
          messageCount: messages.length,
          startTimestamp: messages[0].timestamp,
          endTimestamp: messages[messages.length - 1].timestamp,
        });
        logger.info('[main] summary generated userId=%s count=%d', userId, messages.length);
      } catch (err) {
        logger.error('[main] summary generation failed userId=%s error=%s', userId, (err as Error).message);
      }
    },
  });

  // 5. 消息处理器
  const handleMessage = createMessageHandler({ sessions, store });

  // 6. 收集所有通道（用于关闭）
  const channels: ChannelAdapter[] = [];
  // 收集支持主动推送的通道
  const deliverableChannels: DeliverableChannel[] = [];

  /**
   * 向用户主动推送消息
   * 尝试所有支持主动推送的通道，第一个成功即停止
   * @param userId 用户ID
   * @param text 消息内容
   */
  const sendToUser = async (userId: string, text: string): Promise<boolean> => {
    for (const channel of deliverableChannels) {
      try {
        const delivered = await channel.sendToUser(userId, text);
        if (delivered) {
          logger.info('[app] message delivered userId=%s channel=%s', userId, channel.name);
          return true;
        }
      } catch (err) {
        logger.error('[app] send failed userId=%s channel=%s error=%s', userId, channel.name, (err as Error).message);
      }
    }
    logger.info('[app] no active channel for userId=%s', userId);
    return false;
  };

  // 7. 创建 HTTP 服务器
  const server = http.createServer();

  // 8. 启动 WebSocket 通道
  const wsChannel = createWebSocketChannel({ server, path: '/ws' });
  wsChannel.onMessage(handleMessage);
  wsChannel.onAbort((userId) => sessions.abort(userId));
  await wsChannel.start();
  channels.push(wsChannel);
  deliverableChannels.push(wsChannel);

  // 9. 启动 QQ Bot 通道（可选）
  if (config.qq.appId && config.qq.appSecret) {
    try {
      const qqChannel = createQQChannel({
        appId: config.qq.appId!,
        clientSecret: config.qq.clientSecret!,
      });
      qqChannel.onMessage(handleMessage);
      await qqChannel.start();
      channels.push(qqChannel);
      deliverableChannels.push(qqChannel);
      logger.info('[app] qq bot started');
    } catch (err) {
      logger.error('[app] qq bot failed to start: %s', (err as Error).message);
    }
  }

  // 10. 监听端口
  server.listen(config.port, () => {
    logger.info('[app] server started port=%d', config.port);
    logger.info('[app] websocket ws://localhost:%d/ws', config.port);
  });

  // 11. 启动心跳调度器（LLM 驱动决策 + 主动推送）
  const heartbeat = startHeartbeatScheduler({
    store,
    intervalMs: config.heartbeat.intervalMs,
    sendToUser: async (userId, message) => {
      // 将关怀消息存入消息历史
      await store.messages.appendMessage(userId, {
        role: 'assistant',
        content: message,
        timestamp: Date.now(),
      });
      // 主动推送给用户
      await sendToUser(userId, message);
    },
  });

  // 12. 启动定时任务服务
  await cronService.start();

  // 13. 优雅关闭
  const shutdown = async (signal: string) => {
    logger.info('[app] received %s, shutting down...', signal);

    const timeout = setTimeout(() => {
      logger.warn('[app] shutdown timeout (%dms), forcing exit', config.shutdownTimeout);
      process.exit(1);
    }, config.shutdownTimeout);

    try {
      // 停止定时任务服务
      cronService.stop();

      // 停止心跳调度器
      heartbeat.stop();

      // 停止所有通道
      for (const channel of channels) {
        await channel.stop();
      }

      // 关闭 HTTP 服务器 (promisified)
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });

      // 清理会话
      sessions.close();

      // 关闭存储
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
