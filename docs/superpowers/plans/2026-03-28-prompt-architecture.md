# 提示词架构重设计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 healthclaw 的提示词系统重构为模块化、动态注入的架构，让大模型主导所有决策。

**Architecture:** 分离式设计——提示词按功能模块组织在 `src/prompts/` 目录，工具定义集中在 `tools.ts`。assembler 每次消息前动态组装 systemPrompt，利用 Agent 的 `setSystemPrompt()` 方法实现动态更新。新增 memories 和 conversation_summaries 表支持长期/短期记忆。

**Tech Stack:** TypeScript, Bun, Drizzle ORM, SQLite, pi-agent-core Agent (setSystemPrompt API)

**当前状态说明：**
- SQL DDL（`store/index.ts` initTables）已使用新字段名
- Store 模块（symptom, exercise, sleep, diet, water）已使用新接口
- tools.ts 的 TypeBox Schema 已使用新字段名
- **但** `schema.ts` 的 Drizzle ORM 定义仍是旧字段名（与 DDL/store 不一致），需修复
- **需要新增：** memories 表、conversation_summaries 表、查询工具、记忆工具、提示词模块化、assembler、心跳机制

---

## 文件结构

### 新建文件
| 文件 | 职责 |
|------|------|
| `src/prompts/core/identity.md` | 角色定义 |
| `src/prompts/capabilities/record-body.md` | 身体数据记录能力说明 |
| `src/prompts/capabilities/record-diet.md` | 饮食记录能力说明 |
| `src/prompts/capabilities/record-symptom.md` | 症状记录能力说明 |
| `src/prompts/capabilities/record-exercise.md` | 运动记录能力说明 |
| `src/prompts/capabilities/record-sleep.md` | 睡眠记录能力说明 |
| `src/prompts/capabilities/record-water.md` | 饮水记录能力说明 |
| `src/prompts/capabilities/query-data.md` | 查询历史数据原则 |
| `src/prompts/capabilities/analysis.md` | 综合分析原则 |
| `src/prompts/rules/response-style.md` | 回复风格规则 |
| `src/prompts/rules/safety.md` | 安全边界规则 |
| `src/prompts/rules/proactivity.md` | 主动关怀规则 |
| `src/prompts/rules/symptom-resolution.md` | 症状判断规则 |
| `src/prompts/rules/medication.md` | 用药建议规则 |
| `src/prompts/assembler.ts` | 提示词组装器（读取静态模板 + 查询动态数据） |
| `src/store/memory.ts` | 长期记忆存储 |
| `src/store/summary.ts` | 对话摘要存储 |
| `src/heartbeat/scheduler.ts` | 心跳调度器 |
| `src/heartbeat/runner.ts` | 心跳任务执行器 |
| `src/heartbeat/heartbeat.md` | 心跳任务文件 |

### 修改文件
| 文件 | 变更 |
|------|------|
| `src/store/schema.ts` | 修复 Drizzle ORM 定义使其与 DDL 一致 + 新增 memories/conversation_summaries 表 |
| `src/store/index.ts` | 新增 memories/conversation_summaries 表创建 SQL + memory/summary store + 新增索引 |
| `src/agent/tools.ts` | 新增 6 个查询工具 + 3 个记忆工具 + 1 个症状解决工具 |
| `src/agent/factory.ts` | 使用 assembler 替代硬编码 prompt |
| `src/agent/prompt.ts` | 删除 |
| `src/agent/index.ts` | 删除 HEALTH_ADVISOR_PROMPT 导出，新增 assembler 导出 |
| `src/channels/handler.ts` | 每次消息前调用 setSystemPrompt 刷新动态上下文 |
| `src/main.ts` | 集成心跳模块 |

---

## Task 1: 修复 schema.ts 并新增表

**Files:**
- Modify: `src/store/schema.ts`

**背景：** 当前 schema.ts 的 Drizzle ORM 定义与 SQL DDL（store/index.ts）不一致。例如 schema.ts 有 `symptom: text('symptom')` 但 DDL 创建的是 `description TEXT`。需要修复使其一致。

- [ ] **Step 1: 修复现有表的 Drizzle 定义**

