import { getModel, streamSimple } from '@mariozechner/pi-ai';
import type { Context, Tool } from '@mariozechner/pi-ai';
import { Type } from '@sinclair/typebox';
import type { Store } from '../store';
import { config } from '../config';
import { assembleSystemPrompt } from '../prompts/assembler';
import { logger } from '../infrastructure/logger';

/**
 * 心跳检查结果
 * 包含需要推送消息的用户ID和消息内容
 */
export interface HeartbeatResult {
  /** 需要推送消息的用户ID */
  userId: string;
  /** 关怀消息内容 */
  message: string;
}

/**
 * 心跳虚拟工具的参数 Schema
 * LLM 通过此工具返回决策结果
 */
const HeartbeatToolParamsSchema = Type.Object({
  /** 决策：skip=无需打扰用户，run=发送关怀消息 */
  action: Type.Union([Type.Literal('skip'), Type.Literal('run')], { description: '决策结果：skip=无需打扰，run=发送关怀消息' }),
  /** 关怀消息内容（action=run 时必填） */
  message: Type.Optional(Type.String({ description: '关怀消息内容，action=run 时必须提供' })),
});

/**
 * 心跳虚拟工具定义
 * LLM 通过调用此工具来返回结构化的决策结果
 */
const heartbeatTool = {
  name: 'heartbeat',
  description: '根据用户健康数据决定是否需要主动发送关怀消息',
  parameters: HeartbeatToolParamsSchema,
};

/**
 * 心跳系统提示词
 * 指导 LLM 如何分析用户数据并做出决策
 */
const HEARTBEAT_SYSTEM_PROMPT = `你是健康顾问的心跳检查模块。当前是定时检查时间。

你的任务：
1. 仔细分析下方用户的所有健康数据（档案、最近记录、活跃症状、慢性病、记忆等）
2. 根据用户的心跳任务列表，判断是否需要主动发送关怀消息
3. 调用 heartbeat 工具来报告你的决定

决策原则：
- 如果数据一切正常，选择 skip
- 如果发现需要关注的情况，选择 run 并提供温暖的个性化关怀消息
- 消息应该具体、有针对性，引用用户的实际数据，而不是笼统的模板
- 语气温暖亲切，像一个关心你的朋友
- 不要过度提醒，只在确实需要关注时才 run`;

/**
 * 从数据库读取用户的心跳任务
 * @param store Store 实例
 * @param userId 用户ID
 * @returns 心跳任务内容数组
 */
function getUserHeartbeatTasks(store: Store, userId: string): string[] {
  return store.heartbeatTask.getEnabledTasks(userId);
}

/**
 * 对单个用户执行心跳检查
 * 将用户心跳任务 + 用户上下文发给 LLM，由 LLM 决定是否需要发送关怀消息
 * 核心原则：代码只负责搬运数据，分析和决策完全由 LLM 完成
 * @param store Store 实例
 * @param userId 用户ID
 * @param tasks 心跳任务列表
 * @returns LLM 决策结果，null 表示 skip
 */
async function checkUser(
  store: Store,
  userId: string,
  tasks: string[]
): Promise<string | null> {
  // 获取用户完整上下文（档案、最近记录、活跃症状、慢性病、记忆等）
  const userContext = await assembleSystemPrompt(store, userId);

  // 获取 LLM 模型
  const model = getModel(config.llm.provider as any, config.llm.model as any);

  // 构建 LLM 请求上下文
  const context: Context = {
    systemPrompt: `${HEARTBEAT_SYSTEM_PROMPT}\n\n${userContext}`,
    messages: [{
      role: 'user',
      content: `当前时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n## 我的心跳任务\n${tasks.map(t => `- ${t}`).join('\n')}`,
      timestamp: Date.now(),
    }],
    tools: [heartbeatTool],
  };

  // 调用 LLM 并解析结构化的决策结果
  const stream = streamSimple(model, context);
  let action: 'skip' | 'run' | null = null;
  let message = '';

  for await (const event of stream) {
    if (event.type === 'done' && event.message) {
      for (const block of event.message.content) {
        if (block.type === 'toolCall' && block.name === 'heartbeat') {
          const args = block.arguments;
          action = args.action as 'skip' | 'run';
          message = (args.message as string) || '';
        }
      }
    }
  }

  if (action === 'run' && message) {
    return message;
  }
  return null;
}

/**
 * 执行心跳任务
 * 获取所有用户 → 对每个用户从数据库读心跳任务 → 发给 LLM 决策
 * 核心原则：代码只负责搬运数据，分析和决策完全由 LLM 完成
 * @param store Store 实例
 * @returns 需要推送的关怀消息列表
 */
export async function runHeartbeat(store: Store): Promise<HeartbeatResult[]> {
  // 获取所有有消息记录的用户ID
  const userIdRows = store.sqlite.query('SELECT DISTINCT user_id FROM messages').all() as Array<{ user_id: string }>;
  const userIds = userIdRows.map(r => r.user_id);
  if (userIds.length === 0) return [];

  const results: HeartbeatResult[] = [];

  for (const userId of userIds) {
    try {
      // 从数据库读取该用户的心跳任务
      const tasks = getUserHeartbeatTasks(store, userId);
      if (tasks.length === 0) continue; // 没有任务则跳过

      const message = await checkUser(store, userId, tasks);
      if (message) {
        results.push({ userId, message });
        logger.info('[heartbeat] run userId=%s messageLen=%d', userId, message.length);
      } else {
        logger.debug('[heartbeat] skip userId=%s', userId);
      }
    } catch (err) {
      logger.error('[heartbeat] check failed userId=%s error=%s', userId, (err as Error).message);
    }
  }

  logger.info('[heartbeat] checked users=%d alerts=%d', userIds.length, results.length);
  return results;
}
