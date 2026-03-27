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
      if (event.type === 'message_update') {
        const msg = event.message;
        if (msg?.role === 'assistant' && typeof msg.content === 'string') {
          context.sendStream?.(msg.content, false);
        }
      } else if (event.type === 'message_end') {
        context.sendStream?.('', true);
      }
    });

    try {
      // 1. 保存用户消息
      await store.messages.appendMessage(userId, {
        role: 'user',
        content,
        timestamp: Date.now(),
      });

      // 2. 调用 Agent
      await session.agent.prompt(content);

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
        if (!context.sendStream) {
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
