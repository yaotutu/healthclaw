# 架构详情

## 目录结构

```
src/
├── features/                 # 按功能域组织（每个功能三件套）
│   ├── body/                 #   store.ts + tools.ts + prompt.md
│   ├── chronic/
│   ├── diet/
│   ├── exercise/
│   ├── heartbeat/            #   心跳任务管理（store 用原生 SQLite，含 index.ts 导出）
│   ├── medication/
│   ├── memory/
│   ├── observation/
│   ├── profile/
│   ├── sleep/
│   ├── symptom/
│   ├── water/
│   └── cron/                 #   仅 prompt.md（tools 在 src/cron/，store 在 src/store/）
├── agent/                    # Agent 核心
│   ├── factory.ts            # 创建 Agent 实例（常驻工具 + 按需加载技能工具）
│   ├── tool-factory.ts       # createQueryTool / createSimpleQueryTool 工具工厂（共享）
│   ├── skill-tool.ts         # load_skill 技能惰性加载工具 + 技能目录
│   ├── event-utils.ts        # Agent 事件文本提取工具
│   ├── tools.ts              # 各功能 tools 聚合入口
│   └── index.ts              # 导出（createCommonTools, getSkillTools）
├── bot/                      # 用户 Bot 管理
│   ├── bot-manager.ts        # BotManager：管理每用户 UserBot 生命周期、通道绑定
│   ├── user-bot.ts           # UserBot：无状态，每条消息创建临时 Agent，串行锁保序
│   └── index.ts              # 导出
├── prompts/                  # 模块化提示词
│   ├── core/                 # 核心角色定义（identity.md）
│   ├── rules/                # 行为规则（安全、风格、主动性、分析指导等，8个文件）
│   └── assembler.ts          # 提示词组装器（core + 技能目录 + rules + 动态上下文）
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
│   ├── routes.ts             # Hono 路由（通道管理、用户绑定、状态查询 API + 静态文件）
│   └── index.ts              # 导出
├── infrastructure/           # 基础设施
│   ├── logger.ts             # Pino 日志
│   └── time.ts               # 时间格式化工具（formatDate, currentTimeStr, withTimeContext）
├── config.ts                 # 集中环境变量管理
└── main.ts                   # 入口文件

web/                          # Web 前端（Vue 3 + Vite）
├── src/
│   ├── App.vue
│   ├── main.ts
│   ├── components/           # BindForm.vue, ChannelTabs.vue
│   └── views/                # Login.vue, BindSuccess.vue
├── index.html
├── vite.config.ts            # 代理 /api → localhost:3001，构建到 dist/web/
└── package.json
```

## 功能模块说明

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
| heartbeat | 手写（原生 SQLite）, 含 index.ts 导出 | getEnabledTasks/addTask/removeTask/setEnabled |
| cron | 仅 prompt.md | tools 在 src/cron/，store 在 src/store/cron-store.ts |
