import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple, createAssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Context, AssistantMessageEventStream, UserMessage, AssistantMessage } from '@mariozechner/pi-ai';
import type { Storage } from '../../infrastructure/storage/interface.js';
import type { Message } from '../../infrastructure/storage/session-store.js';
import { logger } from '../../infrastructure/logger.js';
import { config } from '../../config/index.js';
import { HEALTH_ADVISOR_PROMPT } from './prompt.js';
import { createRecordTool, createQueryTool } from './tools/index.js';

export interface CreateAgentOptions {
  storage: Storage;
  provider?: string;
  model?: string;
  /** 初始消息历史 */
  messages?: Message[];
}

/**
 * 转换消息格式为 Agent 可用的格式
 * 注意：只转换 user 消息，assistant 消息需要完整的 LLM 响应结构
 */
const convertMessages = (messages: Message[]): Array<UserMessage | AssistantMessage> => {
  const result: Array<UserMessage | AssistantMessage> = [];
  for (const m of messages) {
    if (m.role === 'user') {
      result.push({
        role: 'user',
        content: m.content,
        timestamp: m.timestamp,
      });
    } else {
      // 对于 assistant 消息，创建一个简化版本
      // 注意：这不包含完整的 LLM 响应元数据（api, provider, model, usage 等）
      // 但对于继续对话是足够的
      result.push({
        role: 'assistant',
        content: [{ type: 'text', text: m.content }],
        api: 'anthropic',
        provider: 'anthropic',
        model: config.llm.model,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: m.timestamp,
      });
    }
  }
  return result;
};

/**
 * 创建带日志的stream函数
 */
const createLoggingStreamFn = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (model: any, context: Context, options?: any): AssistantMessageEventStream => {
    logger.info({ model, context, options }, '[llm] >>> request');

    const originalStream = streamSimple(model, context, options);
    const loggedStream = createAssistantMessageEventStream();
    let finalMessage: unknown = null;

    (async () => {
      try {
        for await (const event of originalStream) {
          if (event.type === 'done') {
            finalMessage = event.message;
          }
          loggedStream.push(event);
        }
        loggedStream.end();
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

/**
 * 创建健康顾问Agent
 */
export const createHealthAgent = (options: CreateAgentOptions) => {
  const {
    storage,
    provider = config.llm.provider,
    model = config.llm.model,
    messages = [],
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentModel = getModel(provider as any, model);

  const tools = [
    createRecordTool(storage),
    createQueryTool(storage),
  ];

  logger.info('[agent] created provider=%s model=%s tools=%d', provider, model, tools.length);

  const agent = new Agent({
    initialState: {
      systemPrompt: HEALTH_ADVISOR_PROMPT,
      model: agentModel,
      tools,
      messages: convertMessages(messages),
      thinkingLevel: 'off',
    },
    streamFn: createLoggingStreamFn(),
  });

  return agent;
};
