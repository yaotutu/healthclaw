# Architecture Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix user isolation, naming consistency, session cleanup, abort, and code quality issues in the architecture.

**Architecture:** Modify store schema and methods for userId-based isolation, add TTL cleanup to session manager, implement WebSocket abort via `session.agent.abort()`, and extract helper functions in websocket.ts.

**Tech Stack:** TypeScript, Bun, SQLite + Drizzle ORM, pi-agent-core

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/store/schema.ts` | Modify | Add `userId` to healthRecords, rename `sessionId` → `userId` in messages |
| `src/store/index.ts` | Modify | Update initTables SQL to match new schema |
| `src/store/health.ts` | Modify | Add userId filter to record/query |
| `src/store/messages.ts` | Modify | Rename sessionId → userId in params |
| `src/agent/tools.ts` | Modify | Accept userId in tools |
| `src/agent/factory.ts` | Modify | Pass userId to createTools |
| `src/session/manager.ts` | Modify | Add TTL cleanup, userId param, abort via agent.abort() |
| `src/main.ts` | Modify | Wire createAgent with userId, wire abort handler |
| `src/channels/types.ts` | Modify | Add 'aborted' to ServerMessage.type |
| `src/channels/websocket.ts` | Modify | Implement abort via callback, extract helpers, unify userId |
| `src/channels/handler.ts` | Modify | Fix double-send, handle abort error |
| `src/channels/qq.ts` | Modify | Unify userId format to `qq:senderId` |

---

### Task 1: Update store schema

**Files:**
- Modify: `src/store/schema.ts`
- Modify: `src/store/index.ts`

- [ ] **Step 1: Update schema.ts**

Add `userId` to `healthRecords`, rename `sessionId` to `userId` in `messages`:

```typescript
import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

export const healthRecords = sqliteTable('health_records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  type: text('type', { enum: ['weight', 'sleep', 'diet', 'exercise', 'water'] }).notNull(),
  value: real('value').notNull(),
  unit: text('unit'),
  note: text('note'),
  timestamp: integer('timestamp').notNull(),
});

export const messages = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp').notNull(),
});

export type HealthRecord = typeof healthRecords.$inferSelect;
export type NewHealthRecord = typeof healthRecords.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
```

- [ ] **Step 2: Update initTables in store/index.ts**

```typescript
private initTables(): void {
  this.sqlite.run(`
    CREATE TABLE IF NOT EXISTS health_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('weight', 'sleep', 'diet', 'exercise', 'water')),
      value REAL NOT NULL,
      unit TEXT,
      note TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
  this.sqlite.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);
  this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)`);
  this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_health_user_id ON health_records(user_id)`);
  this.sqlite.run(`CREATE INDEX IF NOT EXISTS idx_health_timestamp ON health_records(timestamp)`);
}
```

- [ ] **Step 3: Delete old database and verify typecheck**

Run: `rm -f workspace/healthclaw.db && bun run typecheck`
Expected: typecheck fails (health.ts and messages.ts still reference old field names). This is expected — fixed in Task 2.

- [ ] **Step 4: Commit**

```bash
git add src/store/schema.ts src/store/index.ts
git commit -m "refactor(store): update schema with userId and rename sessionId"
```

---

### Task 2: Update store methods

**Files:**
- Modify: `src/store/health.ts`
- Modify: `src/store/messages.ts`

- [ ] **Step 1: Update health.ts**

Add userId to record and query:

```typescript
import { eq, desc, gte, and } from 'drizzle-orm';
import type { Db } from './db';
import { healthRecords, type HealthRecord, type NewHealthRecord } from './schema';

export interface QueryOptions {
  userId: string;
  type?: 'weight' | 'sleep' | 'diet' | 'exercise' | 'water';
  days?: number;
  limit?: number;
}

export const createHealthStore = (db: Db) => {
  const record = async (data: Omit<NewHealthRecord, 'id' | 'timestamp'>): Promise<HealthRecord> => {
    const result = await db.insert(healthRecords)
      .values({ ...data, timestamp: Date.now() })
      .returning();
    return result[0];
  };

  const query = async (options: QueryOptions): Promise<HealthRecord[]> => {
    const conditions = [eq(healthRecords.userId, options.userId)];

    if (options.type) {
      conditions.push(eq(healthRecords.type, options.type));
    }

    if (options.days) {
      const cutoff = Date.now() - options.days * 24 * 60 * 60 * 1000;
      conditions.push(gte(healthRecords.timestamp, cutoff));
    }

    const limit = options.limit ?? 10;

    return db.select()
      .from(healthRecords)
      .where(and(...conditions))
      .orderBy(desc(healthRecords.timestamp))
      .limit(limit);
  };

  return { record, query };
};

export type HealthStore = ReturnType<typeof createHealthStore>;
```

- [ ] **Step 2: Update messages.ts**

Rename sessionId → userId:

```typescript
import { eq, asc } from 'drizzle-orm';
import type { Db } from './db';
import { messages, type Message, type NewMessage } from './schema';

export const createMessageStore = (db: Db) => {
  const getMessages = async (userId: string): Promise<Message[]> => {
    return db.select()
      .from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(asc(messages.timestamp));
  };

  const appendMessage = async (userId: string, data: Omit<NewMessage, 'id' | 'userId'>): Promise<Message> => {
    const result = await db.insert(messages)
      .values({ ...data, userId })
      .returning();
    return result[0];
  };

  const clear = async (userId: string): Promise<void> => {
    await db.delete(messages).where(eq(messages.userId, userId));
  };

  return { getMessages, appendMessage, clear };
};

export type MessageStore = ReturnType<typeof createMessageStore>;
```

- [ ] **Step 3: Verify typecheck**

Run: `bun run typecheck`
Expected: typecheck fails on tools.ts, handler.ts (still use old API). This is expected.

- [ ] **Step 4: Commit**

```bash
git add src/store/health.ts src/store/messages.ts
git commit -m "refactor(store): add userId filter to health and rename sessionId in messages"
```

---

### Task 3: Update agent tools, factory, session manager, and main.ts

This task combines the userId propagation through the agent/session chain AND the session TTL cleanup to avoid modifying `session/manager.ts` twice.

**Files:**
- Modify: `src/agent/tools.ts`
- Modify: `src/agent/factory.ts`
- Modify: `src/session/manager.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Update tools.ts — accept userId**

```typescript
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Store, HealthRecord } from '../store';

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
});

