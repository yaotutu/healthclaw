import type { Store } from '../store';
import { createWaterTools } from '../features/water/tools';
import { createBodyTools } from '../features/body/tools';
import { createSleepTools } from '../features/sleep/tools';
import { createExerciseTools } from '../features/exercise/tools';
import { createObservationTools } from '../features/observation/tools';
import { createSymptomTools } from '../features/symptom/tools';
import { createDietTools } from '../features/diet/tools';
import { createMedicationTools } from '../features/medication/tools';
import { createChronicTools } from '../features/chronic/tools';
import { createMemoryTools } from '../features/memory/tools';
import { createProfileTools } from '../features/profile/tools';
import { createCronTools } from '../cron/tools';
import type { CronService } from '../cron/service';
import { createHeartbeatTools } from '../features/heartbeat/tools';

// ==================== 记录工具参数 Schema ====================

// ==================== 工具创建函数 ====================

/**
 * 创建 Agent 工具集
 * 根据传入的 Store 实例和用户 ID，创建所有可用的 Agent 工具
 * 遵循原则：工具只提供数据，所有决策由 AI 完成
 * @param store 数据存储实例，提供各类型健康记录的数据操作
 * @param userId 当前用户 ID，用于数据隔离
 * @param channel 当前通道名称，用于定时任务推送
 * @param cronService 可选的定时任务服务实例
 * @returns 包含所有 Agent 工具的对象
 */
export const createTools = (
  store: Store,
  userId: string,
  channel: string = 'websocket',
  cronService?: CronService
) => {
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

  // 慢性病工具已迁移至 features/chronic/tools.ts
  const chronicTools = createChronicTools(store.chronic, userId);

  // 记忆工具已迁移至 features/memory/tools.ts
  const memoryTools = createMemoryTools(store.memory, userId);

  /**
   * 记录健康观察工具
   * 记录用户的非结构化健康观察，如"最近睡眠不好"、"感觉压力大"等
   */
  // 健康观察工具已迁移至 features/observation/tools.ts
  const observationTools = createObservationTools(store.observation, userId);

  // 档案工具已迁移至 features/profile/tools.ts
  const profileTools = createProfileTools(store.profile, userId);

  // 定时任务工具（仅在 cronService 可用时创建）
  const cronTools = cronService ? createCronTools(cronService, userId, channel) : null;

  // 心跳任务管理工具
  const heartbeatTools = createHeartbeatTools(store.heartbeatTask, userId);

  // ==================== 查询工具 ====================
  // 6 个标准查询工具使用 createQueryTool 工厂函数生成，消除重复代码
  // 每个 queryFn 通过箭头函数绑定 userId，只需传入 options

  // 查询运动记录已迁移至 features/exercise/tools.ts

  // 查询睡眠记录已迁移至 features/sleep/tools.ts

  // 查询饮水记录已迁移至 features/water/tools.ts

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
    recordChronicCondition: chronicTools.recordChronicCondition,
    updateChronicCondition: chronicTools.updateChronicCondition,
    queryChronicConditions: chronicTools.queryChronicConditions,
    deactivateChronicCondition: chronicTools.deactivateChronicCondition,
    recordObservation: observationTools.recordObservation,
    queryObservations: observationTools.queryObservations,
    getProfile: profileTools.getProfile,
    updateProfile: profileTools.updateProfile,
    queryBodyRecords: bodyTools.queryBodyRecords,
    queryDietRecords: dietTools.queryDietRecords,
    querySymptomRecords: symptomTools.querySymptomRecords,
    queryExerciseRecords: exerciseTools.queryExerciseRecords,
    querySleepRecords: sleepTools.querySleepRecords,
    queryWaterRecords: waterTools.queryWaterRecords,
    resolveSymptom: symptomTools.resolveSymptom,
    saveMemory: memoryTools.saveMemory,
    queryMemories: memoryTools.queryMemories,
    deleteMemory: memoryTools.deleteMemory,
    // 定时任务工具
    ...(cronTools ? {
      scheduleCron: cronTools.scheduleCron,
      listCronJobs: cronTools.listCronJobs,
      removeCronJob: cronTools.removeCronJob,
    } : {}),
    // 心跳任务工具
    addHeartbeatTask: heartbeatTools.addHeartbeatTask,
    listHeartbeatTasks: heartbeatTools.listHeartbeatTasks,
    removeHeartbeatTask: heartbeatTools.removeHeartbeatTask,
  };
};
