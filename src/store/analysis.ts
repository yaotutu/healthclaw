import { logger } from '../infrastructure/logger';
import type { Store } from './index';
import type { DietRecord } from './schema';
import type { SymptomRecord } from './schema';

/**
 * 食物-症状关联分析结果
 * 每种食物与症状的关联统计
 */
export interface FoodCorrelation {
  /** 食物名称 */
  food: string;
  /** 总食用次数 */
  totalOccurrences: number;
  /** 出现症状前 2 小时内食用的次数 */
  symptomOccurrences: number;
  /** 关联概率 (symptomOccurrences / totalOccurrences) */
  correlation: number;
  /** 关联的症状描述列表 */
  relatedSymptoms: string[];
}

/**
 * 食物-症状关联分析结果
 */
export interface FoodSymptomCorrelationResult {
  /** 分析是否有效（数据量是否足够） */
  valid: boolean;
  /** 数据不足时的提示信息 */
  message?: string;
  /** 高风险食物（关联概率 >50%） */
  highRisk: FoodCorrelation[];
  /** 中风险食物（关联概率 30%-50%） */
  mediumRisk: FoodCorrelation[];
  /** 安全食物（关联概率 <30%） */
  safe: FoodCorrelation[];
  /** 分析的时间范围（天数） */
  daysAnalyzed: number;
  /** 饮食记录总数 */
  dietRecordCount: number;
  /** 症状记录总数 */
  symptomRecordCount: number;
}

/**
 * 症状频率统计
 */
export interface SymptomFrequency {
  /** 症状描述 */
  description: string;
  /** 出现次数 */
  count: number;
  /** 平均严重程度 */
  avgSeverity: number | null;
}

/**
 * 健康模式分析结果
 */
export interface HealthPatternsResult {
  /** 分析的时间范围（天数） */
  daysAnalyzed: number;
  /** 症状频率统计 */
  symptomFrequencies: SymptomFrequency[];
  /** 症状与睡眠不足的关联（睡眠<6小时后24小时内出现的症状） */
  sleepRelatedSymptoms: SymptomFrequency[];
  /** 症状与运动的关联（运动后24小时内出现的症状） */
  exerciseRelatedSymptoms: SymptomFrequency[];
}

/**
 * 创建分析存储模块
 * 提供食物-症状关联分析和健康模式发现功能
 * @param store Store 实例，用于查询各类型健康记录
 */
