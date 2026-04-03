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

/**
 * 创建极简查询工具（无参数，默认返回最近数据）
 *
 * 用于常驻上下文场景：工具不接受任何参数，调用时直接返回最近的记录。
 * token 开销极低，适合作为 Agent 的常驻背景工具，让 LLM 随时快速获取
 * 各功能模块的最新数据，而不需要显式地用 query_xxx 工具带参数查询。
 *
 * 每个功能模块 opt-in 暴露此工具，未暴露的模块不会出现在常驻上下文中，
 * 避免不必要的 token 消耗。
 *
 * @param options.name 工具名称，如 'simple_query_body'
 * @param options.description 工具描述，告知 LLM 该工具返回什么数据
 * @param options.queryFn 无参数查询方法，返回最近记录数组
 * @returns 极简查询工具（参数为空对象）
 */
export const createSimpleQueryTool = (options: {
  name: string;
  description: string;
  queryFn: () => Promise<any[]>;
}): AgentTool => ({
  name: options.name,
  label: options.description,
  description: options.description,
  // 参数为空对象，调用时无需传入任何参数
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params, _signal) => {
    const records = await options.queryFn();
    return {
      content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
      details: {},
    };
  },
});
