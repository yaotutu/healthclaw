# Healthclaw

个人健康顾问 Agent，支持 WebSocket 和 QQ Bot 通道提供健康数据记录和查询服务。

## 架构

按功能域组织，通道无关设计。每个功能的 store、tools、prompts 集中在同一目录。

```
src/
├── features/                 # 按功能域组织（每个功能三件套）
│   ├── body/                 #   store.ts + tools.ts + prompt.md
│   ├── chronic/
│   ├── diet/
│   ├── exercise/
│   ├── heartbeat/            #   心跳任务管理（store 用原生 SQLite）
│   ├── medication/
│   ├── memory/
│   ├── observation/
│   ├── profile/
│   ├── sleep/
│   ├── symptom/
│   ├── water/
│   └── cron/                 #   仅 prompt.md（tools 在 src/cron/，store 在 src/store/）
├── agent/                    # Agent 核心
│   ├── factory.ts            # 创建 Agent 实例（从 features 收集 tools）
│   ├── tool-factory.ts       # createQueryTool 查询工具工厂（共享）
│   ├── tools.ts              # 各功能 tools 聚合入口
│   └── index.ts              # 导出
├── bot/                      # 用户 Bot 管理
│   ├── bot-manager.ts        # BotManager：管理每用户 UserBot 生命周期、通道绑定
│   ├── user-bot.ts           # UserBot：无状态，每条消息创建临时 Agent，串行锁保序
│   └── index.ts              # 导出
├── prompts/                  # 模块化提示词
│   ├── core/                 # 核心角色定义
│   ├── rules/                # 行为规则（安全、风格、主动性、分析指导等）
│   └── assembler.ts          # 提示词组装器（扫描 features/*/prompt.md）
├── session/                  # 对话摘要生成
│   ├── manager.ts            # generateConversationSummary（LLM 压缩对话）
│   └── index.ts              # 导出
├── store/                    # 共享存储基础设施
│   ├── db.ts                 # 数据库连接
│   ├── schema.ts             # 所有表结构定义（17个表，Drizzle 要求集中）
│   ├── record-store.ts       # createRecordStore 通用工厂（共享）
│   ├── channel-binding-store.ts # 通道绑定存储（用户-通道绑定 CRUD）
│   ├── cron-store.ts         # 定时任务存储（cron_jobs 表 CRUD）
│   ├── logs.ts               # 应用日志存储
│   ├── messages.ts           # 消息历史存储
│   ├── summary.ts            # 对话摘要存储
│   ├── json-utils.ts         # JSON 安全解析/序列化工具
│   └── index.ts              # Store 统一入口（外观模式，聚合各 features 的 store）
├── heartbeat/                # 心跳机制
│   ├── scheduler.ts          # 定时调度器（15分钟）
│   ├── runner.ts             # LLM 驱动的心跳检查（读取 DB 任务 + 用户上下文 → LLM 决策）
│   └── index.ts              # 导出
├── cron/                     # 定时任务系统
│   ├── service.ts            # CronService（调度、持久化到 SQLite、执行）
│   ├── tools.ts              # LLM 工具（创建/查看/删除任务）
│   └── index.ts              # 导出
├── channels/                 # 通道适配器
│   ├── types.ts              # 类型定义
│   ├── handler.ts            # 消息处理器
│   ├── factory.ts            # ChannelFactory 接口（通道注册模式）
│   ├── registry.ts           # 通道注册表（获取所有/指定工厂）
│   ├── qq-factory.ts         # QQ 通道工厂实现
│   ├── websocket.ts          # WebSocket 通道
│   ├── qq.ts                 # QQ Bot 通道
│   └── index.ts              # 导出
├── server/                   # HTTP API 服务
│   ├── routes.ts             # Hono 路由（通道管理、用户绑定、状态查询 API）
│   └── index.ts              # 导出
├── infrastructure/           # 基础设施
│   └── logger.ts             # Pino 日志
├── config.ts                 # 集中环境变量管理
└── main.ts                   # 入口文件
```

### 架构特点

