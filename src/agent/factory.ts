import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple, createAssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Context, AssistantMessageEventStream, UserMessage, AssistantMessage } from '@mariozechner/pi-ai';
import type { Store, Message } from '../store';
import { logger } from '../infrastructure/logger';
import { HEALTH_ADVISOR_PROMPT } from './prompt';
import { createTools } from './tools';

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'anthropic';
const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';

/**
 * 将存储层消息转换为 Agent 框架所需的消息格式
 * 支持多模态内容：当用户消息包含 metadata 中的图片信息时，
 * 将纯文本内容转换为包含文本和图片的内容数组
 * @param messages 存储层消息列表
 * @returns 转换后的消息列表，供 Agent 框架使用
 */
const convertMessages = (messages: Message[]): Array<UserMessage | AssistantMessage> => {
  const result: Array<UserMessage | AssistantMessage> = [];
  for (const m of messages) {
    if (m.role === 'user') {
      // 默认使用纯文本内容
      let content: string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = m.content;
      // 尝试解析 metadata 中的图片信息，支持多模态消息
      if (m.metadata) {
        try {
          const meta = JSON.parse(m.metadata);
          // 如果 metadata 中包含图片数组，将文本和图片组合为多模态内容
          if (meta.images && Array.isArray(meta.images) && meta.images.length > 0) {
            content = [
              { type: 'text', text: m.content },
              ...meta.images,
            ];
          }
        } catch {
          // metadata 解析失败，使用纯文本
        }
      }
      result.push({
        role: 'user',
        content,
        timestamp: m.timestamp,
      });
    } else {
      result.push({
        role: 'assistant',
        content: [{ type: 'text', text: m.content }],
        api: 'anthropic',
        provider: 'anthropic',
        model: LLM_MODEL,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: m.timestamp,
      });
    }
  }
  return result;
};

const createLoggingStreamFn = () => {
  return (model: unknown, context: Context, options?: unknown): AssistantMessageEventStream => {
    logger.info('[llm] request');

    const originalStream = streamSimple(model as any, context, options as any);
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
          logger.info('[llm] response');
        }
      } catch (err) {
        loggedStream.end();
        logger.error('[llm] error=%s', (err as Error).message);
      }
    })();

    return loggedStream;
  };
};

export interface CreateAgentOptions {
  store: Store;
  userId: string;
  messages?: Message[];
}

/**
 * 创建健康顾问 Agent 实例
 * 异步函数：需要查询用户档案并注入到系统提示词中
 * 根据用户档案的存在与否，动态生成个性化的系统提示词
 * @param options 创建 Agent 的选项，包含 store、userId 和历史消息
 * @returns 初始化完成的 Agent 实例
 */
export const createHealthAgent = async (options: CreateAgentOptions) => {
  const { store, userId, messages = [] } = options;

  const agentModel = getModel(LLM_PROVIDER as any, LLM_MODEL);
  const tools = createTools(store, userId);
  // 工具列表：包含记录、查询、档案管理和饮食分析工具
  const toolList = [tools.record, tools.query, tools.getProfile, tools.updateProfile, tools.analyzeDiet];

  // 查询用户档案，注入到系统提示词中实现个性化
  let systemPrompt = HEALTH_ADVISOR_PROMPT;
  const profile = await store.profile.get(userId);
  if (profile) {
    // 解析 JSON 数组字段：疾病史和过敏史在数据库中以 JSON 字符串形式存储
    const parsed = {
      ...profile,
      diseases: profile.diseases ? JSON.parse(profile.diseases) : [],
      allergies: profile.allergies ? JSON.parse(profile.allergies) : [],
    };
    systemPrompt += `\n\n## 当前用户档案\n${JSON.stringify(parsed, null, 2)}`;
  } else {
    // 用户尚未建立档案，提示 Agent 引导用户完善信息
    systemPrompt += '\n\n## 当前用户档案\n该用户尚未建立个人档案，请在合适时机引导用户完善基本信息。';
  }

  logger.info('[agent] created provider=%s model=%s tools=%d', LLM_PROVIDER, LLM_MODEL, toolList.length);

  const agent = new Agent({
    initialState: {
      // 使用注入了用户档案的个性化系统提示词
      systemPrompt,
      model: agentModel,
      tools: toolList,
      messages: convertMessages(messages),
      thinkingLevel: 'off',
    },
    streamFn: createLoggingStreamFn(),
  });

  return agent;
};
