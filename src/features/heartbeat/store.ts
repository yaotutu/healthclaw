/**
 * 心跳任务的存储层
 * 提供心跳任务的增删查改操作，按用户隔离
 */
import type { Database } from 'bun:sqlite';

/** 心跳任务记录 */
export interface HeartbeatTaskRecord {
  id: number;
  userId: string;
  content: string;
  enabled: boolean;
  createdAt: number;
}

/** 创建心跳任务的参数 */
export interface NewHeartbeatTask {
  content: string;
}

/**
 * 创建心跳任务存储实例
 * @param sqlite SQLite 数据库实例
 * @returns 心跳任务存储对象
 */
export const createHeartbeatTaskStore = (sqlite: Database) => {
  return {
    /**
     * 获取用户的所有启用心跳任务
     * @param userId 用户ID
     * @returns 启用的任务内容列表
     */
    getEnabledTasks(userId: string): string[] {
      const rows = sqlite.query(
        'SELECT content FROM heartbeat_tasks WHERE user_id = ? AND enabled = 1 ORDER BY id'
      ).all(userId) as Array<{ content: string }>;
      return rows.map(r => r.content);
    },

    /**
     * 获取用户的所有心跳任务（含禁用的）
     * @param userId 用户ID
     * @returns 任务列表
     */
    listAll(userId: string): HeartbeatTaskRecord[] {
      return sqlite.query(
        'SELECT id, user_id as userId, content, enabled, created_at as createdAt FROM heartbeat_tasks WHERE user_id = ? ORDER BY id'
      ).all(userId) as HeartbeatTaskRecord[];
    },

    /**
     * 添加心跳任务
     * @param userId 用户ID
     * @param params 任务参数（content）
     * @returns 新任务的 ID
     */
    add(userId: string, params: NewHeartbeatTask): number {
      const result = sqlite.query(
        'INSERT INTO heartbeat_tasks (user_id, content, enabled, created_at) VALUES (?, ?, 1, ?)'
      ).run(userId, params.content, Date.now());
      return Number(result.lastInsertRowid);
    },

    /**
     * 删除心跳任务
     * @param userId 用户ID（用于权限验证）
     * @param taskId 任务ID
     * @returns 是否删除成功
     */
    remove(userId: string, taskId: number): boolean {
      const result = sqlite.query(
        'DELETE FROM heartbeat_tasks WHERE id = ? AND user_id = ?'
      ).run(taskId, userId);
      return result.changes > 0;
    },

    /**
     * 切换心跳任务的启用状态
     * @param userId 用户ID（用于权限验证）
     * @param taskId 任务ID
     * @param enabled 是否启用
     * @returns 是否操作成功
     */
    toggle(userId: string, taskId: number, enabled: boolean): boolean {
      const result = sqlite.query(
        'UPDATE heartbeat_tasks SET enabled = ? WHERE id = ? AND user_id = ?'
      ).run(enabled ? 1 : 0, taskId, userId);
      return result.changes > 0;
    },
  };
};

/** 心跳任务存储类型 */
export type HeartbeatTaskStore = ReturnType<typeof createHeartbeatTaskStore>;
