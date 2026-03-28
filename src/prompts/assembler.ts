import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Store } from '../store';
import type { UserProfile, MemoryRecord, ConversationSummary } from '../store/schema';

/**
 * prompts 目录的根路径
 * 使用 import.meta.dir（Bun 运行时支持）获取当前文件所在目录
 */
const PROMPTS_DIR = import.meta.dir;

/**
 * 读取指定子目录下所有 .md 文件并拼接为单个字符串
 * 按文件名排序确保每次组装的顺序一致
 * @param subDir 子目录名，如 'core'、'capabilities'、'rules'
 * @returns 拼接后的文件内容，目录不存在时返回空字符串
 */
function readPromptDir(subDir: string): string {
  const dirPath = join(PROMPTS_DIR, subDir);
  try {
    // 读取目录下所有 .md 文件，按文件名排序以保证一致的组装顺序
    const files = readdirSync(dirPath)
      .filter(f => f.endsWith('.md'))
      .sort();
    return files.map(f => readFileSync(join(dirPath, f), 'utf-8')).join('\n\n');
  } catch {
    // 目录不存在或无法读取时返回空字符串
    return '';
  }
}

/**
 * 格式化用户档案为可注入的文本
 * 将档案中的 JSON 数组字段（疾病史、过敏史）解析后以可读格式展示
 * @param profile 用户档案对象，可能为 undefined（用户未建档）
 * @returns 格式化后的档案文本
 */
function formatProfile(profile: UserProfile | undefined): string {
  if (!profile) {
    return '## 当前用户档案\n该用户尚未建立个人档案，请在合适时机引导用户完善基本信息。';
  }
  // 解析 JSON 数组字段，将字符串形式的 JSON 数组转为实际数组以便可读展示
  const parsed = {
    ...profile,
    diseases: profile.diseases ? JSON.parse(profile.diseases) : [],
    allergies: profile.allergies ? JSON.parse(profile.allergies) : [],
  };
  return `## 当前用户档案\n${JSON.stringify(parsed, null, 2)}`;
}

/**
 * 格式化时间戳为可读日期字符串
 * 使用中国时区（Asia/Shanghai）进行格式化
 * @param timestamp 毫秒时间戳
 * @returns 格式化的日期字符串，如 "2026/3/28 14:30:00"
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/**
 * 查询并格式化最近各类型健康记录
 * 并行查询 6 种类型记录（身体、饮食、症状、运动、睡眠、饮水），各取最近 5 条
 * 每种类型的查询都带有 catch 兜底，确保单个类型查询失败不影响整体组装
 * @param store Store 实例
 * @param userId 用户 ID
 * @returns 格式化后的最近记录文本，无任何记录时返回空字符串
 */
async function formatRecentRecords(store: Store, userId: string): Promise<string> {
  // 并行查询各类型记录，每种取最近 5 条
  const [body, diet, symptom, exercise, sleep, water] = await Promise.all([
    store.body.query(userId, { limit: 5 }).catch(() => []),
    store.diet.query(userId, { limit: 5 }).catch(() => []),
    store.symptom.query(userId, { limit: 5 }).catch(() => []),
    store.exercise.query(userId, { limit: 5 }).catch(() => []),
    store.sleep.query(userId, { limit: 5 }).catch(() => []),
    store.water.query(userId, { limit: 5 }).catch(() => []),
  ]);

  const sections: string[] = [];

  // 格式化身体数据记录（体重、体脂率、BMI）
  if (body.length > 0) {
    sections.push('### 身体数据\n' + body.map(r =>
      `- ${formatDate(r.timestamp)}: 体重${r.weight ? r.weight + 'kg' : '-'} ${r.bodyFat ? '体脂' + r.bodyFat + '%' : ''} ${r.bmi ? 'BMI ' + r.bmi : ''}`
    ).join('\n'));
  }

  // 格式化饮食记录（食物名称、热量、餐次）
  if (diet.length > 0) {
    sections.push('### 饮食记录\n' + diet.map(r =>
      `- ${formatDate(r.timestamp)}: ${r.food} ${r.calories ? r.calories + 'kcal' : ''} ${r.mealType ? '(' + r.mealType + ')' : ''}`
    ).join('\n'));
  }

  // 格式化症状记录（描述、严重程度、身体部位、是否已解决）
  if (symptom.length > 0) {
    sections.push('### 症状记录\n' + symptom.map(r =>
      `- ${formatDate(r.timestamp)}: ${r.description}${r.severity ? ' 严重程度' + r.severity + '/10' : ''}${r.bodyPart ? ' (' + r.bodyPart + ')' : ''}${r.resolvedAt ? ' [已解决]' : ''}`
    ).join('\n'));
  }

  // 格式化运动记录（运动类型、时长、消耗热量）
  if (exercise.length > 0) {
    sections.push('### 运动记录\n' + exercise.map(r =>
      `- ${formatDate(r.timestamp)}: ${r.type} ${r.duration ? r.duration + '分钟' : ''} ${r.calories ? '消耗' + r.calories + 'kcal' : ''}`
    ).join('\n'));
  }

  // 格式化睡眠记录（将分钟转换为小时+分钟的更直观格式）
  if (sleep.length > 0) {
    sections.push('### 睡眠记录\n' + sleep.map(r => {
      const hours = r.duration ? Math.floor(r.duration / 60) : 0;
      const mins = r.duration ? r.duration % 60 : 0;
      return `- ${formatDate(r.timestamp)}: ${hours}小时${mins}分钟${r.quality ? ' 质量' + r.quality + '/5' : ''}`;
    }).join('\n'));
  }

  // 格式化饮水记录（饮水量）
  if (water.length > 0) {
    sections.push('### 饮水记录\n' + water.map(r =>
      `- ${formatDate(r.timestamp)}: ${r.amount}ml`
    ).join('\n'));
  }

  // 所有类型都无记录时返回空字符串
  if (sections.length === 0) return '';
  return '## 最近记录\n\n' + sections.join('\n\n');
}

