import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { QueryOptions } from '../store/record-store';

/**
 * 通用查询参数 Schema
 * 所有标准查询工具共享相同的参数结构
 */
export const QueryRecordsParamsSchema = Type.Object({
  startTime: Type.Optional(Type.Number({ description: '起始时间戳（毫秒）' })),
  endTime: Type.Optional(Type.Number({ description: '结束时间戳（毫秒）' })),
  limit: Type.Optional(Type.Number({ description: '返回数量限制，默认10' })),
});

/** 通用查询参数类型 */
type QueryRecordsParams = typeof QueryRecordsParamsSchema;

/**
 * 创建标准查询工具的工厂函数
 *
 * 6 个标准查询工具（body/diet/symptom/exercise/sleep/water）的 execute 逻辑完全相同：
 * 调用 store.xxx.query()，返回 JSON 序列化结果。
 * 本函数消除这些重复，只需传入名称、描述和 store 查询方法即可生成工具。
 *
 * 注意：queryFn 已绑定 userId（通过 store.xxx.query.bind(null, userId) 或箭头函数），
 * 工具内部只需传入 options 即可。
 *
 * @param config.name 工具名称，如 'query_body_records'
 * @param config.label 工具显示标签，如 '查询身体数据'
 * @param config.description 工具描述
 * @param config.queryFn 已绑定 userId 的查询方法，接收 options 返回记录数组
 * @returns 标准查询工具
 */
export function createQueryTool(config: {
  name: string;
  label: string;
  description: string;
  queryFn: (options: QueryOptions) => Promise<any[]>;
}): AgentTool<QueryRecordsParams> {
  const { name, label, description, queryFn } = config;

  return {
    name,
    label,
    description,
    parameters: QueryRecordsParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await queryFn({
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
}
