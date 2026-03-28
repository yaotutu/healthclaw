import type { Agent } from '@mariozechner/pi-agent-core';
import type { Store, Message } from '../store';
import { logger } from '../infrastructure/logger';

export interface Session {
  userId: string;
  agent: Agent;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface SessionManager {
  getOrCreate(userId: string): Promise<Session>;
  get(userId: string): Session | undefined;
  abort(userId: string): boolean;
  remove(userId: string): boolean;
  list(): string[];
  close(): void;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface CreateSessionManagerOptions {
  createAgent: (userId: string, messages: Message[]) => Promise<Agent>;
  store: Store;
  ttlMs?: number;
  cleanupIntervalMs?: number;
}

export const createSessionManager = (options: CreateSessionManagerOptions): SessionManager => {
  const { createAgent, store, ttlMs = DEFAULT_TTL_MS, cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS } = options;
  const sessions = new Map<string, Session>();

  const cleanup = () => {
    const now = Date.now();
    for (const [userId, session] of sessions) {
      if (now - session.lastActiveAt.getTime() > ttlMs) {
        sessions.delete(userId);
        logger.info('[session] expired userId=%s', userId);
      }
    }
  };

  const cleanupTimer = setInterval(cleanup, cleanupIntervalMs);

  const getOrCreate = async (userId: string): Promise<Session> => {
    let session = sessions.get(userId);
    if (session) {
      session.lastActiveAt = new Date();
      logger.debug('[session] accessed userId=%s', userId);
      return session;
    }

    let messages: Message[] = [];
    try {
      messages = await store.messages.getMessages(userId);
      logger.info('[session] loaded %d messages userId=%s', messages.length, userId);
    } catch (err) {
      logger.error('[session] failed to load messages userId=%s error=%s', userId, (err as Error).message);
    }

    session = {
      userId,
      // await 等待异步 Agent 创建完成（需要查询用户档案）
      agent: await createAgent(userId, messages),
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };
    sessions.set(userId, session);
    logger.info('[session] created userId=%s total=%d', userId, sessions.size);

    return session;
  };

  const get = (userId: string): Session | undefined => {
    return sessions.get(userId);
  };

  const abort = (userId: string): boolean => {
    const session = sessions.get(userId);
    if (!session) return false;
    session.agent.abort();
    logger.info('[session] aborted userId=%s', userId);
    return true;
  };

  const remove = (userId: string): boolean => {
    const result = sessions.delete(userId);
    if (result) {
      logger.info('[session] removed userId=%s total=%d', userId, sessions.size);
    }
    return result;
  };

  const list = (): string[] => {
    return Array.from(sessions.keys());
  };

  const close = (): void => {
    clearInterval(cleanupTimer);
    const count = sessions.size;
    sessions.clear();
    if (count > 0) {
      logger.info('[session] closed cleared=%d sessions', count);
    }
  };

  return { getOrCreate, get, abort, remove, list, close };
};
