import type { AssistantMessage } from '@mariozechner/pi-ai';

/**
 * 从 AssistantMessage 中提取文本内容
 * 遍历消息的 content blocks，拼接所有文本块
 * @param message 助手消息对象（来自 message_end 事件的 event.message）
 * @returns 提取到的文本，无则返回空字符串
 */
export const extractAssistantText = (message: AssistantMessage): string => {
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((block): block is { type: 'text'; text: string } =>
      block.type === 'text' && 'text' in block && typeof block.text === 'string'
    )
    .map(block => block.text)
    .join('');
};