- **按功能域组织**: 每个功能的 store、tools、prompt 在同一个 `features/<name>/` 目录下，改一个功能不用跳目录
- **每用户 Bot 实例**: `BotManager` 管理每用户的 `UserBot`（无状态 Agent + Channels），支持独立的生命周期
- **无状态 Agent**: 每条消息从 DB 加载上下文、创建临时 Agent、用完即弃，进程重启不丢状态
- **串行锁**: 同一用户的消息通过 Promise 链串行处理，保证顺序，支持 abort
- **通道无关**: 消息处理与通信通道解耦，通过 `ChannelFactory` 注册模式支持动态添加通道
- **统一存储外观**: Store 类作为统一入口（外观模式），内部从 features 导入各 store，公共 API 不变
- **共享工厂**: `createRecordStore` 和 `createQueryTool` 提供通用 record/query/getLatest 模式，简单功能直接复用
- **自定义 store**: medication、chronic、memory、profile 等有特殊逻辑的功能保持手写实现
- **工具只做存储**: 工具只提供数据存取，所有分析和决策由 AI 完成
- **提示词自动发现**: assembler 扫描 `features/*/prompt.md`，加新功能时不用改 assembler
- **集中配置**: `config.ts` 统一管理环境变量，各模块不直接读取 `process.env`

### 功能模块说明

| 功能 | store 模式 | 特殊方法 |
|------|-----------|---------|
| body | createRecordStore | - |
| diet | createRecordStore | - |
| sleep | createRecordStore | - |
| exercise | createRecordStore | - |
| water | createRecordStore | - |
| observation | createRecordStore | tags JSON 序列化 |
| symptom | 手写 | resolve (标记已解决) |
| medication | 手写 | stop (标记停药), activeOnly 查询 |
| chronic | 手写 | add/update/deactivate, 无 timestamp 列 |
| memory | 手写 | save/query/remove/getAll |
| profile | 手写 | get/upsert |
| heartbeat | 手写（原生 SQLite） | getEnabledTasks/addTask/removeTask/setEnabled |
| cron | 仅 prompt.md | tools 在 src/cron/，store 在 src/store/cron-store.ts |

## 通道

### WebSocket

**端点:** `/ws`

```typescript
// 客户端 -> 服务器
{ type: 'prompt', content: '...', sessionId?: string }
{ type: 'continue', sessionId?: string }
{ type: 'abort', sessionId?: string }

// 服务器 -> 客户端
{ type: 'event', event: AgentEvent }
{ type: 'done' }
{ type: 'error', error: string }
```

### QQ Bot

通过 `pure-qqbot` 库实现，自动回复用户消息（不支持流式，累积后发送）。QQ 凭证通过 Web 登录页绑定，存储在 `channel_bindings` 表中，不再使用环境变量。

### 通道注册

通道通过 `ChannelFactory` 接口注册到 `ChannelRegistry`，支持动态添加新通道：
- 每个工厂定义通道类型、配置字段、帮助文本
- `QqChannelFactory` 实现 QQ 通道的注册和创建
- 用户通过 HTTP API（`/api/bind`）绑定通道凭证

### 通道能力声明

通道通过 `ChannelContext.capabilities` 声明自身能力，handler 根据能力决定行为：

- **默认（不声明 capabilities）**: 非流式通道，handler 通过 `send()` 发送完整响应
- **`capabilities: { streaming: true }`**: 流式通道，handler 通过 `sendStream()` 推送增量内容
- handler 始终通过 `context.capabilities?.streaming` 判断，**不依赖 `sendStream` 函数是否存在**

## 数据类型

### 身体数据 (body)
- `weight` (kg) - 体重
- `bodyFat` (%) - 体脂率
- `bmi` - BMI指数
- `note` - 备注

### 饮食记录 (diet)
- `food` - 食物名称
- `calories` (kcal) - 热量
- `protein` (g) - 蛋白质
- `carbs` (g) - 碳水化合物
- `fat` (g) - 脂肪
- `sodium` (mg) - 钠
- `mealType` - 餐次（早餐/午餐/晚餐/加餐）

