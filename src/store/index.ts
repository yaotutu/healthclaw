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
import { createCronJobStore, type CronJobStore } from './cron-store';
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
  type Message,
  type UserProfile,
  type MemoryRecord,
  type ConversationSummary,
  type MedicationRecord,
  type ChronicCondition,
  type HealthObservation,
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
  createCronJobStore,
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
  CronJobStore,
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

  // 定时任务存储
  readonly cronJobs: CronJobStore;

  constructor(dbPath: string) {
    const { db, sqlite } = createDb(dbPath);
    this.db = db;
    this.sqlite = sqlite;

    // 注意：表结构由 drizzle-kit push 管理，启动前需确保已执行 bun run db:push
    // schema.ts 是唯一的表结构定义源，drizzle-kit push 会自动同步到数据库
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
    this.logs = createLogStore(this.sqlite);
    this.medication = createMedicationStore(this.db);
    this.chronic = createChronicStore(this.db);
    this.observation = createObservationStore(this.db);
    this.heartbeatTask = createHeartbeatTaskStore(this.sqlite);
    this.cronJobs = createCronJobStore(this.db);
  }

  /** 关闭数据库连接 */
  close(): void {
    this.sqlite.close();
  }
}
