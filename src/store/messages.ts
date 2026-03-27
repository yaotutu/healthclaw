import { eq, asc } from 'drizzle-orm';
import type { Db } from './db';
import { messages, type Message, type NewMessage } from './schema';

export const createMessageStore = (db: Db) => {
  const getMessages = async (userId: string): Promise<Message[]> => {
    return db.select()
      .from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(asc(messages.timestamp));
  };

  const appendMessage = async (userId: string, data: Omit<NewMessage, 'id' | 'userId'>): Promise<Message> => {
    const result = await db.insert(messages)
      .values({ ...data, userId })
      .returning();
    return result[0];
  };

  const clear = async (userId: string): Promise<void> => {
    await db.delete(messages).where(eq(messages.userId, userId));
  };

  return { getMessages, appendMessage, clear };
};

export type MessageStore = ReturnType<typeof createMessageStore>;
