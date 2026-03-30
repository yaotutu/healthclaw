import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Store, UserProfile } from '../store';
import { createQueryTool } from './tool-factory';
import { createWaterTools } from '../features/water/tools';
import { createBodyTools } from '../features/body/tools';
import { createSleepTools } from '../features/sleep/tools';
import { createExerciseTools } from '../features/exercise/tools';
import { createObservationTools } from '../features/observation/tools';
import { createSymptomTools } from '../features/symptom/tools';
import { createDietTools } from '../features/diet/tools';
import { createMedicationTools } from '../features/medication/tools';

// ==================== 记录工具参数 Schema ====================

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

// ==================== 查询工具参数 Schema ====================
// QueryRecordsParamsSchema 已移至 tool-factory.ts 统一管理

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

type RecordChronicConditionParams = typeof RecordChronicConditionParamsSchema;
type UpdateChronicConditionParams = typeof UpdateChronicConditionParamsSchema;
type QueryChronicConditionsParams = typeof QueryChronicConditionsParamsSchema;
type DeactivateChronicConditionParams = typeof DeactivateChronicConditionParamsSchema;
type QueryFoodSymptomCorrelationParams = typeof QueryFoodSymptomCorrelationParamsSchema;
type QueryHealthPatternsParams = typeof QueryHealthPatternsParamsSchema;
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
  // 身体数据工具已迁移至 features/body/tools.ts
  const bodyTools = createBodyTools(store.body, userId);

  // 饮食工具已迁移至 features/diet/tools.ts
  const dietTools = createDietTools(store.diet, userId);

  // 症状工具已迁移至 features/symptom/tools.ts
  const symptomTools = createSymptomTools(store.symptom, userId);

  // 运动工具已迁移至 features/exercise/tools.ts
  const exerciseTools = createExerciseTools(store.exercise, userId);

  // 睡眠工具已迁移至 features/sleep/tools.ts
  const sleepTools = createSleepTools(store.sleep, userId);

  // 饮水工具已迁移至 features/water/tools.ts
  const waterTools = createWaterTools(store.water, userId);

  // 用药工具已迁移至 features/medication/tools.ts
  const medicationTools = createMedicationTools(store.medication, userId);

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
  // 健康观察工具已迁移至 features/observation/tools.ts
  const observationTools = createObservationTools(store.observation, userId);

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
  // 6 个标准查询工具使用 createQueryTool 工厂函数生成，消除重复代码
  // 每个 queryFn 通过箭头函数绑定 userId，只需传入 options

  // 查询运动记录已迁移至 features/exercise/tools.ts

  // 查询睡眠记录已迁移至 features/sleep/tools.ts

  // 查询饮水记录已迁移至 features/water/tools.ts

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
    recordBody: bodyTools.recordBody,
    recordDiet: dietTools.recordDiet,
    recordSymptom: symptomTools.recordSymptom,
    recordExercise: exerciseTools.recordExercise,
    recordSleep: sleepTools.recordSleep,
    recordWater: waterTools.recordWater,
    recordMedication: medicationTools.recordMedication,
    queryMedicationRecords: medicationTools.queryMedicationRecords,
    stopMedication: medicationTools.stopMedication,
    recordChronicCondition,
    updateChronicCondition,
    queryChronicConditions,
    deactivateChronicCondition,
    queryFoodSymptomCorrelation,
    queryHealthPatterns,
    recordObservation: observationTools.recordObservation,
    queryObservations: observationTools.queryObservations,
    getProfile,
    updateProfile,
    queryBodyRecords: bodyTools.queryBodyRecords,
    queryDietRecords: dietTools.queryDietRecords,
    querySymptomRecords: symptomTools.querySymptomRecords,
    queryExerciseRecords: exerciseTools.queryExerciseRecords,
    querySleepRecords: sleepTools.querySleepRecords,
    queryWaterRecords: waterTools.queryWaterRecords,
    resolveSymptom: symptomTools.resolveSymptom,
    saveMemory,
    queryMemories,
    deleteMemory,
  };
};
