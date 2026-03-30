import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import {
  userProfiles,
  bodyRecords,
  dietRecords,
  symptomRecords,
  exerciseRecords,
  sleepRecords,
  waterRecords,
  messages,
  memories,
  conversationSummaries,
  // 以下三个表是新增的健康记录表，需要注册到 Drizzle 以支持 Kit 迁移
  medicationRecords,     // 用药记录表
  chronicConditions,     // 慢性病记录表
  healthObservations,    // 健康观察记录表
  // 心跳任务表和应用日志表，注册到 Drizzle 以支持 Kit 迁移
  heartbeatTasks,        // 心跳任务表（用户主动关怀定时任务）
  logs                   // 应用日志表（结构化日志持久化）
} from './schema';

/**
 * 数据库创建结果接口
 * 包含 Drizzle ORM 实例和底层 SQLite 连接
 * 使用新的表结构：用户档案、各类健康记录表和消息历史
 */
export interface CreateDbResult {
  db: ReturnType<typeof drizzle<{
    userProfiles: typeof userProfiles;
    bodyRecords: typeof bodyRecords;
    dietRecords: typeof dietRecords;
    symptomRecords: typeof symptomRecords;
    exerciseRecords: typeof exerciseRecords;
    sleepRecords: typeof sleepRecords;
    waterRecords: typeof waterRecords;
    messages: typeof messages;
    memories: typeof memories;
    conversationSummaries: typeof conversationSummaries;
    // 新增三个健康记录表的类型定义，用于 TypeScript 类型推断
    medicationRecords: typeof medicationRecords;     // 用药记录
    chronicConditions: typeof chronicConditions;     // 慢性病记录
    healthObservations: typeof healthObservations;   // 健康观察记录
    // 心跳任务表和应用日志表的类型定义，注册后 Drizzle 可正确推断类型
    heartbeatTasks: typeof heartbeatTasks;           // 心跳任务
    logs: typeof logs;                               // 应用日志
  }>>;
  sqlite: Database;
}

/**
 * 创建数据库连接
 * 初始化 SQLite 数据库并注册所有 Drizzle ORM 表结构
 * @param dbPath 数据库文件路径
 * @returns 包含 Drizzle ORM 实例和 SQLite 连接的对象
 */
export const createDb = (dbPath: string): CreateDbResult => {
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, {
    schema: {
      userProfiles,
      bodyRecords,
      dietRecords,
      symptomRecords,
      exerciseRecords,
      sleepRecords,
      waterRecords,
      messages,
      memories,
      conversationSummaries,
      // 注册新增的三个表到 Drizzle schema，使 Drizzle Kit 能够识别并迁移这些表
      medicationRecords,     // 用药记录表
      chronicConditions,     // 慢性病记录表
      healthObservations,    // 健康观察记录表
      // 注册心跳任务表和应用日志表，使 Drizzle Kit 能够管理这些表的迁移
      heartbeatTasks,        // 心跳任务表
      logs                   // 应用日志表
    }
  });
  return { db, sqlite };
};

/** Drizzle ORM 数据库实例类型 */
export type Db = CreateDbResult['db'];
