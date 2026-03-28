import { createDb, type Db } from './db';
import { createBodyStore, type BodyStore } from './body';
import { createDietStore, type DietStore } from './diet';
import { createExerciseStore, type ExerciseStore } from './exercise';
import { createMessageStore, type MessageStore } from './messages';
import { createProfileStore, type ProfileStore } from './profile';
import { createSleepStore, type SleepStore } from './sleep';
import { createSymptomStore, type SymptomStore } from './symptom';
import { createWaterStore, type WaterStore } from './water';
import {
  userProfiles,
  bodyRecords,
  dietRecords,
  symptomRecords,
  exerciseRecords,
  sleepRecords,
  waterRecords,
  messages
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
  createWaterStore
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
  messages
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
  WaterStore
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

    this.initTables();
  }

  /**
   * 安全的列迁移：列已存在时忽略错误
   * 用于 ALTER TABLE ADD COLUMN 操作，避免因列已存在而导致的迁移失败
   * @param sql ALTER TABLE 语句
   */
  private safeAlter(sql: string): void {
    try {
      this.sqlite.run(sql);
    } catch (err) {
      // SQLite 列已存在时报错 "duplicate column name"，此时忽略错误
      if (!(err as Error).message?.includes('duplicate column name')) {
        throw err;
      }
    }
  }

  /**
   * 初始化数据库表结构
   * 创建所有新表，并迁移旧 health_records 数据到新表结构
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

    // 创建用户档案表（保留 weight 列用于兼容，但代码不再使用）
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

    // 创建索引以提高查询性能
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_body_user_id ON body_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_diet_user_id ON diet_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_symptom_user_id ON symptom_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_exercise_user_id ON exercise_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_sleep_user_id ON sleep_records(user_id)`);
    this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_water_user_id ON water_records(user_id)`);

    // 迁移旧 health_records 数据到新表（一次性迁移）
    this.migrateOldData();

    // 安全迁移：为旧版数据库添加新增列
    this.safeAlter(`ALTER TABLE messages ADD COLUMN metadata TEXT`);
  }

  /**
   * 迁移旧 health_records 数据到新表结构
   * 一次性迁移，完成后旧表数据可删除
   */
  private migrateOldData(): void {
    try {
      // 检查旧表是否存在
      const tableExists = this.sqlite.query(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='health_records'
      `).get();

      if (!tableExists) return;

      // 迁移体重数据到 body_records
      this.sqlite.run(`
        INSERT INTO body_records (user_id, weight, note, timestamp)
        SELECT user_id, value, note, timestamp
        FROM health_records
        WHERE type = 'weight'
        AND NOT EXISTS (
          SELECT 1 FROM body_records br
          WHERE br.user_id = health_records.user_id
          AND br.timestamp = health_records.timestamp
        )
      `);

      // 迁移饮食数据到 diet_records
      // 由于旧表使用 JSON detail 字段，这里需要特殊处理
      this.sqlite.run(`
        INSERT INTO diet_records (user_id, food, calories, protein, carbs, fat, sodium, note, timestamp)
        SELECT
          user_id,
          COALESCE(json_extract(detail, '$.food'), '未知食物') as food,
          CAST(COALESCE(json_extract(detail, '$.calories'), value) AS INTEGER) as calories,
          json_extract(detail, '$.protein') as protein,
          json_extract(detail, '$.carbs') as carbs,
          json_extract(detail, '$.fat') as fat,
          json_extract(detail, '$.sodium') as sodium,
          note,
          timestamp
        FROM health_records
        WHERE type = 'diet'
        AND NOT EXISTS (
          SELECT 1 FROM diet_records dr
          WHERE dr.user_id = health_records.user_id
          AND dr.timestamp = health_records.timestamp
        )
      `);

      // 迁移运动数据到 exercise_records
      this.sqlite.run(`
        INSERT INTO exercise_records (user_id, type, duration, calories, note, timestamp)
        SELECT
          user_id,
          COALESCE(json_extract(detail, '$.type'), '运动') as type,
          CAST(COALESCE(json_extract(detail, '$.duration'), value) AS INTEGER) as duration,
          CAST(COALESCE(json_extract(detail, '$.calories'), value) AS INTEGER) as calories,
          note,
          timestamp
        FROM health_records
        WHERE type = 'exercise'
        AND NOT EXISTS (
          SELECT 1 FROM exercise_records er
          WHERE er.user_id = health_records.user_id
          AND er.timestamp = health_records.timestamp
        )
      `);

      // 迁移睡眠数据到 sleep_records
      this.sqlite.run(`
        INSERT INTO sleep_records (user_id, duration, quality, note, timestamp)
        SELECT
          user_id,
          CAST(COALESCE(json_extract(detail, '$.duration'), value) AS INTEGER) as duration,
          json_extract(detail, '$.quality') as quality,
          note,
          timestamp
        FROM health_records
        WHERE type = 'sleep'
        AND NOT EXISTS (
          SELECT 1 FROM sleep_records sr
          WHERE sr.user_id = health_records.user_id
          AND sr.timestamp = health_records.timestamp
        )
      `);

      // 迁移饮水数据到 water_records
      this.sqlite.run(`
        INSERT INTO water_records (user_id, amount, note, timestamp)
        SELECT
          user_id,
          CAST(value AS INTEGER) as amount,
          note,
          timestamp
        FROM health_records
        WHERE type = 'water'
        AND NOT EXISTS (
          SELECT 1 FROM water_records wr
          WHERE wr.user_id = health_records.user_id
          AND wr.timestamp = health_records.timestamp
        )
      `);

      // 迁移完成后删除旧表（可选，保留注释掉以防需要回滚）
      // this.sqlite.run(`DROP TABLE IF EXISTS health_records`);
      // this.sqlite.run(`DROP INDEX IF EXISTS idx_health_user_id`);
      // this.sqlite.run(`DROP INDEX IF EXISTS idx_health_timestamp`);

    } catch (err) {
      // 迁移失败不应阻止应用启动，记录错误即可
      console.error('数据迁移失败（可能旧表不存在或已迁移）:', err);
    }
  }

  /** 关闭数据库连接 */
  close(): void {
    this.sqlite.close();
  }
}
