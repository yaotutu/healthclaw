import type { Store } from '../store';
import { createBodyTools, createBodySimpleQuery } from '../features/body/tools';
import { createDietTools, createDietSimpleQuery } from '../features/diet/tools';
import { createSleepTools, createSleepSimpleQuery } from '../features/sleep/tools';
import { createExerciseTools, createExerciseSimpleQuery } from '../features/exercise/tools';
import { createWaterTools, createWaterSimpleQuery } from '../features/water/tools';
import { createSymptomTools, createSymptomSimpleQuery } from '../features/symptom/tools';
import { createMedicationTools, createMedicationSimpleQuery } from '../features/medication/tools';
import { createChronicTools, createChronicSimpleQuery } from '../features/chronic/tools';
import { createObservationTools, createObservationSimpleQuery } from '../features/observation/tools';
import { createMemoryTools } from '../features/memory/tools';
import { createProfileTools } from '../features/profile/tools';
import { createHeartbeatTools, createHeartbeatSimpleQuery } from '../features/heartbeat/tools';
import { createCronTools, createCronSimpleQuery } from '../cron/tools';
import type { CronService } from '../cron/service';
import { createSkillTool } from './skill-tool';
import type { AgentTool } from '@mariozechner/pi-agent-core';

/**
 * 创建常驻工具（无条件常驻 + opt-in 极简查询）
 *
 * 常驻工具包含三类：
 * 1. load_skill：LLM 通过此工具按需加载功能模块的详细说明和完整工具
 * 2. 跨功能常驻工具：profile（用户档案）、memory（长期记忆），这两个功能没有"写入"操作，
 *    只有 get/save，始终可用，不需要按需加载
 * 3. 各功能域 opt-in 极简查询工具：每个功能模块提供一个无参数的极简查询工具，
 *    LLM 先调用极简查询判断是否需要完整工具，再通过 load_skill 按需加载
 *
 * @param store Store 实例，提供各功能模块的数据存取
 * @param userId 用户 ID
 * @param channel 通道名称（如 'websocket'、'qq'）
 * @param cronService 定时任务服务实例，可选（无则不注册 cron 相关工具）
 * @param toolsArray 工具数组引用，供 load_skill 动态 push 新工具到 Agent 的工具集
 * @returns 常驻工具数组
 */
export const createCommonTools = (
  store: Store,
  userId: string,
  channel: string,
  cronService: CronService | undefined,
  toolsArray: AgentTool[]
): AgentTool[] => {
  const tools: any[] = [
    // load_skill 工具（需要 toolsArray 引用来动态注入 skill 工具）
    createSkillTool(toolsArray, store, userId, channel, cronService),
    // 跨功能常驻工具（profile、memory）
    ...Object.values(createProfileTools(store.profile, userId)),
    ...Object.values(createMemoryTools(store.memory, userId)),
    // 各功能域 opt-in 极简查询工具（无参数，token 极低）
    // 这些工具让 LLM 可以快速查看最近记录，判断是否需要加载完整 skill
    createBodySimpleQuery(store.body, userId),
    createDietSimpleQuery(store.diet, userId),
    createSleepSimpleQuery(store.sleep, userId),
    createExerciseSimpleQuery(store.exercise, userId),
    createWaterSimpleQuery(store.water, userId),
    createSymptomSimpleQuery(store.symptom, userId),
    createMedicationSimpleQuery(store.medication, userId),
    createChronicSimpleQuery(store.chronic, userId),
    createObservationSimpleQuery(store.observation, userId),
    createHeartbeatSimpleQuery(store.heartbeatTask, userId),
    // cron 条件注册：无 cronService 时不注册
    ...(cronService ? [createCronSimpleQuery(cronService, userId)] : []),
  ];
  return tools.filter(Boolean);
};

/**
 * 获取指定 skill 的完整工具集（query + write，带完整参数）
 *
 * 当 LLM 调用 load_skill 加载某个功能模块时，需要动态注入该模块的完整工具到 Agent 的工具集。
 * 此函数根据 skill 名称返回对应的完整工具数组。
 *
 * 注意：
 * - profile 和 memory 的工具已常驻，不需要 skill 注入，返回空数组
 * - cron 在无 cronService 时返回空数组
 * - 不存在的 skill 返回 null
 *
 * @param skillName skill 名称（如 'diet'、'body'、'symptom' 等）
 * @param store Store 实例
 * @param userId 用户 ID
 * @param channel 通道名称
 * @param cronService 定时任务服务实例
 * @returns 完整工具数组，skill 不存在时返回 null，profile/memory 返回空数组（工具已常驻）
 */
export const getSkillTools = (
  skillName: string,
  store: Store,
  userId: string,
  channel: string,
  cronService: CronService | undefined
): AgentTool[] | null => {
  // 使用 unknown 中转来避免泛型工具类型与 AgentTool<TSchema> 不兼容的问题
  const cast = (v: unknown): AgentTool[] => v as AgentTool[];
  switch (skillName) {
    case 'body':
      return cast(Object.values(createBodyTools(store.body, userId)));
    case 'diet':
      return cast(Object.values(createDietTools(store.diet, userId)));
    case 'sleep':
      return cast(Object.values(createSleepTools(store.sleep, userId)));
    case 'exercise':
      return cast(Object.values(createExerciseTools(store.exercise, userId)));
    case 'water':
      return cast(Object.values(createWaterTools(store.water, userId)));
    case 'symptom':
      return cast(Object.values(createSymptomTools(store.symptom, userId)));
    case 'medication':
      return cast(Object.values(createMedicationTools(store.medication, userId)));
    case 'chronic':
      return cast(Object.values(createChronicTools(store.chronic, userId)));
    case 'observation':
      return cast(Object.values(createObservationTools(store.observation, userId)));
    case 'heartbeat':
      return cast(Object.values(createHeartbeatTools(store.heartbeatTask, userId)));
    case 'cron':
      return cronService ? cast(Object.values(createCronTools(cronService, userId, channel))) : [];
    // profile 和 memory 工具已常驻，不需要 skill 注入
    case 'profile':
    case 'memory':
      return [];
    default:
      return null;
  }
};