需要修复的字段映射（Drizzle 列名 → SQL 列名）：

**symptom_records:**
- 删除 `symptom: text('symptom')`, 改为 `description: text('description').notNull()`
- 删除 `trigger: text('trigger')`
- `severity` 改为不带 enum，范围由提示词引导
- 新增 `bodyPart: text('body_part')`
- 新增 `resolvedAt: integer('resolved_at')`
- `relatedType` 改为不带 enum（去掉 `{ enum: [...] }`）

**exercise_records:**
- `exerciseType: text('exercise_type')` → `type: text('type').notNull()`
- `duration: real('duration')` → `duration: integer('duration').notNull()`（改为分钟）
- `caloriesBurned: real('calories_burned')` → `calories: integer('calories')`
- 删除 `intensity: text('intensity', { enum: [...] })`
- 新增 `heartRateAvg: integer('heart_rate_avg')`
- 新增 `heartRateMax: integer('heart_rate_max')`
- 新增 `distance: real('distance')`

**sleep_records:**
- `duration: real('duration')` → `duration: integer('duration').notNull()`（改为分钟）
- 新增 `deepSleep: integer('deep_sleep')`

**diet_records:**
- 新增 `sodium: real('sodium')`
- `mealType` 去掉 enum 约束

**water_records:**
- 删除 `unit: text('unit')`
- `amount: real('amount')` → `amount: integer('amount').notNull()`（统一 ml）

- [ ] **Step 2: 新增 memories 表和 conversation_summaries 表**

在 schema.ts 末尾新增两个表定义，需要导入 `index`：
```typescript
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
```

memories 表：
```typescript
export const memories = sqliteTable('memories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  content: text('content').notNull(),
  category: text('category'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('memories_user_id_idx').on(table.userId),
]);
```

conversation_summaries 表：
```typescript
export const conversationSummaries = sqliteTable('conversation_summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  summary: text('summary').notNull(),
  messageCount: integer('message_count'),
  startTimestamp: integer('start_timestamp').notNull(),
  endTimestamp: integer('end_timestamp').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('summaries_user_id_idx').on(table.userId),
]);
```

新增对应的类型导出：
```typescript
export type MemoryRecord = typeof memories.$inferSelect;
export type NewMemoryRecord = typeof memories.$inferInsert;
export type ConversationSummary = typeof conversationSummaries.$inferSelect;
export type NewConversationSummary = typeof conversationSummaries.$inferInsert;
```

- [ ] **Step 3: 运行 typecheck**

Run: `bun run typecheck`
Expected: store 模块会有类型错误（因为 schema 字段名变了），这是预期的，Task 2 修复

- [ ] **Step 4: Commit**

```bash
git add src/store/schema.ts
git commit -m "fix(db): align Drizzle schema with SQL DDL, add memories and summaries tables"
```

---

## Task 2: 新增 memory 和 summary store + 更新 store/index.ts

**Files:**
- Create: `src/store/memory.ts`
- Create: `src/store/summary.ts`
- Modify: `src/store/index.ts`

**注意：** 现有 store 模块（symptom, exercise, sleep, diet, water）的 TypeScript 接口已经正确（与 store/index.ts 的 DDL 一致），不需要修改。只有 schema.ts 的 Drizzle ORM 定义需要修复（Task 1 已完成）。

- [ ] **Step 1: 创建 memory.ts**

```typescript
import { eq, desc, and } from 'drizzle-orm';
import type { Db } from './db';
import { memories, type MemoryRecord, type NewMemoryRecord } from './schema';

export interface MemoryRecordData {
  content: string;
  category?: string;  // feedback / preference / fact
}

export const createMemoryStore = (db: Db) => {
  const save = async (userId: string, data: MemoryRecordData): Promise<MemoryRecord> => {
    const result = await db.insert(memories).values({
      userId,
      content: data.content,
      category: data.category,
      createdAt: Date.now(),
    }).returning();
    return result[0];
  };

  const query = async (userId: string, options?: { category?: string; limit?: number }): Promise<MemoryRecord[]> => {
    // 按用户过滤，可选按 category 过滤，按时间倒序
  };

  const remove = async (userId: string, memoryId: number): Promise<boolean> => {
    // 删除指定记忆
  };

  const getAll = async (userId: string): Promise<MemoryRecord[]> => {
    // 获取用户所有记忆，用于上下文注入
  };

  return { save, query, remove, getAll };
};

export type MemoryStore = ReturnType<typeof createMemoryStore>;
```

