import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

/**
 * 健康记录表
 * 存储用户的各类健康数据，包括体重、睡眠、饮食、运动、饮水等
 */
export const healthRecords = sqliteTable('health_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 记录类型：weight(体重)、sleep(睡眠)、diet(饮食)、exercise(运动)、water(饮水) */
  type: text('type', { enum: ['weight', 'sleep', 'diet', 'exercise', 'water'] }).notNull(),
  /** 数值 */
  value: real('value').notNull(),
  /** 单位 */
  unit: text('unit'),
  /** 备注 */
  note: text('note'),
  /** 饮食详情 JSON，diet 类型存储营养明细 */
  detail: text('detail'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
});

/**
 * 消息历史表
 * 存储用户与助手的对话记录
 */
export const messages = sqliteTable('messages', {
  /** 消息ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 角色：user(用户) 或 assistant(助手) */
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  /** 消息内容 */
  content: text('content').notNull(),
  /** 额外元数据 JSON，如图片信息 */
  metadata: text('metadata'),
  /** 消息时间戳 */
  timestamp: integer('timestamp').notNull(),
});

/**
 * 用户档案表
 * 存储用户的个人健康档案信息，包括基本身体数据、疾病史、过敏史等
 */
export const userProfiles = sqliteTable('user_profiles', {
  /** 用户ID，主键 */
  userId: text('user_id').primaryKey(),
  /** 身高 cm */
  height: real('height'),
  /** 体重 kg */
  weight: real('weight'),
  /** 年龄 */
  age: integer('age'),
  /** 性别 */
  gender: text('gender'),
  /** 疾病史，JSON 数组字符串 */
  diseases: text('diseases'),
  /** 过敏史，JSON 数组字符串 */
  allergies: text('allergies'),
  /** 饮食偏好 */
  dietPreferences: text('diet_preferences'),
  /** 健康目标 */
  healthGoal: text('health_goal'),
  /** 创建时间 */
  createdAt: integer('created_at').notNull(),
  /** 更新时间 */
  updatedAt: integer('updated_at').notNull(),
});

/** 健康记录查询结果类型 */
export type HealthRecord = typeof healthRecords.$inferSelect;
/** 健康记录插入类型 */
export type NewHealthRecord = typeof healthRecords.$inferInsert;
/** 消息查询结果类型 */
export type Message = typeof messages.$inferSelect;
/** 消息插入类型 */
export type NewMessage = typeof messages.$inferInsert;
/** 用户档案查询结果类型 */
export type UserProfile = typeof userProfiles.$inferSelect;
/** 用户档案插入类型 */
export type NewUserProfile = typeof userProfiles.$inferInsert;
