# 通道与 API

## WebSocket

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

## QQ Bot

通过 `pure-qqbot` 库实现，自动回复用户消息（不支持流式，累积后发送）。QQ 凭证通过 Web 登录页绑定，存储在 `channel_bindings` 表中，不再使用环境变量。

## 通道注册

通道通过 `ChannelFactory` 接口注册到 `ChannelRegistry`，支持动态添加新通道：
- 每个工厂定义通道类型、配置字段、帮助文本
- `QqChannelFactory` 实现 QQ 通道的注册和创建
- 用户通过 HTTP API（`/api/bind`）绑定通道凭证

## 通道能力声明

通道通过 `ChannelContext.capabilities` 声明自身能力，handler 根据能力决定行为：

- **默认（不声明 capabilities）**: 非流式通道，handler 通过 `send()` 发送完整响应
- **`capabilities: { streaming: true }`**: 流式通道，handler 通过 `sendStream()` 推送增量内容
- handler 始终通过 `context.capabilities?.streaming` 判断，**不依赖 `sendStream` 函数是否存在**

## HTTP API

通过 Hono 提供 REST API 和静态文件服务（定义在 `src/server/routes.ts`）：
- `GET /api/channels` - 获取可用通道列表
- `POST /api/bind` - 绑定用户通道（提交通道凭证）
- `DELETE /api/bind/:userId` - 解绑用户通道
- `GET /api/status/:userId` - 查询用户 Bot 状态
- 静态文件服务：`dist/web/` 目录（Web 前端构建产物）

## Web 前端

Vue 3 + Vite 单页应用（`web/` 目录），提供 QQ Bot 登录绑定页面：
- 开发时通过 `concurrently` 同时启动 server 和 Vite dev server
- Vite 代理 `/api` 请求到后端 `localhost:3001`
- 构建产物输出到 `dist/web/`，由 Hono 静态文件服务提供
