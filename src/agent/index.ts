import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple } from '@mariozechner/pi-ai';
import type { Context, AssistantMessageEventStream } from '@mariozechner/pi-ai';
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
    // 格式化打印请求报文
    logger.info('[llm] ==================== 请求 ====================');
    logger.info('[llm] model: %s', JSON.stringify(model, null, 2));
    logger.info('[llm] systemPrompt:\n%s', context.systemPrompt);
    logger.info('[llm] messages:\n%s', JSON.stringify(context.messages, null, 2));
    if (context.tools?.length) {
      logger.info('[llm] tools:\n%s', JSON.stringify(context.tools.map(t => ({ name: t.name, description: t.description })), null, 2));
    }
    logger.info('[llm] options:\n%s', JSON.stringify(options, null, 2));

    // 调用原始 streamSimple
    return streamSimple(model, context, options);
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