const QueryParamsSchema = Type.Object({
  type: Type.Optional(Type.Union([
    Type.Literal('weight'),
    Type.Literal('sleep'),
    Type.Literal('diet'),
    Type.Literal('exercise'),
    Type.Literal('water'),
  ], { description: '数据类型，不填则查询所有类型' })),
  days: Type.Optional(Type.Number({ description: '查询最近N天的数据，默认7天' })),
  limit: Type.Optional(Type.Number({ description: '最多返回多少条记录，默认10条' })),
});

type RecordParams = typeof RecordParamsSchema;
type QueryParams = typeof QueryParamsSchema;

export const createTools = (store: Store, userId: string) => {
  const record: AgentTool<RecordParams> = {
    name: 'record_health_data',
    label: '记录健康数据',
    description: '记录用户的健康数据，如体重、睡眠、饮食、运动、饮水量',
    parameters: RecordParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const record = await store.health.record({
        userId,
        type: params.type as HealthRecord['type'],
        value: params.value,
        unit: params.unit,
        note: params.note,
      });

      return {
        content: [{ type: 'text', text: `已记录: ${record.type} ${record.value}${record.unit || ''} (${new Date(record.timestamp).toISOString()})` }],
        details: { id: record.id },
      };
    },
  };

  const query: AgentTool<QueryParams> = {
    name: 'query_health_data',
    label: '查询健康数据',
    description: '查询用户的历史健康数据',
    parameters: QueryParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const records = await store.health.query({
        userId,
        type: params.type as HealthRecord['type'] | undefined,
        days: params.days ?? 7,
        limit: params.limit ?? 10,
      });

      if (records.length === 0) {
        return {
          content: [{ type: 'text', text: '没有找到符合条件的健康数据记录。' }],
          details: { count: 0 },
        };
      }

      const lines = records.map(r => {
        const date = new Date(r.timestamp).toLocaleDateString('zh-CN');
        return `- ${date} ${r.type}: ${r.value}${r.unit || ''}${r.note ? ` (${r.note})` : ''}`;
      });

      return {
        content: [{ type: 'text', text: `找到 ${records.length} 条记录:\n${lines.join('\n')}` }],
        details: { count: records.length, records },
      };
    },
  };

  return { record, query };
};
```

- [ ] **Step 2: Update factory.ts — accept userId**

```typescript
export interface CreateAgentOptions {
  store: Store;
  userId: string;
  messages?: Message[];
}

