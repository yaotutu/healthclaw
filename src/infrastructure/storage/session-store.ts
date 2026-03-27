// src/infrastructure/storage/session-store.ts

import { Database } from 'bun:sqlite';
import { logger } from '../logger.js';

/**
 * 消息记录
 */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Session 存储接口
 */
export interface SessionStore {
  /** 获取会话的消息历史 */
  getMessages(sessionId: string): Promise<Message[]>;
  /** 追加消息到会话 */
  appendMessage(sessionId: string, message: Message): Promise<void>;
  /** 清空会话历史 */
  clear(sessionId: string): Promise<void>;
  /** 关闭数据库连接 */
  close(): Promise<void>;
}

/**
 * SQLite Session 存储实现
 */
export class SqliteSessionStore implements SessionStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initTables();
    logger.info('[session-store] initialized path=%s', dbPath);
  }

  private initTables(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_session_id ON messages(session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp)`);
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const query = this.db.query<Message, [string]>(`
      SELECT role, content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `);

    return query.all(sessionId);
  }

  async appendMessage(sessionId: string, message: Message): Promise<void> {
    const query = this.db.query(`
      INSERT INTO messages (session_id, role, content, timestamp)
      VALUES (?, ?, ?, ?)
    `);

    query.run(sessionId, message.role, message.content, message.timestamp);
    logger.debug('[session-store] appended message sessionId=%s role=%s', sessionId, message.role);
  }

  async clear(sessionId: string): Promise<void> {
    const query = this.db.query(`DELETE FROM messages WHERE session_id = ?`);
    query.run(sessionId);
    logger.info('[session-store] cleared sessionId=%s', sessionId);
  }

  async close(): Promise<void> {
    this.db.close();
    logger.info('[session-store] closed');
  }
}

/**
 * 创建 Session 存储实例
 */
export const createSessionStore = (workspacePath: string): SessionStore => {
  const dbPath = `${workspacePath}/sessions.db`;
  return new SqliteSessionStore(dbPath);
};
