# 日志系统重构设计

## 背景

当前日志系统过于简陋，无法满足开发调试需求：
- Logger 模块只有 `info`, `error`, `debug` 三个方法
- `debug` 需要设置 `DEBUG` 环境变量才输出
- AgentEvent 丰富的事件类型没有被充分利用（如 `agent_start`, `turn_start` 等）
- 日志输出不一致，没有统一的结构化格式

## 目标

- **所有关键操作都有日志**：Server、WebSocket、Session、Agent、Storage、AgentEvent 全覆盖
- 开发调试时能看到详细日志
- 支持日志级别控制（debug/info/warn/error）
- 统一的结构化日志格式
- 开发环境自动使用 pretty 格式，生产环境使用 JSON

## 技术选型

**日志库**：pino
- 高性能、低开销
- pino-pretty 提供优秀的开发体验
- 结构化 JSON 日志
- 生态丰富

## 架构设计

```
src/logger/
├── index.ts          # 导出 logger 实例
├── formatters.ts     # AgentEvent 格式化函数
└── config.ts         # 日志配置
```

## 日志级别控制

通过 `LOG_LEVEL` 环境变量控制：

```bash
LOG_LEVEL=debug bun run dev   # 开发调试（默认）
LOG_LEVEL=info bun run start  # 正常运行
LOG_LEVEL=warn bun run start  # 安静模式
```

## 日志规范

### 什么操作必须记录日志？

**必须记录（info 级别）**：
- 服务启动/关闭
- 外部连接建立/断开（WebSocket、数据库等）
- 资源创建/销毁（会话、Agent 等）
- 数据变更（写入、更新、删除）
- 外部调用（API 请求、工具执行）
- 错误和异常

**可选记录（debug 级别）**：
- 读取操作
- 内部状态变化
- 详细的事件流（如 AgentEvent 的 update 类型）

### 日志格式规范

```
[模块名] 操作描述 key=value key2=value2
```

示例：
```
[server] started port=3001
[ws] client connected ip=127.0.0.1
[storage] record type=血糖 value=120
[agent] created provider=anthropic model=claude-sonnet
[tool] name=record args={"type":"血糖"}
```

### 日志级别选择规则

| 级别 | 使用场景 |
|-----|---------|
| debug | 详细调试信息，开发时需要，生产环境通常关闭 |
| info | 正常业务操作，生产环境保留 |
| warn | 异常但可恢复的情况 |
| error | 错误，需要关注和处理 |

### AgentEvent 日志映射

所有 AgentEvent 都必须记录，按以下规则：

| 事件类型 | 级别 |
|---------|-----|
| `*_start` | debug |
| `*_end` | info |
| `*_update` | debug |
| 工具执行开始/结束 | info |
| 工具执行更新 | debug |

## 使用方式

```typescript
import { logger } from './logger';
import { logAgentEvent } from './logger/formatters';

// 记录 AgentEvent
logAgentEvent(event);

// 普通日志
logger.info({ module: 'ws' }, 'Client connected');
logger.error({ module: 'ws', err }, 'Connection failed');
```

## 输出效果

开发环境（自动 pretty）：
```
09:15:32.123 DEBUG [agent_start]
09:15:32.124 DEBUG [turn_start]
09:15:32.125 DEBUG [message_start] role=user
09:15:32.456 INFO  [tool] name=record, args={"type":"血糖","value":"120"}
09:15:33.012 INFO  [tool_end] name=record, error=false
09:15:33.578 INFO  [message_end] role=assistant, tokens=150+80
09:15:33.579 INFO  [turn_end] role=assistant, tools=1
```

生产环境（JSON）：
```json
{"level":30,"time":1711443332123,"msg":"[message_end] role=assistant, tokens=150+80"}
```

## 文件变更

### 新增文件
1. `src/logger/config.ts` - 日志配置（级别、格式）
2. `src/logger/formatters.ts` - AgentEvent 格式化函数

### 重写文件
3. `src/logger/index.ts` - pino logger 实例

### 修改文件（添加日志）
4. `src/server/index.ts` - Server 启动、配置、HTTP 请求日志
5. `src/server/websocket.ts` - WebSocket 连接、消息、事件日志
6. `src/server/session.ts` - 会话创建、删除日志
7. `src/storage/file-storage.ts` - 存储读写、查询日志
8. `src/agent/index.ts` - Agent 创建日志
9. `src/agent/tools/record.ts` - record 工具日志
10. `src/agent/tools/query.ts` - query 工具日志
11. `package.json` - 添加 pino 和 pino-pretty 依赖

## 日志规范（新模块必读）

任何新模块/功能开发时，必须遵循以下规范：

### 必须记录的操作

1. **生命周期事件**：模块/服务的启动、停止、初始化
2. **外部交互**：网络请求、数据库操作、文件读写
3. **状态变更**：会话创建/删除、配置变更
4. **用户操作**：收到请求、返回响应
5. **错误和异常**：所有 catch 块、错误处理路径

### 禁止事项

1. 禁止使用 `console.log/info/debug/warn/error`
2. 禁止在日志中输出敏感信息（密码、token、个人数据）

### ESLint 规则（可选）

可添加 ESLint 规则禁止 `console.*`：

```json
{
  "rules": {
    "no-console": "error"
  }
}
```
