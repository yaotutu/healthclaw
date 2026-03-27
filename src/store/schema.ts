import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const healthRecords = sqliteTable('health_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['weight', 'sleep', 'diet', 'exercise', 'water'] }).notNull(),
  value: real('value').notNull(),
  unit: text('unit'),
  note: text('note'),
  timestamp: integer('timestamp').notNull(),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp').notNull(),
});

export type HealthRecord = typeof healthRecords.$inferSelect;
export type NewHealthRecord = typeof healthRecords.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
