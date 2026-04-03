import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, streamSimple, createAssistantMessageEventStream } from '@mariozechner/pi-ai';
import type { Context, AssistantMessageEventStream, UserMessage, AssistantMessage } from '@mariozechner/pi-ai';
import { config } from '../config';
import type { Store, Message } from '../store';
import { logger } from '../infrastructure/logger';
import { assembleSystemPrompt } from '../prompts/assembler';
import { createCommonTools } from './tools';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { CronService } from '../cron/service';

/**
 * 将存储层消息转换为 Agent 框架所需的消息格式
 * 支持多模态内容：当用户消息包含 metadata 中的图片信息时，
 * 将图片以占位符形式展示（因为只存储了元信息，不含 base64 数据）
 * @param messages 存储层消息列表
 * @returns 转换后的消息列表，供 Agent 框架使用
 */
const convertMessages = (messages: Message[]): Array<UserMessage | AssistantMessage> => {
  const result: Array<UserMessage | AssistantMessage> = [];
  for (const m of messages) {
    if (m.role === 'user') {
      // 默认使用纯文本内容
      let content: string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = m.content;
      // 尝试解析 metadata 中的图片信息
      if (m.metadata) {
        try {
          const meta = JSON.parse(m.metadata);
          // 如果 metadata 中包含图片数组，添加图片占位符
          if (meta.images && Array.isArray(meta.images) && meta.images.length > 0) {
            // 只存储了元信息（format, size等），不再包含 base64 data
            // 在 LLM 上下文中以占位符表示
            const imagePlaceholders = meta.images.map((img: { format?: string; mimeType?: string }) =>
              `[图片: ${img.format || img.mimeType || '未知格式'}]`
            ).join(' ');
            content = `${m.content} ${imagePlaceholders}`;
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
 * 创建带日志记录的流式函数
 * 完整记录发送给 LLM 的请求报文和 LLM 返回的响应报文
 * 以原始 JSON 格式存储到数据库，方便排查编码、内容等问题
 */
const createLoggingStreamFn = () => {
  return (model: unknown, context: Context, options?: unknown): AssistantMessageEventStream => {
    // 构建完整的请求报文（即发送给 LLM 的原始数据）
    const requestPayload = {
      model: model,
      systemPrompt: context.systemPrompt,
      messages: context.messages,
      tools: context.tools?.map((t: any) => t.name ?? t),
    };

    // 完整记录请求报文
    logger.info(
      { module: 'llm', payload: requestPayload },
      '[llm] request'
    );

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
          // 完整记录响应报文（包含所有 content blocks：text、thinking、toolCall 等）
          logger.info(
            { module: 'llm', payload: finalMessage },
            '[llm] response'
          );
        }
      } catch (err) {
        loggedStream.end();
        logger.error({ module: 'llm', error: (err as Error).message }, '[llm] error=%s', (err as Error).message);
      }
    })();

    return loggedStream;
  };
};

export interface CreateAgentOptions {
  store: Store;
  userId: string;
  messages?: Message[];
  /** 通道名称，用于定时任务推送 */
  channel?: string;
  /** 定时任务服务实例，传入后 Agent 将拥有定时任务工具 */
  cronService?: CronService;
}

/**
 * 创建健康顾问 Agent 实例
 * 异步函数：需要查询用户档案并注入到系统提示词中
 * 根据用户档案的存在与否，动态生成个性化的系统提示词
 * @param options 创建 Agent 的选项，包含 store、userId 和历史消息
 * @returns 初始化完成的 Agent 实例
 */
export const createHealthAgent = async (options: CreateAgentOptions) => {
  const { store, userId, messages = [], channel = 'websocket', cronService } = options;

  const agentModel = getModel(config.llm.provider as any, config.llm.model);

  // 创建可变的工具数组，传入引用供 load_skill 动态注入
  const tools: AgentTool[] = [];
  const commonTools = createCommonTools(store, userId, channel, cronService, tools);
  tools.push(...commonTools);

  // 使用 assembler 动态组装系统提示词
  // 包含静态模板（角色、能力、规则）和动态上下文（档案、最近记录、活跃症状、记忆等）
  const systemPrompt = await assembleSystemPrompt(store, userId);

  logger.info('[agent] created provider=%s model=%s tools=%d', config.llm.provider, config.llm.model, tools.length);

  const agent = new Agent({
    initialState: {
      // 使用动态组装的系统提示词（包含用户档案、最近记录、活跃症状等上下文）
      systemPrompt,
      model: agentModel,
      tools: tools,
      messages: convertMessages(messages),
      thinkingLevel: 'off',
    },
    streamFn: createLoggingStreamFn(),
  });

  return agent;
};
