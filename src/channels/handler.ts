import type { Agent } from '@mariozechner/pi-agent-core';
import type { Store, Message } from '../store';
import type { ChannelMessage, ChannelContext } from './types';
import { logger } from '../infrastructure/logger';
import { withTimeContext, formatDate } from '../infrastructure/time';
import { assembleSystemPrompt } from '../prompts/assembler';
import { extractAssistantText } from '../agent/event-utils';
import { generateConversationSummary } from '../session';
import { config } from '../config';

export interface CreateMessageHandlerOptions {
  /** Agent 工厂：接收 userId 和历史消息，返回临时 Agent */
  createAgent: (userId: string, messages: Message[]) => Promise<Agent>;
  /** Agent 创建后的回调，用于外部跟踪当前活跃的 Agent（如 abort 支持） */
  onAgentCreated?: (agent: Agent) => void;
  /** Agent 处理完成后的回调，用于清理外部引用 */
  onAgentDone?: () => void;
  store: Store;
}

/**
 * 惰性摘要检查
 * 检查用户距最后一条消息的时间间隔，超过阈值则异步生成摘要
 * fire-and-forget：不阻塞当前消息处理，失败也不影响
 */
function maybeGenerateSummary(store: Store, userId: string): void {
  if (config.testMode) return;

  // fire-and-forget：不 await
  (async () => {
    try {
      const lastTimestamp = await store.messages.getLastMessageTimestamp(userId);
      if (lastTimestamp === null) return;

      const elapsed = Date.now() - lastTimestamp;
      if (elapsed < config.session.summaryIntervalMs) return;

      // 间隔足够长，生成摘要
      const messages = await store.messages.getMessages(userId);
      if (messages.length < 4) return;

      const summary = await generateConversationSummary(messages);
      await store.summary.save(userId, {
        summary,
        messageCount: messages.length,
        startTimestamp: messages[0].timestamp,
        endTimestamp: messages[messages.length - 1].timestamp,
      });
      logger.info('[handler] summary generated userId=%s count=%d', userId, messages.length);
    } catch (err) {
      logger.error('[handler] summary failed userId=%s error=%s', userId, (err as Error).message);
    }
  })();
}

export const createMessageHandler = (options: CreateMessageHandlerOptions) => {
  const { createAgent, onAgentCreated, onAgentDone, store } = options;

  return async (message: ChannelMessage, context: ChannelContext): Promise<void> => {
    const { userId, content } = message;
    logger.info('[handler] processing userId=%s channel=%s', userId, message.channel);

    try {
      // 1. 惰性摘要检查（fire-and-forget，不阻塞）
      maybeGenerateSummary(store, userId);

      // 2. 从 DB 加载历史消息
      const messages = config.testMode ? [] : await store.messages.getMessages(userId);

      // 3. 创建临时 Agent
      const agent = await createAgent(userId, messages);
      onAgentCreated?.(agent);

      // 4. 订阅 message_end 事件捕获助手响应
      let assistantMessage: any = null;
      const unsubscribe = agent.subscribe((event) => {
        if (event.type === 'message_end' && event.message.role === 'assistant') {
          assistantMessage = event.message;
        }
      });

      try {
        // 5. 提取图片数据
        const images = message.images?.map(img => ({
          type: 'image' as const,
          data: img.data,
          mimeType: img.mimeType,
        }));
        const imageMetadata = message.images?.map(img => ({
          format: img.mimeType?.split('/')[1] || 'unknown',
          mimeType: img.mimeType,
        }));

        // 6. 保存用户消息到数据库
        await store.messages.appendMessage(userId, {
          role: 'user',
          content,
          timestamp: Date.now(),
          ...(imageMetadata ? { metadata: JSON.stringify({ images: imageMetadata }) } : {}),
        });

        // 7. 刷新动态上下文并设置提示词
        const updatedPrompt = await assembleSystemPrompt(store, userId);
        agent.setSystemPrompt(updatedPrompt);

        // 8. 调用 Agent
        const timedContent = withTimeContext(content);
        if (images && images.length > 0) {
          await agent.prompt(timedContent, images);
        } else {
          await agent.prompt(timedContent);
        }

        // 9. 提取响应并保存
        const assistantText = assistantMessage ? extractAssistantText(assistantMessage) : '';
        if (assistantText) {
          await store.messages.appendMessage(userId, {
            role: 'assistant',
            content: assistantText,
            timestamp: Date.now(),
          });
          if (!context.capabilities?.streaming) {
            await context.send(assistantText);
          }
        }
      } finally {
        unsubscribe();
        onAgentDone?.();
      }
    } catch (err) {
      const errMsg = (err as Error).message;

      // abort 不是错误，静默处理
      if (errMsg?.includes('aborted')) {
        logger.info('[handler] request aborted userId=%s', userId);
        return;
      }

      // 其他错误：兜底回复，确保用户收到响应
      logger.error('[handler] error=%s', errMsg);
      const timestamp = formatDate(Date.now());
      try {
        await context.send(`抱歉，${timestamp} 处理时出了点问题，请稍后再试。`);
      } catch (sendErr) {
        logger.error('[handler] fallback send failed userId=%s error=%s', userId, (sendErr as Error).message);
      }
    }
  };
};
