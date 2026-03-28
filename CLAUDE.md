# Healthclaw

个人健康顾问 Agent，支持 WebSocket 和 QQ Bot 通道提供健康数据记录和查询服务。

## 架构

采用简化分层架构，通道无关设计。

```
src/
├── agent/            # Agent 核心
│   ├── factory.ts         # 创建 Agent 实例
│   ├── prompt.ts          # 系统提示词
│   ├── tools.ts           # 各类型记录工具、档案工具
│   └── index.ts           # 导出
├── session/          # 会话管理
│   ├── manager.ts         # 会话生命周期管理
│   └── index.ts           # 导出
├── store/            # 存储层 (SQLite + Drizzle ORM)
│   ├── db.ts              # 数据库连接
│   ├── schema.ts          # 表结构定义（8个表）
│   ├── body.ts            # 身体数据存储（体重等）
│   ├── diet.ts            # 饮食记录存储
│   ├── symptom.ts         # 症状记录存储 ⭐
│   ├── exercise.ts        # 运动记录存储
│   ├── sleep.ts           # 睡眠记录存储
│   ├── water.ts           # 饮水记录存储
│   ├── messages.ts        # 消息历史存储
│   ├── profile.ts         # 用户档案存储
│   └── index.ts           # Store 统一入口
├── channels/         # 通道适配器
│   ├── types.ts           # ChannelAdapter, ChannelMessage 等类型
│   ├── handler.ts         # 消息处理器（通道无关）
│   ├── websocket.ts       # WebSocket 通道实现
│   ├── qq.ts              # QQ Bot 通道实现
│   └── index.ts           # 导出
├── infrastructure/   # 基础设施
│   └── logger.ts          # Pino 日志
└── main.ts           # 入口文件
```

### 架构特点

- **通道无关**: 消息处理与通信通道解耦，支持 WebSocket 和 QQ Bot
- **统一存储**: SQLite + Drizzle ORM，类型安全的数据库操作
- **分表存储**: 按数据类型分表（身体、饮食、症状、运动、睡眠、饮水），支持症状关联追踪
- **流式响应**: 支持打字机效果的流式输出

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

通过 `pure-qqbot` 库实现，自动回复用户消息（不支持流式，累积后发送）。

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
bun run server     # 启动服务 (端口 3001)
bun run build      # 编译
bun run typecheck  # 类型检查
```

## 配置

通过环境变量配置（推荐创建 `.env` 文件）：

```bash
# 服务器
PORT=3001
DB_PATH=./workspace/healthclaw.db

# QQ Bot (可选)
QQBOT_APP_ID=your_app_id
QQBOT_APP_SECRET=your_app_secret
QQBOT_CLIENT_SECRET=your_client_secret  # 可选，默认使用 APP_SECRET

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6

# 日志
LOG_LEVEL=debug    # debug / info / warn / error
NODE_ENV=development
```

## 日志规范

使用 pino 结构化日志，格式：`[模块名] 操作 key=value`

```typescript
logger.info('[app] server started port=%d', 3001);
logger.info('[qq] channel started');
logger.error('[app] fatal error=%s', err.message);
```

**禁止使用** `console.log`

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
| `messages` | 会话消息历史 |

### 图片存储

消息中的图片仅存储元信息（格式、MIME类型），不存储 base64 数据，避免数据库膨胀。实际图片分析在首次接收时由 AI 完成并记录结论。

### Agent 工具

- `record_body` - 记录身体数据
- `record_diet` - 记录饮食
- `record_symptom` - 记录症状/不适
- `record_exercise` - 记录运动
- `record_sleep` - 记录睡眠
- `record_water` - 记录饮水
- `get_profile` - 获取用户档案
- `update_profile` - 更新用户档案

**设计原则**: 工具只提供数据存储功能，所有分析和决策由 AI 完成。


# 重要规则，用户手动填写，禁止修改
- 添加详细的中文注释，解释每个函数和重要代码块的作用
