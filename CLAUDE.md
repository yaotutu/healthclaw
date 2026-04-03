# Healthclaw

个人健康顾问 Agent，支持 WebSocket 和 QQ Bot 通道提供健康数据记录和查询服务。

## 架构概览

- **按功能域组织**: `src/features/<name>/` 各含 store.ts + tools.ts + prompt.md，改一个功能不用跳目录
- **两层工具系统**: 常驻工具（`get_recent_*` 简单查询 + profile/memory）始终可用；技能工具（`record_*`、`query_*` 等）通过 `load_skill` 按需加载，减少 token 消耗
- **技能惰性加载**: `load_skill` 提供技能目录表，LLM 按需加载功能的 prompt.md 和详细工具
- **每用户 Bot 实例**: `BotManager` 管理每用户的 `UserBot`（无状态 Agent + Channels）
- **无状态 Agent**: 每条消息从 DB 加载上下文、创建临时 Agent、用完即弃
- **串行锁**: 同一用户消息通过 Promise 链串行处理，支持 abort
- **通道无关**: `ChannelFactory` 注册模式，通过 `context.capabilities?.streaming` 判断流式/非流式
- **统一存储外观**: Store 类聚合各 features 的 store，共享 `createRecordStore` / `createQueryTool` / `createSimpleQueryTool` 工厂
- **工具只做存储**: 所有分析和决策由 AI 完成
- **集中配置**: `config.ts` 统一管理环境变量

## 详情文档

需要时查阅，不全部塞在 CLAUDE.md 里：

- [架构目录与功能模块](docs/architecture.md) — 目录结构树、功能模块说明表
- [工具清单](docs/tools.md) — 常驻工具和技能工具完整列表
- [数据类型与数据表](docs/data-types.md) — 17个表、各记录类型字段定义
- [通道与 API](docs/channels.md) — WebSocket 协议、QQ Bot、通道能力声明、HTTP API、Web 前端
- [系统机制](docs/systems.md) — 心跳、定时任务、记忆系统、提示词架构、Bot 管理、日志规范

## 关键路径

| 用途 | 路径 |
|------|------|
| 入口 | `src/main.ts` |
| 配置 | `src/config.ts` |
| Agent 创建 | `src/agent/factory.ts` |
| 技能加载 | `src/agent/skill-tool.ts` |
| 工具聚合 | `src/agent/tools.ts` |
| 工具工厂 | `src/agent/tool-factory.ts` |
| 提示词组装 | `src/prompts/assembler.ts` |
| 表结构 | `src/store/schema.ts` |
| 消息处理 | `src/channels/handler.ts` |
| Bot 管理 | `src/bot/bot-manager.ts`, `src/bot/user-bot.ts` |
| 心跳机制 | `src/heartbeat/` |
| 定时任务 | `src/cron/` |
| 会话摘要 | `src/session/manager.ts` |
| HTTP API | `src/server/routes.ts` |
| 日志 | `src/infrastructure/logger.ts` |
| Web 前端 | `web/`（Vue 3 + Vite） |

## 命令

```bash
bun run dev        # 启动服务 + Web 前端（开发模式）
bun run server     # 启动服务 (端口 3001)
bun run build      # 编译 TypeScript + Web 前端
bun run typecheck  # 类型检查
bun run db:push    # 推送 schema 变更到 SQLite
```


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
