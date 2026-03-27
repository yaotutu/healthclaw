# 饮食管理功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现饮食管理功能，包括个人档案、饮食记录（支持图片）、营养分析和智能建议。

**Architecture:** 在现有分层架构上扩展。存储层新增 user_profiles 表和聚合查询；Agent 层新增档案工具和饮食分析工具；通道层支持图片消息透传。核心原则：工具只提供数据，AI 做所有决策。

**Tech Stack:** TypeScript, Bun, Drizzle ORM, SQLite, pi-agent-core/pi-ai, TypeBox

**Design Spec:** `docs/superpowers/specs/2026-03-27-diet-management-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/store/schema.ts` | Modify | 新增 `user_profiles` 表；`health_records` 新增 `detail` 字段；`messages` 新增 `metadata` 字段 |
| `src/store/db.ts` | Modify | schema 注册新增 `userProfiles` |
| `src/store/profile.ts` | Create | 档案读写：`get(userId)` 和 `upsert(userId, data)` |
| `src/store/health.ts` | Modify | `record` 支持 detail；新增 `analyze(userId, days)` 聚合查询 |
| `src/store/index.ts` | Modify | 导出 profile store；Store 类新增 profile 属性；initTables 增加迁移 |
| `src/agent/tools.ts` | Modify | 新增 `get_profile`、`update_profile`、`analyze_diet` 工具；`record` 支持 detail |
| `src/agent/prompt.ts` | Modify | 增强提示词，引导 AI 做饮食分析和个性化建议 |
| `src/agent/factory.ts` | Modify | 查询档案注入 systemPrompt；toolList 扩展；convertMessages 支持 metadata |
| `src/channels/types.ts` | Modify | `ChannelMessage` 新增 `images` 字段；`ClientMessage` 新增 `images` 字段 |
| `src/channels/qq.ts` | Modify | 从 `event.attachments` 提取图片 |
| `src/channels/websocket.ts` | Modify | 从 `ClientMessage.images` 映射到 `ChannelMessage.images` |
| `src/channels/handler.ts` | Modify | 提取 images，传给 `agent.prompt(content, images)`；消息存储含 metadata |

---

### Task 1: Schema 与数据库迁移

**Files:**
- Modify: `src/store/schema.ts`
- Modify: `src/store/db.ts`
- Modify: `src/store/index.ts`

- [ ] **Step 1: 在 schema.ts 中新增 user_profiles 表和字段**

在 `src/store/schema.ts` 中：

1. 新增 `userProfiles` 表定义：

```typescript
export const userProfiles = sqliteTable('user_profiles', {
  /** 用户ID，主键 */
  userId: text('user_id').primaryKey(),
  /** 身高 cm */
  height: real('height'),
  /** 体重 kg */
  weight: real('weight'),
  /** 年龄 */
  age: integer('age'),
  /** 性别 */
  gender: text('gender'),
  /** 疾病史，JSON 数组字符串 */
  diseases: text('diseases'),
  /** 过敏史，JSON 数组字符串 */
  allergies: text('allergies'),
  /** 饮食偏好 */
  dietPreferences: text('diet_preferences'),
  /** 健康目标 */
  healthGoal: text('health_goal'),
  /** 创建时间 */
  createdAt: integer('created_at').notNull(),
  /** 更新时间 */
  updatedAt: integer('updated_at').notNull(),
});
```

2. 在 `healthRecords` 表定义中新增 `detail` 字段（在 `note` 之后、`timestamp` 之前）：

```typescript
/** 饮食详情 JSON，diet 类型存储营养明细 */
detail: text('detail'),
```

3. 在 `messages` 表定义中新增 `metadata` 字段（在 `content` 之后、`timestamp` 之前）：

```typescript
/** 额外元数据 JSON，如图片信息 */
metadata: text('metadata'),
```

4. 导出新类型：

```typescript
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
```

- [ ] **Step 2: 更新 db.ts 注册新 schema**