export const createAnalysisStore = (store: Store) => {
  /**
   * 分析食物与症状的关联性
   * 使用 2 小时时间窗口匹配：如果症状出现前 2 小时内有某食物的摄入记录，则认为有关联
   * 最少需要 5 条饮食记录和 3 条症状记录才输出有效分析
   * @param userId 用户ID
   * @param days 分析最近多少天的数据，默认 30 天
   * @returns 食物-症状关联分析结果
   */
  const analyzeFoodSymptomCorrelation = async (userId: string, days: number = 30): Promise<FoodSymptomCorrelationResult> => {
    const now = Date.now();
    const startDate = now - days * 24 * 60 * 60 * 1000;

    // 并行查询饮食和症状记录
    const [dietRecords, symptomRecords] = await Promise.all([
      store.diet.query(userId, { startDate, limit: 500 }),
      store.symptom.query(userId, { startDate, limit: 500 }),
    ]);

    // 数据量检查
    if (dietRecords.length < 5 || symptomRecords.length < 3) {
      return {
        valid: false,
        message: `数据量不足（需要至少5条饮食记录和3条症状记录，当前：饮食${dietRecords.length}条，症状${symptomRecords.length}条）`,
        highRisk: [],
        mediumRisk: [],
        safe: [],
        daysAnalyzed: days,
        dietRecordCount: dietRecords.length,
        symptomRecordCount: symptomRecords.length,
      };
    }

    // 时间窗口：2 小时（毫秒）
    const WINDOW_MS = 2 * 60 * 60 * 1000;

    // 按食物名称统计
    const foodStats = new Map<string, { total: number; symptomCount: number; symptoms: string[] }>();

    // 统计每种食物的总食用次数
    for (const diet of dietRecords) {
      const foodName = diet.food;
      if (!foodName) continue;
      if (!foodStats.has(foodName)) {
        foodStats.set(foodName, { total: 0, symptomCount: 0, symptoms: [] });
      }
      foodStats.get(foodName)!.total++;
    }

    // 分析每种食物在症状出现前 2 小时内的出现次数
    for (const symptom of symptomRecords) {
      const symptomTime = symptom.timestamp;
      // 查找症状出现前 2 小时内的饮食记录
      for (const diet of dietRecords) {
        const foodName = diet.food;
        if (!foodName) continue;
        const timeDiff = symptomTime - diet.timestamp;
        // 时间差在 0~2 小时内（症状出现在饮食之后）
        if (timeDiff > 0 && timeDiff <= WINDOW_MS) {
          const stats = foodStats.get(foodName);
          if (stats) {
            stats.symptomCount++;
            stats.symptoms.push(symptom.description);
          }
        }
      }
    }

    // 计算关联概率并分类
    const correlations: FoodCorrelation[] = [];
    for (const [food, stats] of foodStats) {
      correlations.push({
        food,
        totalOccurrences: stats.total,
        symptomOccurrences: stats.symptomCount,
        correlation: stats.total > 0 ? stats.symptomCount / stats.total : 0,
        relatedSymptoms: [...new Set(stats.symptoms)],
      });
    }

    // 按关联概率排序
    correlations.sort((a, b) => b.correlation - a.correlation);

    const highRisk = correlations.filter(c => c.correlation > 0.5);
    const mediumRisk = correlations.filter(c => c.correlation > 0.3 && c.correlation <= 0.5);
    const safe = correlations.filter(c => c.correlation <= 0.3);

    logger.info('[store:analysis] food-symptom correlation userId=%s days=%d foods=%d highRisk=%d mediumRisk=%d',
      userId, days, correlations.length, highRisk.length, mediumRisk.length);

    return {
      valid: true,
      highRisk,
      mediumRisk,
      safe,
      daysAnalyzed: days,
      dietRecordCount: dietRecords.length,
      symptomRecordCount: symptomRecords.length,
    };
  };

  /**
   * 分析健康模式与趋势
   * 统计症状频率，分析症状与睡眠、运动的关联
   * @param userId 用户ID
   * @param days 分析最近多少天的数据，默认 30 天
   * @returns 健康模式分析结果
   */
  const analyzeHealthPatterns = async (userId: string, days: number = 30): Promise<HealthPatternsResult> => {
    const now = Date.now();
    const startDate = now - days * 24 * 60 * 60 * 1000;

    // 并行查询各类记录
    const [symptoms, sleepRecords, exerciseRecords] = await Promise.all([
      store.symptom.query(userId, { startDate, limit: 500 }),
      store.sleep.query(userId, { startDate, limit: 100 }),
      store.exercise.query(userId, { startDate, limit: 100 }),
    ]);

    // 统计症状频率
    const symptomMap = new Map<string, { count: number; totalSeverity: number; severityCount: number }>();
    for (const s of symptoms) {
      const key = s.description;
      if (!symptomMap.has(key)) {
        symptomMap.set(key, { count: 0, totalSeverity: 0, severityCount: 0 });
      }
      const entry = symptomMap.get(key)!;
      entry.count++;
      if (s.severity) {
        entry.totalSeverity += s.severity;
        entry.severityCount++;
      }
    }

    const symptomFrequencies: SymptomFrequency[] = [];
    for (const [desc, data] of symptomMap) {
      symptomFrequencies.push({
        description: desc,
        count: data.count,
        avgSeverity: data.severityCount > 0 ? Math.round(data.totalSeverity / data.severityCount * 10) / 10 : null,
      });
    }
    symptomFrequencies.sort((a, b) => b.count - a.count);

    // 分析症状与睡眠不足的关联
    // 睡眠不足 = 睡眠时长 < 360 分钟（6小时）
    const sleepRelatedSymptomsMap = new Map<string, { count: number; totalSeverity: number; severityCount: number }>();
    for (const sleep of sleepRecords) {
      if (sleep.duration && sleep.duration < 360) {
        // 查找睡眠记录后 24 小时内出现的症状
        const sleepEnd = sleep.wakeTime || sleep.timestamp;
        const next24h = sleepEnd + 24 * 60 * 60 * 1000;
        for (const symptom of symptoms) {
          if (symptom.timestamp > sleepEnd && symptom.timestamp <= next24h) {
            const key = symptom.description;
            if (!sleepRelatedSymptomsMap.has(key)) {
              sleepRelatedSymptomsMap.set(key, { count: 0, totalSeverity: 0, severityCount: 0 });
            }
            const entry = sleepRelatedSymptomsMap.get(key)!;
            entry.count++;
            if (symptom.severity) {
              entry.totalSeverity += symptom.severity;
              entry.severityCount++;
            }
          }
        }
      }
    }

    const sleepRelatedSymptoms: SymptomFrequency[] = [];
    for (const [desc, data] of sleepRelatedSymptomsMap) {
      sleepRelatedSymptoms.push({
        description: desc,
        count: data.count,
        avgSeverity: data.severityCount > 0 ? Math.round(data.totalSeverity / data.severityCount * 10) / 10 : null,
      });
    }
    sleepRelatedSymptoms.sort((a, b) => b.count - a.count);

    // 分析症状与运动的关联
    const exerciseRelatedSymptomsMap = new Map<string, { count: number; totalSeverity: number; severityCount: number }>();
    for (const exercise of exerciseRecords) {
      // 查找运动后 24 小时内出现的症状
      const next24h = exercise.timestamp + 24 * 60 * 60 * 1000;
      for (const symptom of symptoms) {
        if (symptom.timestamp > exercise.timestamp && symptom.timestamp <= next24h) {
          const key = symptom.description;
          if (!exerciseRelatedSymptomsMap.has(key)) {
            exerciseRelatedSymptomsMap.set(key, { count: 0, totalSeverity: 0, severityCount: 0 });
          }
          const entry = exerciseRelatedSymptomsMap.get(key)!;
          entry.count++;
          if (symptom.severity) {
            entry.totalSeverity += symptom.severity;
            entry.severityCount++;
          }
        }
      }
    }

    const exerciseRelatedSymptoms: SymptomFrequency[] = [];
    for (const [desc, data] of exerciseRelatedSymptomsMap) {
      exerciseRelatedSymptoms.push({
        description: desc,
        count: data.count,
        avgSeverity: data.severityCount > 0 ? Math.round(data.totalSeverity / data.severityCount * 10) / 10 : null,
      });
    }
    exerciseRelatedSymptoms.sort((a, b) => b.count - a.count);

    logger.info('[store:analysis] health patterns userId=%s days=%d symptoms=%d',
      userId, days, symptomFrequencies.length);

    return {
      daysAnalyzed: days,
      symptomFrequencies,
      sleepRelatedSymptoms,
      exerciseRelatedSymptoms,
    };
  };

  return { analyzeFoodSymptomCorrelation, analyzeHealthPatterns };
};

/**
 * 分析存储模块类型
 */
export type AnalysisStore = ReturnType<typeof createAnalysisStore>;
