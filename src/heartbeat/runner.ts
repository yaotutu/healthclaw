import { readFileSync } from 'fs';
import { join } from 'path';
import type { Store } from '../store';
import { logger } from '../infrastructure/logger';

/** 心跳任务文件路径 */
const HEARTBEAT_FILE = join(import.meta.dir, 'heartbeat.md');

/**
 * 心跳检查结果
 * 包含需要推送消息的用户ID和消息内容
 */
export interface HeartbeatResult {
  /** 需要推送消息的用户ID */
  userId: string;
  /** 关怀消息内容 */
  message: string;
}

/**
 * SQL 预过滤：检查是否有需要关注的异常数据
 * 三项检查：
 * 1. 最近24小时内是否有睡眠不足4小时(240分钟)的记录
 * 2. 是否超过3天没有体重记录
 * 3. 是否有严重(severity>=8)且未解决的症状
 * 只在有异常时才生成关怀消息，控制成本
 * @param store Store 实例
 * @param userId 用户ID
 * @returns 是否存在异常数据
 */
async function hasAnomalies(store: Store, userId: string): Promise<boolean> {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

  try {
    // 检查1：最近24小时睡眠不足4小时
    const recentSleep = await store.sleep.query(userId, { startDate: oneDayAgo, limit: 5 });
    const poorSleep = recentSleep.some(r => r.duration && r.duration < 240);
    if (poorSleep) return true;

    // 检查2：超过3天没有体重记录
    const recentBody = await store.body.query(userId, { startDate: threeDaysAgo, limit: 1 });
    // 只有当用户之前有过记录（总共有记录）但最近3天没有时才算异常
    const allBody = await store.body.query(userId, { limit: 1 });
    if (allBody.length > 0 && recentBody.length === 0) return true;

    // 检查3：严重且未解决的症状
    const recentSymptoms = await store.symptom.query(userId, { limit: 20 });
    const severeActive = recentSymptoms.some(s => !s.resolvedAt && (s.severity ?? 0) >= 8);
    if (severeActive) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * 读取心跳任务文件
 * 解析 Active Tasks 和 Completed 部分
 * 从 heartbeat.md 文件中提取活跃的任务列表
 * @returns 包含活跃任务字符串数组的对象
 */
function readHeartbeatFile(): { tasks: string[] } {
  try {
    const content = readFileSync(HEARTBEAT_FILE, 'utf-8');
    // 使用正则匹配 "## Active Tasks" 和 "## Completed" 之间的内容
    const activeMatch = content.match(/## Active Tasks\s*\n([\s\S]*?)(?=## Completed|$)/);
    if (!activeMatch) return { tasks: [] };

    // 提取以 "- " 开头的任务条目
    const tasks = activeMatch[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('- '))
      .map(line => line.replace(/^-\s*/, ''));

    return { tasks };
  } catch {
    return { tasks: [] };
  }
}

/**
 * 执行心跳任务
 * 读取任务文件，获取所有用户，检查异常，生成关怀消息
 * 整个流程：
 * 1. 读取 heartbeat.md 获取活跃任务
 * 2. 通过 messages 表获取所有有记录的用户
 * 3. 对每个用户进行异常检测（睡眠不足、久未称重、严重症状）
 * 4. 对有异常的用户生成对应的关怀消息
 * @param store Store 实例
 * @returns 需要推送的消息列表
 */
export async function runHeartbeat(store: Store): Promise<HeartbeatResult[]> {
  // 读取任务文件
  const { tasks } = readHeartbeatFile();
  if (tasks.length === 0) {
    logger.debug('[heartbeat] no active tasks');
    return [];
  }

  // 获取所有有记录的用户ID（通过查询 messages 表获取所有不重复的 user_id）
  const userIdRows = store.sqlite.query('SELECT DISTINCT user_id FROM messages').all() as Array<{ user_id: string }>;
  const userIds = userIdRows.map(r => r.user_id);
  if (userIds.length === 0) return [];

  const results: HeartbeatResult[] = [];

  for (const userId of userIds) {
    try {
      const hasIssue = await hasAnomalies(store, userId);
      if (!hasIssue) continue;

      // 收集用户数据，构造简单的关怀消息
      // 这里不用 LLM，直接生成固定格式的关怀消息，避免成本过高
      const messages: string[] = [];

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

      // 检查睡眠不足
      const recentSleep = await store.sleep.query(userId, { startDate: oneDayAgo, limit: 5 });
      const poorSleep = recentSleep.filter(r => r.duration && r.duration < 240);
      if (poorSleep.length > 0) {
        const hours = Math.round(poorSleep[0].duration! / 60 * 10) / 10;
        messages.push(`注意到你昨晚只睡了${hours}小时，睡眠充足对健康很重要，今晚早点休息吧`);
      }

      // 检查体重记录缺失
      const recentBody = await store.body.query(userId, { startDate: threeDaysAgo, limit: 1 });
      const allBody = await store.body.query(userId, { limit: 1 });
      if (allBody.length > 0 && recentBody.length === 0) {
        messages.push('你已经超过3天没有记录体重了，记得定时记录哦');
      }

      // 检查严重且未解决的症状
      const recentSymptoms = await store.symptom.query(userId, { limit: 20 });
      const severeActive = recentSymptoms.filter(s => !s.resolvedAt && (s.severity ?? 0) >= 8);
      if (severeActive.length > 0) {
        const s = severeActive[0];
        messages.push(`你之前记录的"${s.description}"看起来还比较严重，如果持续不舒服建议尽快就医`);
      }

      // 只有当有实际消息时才加入结果
      if (messages.length > 0) {
        results.push({ userId, message: messages.join('\n') });
      }
    } catch (err) {
      logger.error('[heartbeat] user check failed userId=%s error=%s', userId, (err as Error).message);
    }
  }

  logger.info('[heartbeat] checked users=%d alerts=%d', userIds.length, results.length);
  return results;
}
