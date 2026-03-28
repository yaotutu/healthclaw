# 提示词架构重设计

> 日期：2026-03-28
> 状态：已确认

## 核心理念

**大模型主导决策，系统只提供工具和原始数据。**

- 不硬编码业务逻辑，判断规则写在提示词里让大模型决策
- 工具只负责数据存取，分析和决策由大模型完成
- 提示词模块化组织，支持频繁调整和热更新

## 架构选择：分离式（非 Skill 化）

工具定义集中在 `tools.ts`，提示词按模块组织在 `prompts/` 目录。二者分离管理。

**选择理由：**
- healthclaw 工具数量约 10 个，一股脑发送给大模型完全没问题
- 提示词需要频繁调整，集中管理比分散在各 skill 目录更好改
- 调用链路短，排查问题简单
- 无需多轮 API 调用，用户体验更快

**如果以后工具增长到 20+ 个**，再考虑迁移到 Skill 化架构。

## 模块化提示词结构

```
prompts/
├── core/
│   └── identity.md              # 角色定义："你是私人健康顾问"
├── capabilities/                # 能力描述（告诉 AI 有什么能力、何时使用）
│   ├── record-body.md           # 记录体重、体脂、BMI
│   ├── record-diet.md           # 记录饮食和营养
│   ├── record-symptom.md        # 记录症状，关联分析
│   ├── record-exercise.md       # 记录运动数据
│   ├── record-sleep.md          # 记录睡眠数据
│   ├── record-water.md          # 记录饮水量
│   ├── query-data.md            # 查询历史数据的原则
│   └── analysis.md              # 综合分析原则
├── context/                     # 动态注入模板（每次对话前从数据库查询填充）
│   ├── user-profile.md          # 用户档案（必带）
│   ├── recent-records.md        # 最近各类型记录
│   ├── active-concerns.md       # 活跃症状（大模型自己判断严重程度）
│   └── long-term-memory.md      # 长期记忆（重要反馈、偏好）
├── rules/                       # 行为规则
│   ├── response-style.md        # 回复风格：简洁、友好
│   ├── safety.md                # 安全边界
│   ├── proactivity.md           # 主动查询、关怀
│   ├── symptom-resolution.md    # 症状判断规则
│   └── medication.md            # 用药建议规则
└── assembler.ts                 # 组装器：静态模板 + 动态数据
```

## 数据库 Schema 调整

**重新调整数据库结构，不需要迁移旧数据。** 以下是各表的变更：

### symptom_records（症状表）变更

| 字段 | 旧 | 新 | 说明 |
|------|---|---|------|
| 描述字段 | `symptom` | `description` | 字段名统一 |
| 严重程度 | `severity` (1-5) | `severity` (1-10) | 更精细的刻度 |
| 诱因 | `trigger` | 删除 | 由大模型分析，不硬编码 |
| 身体部位 | 无 | `bodyPart` | 新增 |
| 解决时间 | 无 | `resolvedAt` (integer, 可为null) | 新增。大模型通过提示词规则（>1天无新记录=可能已好）判断，可用 resolve_symptom 工具标记 |

**注意：旧数据库文件将被删除重建，不需要迁移旧数据。以下所有表变更同理。**

### exercise_records（运动表）变更

| 字段 | 旧 | 新 | 说明 |
|------|---|---|------|
| 运动类型 | `exerciseType` | `type` | 字段名统一 |
| 热量消耗 | `caloriesBurned` | `calories` | 字段名统一 |
| 强度 | `intensity` (low/medium/high) | 删除 | 由大模型判断，不硬编码枚举 |
| 平均心率 | 无 | `heartRateAvg` | 新增 |
| 最大心率 | 无 | `heartRateMax` | 新增 |
| 距离 | 无 | `distance` | 新增 |

### sleep_records（睡眠表）变更

| 字段 | 旧 | 新 | 说明 |
|------|---|---|------|
| 时长单位 | `duration` (小时, real) | `duration` (分钟, integer) | 更精确，与运动时长单位统一 |
| 深睡时长 | 无 | `deepSleep` | 新增 |

### diet_records（饮食表）变更

| 字段 | 旧 | 新 | 说明 |
|------|---|---|------|
| 钠 | 无 | `sodium` (real, mg) | 新增，营养追踪 |