在 `src/store/db.ts` 中：

1. import 新增 `userProfiles`
2. 在 schema 对象中新增 `userProfiles`：

```typescript
import { healthRecords, messages, userProfiles } from './schema';

export interface CreateDbResult {
  db: ReturnType<typeof drizzle<{ healthRecords: typeof healthRecords; messages: typeof messages; userProfiles: typeof userProfiles }>>;
  sqlite: Database;
}

export const createDb = (dbPath: string): CreateDbResult => {
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema: { healthRecords, messages, userProfiles } });
  return { db, sqlite };
};
```

- [ ] **Step 3: 更新 store/index.ts 迁移逻辑**

在 `src/store/index.ts` 中：

1. import 新增 `userProfiles`
2. 导出 `userProfiles` 和 `UserProfile` 类型
3. 在 `initTables()` 中新增：
   - `CREATE TABLE IF NOT EXISTS user_profiles` 建表语句
   - 安全的 `ALTER TABLE` 迁移（try-catch 忽略"列已存在"错误）：

```typescript
// 安全的列迁移：列已存在时忽略错误
private safeAlter(sql: string): void {
  try {
    this.sqlite.run(sql);
  } catch (err) {
    // SQLite 列已存在时报错 "duplicate column name"
    if (!(err as Error).message?.includes('duplicate column name')) {
      throw err;
    }
  }
}
```

4. 在 `initTables()` 末尾调用 `safeAlter` 添加 `detail` 和 `metadata` 列
5. `Store` 类新增 `profile` 属性（在下一个 task 中实现）

- [ ] **Step 4: 运行 typecheck 验证**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/schema.ts src/store/db.ts src/store/index.ts
git commit -m "feat(store): add user_profiles table, detail and metadata fields"
```

---

### Task 2: Profile Store

**Files:**
- Create: `src/store/profile.ts`
- Modify: `src/store/index.ts`

- [ ] **Step 1: 创建 profile store**

创建 `src/store/profile.ts`：

```typescript
import { eq } from 'drizzle-orm';
import type { Db } from './db';
import { userProfiles, type UserProfile, type NewUserProfile } from './schema';

export const createProfileStore = (db: Db) => {
  /**
   * 获取用户档案，不存在则返回 undefined
   */
  const get = async (userId: string): Promise<UserProfile | undefined> => {
    const results = await db.select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return results[0];
  };

  /**
   * 创建或更新用户档案（upsert）
   * 如果记录存在则更新，不存在则创建
   */
  const upsert = async (userId: string, data: Partial<Omit<NewUserProfile, 'userId' | 'createdAt' | 'updatedAt'>>): Promise<UserProfile> => {
    const existing = await get(userId);
    const now = Date.now();

    if (existing) {
      // 更新已有档案
      const result = await db.update(userProfiles)
        .set({ ...data, updatedAt: now })
        .where(eq(userProfiles.userId, userId))
        .returning();
      return result[0];
    }

    // 创建新档案
    const result = await db.insert(userProfiles)
      .values({ userId, ...data, createdAt: now, updatedAt: now })
      .returning();
    return result[0];
  };

  return { get, upsert };
};

export type ProfileStore = ReturnType<typeof createProfileStore>;
```

- [ ] **Step 2: 在 store/index.ts 中集成 profile store**

在 `src/store/index.ts` 中：

1. import `createProfileStore` 和 `ProfileStore`
2. 导出 `createProfileStore`、`userProfiles`、`ProfileStore`
3. 导出 `UserProfile` 类型
4. 在 `Store` 类中新增 `profile` 属性：

```typescript
export class Store {
  readonly db: Db;
  readonly sqlite: Database;
  readonly health: HealthStore;
  readonly messages: MessageStore;
  readonly profile: ProfileStore;

