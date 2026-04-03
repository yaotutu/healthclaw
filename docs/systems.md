# 系统机制

## 心跳机制

每 15 分钟扫描所有用户，LLM 驱动决策：
1. 从 `heartbeat_tasks` 表读取每个用户的心跳任务（自然语言提示词）
2. 收集用户完整上下文（档案、最近记录、活跃症状、慢性病、记忆等）
3. 将任务 + 上下文发给 LLM，由 LLM 决定是否需要主动发送关怀消息
4. 通过 WebSocket/QQ 通道推送消息给用户

用户可通过对话管理心跳任务：`add_heartbeat_task`、`list_heartbeat_tasks`、`remove_heartbeat_task`。

## 定时任务系统

LLM 可在对话中为用户创建定时任务，支持三种调度模式：
- `everySeconds`: 周期性（如 3600=每小时）
- `cronExpr`: cron 表达式（如 "0 9 * * *"=每天9点）
- `at`: 一次性（指定时间执行后自动删除）

任务通过 `CronService` 管理，持久化到 `cron_jobs` SQLite 表，重启后自动恢复。

## 记忆系统

### 长期记忆 (`memories` 表)
- 由大模型通过 `save_memory` 工具主动记录
- 存储用户偏好、反馈、重要事实
- 每次对话注入上下文

### 短期记忆 (`conversation_summaries` 表)
- 用户消息间隔超过阈值（默认 4 小时）时，惰性触发 LLM 生成上一段对话摘要
- 触发时机在 handler 中：用户发消息时检查间隔，异步生成（fire-and-forget，不阻塞）
- 最近30天的摘要注入上下文
- 超过30天自动过期

## 提示词架构

提示词采用模块化组织，通过 assembler（`src/prompts/assembler.ts`）动态组装：

### 静态部分（启动时加载）
- `src/prompts/core/` - 角色定义（identity.md）
- `src/prompts/rules/` - 行为规则（安全、风格、主动性、分析指导、查询指导等，8个文件）

### 技能目录（注入到 system prompt）
- `skill-tool.ts` 中的 `readSkillCatalog()` 生成简要目录表（功能名 + 关键词）
- LLM 根据用户意图调用 `load_skill('diet')` 等，按需获取功能的 prompt.md 和详细工具

### 动态部分（每次消息前从数据库查询）
- 用户档案、最近记录（8类各5条）、活跃症状、慢性病、长期记忆、对话摘要（最近5条）

## 用户 Bot 管理

`BotManager`（`src/bot/bot-manager.ts`）管理每用户的 `UserBot` 实例：
- `UserBot` 封装单用户的无状态 Agent + Channels，每条消息创建临时 Agent，用完即弃
- 串行锁（Promise 链）保证同一用户的消息按顺序处理，支持 abort
- 用户通过 HTTP API 或 Web 登录页绑定通道（如 QQ）
- 绑定时自动创建 UserBot 实例并启动通道监听
- 支持解绑（删除通道绑定并停止 Bot）

## 日志规范

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
