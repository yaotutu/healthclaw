import type { AgentEvent } from '@mariozechner/pi-agent-core';

/**
 * 从 Agent 事件流中提取助手响应文本
 * 从后往前找最后一个 message_end 事件，提取文本内容
 * @param events Agent 事件列表
 * @returns 提取到的文本，无则返回空字符串
 */
export const extractAssistantText = (events: AgentEvent[]): string => {
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
