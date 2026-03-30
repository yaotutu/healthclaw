/**
 * 用药功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的用药相关工具
 * 包含记录用药、查询用药记录（支持 activeOnly 过滤）、标记停药三个工具
 * 注意：查询工具使用自定义实现，不使用 createQueryTool 工厂，因为有 activeOnly 过滤
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { MedicationStore } from './store';

/**
 * 记录用药的参数 Schema
 */
const RecordMedicationParamsSchema = Type.Object({
  medication: Type.String({ description: '药物名称，如布洛芬、扑尔敏等' }),
  dosage: Type.Optional(Type.String({ description: '剂量，如 "1片"、"10mg"' })),
  frequency: Type.Optional(Type.String({ description: '用药频次，如 "每日一次"、"每日两次"' })),
  note: Type.Optional(Type.String({ description: '备注' })),
});

/** 记录用药参数类型 */
type RecordMedicationParams = typeof RecordMedicationParamsSchema;

/**
 * 查询用药记录的参数 Schema
 * 包含 activeOnly 参数，用于只查询正在服用的药物
 */
const QueryMedicationParamsSchema = Type.Object({
  startTime: Type.Optional(Type.Number({ description: '起始时间戳（毫秒）' })),
  endTime: Type.Optional(Type.Number({ description: '结束时间戳（毫秒）' })),
  activeOnly: Type.Optional(Type.Boolean({ description: '是否只查询正在服用的药物' })),
  limit: Type.Optional(Type.Number({ description: '返回数量限制，默认10' })),
});

/** 查询用药记录参数类型 */
type QueryMedicationParams = typeof QueryMedicationParamsSchema;

/**
 * 标记停药的参数 Schema
 */
const StopMedicationParamsSchema = Type.Object({
  medicationId: Type.Number({ description: '用药记录ID' }),
});

/** 标记停药参数类型 */
type StopMedicationParams = typeof StopMedicationParamsSchema;

/**
 * 创建用药相关的 Agent 工具
 * 包含记录用药、查询用药记录和标记停药三个工具
 * @param store 用药记录存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 recordMedication、queryMedicationRecords 和 stopMedication 的对象
 */
export const createMedicationTools = (store: MedicationStore, userId: string) => {
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
      const record = await store.record(userId, {
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
   * 注意：这里使用自定义实现而非 createQueryTool，因为需要支持 activeOnly 过滤
   */
  const queryMedicationRecords: AgentTool<QueryMedicationParams> = {
    name: 'query_medication_records',
    label: '查询用药记录',
    description: '查询用户的用药记录，支持按时间范围筛选和只查看正在服用的药物。',
    parameters: QueryMedicationParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.query(userId, {
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
      const record = await store.stop(userId, params.medicationId);
      return {
        content: [{ type: 'text', text: `已标记停药: ${record.medication}` }],
        details: { record },
      };
    },
  };

  return { recordMedication, queryMedicationRecords, stopMedication };
};