  constructor(dbPath: string) {
    const { db, sqlite } = createDb(dbPath);
    this.db = db;
    this.sqlite = sqlite;
    this.health = createHealthStore(this.db);
    this.messages = createMessageStore(this.db);
    this.profile = createProfileStore(this.db);
    this.initTables();
  }
  // ...
}
```

- [ ] **Step 3: 运行 typecheck 验证**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/store/profile.ts src/store/index.ts
git commit -m "feat(store): add profile store with get and upsert"
```

---

### Task 3: Health Store 扩展 — detail 和 analyze

**Files:**
- Modify: `src/store/health.ts`

- [ ] **Step 1: 扩展 record 方法支持 detail**

在 `src/store/health.ts` 中，`record` 方法已通过 `Omit<NewHealthRecord, 'id' | 'timestamp'>` 接收所有字段。由于 schema.ts 中已新增 `detail` 字段，`NewHealthRecord` 类型自动包含 `detail?: string | null`。无需修改 record 方法签名，只需确保调用方传入 detail 即可。

无需修改代码，`record` 方法自动支持 detail。

- [ ] **Step 2: 新增 analyze 聚合查询方法**

在 `src/store/health.ts` 的 `createHealthStore` 返回对象中新增 `analyze` 方法：

```typescript
import { sql } from 'drizzle-orm';

// 聚合查询结果的行类型
interface DailySummaryRow {
  date: string;
  meals: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface FoodFrequencyRow {
  food: string;
  count: number;
}

/**
 * analyze 方法：按日期聚合饮食数据，返回原始统计
 * 使用 SQLite 的 json_extract 从 detail JSON 字段提取营养数据
 * 注意：drizzle-orm bun-sqlite 使用 db.all()（同步方法），不是 db.execute()
 */
const analyze = (userId: string, days: number = 7) => {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  // 按日期聚合每日营养数据
  // db.all() 返回 T[]，同步调用（bun-sqlite 驱动）
  const dailySummary = db.all<DailySummaryRow>(sql`
    SELECT
      DATE(${healthRecords.timestamp} / 1000, 'unixepoch') as date,
      COUNT(*) as meals,
      SUM(CAST(COALESCE(json_extract(${healthRecords.detail}, '$.calories'), 0) AS REAL)) as calories,
      SUM(CAST(COALESCE(json_extract(${healthRecords.detail}, '$.protein'), 0) AS REAL)) as protein,
      SUM(CAST(COALESCE(json_extract(${healthRecords.detail}, '$.carbs'), 0) AS REAL)) as carbs,
      SUM(CAST(COALESCE(json_extract(${healthRecords.detail}, '$.fat'), 0) AS REAL)) as fat
    FROM ${healthRecords}
    WHERE ${healthRecords.userId} = ${userId}
      AND ${healthRecords.type} = 'diet'
      AND ${healthRecords.timestamp} >= ${cutoff}
      AND ${healthRecords.detail} IS NOT NULL
    GROUP BY DATE(${healthRecords.timestamp} / 1000, 'unixepoch')
    ORDER BY date DESC
  `);

  // 食物频次统计
  const foodFrequency = db.all<FoodFrequencyRow>(sql`
    SELECT
      json_extract(${healthRecords.detail}, '$.food') as food,
      COUNT(*) as count
    FROM ${healthRecords}
    WHERE ${healthRecords.userId} = ${userId}
      AND ${healthRecords.type} = 'diet'
      AND ${healthRecords.timestamp} >= ${cutoff}
      AND ${healthRecords.detail} IS NOT NULL
    GROUP BY json_extract(${healthRecords.detail}, '$.food')
    ORDER BY count DESC
    LIMIT 20
  `);

  return {
    days,
    dailySummary,
    foodFrequency,
  };
};
```

在返回对象中添加 `analyze`：

```typescript
return { record, query, analyze };
```

- [ ] **Step 3: 运行 typecheck 验证**

Run: `bun run typecheck`
Expected: PASS（可能需要调整 sql 模板标签中的类型，根据 drizzle-orm 版本）

- [ ] **Step 4: Commit**

```bash
git add src/store/health.ts
git commit -m "feat(store): add diet analysis aggregation query"
```

