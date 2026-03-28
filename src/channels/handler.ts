import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { SessionManager } from '../session';
import type { Store } from '../store';
import type { ChannelMessage, ChannelContext } from './types';
import { logger } from '../infrastructure/logger';

export interface CreateMessageHandlerOptions {
  sessions: SessionManager;
  store: Store;
}

export const createMessageHandler = (options: CreateMessageHandlerOptions) => {
  const { sessions, store } = options;

  const extractAssistantText = (events: AgentEvent[]): string => {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const msg = event.message;
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
              return block.text;
            }
          }
        }
      }
    }
    return '';
  };

  return async (message: ChannelMessage, context: ChannelContext): Promise<void> => {
    const { userId, content } = message;
    logger.info('[handler] processing userId=%s channel=%s', userId, message.channel);

    const session = await sessions.getOrCreate(userId);
    const events: AgentEvent[] = [];

    const unsubscribe = session.agent.subscribe((event) => {
      events.push(event);
      if (context.capabilities?.streaming) {
        if (event.type === 'message_update') {
          const msg = event.message;
          if (msg?.role === 'assistant' && typeof msg.content === 'string') {
            context.sendStream?.(msg.content, false);
          }
        } else if (event.type === 'message_end') {
          context.sendStream?.('', true);
        }
      }
    });

    try {
      // 提取图片数据，转换为 Agent 所需的 ImageContent 格式
      const images = message.images?.map(img => ({
        type: 'image' as const,
        data: img.data,
        mimeType: img.mimeType,
      }));

      // 提取图片元信息（仅存储元数据，不存储 base64 数据）
      const imageMetadata = message.images?.map(img => ({
        format: img.mimeType?.split('/')[1] || 'unknown',
        mimeType: img.mimeType,
        // 可以添加其他元信息如 size，但不包含 data
      }));

      // 1. 保存用户消息到数据库（图片元信息存入 metadata 字段，不含 base64 数据）
      await store.messages.appendMessage(userId, {
        role: 'user',
        content,
        timestamp: Date.now(),
        // 条件展开，避免传 undefined 给 Drizzle ORM
        ...(imageMetadata ? { metadata: JSON.stringify({ images: imageMetadata }) } : {}),
      });

      // 2. 调用 Agent，如有图片则传入
      if (images && images.length > 0) {
        await session.agent.prompt(content, images);
      } else {
        await session.agent.prompt(content);
      }

      // 3. 提取响应并保存
      const assistantText = extractAssistantText(events);
      if (!assistantText && events.length > 0) {
        logger.warn('[handler] no assistant text extracted events=%d userId=%s', events.length, userId);
      }
      if (assistantText) {
        await store.messages.appendMessage(userId, {
          role: 'assistant',
          content: assistantText,
          timestamp: Date.now(),
        });
        // Streaming channels already delivered content via events
        // Only call send() for non-streaming channels (like QQ)
        if (!context.capabilities?.streaming) {
          await context.send(assistantText);
        }
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      // Agent.abort() causes prompt() to reject — treat as intentional
      if (errMsg?.includes('aborted')) {
        logger.info('[handler] request aborted userId=%s', userId);
        return;
      }
      logger.error('[handler] error=%s', errMsg);
      await context.send(`处理出错: ${errMsg}`);
    } finally {
      unsubscribe();
    }
  };
};
