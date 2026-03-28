import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Store, UserProfile } from '../store';

// ==================== 记录工具参数 Schema ====================

/**
 * 记录身体数据的参数 Schema
 */
const RecordBodyParamsSchema = Type.Object({
  weight: Type.Number({ description: '体重 kg' }),
  bodyFat: Type.Optional(Type.Number({ description: '体脂率 %' })),
  bmi: Type.Optional(Type.Number({ description: 'BMI 指数' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/**
 * 记录饮食的参数 Schema
 */
const RecordDietParamsSchema = Type.Object({
  food: Type.String({ description: '食物名称' }),
  calories: Type.Number({ description: '热量 kcal' }),
  protein: Type.Optional(Type.Number({ description: '蛋白质 g' })),
  carbs: Type.Optional(Type.Number({ description: '碳水化合物 g' })),
  fat: Type.Optional(Type.Number({ description: '脂肪 g' })),
  sodium: Type.Optional(Type.Number({ description: '钠 mg' })),
  mealType: Type.Optional(Type.String({ description: '餐次，如早餐、午餐、晚餐、加餐' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/**
 * 记录症状的参数 Schema
 */
const RecordSymptomParamsSchema = Type.Object({
  description: Type.String({ description: '症状描述，如"胃痛"、"头痛"、"恶心"等' }),
  severity: Type.Optional(Type.Number({ description: '严重程度 1-10，10为最严重' })),
  bodyPart: Type.Optional(Type.String({ description: '身体部位，如"胃部"、"头部"、"胸部"等' })),
  relatedType: Type.Optional(Type.String({ description: '关联记录类型，如diet、exercise等（可选）' })),
  relatedId: Type.Optional(Type.Number({ description: '关联记录ID（可选）' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/**
 * 记录运动的参数 Schema
 */
const RecordExerciseParamsSchema = Type.Object({
  type: Type.String({ description: '运动类型，如跑步、游泳、瑜伽等' }),
  duration: Type.Number({ description: '运动时长 分钟' }),
  calories: Type.Optional(Type.Number({ description: '消耗热量 kcal' })),
  heartRateAvg: Type.Optional(Type.Number({ description: '平均心率 bpm' })),
  heartRateMax: Type.Optional(Type.Number({ description: '最大心率 bpm' })),
  distance: Type.Optional(Type.Number({ description: '距离 km' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/**
 * 记录睡眠的参数 Schema
 */
const RecordSleepParamsSchema = Type.Object({
  duration: Type.Number({ description: '睡眠时长 分钟' }),
  quality: Type.Optional(Type.Number({ description: '睡眠质量 1-5，5为最好' })),
  bedTime: Type.Optional(Type.Number({ description: '入睡时间 时间戳' })),
  wakeTime: Type.Optional(Type.Number({ description: '醒来时间 时间戳' })),
  deepSleep: Type.Optional(Type.Number({ description: '深睡时长 分钟' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/**
 * 记录饮水的参数 Schema
 */
const RecordWaterParamsSchema = Type.Object({
  amount: Type.Number({ description: '饮水量 ml' }),
  note: Type.Optional(Type.String({ description: '备注' })),
});

// ==================== 档案工具参数 Schema ====================

/**
 * 获取用户档案的参数 Schema
 */
const GetProfileParamsSchema = Type.Object({}, { description: '无参数' });

/**
 * 更新用户档案的参数 Schema
 * 所有字段均为可选，只传入需要更新的字段
 * 注意：体重不再存储在档案中，使用 record_body 工具记录
 */
const UpdateProfileParamsSchema = Type.Object({
  height: Type.Optional(Type.Number({ description: '身高 cm' })),
  age: Type.Optional(Type.Number({ description: '年龄' })),
  gender: Type.Optional(Type.String({ description: '性别' })),
  diseases: Type.Optional(Type.Array(Type.String(), { description: '疾病史' })),
  allergies: Type.Optional(Type.Array(Type.String(), { description: '过敏史' })),
  dietPreferences: Type.Optional(Type.String({ description: '饮食偏好' })),
  healthGoal: Type.Optional(Type.String({ description: '健康目标' })),
});

// ==================== 工具类型定义 ====================

type RecordBodyParams = typeof RecordBodyParamsSchema;
type RecordDietParams = typeof RecordDietParamsSchema;
type RecordSymptomParams = typeof RecordSymptomParamsSchema;
type RecordExerciseParams = typeof RecordExerciseParamsSchema;
type RecordSleepParams = typeof RecordSleepParamsSchema;
type RecordWaterParams = typeof RecordWaterParamsSchema;
type GetProfileParams = typeof GetProfileParamsSchema;
type UpdateProfileParams = typeof UpdateProfileParamsSchema;

// ==================== 工具创建函数 ====================

/**
 * 创建 Agent 工具集
 * 根据传入的 Store 实例和用户 ID，创建所有可用的 Agent 工具
 * 遵循原则：工具只提供数据，所有决策由 AI 完成
 * @param store 数据存储实例，提供各类型健康记录的数据操作
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含所有 Agent 工具的对象
 */
export const createTools = (store: Store, userId: string) => {
  /**
   * 记录身体数据工具
   * 记录用户的体重、体脂率、BMI 等身体指标
   */
  const recordBody: AgentTool<RecordBodyParams> = {
    name: 'record_body',
    label: '记录身体数据',
    description: '记录用户的身体数据，如体重、体脂率、BMI。体重应使用此工具记录，不再存储在档案中。',
    parameters: RecordBodyParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.body.record(userId, {
        weight: params.weight,
        bodyFat: params.bodyFat,
        bmi: params.bmi,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录身体数据: 体重 ${record.weight}kg${record.bodyFat ? `, 体脂 ${record.bodyFat}%` : ''} (${new Date(record.timestamp).toISOString()})` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 记录饮食工具
   * 记录用户的食物摄入和营养信息
   */
  const recordDiet: AgentTool<RecordDietParams> = {
    name: 'record_diet',
    label: '记录饮食',
    description: '记录用户的饮食摄入，包括食物名称、热量和营养成分（蛋白质、碳水、脂肪、钠）',
    parameters: RecordDietParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.diet.record(userId, {
        food: params.food,
        calories: params.calories,
        protein: params.protein,
        carbs: params.carbs,
        fat: params.fat,
        sodium: params.sodium,
        mealType: params.mealType,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录饮食: ${record.food} ${record.calories}kcal${record.mealType ? ` (${record.mealType})` : ''}` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 记录症状工具
   * 记录用户的身体不适、症状等信息
   * 支持关联其他记录类型，帮助追踪症状诱因
   */
  const recordSymptom: AgentTool<RecordSymptomParams> = {
    name: 'record_symptom',
    label: '记录症状',
    description: '记录用户的身体不适或症状，如胃痛、头痛等。可关联相关记录（如某次饮食）帮助分析诱因。',
    parameters: RecordSymptomParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.symptom.record(userId, {
        description: params.description,
        severity: params.severity,
        bodyPart: params.bodyPart,
        relatedType: params.relatedType,
        relatedId: params.relatedId,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录症状: ${record.description}${record.severity ? ` (严重程度 ${record.severity}/10)` : ''}${record.bodyPart ? ` - ${record.bodyPart}` : ''}` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 记录运动工具
   * 记录用户的运动活动和相关数据
   */
  const recordExercise: AgentTool<RecordExerciseParams> = {
    name: 'record_exercise',
    label: '记录运动',
    description: '记录用户的运动活动，包括类型、时长、消耗热量、心率等',
    parameters: RecordExerciseParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.exercise.record(userId, {
        type: params.type,
        duration: params.duration,
        calories: params.calories,
        heartRateAvg: params.heartRateAvg,
        heartRateMax: params.heartRateMax,
        distance: params.distance,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录运动: ${record.type} ${record.duration}分钟${record.calories ? `, 消耗 ${record.calories}kcal` : ''}` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 记录睡眠工具
   * 记录用户的睡眠数据
   */
  const recordSleep: AgentTool<RecordSleepParams> = {
    name: 'record_sleep',
    label: '记录睡眠',
    description: '记录用户的睡眠数据，包括时长、质量、入睡和醒来时间等',
    parameters: RecordSleepParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.sleep.record(userId, {
        duration: params.duration,
        quality: params.quality,
        bedTime: params.bedTime,
        wakeTime: params.wakeTime,
        deepSleep: params.deepSleep,
        note: params.note,
      });

      const hours = Math.floor(record.duration / 60);
      const mins = record.duration % 60;
      return {
        content: [{ type: 'text', text: `已记录睡眠: ${hours}小时${mins}分钟${record.quality ? ` (质量 ${record.quality}/5)` : ''}` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 记录饮水工具
   * 记录用户的饮水量
   */
  const recordWater: AgentTool<RecordWaterParams> = {
    name: 'record_water',
    label: '记录饮水',
    description: '记录用户的饮水量（ml）',
    parameters: RecordWaterParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.water.record(userId, {
        amount: params.amount,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录饮水: ${record.amount}ml` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 获取用户档案工具
   * 查询用户的个人健康档案，包括身高、年龄、疾病史、过敏史等信息
   * 注意：体重不再包含在档案中，应使用记录查询获取最新体重
   */
  const getProfile: AgentTool<GetProfileParams> = {
    name: 'get_profile',
    label: '获取用户档案',
    description: '获取用户的个人健康档案，包括身高、年龄、疾病史、过敏史、饮食偏好等。注意：体重不再存储在档案中。',
    parameters: GetProfileParamsSchema,
    execute: async (_toolCallId, _params, _signal) => {
      const profile = await store.profile.get(userId);

      if (!profile) {
        return {
          content: [{ type: 'text', text: '用户尚未建立个人档案' }],
          details: { exists: false },
        };
      }

      // 解析 JSON 数组字段
      const parsed = {
        ...profile,
        diseases: profile.diseases ? JSON.parse(profile.diseases) as string[] : [],
        allergies: profile.allergies ? JSON.parse(profile.allergies) as string[] : [],
      };

      return {
        content: [{ type: 'text', text: `用户档案: ${JSON.stringify(parsed, null, 2)}` }],
        details: { exists: true, profile: parsed },
      };
    },
  };

  /**
   * 更新用户档案工具
   * 创建或更新用户的个人健康档案，只传入需要更新的字段
   * 注意：体重不再存储在档案中，使用 record_body 工具记录
   */
  const updateProfile: AgentTool<UpdateProfileParams> = {
    name: 'update_profile',
    label: '更新用户档案',
    description: '更新用户的个人健康档案。注意：体重不再存储在档案中，请使用 record_body 工具记录体重。',
    parameters: UpdateProfileParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const data: Partial<Omit<UserProfile, 'userId' | 'createdAt' | 'updatedAt'>> = {};

      if (params.height !== undefined) data.height = params.height;
      if (params.age !== undefined) data.age = params.age;
      if (params.gender !== undefined) data.gender = params.gender;
      // 疾病史和过敏史是字符串数组，需要序列化为 JSON 字符串
      if (params.diseases !== undefined) data.diseases = JSON.stringify(params.diseases);
      if (params.allergies !== undefined) data.allergies = JSON.stringify(params.allergies);
      if (params.dietPreferences !== undefined) data.dietPreferences = params.dietPreferences;
      if (params.healthGoal !== undefined) data.healthGoal = params.healthGoal;

      const profile = await store.profile.upsert(userId, data);

      return {
        content: [{ type: 'text', text: '用户档案已更新' }],
        details: { profile },
      };
    },
  };

  return {
    recordBody,
    recordDiet,
    recordSymptom,
    recordExercise,
    recordSleep,
    recordWater,
    getProfile,
    updateProfile,
  };
};