- [ ] **Step 2: 创建 summary.ts**

```typescript
import { eq, desc, gte } from 'drizzle-orm';
import type { Db } from './db';
import { conversationSummaries, type ConversationSummary, type NewConversationSummary } from './schema';

export interface SummaryRecordData {
  summary: string;
  messageCount: number;
  startTimestamp: number;
  endTimestamp: number;
}

export const createSummaryStore = (db: Db) => {
  const save = async (userId: string, data: SummaryRecordData): Promise<ConversationSummary> => {
    const result = await db.insert(conversationSummaries).values({
      userId,
      summary: data.summary,
      messageCount: data.messageCount,
      startTimestamp: data.startTimestamp,
      endTimestamp: data.endTimestamp,
      createdAt: Date.now(),
    }).returning();
    return result[0];
  };

  const getRecent = async (userId: string, limit: number = 5): Promise<ConversationSummary[]> => {
    // 获取最近 30 天内的摘要，按时间倒序，最多 limit 条
  };

  return { save, getRecent };
};

export type SummaryStore = ReturnType<typeof createSummaryStore>;
```

- [ ] **Step 3: 更新 store/index.ts**

1. 导入新模块：
```typescript
import { createMemoryStore, type MemoryStore } from './memory';
import { createSummaryStore, type SummaryStore } from './summary';
import { memories, conversationSummaries } from './schema';
```

2. Store 类新增属性：
```typescript
readonly memory: MemoryStore;
readonly summary: SummaryStore;
```

3. 构造函数中初始化：
```typescript
this.memory = createMemoryStore(this.db);
this.summary = createSummaryStore(this.db);
```

4. initTables() 中新增两个表的 CREATE TABLE 和索引：
```sql
CREATE TABLE IF NOT EXISTS memories (...)
CREATE TABLE IF NOT EXISTS conversation_summaries (...)
CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories(user_id)
CREATE INDEX IF NOT EXISTS summaries_user_id_idx ON conversation_summaries(user_id)
```

5. 删除旧的 `migrateOldData()` 方法和 `safeAlter` 中的 metadata 列（已包含在 DDL 中）

6. 更新导出列表

- [ ] **Step 4: 删除旧数据库文件**

Run: `rm -f ./workspace/healthclaw.db`