/**
 * 查询并格式化活跃症状（未解决的）
 * 从最近 50 条症状记录中过滤出 resolvedAt 为 null 的未解决症状
 * 计算症状持续时间并以友好的格式展示，超过 1 天用"天"，否则用"小时"
 * @param store Store 实例
 * @param userId 用户 ID
 * @returns 格式化后的活跃症状文本，无活跃症状时返回空字符串
 */
async function formatActiveConcerns(store: Store, userId: string): Promise<string> {
  const allSymptoms = await store.symptom.query(userId, { limit: 50 }).catch(() => []);
  // 过滤出未解决的症状（resolvedAt 为 null 或 undefined）
  const active = allSymptoms.filter(s => !s.resolvedAt);
  if (active.length === 0) return '';

  return '## 活跃症状（未解决）\n' + active.map(s => {
    // 计算症状持续时间，用于提示 AI 关注长期未解决的症状
    const hoursSince = Math.round((Date.now() - s.timestamp) / (1000 * 60 * 60));
    const daysSince = Math.round(hoursSince / 24);
    return `- [${s.description}]${s.severity ? ' 严重程度 ' + s.severity + '/10' : ''}${s.bodyPart ? ' (' + s.bodyPart + ')' : ''} - ${daysSince > 0 ? daysSince + '天前' : hoursSince + '小时前'}`;
  }).join('\n') + '\n\n注意：如果一个症状超过1天没有新的记录或提及，可以认为该症状可能已经好转，可友好询问确认。';
}

/**
 * 格式化长期记忆为可注入文本
 * 长期记忆是 Agent 从对话中提取的关于用户的重要信息，用于跨会话个性化
 * @param memoriesList 记忆记录数组
 * @returns 格式化后的记忆文本，无记忆时返回空字符串
 */
function formatMemories(memoriesList: MemoryRecord[]): string {
  if (!memoriesList || memoriesList.length === 0) return '';
  return '## 长期记忆\n以下是关于用户的重要信息，请在对话中参考：\n' +
    memoriesList.map(m => `- [${m.category || '未分类'}] ${m.content}`).join('\n');
}

/**
 * 格式化对话摘要（短期记忆）为可注入文本
 * 对话摘要是之前会话的压缩版本，帮助 AI 了解历史对话内容
 * @param summaries 摘要记录数组
 * @returns 格式化后的摘要文本，无摘要时返回空字符串
 */
function formatSummaries(summaries: ConversationSummary[]): string {
  if (!summaries || summaries.length === 0) return '';
  return '## 近期对话摘要\n以下是用户近期对话的总结，帮助你了解之前的交流内容：\n' +
    summaries.map(s => `- ${s.summary}`).join('\n');
}

/**
 * 主组装函数：将静态模板和动态数据拼接为完整的 systemPrompt
 *
 * 组装结构：
 * 1. 静态部分（从文件读取，修改文件后下次调用自动生效，无需重启服务）：
 *    - core/identity.md - 角色定义
 *    - capabilities/*.md - 能力说明
 *    - rules/*.md - 行为规则
 * 2. 动态上下文（每次从数据库查询最新数据）：
 *    - 用户档案（身高、年龄、性别、疾病史等）
 *    - 最近各类型记录（身体、饮食、症状、运动、睡眠、饮水各 5 条）
 *    - 活跃症状（未解决的症状，附带持续时间）
 *    - 长期记忆（Agent 从对话中提取的用户信息）
 *    - 近期对话摘要（最近 5 条会话摘要）
 *
 * @param store Store 实例，用于查询数据库
 * @param userId 用户 ID
 * @returns 完整的 systemPrompt 字符串
 */
export async function assembleSystemPrompt(store: Store, userId: string): Promise<string> {
  const parts: string[] = [];

  // 1. 静态部分（从文件读取，支持热更新，修改 md 文件后下次调用自动生效）
  parts.push(readPromptDir('core'));
  parts.push(readPromptDir('capabilities'));
  parts.push(readPromptDir('rules'));

  // 2. 动态上下文（每次从数据库查询最新数据）
  // 获取用户档案
  parts.push(formatProfile(await store.profile.get(userId)));

  // 获取最近各类型健康记录
  const recentRecordsText = await formatRecentRecords(store, userId);
  if (recentRecordsText) parts.push(recentRecordsText);

  // 获取活跃症状（未解决的）
  const activeConcernsText = await formatActiveConcerns(store, userId);
  if (activeConcernsText) parts.push(activeConcernsText);

  // 获取长期记忆
  const memoriesList = await store.memory.getAll(userId).catch(() => []);
  const memoriesText = formatMemories(memoriesList);
  if (memoriesText) parts.push(memoriesText);

  // 获取近期对话摘要
  const summariesList = await store.summary.getRecent(userId, 5).catch(() => []);
  const summariesText = formatSummaries(summariesList);
  if (summariesText) parts.push(summariesText);

  // 过滤空字符串并用双换行拼接各部分
  return parts.filter(Boolean).join('\n\n');
}
