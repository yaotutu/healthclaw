import { eq, asc } from 'drizzle-orm';
import type { Db } from './db';
import { messages, type Message, type NewMessage } from './schema';

export const createMessageStore = (db: Db) => {
  const getMessages = async (sessionId: string): Promise<Message[]> => {
    return db.select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.timestamp));
  };

  const appendMessage = async (sessionId: string, data: Omit<NewMessage, 'id' | 'sessionId'>): Promise<Message> => {
    const result = await db.insert(messages)
      .values({ ...data, sessionId })
      .returning();
    return result[0];
  };

  const clear = async (sessionId: string): Promise<void> => {
    await db.delete(messages).where(eq(messages.sessionId, sessionId));
  };

  return { getMessages, appendMessage, clear };
};

export type MessageStore = ReturnType<typeof createMessageStore>;
