import { createDb, type Db } from './db';
import { createHealthStore, type HealthStore } from './health';
import { createMessageStore, type MessageStore } from './messages';
import { healthRecords, messages } from './schema';

export { createDb, createHealthStore, createMessageStore };
export { healthRecords, messages };
export type { Db, HealthStore, MessageStore };

export type HealthRecord = typeof healthRecords.$inferSelect;
export type Message = typeof messages.$inferSelect;

// 统一的 Store 类
export class Store {
  readonly db: Db;
  readonly health: HealthStore;
  readonly messages: MessageStore;

  constructor(dbPath: string) {
    this.db = createDb(dbPath);
    this.health = createHealthStore(this.db);
    this.messages = createMessageStore(this.db);
    this.initTables();
  }

  private initTables(): void {
    // 使用 Bun SQLite 原生创建表
    const sqlite = (this.db as any).session;
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS health_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('weight', 'sleep', 'diet', 'exercise', 'water')),
        value REAL NOT NULL,
        unit TEXT,
        note TEXT,
        timestamp INTEGER NOT NULL
      )
    `);
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`);
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_health_timestamp ON health_records(timestamp)`);
  }

  close(): void {
    (this.db as any).session.close();
  }
}
