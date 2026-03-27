import { QQBotClient, type MessageEvent } from 'pure-qqbot';
import type { ChannelAdapter, MessageHandler, ChannelMessage, ChannelContext } from './types';
import { logger } from '../infrastructure/logger';

export interface QQChannelOptions {
  appId: string;
  clientSecret: string;
}

export class QQChannel implements ChannelAdapter {
  readonly name = 'qq';
  private client: QQBotClient;
  private messageHandler?: MessageHandler;

  constructor(options: QQChannelOptions) {
    this.client = new QQBotClient({
      appId: options.appId,
      clientSecret: options.clientSecret,
    });
  }

  async start(): Promise<void> {
    this.client.onMessage(async (event: MessageEvent) => {
      if (!this.messageHandler) return;

      const channelMsg: ChannelMessage = {
        id: event.messageId,
        userId: `qq:${event.senderId}`,
        content: event.content || '',
        channel: 'qq',
        timestamp: new Date(),
        metadata: {
          type: event.type,
          guildId: (event as any).guildId,
          channelId: (event as any).channelId,
          attachments: event.attachments,
        },
      };

      const context: ChannelContext = {
        send: async (text: string) => {
          await this.client.reply(event, text);
        },
        // QQ 不支持流式，不定义 sendStream，handler 会通过 send() 发送完整响应
      };

      await this.messageHandler(channelMsg, context);
    });

    await this.client.start();
    logger.info('[qq] channel started');
  }

  async stop(): Promise<void> {
    await this.client.stop();
    logger.info('[qq] channel stopped');
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}

export const createQQChannel = (options: QQChannelOptions): QQChannel => {
  return new QQChannel(options);
};