### water_records（饮水表）变更

| 字段 | 旧 | 新 | 说明 |
|------|---|---|------|
| 单位 | `unit` (text) | 删除 | 统一为 ml，简化逻辑 |

### 新增表：memories（长期记忆）

```typescript
export const memories = sqliteTable('memories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  content: text('content').notNull(),     // 记忆内容
  category: text('category'),             // 分类：feedback/preference/fact
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('memories_user_id_idx').on(table.userId),
]);
```

**记忆管理：**
- 长期记忆由大模型通过工具调用主动记录（如用户说"安眠药对我没用"）
- 提供记忆 CRUD 工具：`save_memory`、`query_memories`、`delete_memory`
- 每次对话注入所有长期记忆到上下文
- 容量上限由大模型自己判断（在提示词中指导"只记录真正重要的事实"）

### 新增表：conversation_summaries（短期记忆/对话摘要）

```typescript
export const conversationSummaries = sqliteTable('conversation_summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  summary: text('summary').notNull(),     // 对话摘要
  messageCount: integer('message_count'), // 涵盖的消息数量
  startTimestamp: integer('start_timestamp').notNull(),
  endTimestamp: integer('end_timestamp').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('summaries_user_id_idx').on(table.userId),
]);
```

**摘要管理：**
- 每次对话结束时（会话过期或用户关闭），由大模型生成摘要
- 下次对话时注入最近 N 条摘要作为短期记忆
- 超过 30 天的摘要不再注入

## 动态上下文注入与会话生命周期

### 当前问题

当前 `session/manager.ts` 创建 Agent 后缓存 7 天（TTL），systemPrompt 在创建时就固定了。无法实现"每次对话动态注入新数据"。

### 解决方案：每次用户消息时重建 systemPrompt

```
用户发送消息
  ↓
handler 收到消息
  ↓
assembler.assemble(userId)  ← 从数据库查询最新数据，重新读取 prompt 文件
  ↓ 组装成完整的 systemPrompt
session.agent 处理消息（使用新的 systemPrompt）
```

**具体实现方式：**
- Agent 框架（pi-agent-core）的 Agent 支持通过 `context` 传递动态信息
- 每次用户消息时，assembler 查询数据库生成上下文字符串
- 将上下文作为系统消息或 `context` 参数传递给 Agent
- **不重建 Agent 实例**，只更新每次调用的上下文部分
- 静态提示词（core、capabilities、rules）可在会话创建时固定，因为不频繁变化
- 动态上下文（user-profile、recent-records、active-concerns、memories）每次消息时刷新

**组装后的 prompt 结构：**
```
[identity.md]               ← 会话创建时固定
[capabilities/*.md]          ← 会话创建时固定
[rules/*.md]                 ← 会话创建时固定
[动态上下文]                 ← 每次消息时刷新
  - 用户档案
  - 最近记录
  - 活跃症状
  - 长期记忆
  - 短期记忆（对话摘要）
```

### 热更新策略

- **动态数据**（数据库）→ 每次对话自动获取最新
- **静态模板**（prompt 文件）→ assembler 每次读取文件系统，修改后立即生效
  - 不需要文件监视器
  - 不需要重启服务
  - 因为 assembler 在组装时会重新 `readFileSync` 所有 prompt 文件

## Store 模块更新

Schema 变更后，以下 store 模块需要对应更新：

| 模块 | 变更 |
|------|------|
| `src/store/symptom.ts` | `symptom` → `description`，新增 `bodyPart`、`resolvedAt`，删除 `trigger`，`resolve()` 方法适配新字段 |
| `src/store/exercise.ts` | `exerciseType` → `type`，`caloriesBurned` → `calories`，删除 `intensity`，新增心率/距离字段 |
| `src/store/sleep.ts` | `duration` 从小时改为分钟，新增 `deepSleep` |
| `src/store/diet.ts` | 新增 `sodium` 字段 |
| `src/store/water.ts` | 删除 `unit` 字段，统一 ml |
| 新增 `src/store/memory.ts` | memories 表的 CRUD |
| 新增 `src/store/summary.ts` | conversation_summaries 表的 CRUD |

