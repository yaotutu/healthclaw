/**
 * Skill 按需加载工具
 *
 * LLM 通过功能目录表判断需要哪个 skill，调用 load_skill 获取：
 * 1. 对应功能模块的 prompt.md（详细使用说明）
 * 2. 对应功能模块的完整工具集（动态注入到 tools 数组）
 *
 * 利用 pi-agent-core 特性：运行循环持有 tools 数组引用，
 * push 新工具后下一轮 LLM 调用自动可见。
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Store } from '../store';
import type { CronService } from '../cron/service';
import { getSkillTools } from './tools';

/** load_skill 参数 Schema */
const LoadSkillParamsSchema = Type.Object({
  skill: Type.String({ description: '功能名称，如 diet、body、sleep、symptom 等' }),
});

type LoadSkillParams = typeof LoadSkillParamsSchema;

/**
 * 功能目录表，定义每个 skill 的名称和触发关键词
 * 注入到系统提示词中，供 LLM 判断何时需要 load_skill
 */
const SKILL_CATALOG: Record<string, { keywords: string }> = {
  diet:        { keywords: '吃了、喝了、早餐、午餐、晚餐、加餐、热量' },
  body:        { keywords: '体重、体脂、BMI、胖了、瘦了' },
  sleep:       { keywords: '失眠、早起、晚睡、睡眠质量' },
  symptom:     { keywords: '不舒服、疼痛、过敏' },
  exercise:    { keywords: '跑步、游泳、健身、走路' },
  water:       { keywords: '喝水、几杯水' },
  medication:  { keywords: '吃药、服药' },
  chronic:     { keywords: '慢性病、长期疾病' },
  observation: { keywords: '疲惫、压力大、情绪' },
  heartbeat:   { keywords: '定期提醒、定时检查' },
  cron:        { keywords: '每天提醒、每周报告' },
  profile:     { keywords: '身高、年龄、性别' },
  memory:      { keywords: '记住这个、我的偏好' },
};

/** 功能模块所在目录 */
const FEATURES_DIR = join(dirname(import.meta.dir), 'features');

/** 提示词内容缓存，避免重复读文件 */
const promptCache = new Map<string, string>();

/**
 * 生成功能目录表文本，注入到系统提示词中
 * 每个功能一行：名称 + 触发关键词
 * @returns 格式化后的目录表文本
 */
export function readSkillCatalog(): string {
  const lines = Object.entries(SKILL_CATALOG).map(
    ([name, { keywords }]) => `- ${name}: ${keywords}。load_skill('${name}')`
  );
  return [
    '## 可用功能',
    '',
    '当用户消息涉及以下功能时，先调用 load_skill 加载详细说明，再使用对应工具。',
    '',
    ...lines,
  ].join('\n');
}

/**
 * 创建 load_skill 工具
 * LLM 调用时：
 * 1. 返回对应功能模块的 prompt.md 内容（详细使用说明）
 * 2. 动态注入该功能的完整工具集到 tools 数组
 * @param toolsArray 常驻工具数组的引用，用于动态 push
 * @param store Store 实例
 * @param userId 用户 ID
 * @param channel 通道名称
 * @param cronService 定时任务服务
 */
export const createSkillTool = (
  toolsArray: AgentTool[],
  store: Store,
  userId: string,
  channel: string,
  cronService: CronService | undefined,
): AgentTool<LoadSkillParams> => {
  // 记录已注入的工具名，避免重复 push
  const injectedToolNames = new Set(toolsArray.map(t => t.name));

  return {
    name: 'load_skill',
    label: '加载功能说明',
    description: '加载功能模块的详细使用说明和对应工具。当用户消息涉及某类健康数据时，先加载对应 skill 再操作。',
    parameters: LoadSkillParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const { skill } = params;

      // 检查 skill 是否存在
      if (!SKILL_CATALOG[skill]) {
        const available = Object.keys(SKILL_CATALOG).join(', ');
        return {
          content: [{ type: 'text', text: `未知功能 "${skill}"。可用功能: ${available}` }],
          details: {},
        };
      }

      // 从缓存或文件读取提示词内容
      if (!promptCache.has(skill)) {
        const filePath = join(FEATURES_DIR, skill, 'prompt.md');
        if (!existsSync(filePath)) {
          return {
            content: [{ type: 'text', text: `功能 "${skill}" 的说明文件不存在。` }],
            details: {},
          };
        }
        promptCache.set(skill, readFileSync(filePath, 'utf-8'));
      }
      const prompt = promptCache.get(skill)!;

      // 动态注入完整工具集（去重：按工具名检查）
      const skillTools = getSkillTools(skill, store, userId, channel, cronService);
      if (skillTools && skillTools.length > 0) {
        for (const tool of skillTools) {
          if (!injectedToolNames.has(tool.name)) {
            injectedToolNames.add(tool.name);
            toolsArray.push(tool);
          }
        }
      }

      return {
        content: [{ type: 'text', text: prompt }],
        details: {},
      };
    },
  };
};
