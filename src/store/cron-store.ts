import { eq, and } from 'drizzle-orm';
import type { Db } from './db';
import { cronJobs, type CronJobRecord, type NewCronJob } from './schema';

/**
 * 定时任务存储层
 * 使用 Drizzle ORM 操作 cron_jobs 表，管理定时任务的 CRUD
 */
export const createCronJobStore = (db: Db) => {
  /**
   * 插入一条定时任务
   * @param data 任务数据
   * @returns 插入成功的完整记录
   */
  const insert = async (data: NewCronJob): Promise<CronJobRecord> => {
    const result = await db.insert(cronJobs).values(data).returning();
    return result[0];
  };

  /**
   * 根据任务ID获取任务
   * @param id 任务ID
   */
  const getById = async (id: string): Promise<CronJobRecord | undefined> => {
    const result = await db.select().from(cronJobs).where(eq(cronJobs.id, id));
    return result[0];
  };

  /**
   * 获取指定用户的所有启用任务
   * @param userId 用户ID
   */
  const listByUser = async (userId: string): Promise<CronJobRecord[]> => {
    return db.select().from(cronJobs)
      .where(and(eq(cronJobs.userId, userId), eq(cronJobs.enabled, true)));
  };

  /**
   * 获取所有启用的任务（用于启动时恢复调度）
   */
  const listEnabled = async (): Promise<CronJobRecord[]> => {
    return db.select().from(cronJobs).where(eq(cronJobs.enabled, true));
  };

  /**
   * 删除任务
   * @param id 任务ID
   */
  const remove = async (id: string): Promise<boolean> => {
    const result = await db.delete(cronJobs).where(eq(cronJobs.id, id)).returning();
    return result.length > 0;
  };

  /**
   * 更新任务执行状态
   * @param id 任务ID
   * @param status 执行状态
   * @param error 错误信息（可选）
   */
  const updateStatus = async (id: string, status: string, error?: string): Promise<void> => {
    await db.update(cronJobs)
      .set({
        lastRunAt: Date.now(),
        lastStatus: status,
        lastError: error ?? null,
        updatedAt: Date.now(),
      })
      .where(eq(cronJobs.id, id));
  };

  /**
   * 禁用任务（一次性任务执行后）
   * @param id 任务ID
   */
  const disable = async (id: string): Promise<void> => {
    await db.update(cronJobs)
      .set({ enabled: false, updatedAt: Date.now() })
      .where(eq(cronJobs.id, id));
  };

  return { insert, getById, listByUser, listEnabled, remove, updateStatus, disable };
};

export type CronJobStore = ReturnType<typeof createCronJobStore>;
