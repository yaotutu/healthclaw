import type { Agent } from '@mariozechner/pi-agent-core';
import { createHealthAgent } from '../agent';
import { extractAssistantText } from '../agent/event-utils';
import { createMessageHandler } from '../channels';
import type { ChannelAdapter, ChannelMessage, ChannelContext, DeliverableChannel } from '../channels';
import type { Store, Message } from '../store';
import type { CronService } from '../cron/service';
import { config } from '../config';
import { logger } from '../infrastructure/logger';
import { withTimeContext, formatDate } from '../infrastructure/time';
import { assembleSystemPrompt } from '../prompts/assembler';

/**
 * 每用户独立运行单元（无状态版本）
 * 每条消息创建临时 Agent，用完即弃，不在内存中缓存状态
 * 通过 Promise 链串行锁保证同一用户的消息按顺序处理
 */
export class UserBot {
  readonly userId: string;

  private store: Store;
  private cronService?: CronService;
  private channels: Map<string, ChannelAdapter> = new Map();
  /** 支持主动推送的渠道列表 */
  private deliverableChannels: DeliverableChannel[] = [];
  /** 主通道名称（第一个绑定的通道），用于 Agent 创建时标识通道 */
  private primaryChannel: string = 'websocket';
  /** 串行锁：保证同一用户的消息和 promptAndDeliver 按顺序执行 */
  private queue: Promise<void> = Promise.resolve();
  /** 当前正在运行的 Agent 引用（用于 abort） */
  private currentAgent: Agent | null = null;
  /** 消息处理器 */
  private messageHandler: (message: ChannelMessage, context: ChannelContext) => Promise<void>;

  /**
   * @param userId 用户ID
   * @param store 共享存储实例（数据通过 userId 天然隔离）
   * @param cronService 定时任务服务（可选）
   */
  constructor(
    userId: string,
    store: Store,
    cronService?: CronService,
  ) {
    this.userId = userId;
    this.store = store;
    this.cronService = cronService;

    // Agent 工厂：为这个用户创建临时 Agent（channel 在 addChannel 时更新）
    const createAgent = async (uid: string, messages: Message[]) =>
      createHealthAgent({
        store,
        userId: uid,
        messages,
        channel: this.primaryChannel,
        cronService,
      });

    // 创建消息处理器（使用 createAgent 工厂，不依赖 SessionManager）
    this.messageHandler = createMessageHandler({
      createAgent,
      onAgentCreated: (agent) => { this.currentAgent = agent; },
      onAgentDone: () => { this.currentAgent = null; },
      store,
    });
  }

  /**
   * 串行执行：保证同一用户的请求按顺序处理
   * 前一个请求完成后才开始下一个
   */
  private async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.queue;
    let resolve: () => void;
    this.queue = new Promise<void>(r => { resolve = r; });
    await prev;
    try {
      return await fn();
    } finally {
      resolve!();
    }
  }

  /**
   * 处理来自外部渠道的入站消息
   * WebSocket、QQ 等渠道收到消息后调用此方法
   */
  async handleIncomingMessage(message: ChannelMessage, context: ChannelContext): Promise<void> {
    await this.enqueue(() => this.messageHandler(message, context));
  }

  /**
   * 触发 Agent 处理消息并推送响应
   * 用于 Cron 定时任务、心跳等需要主动触发 Agent 的场景
   */
  async promptAndDeliver(message: string, deliver: boolean = true): Promise<string | null> {
    return this.enqueue(async () => {
      try {
        // 从 DB 加载历史消息
        const messages: Message[] = config.testMode ? [] : await this.store.messages.getMessages(this.userId);

        // 创建临时 Agent（传入 cronService，保持与 handler 创建的 Agent 一致）
        const agent = await createHealthAgent({
          store: this.store,
          userId: this.userId,
          messages,
          channel: this.primaryChannel,
          cronService: this.cronService,
        });

        this.currentAgent = agent;

        // 订阅 message_end 事件捕获助手响应
        let assistantMessage: any = null;
        const unsubscribe = agent.subscribe((event) => {
          if (event.type === 'message_end' && event.message.role === 'assistant') {
            assistantMessage = event.message;
          }
        });

        try {
          // 保存触发的消息到数据库（所有消息必须永久保留）
          await this.store.messages.appendMessage(this.userId, {
            role: 'user',
            content: message,
            timestamp: Date.now(),
          });

          // 刷新动态上下文（确保使用最新数据）
          const updatedPrompt = await assembleSystemPrompt(this.store, this.userId);
          agent.setSystemPrompt(updatedPrompt);

          await agent.prompt(withTimeContext(message));
        } finally {
          unsubscribe();
          this.currentAgent = null;
        }

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
        // 兜底回复：cron 任务失败也通知用户
        logger.error('[user-bot] promptAndDeliver failed userId=%s error=%s', this.userId, (err as Error).message);
        if (deliver) {
          const timestamp = formatDate(Date.now());
          try {
            await this.sendToUser(`抱歉，${timestamp} 处理时出了点问题，请稍后再试。`);
          } catch (sendErr) {
            logger.error('[user-bot] fallback send failed userId=%s error=%s', this.userId, (sendErr as Error).message);
          }
        }
        return null;
      }
    });
  }

  /**
   * 中止当前正在处理的请求
   * 通过串行锁保证同一时间最多只有一个 Agent
   */
  abort(): void {
    this.currentAgent?.abort();
  }

  /**
   * 添加渠道并启动监听
   */
  async addChannel(channel: ChannelAdapter): Promise<void> {
    // 注册消息处理回调（通过 handleIncomingMessage 走串行锁）
    channel.onMessage(async (message, context) => {
      const unifiedMessage = { ...message, userId: this.userId };
      await this.handleIncomingMessage(unifiedMessage, context);
    });

    // 注册 abort 处理（WebSocket 等支持 abort 的通道）
    if ('onAbort' in channel && typeof (channel as any).onAbort === 'function') {
      (channel as any).onAbort(() => this.abort());
    }

    // 启动渠道监听
    await channel.start();
    this.channels.set(channel.name, channel);

    // 第一个绑定的通道作为主通道（用于 Agent 创建时的 channel 参数）
    if (this.channels.size === 1) {
      this.primaryChannel = channel.name;
    }

    // 如果是可主动推送的渠道，记录下来
    if ('sendToUser' in channel) {
      this.deliverableChannels.push(channel as DeliverableChannel);
    }

    logger.info('[user-bot] channel added userId=%s channel=%s', this.userId, channel.name);
  }

  /**
   * 向该用户主动推送消息
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
   * 停止所有渠道
   */
  async stop(): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.stop();
      } catch (err) {
        logger.error('[user-bot] stop channel failed userId=%s channel=%s error=%s', this.userId, channel.name, (err as Error).message);
      }
    }
    this.channels.clear();
    this.deliverableChannels = [];
    logger.info('[user-bot] stopped userId=%s', this.userId);
  }
}
