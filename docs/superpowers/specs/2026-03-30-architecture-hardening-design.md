# Architecture Hardening Design

Date: 2026-03-30

## Background

Healthclaw 的数据库 schema 存在双重定义问题（Drizzle schema + raw SQL），已经产生了不一致。同时 JSON 字段缺少安全解析，多处 `JSON.parse` 没有 try-catch 保护。本设计旨在消除这些基础设施层的隐患。

## 改动范围

四项改进，均不涉及业务逻辑变更。

---

## 1. Drizzle Kit 迁移 — 消除 Schema 双重定义

### 问题

- `schema.ts` (Drizzle) 和 `store/index.ts` (raw SQL) 两处定义表结构，已漂移：
  - `diet_records.food`: Drizzle nullable vs SQL `NOT NULL`
  - `diet_records.calories`: Drizzle `real` nullable vs SQL `INTEGER NOT NULL`
  - `user_profiles`: SQL 残留 `weight` 列，Drizzle 已移除
  - `exercise_records.duration/calories`: nullable 不一致
- `db.ts` 未注册 `heartbeatTasks` 和 `logs` 表
- raw SQL `CREATE TABLE IF NOT EXISTS` 不会更新已有表结构

### 方案

- **schema.ts**: 补全所有缺失索引，新增 `logs` 表定义
- **db.ts**: 注册 `heartbeatTasks` 和 `logs` 到 Drizzle schema 映射
- **新增 `drizzle.config.ts`**: 配置 Drizzle Kit
- **store/index.ts**: 删除 `initTables()` 方法，构造函数改为调用 Drizzle 迁移
- **package.json**: 添加 `db:generate`、`db:push`、`db:migrate` 命令

### 迁移策略

- 首次使用 `drizzle-kit push`（已有数据库文件）
- 后续用 `drizzle-kit generate` + `drizzle-kit migrate` 管理增量变更

---

## 2. 数据库索引完善

### 问题

10 个表的 `user_id` 索引只在 raw SQL 中定义，Drizzle schema 里缺失。

### 方案

在 `schema.ts` 中为每个 record 表补上 `userId` 索引：

- bodyRecords, dietRecords, symptomRecords, exerciseRecords
- sleepRecords, waterRecords, medicationRecords, chronicConditions
- healthObservations, messages, logs

统一用 Drizzle 的 `index('name').on(table.userId)` 声明。

---

## 3. JSON 字段 safeJson 工具

### 问题

`assembler.ts` 中 3 处 `JSON.parse` 没有 try-catch（`diseases`、`allergies`、`tags`、`triggers`），数据损坏时会 crash。

### 方案

- 新增 `src/store/json-utils.ts`:
  - `safeJsonParse<T>(text: string | null, fallback: T): T` — 安全解析，失败返回 fallback
  - `safeJsonStringify(value: unknown): string` — 安全序列化
- 替换所有直接 `JSON.parse` 为 `safeJsonParse`
- 涉及文件：`assembler.ts`、`features/observation/store.ts`、`features/chronic/store.ts`、`features/profile/store.ts`

---

## 4. 错误处理增强

### 问题

- `assembler.ts:73-74` — `JSON.parse(profile.diseases/allergies)` 无保护
- `assembler.ts:166` — `JSON.parse(r.tags)` 无保护
- `assembler.ts:208` — `JSON.parse(c.triggers)` 无保护

### 方案

- 第 3 项的 `safeJsonParse` 统一解决所有 `JSON.parse` 问题
- 已有的 `.catch(() => [])` 模式保留（已经足够好）
- `factory.ts` 的硬编码 usage 保留（框架要求格式）

---

## 修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/store/schema.ts` | 修改 | 补索引、加 logs 表 |
| `src/store/db.ts` | 修改 | 注册 heartbeatTasks、logs |
| `src/store/index.ts` | 修改 | 删除 initTables()，改用迁移 |
| `src/store/json-utils.ts` | 新增 | safeJsonParse/safeJsonStringify |
| `src/prompts/assembler.ts` | 修改 | 用 safeJsonParse 替换 JSON.parse |
| `drizzle.config.ts` | 新增 | Drizzle Kit 配置 |
| `package.json` | 修改 | 添加 db 脚本 |
| 各 feature store | 修改 | JSON 字段读写用 safeJson 工具 |

## 不涉及

- 业务逻辑变更
- API 接口变更
- 新功能添加
