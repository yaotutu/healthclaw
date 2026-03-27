# 饮食管理功能设计

## 定位

Healthclaw 作为私人健康助手，首个核心功能是**饮食管理与个性化建议**。用户记录饮食（文字或图片），AI 基于个人档案和历史数据给出个性化的营养分析和替代建议。

## 核心原则

**工具只提供数据，AI 做所有决策。** 不写死阈值、规则、建议模板。所有分析逻辑由 AI 根据上下文数据自行判断。

## 功能范围

### Part 1: 个人档案

所有分析的基础。用户首次使用时由 AI 主动引导建立档案。

**Drizzle 表定义：**

```typescript
export const userProfiles = sqliteTable('user_profiles', {
  userId: text('user_id').primaryKey(),          // 跨通道用户ID，主键
  height: real('height'),                        // 身高 cm
  weight: real('weight'),                        // 体重 kg
  age: integer('age'),                           // 年龄
  gender: text('gender'),                        // 性别
  diseases: text('diseases'),                    // 疾病史，JSON 数组字符串
  allergies: text('allergies'),                  // 过敏史，JSON 数组字符串
  dietPreferences: text('diet_preferences'),     // 饮食偏好，自由文本
  healthGoal: text('health_goal'),               // 健康目标，自由文本
  createdAt: integer('created_at').notNull(),    // 创建时间
  updatedAt: integer('updated_at').notNull(),    // 更新时间
});
```

- 除 `userId`、`createdAt`、`updatedAt` 外，所有字段均可为空（用户首次引导时逐步填写）
- `diseases` 和 `allergies` 存储为 JSON 数组字符串（如 `'["高血压","糖尿病"]'`），与 `detail` 字段保持一致的 JSON 序列化策略

**Agent 工具：**

```typescript
// get_profile: 无参数，返回当前用户档案原始数据
const GetProfileParamsSchema = Type.Object({});

// update_profile: 所有字段可选，AI 自行决定更新哪些
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
```

**档案上下文注入方式：**

在 `factory.ts` 的 `createHealthAgent` 中，创建 Agent 前先查询用户档案。如果有档案，将档案数据格式化为文本追加到 `systemPrompt` 末尾。如果没有档案，在 systemPrompt 中追加提示"该用户尚未建立个人档案，请在合适时机引导用户完善"。这样 AI 每次回复都能看到用户档案，无需额外调用工具。

### Part 2: 饮食记录与分析

用户发送食物信息（文字或图片），AI 识别食物、估算营养、记录并给出即时建议。

**数据存储：**

`health_records` 表新增 `detail` text 字段，diet 类型记录存储结构化营养数据：

```typescript
// schema.ts 中新增 detail 列
detail: text('detail'),  // JSON 字符串，diet 类型存储营养明细
```

`detail` JSON 结构：

```json
{
  "food": "牛肉面",
  "calories": 550,
  "protein": 25,
  "carbs": 65,
  "fat": 18
}
```

**record_health_data 工具扩展：**

在 `RecordParamsSchema` 中新增可选的 `detail` 参数：

```typescript
detail: Type.Optional(Type.Object({
  food: Type.String({ description: '食物名称' }),
  calories: Type.Number({ description: '估算热量 kcal' }),
  protein: Type.Optional(Type.Number({ description: '蛋白质 g' })),
  carbs: Type.Optional(Type.Number({ description: '碳水化合物 g' })),
  fat: Type.Optional(Type.Number({ description: '脂肪 g' })),
}, { description: '饮食详情，仅 diet 类型使用' })),
```

AI 在记录饮食时自行决定是否携带 detail（AI 判断是否需要估算营养数据）。

**多模态消息流：**

图片消息需要穿透整个消息管道到达 AI。变更涉及：

1. **`ChannelMessage` 新增 `images` 字段**（`types.ts`）：

```typescript
export interface ChannelMessage {
  // ...现有字段
  content: string;
  /** 图片列表（URL 或 base64） */
  images?: Array<{ url?: string; data?: string; mimeType: string }>;
}
```

2. **QQ 通道提取图片**（`qq.ts`）：从 `event.attachments` 中提取图片 URL 放入 `images` 字段。

3. **Handler 构建多模态 UserMessage**（`handler.ts`）：如果 `message.images` 存在，将 `content` 从纯字符串转换为 `TextContent | ImageContent[]` 数组格式。对于图片 URL，需要 fetch 图片数据转为 base64 传给 AI（因为 Claude API 的 ImageContent 需要 base64 数据）。

