import { ILinkClient, MessageType, MessageItemType } from 'weixin-ilink';
import type { WeixinMessage } from 'weixin-ilink';
import type { DeliverableChannel, MessageHandler, ChannelMessage, ChannelContext } from './types';
import { createLogger } from '../infrastructure/logger';
const log = createLogger('wechat');

/**
 * 微信渠道配置
 * 通过 QR 扫码登录后获得，存入 binding 记录用于持久化
 */
export interface WeChatChannelOptions {
  /** iLink Bot Token（QR 登录后获得） */
  botToken: string;
  /** iLink API 基础地址，默认 https://ilinkai.weixin.qq.com */
  baseUrl: string;
  /** Bot 账号 ID（QR 登录后获得） */
  accountId?: string;
  /** 消息同步游标（重启恢复用，防止重复/遗漏消息） */
  cursor?: string;
}

/**
 * 微信渠道适配器
 * 使用 weixin-ilink 库内嵌连接微信 iLink Bot 服务器
 * 与 QQ 渠道模式相同：嵌入 SDK、长轮询接收消息、HTTP 发送回复
 *
 * 架构：OHA ←HTTP 长轮询→ 微信 iLink Bot 服务器 ←→ 微信客户端
 */
export class WeChatChannel implements DeliverableChannel {
  readonly name = 'wechat';
  private client: ILinkClient;
  private messageHandler?: MessageHandler;
  private abortController?: AbortController;
  /** 从入站消息中缓存的微信用户 ID（如 o9cq800kum_xxx@im.wechat），用于主动推送 */
  private cachedWechatUserId: string | null = null;
  /** 缓存最后一条消息的 contextToken，用于主动推送 */
  private cachedContextToken: string | null = null;

  constructor(options: WeChatChannelOptions) {
    this.client = new ILinkClient({
      baseUrl: options.baseUrl,
      token: options.botToken,
    });
    // 恢复上次的同步游标，避免重启后重复处理消息
    if (options.cursor) {
      this.client.cursor = options.cursor;
      log.info('cursor restored cursor=%s...', options.cursor.slice(0, 20));
    }
    log.info('channel created baseUrl=%s accountId=%s', options.baseUrl, options.accountId || '(none)');
  }

  async start(): Promise<void> {
    this.abortController = new AbortController();
    // 启动消息轮询循环（后台运行，不阻塞 start()）
    this.pollLoop();
    log.info('channel started polling');
  }

