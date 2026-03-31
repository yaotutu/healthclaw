import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';

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
}, (table) => [
  /** 用户ID索引，加速按用户查询身体数据记录 */
  index('idx_body_user_id').on(table.userId),
]);

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
  /** 钠 mg */
  sodium: real('sodium'),
  /** 餐次：breakfast(早餐)/lunch(午餐)/dinner(晚餐)/snack(加餐) */
  mealType: text('meal_type'),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询饮食记录 */
  index('idx_diet_user_id').on(table.userId),
]);

/**
 * 症状记录表
 * 存储用户的症状和不适记录，用于健康追踪
 * 支持关联到其他类型的记录（饮食、运动等），帮助分析症状诱因
 * 支持记录症状的身体部位和解决时间
 */
export const symptomRecords = sqliteTable('symptom_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 症状描述 */
  description: text('description').notNull(),
  /** 严重程度 1-10 */
  severity: integer('severity'),
  /** 身体部位 */
  bodyPart: text('body_part'),
  /** 关联类型：diet(饮食)/exercise(运动)/null(无关联) */
  relatedType: text('related_type'),
  /** 关联记录ID */
  relatedId: integer('related_id'),
  /** 症状解决时间戳 */
  resolvedAt: integer('resolved_at'),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询症状记录 */
  index('idx_symptom_user_id').on(table.userId),
]);

/**
 * 运动记录表
 * 存储用户的运动活动信息
 * 支持记录运动类型、时长、消耗热量、心率、距离等详细数据
 */
export const exerciseRecords = sqliteTable('exercise_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 运动类型 */
  type: text('type').notNull(),
  /** 时长 分钟 */
  duration: integer('duration'),
  /** 消耗热量 kcal */
  calories: integer('calories'),
  /** 平均心率 bpm */
  heartRateAvg: integer('heart_rate_avg'),
  /** 最大心率 bpm */
  heartRateMax: integer('heart_rate_max'),
  /** 距离 km */
  distance: real('distance'),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询运动记录 */
  index('idx_exercise_user_id').on(table.userId),
]);

/**
 * 睡眠记录表
 * 存储用户的睡眠信息
 * 支持记录睡眠时长、质量评分、入睡/起床时间和深睡时长
 */
export const sleepRecords = sqliteTable('sleep_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 睡眠时长 分钟 */
  duration: integer('duration'),
  /** 睡眠质量 1-5 */
  quality: integer('quality'),
  /** 入睡时间戳 */
  bedTime: integer('bed_time'),
  /** 起床时间戳 */
  wakeTime: integer('wake_time'),
  /** 深睡时长 分钟 */
  deepSleep: integer('deep_sleep'),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询睡眠记录 */
  index('idx_sleep_user_id').on(table.userId),
]);

/**
 * 饮水记录表
 * 存储用户的饮水摄入信息
 * 统一使用毫升(ml)作为单位
 */
export const waterRecords = sqliteTable('water_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 饮水量 ml */
  amount: integer('amount').notNull(),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询饮水记录 */
  index('idx_water_user_id').on(table.userId),
]);

/**
 * 用药记录表
 * 存储用户的用药信息，包括药物名称、剂量、频次等
 * 支持记录用药的开始和结束时间，用于追踪用药历史
 */
export const medicationRecords = sqliteTable('medication_records', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 药物名称 */
  medication: text('medication').notNull(),
  /** 剂量，如 "1片"、"10mg" */
  dosage: text('dosage'),
  /** 用药频次，如 "每日一次"、"每日两次" */
  frequency: text('frequency'),
  /** 用药开始时间戳 */
  startDate: integer('start_date'),
  /** 用药结束时间戳（null 表示仍在服用） */
  endDate: integer('end_date'),
  /** 备注 */
  note: text('note'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询用药记录 */
  index('idx_medication_user_id').on(table.userId),
]);

/**
 * 慢性病记录表
 * 存储用户的慢性病信息，包括严重程度、季节模式、触发因素等
 * 用于长期追踪慢性病状态，支持症状关联和季节性提醒
 */
export const chronicConditions = sqliteTable('chronic_conditions', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 病名，如"鼻炎"、"偏头痛" */
  condition: text('condition').notNull(),
  /** 严重程度：轻度/中度/重度 */
  severity: text('severity'),
  /** 季节模式，如"9月份严重（秋季过敏）" */
  seasonalPattern: text('seasonal_pattern'),
  /** 触发因素，JSON 数组字符串 */
  triggers: text('triggers'),
  /** 备注 */
  notes: text('notes'),
  /** 是否活跃（false 表示已治愈或不再追踪） */
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  /** 创建时间戳 */
  createdAt: integer('created_at').notNull(),
  /** 更新时间戳 */
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询慢性病记录 */
  index('idx_chronic_user_id').on(table.userId),
]);

