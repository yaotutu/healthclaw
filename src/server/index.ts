import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { config } from 'dotenv';
import { createFileStorage } from '../storage/file-storage.js';
import type { Storage } from '../storage/index.js';
import { createHealthAgent } from '../agent/index.js';
import { createSessionManager } from './session.js';
import { createWebSocketHandler } from './websocket.js';
import { logger } from '../logger/index.js';

// 加载环境变量
config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || './workspace';
const PUBLIC_PATH = path.join(process.cwd(), 'public');

// MIME 类型
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

// 创建存储
const storage = createFileStorage(WORKSPACE_PATH);

// 创建会话管理器
const sessionManager = createSessionManager(() =>
  createHealthAgent({
    storage,
    provider: process.env.LLM_PROVIDER,
    model: process.env.LLM_MODEL,
  })
);

// 创建 HTTP 服务器
const server = http.createServer(async (req, res) => {
  // 健康检查
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: sessionManager.list().length }));
    return;
  }

  // 静态文件服务
  try {
    let filePath = req.url === '/' ? '/index.html' : req.url!;
    const fullPath = path.join(PUBLIC_PATH, filePath);

    // 防止目录遍历
    if (!fullPath.startsWith(PUBLIC_PATH)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const content = await fs.readFile(fullPath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// 创建 WebSocket 处理器
createWebSocketHandler(server, sessionManager);

// 启动服务器
server.listen(PORT, () => {
  logger.info('[server] started port=%d', PORT);
  logger.info('[server] websocket ws://localhost:%d/ws', PORT);
  logger.info('[server] health check http://localhost:%d/health', PORT);
  logger.info('[server] workspace path=%s', WORKSPACE_PATH);
});