- [ ] **Step 5: 运行 typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/store/
git commit -m "feat(store): add memory and summary stores, clean up migration code"
```

---

## Task 3: 创建模块化提示词文件

**Files:**
- Create: `src/prompts/core/identity.md`
- Create: `src/prompts/capabilities/*.md`（8个文件）
- Create: `src/prompts/rules/*.md`（5个文件）

**注意：** 所有提示词文件放在 `src/prompts/` 下（与源码同级），assembler 通过 `import.meta.dir`（Bun 运行时）解析路径。

- [ ] **Step 1: 创建 `src/prompts/core/identity.md`**

角色定义，简洁明了：
```markdown
你是用户的私人健康顾问和私人医生，专注于日常健康管理。

## 你的定位
- 你不是通用 AI 助手，你专注于健康领域
- 你主动关注用户的健康状况，像真正的私人医生一样
- 你给出的建议应该基于用户的实际数据，而不是通用建议

## 工作方式
- 自然对话，像朋友一样交流
- 根据上下文决定是否需要追问更多信息
- 主动识别用户消息中的健康信息并记录
- 综合分析时，结合用户的档案、历史数据和当前状况
```

- [ ] **Step 2: 创建 capabilities 目录下的 8 个文件**

每个文件包含：能力描述、何时使用、对应工具名称和参数、注意事项

- `record-body.md` - 身体数据（record_body: weight, bodyFat, bmi）
- `record-diet.md` - 饮食记录（record_diet: food, calories, protein, carbs, fat, sodium, mealType）
- `record-symptom.md` - 症状记录（record_symptom: description, severity 1-10, bodyPart, relatedType/relatedId）
- `record-exercise.md` - 运动记录（record_exercise: type, duration 分钟, calories, heartRateAvg/Max, distance km）
- `record-sleep.md` - 睡眠记录（record_sleep: duration 分钟, quality 1-5, bedTime/wakeTime 时间戳, deepSleep 分钟）
- `record-water.md` - 饮水记录（record_water: amount ml）
- `query-data.md` - 查询历史数据原则（query_*_records 工具，主动查询，返回原始数据自行分析）
- `analysis.md` - 综合分析原则（结合档案+历史+当前，个性化建议，主动关联分析）

- [ ] **Step 3: 创建 rules 目录下的 5 个文件**

- `response-style.md` - 简洁友好、自然对话、根据上下文决定追问深度
- `safety.md` - 急症立即就医x3、不提供诊断、建议就医
- `proactivity.md` - 提到一段时间问题时主动查询历史、结合档案分析、严重症状关怀
- `symptom-resolution.md` - 超过1天无新记录=可能已好、友好询问确认、resolve_symptom 工具
- `medication.md` - 只做建议不推荐具体药物、提醒联系医生核实

- [ ] **Step 4: Commit**

```bash
git add src/prompts/
git commit -m "feat(prompts): add modular prompt files for capabilities and rules"
```

---

## Task 4: 新增工具（查询 + 记忆 + 症状解决）

**Files:**
- Modify: `src/agent/tools.ts`

**注意：** 现有记录工具的 TypeBox Schema 和 execute 函数已经正确（字段名已更新）。只需新增工具。

- [ ] **Step 1: 新增通用查询参数 Schema 和 6 个查询工具**

在 tools.ts 中新增：

```typescript
// 通用查询参数
const QueryRecordsParamsSchema = Type.Object({
  startTime: Type.Optional(Type.Number({ description: '起始时间戳（毫秒）' })),
  endTime: Type.Optional(Type.Number({ description: '结束时间戳（毫秒）' })),
  limit: Type.Optional(Type.Number({ description: '返回数量限制，默认10' })),
});
```

新增 6 个查询工具，每个调用对应 store 的 `query()` 方法：
- `query_body_records` → `store.body.query(userId, options)`
- `query_diet_records` → `store.diet.query(userId, options)`
- `query_symptom_records` → `store.symptom.query(userId, options)`
- `query_exercise_records` → `store.exercise.query(userId, options)`
- `query_sleep_records` → `store.sleep.query(userId, options)`
- `query_water_records` → `store.water.query(userId, options)`

返回格式统一：
```typescript
return {
  content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
};
```

- [ ] **Step 2: 新增症状解决工具**

```typescript
const ResolveSymptomParamsSchema = Type.Object({
  symptomId: Type.Number({ description: '症状记录ID' }),
});

const resolveSymptom: AgentTool<typeof ResolveSymptomParamsSchema> = {
  name: 'resolve_symptom',
  label: '标记症状已解决',
  description: '将指定症状标记为已解决。',
  parameters: ResolveSymptomParamsSchema,
  execute: async (_toolCallId, params, _signal) => {
    const record = await store.symptom.resolve(userId, params.symptomId);
    return {
      content: [{ type: 'text', text: `已标记症状为已解决: ${record.description}` }],
    };
  },
};
```

- [ ] **Step 3: 新增记忆工具**

3 个工具：`save_memory`、`query_memories`、`delete_memory`

Schema：
```typescript
const SaveMemoryParamsSchema = Type.Object({
  content: Type.String({ description: '记忆内容，如用户偏好、反馈或重要事实' }),
  category: Type.Optional(Type.String({ description: '分类：feedback(反馈)/preference(偏好)/fact(事实)' })),
});

const QueryMemoriesParamsSchema = Type.Object({
  category: Type.Optional(Type.String({ description: '按分类过滤' })),
  limit: Type.Optional(Type.Number({ description: '返回数量限制，默认20' })),
});

const DeleteMemoryParamsSchema = Type.Object({
  memoryId: Type.Number({ description: '记忆ID' }),
});
```

execute 分别调用 `store.memory.save()`、`store.memory.query()`、`store.memory.remove()`

- [ ] **Step 4: 更新 createTools 返回值**

返回对象新增所有新工具（共 10 个新工具）。

- [ ] **Step 5: 运行 typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/agent/tools.ts
git commit -m "feat(agent): add query, memory, and resolve_symptom tools"
```

---

## Task 5: 创建提示词组装器

**Files:**
- Create: `src/prompts/assembler.ts`

- [ ] **Step 1: 实现 assembler.ts**

```typescript
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Store } from '../store';

// 获取 prompts 目录的根路径（使用 import.meta.dir，Bun 运行时支持）
const PROMPTS_DIR = import.meta.dir;

/**
 * 读取指定子目录下所有 .md 文件并拼接
 * 按文件名排序确保顺序一致
 */
