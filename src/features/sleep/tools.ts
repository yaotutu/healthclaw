/**
 * 睡眠功能的 Agent 工具集
 * 从 src/agent/tools.ts 中提取的睡眠相关工具
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { SleepStore } from './store';
import { createQueryTool } from '../../agent/tool-factory';

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

/** 记录睡眠参数类型 */
type RecordSleepParams = typeof RecordSleepParamsSchema;

/**
 * 解析日期时间字符串为毫秒时间戳
 * LLM 传入格式为 "YYYY-MM-DD HH:mm"，由代码负责转换，避免 LLM 计算时间戳出错
 * @param str 日期时间字符串，支持 "YYYY-MM-DD HH:mm" 或 "YYYY-MM-DDTHH:mm" 格式
 * @returns 毫秒时间戳，解析失败返回 undefined
 */
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

/**
 * 创建睡眠相关的 Agent 工具
 * 包含记录睡眠和查询睡眠记录两个工具
 * @param store 睡眠记录存储实例
 * @param userId 当前用户 ID，用于数据隔离
 * @returns 包含 recordSleep 和 querySleepRecords 的对象
 */
export const createSleepTools = (store: SleepStore, userId: string) => {
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
      const record = await store.record(userId, {
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

  /** 查询睡眠记录 */
  const querySleepRecords = createQueryTool({
    name: 'query_sleep_records',
    label: '查询睡眠记录',
    description: '查询用户的睡眠记录，支持按时间范围筛选。',
    queryFn: (options) => store.query(userId, options),
  });

  return { recordSleep, querySleepRecords };
};