4. **消息存储**（`messages.ts`）：`content` 字段存纯文本描述，图片信息存入 `metadata` JSON 字段（避免存储大量 base64 数据）。需要给 `messages` 表新增 `metadata` text 字段。

5. **factory.ts 的 `convertMessages`**：从 metadata 恢复图片内容，构建多模态 UserMessage。

**数据库迁移：**

在 `initTables()` 中新增 `user_profiles` 建表语句，并使用 `ALTER TABLE ADD COLUMN` 为已有表添加新字段：

```sql
-- 新建 user_profiles 表
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  height REAL,
  weight REAL,
  age INTEGER,
  gender TEXT,
  diseases TEXT,
  allergies TEXT,
  diet_preferences TEXT,
  health_goal TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- health_records 新增 detail 列
ALTER TABLE health_records ADD COLUMN detail TEXT;

-- messages 新增 metadata 列
ALTER TABLE messages ADD COLUMN metadata TEXT;
```

由于 SQLite `ALTER TABLE ADD COLUMN` 在列已存在时会报错，需要 try-catch 忽略该错误，封装为安全的迁移方法。

### Part 3: 模式分析与智能建议

基于历史饮食数据发现模式，提供个性化建议和替代食物推荐。

**AI 分析能力（不写死逻辑）：**

- 即时反馈：用户记录饮食时，AI 根据当日已摄入数据自行判断是否需要提醒
- 每日总结：用户主动询问时，AI 自行分析当日/近期饮食情况
- 趋势发现：AI 从历史数据中自行识别饮食模式（偏好的食物、营养倾向、时间规律等）
- 替代建议：AI 根据用户口味偏好和历史记录，推荐同口味/同类型但更健康的选项

**analyze_diet 工具定义：**

```typescript
const AnalyzeDietParamsSchema = Type.Object({
  days: Type.Optional(Type.Number({ description: '分析最近N天，默认7天' })),
});

// 返回原始聚合数据，不做任何判断
// execute 返回格式示例：
// {
//   content: [{ type: 'text', text: '...' }],
//   details: {
//     days: 7,
//     dailySummary: [
//       { date: '2026-03-27', calories: 1850, protein: 65, carbs: 220, fat: 60, meals: 3 },
//       ...
//     ],
//     foodFrequency: [
//       { food: '米饭', count: 8 },
//       { food: '牛肉面', count: 3 },
//       ...
//     ],
//     totalRecords: 21,
//   }
// }
```

**聚合查询实现**（`store/health.ts`）：

使用 Drizzle 的 `sql` 模板标签配合 SQLite 的 `json_extract()` 函数从 `detail` JSON 字段中提取营养数据进行聚合：

```typescript
// 示例：按日期聚合每日热量
sql`DATE(timestamp / 1000, 'unixepoch') as date`,
sql`SUM(CAST(json_extract(detail, '$.calories') AS REAL)) as calories`,
```

## 改动清单

| 文件 | 改动 |
|------|------|
| `src/store/schema.ts` | 新增 `user_profiles` 表；`health_records` 表新增 `detail` 字段；`messages` 表新增 `metadata` 字段 |
| `src/store/profile.ts` | 新增文件：`get(userId)` 和 `upsert(userId, data)` 方法 |
| `src/store/health.ts` | `record` 方法支持 detail 参数；新增 `analyze(userId, days)` 聚合查询方法 |
| `src/store/index.ts` | 导出 `profileStore`，`Store` 类新增 `profile` 属性；`initTables` 增加迁移逻辑 |
| `src/agent/tools.ts` | 新增 `get_profile`、`update_profile`、`analyze_diet` 工具；`record` 工具支持 `detail` 参数 |
| `src/agent/prompt.ts` | 增强提示词，引导 AI 做个性化饮食分析和建议 |
| `src/agent/factory.ts` | 创建 Agent 前查询档案，追加到 systemPrompt；`toolList` 扩展包含新工具；`convertMessages` 支持 metadata 中的图片恢复为多模态 UserMessage |
| `src/channels/types.ts` | `ChannelMessage` 新增 `images` 字段；`ClientMessage` 新增 `images` 字段 |
| `src/channels/qq.ts` | 从 `event.attachments` 提取图片 URL 放入 `images` |
| `src/channels/websocket.ts` | 从 `ClientMessage.images` 映射到 `ChannelMessage.images` |
| `src/channels/handler.ts` | 处理 `images` 字段，构建多模态 UserMessage |

## 不做什么

- 不做食物营养数据库 API 对接（AI 估算足够）
- 不做定时提醒推送（后续 P1 提醒系统）
- 不做前端图表（先通过文字/表格呈现）
- 不写死任何营养阈值或健康规则
