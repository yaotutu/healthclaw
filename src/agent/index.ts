import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple, createAssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Context, AssistantMessageEventStream, AssistantMessageEvent } from '@mariozechner/pi-ai';
import type { Storage } from '../storage/index.js';
import { HEALTH_ADVISOR_PROMPT } from './system-prompt.js';
import { createRecordTool, createQueryTool } from './tools/index.js';
import { logger } from '../logger/index.js';

export interface CreateAgentOptions {
  storage: Storage;
  provider?: string;
  model?: string;
}

// 创建带日志的 stream 函数
const createLoggingStreamFn = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (model: any, context: Context, options?: any): AssistantMessageEventStream => {
    // 输出请求报文
    logger.info({ model, context, options }, '[llm] >>> request');

    // 调用原始 streamSimple
    const originalStream = streamSimple(model, context, options);

    // 创建新的 stream 用于日志收集
    const loggedStream = createAssistantMessageEventStream();
    let finalMessage: unknown = null;

    // 异步处理原始 stream
    (async () => {
      try {
        for await (const event of originalStream) {
          // 只记录 done 事件中的最终消息
          if (event.type === 'done') {
            finalMessage = event.message;
          }
          loggedStream.push(event);
        }
        loggedStream.end();
        // 只输出最终响应消息
        if (finalMessage) {
          logger.info({ response: finalMessage }, '[llm] <<< response');
        }
      } catch (err) {
        loggedStream.end();
        logger.error('[llm] error: %s', (err as Error).message);
      }
    })();

    return loggedStream;
  };
};

export const createHealthAgent = (options: CreateAgentOptions) => {
  const { storage, provider = 'anthropic', model } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentModel = getModel(provider as any, model || 'claude-sonnet-4-20250514');

  const tools = [
    createRecordTool(storage),
    createQueryTool(storage),
  ];

  logger.info('[agent] created provider=%s model=%s tools=%d', provider, model || 'default', tools.length);

  const agent = new Agent({
    initialState: {
      systemPrompt: HEALTH_ADVISOR_PROMPT,
      model: agentModel,
      tools,
      messages: [],
      thinkingLevel: 'off',
    },
    streamFn: createLoggingStreamFn(),
  });

  return agent;
};

export { HEALTH_ADVISOR_PROMPT };