## 工具设计

### 记录工具（调整参数以匹配新 schema）

- `record_body` - 参数不变：weight, bodyFat, bmi, note
- `record_diet` - 新增 sodium 字段
- `record_symptom` - 调整：symptom→description, severity(1-10), 新增 bodyPart, 新增 resolvedAt
- `record_exercise` - 调整：exerciseType→type, caloriesBurned→calories, 删除 intensity, 新增 heartRateAvg/heartRateMax/distance
- `record_sleep` - 调整：duration 单位改为分钟，新增 deepSleep
- `record_water` - 简化：删除 unit，统一 ml
- `get_profile` - 不变
- `update_profile` - 不变

### 新增查询工具（简单查询，大模型自己分析）

- `query_body_records` - 查询身体数据历史
- `query_diet_records` - 查询饮食记录
- `query_symptom_records` - 查询症状记录
- `query_exercise_records` - 查询运动记录
- `query_sleep_records` - 查询睡眠记录
- `query_water_records` - 查询饮水记录

参数统一为：`startTime`（可选）、`endTime`（可选）、`limit`（可选，默认 10）

**返回格式：** 返回原始数据库记录数组，不做任何加工或聚合。所有分析由大模型完成。返回示例：
```json
{
  "records": [
    { "id": 1, "weight": 70.5, "bodyFat": 22.1, "timestamp": 1710000000 },
    { "id": 2, "weight": 69.8, "bodyFat": 21.5, "timestamp": 1710086400 }
  ],
  "count": 2
}
```

### 新增症状解决工具

- `resolve_symptom` - 标记症状已解决
  - 参数：`symptomId`（必需）、`resolvedAt`（可选，默认当前时间）

### 新增记忆工具

- `save_memory` - 保存长期记忆
  - 参数：`content`（必需）、`category`（可选：feedback/preference/fact）
- `query_memories` - 查询长期记忆
  - 参数：`category`（可选）、`limit`（可选，默认 20）
- `delete_memory` - 删除长期记忆
  - 参数：`memoryId`（必需）

## 心跳机制（借鉴 nanobot）

### 实现方式

新增 `src/heartbeat/` 模块：

```
src/heartbeat/
├── scheduler.ts     # 定时调度器，每 15 分钟触发
├── runner.ts        # 读取 heartbeat.md，调用大模型执行任务
└── heartbeat.md     # 任务文件（用户可编辑）
```

### 调度器设计

- 使用 `setInterval` 每 15 分钟触发一次
- 读取 `heartbeat.md` 中的任务列表
- 将任务文本 + 用户最新数据作为 prompt 发送给大模型
- 大模型返回需要主动推送的消息列表
- 通过用户最后活跃的通道发送消息

### 心跳文件格式

```markdown
# Heartbeat Tasks

## Active Tasks
- 检查所有用户，发现昨晚睡眠 < 4 小时的，主动发消息关心
- 检查是否有用户超过 3 天没有记录体重，提醒记录
- 发现 severity >= 8 且超过 2 天无新记录的症状，建议就医
- 发现用户有未解决的过敏相关症状，提醒注意避免过敏原
```

### 输出通道

- 心跳产生的消息通过现有通道推送
- WebSocket：如果用户连接中，直接推送
- QQ Bot：如果用户有最近会话，发送消息
- 如果用户不在线，消息存入 `messages` 表，下次对话时大模型可以看到并提起

### 成本控制

- 心跳触发时，先用简单规则过滤（如 SQL 查询是否有异常数据）
- 只有检测到需要关注的数据时，才调用大模型
- 避免每 15 分钟对所有用户无差别调用 LLM

## 边界情况处理（写在提示词里）

| 场景 | 处理方式 |
|------|---------|
| 急症症状（胸痛、呼吸困难） | 提示用户立即就医，重复三次 |
| 矛盾数据 | 按最新输入覆盖 |
| 问吃什么药 | 只做建议，提醒联系医生核实 |
| 不相关内容 | 正常回复 |
| 工具调用失败 | 告知用户失败，建议重试或换个说法 |

## 暂不处理

- 数据可视化
- 多通道差异化提示词
- 多用户/家庭档案
- 图片分析（后续单独规划）