### 症状记录 (symptom) ⭐
- `description` - 症状描述
- `severity` (1-10) - 严重程度
- `bodyPart` - 身体部位
- `relatedType` - 关联记录类型
- `relatedId` - 关联记录ID
- `resolvedAt` - 解决时间

### 运动记录 (exercise)
- `type` - 运动类型
- `duration` (分钟) - 时长
- `calories` (kcal) - 消耗热量
- `heartRateAvg` (bpm) - 平均心率
- `heartRateMax` (bpm) - 最大心率
- `distance` (km) - 距离

### 睡眠记录 (sleep)
- `duration` (分钟) - 睡眠时长
- `quality` (1-5) - 睡眠质量
- `bedTime` - 入睡时间
- `wakeTime` - 醒来时间
- `deepSleep` (分钟) - 深睡时长

### 饮水记录 (water)
- `amount` (ml) - 饮水量

### 用户档案 (profile)
- `height` (cm) - 身高
- `age` - 年龄
- `gender` - 性别
- `diseases` - 疾病史（JSON数组）
- `allergies` - 过敏史（JSON数组）
- `dietPreferences` - 饮食偏好
- `healthGoal` - 健康目标

**注意**: 体重不再存储在档案中，而是通过 `body_records` 记录历史体重。

## 命令

```bash
bun run dev        # 启动服务 + Web 前端（开发模式）
bun run server     # 启动服务 (端口 3001)
bun run build      # 编译 TypeScript + Web 前端
bun run typecheck  # 类型检查
bun run db:push    # 推送 schema 变更到 SQLite
```

## 配置

通过环境变量配置（推荐创建 `.env` 文件），由 `src/config.ts` 集中管理：

```bash
# 服务器
PORT=3001
DB_PATH=./data/healthclaw.db

# QQ Bot 通过 Web 登录页绑定，不再使用环境变量
# 凭证存储在 channel_bindings 表中

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6

# 心跳
HEARTBEAT_INTERVAL_MS=900000  # 心跳检查间隔（默认 15 分钟）

# 会话
SESSION_SUMMARY_INTERVAL_MS=14400000  # 惰性摘要触发间隔（默认 4 小时）

# 其他
TEST_MODE=0          # 设为 1 时不记录历史和摘要
LOG_LEVEL=info       # debug / info / warn / error
NODE_ENV=development
```

## 日志规范

使用 `createLogger(module)` 工厂函数创建模块专用 logger。

### 创建 Logger

每个模块文件顶部：
```typescript
import { createLogger } from '../infrastructure/logger';
const log = createLogger('handler');  // module 名见下表
```

### Module 命名

