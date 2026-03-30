/**
 * 慢性病功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的慢性病相关工具
 * 包含记录慢性病、更新慢性病、查询慢性病、停用慢性病追踪四个工具
 * 注意：查询工具使用自定义实现，不使用 createQueryTool 工厂，因为有 activeOnly 过滤和 triggers JSON 解析
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { ChronicStore } from './store';

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

/** 记录慢性病参数类型 */
type RecordChronicConditionParams = typeof RecordChronicConditionParamsSchema;
/** 更新慢性病参数类型 */
type UpdateChronicConditionParams = typeof UpdateChronicConditionParamsSchema;
/** 查询慢性病参数类型 */
type QueryChronicConditionsParams = typeof QueryChronicConditionsParamsSchema;
/** 停用慢性病追踪参数类型 */
type DeactivateChronicConditionParams = typeof DeactivateChronicConditionParamsSchema;

/**
 * 创建慢性病相关的 Agent 工具
 * 包含记录慢性病、更新慢性病、查询慢性病和停用慢性病追踪四个工具
 * @param store 慢性病记录存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 recordChronicCondition、updateChronicCondition、queryChronicConditions 和 deactivateChronicCondition 的对象
 */
export const createChronicTools = (store: ChronicStore, userId: string) => {
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
      const record = await store.add(userId, {
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
      const record = await store.update(userId, params.conditionId, {
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
   * 查询用户的慢性病列表，默认只显示活跃的慢性病
   * 注意：需要将 triggers 字段从 JSON 字符串解析为数组
   */
  const queryChronicConditions: AgentTool<QueryChronicConditionsParams> = {
    name: 'query_chronic_conditions',
    label: '查询慢性病',
    description: '查询用户的慢性病列表，默认只显示活跃的慢性病。',
    parameters: QueryChronicConditionsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.query(userId, {
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
   * 将指定慢性病标记为不再追踪（如已治愈）
   */
  const deactivateChronicCondition: AgentTool<DeactivateChronicConditionParams> = {
    name: 'deactivate_chronic_condition',
    label: '停用慢性病追踪',
    description: '将指定慢性病标记为不再追踪（如已治愈）。',
    parameters: DeactivateChronicConditionParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.deactivate(userId, params.conditionId);
      return {
        content: [{ type: 'text', text: `已停用慢性病追踪: ${record.condition}` }],
        details: { record },
      };
    },
  };

  return { recordChronicCondition, updateChronicCondition, queryChronicConditions, deactivateChronicCondition };
};
