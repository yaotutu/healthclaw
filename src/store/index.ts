import { createDb, type Db } from './db';
import { createHealthStore, type HealthStore } from './health';
import { createMessageStore, type MessageStore } from './messages';
import { healthRecords, messages, userProfiles } from './schema';
import type { Database } from 'bun:sqlite';

export { createDb, createHealthStore, createMessageStore };
export { healthRecords, messages, userProfiles };
export type { Db, HealthStore, MessageStore };

export type HealthRecord = typeof healthRecords.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;

// 统一的 Store 类，管理所有存储模块和数据库初始化
export class Store {
  readonly db: Db;
  readonly sqlite: Database;
  readonly health: HealthStore;
  readonly messages: MessageStore;

  constructor(dbPath: string) {
    const { db, sqlite } = createDb(dbPath);
    this.db = db;
    this.sqlite = sqlite;
    this.health = createHealthStore(this.db);
    this.messages = createMessageStore(this.db);
    this.initTables();
  }

  /**
   * 安全的列迁移：列已存在时忽略错误
   * 用于 ALTER TABLE ADD COLUMN 操作，避免因列已存在而导致的迁移失败
   * @param sql ALTER TABLE 语句
   */
  private safeAlter(sql: string): void {
    try {
      this.sqlite.run(sql);
    } catch (err) {
      // SQLite 列已存在时报错 "duplicate column name"，此时忽略错误
      if (!(err as Error).message?.includes('duplicate column name')) {
        throw err;
      }
    }
  }

  /**
   * 初始化数据库表结构
   * 创建所有必要的表，并执行安全的列迁移以兼容旧版数据库
   */
  private initTables(): void {
    // 创建健康记录表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS health_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('weight', 'sleep', 'diet', 'exercise', 'water')),
        value REAL NOT NULL,
        unit TEXT,
        note TEXT,
        detail TEXT,
        timestamp INTEGER NOT NULL
      )
    `);
    // 创建消息历史表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      )
    `);
    // 创建用户档案表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY,
        height REAL,
        weight REAL,
        age INTEGER,
        gender TEXT,
        diseases TEXT,
        allergies TEXT,
        diet_preferences TEXT,
        health_goal TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    // 创建索引以提高查询性能
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_health_user_id ON health_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_health_timestamp ON health_records(timestamp)`);

    // 安全迁移：为旧版数据库添加新增列（列已存在时自动跳过）
    this.safeAlter(`ALTER TABLE health_records ADD COLUMN detail TEXT`);
    this.safeAlter(`ALTER TABLE messages ADD COLUMN metadata TEXT`);
  }

  /** 关闭数据库连接 */
  close(): void {
    this.sqlite.close();
  }
}