function readPromptDir(subDir: string): string {
  const dirPath = join(PROMPTS_DIR, subDir);
  try {
    const files = readdirSync(dirPath)
      .filter(f => f.endsWith('.md'))
      .sort();
    return files.map(f => readFileSync(join(dirPath, f), 'utf-8')).join('\n\n');
  } catch {
    return '';
  }
}

/**
 * 格式化用户档案
 */
function formatProfile(profile: any): string {
  if (!profile) {
    return '## 当前用户档案\n该用户尚未建立个人档案，请在合适时机引导用户完善基本信息。';
  }
  const parsed = {
    ...profile,
    diseases: profile.diseases ? JSON.parse(profile.diseases) : [],
    allergies: profile.allergies ? JSON.parse(profile.allergies) : [],
  };
  return `## 当前用户档案\n${JSON.stringify(parsed, null, 2)}`;
}

/**
 * 查询最近各类型记录
 */
async function formatRecentRecords(store: Store, userId: string): Promise<string> {
  // 并行查询各类型最近 5 条记录
  const [body, diet, symptom, exercise, sleep, water] = await Promise.all([
    store.body.query(userId, { limit: 5 }),
    store.diet.query(userId, { limit: 5 }),
    store.symptom.query(userId, { limit: 5 }),
    store.exercise.query(userId, { limit: 5 }),
    store.sleep.query(userId, { limit: 5 }),
    store.water.query(userId, { limit: 5 }),
  ]);
  // 格式化为可读文本
  // ...
  return '## 最近记录\n...';
}

/**
 * 查询活跃症状（未解决的）
 */
async function formatActiveConcerns(store: Store, userId: string): Promise<string> {
  // 查询所有症状记录，在 JS 中过滤 resolvedAt 为 null 的
  const allSymptoms = await store.symptom.query(userId, { limit: 50 });
  const active = allSymptoms.filter(s => !s.resolvedAt);
  if (active.length === 0) return '';
  // 格式化
  return '## 活跃症状（未解决）\n...';
}

/**
 * 格式化长期记忆
 */
function formatMemories(memories: any[]): string {
  if (memories.length === 0) return '';
  return '## 长期记忆\n' + memories.map(m => `- [${m.category || '未分类'}] ${m.content}`).join('\n');
}

/**
 * 格式化对话摘要（短期记忆）
 */
function formatSummaries(summaries: any[]): string {
  if (summaries.length === 0) return '';
  return '## 近期对话摘要\n' + summaries.map(s => s.summary).join('\n');
}

/**
 * 主组装函数：将静态模板和动态数据拼接为完整的 systemPrompt
 * 每次用户消息时调用，确保动态数据是最新的
 */
