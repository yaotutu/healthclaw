# Healthclaw

个人健康顾问 Agent，支持 WebSocket 和 QQ Bot 通道提供健康数据记录和查询服务。

## 架构

采用简化分层架构，通道无关设计。

```
src/
├── agent/            # Agent 核心
│   ├── factory.ts         # 创建 Agent 实例
│   ├── prompt.ts          # 系统提示词
│   ├── tools.ts           # record, query 工具
│   └── index.ts           # 导出
├── session/          # 会话管理
│   ├── manager.ts         # 会话生命周期管理
│   └── index.ts           # 导出
├── store/            # 存储层 (SQLite + Drizzle ORM)
│   ├── db.ts              # 数据库连接
│   ├── schema.ts          # 表结构定义
│   ├── health.ts          # 健康记录存储
│   ├── messages.ts        # 消息历史存储
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

### 新增通道规则

- **不支持流式的通道不要定义 `sendStream`**。handler 通过 `!context.sendStream` 判断通道类型：有 `sendStream` 走流式推送，没有则通过 `send()` 发送完整响应。定义了无效的 `sendStream` stub 会导致消息丢失。

## 数据类型

- `weight` (体重)
- `sleep` (睡眠)
- `diet` (饮食)
- `exercise` (运动)
- `water` (饮水)

每条记录包含：`id`, `type`, `value`, `unit`, `timestamp`, `note`

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

使用 SQLite 数据库存储健康记录和消息历史：
- `health_records` 表：健康数据记录
- `messages` 表：会话消息历史

通过 Drizzle ORM 提供类型安全的数据库操作。