---

### Task 4: Agent Tools 扩展

**Files:**
- Modify: `src/agent/tools.ts`

- [ ] **Step 1: 扩展 RecordParamsSchema 支持 detail**

在 `RecordParamsSchema` 中新增 `detail` 可选参数：

```typescript
const RecordParamsSchema = Type.Object({
  type: Type.Union([
    Type.Literal('weight'),
    Type.Literal('sleep'),
    Type.Literal('diet'),
    Type.Literal('exercise'),
    Type.Literal('water'),
  ], { description: '数据类型' }),
  value: Type.Number({ description: '数值' }),
  unit: Type.Optional(Type.String({ description: '单位，如 kg、小时、杯' })),
  note: Type.Optional(Type.String({ description: '备注' })),
  detail: Type.Optional(Type.Object({
    food: Type.String({ description: '食物名称' }),
    calories: Type.Number({ description: '估算热量 kcal' }),
    protein: Type.Optional(Type.Number({ description: '蛋白质 g' })),
    carbs: Type.Optional(Type.Number({ description: '碳水化合物 g' })),
    fat: Type.Optional(Type.Number({ description: '脂肪 g' })),
  }, { description: '饮食详情，仅 diet 类型使用' })),
});
```

- [ ] **Step 2: 修改 record 工具 execute 传递 detail**

在 `record` 工具的 `execute` 中，将 `params.detail` 序列化为 JSON 字符串传入 store：

```typescript
execute: async (_toolCallId, params, _signal) => {
  const record = await store.health.record({
    userId,
    type: params.type as HealthRecord['type'],
    value: params.value,
    unit: params.unit,
    note: params.note,
    // 将 detail 对象序列化为 JSON 字符串存储
    detail: params.detail ? JSON.stringify(params.detail) : undefined,
  });

  // 如果有 detail，在回复中包含营养信息
  let detailText = '';
  if (params.detail) {
    detailText = ` (${params.detail.food}, ${params.detail.calories}kcal)`;
  }

  return {
    content: [{ type: 'text', text: `已记录: ${record.type} ${record.value}${record.unit || ''}${detailText} (${new Date(record.timestamp).toISOString()})` }],
    details: { id: record.id },
  };
},
```

- [ ] **Step 3: 新增 get_profile、update_profile、analyze_diet 工具**

在 `createTools` 函数中新增以下工具：

