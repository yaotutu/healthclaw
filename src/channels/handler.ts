import type { SessionManager } from '../session';
import type { Store } from '../store';
import type { ChannelMessage, ChannelContext } from './types';
import { logger } from '../infrastructure/logger';
import { withTimeContext } from '../infrastructure/time';
import { assembleSystemPrompt } from '../prompts/assembler';
import { extractAssistantText } from '../agent/event-utils';

export interface CreateMessageHandlerOptions {
  sessions: SessionManager;
  store: Store;
}

export const createMessageHandler = (options: CreateMessageHandlerOptions) => {
  const { sessions, store } = options;

  return async (message: ChannelMessage, context: ChannelContext): Promise<void> => {
    const { userId, content } = message;
    logger.info('[handler] processing userId=%s channel=%s', userId, message.channel);

    const session = await sessions.getOrCreate(userId);

    // 直接从 message_end 事件捕获助手消息，不需要攒事件数组
    let assistantMessage: any = null;
    const unsubscribe = session.agent.subscribe((event) => {
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        assistantMessage = event.message;
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
      }));

      // 1. 保存用户消息到数据库
      await store.messages.appendMessage(userId, {
        role: 'user',
        content,
        timestamp: Date.now(),
        ...(imageMetadata ? { metadata: JSON.stringify({ images: imageMetadata }) } : {}),
      });

      // 2. 刷新动态上下文
      const updatedPrompt = await assembleSystemPrompt(store, userId);
      session.agent.setSystemPrompt(updatedPrompt);

      // 3. 调用 Agent
      const timedContent = withTimeContext(content);
      if (images && images.length > 0) {
        await session.agent.prompt(timedContent, images);
      } else {
        await session.agent.prompt(timedContent);
      }

      // 4. 提取响应并保存
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
    } catch (err) {
      const errMsg = (err as Error).message;
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