export async function assembleSystemPrompt(store: Store, userId: string): Promise<string> {
  const parts: string[] = [];

  // 1. 静态部分（从文件读取，修改文件后下次调用自动生效）
  parts.push(readPromptDir('core'));
  parts.push(readPromptDir('capabilities'));
  parts.push(readPromptDir('rules'));

  // 2. 动态上下文（每次从数据库查询）
  const profile = await store.profile.get(userId);
  parts.push(formatProfile(profile));

  const recentRecords = await formatRecentRecords(store, userId);
  parts.push(recentRecords);

  const activeConcerns = await formatActiveConcerns(store, userId);
  if (activeConcerns) parts.push(activeConcerns);

  const memories = await store.memory.getAll(userId);
  const memoriesText = formatMemories(memories);
  if (memoriesText) parts.push(memoriesText);

  const summaries = await store.summary.getRecent(userId, 5);
  const summariesText = formatSummaries(summaries);
  if (summariesText) parts.push(summariesText);

  return parts.filter(Boolean).join('\n\n');
}
```

**性能说明：** 每次消息会执行 5+ 次 DB 查询（profile + 6 类最近记录 + 活跃症状 + 记忆 + 摘要）。SQLite 本地查询延迟 < 1ms，总延迟可控。如果未来成为瓶颈，可添加内存缓存。

- [ ] **Step 2: 运行 typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/prompts/assembler.ts
git commit -m "feat(prompts): add assembler for dynamic prompt composition"
```

---

## Task 6: 重构 Agent 工厂和消息处理

**Files:**
- Modify: `src/agent/factory.ts`
- Modify: `src/agent/index.ts`
- Modify: `src/channels/handler.ts`
- Delete: `src/agent/prompt.ts`

- [ ] **Step 1: 重构 factory.ts**

1. 删除 `import { HEALTH_ADVISOR_PROMPT } from './prompt'`
2. 新增 `import { assembleSystemPrompt } from '../prompts/assembler'`
3. 删除手动查询 profile 拼接 prompt 的逻辑
4. 使用 `assembleSystemPrompt(store, userId)` 生成完整 systemPrompt
5. toolList 新增所有新工具（查询 6 + 症状解决 1 + 记忆 3 = 10 个新工具）

完整工具列表（18 个）：
```typescript
const toolList = [
  // 记录工具 (6)
  tools.recordBody, tools.recordDiet, tools.recordSymptom,
  tools.recordExercise, tools.recordSleep, tools.recordWater,
  // 档案工具 (2)
  tools.getProfile, tools.updateProfile,
  // 查询工具 (6)
  tools.queryBodyRecords, tools.queryDietRecords, tools.querySymptomRecords,
  tools.queryExerciseRecords, tools.querySleepRecords, tools.queryWaterRecords,
  // 症状解决 (1)
  tools.resolveSymptom,
  // 记忆工具 (3)
  tools.saveMemory, tools.queryMemories, tools.deleteMemory,
];
```

- [ ] **Step 2: 更新 handler.ts**

在 `createMessageHandler` 中，每次用户消息处理前刷新 systemPrompt：

```typescript
// 在 session.agent.prompt() 之前添加：
const updatedPrompt = await assembleSystemPrompt(store, userId);
session.agent.setSystemPrompt(updatedPrompt);
```

需要导入 assembler。handler.ts 当前通过闭包获取 store，直接传入即可。

- [ ] **Step 3: 更新 agent/index.ts**

删除 `export { HEALTH_ADVISOR_PROMPT } from './prompt'`，新增：
```typescript
export { assembleSystemPrompt } from '../prompts/assembler';
```

- [ ] **Step 4: 删除 prompt.ts**

Run: `rm src/agent/prompt.ts`

- [ ] **Step 5: 运行 typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: 启动服务验证**

Run: `bun run server`
Expected: 服务正常启动，无报错，日志显示 tools=18

- [ ] **Step 7: Commit**

```bash
git add src/agent/ src/channels/ src/prompts/
git rm src/agent/prompt.ts
git commit -m "refactor(agent): use assembler for dynamic prompt, per-message context refresh"
```

---

## Task 7: 心跳机制

**Files:**
- Create: `src/heartbeat/heartbeat.md`
- Create: `src/heartbeat/runner.ts`
- Create: `src/heartbeat/scheduler.ts`
- Create: `src/heartbeat/index.ts`
- Modify: `src/main.ts`

**设计决策：** 心跳推送消息通过一个注册机制路由到正确的通道。handler 在创建时注册 `sendToUser(userId, message)` 回调，心跳模块调用此回调。

- [ ] **Step 1: 创建 heartbeat.md**