```typescript
// --- get_profile 工具 ---
const GetProfileParamsSchema = Type.Object({}, { description: '无参数' });
type GetProfileParams = typeof GetProfileParamsSchema;

const getProfile: AgentTool<GetProfileParams> = {
  name: 'get_profile',
  label: '获取用户档案',
  description: '获取用户的个人健康档案，包括身高、体重、疾病史、过敏史、饮食偏好等',
  parameters: GetProfileParamsSchema,
  execute: async (_toolCallId, _params, _signal) => {
    const profile = await store.profile.get(userId);
    if (!profile) {
      return {
        content: [{ type: 'text', text: '用户尚未建立个人档案。' }],
        details: { exists: false },
      };
    }
    // 解析 JSON 数组字段
    const parsed = {
      ...profile,
      diseases: profile.diseases ? JSON.parse(profile.diseases) : [],
      allergies: profile.allergies ? JSON.parse(profile.allergies) : [],
    };
    return {
      content: [{ type: 'text', text: `用户档案: ${JSON.stringify(parsed, null, 2)}` }],
      details: { exists: true, profile: parsed },
    };
  },
};

// --- update_profile 工具 ---
const UpdateProfileParamsSchema = Type.Object({
  height: Type.Optional(Type.Number({ description: '身高 cm' })),
  weight: Type.Optional(Type.Number({ description: '体重 kg' })),
  age: Type.Optional(Type.Number({ description: '年龄' })),
  gender: Type.Optional(Type.String({ description: '性别' })),
  diseases: Type.Optional(Type.Array(Type.String(), { description: '疾病史' })),
  allergies: Type.Optional(Type.Array(Type.String(), { description: '过敏史' })),
  dietPreferences: Type.Optional(Type.String({ description: '饮食偏好' })),
  healthGoal: Type.Optional(Type.String({ description: '健康目标' })),
});
type UpdateProfileParams = typeof UpdateProfileParamsSchema;

const updateProfile: AgentTool<UpdateProfileParams> = {
  name: 'update_profile',
  label: '更新用户档案',
  description: '更新用户的个人健康档案，只传入需要更新的字段',
  parameters: UpdateProfileParamsSchema,
  execute: async (_toolCallId, params) => {
    // 将数组字段序列化为 JSON 字符串
    const data: Record<string, unknown> = {};
    if (params.height !== undefined) data.height = params.height;
    if (params.weight !== undefined) data.weight = params.weight;
    if (params.age !== undefined) data.age = params.age;
    if (params.gender !== undefined) data.gender = params.gender;
    if (params.diseases !== undefined) data.diseases = JSON.stringify(params.diseases);
    if (params.allergies !== undefined) data.allergies = JSON.stringify(params.allergies);
    if (params.dietPreferences !== undefined) data.dietPreferences = params.dietPreferences;
    if (params.healthGoal !== undefined) data.healthGoal = params.healthGoal;

    const profile = await store.profile.upsert(userId, data);
    return {
      content: [{ type: 'text', text: '档案已更新。' }],
      details: { profile },
    };
  },
};

// --- analyze_diet 工具 ---
const AnalyzeDietParamsSchema = Type.Object({
  days: Type.Optional(Type.Number({ description: '分析最近N天，默认7天' })),
});
type AnalyzeDietParams = typeof AnalyzeDietParamsSchema;

const analyzeDiet: AgentTool<AnalyzeDietParams> = {
  name: 'analyze_diet',
  label: '分析饮食数据',
  description: '获取用户近期饮食数据的统计聚合，包括每日营养汇总和食物频次。返回原始数据供分析。',
  parameters: AnalyzeDietParamsSchema,
  execute: async (_toolCallId, params, _signal) => {
    // analyze 是同步方法（bun-sqlite 驱动），不需要 await
    const result = store.health.analyze(userId, params.days ?? 7);
    const summaryLines = result.dailySummary.map((row) =>
      `${row.date}: ${row.calories}kcal (蛋白质${row.protein}g / 碳水${row.carbs}g / 脂肪${row.fat}g) ${row.meals}餐`
    );
    const foodLines = result.foodFrequency.map((row) =>
      `${row.food}: ${row.count}次`
    );

    let text = `最近 ${result.days} 天饮食统计:\n\n`;
    if (summaryLines.length > 0) {
      text += `每日汇总:\n${summaryLines.join('\n')}\n\n`;
    } else {
      text += '暂无饮食记录数据。\n\n';
    }
    if (foodLines.length > 0) {
      text += `食物频次:\n${foodLines.join('\n')}`;
    }

    return {
      content: [{ type: 'text', text }],
      details: result,
    };
  },
};
```

- [ ] **Step 4: 更新 createTools 返回值**

```typescript
return { record, query, getProfile, updateProfile, analyzeDiet };
```

