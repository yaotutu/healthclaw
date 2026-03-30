/**
 * 心跳任务管理的 Agent 工具集
 * 提供 add_heartbeat_task、list_heartbeat_tasks、remove_heartbeat_task 三个工具
 * 允许用户在对话中管理自己的心跳检查任务
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { HeartbeatTaskStore } from './store';

// ==================== 工具参数 Schema ====================

/** 添加心跳任务的参数 */
const AddHeartbeatTaskParamsSchema = Type.Object({
  content: Type.String({ description: '心跳任务内容（自然语言描述，如"每天检查睡眠是否充足"）' }),
});

/** 查看心跳任务的参数（无参数） */
const ListHeartbeatTasksParamsSchema = Type.Object({});

/** 删除心跳任务的参数 */
const RemoveHeartbeatTaskParamsSchema = Type.Object({
  taskId: Type.Number({ description: '要删除的心跳任务 ID' }),
});

// ==================== 工具类型 ====================

type AddHeartbeatTaskParams = typeof AddHeartbeatTaskParamsSchema;
type ListHeartbeatTasksParams = typeof ListHeartbeatTasksParamsSchema;
type RemoveHeartbeatTaskParams = typeof RemoveHeartbeatTaskParamsSchema;

// ==================== 工具创建函数 ====================

/**
 * 创建心跳任务相关的 Agent 工具
 * @param store HeartbeatTaskStore 实例
 * @param userId 当前用户 ID
 * @returns 包含 addHeartbeatTask、listHeartbeatTasks、removeHeartbeatTask 的对象
 */
export const createHeartbeatTools = (store: HeartbeatTaskStore, userId: string) => {
  /**
   * 添加心跳任务工具
   * 用户可以自定义心跳检查项，这些任务会在每次心跳时由 LLM 分析
   */
  const addHeartbeatTask: AgentTool<AddHeartbeatTaskParams> = {
    name: 'add_heartbeat_task',
    label: '添加心跳任务',
    description: '添加一个心跳检查任务。心跳系统会定期（约15分钟）分析你的健康数据，并根据这些任务描述决定是否需要主动关心你。',
    parameters: AddHeartbeatTaskParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const id = store.add(userId, { content: params.content });
      return {
        content: [{ type: 'text', text: `已添加心跳任务（ID: ${id}）: ${params.content}` }],
        details: { id, content: params.content },
      };
    },
  };

  /**
   * 查看心跳任务工具
   * 列出当前用户的所有心跳任务
   */
  const listHeartbeatTasks: AgentTool<ListHeartbeatTasksParams> = {
    name: 'list_heartbeat_tasks',
    label: '查看心跳任务',
    description: '查看当前用户的所有心跳检查任务',
    parameters: ListHeartbeatTasksParamsSchema,
    execute: async (_toolCallId, _params, _signal) => {
      const tasks = store.listAll(userId);

      if (tasks.length === 0) {
        return {
          content: [{ type: 'text', text: '当前没有心跳任务' }],
          details: { count: 0 },
        };
      }

      const lines = tasks.map(t =>
        `- [${t.id}] ${t.enabled ? '✓' : '✗'} ${t.content}`
      );

      return {
        content: [{ type: 'text', text: `当前有 ${tasks.length} 个心跳任务：\n${lines.join('\n')}` }],
        details: { count: tasks.length, tasks },
      };
    },
  };

  /**
   * 删除心跳任务工具
   * 删除指定 ID 的心跳任务
   */
  const removeHeartbeatTask: AgentTool<RemoveHeartbeatTaskParams> = {
    name: 'remove_heartbeat_task',
    label: '删除心跳任务',
    description: '删除一个指定的心跳检查任务',
    parameters: RemoveHeartbeatTaskParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const removed = store.remove(userId, params.taskId);
      return {
        content: [{ type: 'text', text: removed ? `已删除心跳任务 ID: ${params.taskId}` : `未找到心跳任务 ID: ${params.taskId}` }],
        details: { removed, taskId: params.taskId },
      };
    },
  };

  return { addHeartbeatTask, listHeartbeatTasks, removeHeartbeatTask };
};