```markdown
# Heartbeat Tasks

This file is checked every 15 minutes by healthclaw.

## Active Tasks
- 检查所有用户，发现昨晚睡眠不足4小时的，主动发消息关心
- 检查是否有用户超过3天没有记录体重，提醒记录
- 发现 severity >= 8 且超过2天无新记录的症状，建议就医

## Completed
<!-- Move completed tasks here or delete them -->
```

- [ ] **Step 2: 创建 runner.ts**

runner 负责：
1. 读取 heartbeat.md
2. SQL 预过滤检查是否有异常数据（睡眠<4h、3天未记录体重、严重未解决症状）
3. 如果有异常，构造 prompt 调用 LLM 生成关怀消息
4. 返回消息列表

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Store } from '../store';
import { getModel, streamSimple } from '@mariozechner/pi-ai';

const HEARTBEAT_FILE = join(import.meta.dir, 'heartbeat.md');

export interface HeartbeatResult {
  userId: string;
  message: string;
}

/**
 * SQL 预过滤：检查是否有需要关注的异常数据
 * 只在有异常时才调用 LLM，控制成本
 */
async function hasAnomalies(store: Store, userId: string): Promise<boolean> {
  // 检查3项：睡眠<4h、3天未记录体重、严重未解决症状
  // 用 SQLite 原始查询（store.sqlite.query）
  // 返回 true 如果有任何异常
}

export async function runHeartbeat(store: Store): Promise<HeartbeatResult[]> {
  // 1. 读取 heartbeat.md，如果没有 Active Tasks 则跳过
  // 2. 获取所有有记录的用户列表
  // 3. 对每个用户：
  //    a. hasAnomalies() 检查是否有异常
  //    b. 如果有异常，收集用户数据，构造 prompt 调用 LLM
  //    c. LLM 返回关怀消息
  // 4. 返回消息列表
}
```

**错误处理：** 如果 LLM 调用失败，记录日志跳过该用户，不阻塞其他用户。

- [ ] **Step 3: 创建 scheduler.ts**

```typescript
import type { Store } from '../store';
import { runHeartbeat, type HeartbeatResult } from './runner';
import { logger } from '../infrastructure/logger';

export interface HeartbeatOptions {
  store: Store;
  intervalMs: number;
  sendMessage: (userId: string, message: string) => Promise<void>;
}

export function startHeartbeatScheduler(options: HeartbeatOptions): { stop: () => void } {
  const { store, intervalMs, sendMessage } = options;

  const tick = async () => {
    try {
      logger.info('[heartbeat] tick');
      const results = await runHeartbeat(store);
      for (const result of results) {
        try {
          await sendMessage(result.userId, result.message);
          logger.info('[heartbeat] sent userId=%s', result.userId);
        } catch (err) {
          logger.error('[heartbeat] send failed userId=%s error=%s', result.userId, (err as Error).message);
        }
      }
    } catch (err) {
      logger.error('[heartbeat] error=%s', (err as Error).message);
    }
  };

  const timer = setInterval(tick, intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
      logger.info('[heartbeat] stopped');
    },
  };
}
```

- [ ] **Step 4: 创建 index.ts**

```typescript
export { startHeartbeatScheduler, type HeartbeatOptions } from './scheduler';
```

- [ ] **Step 5: 集成到 main.ts**

1. 导入心跳模块
2. 定义 `sendToUser` 回调函数：
   - 将消息存入 `messages` 表（作为 assistant 消息）
   - 如果用户有活跃 WebSocket 连接，推送消息
3. 服务启动后初始化心跳调度器
4. 关闭时停止心跳

```typescript
import { startHeartbeatScheduler } from './heartbeat';

// 在服务启动后：
const heartbeat = startHeartbeatScheduler({
  store,
  intervalMs: 15 * 60 * 1000,  // 15 分钟
  sendMessage: async (userId, message) => {
    // 存入消息历史
    await store.messages.appendMessage(userId, {
      role: 'assistant',
      content: message,
      timestamp: Date.now(),
    });
    // TODO: 推送到活跃的 WebSocket 连接（需要从 channels 获取连接状态）
    logger.info('[heartbeat] message stored userId=%s', userId);
  },
});

