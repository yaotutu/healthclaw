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
  conversationSummaries
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
      conversationSummaries
    }
  });
  return { db, sqlite };
};

/** Drizzle ORM 数据库实例类型 */
export type Db = CreateDbResult['db'];
