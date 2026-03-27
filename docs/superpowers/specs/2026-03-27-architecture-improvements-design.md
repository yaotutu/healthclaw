# 架构改进设计文档

## 概述

本次架构改进主要解决以下问题：
1. 健康数据无用户隔离
2. 消息存储字段命名不一致
3. 会话无清理机制
4. WebSocket abort 未实现
5. 代码冗余

## 设计决策

### 用户标识

采用 `channel:userId` 格式作为统一用户标识：
- QQ 用户：`qq:123456789`
- WebSocket 用户：
  - 客户端提供 `sessionId`：`websocket:${sessionId}`（如 `websocket:user-123`）
  - 无 `sessionId`：`websocket:default`

**格式强制**：在 `WebSocketChannel.handleMessage()` 中统一生成，格式为 `websocket:${sessionId || 'default'}`

**未来扩展**：后期引入账号系统时，可增加用户绑定表，将多个 `channel:userId` 映射到同一个内部账号。

---

## 详细设计

### 1. 健康数据用户隔离

**问题**：`health_records` 表没有 `userId` 字段，所有用户共享数据。

**方案**：增加 `user_id` 字段（SQL 使用 snake_case，TypeScript schema 使用 camelCase `userId`）。

**Schema 变更**（SQL 权威，Drizzle schema 必须匹配）：

```sql
-- 新增字段（SQLite 支持 ALTER ADD COLUMN）
ALTER TABLE health_records ADD COLUMN user_id TEXT NOT NULL DEFAULT '';

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_health_user_id ON health_records(user_id);
```

**代码变更**：

- `src/store/schema.ts` - 增加 `userId` 字段定义（camelCase）
- `src/store/health.ts` - `record()` 和 `query()` 方法增加 `userId` 参数
- `src/agent/tools.ts` - 工具调用时传入当前用户 ID

---

### 2. 消息存储命名统一

**问题**：`messages` 表使用 `session_id`，但代码中传入的是 `userId`，这是命名不一致（不是 bug，当前功能正常）。

**方案**：将 `session_id` 重命名为 `user_id`，同时更新相关代码参数名。

**Schema 变更**：

```sql
-- SQLite 支持 RENAME COLUMN
ALTER TABLE messages RENAME COLUMN session_id TO user_id;

-- 索引相应调整
DROP INDEX IF EXISTS idx_messages_session_id;
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
```

**代码变更**：

- `src/store/schema.ts` - 字段重命名为 `userId`
- `src/store/messages.ts` - 参数名 `sessionId` → `userId`，方法名保持不变（`getMessages`, `appendMessage`）

---

### 3. 会话 TTL 清理

**问题**：会话对象常驻内存，无清理机制。

**方案**：实现 7 天 TTL 自动清理，每小时扫描一次。

**设计**：

```typescript
interface SessionManagerOptions {
  ttlMs?: number;           // 默认 7 * 24 * 60 * 60 * 1000 (7天)
  cleanupIntervalMs?: number; // 默认 60 * 60 * 1000 (1小时)
}

interface Session {
  userId: string;
  agent: Agent;
  abortController?: AbortController; // 当前请求的取消控制器
  createdAt: Date;
  lastActiveAt: Date;
}

// SessionManager 内部实现：
// 1. 每次访问更新 lastActiveAt
// 2. setInterval 定时扫描过期会话（间隔 1 小时）
// 3. 清理时只释放内存中的 Agent 实例，消息历史保留在 SQLite
// 4. close() 时清理定时器

const cleanup = () => {
  const now = Date.now();
  for (const [userId, session] of sessions) {
    if (now - session.lastActiveAt.getTime() > ttlMs) {
      sessions.delete(userId);
      logger.info('[session] expired userId=%s', userId);
    }
  }
};

// 在 close() 中调用 clearInterval(cleanupTimer)
```

**代码变更**：

- `src/session/manager.ts` - 增加 TTL 检查逻辑和定时清理

**注意**：清理会话不影响用户体验，用户下次发消息时会自动从数据库加载历史消息重建会话。

---

### 4. WebSocket Abort 实现

**问题**：`abort` 消息类型只记录日志，无实际功能。

**方案**：实现请求取消，停止 LLM 调用，不保存未完成的响应。

**设计**：

