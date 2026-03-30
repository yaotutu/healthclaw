import { createDb, type Db } from './db';
import { createBodyStore, type BodyStore } from '../features/body/store';
import { createDietStore, type DietStore } from '../features/diet/store';
import { createExerciseStore, type ExerciseStore } from '../features/exercise/store';
import { createMessageStore, type MessageStore } from './messages';
import { createProfileStore, type ProfileStore } from '../features/profile/store';
import { createSleepStore, type SleepStore } from '../features/sleep/store';
import { createSymptomStore, type SymptomStore } from '../features/symptom/store';
import { createWaterStore, type WaterStore } from '../features/water/store';
import { createMemoryStore, type MemoryStore } from '../features/memory/store';
import { createSummaryStore, type SummaryStore } from './summary';
import { createLogStore, type LogStore } from './logs';
import { createMedicationStore, type MedicationStore } from '../features/medication/store';
import { createChronicStore, type ChronicStore } from '../features/chronic/store';
import { createObservationStore, type ObservationStore } from '../features/observation/store';
import { createHeartbeatTaskStore, type HeartbeatTaskStore } from '../features/heartbeat/store';
import {
  userProfiles,
  bodyRecords,
  dietRecords,
  symptomRecords,
  exerciseRecords,
  sleepRecords,
  waterRecords,
  messages,
  memories,
  conversationSummaries,
  medicationRecords,
  chronicConditions,
  healthObservations,
  heartbeatTasks,
  type Message,
  type UserProfile,
  type MemoryRecord,
  type ConversationSummary,
  type MedicationRecord,
  type ChronicCondition,
  type HealthObservation,
  type HeartbeatTask,
  type NewHeartbeatTask,
} from './schema';
import type { Database } from 'bun:sqlite';

// 导出所有存储创建函数
export {
  createDb,
  createBodyStore,
  createDietStore,
  createExerciseStore,
  createMessageStore,
  createProfileStore,
  createSleepStore,
  createSymptomStore,
  createWaterStore,
  createMemoryStore,
  createSummaryStore,
  createLogStore,
  createMedicationStore,
  createChronicStore,
  createObservationStore,
  createHeartbeatTaskStore,
};

// 导出所有 schema 表
export {
  userProfiles,
  bodyRecords,
  dietRecords,
  symptomRecords,
  exerciseRecords,
  sleepRecords,
  waterRecords,
  messages,
  memories,
  conversationSummaries,
  medicationRecords,
  chronicConditions,
  healthObservations,
};

// 导出所有类型
export type {
  Db,
  BodyStore,
  DietStore,
  ExerciseStore,
  MessageStore,
  ProfileStore,
  SleepStore,
  SymptomStore,
  WaterStore,
  MemoryStore,
  SummaryStore,
  LogStore,
  MedicationStore,
  ChronicStore,
  ObservationStore,
  HeartbeatTaskStore,
  Message,
  UserProfile,
  MemoryRecord,
  ConversationSummary,
  MedicationRecord,
  ChronicCondition,
  HealthObservation,
};

// 统一的 Store 类，管理所有存储模块和数据库初始化
export class Store {
  readonly db: Db;
  readonly sqlite: Database;

  // 各类型健康数据存储
  readonly body: BodyStore;
  readonly diet: DietStore;
  readonly exercise: ExerciseStore;
  readonly sleep: SleepStore;
  readonly symptom: SymptomStore;
  readonly water: WaterStore;

  readonly messages: MessageStore;
  readonly profile: ProfileStore;

  // 记忆和对话摘要存储
  readonly memory: MemoryStore;
  readonly summary: SummaryStore;

  // 日志存储（写入数据库，不输出到控制台）
  readonly logs: LogStore;

  // 用药记录存储
  readonly medication: MedicationStore;

  // 慢性病记录存储
  readonly chronic: ChronicStore;

  // 健康观察记录存储
  readonly observation: ObservationStore;

  // 心跳任务存储
  readonly heartbeatTask: HeartbeatTaskStore;