/**
 * 健康观察记录表
 * 存储用户的非结构化健康观察，如"最近睡眠不好"、"感觉压力大"等
 * 用于记录不适合用具体指标衡量的健康相关感受
 */
export const healthObservations = sqliteTable('health_observations', {
  /** 记录ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 观察内容 */
  content: text('content').notNull(),
  /** 标签，JSON 数组字符串，如 ["睡眠","疲劳"] */
  tags: text('tags'),
  /** 记录时间戳 */
  timestamp: integer('timestamp').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询健康观察记录 */
  index('idx_observation_user_id').on(table.userId),
]);

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
}, (table) => [
  /** 用户ID索引，加速按用户查询消息历史 */
  index('idx_messages_user_id').on(table.userId),
]);

/**
 * 记忆表
 * 存储 Agent 从对话中提取的关于用户的长期记忆
 * 用于跨会话的个性化健康建议
 */
export const memories = sqliteTable('memories', {
  /** 记忆ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 记忆内容 */
  content: text('content').notNull(),
  /** 记忆分类 */
  category: text('category'),
  /** 创建时间戳 */
  createdAt: integer('created_at').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询记忆 */
  index('memories_user_id_idx').on(table.userId),
]);

/**
 * 对话摘要表
 * 存储用户会话的对话摘要，用于上下文压缩和长期记忆
 * 当会话消息过多时，将旧消息压缩为摘要以节省 token
 */
export const conversationSummaries = sqliteTable('conversation_summaries', {
  /** 摘要ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID */
  userId: text('user_id').notNull(),
  /** 对话摘要内容 */
  summary: text('summary').notNull(),
  /** 摘要涵盖的消息数量 */
  messageCount: integer('message_count'),
  /** 摘要涵盖的起始时间戳 */
  startTimestamp: integer('start_timestamp').notNull(),
  /** 摘要涵盖的结束时间戳 */
  endTimestamp: integer('end_timestamp').notNull(),
  /** 创建时间戳 */
  createdAt: integer('created_at').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询对话摘要 */
  index('summaries_user_id_idx').on(table.userId),
]);

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

/** 记忆查询结果类型 */
export type MemoryRecord = typeof memories.$inferSelect;
/** 记忆插入类型 */
export type NewMemoryRecord = typeof memories.$inferInsert;

/** 对话摘要查询结果类型 */
export type ConversationSummary = typeof conversationSummaries.$inferSelect;
/** 对话摘要插入类型 */
export type NewConversationSummary = typeof conversationSummaries.$inferInsert;

/** 用药记录查询结果类型 */
export type MedicationRecord = typeof medicationRecords.$inferSelect;
/** 用药记录插入类型 */
export type NewMedicationRecord = typeof medicationRecords.$inferInsert;

/** 慢性病记录查询结果类型 */
export type ChronicCondition = typeof chronicConditions.$inferSelect;
/** 慢性病记录插入类型 */
export type NewChronicCondition = typeof chronicConditions.$inferInsert;

/** 健康观察记录查询结果类型 */
export type HealthObservation = typeof healthObservations.$inferSelect;
/** 健康观察记录插入类型 */
export type NewHealthObservation = typeof healthObservations.$inferInsert;

/**
 * 心跳任务表
 * 每个用户唯一一条记录，content 存储所有任务（换行分隔）
 * 心跳 tick 时，将任务 + 用户健康上下文一起发给 LLM，由 LLM 决定是否主动关怀
 */
export const heartbeatTasks = sqliteTable('heartbeat_tasks', {
  /** 用户ID，主键 */
  userId: text('user_id').primaryKey(),
  /** 所有任务内容，换行分隔 */
  content: text('content').notNull().default(''),
  /** 是否启用 */
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  /** 创建时间戳 */
  createdAt: integer('created_at').notNull(),
  /** 更新时间戳 */
  updatedAt: integer('updated_at').notNull(),
});

/** 心跳任务查询结果类型 */
export type HeartbeatTask = typeof heartbeatTasks.$inferSelect;
/** 心跳任务插入类型 */
export type NewHeartbeatTask = typeof heartbeatTasks.$inferInsert;

/**
 * 渠道绑定表
 * 存储用户与消息渠道（QQ Bot、微信等）的绑定关系和凭据
 * 每个用户可以绑定一个渠道，凭据以 JSON 格式存储（不同渠道字段不同）
 */
