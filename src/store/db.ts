import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { healthRecords, messages, userProfiles } from './schema';

/**
 * 数据库创建结果
 * 包含 Drizzle ORM 实例和底层 SQLite 连接
 */
export interface CreateDbResult {
  db: ReturnType<typeof drizzle<{ healthRecords: typeof healthRecords; messages: typeof messages; userProfiles: typeof userProfiles }>>;
  sqlite: Database;
}

/**
 * 创建数据库连接
 * @param dbPath 数据库文件路径
 * @returns 包含 Drizzle ORM 实例和 SQLite 连接的对象
 */
export const createDb = (dbPath: string): CreateDbResult => {
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema: { healthRecords, messages, userProfiles } });
  return { db, sqlite };
};

/** Drizzle ORM 数据库实例类型 */
export type Db = CreateDbResult['db'];