  constructor(dbPath: string) {
    const { db, sqlite } = createDb(dbPath);
    this.db = db;
    this.sqlite = sqlite;

    // 初始化各存储模块
    this.body = createBodyStore(this.db);
    this.diet = createDietStore(this.db);
    this.exercise = createExerciseStore(this.db);
    this.sleep = createSleepStore(this.db);
    this.symptom = createSymptomStore(this.db);
    this.water = createWaterStore(this.db);
    this.messages = createMessageStore(this.db);
    this.profile = createProfileStore(this.db);
    this.memory = createMemoryStore(this.db);
    this.summary = createSummaryStore(this.db);

    this.initTables();

    // 日志存储必须在 initTables() 之后创建，因为 prepare 需要 logs 表已存在
    this.logs = createLogStore(this.sqlite);

    // 用药记录存储
    this.medication = createMedicationStore(this.db);

    // 慢性病记录存储
    this.chronic = createChronicStore(this.db);

    // 健康观察记录存储
    this.observation = createObservationStore(this.db);

    // 心跳任务存储
    this.heartbeatTask = createHeartbeatTaskStore(this.sqlite);
  }

  /**
   * 初始化数据库表结构
   * 创建所有数据表和索引
   */
  private initTables(): void {
    // 创建身体数据记录表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS body_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        weight REAL,
        body_fat REAL,
        bmi REAL,
        note TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // 创建饮食记录表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS diet_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        food TEXT NOT NULL,
        calories INTEGER NOT NULL,
        protein REAL,
        carbs REAL,
        fat REAL,
        sodium REAL,
        meal_type TEXT,
        note TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // 创建症状记录表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS symptom_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        description TEXT NOT NULL,
        severity INTEGER,
        body_part TEXT,
        related_type TEXT,
        related_id INTEGER,
        resolved_at INTEGER,
        note TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // 创建运动记录表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS exercise_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        duration INTEGER NOT NULL,
        calories INTEGER,
        heart_rate_avg INTEGER,
        heart_rate_max INTEGER,
        distance REAL,
        note TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // 创建睡眠记录表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS sleep_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        duration INTEGER NOT NULL,
        quality INTEGER,
        bed_time INTEGER,
        wake_time INTEGER,
        deep_sleep INTEGER,
        note TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // 创建饮水记录表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS water_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        note TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // 创建消息历史表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // 创建用户档案表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY,
        height REAL,
        weight REAL,
        age INTEGER,
        gender TEXT,
        diseases TEXT,
        allergies TEXT,
        diet_preferences TEXT,
        health_goal TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 创建记忆表
    // 存储 Agent 从对话中提取的长期记忆，用于跨会话个性化
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    // 创建对话摘要表
    // 存储会话的压缩摘要，用于上下文压缩和长期记忆
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        message_count INTEGER,
        start_timestamp INTEGER NOT NULL,
        end_timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // 创建用药记录表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS medication_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        medication TEXT NOT NULL,
        dosage TEXT,
        frequency TEXT,
        start_date INTEGER,
        end_date INTEGER,
        note TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // 创建慢性病记录表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS chronic_conditions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        condition TEXT NOT NULL,
        severity TEXT,
        seasonal_pattern TEXT,
        triggers TEXT,
        notes TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // 创建索引以提高查询性能
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_body_user_id ON body_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_diet_user_id ON diet_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_symptom_user_id ON symptom_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_exercise_user_id ON exercise_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_sleep_user_id ON sleep_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_water_user_id ON water_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS summaries_user_id_idx ON conversation_summaries(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_medication_user_id ON medication_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_chronic_user_id ON chronic_conditions(user_id)`);

    // 创建健康观察记录表
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS health_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT,
        timestamp INTEGER NOT NULL
      )
    `);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_observation_user_id ON health_observations(user_id)`);

    // 创建应用日志表
    // 所有日志写入此表（info 及以上级别），控制台不输出，需要时查询数据库
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level INTEGER NOT NULL,
        level_name TEXT NOT NULL,
        msg TEXT NOT NULL,
        time TEXT NOT NULL,
        data TEXT,
        module TEXT
      )
    `);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_logs_time ON logs(time)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_logs_module ON logs(module)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)`);

    // 创建心跳任务表
    // 每个用户可以有多条心跳提示词，定时将这些提示词 + 用户上下文发给 LLM
    this.sqlite.run(`
      CREATE TABLE IF NOT EXISTS heartbeat_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      )
    `);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_heartbeat_tasks_user_id ON heartbeat_tasks(user_id)`);
  }

  /** 关闭数据库连接 */
  close(): void {
    this.sqlite.close();
  }
}
