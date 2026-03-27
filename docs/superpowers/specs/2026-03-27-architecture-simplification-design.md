# Healthclaw 架构简化设计

## 背景

当前架构采用 Clean Architecture 模式，分层过多（domain → infrastructure → application → channels），对于一个个人健康助手来说过度设计。

**问题：**
- `domain/events.ts` 预留但从未使用
- 类型重复定义（`interface/websocket/types.ts` 和 `channels/websocket/types.ts`）
- 混合存储（SQLite 用于消息，JSON 用于健康数据）
- 抽象层过多，新增通道需要理解多层结构

## 目标

1. 简化代码结构，减少文件数量和抽象层
2. 让新增通道（QQ Bot、微信 Bot、飞书等）更容易
3. 统一存储到 SQLite（使用 Drizzle ORM）
4. 保持多通道扩展能力

## 新架构

```
src/
├── channels/           # 通道层
│   ├── types.ts        # ChannelAdapter 接口 + 消息类型
│   ├── handler.ts      # 统一消息处理器
│   ├── websocket.ts    # WebSocket 实现
│   └── index.ts
├── agent/              # Agent 模块
│   ├── factory.ts      # Agent 创建
│   ├── prompt.ts       # 系统提示词
│   ├── tools.ts        # record/query 工具
│   └── index.ts
├── session/            # 会话模块
│   ├── manager.ts      # 会话生命周期管理
│   └── index.ts
├── store/              # 存储模块
│   ├── db.ts           # Drizzle 连接初始化
│   ├── schema.ts       # 表结构定义
│   ├── health.ts       # 健康数据操作
│   ├── messages.ts     # 消息历史操作
│   └── index.ts
└── main.ts             # 入口
```

## 模块设计

### channels/ - 通道层

**types.ts**
```typescript
export interface ChannelAdapter {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: MessageHandler): void;
}

export interface ChannelMessage {
  userId: string;
  content: string;
  channel: string;
}

export interface ChannelContext {
  send(text: string): Promise<void>;
  sendStream?(text: string, done: boolean): Promise<void>;
}

export type MessageHandler = (
  message: ChannelMessage,
  context: ChannelContext
) => Promise<void>;
```

**handler.ts**
- 统一消息处理器，从 store 加载历史，调用 Agent，保存响应
- 与通道类型无关，所有通道共用

**新增通道**
1. 在 `channels/` 添加新文件（如 `qq.ts`、`wechat.ts`）
2. 实现 `ChannelAdapter` 接口
3. 在 `main.ts` 中启动

### store/ - 存储模块

**schema.ts**
```typescript
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const healthRecords = sqliteTable('health_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  value: real('value').notNull(),
  unit: text('unit'),
  note: text('note'),
  timestamp: integer('timestamp').notNull(),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp').notNull(),
});
```

**health.ts**
- `recordHealth(data)` - 记录健康数据
- `queryHealth(options)` - 查询健康数据

**messages.ts**
- `getMessages(sessionId)` - 获取会话历史
- `appendMessage(sessionId, message)` - 追加消息
- `clearMessages(sessionId)` - 清空历史

### agent/ - Agent 模块

**factory.ts**
- `createHealthAgent(store, messages)` - 创建 Agent 实例

**tools.ts**
- `record_health` - 记录健康数据
- `query_health` - 查询健康数据

**prompt.ts**
- 系统提示词（保持现有实现）

### session/ - 会话模块

**manager.ts**
```typescript
export interface Session {
  userId: string;
  agent: Agent;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface SessionManager {
  getOrCreate(userId: string): Session;
  get(userId: string): Session | undefined;
  remove(userId: string): void;
  list(): string[];
}
```

### main.ts - 入口

```typescript
async function main() {
  // 1. 初始化存储
  const store = new Store('./workspace/healthclaw.db');

  // 2. 创建 Agent 工厂
  const createAgent = (messages) => createHealthAgent(store, messages);

  // 3. 会话管理
  const sessions = createSessionManager(createAgent, store);

  // 4. 消息处理器
  const handleMessage = createMessageHandler(sessions, store);

  // 5. 启动通道
  const server = http.createServer();
  const wsChannel = createWebSocketChannel({ server, path: '/ws' });
  wsChannel.onMessage(handleMessage);
  await wsChannel.start();

  // 6. 监听
  server.listen(3001, () => logger.info('[app] started port=3001'));

  // 7. 优雅关闭
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
```

## 删除清单

| 路径 | 原因 |
|------|------|
| `src/domain/` | events.ts 未使用，types.ts 合并到 store |
| `src/infrastructure/` | 拆分到 store/session/logger |
| `src/application/` | 拆分到 agent/session/channels |
| `src/interface/` | 类型重复 |
| `src/config/` | 简化配置，直接在 main.ts 或 .env |
| `src/index.ts` | 不再需要导出 API |

## 新增依赖

```json
{
  "drizzle-orm": "^0.40.0",
  "drizzle-kit": "^0.30.0"
}
```

## 数据迁移

现有数据需要迁移到新的统一 SQLite 数据库：

| 数据源 | 当前位置 | 迁移目标 |
|--------|----------|----------|
| 消息历史 | `workspace/sessions.db` | 合并到 `workspace/healthclaw.db` |
| 健康数据 | `workspace/records.json` | 迁移到 `workspace/healthclaw.db` |

**迁移脚本示例：**
```typescript
// scripts/migrate-data.ts
// 1. 读取 records.json
// 2. 插入到 health_records 表
// 3. 从旧 sessions.db 读取消息
// 4. 插入到新 messages 表
```

## 迁移步骤

1. 安装 Drizzle 依赖（`drizzle-orm@^0.40.0`, `drizzle-kit@^0.30.0`）
2. 创建 `store/` 模块（schema, db, health, messages）
3. 编写并运行数据迁移脚本（`records.json` → SQLite, 合并 `sessions.db`）
4. 创建 `agent/` 模块，合并工具
5. 创建 `session/` 模块
6. 重构 `channels/` 模块
7. 重写 `main.ts`
8. 删除旧目录
9. 测试验证

## 未来扩展

**新增健康数据类型**
1. 在 `store/schema.ts` 添加新表或字段
2. 在 `store/health.ts` 添加操作方法
3. 在 `agent/tools.ts` 添加新工具（如需要）
4. 更新 `prompt.ts` 描述

**新增通道**
1. 在 `channels/` 添加新文件
2. 实现 `ChannelAdapter` 接口
3. 在 `main.ts` 启动
