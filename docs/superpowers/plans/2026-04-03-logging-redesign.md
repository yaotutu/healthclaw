# 日志系统重新设计 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入 createLogger 工厂函数，统一日志格式，建立明确的日志规则，清理噪音日志。

**Architecture:** 在现有 Pino logger 上新增 createLogger(module) 工厂函数，每个模块创建绑定了 module 名的子 logger。同时清理不符合规范的日志（噪音、重复、中文），更新 CLAUDE.md 规则。

**Tech Stack:** TypeScript, Pino, Bun, SQLite

**Spec:** `docs/superpowers/specs/2026-04-03-logging-redesign-design.md`

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/infrastructure/logger.ts` | 新增 createLogger 工厂函数 + ModuleLogger 接口 |
| `CLAUDE.md` | 替换日志规范章节（新增完整规则） |

---

### Task 1: 新增 createLogger 工厂函数

**Files:**
- Modify: `src/infrastructure/logger.ts`

- [ ] **Step 1: 在 logger.ts 中新增 ModuleLogger 接口和 createLogger 函数**

在 `export default logger;` 之前添加：

```typescript
import type { Logger } from 'pino';

/**
 * 子 Logger 接口
 * 每个模块通过 createLogger(module) 获取，自动绑定 module 名
 */
export interface ModuleLogger {
  info(msg: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  warn(msg: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
  /** 底层 Pino child logger，用于需要传结构化数据的场景（如 LLM payload） */
  readonly raw: Logger;
}

/**
 * 创建绑定 module 的子 Logger
 * 自动做两件事：
 * 1. 把 module 作为结构化字段传给 Pino → 数据库 module 列自动填充
 * 2. 消息文本自动加 [module] 前缀 → 控制台可读
 *
 * @param module 模块名，如 'handler'、'bot'、'store'
 * @returns ModuleLogger 实例
 */
export const createLogger = (module: string): ModuleLogger => {
  const child = logger.child({ module });
  return {
    info: (msg, ...args) => child.info(`[${module}] ${msg}`, ...args),
    error: (msg, ...args) => child.error(`[${module}] ${msg}`, ...args),
    warn: (msg, ...args) => child.warn(`[${module}] ${msg}`, ...args),
    debug: (msg, ...args) => child.debug(`[${module}] ${msg}`, ...args),
    raw: child,
  };
};
```

同时确认文件顶部已有 `import pino from 'pino';`，需要额外导入 `import type { Logger } from 'pino';` 用于 ModuleLogger 的 raw 属性类型。

- [ ] **Step 2: 运行类型检查**

```bash
bun run typecheck
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/logger.ts
git commit -m "feat: add createLogger factory with ModuleLogger interface"
```

---

### Task 2: 更新 CLAUDE.md 日志规范

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 替换 CLAUDE.md 中的日志规范章节**

找到 CLAUDE.md 中的 `## 日志规范` 部分（约第 239 行），将整个章节（直到下一个 `##` 标题之前）替换为：

```markdown
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
```

注意：上面 markdown 嵌套了代码块，实际写入时注意反引号转义。确保 CLAUDE.md 中的现有其他内容不受影响。

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md logging rules with createLogger"
```

---

### Task 3: 改造 main.ts + agent/factory.ts

**Files:**
- Modify: `src/main.ts`
- Modify: `src/agent/factory.ts`

- [ ] **Step 1: 改造 main.ts**

1. 替换 import（第 10 行）：
```typescript
// 旧
import { logger, dbLogWriter } from './infrastructure/logger';
// 新
import { createLogger, dbLogWriter } from './infrastructure/logger';
const log = createLogger('app');
```

2. 将所有 `logger.xxx('[app] xxx', ...)` 改为 `log.xxx('xxx', ...)`，去掉 `[app]` 前缀。注意 `logger.warn` 变为 `log.warn`。涉及行：65, 75, 76, 81, 130, 131, 132, 152, 155(warn), 171, 174, 184。

3. 删除 cron 相关日志（第 91、98 行），因为 `cron/service.ts` 已有相同日志：
```typescript
// 删除这两行
logger.info('[cron] executing id=%s name=%s userId=%s', job.id, job.name, userId);
logger.error('[cron] execute failed id=%s error=%s', job.id, ...);
```

- [ ] **Step 2: 改造 agent/factory.ts**

1. 替换 import（第 6 行）：
```typescript
// 旧
import { logger } from '../infrastructure/logger';
// 新
import { createLogger } from '../infrastructure/logger';
const log = createLogger('agent');
const llmLog = createLogger('llm');
```

2. 替换第 79 行 LLM request 日志：
```typescript
// 旧
logger.info({ module: 'llm', payload: requestPayload }, '[llm] request');
// 新
llmLog.raw.debug({ payload: requestPayload }, 'request model=%s inputTokens=%d',
  requestPayload.model, requestPayload.messages?.reduce?.((sum: number, m: any) => sum + (m.content?.length || 0), 0) ?? 0);
```

3. 替换第 99 行 LLM response 日志：
```typescript
// 旧
logger.info({ module: 'llm', payload: finalMessage }, '[llm] response');
// 新
llmLog.raw.debug({ payload: finalMessage }, 'response');
```

注意：response 日志只记 debug 级别，payload 通过 Pino 结构化数据传递。token 数据已包含在 payload 中，无需额外提取。

4. 替换第 106 行 LLM error 日志：
```typescript
// 旧
logger.error({ module: 'llm', error: (err as Error).message }, '[llm] error=%s', (err as Error).message);
// 新
llmLog.error('error=%s', (err as Error).message);
```

5. 替换第 145 行 agent created 日志：
```typescript
// 旧
logger.info('[agent] created provider=%s model=%s tools=%d', ...);
// 新
log.info('created provider=%s model=%s tools=%d', ...);
```

注意：LLM 的完整 payload 日志降为 debug 级别（开发时开 debug 可见），使用 `llmLog.raw.debug()` 传结构化数据。

- [ ] **Step 3: 运行类型检查**

```bash
bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/agent/factory.ts
git commit -m "refactor: migrate main.ts and agent/factory.ts to createLogger"
```

---

### Task 4: 改造 bot 层 + handler 层 + 通道层

**Files:**
- Modify: `src/bot/bot-manager.ts`
- Modify: `src/bot/user-bot.ts`
- Modify: `src/channels/handler.ts`
- Modify: `src/channels/websocket.ts`
- Modify: `src/channels/qq.ts`
- Modify: `src/channels/qq-factory.ts`

- [ ] **Step 1: 改造 bot-manager.ts**

1. 替换 import：
```typescript
// 旧
import { logger } from '../infrastructure/logger';
// 新
import { createLogger } from '../infrastructure/logger';
const log = createLogger('bot');
```

2. 所有 `logger.xxx('[bot-manager] yyy', ...)` → `log.xxx('yyy', ...)`，去掉 `[bot-manager]` 前缀。涉及行：34, 39, 41, 84, 150, 180, 200, 204。

- [ ] **Step 2: 改造 user-bot.ts**

1. 替换 import：
```typescript
import { createLogger } from '../infrastructure/logger';
const log = createLogger('bot');
```

2. 所有 `logger.xxx('[user-bot] yyy', ...)` → `log.xxx('yyy', ...)`。涉及行：141, 157, 163, 208, 219, 223, 237, 242。

3. 删除以下噪音日志（属于"消息收发"不该记）：
   - 第 208 行 `logger.info('[user-bot] channel added ...')` — 保留，这是通道绑定变更
   - 第 219 行 `logger.info('[user-bot] delivered ...')` — 删除，属于消息收发
   - 第 242 行 `logger.info('[user-bot] stopped ...')` — 保留，这是状态变更

- [ ] **Step 3: 改造 handler.ts**

1. 替换 import：
```typescript
import { createLogger } from '../infrastructure/logger';
const log = createLogger('handler');
```

2. 保留（状态变更 / 错误）：
   - 第 49 行 `summary generated` → `log.info('summary generated userId=%s count=%d', ...)`
   - 第 51 行 `summary failed` → `log.error('summary failed userId=%s error=%s', ...)`
   - 第 135 行 `request aborted` → `log.info('request aborted userId=%s', ...)`
   - 第 140 行 `error` → `log.error('error=%s userId=%s', errMsg, userId)` （补充 userId）
   - 第 145 行 `fallback send failed` → `log.error('fallback send failed userId=%s error=%s', ...)`

3. 删除（消息收发噪音）：
   - 第 61 行 `logger.info('[handler] processing userId=%s channel=%s', ...)` — 删除

- [ ] **Step 4: 改造 websocket.ts**

1. 替换 import，创建 `const log = createLogger('ws');`
2. 所有 `logger.xxx('[ws] yyy', ...)` → `log.xxx('yyy', ...)`。涉及行：71, 75, 81, 95, 125, 135。

- [ ] **Step 5: 改造 qq.ts**

1. 替换 import，创建 `const log = createLogger('qq');`
2. 所有日志改为英文：
   - 第 58 行 `logger.error('[qq] 图片下载失败 url=%s error=%s', ...)` → `log.error('image download failed url=%s error=%s', ...)`
   - 第 78 行 `logger.info('[qq] channel started')` → `log.info('channel started')`
   - 第 83 行 `logger.info('[qq] channel stopped')` → `log.info('channel stopped')`
   - 第 107 行 `logger.error('[qq] 主动推送失败 userId=%s openid=%s error=%s', ...)` → `log.error('push failed userId=%s openid=%s error=%s', ...)`

- [ ] **Step 6: 改造 qq-factory.ts**

1. 替换 import，创建 `const log = createLogger('qq');`
2. 第 44 行 `logger.info('[qq-factory] creating channel appId=%s', ...)` → `log.info('creating channel appId=%s', ...)`

- [ ] **Step 7: 运行类型检查**

```bash
bun run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/bot/bot-manager.ts src/bot/user-bot.ts src/channels/handler.ts src/channels/websocket.ts src/channels/qq.ts src/channels/qq-factory.ts
git commit -m "refactor: migrate bot/handler/channel layers to createLogger"
```

---

### Task 5: 改造 cron + heartbeat + server + session

**Files:**
- Modify: `src/cron/service.ts`
- Modify: `src/heartbeat/scheduler.ts`
- Modify: `src/heartbeat/runner.ts`
- Modify: `src/server/routes.ts`
- Modify: `src/session/manager.ts`

- [ ] **Step 1: 改造 cron/service.ts**

1. 替换 import，创建 `const log = createLogger('cron');`
2. 所有 `logger.xxx('[cron] yyy', ...)` → `log.xxx('yyy', ...)`。涉及行：63, 76, 115, 127, 205, 212, 220。

- [ ] **Step 2: 改造 heartbeat/scheduler.ts**

1. 替换 import，创建 `const log = createLogger('heartbeat');`
2. 所有 `logger.xxx('[heartbeat] yyy', ...)` → `log.xxx('yyy', ...)`。涉及行：40, 47, 49, 53, 60, 66。
3. **降级 tick 日志**：第 40 行 `logger.info('[heartbeat] tick')` 改为 `log.debug('tick')`。tick 每 15 分钟触发一次，没有可操作信息，属于 debug 级别。

- [ ] **Step 3: 改造 heartbeat/runner.ts**

1. 替换 import，创建 `const log = createLogger('heartbeat');`
2. 所有 `logger.xxx('[heartbeat] yyy', ...)` → `log.xxx('yyy', ...)`。涉及行：145, 147, 150, 154。

- [ ] **Step 4: 改造 server/routes.ts**

1. 替换 import，创建 `const log = createLogger('api');`
2. 所有 `logger.xxx('[api] yyy', ...)` → `log.xxx('yyy', ...)`。涉及行：51, 56, 85。

- [ ] **Step 5: 改造 session/manager.ts**

当前 `session/manager.ts` 没有任何日志。按规范新增 LLM 调用 debug 日志：

1. 添加 import：
```typescript
import { createLogger } from '../infrastructure/logger';
const log = createLogger('session');
```

2. 在 LLM 调用前添加 debug 日志（第 38 行 `const stream = streamSimple(...)` 之前）：
```typescript
log.debug('generating summary messages=%d', recent.length);
```

3. 在 LLM 调用后（第 48 行 `return summary` 前）添加 debug 日志：
```typescript
log.debug('summary generated length=%d', summary.length);
```

- [ ] **Step 6: 运行类型检查**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/cron/service.ts src/heartbeat/scheduler.ts src/heartbeat/runner.ts src/server/routes.ts src/session/manager.ts
git commit -m "refactor: migrate cron/heartbeat/server/session to createLogger"
```

---

### Task 6: 改造 store 层（删除噪音日志）

**Files:**
- Modify: `src/store/record-store.ts`
- Modify: `src/store/summary.ts`
- Modify: `src/store/channel-binding-store.ts`
- Modify: `src/features/profile/store.ts`
- Modify: `src/features/memory/store.ts`
- Modify: `src/features/symptom/store.ts`
- Modify: `src/features/chronic/store.ts`
- Modify: `src/features/medication/store.ts`

按照规范，store 层的常规操作（insert/update 成功）不记日志。只有错误时才记。

- [ ] **Step 1: 改造 store/record-store.ts**

1. 替换 import：
```typescript
// 旧
import { logger } from '../infrastructure/logger';
// 新
import { createLogger } from '../infrastructure/logger';
const log = createLogger('store');
```

2. **删除** 第 66 行的常规写入日志：
```typescript
// 删除
logger.info(`[store:${label}] recorded userId=%s`, userId);
```

按照规范"store 层的常规操作不记"，这条日志属于噪音。

- [ ] **Step 2: 改造 store/summary.ts**

1. 替换 import，创建 `const log = createLogger('store');`
2. 保留第 46 行 `saved userId=%s messageCount=%d` 日志（属于状态变更），改为 `log.info('summary saved userId=%s messageCount=%d', ...)`

- [ ] **Step 3: 改造 store/channel-binding-store.ts**

1. 替换 import，创建 `const log = createLogger('store');`
2. 将 `[binding]` 前缀改为去掉前缀。涉及行：28, 70, 81。
   - 第 28 行：`log.info('binding created userId=%s channel=%s', ...)` — 保留（绑定变更是状态变更）
   - 第 70 行：`log.info('binding status updated userId=%s status=%s', ...)` — 保留
   - 第 81 行：`log.info('binding deleted userId=%s', ...)` — 保留

- [ ] **Step 4: 删除 features store 的噪音日志**

以下文件按同样模式处理：替换 import 为 createLogger('store')，**删除所有常规操作日志**。

**features/profile/store.ts：**
- 替换 import，创建 `const log = createLogger('store');`
- **删除** 第 56 行 `logger.info('[store:profile] upserted userId=%s', ...)` — 常规操作

**features/memory/store.ts：**
- 替换 import，创建 `const log = createLogger('store');`
- **删除** 第 51 行 `saved userId=%s category=%s content=%s` — 常规操作
- **删除** 第 104 行 `removed userId=%s memoryId=%d` — 常规操作

**features/symptom/store.ts：**
- 替换 import，创建 `const log = createLogger('store');`
- **删除** 第 67 行 `recorded userId=%s ...` — 常规操作
- **删除** 第 112 行 `resolved userId=%s symptomId=%d` — 常规操作

**features/chronic/store.ts：**
- 替换 import，创建 `const log = createLogger('store');`
- **删除** 第 61 行 `added userId=%s ...` — 常规操作
- **删除** 第 93 行 `updated userId=%s ...` — 常规操作
- **删除** 第 135 行 `deactivated userId=%s ...` — 常规操作

**features/medication/store.ts：**
- 替换 import，创建 `const log = createLogger('store');`
- **删除** 第 61 行 `recorded userId=%s ...` — 常规操作
- **删除** 第 115 行 `stopped userId=%s ...` — 常规操作

注意：以下文件删除所有日志后，`log` 变量不再被使用，应**完全移除** import 和 `log` 变量声明行：
- `src/store/record-store.ts` — 删除后无任何日志调用，完全移除 import
- `src/features/profile/store.ts` — 同上
- `src/features/memory/store.ts` — 同上
- `src/features/symptom/store.ts` — 同上
- `src/features/chronic/store.ts` — 同上
- `src/features/medication/store.ts` — 同上

此外，`src/store/record-store.ts` 的 `createRecordStore` 工厂函数接受 `label` 参数，该参数仅用于日志消息。删除日志后，`label` 参数变为死代码。**保留 `label` 参数**不删除，因为它是公开 API 的一部分，且未来可能用于 error 日志。

保留 logger 导入的文件（有 summary/channel-binding 等状态变更日志）：
- `src/store/summary.ts` — 保留 `log` 和 import
- `src/store/channel-binding-store.ts` — 保留 `log` 和 import

- [ ] **Step 5: 运行类型检查**

```bash
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/store/record-store.ts src/store/summary.ts src/store/channel-binding-store.ts src/features/profile/store.ts src/features/memory/store.ts src/features/symptom/store.ts src/features/chronic/store.ts src/features/medication/store.ts
git commit -m "refactor: migrate store layer to createLogger, remove noise logs"
```

---

### Task 7: 验证

- [ ] **Step 1: 运行类型检查**

```bash
bun run typecheck
```

Expected: 无错误

- [ ] **Step 2: 启动服务**

```bash
bun run dev
```

- [ ] **Step 3: 检查控制台输出**

确认：
1. 所有日志自动带 `[module]` 前缀
2. 无中文日志
3. 无 `[handler] processing` 噪音
4. 无重复的 cron executing 日志
5. LLM 完整 payload 不再出现在 info 级别

- [ ] **Step 4: 检查数据库 module 列**

```bash
sqlite3 data/healthclaw.db "SELECT DISTINCT module FROM logs ORDER BY module;"
```

Expected: module 列不再是 null，能看到 `app`, `bot`, `handler`, `qq`, `ws`, `heartbeat`, `cron` 等。

- [ ] **Step 5: 发送测试消息**

通过 QQ Bot 或 WebSocket 发送消息，确认：
1. 不再有 `processing` 日志
2. 不再有 `delivered` 日志
3. 不再有 store 的 `recorded` 日志
4. 错误时仍有 error 日志

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete logging system redesign"
```
