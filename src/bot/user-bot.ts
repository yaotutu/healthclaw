import { createHealthAgent } from '../agent';
import { extractAssistantText } from '../agent/event-utils';
import { createSessionManager, generateConversationSummary } from '../session';
import { createMessageHandler } from '../channels';
import type { ChannelAdapter, ChannelMessage, ChannelContext, DeliverableChannel } from '../channels';
import type { Store, Message } from '../store';
import type { CronService } from '../cron/service';
import { config } from '../config';
import { logger } from '../infrastructure/logger';
import { withTimeContext } from '../infrastructure/time';

/**
 * 每用户独立运行单元
 * 封装了一个用户完整的运行时：Agent、Session、Channel
 * 各用户之间完全隔离，互不影响
 */
export class UserBot {
  readonly userId: string;

  private session: ReturnType<typeof createSessionManager> extends Promise<infer T> ? never : ReturnType<typeof createSessionManager>;
  private messageHandler: (message: ChannelMessage, context: ChannelContext) => Promise<void>;
  private channels: Map<string, ChannelAdapter> = new Map();
  /** 支持主动推送的渠道列表（用于心跳、Cron 等场景） */
  private deliverableChannels: DeliverableChannel[] = [];

  /**
   * @param userId 用户ID
   * @param store 共享存储实例（数据通过 userId 天然隔离）
   * @param cronService 定时任务服务（可选）
   */
  constructor(
    userId: string,
    private store: Store,
    private cronService?: CronService,
  ) {
    this.userId = userId;

    // 创建 Agent 工厂函数：为这个用户创建专属 Agent
    const createAgent = async (uid: string, messages: Message[]) =>
      createHealthAgent({
        store,
        userId: uid,
        messages,
        channel: 'qq',
        cronService,
      });

    // 创建独立的会话管理器
    this.session = createSessionManager({
      createAgent,
      store,
      noHistory: config.testMode,
      onSessionExpired: config.testMode ? undefined : async (uid: string) => {
        try {
          const messages = await store.messages.getMessages(uid);
          if (messages.length < 4) return;
          const summary = await generateConversationSummary(messages);
          await store.summary.save(uid, {
            summary,
            messageCount: messages.length,
            startTimestamp: messages[0].timestamp,
            endTimestamp: messages[messages.length - 1].timestamp,
          });
          logger.info('[user-bot] summary generated userId=%s count=%d', uid, messages.length);
        } catch (err) {
          logger.error('[user-bot] summary failed userId=%s error=%s', uid, (err as Error).message);
        }
      },
    });

    // 创建消息处理器
    this.messageHandler = createMessageHandler({ sessions: this.session, store });
  }

  /**
   * 处理来自外部渠道的入站消息
   * WebSocket 等渠道收到消息后调用此方法，统一走 UserBot 的消息处理流程
   * @param message 渠道消息
   * @param context 渠道上下文（用于回复）
   */
  async handleIncomingMessage(message: ChannelMessage, context: ChannelContext): Promise<void> {
    await this.messageHandler(message, context);
  }

  /**
   * 触发 Agent 处理消息并推送响应
   * 用于 Cron 定时任务等需要主动触发 Agent 并将结果推送给用户的场景
   * @param message 发给 Agent 的消息
   * @returns Agent 的响应文本，无响应返回 null
   */
  async promptAndDeliver(message: string, deliver: boolean = true): Promise<string | null> {
    try {
      const session = await this.session.getOrCreate(this.userId);

      // 直接从 message_end 事件捕获助手消息
      let assistantMessage: any = null;
      const unsubscribe = session.agent.subscribe((event) => {
        if (event.type === 'message_end' && event.message.role === 'assistant') {
          assistantMessage = event.message;
        }
      });

      await session.agent.prompt(withTimeContext(message));
      unsubscribe();

      const responseText = assistantMessage ? extractAssistantText(assistantMessage) : '';
      if (!responseText) {
        logger.warn('[user-bot] promptAndDeliver no response userId=%s', this.userId);
        return null;
      }

      if (deliver) {
        await this.store.messages.appendMessage(this.userId, {
          role: 'assistant',
          content: responseText,
          timestamp: Date.now(),
        });
        await this.sendToUser(responseText);
      }

      return responseText;
    } catch (err) {
      logger.error('[user-bot] promptAndDeliver failed userId=%s error=%s', this.userId, (err as Error).message);
      return null;
    }
  }

  /**
   * 添加渠道并启动监听
   * 渠道的 onMessage 注册后，所有收到的消息都会经过 handleMessage 处理
   * @param channel 渠道适配器实例
   */
  async addChannel(channel: ChannelAdapter): Promise<void> {
    // 注册消息处理回调
    channel.onMessage(async (message, context) => {
      // 统一使用 bot 的 userId 处理消息
      // QQ 场景：消息 userId 是 qq:{openid}，替换为 bot 的 qq:{appId}，避免身份分裂
      // WebSocket 场景：已经一致，无影响
      const unifiedMessage = { ...message, userId: this.userId };
      await this.messageHandler(unifiedMessage, context);
    });

    // 启动渠道监听（连接 QQ 等远程服务，开始接收消息）
    await channel.start();

    this.channels.set(channel.name, channel);

    // 如果是可主动推送的渠道，记录下来
    if ('sendToUser' in channel) {
      this.deliverableChannels.push(channel as DeliverableChannel);
    }

    logger.info('[user-bot] channel added userId=%s channel=%s', this.userId, channel.name);
  }

  /**
   * 向该用户主动推送消息
   * 遍历所有支持主动推送的渠道，第一个成功即停止
   * @param text 消息内容
   */
  async sendToUser(text: string): Promise<boolean> {
    for (const channel of this.deliverableChannels) {
      try {
        const delivered = await channel.sendToUser(this.userId, text);
        if (delivered) {
          logger.info('[user-bot] delivered userId=%s channel=%s', this.userId, channel.name);
          return true;
        }
      } catch (err) {
        logger.error('[user-bot] send failed userId=%s channel=%s error=%s', this.userId, channel.name, (err as Error).message);
      }
    }
    return false;
  }

  /**
   * 停止所有渠道并清理会话
   */
  async stop(): Promise<void> {
    // 停止所有渠道
    for (const channel of this.channels.values()) {
      try {
        await channel.stop();
      } catch (err) {
        logger.error('[user-bot] stop channel failed userId=%s channel=%s error=%s', this.userId, channel.name, (err as Error).message);
      }
    }
    this.channels.clear();
    this.deliverableChannels = [];

    // 清理会话
    this.session.close();

    logger.info('[user-bot] stopped userId=%s', this.userId);
  }
}