export const channelBindings = sqliteTable('channel_bindings', {
  /** 绑定ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 用户ID，格式: "渠道:标识"，如 "qq:1024xxxxx" */
  userId: text('user_id').notNull(),
  /** 渠道类型标识，如 "qq"、"wechat"、"telegram" */
  channelType: text('channel_type').notNull(),
  /** 渠道凭据，JSON 格式字符串，不同渠道字段不同 */
  credentials: text('credentials').notNull(),
  /** 绑定状态："active"(活跃) | "inactive"(停用) */
  status: text('status').notNull().default('active'),
  /** 创建时间戳 */
  createdAt: integer('created_at').notNull(),
  /** 更新时间戳 */
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询绑定信息 */
  index('idx_channel_binding_user_id').on(table.userId),
]);

/** 渠道绑定查询结果类型 */
export type ChannelBinding = typeof channelBindings.$inferSelect;
/** 渠道绑定插入类型 */
export type NewChannelBinding = typeof channelBindings.$inferInsert;

/**
 * 定时任务表
 * 存储用户通过对话创建的定时任务，由 node-cron 调度执行
 * 支持三种调度模式：at（一次性）、every（间隔循环）、cron（cron 表达式）
 */
export const cronJobs = sqliteTable('cron_jobs', {
  /** 任务ID（8位随机字符串） */
  id: text('id').primaryKey(),
  /** 用户ID，任务所属用户 */
  userId: text('user_id').notNull(),
  /** 任务名称（自动生成的可读描述） */
  name: text('name').notNull(),
  /** 是否启用 */
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  /** 调度类型：at=一次性, every=间隔循环, cron=cron表达式 */
  scheduleKind: text('schedule_kind', { enum: ['at', 'every', 'cron'] }).notNull(),
  /** 一次性执行时间戳（毫秒），kind=at 时使用 */
  scheduleAt: integer('schedule_at'),
  /** 间隔时间（毫秒），kind=every 时使用 */
  scheduleEvery: integer('schedule_every'),
  /** cron 表达式（如 "0 9 * * *"），kind=cron 时使用 */
  scheduleExpr: text('schedule_expr'),
  /** 时区（如 "Asia/Shanghai"），仅 cron 类型使用 */
  scheduleTz: text('schedule_tz'),
  /** 发送给 Agent 的指令内容 */
  message: text('message').notNull(),
  /** 是否将 Agent 的回复推送给用户 */
  deliver: integer('deliver', { mode: 'boolean' }).notNull().default(true),
  /** 指定推送的通道 */
  channel: text('channel'),
  /** 一次性任务执行后是否自动删除 */
  deleteAfterRun: integer('delete_after_run', { mode: 'boolean' }).notNull().default(false),
  /** 上次执行时间戳 */
  lastRunAt: integer('last_run_at'),
  /** 上次执行状态 */
  lastStatus: text('last_status'),
  /** 上次执行错误信息 */
  lastError: text('last_error'),
  /** 创建时间戳 */
  createdAt: integer('created_at').notNull(),
  /** 更新时间戳 */
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  /** 用户ID索引，加速按用户查询定时任务 */
  index('idx_cron_jobs_user_id').on(table.userId),
]);

/** 定时任务查询结果类型 */
export type CronJobRecord = typeof cronJobs.$inferSelect;
/** 定时任务插入类型 */
export type NewCronJob = typeof cronJobs.$inferInsert;

/**
 * 应用日志表
 * 存储应用运行日志（info 及以上级别），写入数据库而非控制台输出
 */
export const logs = sqliteTable('logs', {
  /** 日志ID，自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 日志级别数值 */
  level: integer('level').notNull(),
  /** 日志级别名称（info/warn/error） */
  levelName: text('level_name').notNull(),
  /** 日志消息 */
  msg: text('msg').notNull(),
  /** 日志时间（ISO 格式字符串） */
  time: text('time').notNull(),
  /** 附加数据 JSON */
  data: text('data'),
  /** 模块名 */
  module: text('module'),
}, (table) => [
  /** 日志时间索引，加速按时间范围查询日志 */
  index('idx_logs_time').on(table.time),
  /** 模块名索引，加速按模块过滤日志 */
  index('idx_logs_module').on(table.module),
  /** 日志级别索引，加速按级别过滤日志 */
  index('idx_logs_level').on(table.level),
]);

/** 日志查询结果类型 */
export type LogRecord = typeof logs.$inferSelect;
