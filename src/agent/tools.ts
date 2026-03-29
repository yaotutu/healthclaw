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
  bedTime: Type.Optional(Type.String({ description: '入睡时间，格式 "YYYY-MM-DD HH:mm"，如 "2026-03-28 02:00"' })),
  wakeTime: Type.Optional(Type.String({ description: '醒来时间，格式 "YYYY-MM-DD HH:mm"，如 "2026-03-28 08:00"' })),
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

/**
 * 记录用药的参数 Schema
 */
const RecordMedicationParamsSchema = Type.Object({
  medication: Type.String({ description: '药物名称，如布洛芬、扑尔敏等' }),
  dosage: Type.Optional(Type.String({ description: '剂量，如 "1片"、"10mg"' })),
  frequency: Type.Optional(Type.String({ description: '用药频次，如 "每日一次"、"每日两次"' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/**
 * 查询用药记录的参数 Schema
 */
const QueryMedicationParamsSchema = Type.Object({
  startTime: Type.Optional(Type.Number({ description: '起始时间戳（毫秒）' })),
  endTime: Type.Optional(Type.Number({ description: '结束时间戳（毫秒）' })),
  activeOnly: Type.Optional(Type.Boolean({ description: '是否只查询正在服用的药物' })),
  limit: Type.Optional(Type.Number({ description: '返回数量限制，默认10' })),
});

/**
 * 标记停药的参数 Schema
 */
const StopMedicationParamsSchema = Type.Object({
  medicationId: Type.Number({ description: '用药记录ID' }),
});

/**
 * 记录慢性病的参数 Schema
 */
const RecordChronicConditionParamsSchema = Type.Object({
  condition: Type.String({ description: '慢性病名称，如"鼻炎"、"偏头痛"' }),
  severity: Type.Optional(Type.String({ description: '严重程度：轻度/中度/重度' })),
  seasonalPattern: Type.Optional(Type.String({ description: '季节模式，如"9月份严重（秋季过敏）"' })),
  triggers: Type.Optional(Type.Array(Type.String(), { description: '触发因素列表' })),
  notes: Type.Optional(Type.String({ description: '备注' })),
});

/**
 * 更新慢性病的参数 Schema
 */
const UpdateChronicConditionParamsSchema = Type.Object({
  conditionId: Type.Number({ description: '慢性病记录ID' }),
  severity: Type.Optional(Type.String({ description: '严重程度：轻度/中度/重度' })),
  seasonalPattern: Type.Optional(Type.String({ description: '季节模式' })),
  triggers: Type.Optional(Type.Array(Type.String(), { description: '触发因素列表' })),
  notes: Type.Optional(Type.String({ description: '备注' })),
});

/**
 * 查询慢性病的参数 Schema
 */
const QueryChronicConditionsParamsSchema = Type.Object({
  activeOnly: Type.Optional(Type.Boolean({ description: '是否只查询活跃的慢性病，默认true' })),
});

/**
 * 停用慢性病追踪的参数 Schema
 */
const DeactivateChronicConditionParamsSchema = Type.Object({
  conditionId: Type.Number({ description: '慢性病记录ID' }),
});

/**
 * 查询食物-症状关联分析的参数 Schema
 */
const QueryFoodSymptomCorrelationParamsSchema = Type.Object({
  days: Type.Optional(Type.Number({ description: '分析最近多少天的数据，默认30天' })),
});

/**
 * 查询健康模式分析的参数 Schema
 */
const QueryHealthPatternsParamsSchema = Type.Object({
  days: Type.Optional(Type.Number({ description: '分析最近多少天的数据，默认30天' })),
});

/**
 * 记录健康观察的参数 Schema
 */
const RecordObservationParamsSchema = Type.Object({
  content: Type.String({ description: '观察内容，如"最近睡眠不好"、"感觉压力大"' }),
  tags: Type.Optional(Type.Array(Type.String(), { description: '标签列表，如 ["睡眠","疲劳"]' })),
});

/**
 * 查询健康观察的参数 Schema
 */
const QueryObservationsParamsSchema = Type.Object({
  startTime: Type.Optional(Type.Number({ description: '起始时间戳（毫秒）' })),
  endTime: Type.Optional(Type.Number({ description: '结束时间戳（毫秒）' })),
  limit: Type.Optional(Type.Number({ description: '返回数量限制，默认10' })),
});

// ==================== 查询工具参数 Schema ====================

/**
 * 通用查询参数 Schema
 * 所有查询工具共享相同的参数结构，支持按时间范围筛选和限制返回数量
 */
const QueryRecordsParamsSchema = Type.Object({
  startTime: Type.Optional(Type.Number({ description: '起始时间戳（毫秒）' })),
  endTime: Type.Optional(Type.Number({ description: '结束时间戳（毫秒）' })),
  limit: Type.Optional(Type.Number({ description: '返回数量限制，默认10' })),
});

// ==================== 解决症状工具参数 Schema ====================

/**
 * 标记症状已解决的参数 Schema
 * 需要提供症状记录的 ID
 */
const ResolveSymptomParamsSchema = Type.Object({
  symptomId: Type.Number({ description: '症状记录ID' }),
});

// ==================== 记忆工具参数 Schema ====================

/**
 * 保存记忆的参数 Schema
 * 用于将用户偏好、反馈或重要事实存储为长期记忆
 */
const SaveMemoryParamsSchema = Type.Object({
  content: Type.String({ description: '记忆内容，如用户偏好、反馈或重要事实' }),
  category: Type.Optional(Type.String({ description: '分类：feedback(反馈)/preference(偏好)/fact(事实)' })),
});

/**
 * 查询记忆的参数 Schema
 * 支持按分类过滤和限制返回数量
 */
const QueryMemoriesParamsSchema = Type.Object({
  category: Type.Optional(Type.String({ description: '按分类过滤' })),
  limit: Type.Optional(Type.Number({ description: '返回数量限制，默认20' })),
});

/**
 * 删除记忆的参数 Schema
 * 需要提供要删除的记忆 ID
 */
const DeleteMemoryParamsSchema = Type.Object({
  memoryId: Type.Number({ description: '记忆ID' }),
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
type RecordMedicationParams = typeof RecordMedicationParamsSchema;
type QueryMedicationParams = typeof QueryMedicationParamsSchema;
type StopMedicationParams = typeof StopMedicationParamsSchema;
type RecordChronicConditionParams = typeof RecordChronicConditionParamsSchema;
type UpdateChronicConditionParams = typeof UpdateChronicConditionParamsSchema;
type QueryChronicConditionsParams = typeof QueryChronicConditionsParamsSchema;
type DeactivateChronicConditionParams = typeof DeactivateChronicConditionParamsSchema;
type QueryFoodSymptomCorrelationParams = typeof QueryFoodSymptomCorrelationParamsSchema;
type QueryHealthPatternsParams = typeof QueryHealthPatternsParamsSchema;
type RecordObservationParams = typeof RecordObservationParamsSchema;
type QueryObservationsParams = typeof QueryObservationsParamsSchema;
type QueryRecordsParams = typeof QueryRecordsParamsSchema;
type ResolveSymptomParams = typeof ResolveSymptomParamsSchema;
type SaveMemoryParams = typeof SaveMemoryParamsSchema;
type QueryMemoriesParams = typeof QueryMemoriesParamsSchema;
type DeleteMemoryParams = typeof DeleteMemoryParamsSchema;
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
      // 解析 bedTime/wakeTime 字符串为毫秒时间戳
      // LLM 传入格式为 "YYYY-MM-DD HH:mm"，由代码负责转换，避免 LLM 计算时间戳出错
      const parseDateTime = (str: string | undefined): number | undefined => {
        if (!str) return undefined;
        // 支持 "YYYY-MM-DD HH:mm" 或 "YYYY-MM-DDTHH:mm" 格式
        const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})/);
        if (match) {
          return new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]).getTime();
        }
        // 尝试直接解析
        const d = new Date(str);
        return isNaN(d.getTime()) ? undefined : d.getTime();
      };

      const record = await store.sleep.record(userId, {
        duration: params.duration,
        quality: params.quality,
        bedTime: parseDateTime(params.bedTime),
        wakeTime: parseDateTime(params.wakeTime),
        deepSleep: params.deepSleep,
        note: params.note,
      });

      const duration = record.duration ?? 0;
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;
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
   * 记录用药工具
   * 记录用户的用药信息，包括药物名称、剂量和频次
   */
  const recordMedication: AgentTool<RecordMedicationParams> = {
    name: 'record_medication',
    label: '记录用药',
    description: '记录用户的用药信息，包括药物名称、剂量和频次。',
    parameters: RecordMedicationParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.medication.record(userId, {
        medication: params.medication,
        dosage: params.dosage,
        frequency: params.frequency,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录用药: ${record.medication}${record.dosage ? ` ${record.dosage}` : ''}${record.frequency ? ` (${record.frequency})` : ''}` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 查询用药记录工具
   * 查询用户的用药历史，支持按时间范围筛选和只查看正在服用的药物
   */
  const queryMedicationRecords: AgentTool<QueryMedicationParams> = {
    name: 'query_medication_records',
    label: '查询用药记录',
    description: '查询用户的用药记录，支持按时间范围筛选和只查看正在服用的药物。',
    parameters: QueryMedicationParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.medication.query(userId, {
        startDate: params.startTime,
        endDate: params.endTime,
        activeOnly: params.activeOnly,
        limit: params.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
        details: { records, count: records.length },
      };
    },
  };

  /**
   * 标记停药工具
   * 将指定用药记录标记为已停药
   */
  const stopMedication: AgentTool<StopMedicationParams> = {
    name: 'stop_medication',
    label: '标记停药',
    description: '将指定用药记录标记为已停药。',
    parameters: StopMedicationParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.medication.stop(userId, params.medicationId);
      return {
        content: [{ type: 'text', text: `已标记停药: ${record.medication}` }],
        details: { record },
      };
    },
  };

  /**
   * 记录慢性病工具
   * 添加用户的新慢性病追踪记录
   */
  const recordChronicCondition: AgentTool<RecordChronicConditionParams> = {
    name: 'record_chronic_condition',
    label: '记录慢性病',
    description: '添加用户的慢性病记录，如鼻炎、偏头痛等，用于长期追踪。',
    parameters: RecordChronicConditionParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.chronic.add(userId, {
        condition: params.condition,
        severity: params.severity,
        seasonalPattern: params.seasonalPattern,
        triggers: params.triggers,
        notes: params.notes,
      });

      return {
        content: [{ type: 'text', text: `已记录慢性病: ${record.condition}${record.severity ? ` (${record.severity})` : ''}` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 更新慢性病工具
   * 更新指定慢性病的信息（严重程度、触发因素等）
   */
  const updateChronicCondition: AgentTool<UpdateChronicConditionParams> = {
    name: 'update_chronic_condition',
    label: '更新慢性病',
    description: '更新用户的慢性病信息，如严重程度、触发因素等。',
    parameters: UpdateChronicConditionParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.chronic.update(userId, params.conditionId, {
        severity: params.severity,
        seasonalPattern: params.seasonalPattern,
        triggers: params.triggers,
        notes: params.notes,
      });

      return {
        content: [{ type: 'text', text: `已更新慢性病: ${record.condition}` }],
        details: { record },
      };
    },
  };

  /**
   * 查询慢性病工具
   * 查询用户的慢性病列表
   */
  const queryChronicConditions: AgentTool<QueryChronicConditionsParams> = {
    name: 'query_chronic_conditions',
    label: '查询慢性病',
    description: '查询用户的慢性病列表，默认只显示活跃的慢性病。',
    parameters: QueryChronicConditionsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.chronic.query(userId, {
        activeOnly: params.activeOnly ?? true,
      });

      // 解析 triggers JSON 字段
      const parsed = records.map(r => ({
        ...r,
        triggers: r.triggers ? JSON.parse(r.triggers) : [],
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ records: parsed, count: parsed.length }) }],
        details: { records: parsed, count: parsed.length },
      };
    },
  };

  /**
   * 停用慢性病追踪工具
   * 将指定慢性病标记为不再追踪
   */
  const deactivateChronicCondition: AgentTool<DeactivateChronicConditionParams> = {
    name: 'deactivate_chronic_condition',
    label: '停用慢性病追踪',
    description: '将指定慢性病标记为不再追踪（如已治愈）。',
    parameters: DeactivateChronicConditionParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.chronic.deactivate(userId, params.conditionId);
      return {
        content: [{ type: 'text', text: `已停用慢性病追踪: ${record.condition}` }],
        details: { record },
      };
    },
  };

  /**
   * 查询食物-症状关联分析工具
   * 分析用户最近N天的饮食和症状记录，计算每种食物与症状的关联概率
   */
  const queryFoodSymptomCorrelation: AgentTool<QueryFoodSymptomCorrelationParams> = {
    name: 'query_food_symptom_correlation',
    label: '食物-症状关联分析',
    description: '分析用户最近N天的饮食和症状记录，计算每种食物与症状出现的关联概率，识别高风险和中风险食物。',
    parameters: QueryFoodSymptomCorrelationParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const result = await store.analysis.analyzeFoodSymptomCorrelation(userId, params.days ?? 30);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };

  /**
   * 查询健康模式分析工具
   * 统计症状频率，分析症状与睡眠、运动的关联
   */
  const queryHealthPatterns: AgentTool<QueryHealthPatternsParams> = {
    name: 'query_health_patterns',
    label: '健康模式分析',
    description: '分析用户最近N天的健康数据，统计症状频率，发现症状与睡眠不足、运动的关联模式。',
    parameters: QueryHealthPatternsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const result = await store.analysis.analyzeHealthPatterns(userId, params.days ?? 30);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  };

  /**
   * 记录健康观察工具
   * 记录用户的非结构化健康观察，如"最近睡眠不好"、"感觉压力大"等
   */
  const recordObservation: AgentTool<RecordObservationParams> = {
    name: 'record_observation',
    label: '记录健康观察',
    description: '记录用户的健康观察或感受，如"最近睡眠不好"、"感觉压力大"等模糊描述。',
    parameters: RecordObservationParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.observation.record(userId, {
        content: params.content,
        tags: params.tags,
      });

      return {
        content: [{ type: 'text', text: `已记录观察: ${record.content}` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 查询健康观察工具
   * 查询用户的健康观察记录
   */
  const queryObservations: AgentTool<QueryObservationsParams> = {
    name: 'query_observations',
    label: '查询健康观察',
    description: '查询用户的健康观察记录，支持按时间范围筛选。',
    parameters: QueryObservationsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.observation.query(userId, {
        startDate: params.startTime,
        endDate: params.endTime,
        limit: params.limit,
      });

      // 解析 tags JSON 字段
      const parsed = records.map(r => ({
        ...r,
        tags: r.tags ? JSON.parse(r.tags) : [],
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ records: parsed, count: parsed.length }) }],
        details: { records: parsed, count: parsed.length },
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

  // ==================== 查询工具 ====================

  /**
   * 查询身体数据记录工具
   * 按时间范围查询用户的体重、体脂率、BMI 等身体数据历史
   */
  const queryBodyRecords: AgentTool<QueryRecordsParams> = {
    name: 'query_body_records',
    label: '查询身体数据',
    description: '查询用户的身体数据记录（体重、体脂率、BMI等），支持按时间范围筛选。',
    parameters: QueryRecordsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.body.query(userId, {
        startDate: params.startTime,
        endDate: params.endTime,
        limit: params.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
        details: { records, count: records.length },
      };
    },
  };

  /**
   * 查询饮食记录工具
   * 按时间范围查询用户的饮食摄入历史
   */
  const queryDietRecords: AgentTool<QueryRecordsParams> = {
    name: 'query_diet_records',
    label: '查询饮食记录',
    description: '查询用户的饮食记录，支持按时间范围筛选。',
    parameters: QueryRecordsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.diet.query(userId, {
        startDate: params.startTime,
        endDate: params.endTime,
        limit: params.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
        details: { records, count: records.length },
      };
    },
  };

  /**
   * 查询症状记录工具
   * 按时间范围查询用户的症状/不适记录历史
   */
  const querySymptomRecords: AgentTool<QueryRecordsParams> = {
    name: 'query_symptom_records',
    label: '查询症状记录',
    description: '查询用户的症状/不适记录，支持按时间范围筛选。',
    parameters: QueryRecordsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.symptom.query(userId, {
        startDate: params.startTime,
        endDate: params.endTime,
        limit: params.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
        details: { records, count: records.length },
      };
    },
  };

  /**
   * 查询运动记录工具
   * 按时间范围查询用户的运动活动历史
   */
  const queryExerciseRecords: AgentTool<QueryRecordsParams> = {
    name: 'query_exercise_records',
    label: '查询运动记录',
    description: '查询用户的运动记录，支持按时间范围筛选。',
    parameters: QueryRecordsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.exercise.query(userId, {
        startDate: params.startTime,
        endDate: params.endTime,
        limit: params.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
        details: { records, count: records.length },
      };
    },
  };

  /**
   * 查询睡眠记录工具
   * 按时间范围查询用户的睡眠数据历史
   */
  const querySleepRecords: AgentTool<QueryRecordsParams> = {
    name: 'query_sleep_records',
    label: '查询睡眠记录',
    description: '查询用户的睡眠记录，支持按时间范围筛选。',
    parameters: QueryRecordsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.sleep.query(userId, {
        startDate: params.startTime,
        endDate: params.endTime,
        limit: params.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
        details: { records, count: records.length },
      };
    },
  };

  /**
   * 查询饮水记录工具
   * 按时间范围查询用户的饮水量历史
   */
  const queryWaterRecords: AgentTool<QueryRecordsParams> = {
    name: 'query_water_records',
    label: '查询饮水记录',
    description: '查询用户的饮水记录，支持按时间范围筛选。',
    parameters: QueryRecordsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.water.query(userId, {
        startDate: params.startTime,
        endDate: params.endTime,
        limit: params.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
        details: { records, count: records.length },
      };
    },
  };

  // ==================== 症状解决工具 ====================

  /**
   * 标记症状已解决工具
   * 将指定症状记录的 resolved_at 字段更新为当前时间
   */
  const resolveSymptom: AgentTool<ResolveSymptomParams> = {
    name: 'resolve_symptom',
    label: '标记症状已解决',
    description: '将指定症状标记为已解决。',
    parameters: ResolveSymptomParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.symptom.resolve(userId, params.symptomId);
      return {
        content: [{ type: 'text', text: `已标记症状为已解决: ${record.description}` }],
        details: { record },
      };
    },
  };

  // ==================== 记忆工具 ====================

  /**
   * 保存记忆工具
   * 将 Agent 从对话中提取的关键信息（如用户偏好、反馈、健康事实）存储为长期记忆
   * 这些记忆会在后续对话中被使用，实现跨会话的个性化服务
   */
  const saveMemory: AgentTool<SaveMemoryParams> = {
    name: 'save_memory',
    label: '保存记忆',
    description: '保存一条关于用户的长期记忆，如偏好、反馈或重要事实。',
    parameters: SaveMemoryParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.memory.save(userId, {
        content: params.content,
        category: params.category,
      });
      return {
        content: [{ type: 'text', text: `已保存记忆: ${record.content}` }],
        details: { id: record.id, record },
      };
    },
  };

  /**
   * 查询记忆工具
   * 查询已保存的用户记忆，支持按分类过滤
   * 用于在对话中回忆用户的偏好、反馈或健康事实
   */
  const queryMemories: AgentTool<QueryMemoriesParams> = {
    name: 'query_memories',
    label: '查询记忆',
    description: '查询已保存的关于用户的记忆，可按分类过滤。',
    parameters: QueryMemoriesParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.memory.query(userId, {
        category: params.category,
        limit: params.limit,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
        details: { records, count: records.length },
      };
    },
  };

  /**
   * 删除记忆工具
   * 根据记忆 ID 删除指定的长期记忆记录
   * 用于清理过时或错误的记忆信息
   */
  const deleteMemory: AgentTool<DeleteMemoryParams> = {
    name: 'delete_memory',
    label: '删除记忆',
    description: '删除指定的一条长期记忆。',
    parameters: DeleteMemoryParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const success = await store.memory.remove(userId, params.memoryId);
      return {
        content: [{ type: 'text', text: success ? `已删除记忆 ID: ${params.memoryId}` : `未找到记忆 ID: ${params.memoryId}` }],
        details: { success },
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
    recordMedication,
    queryMedicationRecords,
    stopMedication,
    recordChronicCondition,
    updateChronicCondition,
    queryChronicConditions,
    deactivateChronicCondition,
    queryFoodSymptomCorrelation,
    queryHealthPatterns,
    recordObservation,
    queryObservations,
    getProfile,
    updateProfile,
    queryBodyRecords,
    queryDietRecords,
    querySymptomRecords,
    queryExerciseRecords,
    querySleepRecords,
    queryWaterRecords,
    resolveSymptom,
    saveMemory,
    queryMemories,
    deleteMemory,
  };
};