| module | 文件 |
|--------|------|
| app | main.ts |
| agent | agent/factory.ts |
| llm | agent/factory.ts（LLM 调用专用，与 agent 分开创建第二个实例） |
| bot | bot/*.ts |
| handler | channels/handler.ts |
| ws | channels/websocket.ts |
| qq | channels/qq*.ts |
| cron | cron/*.ts |
| heartbeat | heartbeat/*.ts |
| store | store/*.ts, features/*/store.ts |
| api | server/routes.ts |
| session | session/*.ts |

### 什么记

**info — 状态变更**（发生了不可逆的事，需要知道它发生过）：
- 服务启停：server started/stopped
- 绑定变更：bot started/unbound userId=xxx channel=xxx
- 定时任务增删：cron added/removed id=xxx
- 心跳触发结果：heartbeat checked users=N alerts=N

**error — 操作失败**（失败本身有排查价值）：
- 外部调用失败：qq push failed userId=xxx error=xxx
- 意料之外的异常：shutdown error=xxx
- 降级处理：fallback send failed userId=xxx error=xxx

**debug — 开发调试**（开发时开 debug 可见）：
- LLM 调用摘要：LLM call model=xxx inputTokens=N outputTokens=N
- 内部流程细节

### 什么不记

- **常规数据读写** — record_* 工具的调用、get_recent_* 查询结果。消息历史已有完整记录。
- **消息收发** — handler processing。消息历史已有。但保留状态变更日志：summary generated、request aborted。
- **完整 LLM payload** — 太大。只记 debug 级别的摘要。
- **store 层的常规操作** — insert/update 成功。出了问题用 error 记。

### 格式

```typescript
// 英文，key=value 参数
log.info('server started port=%d', port);
log.error('push failed userId=%s error=%s', userId, err.message);

// LLM 结构化数据用 raw
const llmLog = createLogger('llm');
llmLog.raw.debug({ payload }, 'request model=%s', model);

// 禁止
console.log                          // 用 log.info/debug/error
log.info('[handler] processing')     // module 前缀自动加，不要手写
log.info('图片下载失败')              // 用英文
```

## 存储

使用 SQLite 数据库存储健康记录和消息历史，通过 Drizzle ORM 提供类型安全的数据库操作。

### 数据表

| 表名 | 说明 |
|------|------|
| `user_profiles` | 用户档案（不含体重） |
| `body_records` | 身体数据（体重、体脂、BMI） |
| `diet_records` | 饮食记录（含营养成分） |
| `symptom_records` | 症状记录（可关联其他记录） |
| `exercise_records` | 运动记录 |
| `sleep_records` | 睡眠记录 |
| `water_records` | 饮水记录 |
| `medication_records` | 用药记录 |
| `chronic_conditions` | 慢性病追踪 |
| `health_observations` | 健康观察 |
| `messages` | 会话消息历史 |
| `memories` | 长期记忆（用户偏好、反馈、重要事实） |
| `conversation_summaries` | 对话摘要（短期记忆） |
| `logs` | 应用日志 |
| `heartbeat_tasks` | 用户心跳任务 |
| `channel_bindings` | 用户通道绑定（存储 QQ 等通道凭证） |
| `cron_jobs` | 定时任务（支持 at/every/cron 三种调度） |

### Agent 工具

#### 记录工具
- `record_body` - 记录身体数据
- `record_diet` - 记录饮食
- `record_symptom` - 记录症状/不适
- `record_exercise` - 记录运动
- `record_sleep` - 记录睡眠
- `record_water` - 记录饮水

#### 用药管理
- `record_medication` - 记录用药
- `query_medication_records` - 查询用药记录
- `stop_medication` - 标记停药

#### 慢性病管理
- `record_chronic_condition` - 记录慢性病
- `update_chronic_condition` - 更新慢性病
- `query_chronic_conditions` - 查询慢性病
- `deactivate_chronic_condition` - 停用慢性病追踪

#### 健康观察
- `record_observation` - 记录健康观察
- `query_observations` - 查询健康观察

#### 档案工具
- `get_profile` - 获取用户档案
- `update_profile` - 更新用户档案

#### 查询工具
- `query_body_records` - 查询身体数据历史
- `query_diet_records` - 查询饮食记录
- `query_symptom_records` - 查询症状记录
- `query_exercise_records` - 查询运动记录
- `query_sleep_records` - 查询睡眠记录
- `query_water_records` - 查询饮水记录

#### 症状管理
- `resolve_symptom` - 标记症状已解决

#### 记忆工具
- `save_memory` - 保存长期记忆
- `query_memories` - 查询长期记忆
- `delete_memory` - 删除长期记忆

#### 心跳任务工具
- `add_heartbeat_task` - 添加心跳检查任务
- `list_heartbeat_tasks` - 查看心跳任务
- `remove_heartbeat_task` - 删除心跳任务

#### 定时任务工具
- `schedule_cron` - 创建定时任务
- `list_cron_jobs` - 查看定时任务
- `remove_cron_job` - 删除定时任务

**设计原则**: 工具只提供数据存储功能，所有分析和决策由 AI 完成。

### 提示词架构

提示词采用模块化组织，通过 assembler 动态组装：

**功能提示词**（每个功能目录下，assembler 自动扫描）：
- `src/features/*/prompt.md` - 各功能的工具使用说明和注意事项

**全局规则**（修改文件后立即生效，无需重启）：
- `src/prompts/core/` - 角色定义
- `src/prompts/rules/` - 行为规则（安全、风格、主动性、分析指导、查询指导）

**动态部分**（每次消息前从数据库查询）：
- 用户档案、最近记录、活跃症状、慢性病、长期记忆、对话摘要

**设计原则**: 所有决策由大模型完成，提示词只提供指导和数据。

### 心跳机制

每 15 分钟扫描所有用户，LLM 驱动决策：
1. 从 `heartbeat_tasks` 表读取每个用户的心跳任务（自然语言提示词）
2. 收集用户完整上下文（档案、最近记录、活跃症状、慢性病、记忆等）
3. 将任务 + 上下文发给 LLM，由 LLM 决定是否需要主动发送关怀消息
4. 通过 WebSocket/QQ 通道推送消息给用户

用户可通过对话管理心跳任务：`add_heartbeat_task`、`list_heartbeat_tasks`、`remove_heartbeat_task`。

### 定时任务系统

LLM 可在对话中为用户创建定时任务，支持三种调度模式：
- `everySeconds`: 周期性（如 3600=每小时）
- `cronExpr`: cron 表达式（如 "0 9 * * *"=每天9点）
- `at`: 一次性（指定时间执行后自动删除）

任务通过 `CronService` 管理，持久化到 `cron_jobs` SQLite 表，重启后自动恢复。

### 记忆系统

**长期记忆** (`memories` 表):
- 由大模型通过 `save_memory` 工具主动记录
- 存储用户偏好、反馈、重要事实
- 每次对话注入上下文

**短期记忆** (`conversation_summaries` 表):
- 用户消息间隔超过阈值（默认 4 小时）时，惰性触发 LLM 生成上一段对话摘要
- 触发时机在 handler 中：用户发消息时检查间隔，异步生成（fire-and-forget，不阻塞）
- 最近30天的摘要注入上下文
- 超过30天自动过期

### 用户 Bot 管理

`BotManager` 管理每用户的 `UserBot` 实例：
- `UserBot` 封装单用户的无状态 Agent + Channels，每条消息创建临时 Agent，用完即弃
- 串行锁（Promise 链）保证同一用户的消息按顺序处理，支持 abort
- 用户通过 HTTP API 或 Web 登录页绑定通道（如 QQ）
- 绑定时自动创建 UserBot 实例并启动通道监听
- 支持解绑（删除通道绑定并停止 Bot）

### HTTP API

通过 Hono 提供 REST API（定义在 `src/server/routes.ts`）：
- `GET /api/channels` - 获取可用通道列表
- `POST /api/bind` - 绑定用户通道（提交通道凭证）
- `DELETE /api/bind/:userId` - 解绑用户通道
- `GET /api/status/:userId` - 查询用户 Bot 状态


# 重要规则，用户手动填写，禁止修改

## 核心原则（不可违反，不可修改）

### 原则一：用户消息永久保留

用户的所有消息都是关于身体健康的，具有不可替代的价值。必须永久保留，绝不允许丢失。

- 原始消息是系统的 source of truth，是最高优先级的数据资产
- 即使当前处理不完美也没关系，只要原始数据在，未来可以用更好的模型重新分析
- 健康数据的价值随时间递增——一条记录单独看没意义，积累数月就能看到趋势
- 禁止实现任何自动删除或过期清理消息的机制
- 禁止导出可能被误用来删除消息的接口（如 `clear()` 函数）

### 原则二：零硬编码，智能全交给 LLM

代码只做基础设施（数据存取、通道传输、调度），所有分析、决策、判断全部交给 LLM。

- 工具只提供数据存取能力，不包含任何健康判断逻辑
- 不硬编码健康阈值（BMI 范围、热量上限、血压标准等），这些由提示词引导 LLM
- 不在代码中做数据过滤或筛除，原始数据完整交给 LLM，由 LLM 决定哪些相关
- 需要新的分析能力时，加数据 + 加提示词，而不是加代码逻辑

## 编码规范

- 添加详细的中文注释，解释每个函数和重要代码块的作用
- 避免过度设计，保持代码简洁易懂
