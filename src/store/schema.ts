import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

/**
 * 用户档案表
 * 存储用户的个人健康档案信息，包括基本身体数据、疾病史、过敏史等
 * 注意：体重字段已从旧版移除，改为从 body_records 动态获取最新体重
 */
export const userProfiles = sqliteTable('user_profiles', {
  /** 用户ID，主键 */
  userId: text('user_id').primaryKey(),
  /** 身高 cm */
  height: real('height'),
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

/**
 * 身体数据记录表
 * 存储用户的体重、体脂率、BMI 等身体指标
 * 支持历史追踪，每次记录生成一条新记录
 */
export const bodyRecords = sqliteTable('body_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 体重 kg */
  weight: real('weight'),
  /** 体脂率 % */
  bodyFat: real('body_fat'),
  /** BMI 指数 */
  bmi: real('bmi'),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
});

/**
 * 饮食记录表
 * 存储用户的饮食摄入信息，包括食物描述、热量和营养成分
 * 支持按餐次分类（早餐、午餐、晚餐、加餐）
 */
export const dietRecords = sqliteTable('diet_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 食物描述 */
  food: text('food'),
  /** 热量 kcal */
  calories: real('calories'),
  /** 蛋白质 g */
  protein: real('protein'),
  /** 碳水化合物 g */
  carbs: real('carbs'),
  /** 脂肪 g */
  fat: real('fat'),
  /** 餐次：breakfast(早餐)/lunch(午餐)/dinner(晚餐)/snack(加餐) */
  mealType: text('meal_type', { enum: ['breakfast', 'lunch', 'dinner', 'snack'] }),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
});

/**
 * 症状记录表
 * 存储用户的症状和不适记录，用于健康追踪
 * 支持关联到饮食或运动记录，帮助分析症状诱因
 */
export const symptomRecords = sqliteTable('symptom_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 症状描述 */
  symptom: text('symptom').notNull(),
  /** 严重程度 1-5 */
  severity: integer('severity'),
  /** 可能诱因 */
  trigger: text('trigger'),
  /** 关联类型：diet(饮食)/exercise(运动)/null(无关联) */
  relatedType: text('related_type', { enum: ['diet', 'exercise'] }),
  /** 关联记录ID */
  relatedId: integer('related_id'),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
});

/**
 * 运动记录表
 * 存储用户的运动活动信息
 * 支持记录运动类型、时长、消耗热量和强度等级
 */
export const exerciseRecords = sqliteTable('exercise_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 运动类型 */
  exerciseType: text('exercise_type').notNull(),
  /** 时长 分钟 */
  duration: real('duration'),
  /** 消耗热量 kcal */
  caloriesBurned: real('calories_burned'),
  /** 强度：low(低)/medium(中)/high(高) */
  intensity: text('intensity', { enum: ['low', 'medium', 'high'] }),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
});

/**
 * 睡眠记录表
 * 存储用户的睡眠信息
 * 支持记录睡眠时长、质量评分和入睡/起床时间
 */
export const sleepRecords = sqliteTable('sleep_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 睡眠时长 小时 */
  duration: real('duration'),
  /** 睡眠质量 1-5 */
  quality: integer('quality'),
  /** 入睡时间戳 */
  bedTime: integer('bed_time'),
  /** 起床时间戳 */
  wakeTime: integer('wake_time'),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
});

/**
 * 饮水记录表
 * 存储用户的饮水摄入信息
 * 支持自定义单位（毫升、杯等）
 */
export const waterRecords = sqliteTable('water_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 饮水量 */
  amount: real('amount').notNull(),
  /** 单位 */
  unit: text('unit'),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
});

/**
 * 消息历史表
 * 存储用户与助手的对话记录
 * metadata 字段用于存储图片 URL/格式元信息，不存储 base64 数据
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

/** 用户档案查询结果类型 */
export type UserProfile = typeof userProfiles.$inferSelect;
/** 用户档案插入类型 */
export type NewUserProfile = typeof userProfiles.$inferInsert;

/** 身体记录查询结果类型 */
export type BodyRecord = typeof bodyRecords.$inferSelect;
/** 身体记录插入类型 */
export type NewBodyRecord = typeof bodyRecords.$inferInsert;

/** 饮食记录查询结果类型 */
export type DietRecord = typeof dietRecords.$inferSelect;
/** 饮食记录插入类型 */
export type NewDietRecord = typeof dietRecords.$inferInsert;

/** 症状记录查询结果类型 */
export type SymptomRecord = typeof symptomRecords.$inferSelect;
/** 症状记录插入类型 */
export type NewSymptomRecord = typeof symptomRecords.$inferInsert;

/** 运动记录查询结果类型 */
export type ExerciseRecord = typeof exerciseRecords.$inferSelect;
/** 运动记录插入类型 */
export type NewExerciseRecord = typeof exerciseRecords.$inferInsert;

/** 睡眠记录查询结果类型 */
export type SleepRecord = typeof sleepRecords.$inferSelect;
/** 睡眠记录插入类型 */
export type NewSleepRecord = typeof sleepRecords.$inferInsert;

/** 饮水记录查询结果类型 */
export type WaterRecord = typeof waterRecords.$inferSelect;
/** 饮水记录插入类型 */
export type NewWaterRecord = typeof waterRecords.$inferInsert;

/** 消息查询结果类型 */
export type Message = typeof messages.$inferSelect;
/** 消息插入类型 */
export type NewMessage = typeof messages.$inferInsert;