- [ ] **Step 5: 运行 typecheck 验证**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/agent/tools.ts
git commit -m "feat(agent): add profile tools, analyze_diet tool, and detail support for record"
```

---

### Task 5: Agent Prompt 增强

**Files:**
- Modify: `src/agent/prompt.ts`

- [ ] **Step 1: 重写 prompt.ts**

替换 `src/agent/prompt.ts` 的全部内容。新提示词引导 AI 做饮食分析和个性化建议，遵循"不写死规则"原则：

```typescript
export const HEALTH_ADVISOR_PROMPT = `你是用户的私人健康顾问和私人医生，专注于日常健康管理。

## 你的职责
- 帮助用户建立和维护个人健康档案（身高、体重、疾病史、过敏史、饮食偏好、健康目标）
- 帮助用户记录和追踪健康数据（体重、睡眠、饮食、运动、饮水）
- 根据用户的个人档案和历史数据，提供个性化的健康建议
- 回答健康相关的知识性问题

## 个人档案
- 首次对话时，如果用户没有档案，主动引导用户完善基本信息
- 用户随时可以更新档案信息
- 所有建议都应基于用户的个人档案来个性化

## 饮食记录与分析
- 用户发送饮食信息（文字描述或食物图片）时，识别食物并估算热量和营养
- 记录饮食时调用 record_health_data，并在 detail 中填写营养估算
- 对于 diet 类型，value 填入估算的总热量(kcal)，unit 填 "kcal"
- 分析用户饮食时，使用 analyze_diet 工具获取统计数据
- 给出建议时考虑用户的历史饮食模式和个人偏好

## 工具调用规则

record_health_data 工具调用时，必须提供完整的 JSON 参数：
- type: 数据类型（weight/sleep/diet/exercise/water）
- value: 数值（必填）
- unit: 单位（可选）
- note: 备注（可选）
- detail: 饮食详情（仅 diet 类型，包含 food/calories/protein/carbs/fat）

示例 - 用户说"吃了一碗牛肉面"：
{"type": "diet", "value": 550, "unit": "kcal", "detail": {"food": "牛肉面", "calories": 550, "protein": 25, "carbs": 65, "fat": 18}}

如果用户没有提供足够信息，先询问再调用工具。

## 查询与分析
- 使用 query_health_data 获取历史记录
- 使用 analyze_diet 获取饮食统计聚合数据
- 使用 get_profile 获取用户档案
- 使用 update_profile 更新用户档案

## 注意事项
- 你不是医生，不提供医疗诊断
- 遇到严重健康问题，建议用户就医
- 保持对话简洁、友好
- 建议要个性化，基于用户的实际数据和偏好`;
```

- [ ] **Step 2: 运行 typecheck 验证**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/agent/prompt.ts
git commit -m "feat(agent): enhance prompt for diet analysis and profile management"
```

---

### Task 6: Agent Factory — 档案注入与工具注册

**Files:**
- Modify: `src/agent/factory.ts`

- [ ] **Step 1: 修改 createHealthAgent 注入档案和注册新工具**

在 `src/agent/factory.ts` 中：

1. 将 `createHealthAgent` 改为 async 函数（因为需要异步查询档案）
2. 查询用户档案并追加到 systemPrompt
3. 扩展 toolList 包含新工具

