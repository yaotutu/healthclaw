# Healthclaw 项目规则

## 日志规范

使用 pino，格式：`[模块名] 操作 key=value`

```typescript
logger.info('[server] started port=%d', 3001);
logger.debug('[ws] received type=%s', msg.type);
logger.error('[storage] error=%s', err.message);
```

**级别：** debug(追踪) / info(业务) / warn(异常) / error(错误)

**控制：** `LOG_LEVEL=debug` (默认) / `info` / `warn` / `error`

**禁止：** `console.log`
