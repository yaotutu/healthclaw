import { eq, desc, gte, and } from 'drizzle-orm';
import type { Db } from './db';
import { healthRecords, type HealthRecord, type NewHealthRecord } from './schema';

export interface QueryOptions {
  userId: string;
  type?: 'weight' | 'sleep' | 'diet' | 'exercise' | 'water';
  days?: number;
  limit?: number;
}

export const createHealthStore = (db: Db) => {
  const record = async (data: Omit<NewHealthRecord, 'id' | 'timestamp'>): Promise<HealthRecord> => {
    const result = await db.insert(healthRecords)
      .values({ ...data, timestamp: Date.now() })
      .returning();
    return result[0];
  };

  const query = async (options: QueryOptions): Promise<HealthRecord[]> => {
    const conditions = [eq(healthRecords.userId, options.userId)];

    if (options.type) {
      conditions.push(eq(healthRecords.type, options.type));
    }

    if (options.days) {
      const cutoff = Date.now() - options.days * 24 * 60 * 60 * 1000;
      conditions.push(gte(healthRecords.timestamp, cutoff));
    }

    const limit = options.limit ?? 10;

    return db.select()
      .from(healthRecords)
      .where(and(...conditions))
      .orderBy(desc(healthRecords.timestamp))
      .limit(limit);
  };

  return { record, query };
};

export type HealthStore = ReturnType<typeof createHealthStore>;