```typescript
export const createHealthAgent = async (options: CreateAgentOptions) => {
  const { store, userId, messages = [] } = options;

  const agentModel = getModel(LLM_PROVIDER as any, LLM_MODEL);
  const tools = createTools(store, userId);
  const toolList = [tools.record, tools.query, tools.getProfile, tools.updateProfile, tools.analyzeDiet];

  // 查询用户档案，注入到系统提示词
  let systemPrompt = HEALTH_ADVISOR_PROMPT;
  const profile = await store.profile.get(userId);
  if (profile) {
    const parsed = {
      ...profile,
      diseases: profile.diseases ? JSON.parse(profile.diseases) : [],
      allergies: profile.allergies ? JSON.parse(profile.allergies) : [],
    };
    systemPrompt += `\n\n## 当前用户档案\n${JSON.stringify(parsed, null, 2)}`;
  } else {
    systemPrompt += '\n\n## 当前用户档案\n该用户尚未建立个人档案，请在合适时机引导用户完善基本信息。';
  }

  logger.info('[agent] created provider=%s model=%s tools=%d', LLM_PROVIDER, LLM_MODEL, toolList.length);

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: agentModel,
      tools: toolList,
      messages: convertMessages(messages),
      thinkingLevel: 'off',
    },
    streamFn: createLoggingStreamFn(),
  });

  return agent;
};
```

- [ ] **Step 2: 更新 convertMessages 支持 metadata 字段**

`convertMessages` 需要处理 messages 表中的 `metadata` 字段。对于有图片的 user message（metadata 中有 images），构建多模态 content：

```typescript
const convertMessages = (messages: Message[]): Array<UserMessage | AssistantMessage> => {
  const result: Array<UserMessage | AssistantMessage> = [];
  for (const m of messages) {
    if (m.role === 'user') {
      // 检查 metadata 中是否有图片信息
      let content: string | Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = m.content;
      if (m.metadata) {
        try {
          const meta = JSON.parse(m.metadata);
          if (meta.images && Array.isArray(meta.images) && meta.images.length > 0) {
            content = [
              { type: 'text', text: m.content },
              ...meta.images,
            ];
          }
        } catch {
          // metadata 解析失败，使用纯文本
        }
      }
      result.push({
        role: 'user',
        content,
        timestamp: m.timestamp,
      });
    } else {
      result.push({
        role: 'assistant',
        content: [{ type: 'text', text: m.content }],
        api: 'anthropic',
        provider: 'anthropic',
        model: LLM_MODEL,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop',
        timestamp: m.timestamp,
      });
    }
  }
  return result;
};
```

注意：`Message` 类型需要包含 `metadata` 字段，这已在 Task 1 的 schema 修改中完成。

- [ ] **Step 3: 更新 session/manager.ts 中的 createAgent 调用**

由于 `createHealthAgent` 变为 async，需要更新 `main.ts` 中的 `createAgent` 工厂函数：

在 `src/main.ts` 中，`createAgent` 已经被包在 `createSessionManager` 中，需要改为 async：

```typescript
const createAgent = async (userId: string, messages: Parameters<typeof createHealthAgent>[0]['messages']) =>
  createHealthAgent({ store, userId, messages });
```

`session/manager.ts` 需要两处修改：

1. `CreateSessionManagerOptions.createAgent` 类型改为返回 `Promise<Agent>`：

```typescript
export interface CreateSessionManagerOptions {
  createAgent: (userId: string, messages: Message[]) => Promise<Agent>;  // 改为 Promise<Agent>
  // ...
}
```

2. `getOrCreate` 中的 `createAgent` 调用必须加 `await`（当前代码没有 await）：

```typescript
// 原来：agent: createAgent(userId, messages),
// 改为：
agent: await createAgent(userId, messages),
```

- [ ] **Step 4: 运行 typecheck 验证**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/factory.ts src/main.ts src/session/manager.ts
git commit -m "feat(agent): inject profile into systemPrompt, register new tools, async factory"
```

---

### Task 7: 通道类型与多模态支持

**Files:**
- Modify: `src/channels/types.ts`
- Modify: `src/channels/qq.ts`
- Modify: `src/channels/websocket.ts`
- Modify: `src/channels/handler.ts`

- [ ] **Step 1: 在 types.ts 中添加 images 字段**

在 `ChannelMessage` 接口中新增 `images` 可选字段：

```typescript
export interface ChannelMessage {
  /** 消息唯一ID */
  id: string;
  /** 用户ID（跨通道统一标识） */
  userId: string;
  /** 消息文本内容 */
  content: string;
  /** 图片列表（base64 数据） */
  images?: Array<{ data: string; mimeType: string }>;
  /** 时间戳 */
  timestamp: Date;
  /** 原始通道标识 */
  channel: string;
  /** 通道特定的额外数据 */
  metadata?: Record<string, unknown>;
}
```

在 `ClientMessage` 接口中新增 `images` 可选字段：

```typescript
export interface ClientMessage {
  type: 'prompt' | 'continue' | 'abort';
  content?: string;
  sessionId?: string;
  /** 图片列表（base64 数据） */
  images?: Array<{ data: string; mimeType: string }>;
}
```

- [ ] **Step 2: 更新 QQ 通道提取图片**