export const createHealthAgent = (options: CreateAgentOptions) => {
  const { store, userId, messages = [] } = options;

  const agentModel = getModel(LLM_PROVIDER as any, LLM_MODEL);
  const tools = createTools(store, userId);
  const toolList = [tools.record, tools.query];

  logger.info('[agent] created provider=%s model=%s tools=%d', LLM_PROVIDER, LLM_MODEL, toolList.length);

  const agent = new Agent({
    initialState: {
      systemPrompt: HEALTH_ADVISOR_PROMPT,
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

- [ ] **Step 3: Rewrite session/manager.ts — userId param + TTL + abort**

Full file rewrite. Key changes:
- `createAgent` now takes `(userId, messages)`
- `SessionManager.abort(userId)` calls `session.agent.abort()` to cancel the actual LLM call
- TTL cleanup with 7-day expiry, 1-hour scan interval

```typescript
import type { Agent } from '@mariozechner/pi-agent-core';
import type { Store, Message } from '../store';
import { logger } from '../infrastructure/logger';

export interface Session {
  userId: string;
  agent: Agent;
  createdAt: Date;
  lastActiveAt: Date;
}

export interface SessionManager {
  getOrCreate(userId: string): Promise<Session>;
  get(userId: string): Session | undefined;
  abort(userId: string): boolean;
  remove(userId: string): boolean;
  list(): string[];
  close(): void;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface CreateSessionManagerOptions {
  createAgent: (userId: string, messages: Message[]) => Agent;
  store: Store;
  ttlMs?: number;
  cleanupIntervalMs?: number;
}

export const createSessionManager = (options: CreateSessionManagerOptions): SessionManager => {
  const { createAgent, store, ttlMs = DEFAULT_TTL_MS, cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS } = options;
  const sessions = new Map<string, Session>();

  const cleanup = () => {
    const now = Date.now();
    for (const [userId, session] of sessions) {
      if (now - session.lastActiveAt.getTime() > ttlMs) {
        sessions.delete(userId);
        logger.info('[session] expired userId=%s', userId);
      }
    }
  };

  const cleanupTimer = setInterval(cleanup, cleanupIntervalMs);

  const getOrCreate = async (userId: string): Promise<Session> => {
    let session = sessions.get(userId);
    if (session) {
      session.lastActiveAt = new Date();
      logger.debug('[session] accessed userId=%s', userId);
      return session;
    }

    let messages: Message[] = [];
    try {
      messages = await store.messages.getMessages(userId);
      logger.info('[session] loaded %d messages userId=%s', messages.length, userId);
    } catch (err) {
      logger.error('[session] failed to load messages userId=%s error=%s', userId, (err as Error).message);
    }

    session = {
      userId,
      agent: createAgent(userId, messages),
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };
    sessions.set(userId, session);
    logger.info('[session] created userId=%s total=%d', userId, sessions.size);

    return session;
  };

  const get = (userId: string): Session | undefined => {
    return sessions.get(userId);
  };

  const abort = (userId: string): boolean => {
    const session = sessions.get(userId);
    if (!session) return false;
    session.agent.abort();
    logger.info('[session] aborted userId=%s', userId);
    return true;
  };

  const remove = (userId: string): boolean => {
    const result = sessions.delete(userId);
    if (result) {
      logger.info('[session] removed userId=%s total=%d', userId, sessions.size);
    }
    return result;
  };

  const list = (): string[] => {
    return Array.from(sessions.keys());
  };

  const close = (): void => {
    clearInterval(cleanupTimer);
    const count = sessions.size;
    sessions.clear();
    if (count > 0) {
      logger.info('[session] closed cleared=%d sessions', count);
    }
  };

  return { getOrCreate, get, abort, remove, list, close };
};
```

- [ ] **Step 4: Update main.ts**

```typescript
// Change the createAgent call to pass userId
const createAgent = (userId: string, messages: Parameters<typeof createHealthAgent>[0]['messages']) =>
  createHealthAgent({ store, userId, messages });
```

- [ ] **Step 5: Verify typecheck**

Run: `bun run typecheck`
Expected: may fail on handler.ts (abort references). This is OK — fixed in Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/agent/tools.ts src/agent/factory.ts src/session/manager.ts src/main.ts
git commit -m "feat: pass userId through agent chain and add session TTL cleanup"
```

---

### Task 4: Implement channels — abort, code optimization, userId format

**Files:**
- Modify: `src/channels/types.ts`
- Modify: `src/channels/websocket.ts`
- Modify: `src/channels/handler.ts`
- Modify: `src/channels/qq.ts`

**Abort mechanism design:**
- WebSocket receives abort → looks up userId from connectionId → calls `onAbort(userId)` callback
- `main.ts` wires `wsChannel.onAbort((userId) => sessions.abort(userId))`
- `SessionManager.abort()` calls `session.agent.abort()` which cancels the actual LLM call
- `agent.prompt()` rejects after abort → handler catches the error, doesn't save response

- [ ] **Step 1: Update types.ts — add 'aborted' to ServerMessage**

```typescript
export interface ServerMessage {
  type: 'event' | 'error' | 'done' | 'aborted';
  event?: AgentEvent;
  error?: string;
}
```

- [ ] **Step 2: Rewrite websocket.ts**

Key changes:
- Extract helper functions for verbose event construction
- Unify userId format: `websocket:${sessionId || 'default'}`
- Add `onAbort` callback for abort support
- Track connectionId → userId mapping for abort routing

```typescript
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ChannelAdapter, MessageHandler, ChannelMessage, ChannelContext, ClientMessage, ServerMessage } from './types';
import { logger } from '../infrastructure/logger';

interface Connection {
  ws: WebSocket;
  userId: string;
}

export interface WebSocketChannelOptions {
  server: http.Server;
  path?: string;
}

export type AbortHandler = (userId: string) => void;

const createEmptyUsage = () => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
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

export class WebSocketChannel implements ChannelAdapter {
  readonly name = 'websocket';
  private wss: WebSocketServer;
  private connections = new Map<string, Connection>();
  private messageHandler?: MessageHandler;
  private abortHandler?: AbortHandler;

  constructor(options: WebSocketChannelOptions) {
    const { server, path = '/ws' } = options;
    this.wss = new WebSocketServer({ server, path });
  }

  async start(): Promise<void> {
    this.wss.on('connection', (ws: WebSocket) => {
      const connectionId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      logger.info('[ws] client connected connectionId=%s', connectionId);

      ws.on('message', (data: Buffer) => {
        this.handleMessage(ws, data, connectionId).catch(err => {
          logger.error('[ws] error=%s', (err as Error).message);
          this.sendToWs(ws, { type: 'error', error: (err as Error).message });
        });
      });

      ws.on('close', () => {
        logger.info('[ws] client disconnected connectionId=%s', connectionId);
        this.connections.delete(connectionId);
      });

      ws.on('error', (err: Error) => {
        logger.error('[ws] error=%s', err.message);
      });
    });
  }

  async stop(): Promise<void> {
    for (const [id, conn] of this.connections) {
      conn.ws.close();
      this.connections.delete(id);
    }
    this.wss.close();
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onAbort(handler: AbortHandler): void {
    this.abortHandler = handler;
  }

  private async handleMessage(ws: WebSocket, data: Buffer, connectionId: string): Promise<void> {
    if (!this.messageHandler) {
      throw new Error('Message handler not set');
    }

    let clientMsg: ClientMessage;
    try {
      clientMsg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      logger.error('[ws] invalid JSON connectionId=%s', connectionId);
      this.sendToWs(ws, { type: 'error', error: 'Invalid JSON format' });
      return;
    }

    if (clientMsg.type === 'abort') {
      const conn = this.connections.get(connectionId);
      if (conn && this.abortHandler) {
        this.abortHandler(conn.userId);
        this.sendToWs(ws, { type: 'aborted' });
        logger.info('[ws] aborted connectionId=%s userId=%s', connectionId, conn.userId);
      }
      return;
    }

    const userId = `websocket:${clientMsg.sessionId || 'default'}`;
    this.connections.set(connectionId, { ws, userId });

    const channelMsg: ChannelMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userId,
      content: clientMsg.content || '',
      timestamp: new Date(),
      channel: 'websocket',
      metadata: { connectionId, messageType: clientMsg.type },
    };

    const context: ChannelContext = {
      send: async (text: string) => {
        this.sendToWs(ws, { type: 'event', event: createMessageEndEvent(text) });
        this.sendToWs(ws, { type: 'done' });
      },
      sendStream: async (text: string, done: boolean) => {
        if (done) {
          this.sendToWs(ws, { type: 'done' });
        } else {
          this.sendToWs(ws, { type: 'event', event: createMessageUpdateEvent(text) });
        }
      },
    };

    await this.messageHandler(channelMsg, context);
  }

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

export const createWebSocketChannel = (options: WebSocketChannelOptions): WebSocketChannel => {
  return new WebSocketChannel(options);
};
```

- [ ] **Step 3: Rewrite handler.ts — fix double-send + abort error handling**

Key changes:
- **Double-send fix**: only call `context.send()` for channels WITHOUT `sendStream`. Streaming channels already deliver content via events.
- **Abort handling**: when `agent.prompt()` is rejected due to abort, catch the error and don't save the response.

```typescript
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { SessionManager } from '../session';
import type { Store } from '../store';
import type { ChannelMessage, ChannelContext } from './types';
import { logger } from '../infrastructure/logger';

export interface CreateMessageHandlerOptions {
  sessions: SessionManager;
  store: Store;
}

export const createMessageHandler = (options: CreateMessageHandlerOptions) => {
  const { sessions, store } = options;

  const extractAssistantText = (events: AgentEvent[]): string => {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const msg = event.message;
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
              return block.text;
            }
          }
        }
      }
    }
    return '';
  };

  return async (message: ChannelMessage, context: ChannelContext): Promise<void> => {
    const { userId, content } = message;
    logger.info('[handler] processing userId=%s channel=%s', userId, message.channel);

    const session = await sessions.getOrCreate(userId);
    const events: AgentEvent[] = [];

    const unsubscribe = session.agent.subscribe((event) => {
      events.push(event);
      if (event.type === 'message_update') {
        const msg = event.message;
        if (msg?.role === 'assistant' && typeof msg.content === 'string') {
          context.sendStream?.(msg.content, false);
        }
      } else if (event.type === 'message_end') {
        context.sendStream?.('', true);
      }
    });

    try {
      // 1. Save user message
      await store.messages.appendMessage(userId, {
        role: 'user',
        content,
        timestamp: Date.now(),
      });

      // 2. Call Agent
      await session.agent.prompt(content);

      // 3. Extract and save response
      const assistantText = extractAssistantText(events);
      if (assistantText) {
        await store.messages.appendMessage(userId, {
          role: 'assistant',
          content: assistantText,
          timestamp: Date.now(),
        });
        // Only call send() for non-streaming channels
        // Streaming channels already delivered content via events
        if (!context.sendStream) {
          await context.send(assistantText);
        }
      }
    } catch (err) {
      const message = (err as Error).message;
      // Agent.abort() causes prompt() to reject — treat as intentional, not an error
      if (message?.includes('aborted')) {
        logger.info('[handler] request aborted userId=%s', userId);
        return;
      }
      logger.error('[handler] error=%s', message);
      await context.send(`处理出错: ${message}`);
    } finally {
      unsubscribe();
    }
  };
};
```

- [ ] **Step 4: Update qq.ts — unify userId format**

Change userId from `event.senderId` to `qq:${event.senderId}`:

In `src/channels/qq.ts`, update the `channelMsg` userId:
```typescript
userId: `qq:${event.senderId}`,
```

- [ ] **Step 5: Update main.ts — wire abort handler**

After `wsChannel.onMessage(handleMessage)`, add:
```typescript
wsChannel.onAbort((userId) => sessions.abort(userId));
```

- [ ] **Step 6: Export WebSocketChannelOptions and onAbort from channels/index.ts**

No change needed — `WebSocketChannel` is already exported, and `onAbort` is a method on it.

- [ ] **Step 7: Verify typecheck**

Run: `bun run typecheck`
Expected: passes

- [ ] **Step 8: Verify server starts**

Run: `bun run server` (Ctrl+C after startup)
Expected: `[app] server started port=3001`

- [ ] **Step 9: Commit**

```bash
git add src/channels/types.ts src/channels/websocket.ts src/channels/handler.ts src/channels/qq.ts src/main.ts
git commit -m "feat(channels): implement abort, fix double-send, extract helpers, unify userId"
```

---

### Task 5: Final verification

**Files:**
- Verify all changes work together

- [ ] **Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: passes with no errors

- [ ] **Step 2: Start server and verify**

Run: `bun run server`
Expected: Server starts, logs `[app] server started port=3001`

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for architecture improvements"
```