```typescript
// 不修改 ChannelMessage，使用现有 metadata.messageType
// websocket.ts 已有：metadata: { messageType: clientMsg.type }

// Session 增加 abortController
interface Session {
  // ... 现有字段
  abortController?: AbortController;
}

// 处理流程：
// 1. 收到 prompt 时，创建 AbortController 并存入 session
// 2. 将 signal 传递给 Agent.prompt()
// 3. 收到 abort 时，调用 session.abortController?.abort()
// 4. 丢弃已产生的 message_update 事件，不保存到数据库
// 5. 通知客户端 abort 完成

// WebSocket abort 响应
interface ServerMessage {
  type: 'event' | 'error' | 'done' | 'aborted'; // 新增 aborted
  // ...
}
```

**代码变更**：

- `src/channels/types.ts` - `ServerMessage.type` 增加 `'aborted'`
- `src/channels/websocket.ts` - 实现 abort 逻辑，监听 connectionId 对应的请求
- `src/session/manager.ts` - Session 增加 `abortController`，提供 `abort(userId)` 方法
- `src/channels/handler.ts` - 处理 abort 时丢弃未完成的消息

**Abort 行为**：
1. 取消当前 LLM 调用
2. 不保存未完成的响应到数据库
3. 向客户端发送 `{ type: 'aborted' }` 确认

---

### 5. 代码优化：sendStream 冗余

**问题**：`websocket.ts` 中 `sendStream` 有大量重复的空 usage 对象。

**方案**：提取公共的辅助函数。

**设计**：

```typescript
// 提取辅助函数
const createEmptyUsage = () => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
});

const createBaseMessage = (text: string) => ({
  role: 'assistant' as const,
  content: [{ type: 'text' as const, text }],
  model: '',
  provider: '',
  api: '',
  usage: createEmptyUsage(),
  stopReason: 'stop' as const,
  timestamp: Date.now(),
});

const createMessageUpdateEvent = (text: string): ServerMessage['event'] => ({
  type: 'message_update',
  message: createBaseMessage(text),
  assistantMessageEvent: {
    type: 'text_delta',
    contentIndex: 0,
    delta: text,
    partial: createBaseMessage(text),
  },
});

const createMessageEndEvent = (text: string): ServerMessage['event'] => ({
  type: 'message_end',
  message: createBaseMessage(text),
});
```

**代码变更**：

- `src/channels/websocket.ts` - 提取辅助函数，简化 send/sendStream 代码

---

## 变更文件清单

| 文件 | 变更内容 |
|------|----------|
| `src/store/schema.ts` | health_records 增加 userId，messages 的 sessionId → userId |
| `src/store/health.ts` | record/query 方法增加 userId 参数 |
| `src/store/messages.ts` | 参数名 sessionId → userId |
| `src/session/manager.ts` | 增加 TTL 清理逻辑，Session 增加 abortController |
| `src/channels/types.ts` | ServerMessage.type 增加 'aborted' |
| `src/channels/websocket.ts` | 实现 abort，优化代码，统一 userId 格式 |
| `src/channels/handler.ts` | 处理 abort，传递 userId 给工具 |
| `src/agent/tools.ts` | record/query 工具使用 userId |

---

## 迁移策略

**开发阶段策略**：直接删除旧数据库文件，重新开始。

```bash
# 备份（可选）
cp workspace/healthclaw.db workspace/healthclaw.db.backup

# 删除旧数据库
rm workspace/healthclaw.db

# 重启服务，自动创建新表结构
bun run server
```

**生产阶段策略**（后期如需）：

```sql
-- health_records 增加字段
ALTER TABLE health_records ADD COLUMN user_id TEXT NOT NULL DEFAULT '';

-- messages 重命名字段
ALTER TABLE messages RENAME COLUMN session_id TO user_id;

-- 重建索引
DROP INDEX IF EXISTS idx_messages_session_id;
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_health_user_id ON health_records(user_id);
```

---

## 回滚计划

1. **备份**：迁移前备份数据库 `cp healthclaw.db healthclaw.db.backup`
2. **回滚**：如果迁移失败，恢复备份并回退代码
3. **开发回退**：删除数据库文件，使用旧代码重新启动

---

## 风险评估

- **低风险**：项目处于早期开发阶段，无生产数据
- **向后兼容**：需要清理旧数据库或执行迁移脚本
- **内存影响**：TTL 清理定时器每 1 小时执行一次，开销可忽略