在 `src/channels/qq.ts` 中，从 `event.attachments` 提取图片并 fetch 转 base64：

```typescript
const channelMsg: ChannelMessage = {
  id: event.messageId,
  userId: `qq:${event.senderId}`,
  content: event.content || '',
  channel: 'qq',
  timestamp: new Date(),
  metadata: {
    type: event.type,
    guildId: (event as any).guildId,
    channelId: (event as any).channelId,
    attachments: event.attachments,
  },
};

// 从附件中提取图片，下载并转为 base64
if (event.attachments && event.attachments.length > 0) {
  const images: Array<{ data: string; mimeType: string }> = [];
  for (const attachment of event.attachments) {
    if (attachment.content_type?.startsWith('image/') && attachment.url) {
      try {
        const response = await fetch(attachment.url);
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        images.push({ data: base64, mimeType: attachment.content_type });
      } catch (err) {
        logger.error('[qq] failed to fetch image url=%s error=%s', attachment.url, (err as Error).message);
      }
    }
  }
  if (images.length > 0) {
    channelMsg.images = images;
  }
}
```

- [ ] **Step 3: 更新 WebSocket 通道映射图片**

在 `src/channels/websocket.ts` 的 `handleMessage` 方法中，将 `ClientMessage.images` 映射到 `ChannelMessage`：

```typescript
const channelMsg: ChannelMessage = {
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  userId,
  content: clientMsg.content || '',
  images: clientMsg.images,  // 新增：映射图片
  timestamp: new Date(),
  channel: 'websocket',
  metadata: { connectionId, messageType: clientMsg.type },
};
```

- [ ] **Step 4: 更新 handler 传递图片给 Agent**

在 `src/channels/handler.ts` 中：

1. 从 `message.images` 提取图片数据
2. 调用 `agent.prompt(content, images)` 传入图片
3. 存储消息时将图片信息写入 metadata

关键改动：

```typescript
// 提取图片
const images = message.images?.map(img => ({
  type: 'image' as const,
  data: img.data,
  mimeType: img.mimeType,
}));

// 保存用户消息（包含图片信息到 metadata）
await store.messages.appendMessage(userId, {
  role: 'user',
  content,
  timestamp: Date.now(),
  // 新增：图片信息存入 metadata（条件展开，避免传 undefined）
  ...(images ? { metadata: JSON.stringify({ images }) } : {}),
});

// 调用 Agent，传入图片
if (images && images.length > 0) {
  await session.agent.prompt(content, images);
} else {
  await session.agent.prompt(content);
}
```

- [ ] **Step 5: 运行 typecheck 验证**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/channels/types.ts src/channels/qq.ts src/channels/websocket.ts src/channels/handler.ts
git commit -m "feat(channels): add multimodal image support for diet photo recognition"
```

---

### Task 8: 集成验证

**Files:**
- 无新文件

- [ ] **Step 1: 运行完整 typecheck**

Run: `bun run typecheck`
Expected: PASS，无类型错误

- [ ] **Step 2: 启动服务验证**

Run: `bun run server`
Expected: 服务正常启动，日志显示 `[app] server started port=3001`

- [ ] **Step 3: WebSocket 手动测试**

使用 WebSocket 客户端连接 `ws://localhost:3001/ws`，测试以下场景：

1. **首次对话（无档案）**：发送 `{"type":"prompt","content":"你好"}` — AI 应主动引导建立档案
2. **建立档案**：发送个人信息 — AI 应调用 update_profile
3. **记录饮食**：发送 `"吃了一碗牛肉面"` — AI 应调用 record_health_data 并估算热量
4. **查询饮食**：发送 `"帮我看看最近的饮食"` — AI 应调用 analyze_diet 并给出分析
5. **图片测试**：发送带 images 的消息 — AI 应识别食物

- [ ] **Step 4: 最终 Commit**

如果有集成修复，提交最终状态：

```bash
git add -A
git commit -m "feat: complete diet management with profile, analysis, and multimodal support"
```