  async stop(): Promise<void> {
    this.abortController?.abort();
    log.info('channel stopped cursor=%s', this.client.cursor.slice(0, 20));
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * 主动向用户发送消息（用于心跳、定时任务等推送场景）
   * 使用缓存的微信用户 ID 和 contextToken
   * @param userId 用户ID（格式: "wechat:xxx"）
   * @param text 消息内容
   * @returns 是否成功送达
   */
  async sendToUser(userId: string, text: string): Promise<boolean> {
    if (!this.cachedWechatUserId) {
      log.warn('push skipped: no cached wechat userId');
      return false;
    }

    try {
      const contextToken = this.cachedContextToken || '';
      log.info('pushing to userId=%s wechatUserId=%s textLen=%d', userId, this.cachedWechatUserId, text.length);
      await this.client.sendTextChunked(this.cachedWechatUserId, text, contextToken);
      log.info('push sent userId=%s', userId);
      return true;
    } catch (err) {
      log.error('push failed userId=%s error=%s', userId, (err as Error).message);
      return false;
    }
  }

  /**
   * 获取当前同步游标，供外部持久化（BotManager 在 stop 时调用）
   */
  getCursor(): string {
    return this.client.cursor;
  }

  /**
   * 消息轮询循环
   * 持续调用 ILinkClient.poll() 获取新消息
   * poll() 内部使用 HTTP 长轮询（35s 超时），无消息时自动返回空数组
   * 出错时等待 5 秒后重试，避免密集重试
   */
  private async pollLoop(): Promise<void> {
    log.info('poll loop started');
    while (!this.abortController?.signal.aborted) {
      try {
        const resp = await this.client.poll();

        if (resp.msgs && resp.msgs.length > 0) {
          log.info('poll returned %d messages', resp.msgs.length);
          for (const msg of resp.msgs) {
            // 只处理用户消息（不处理 BOT 类型，那是自己发出的）
            if (msg.message_type === MessageType.USER) {
              await this.processMessage(msg);
            }
          }
        }
      } catch (err) {
        log.error('poll error: %s', (err as Error).message);
        // 出错后等待 5 秒再重试，避免密集重试消耗资源
        await this.sleep(5000);
      }
    }
    log.info('poll loop ended');
  }

  /**
   * 处理单条入站消息
   * 1. 缓存用户 ID 和 contextToken（用于主动推送）
   * 2. 从 item_list 提取文本和图片
   * 3. 构造统一的 ChannelMessage
   * 4. 通过 messageHandler 传递给 UserBot 处理
   */
  private async processMessage(msg: WeixinMessage): Promise<void> {
    if (!this.messageHandler) return;

    // 缓存用户标识，用于后续主动推送
    const fromUserId = msg.from_user_id || '';
    if (fromUserId) {
      this.cachedWechatUserId = fromUserId;
    }
    if (msg.context_token) {
      this.cachedContextToken = msg.context_token;
    }

    log.info('processing message msgId=%s from=%s type=%d items=%d',
      msg.message_id || msg.seq,
      fromUserId.slice(0, 20),
      msg.message_type,
      msg.item_list?.length || 0,
    );

    // 从 item_list 提取文本和图片
    let text = '';
    const images: Array<{ data: string; mimeType: string }> = [];

    if (msg.item_list) {
      for (const item of msg.item_list) {
        if (item.type === MessageItemType.TEXT && item.text_item?.text) {
          text += item.text_item.text;
        } else if (item.type === MessageItemType.IMAGE && (item.image_item?.url || item.image_item?.cdn_url)) {
          // 下载图片并转为 base64
          const imageUrl = item.image_item?.url || item.image_item?.cdn_url || '';
          try {
            log.info('downloading image url=%s...', imageUrl.slice(0, 60));
            const response = await fetch(imageUrl);
            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            images.push({ data: base64, mimeType: 'image/jpeg' });
            log.info('image downloaded size=%d bytes', buffer.byteLength);
          } catch (err) {
            log.error('image download failed url=%s error=%s', imageUrl.slice(0, 60), (err as Error).message);
          }
        }
      }
    }

    // 构造统一的 ChannelMessage
    const channelMsg: ChannelMessage = {
      id: String(msg.message_id || msg.seq || Date.now()),
      userId: `wechat:${fromUserId}`,
      content: text,
      channel: 'wechat',
      timestamp: new Date(msg.create_time_ms || Date.now()),
      metadata: {
        contextToken: msg.context_token,
        fromUserId,
        sessionId: msg.session_id,
      },
    };

    if (images.length > 0) {
      channelMsg.images = images;
    }

    log.info('dispatching message msgId=%s textLen=%d images=%d', channelMsg.id, text.length, images.length);

    // 构造 ChannelContext，微信不支持流式，实现 send() + sendTyping()
    const context: ChannelContext = {
      send: async (text: string) => {
        log.info('sending reply to=%s textLen=%d', fromUserId.slice(0, 20), text.length);
        await this.client.sendText(fromUserId, text, msg.context_token || '');
        log.info('reply sent msgId=%s', channelMsg.id);
      },
      sendTyping: async () => {
        try {
          await this.client.sendTyping(fromUserId, msg.context_token || '');
        } catch (err) {
          log.error('sendTyping failed error=%s', (err as Error).message);
        }
      },
    };

    await this.messageHandler(channelMsg, context);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const createWeChatChannel = (options: WeChatChannelOptions): WeChatChannel => {
  return new WeChatChannel(options);
};
