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
  remove(userId: string): boolean;
  list(): string[];
  close(): void;
}

export interface CreateSessionManagerOptions {
  createAgent: (messages: Message[]) => Agent;
  store: Store;
}

export const createSessionManager = (options: CreateSessionManagerOptions): SessionManager => {
  const { createAgent, store } = options;
  const sessions = new Map<string, Session>();

  const getOrCreate = async (userId: string): Promise<Session> => {
    // Check cache first
    let session = sessions.get(userId);
    if (session) {
      session.lastActiveAt = new Date();
      logger.debug('[session] accessed userId=%s', userId);
      return session;
    }

    // Load messages synchronously before creating session
    let messages: Message[] = [];
    try {
      messages = await store.messages.getMessages(userId);
      logger.info('[session] loaded %d messages userId=%s', messages.length, userId);
    } catch (err) {
      logger.error('[session] failed to load messages userId=%s error=%s', userId, (err as Error).message);
    }

    // Create session with loaded messages
    session = {
      userId,
      agent: createAgent(messages),
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
    const count = sessions.size;
    sessions.clear();
    if (count > 0) {
      logger.info('[session] closed cleared=%d sessions', count);
    }
  };

  return { getOrCreate, get, remove, list, close };
};
