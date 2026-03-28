# 数据库重新设计实施计划

**任务**: 将通用 `health_records` 表拆分为各数据类型独立表，新增 `symptom_records` 表，移除 `user_profiles.weight`，优化图片存储。

**日期**: 2026-03-28

**关联文档**: `docs/superpowers/specs/2026-03-28-database-redesign.md`

---

## 背景

当前数据库设计存在以下问题：
- `health_records` 表过于通用，使用 `json_extract()` 查询复杂
- `user_profiles.weight` 字段与记录表分离，数据不一致风险
- `messages.metadata` 存储 base64 图片，数据膨胀

新设计将数据表按类型分离，支持症状追踪，并优化存储。

---

## 阶段一：数据层重构（核心）

### 步骤 1.1: 重写 Schema 定义

**文件**: `src/store/schema.ts`

**操作**: 完全重写，删除 `healthRecords` 表，新增 6 个独立表

**新表结构**:
1. `body_records` - 体重、体脂率等身体数据
2. `diet_records` - 饮食记录
3. `symptom_records` - 症状/不适记录（新功能）
4. `exercise_records` - 运动记录
5. `sleep_records` - 睡眠记录
6. `water_records` - 饮水记录

**保留表**:
- `user_profiles`（移除 weight 字段）
- `messages`

**关键变更**:
- 所有记录表统一包含 `user_id`, `recorded_at`, `created_at`
- `symptom_records` 包含 `related_type` 和 `related_id` 用于关联其他记录
- 移除 `userProfiles.weight` 字段

---

### 步骤 1.2: 更新数据库连接

**文件**: `src/store/db.ts`

**操作**: 更新导入的表名和 schema 注册

```typescript
import {
  userProfiles,
  bodyRecords,
  dietRecords,
  symptomRecords,
  exerciseRecords,
  sleepRecords,
  waterRecords,
  messages
} from './schema';

const db = drizzle(sqlite, {
  schema: {
    userProfiles,
    bodyRecords, dietRecords, symptomRecords,
    exerciseRecords, sleepRecords, waterRecords,
    messages
  }
});
```

---

### 步骤 1.3: 删除通用健康存储

**文件**: `src/store/health.ts`

**操作**: 删除此文件（已不存在需要更新的引用）

---

### 步骤 1.4: 创建独立存储模块

**新建文件**: `src/store/body.ts`

```typescript
export const createBodyStore = (db: Db) => {
  const record = async (userId: string, data: BodyRecordData): Promise<BodyRecord>
  const query = async (userId: string, options: QueryOptions): Promise<BodyRecord[]>
  return { record, query }
}
```

**BodyRecordData** 字段:
- `weight`: number (kg)
- `bodyFat?`: number (%)
- `muscle?`: number (kg)
- `note?: string`

**新建文件**: `src/store/diet.ts`

```typescript
export const createDietStore = (db: Db) => {
  const record = async (userId: string, data: DietRecordData): Promise<DietRecord>
  const query = async (userId: string, options: QueryOptions): Promise<DietRecord[]>
  return { record, query }
}
```

**DietRecordData** 字段:
- `food: string` - 食物名称
- `calories: number` (kcal)
- `protein?: number` (g)
- `carbs?: number` (g)
- `fat?: number` (g)
- `sodium?: number` (mg)
- `note?: string`

**新建文件**: `src/store/symptom.ts` ⭐ 核心新功能

```typescript
export const createSymptomStore = (db: Db) => {
  const record = async (userId: string, data: SymptomRecordData): Promise<SymptomRecord>
  const query = async (userId: string, options: QueryOptions): Promise<SymptomRecord[]>
  return { record, query }
}
```

**SymptomRecordData** 字段:
- `description: string` - 症状描述
- `severity?: number` - 严重程度 1-10
- `bodyPart?: string` - 身体部位
- `relatedType?: string` - 关联记录类型（可选）
- `relatedId?: number` - 关联记录ID（可选）
- `resolvedAt?: number` - 解决时间（可选）
- `note?: string`

**新建文件**: `src/store/exercise.ts`

