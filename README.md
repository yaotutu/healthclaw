# Healthclaw

个人健康顾问 Agent，通过 WebSocket 和 QQ Bot 通道提供健康数据记录和查询服务。

## 核心设计原则

1. **数据永久保留** — 用户的所有消息都是健康数据，永久存储在 SQLite 中，绝不丢失。即使当前处理不完美，未来可以用更好的模型重新分析历史数据。
2. **零硬编码逻辑** — 代码只做基础设施（数据存取、通道传输、调度），所有分析、决策、判断全部交给 LLM。通过数据 + 提示词引导，而非硬编码规则。

## 功能

### 健康记录

记录和追踪多种健康数据：

| 类型 | 数据点 |
|------|--------|
| 身体数据 | 体重、体脂率、BMI |
| 饮食记录 | 食物、热量、蛋白质、碳水、脂肪、钠、餐次 |
| 运动记录 | 运动类型、时长、消耗热量、心率、距离 |
| 睡眠记录 | 时长、质量、入睡/醒来时间、深睡时长 |
| 饮水记录 | 饮水量 |
| 症状记录 | 描述、严重程度、身体部位、关联记录 |
| 用药记录 | 药物、剂量、用药时间（支持停药标记） |
| 慢性病追踪 | 慢性病管理（支持停用追踪） |
| 健康观察 | 自由文本健康观察记录 |

### 智能特性

- **LLM 驱动分析** — 所有健康建议和数据分析由 AI 完成，无硬编码阈值
- **心跳关怀** — 每 15 分钟扫描用户状态，LLM 判断是否需要主动关怀
- **定时任务** — 支持周期/定时/一次性任务（如每天提醒吃药）
- **记忆系统** — 长期记忆（用户偏好、重要事实）+ 短期记忆（对话摘要）
- **用户档案** — 身高、年龄、性别、疾病史、过敏史、饮食偏好、健康目标

### 通道支持

- **WebSocket** — 实时流式交互（适合 Web 前端）
- **QQ Bot** — 通过 QQ 消息交互，凭证通过 Web 登录页绑定

## 技术栈

- **运行时**: Bun
- **语言**: TypeScript
- **LLM**: Claude（通过 pi-agent-core）
- **数据库**: SQLite + Drizzle ORM
- **Web 框架**: Hono
- **日志**: Pino
- **QQ Bot**: pure-qqbot

## 快速开始

### 环境要求

- [Bun](https://bun.sh/) >= 1.0

### 安装

```bash
git clone <repo-url>
cd healthclaw
bun install
```

### 配置

创建 `.env` 文件：

```bash
# 服务器
PORT=3001
DB_PATH=./data/healthclaw.db

# LLM
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6

# 心跳（默认 15 分钟）
HEARTBEAT_INTERVAL_MS=900000

# 其他
LOG_LEVEL=info
NODE_ENV=development
```

### 启动

```bash
# 开发模式（服务 + Web 前端）
bun run dev

# 仅启动服务
bun run server
```

## 命令

| 命令 | 说明 |
|------|------|
| `bun run dev` | 启动服务 + Web 前端（开发模式） |
| `bun run server` | 启动服务 |
| `bun run build` | 编译 TypeScript + Web 前端 |
| `bun run typecheck` | 类型检查 |
| `bun run db:push` | 推送 schema 变更到 SQLite |

## 架构

```
src/
├── features/          # 功能模块（每个功能 store + tools + prompt）
├── agent/             # Agent 核心（工具收集、查询工具工厂）
├── bot/               # 用户 Bot 管理（每用户独立实例）
├── prompts/           # 模块化提示词（核心角色 + 行为规则）
├── session/           # 会话管理（生命周期、过期摘要）
├── store/             # 存储层（SQLite + Drizzle ORM）
├── heartbeat/         # 心跳机制（LLM 驱动主动关怀）
├── cron/              # 定时任务系统
├── channels/          # 通道适配器（WebSocket、QQ Bot）
├── server/            # HTTP API
├── infrastructure/    # 日志等基础设施
├── config.ts          # 集中配置
└── main.ts            # 入口
```

### HTTP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/channels` | 获取可用通道列表 |
| POST | `/api/bind` | 绑定用户通道 |
| DELETE | `/api/bind/:userId` | 解绑用户通道 |
| GET | `/api/status/:userId` | 查询用户 Bot 状态 |

### 数据库

使用 SQLite 存储，共 17 张表（Drizzle ORM 管理 schema）。

## License

Private
