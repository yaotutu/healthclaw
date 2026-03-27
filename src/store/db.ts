import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import { healthRecords, messages } from './schema';

export const createDb = (dbPath: string) => {
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, { schema: { healthRecords, messages } });
};

export type Db = ReturnType<typeof createDb>;