```typescript
export const createExerciseStore = (db: Db) => {
  const record = async (userId: string, data: ExerciseRecordData): Promise<ExerciseRecord>
  const query = async (userId: string, options: QueryOptions): Promise<ExerciseRecord[]>
  return { record, query }
}
```

**ExerciseRecordData** 字段:
- `type: string` - 运动类型
- `duration: number` (分钟)
- `calories?: number` (kcal)
- `heartRateAvg?: number` (bpm)
- `distance?: number` (km)
- `note?: string`

**新建文件**: `src/store/sleep.ts`

```typescript
export const createSleepStore = (db: Db) => {
  const record = async (userId: string, data: SleepRecordData): Promise<SleepRecord>
  const query = async (userId: string, options: QueryOptions): Promise<SleepRecord[]>
  return { record, query }
}
```

**SleepRecordData** 字段:
- `duration: number` (分钟)
- `quality?: number` (1-5)
- `bedTime?: number` (时间戳)
- `wakeTime?: number` (时间戳)
- `deepSleep?: number` (分钟)
- `note?: string`

**新建文件**: `src/store/water.ts`

```typescript
export const createWaterStore = (db: Db) => {
  const record = async (userId: string, data: WaterRecordData): Promise<WaterRecord>
  const query = async (userId: string, options: QueryOptions): Promise<WaterRecord[]>
  return { record, query }
}
```

**WaterRecordData** 字段:
- `amount: number` (ml)
- `note?: string`

---

### 步骤 1.5: 更新档案存储

**文件**: `src/store/profile.ts`

**操作**: 移除 weight 相关处理

**修改**:
- `upsert` 方法不再接受 weight 参数
- 类型定义更新（从 schema 导入已自动生效）

---

### 步骤 1.6: 重写 Store 主类

**文件**: `src/store/index.ts`

**操作**: 完全重写

**关键变更**:
1. 导入新的 6 个存储创建函数
2. Store 类新增 6 个只读属性: `body`, `diet`, `symptom`, `exercise`, `sleep`, `water`
3. 删除 `health` 属性
4. `initTables()` 完全重写：
   - 创建 6 个新表
   - 迁移旧 `health_records` 数据到对应新表（一次性）
   - 删除 `health_records` 表
   - 不修改 `user_profiles` 结构（保留 weight 列避免破坏性变更，但代码不再使用）

**数据迁移策略**:
```sql
-- 体重数据迁移
INSERT INTO body_records (user_id, weight, note, recorded_at, created_at)
SELECT user_id, value, note, timestamp, timestamp
FROM health_records
WHERE type = 'weight';

-- 类似迁移 diet, exercise, sleep, water...

-- 删除旧表（迁移完成后）
DROP TABLE health_records;
```

---

## 阶段二：Agent 工具层重构

### 步骤 2.1: 重写工具定义

**文件**: `src/agent/tools.ts`

**操作**: 完全重写

**新工具列表**:
1. `record_body` - 记录身体数据（体重等）
2. `record_diet` - 记录饮食
3. `record_symptom` ⭐ - 记录症状
4. `record_exercise` - 记录运动
5. `record_sleep` - 记录睡眠
6. `record_water` - 记录饮水
7. `get_profile` - 获取档案（保持不变）
8. `update_profile` - 更新档案（移除 weight 参数）

**删除工具**:
- `record_health_data`（通用记录）
- `query_health_data`（通用查询）
- `analyze_diet`（不再需要，AI 直接分析原始数据）

**工具设计原则**: 遵循用户要求 "工具只提供数据，AI 做所有决策"
- 只提供简单的 record/query 操作
- 不内置分析逻辑
- 返回完整原始数据，由 AI 决定如何解读

**工具签名示例**:
```typescript
const recordBodyTool: AgentTool<{
  weight: number;           // kg
  bodyFat?: number;         // %
  muscle?: number;          // kg
  note?: string;
}> = {
  name: 'record_body',
  description: '记录身体数据（体重、体脂等）',
  parameters: Type.Object({
    weight: Type.Number(),
    bodyFat: Type.Optional(Type.Number()),
    muscle: Type.Optional(Type.Number()),
    note: Type.Optional(Type.String())
  }),
  execute: async ({ weight, bodyFat, muscle, note }) => {
    const record = await store.body.record(userId, {
      weight, bodyFat, muscle, note,
      recordedAt: Date.now()
    });
    return { success: true, record };
  }
};
```