// 在关闭处理中：
heartbeat.stop();
```

- [ ] **Step 6: 运行 typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: 启动服务验证**

Run: `bun run server`
Expected: 服务正常启动，日志显示 `[heartbeat] tick` 每 15 分钟

- [ ] **Step 8: Commit**

```bash
git add src/heartbeat/ src/main.ts
git commit -m "feat(heartbeat): add heartbeat scheduler for proactive health interventions"
```

---

## Task 8: 对话摘要生成

**Files:**
- Modify: `src/session/manager.ts`

**背景：** spec 要求"每次对话结束时由大模型生成摘要"。但实现需要：(1) 检测会话结束 (2) 调用 LLM 生成摘要 (3) 存入 conversation_summaries 表。

当前会话 TTL 为 7 天，cleanup 每 1 小时运行一次。在 cleanup 时生成摘要是自然的选择。

- [ ] **Step 1: 在 session/manager.ts 中添加会话清理钩子**

修改 cleanup 函数：在删除过期会话前，触发摘要生成。

```typescript
interface CreateSessionManagerOptions {
  createAgent: (userId: string, messages: Message[]) => Promise<Agent>;
  store: Store;
  ttlMs?: number;
  cleanupIntervalMs?: number;
  onSessionExpired?: (userId: string, messages: Message[]) => Promise<void>;
}
```

在 cleanup 中，会话过期时调用 `onSessionExpired`：
```typescript
const cleanup = async () => {
  const now = Date.now();
  for (const [userId, session] of sessions) {
    if (now - session.lastActiveAt.getTime() > ttlMs) {
      // 通知摘要生成
      if (onSessionExpired) {
        const msgs = await store.messages.getMessages(userId);
        await onSessionExpired(userId, msgs);
      }
      sessions.delete(userId);
      logger.info('[session] expired userId=%s', userId);
    }
  }
};
```

- [ ] **Step 2: 在 main.ts 中注册摘要生成回调**

```typescript
const sessionManager = createSessionManager({
  createAgent,
  store,
  onSessionExpired: async (userId, messages) => {
    // 只在有足够消息时生成摘要（至少 4 条，即 2 轮对话）
    if (messages.length < 4) return;
    const summary = await generateSummary(messages);
    await store.summary.save(userId, {
      summary,
      messageCount: messages.length,
      startTimestamp: messages[0].timestamp,
      endTimestamp: messages[messages.length - 1].timestamp,
    });
  },
});
```

`generateSummary` 函数：提取最近对话内容，调用 LLM 生成一段摘要。可以用简单的 prompt 直接调用 `streamSimple`。

- [ ] **Step 3: 运行 typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/session/manager.ts src/main.ts
git commit -m "feat(session): generate conversation summaries on session expiry"
```

---

## Task 9: 更新 CLAUDE.md 和最终验证

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新 CLAUDE.md**

更新以下部分：
- 架构图：新增 `src/prompts/`（模块化提示词）、`src/heartbeat/`（心跳）目录
- 数据类型：确认各记录类型字段已与新 schema 一致
- Agent 工具列表：新增查询工具（6个）、记忆工具（3个）、症状解决工具（1个）
- 新增"提示词架构"说明：模块化组织、assembler 动态组装、热更新
- 新增"心跳机制"说明
- 新增"记忆系统"说明

- [ ] **Step 2: 最终 typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: 启动完整服务验证**

Run: `bun run server`
Expected:
- 服务在 3001 端口启动
- 无报错
- 日志显示 agent 创建、工具数量（18个）

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new architecture, tools, and prompt system"
```

---

## 执行顺序和依赖关系

```
Task 1 (schema) → Task 2 (store 新增) → Task 4 (tools 新增) → Task 5 (assembler) → Task 6 (factory+handler)
                                           ↑
                                    Task 3 (prompt files，可与 Task 1-2 并行)
Task 6 → Task 7 (heartbeat)
Task 6 → Task 8 (对话摘要)
Task 7+8 → Task 9 (CLAUDE.md)
```

**可并行的任务：** Task 3（创建 .md 文件）与 Task 1-2（schema + store）无代码依赖，可并行执行。

**关键路径：** Task 1 → Task 2 → Task 4 → Task 5 → Task 6