---

### 步骤 2.2: 更新系统提示词

**文件**: `src/agent/prompt.ts`

**操作**: 重写提示词

**新增内容**:
- 症状记录工具的使用说明
- 各独立工具的使用场景
- 强调 AI 自主分析数据

**移除内容**:
- `record_health_data` 和 `query_health_data` 的说明
- `analyze_diet` 工具说明
- 体重在档案中的说明

---

### 步骤 2.3: 更新 Agent 工厂

**文件**: `src/agent/factory.ts`

**操作**:
1. 更新 `toolList` 数组，使用新的 8 个工具
2. 更新档案注入逻辑，移除 weight 字段显示

---

## 阶段三：消息存储优化

### 步骤 3.1: 更新消息元数据处理

**文件**: `src/channels/handler.ts`

**操作**: 修改图片存储逻辑

**当前逻辑**:
```typescript
// 存储 base64 图片数据
metadata: JSON.stringify({ images: base64Images })
```

**新逻辑**:
```typescript
// 只存储元信息（URL、format、size）
metadata: JSON.stringify({
  images: imageMetadata  // 不包含 data 字段
})
```

---

### 步骤 3.2: 更新消息转换逻辑

**文件**: `src/agent/factory.ts` - `convertMessages`

**操作**: 修改多模态消息重建逻辑

**说明**: 由于只存储元信息，恢复消息时不再能从 metadata 获取图片数据。处理方式：
- 文本内容保持不变
- 图片内容在 LLM 上下文中以 `[图片: ${format}]` 占位符表示
- 实际图片分析在首次接收时已由 AI 完成并记录结论

---

## 文件变更清单

| 文件路径 | 操作类型 | 说明 |
|---------|---------|------|
| `src/store/schema.ts` | 重写 | 删除 healthRecords，新增 6 表 |
| `src/store/db.ts` | 修改 | 更新 schema 注册 |
| `src/store/health.ts` | 删除 | 移除通用存储 |
| `src/store/body.ts` | 新建 | 体重/身体数据存储 |
| `src/store/diet.ts` | 新建 | 饮食记录存储 |
| `src/store/symptom.ts` | 新建 ⭐ | 症状记录存储 |
| `src/store/exercise.ts` | 新建 | 运动记录存储 |
| `src/store/sleep.ts` | 新建 | 睡眠记录存储 |
| `src/store/water.ts` | 新建 | 饮水记录存储 |
| `src/store/profile.ts` | 修改 | 移除 weight 处理 |
| `src/store/index.ts` | 重写 | 6 新存储，新 initTables |
| `src/agent/tools.ts` | 重写 | 8 个新工具 |
| `src/agent/prompt.ts` | 重写 | 新工具说明，症状指导 |
| `src/agent/factory.ts` | 修改 | 新 toolList，档案处理 |
| `src/channels/handler.ts` | 修改 | 图片元数据存储 |

---

## 实施顺序

1. **阶段一**（数据层）：
   - 步骤 1.1 → 1.2 → 1.3 → (1.4 并行创建 6 个文件) → 1.5 → 1.6
   - 完成后运行 `bun run typecheck` 验证

2. **阶段二**（Agent 层）：
   - 步骤 2.1 → 2.2 → 2.3
   - 完成后运行 `bun run typecheck` 验证

3. **阶段三**（优化）：
   - 步骤 3.1 → 3.2
   - 完成后运行 `bun run typecheck` 验证

4. **测试**：
   - 启动服务器 `bun run server`
   - 测试各类型记录工具
   - 测试症状记录功能

---

## 验收标准

- [ ] TypeScript 编译通过 `bun run typecheck`
- [ ] 服务器正常启动 `bun run server`
- [ ] 所有 6 种数据类型可正常记录
- [ ] 症状记录功能工作正常（可关联其他记录）
- [ ] 用户档案不再包含 weight 字段
- [ ] 图片不再存储 base64 数据
