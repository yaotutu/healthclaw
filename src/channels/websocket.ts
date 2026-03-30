import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { DeliverableChannel, MessageHandler, ChannelMessage, ChannelContext, ClientMessage, ServerMessage } from './types';
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

export class WebSocketChannel implements DeliverableChannel {
  readonly name = 'websocket';
  private wss: WebSocketServer;
  private connections = new Map<string, Connection>();
  /** userId → connectionIds 反向索引，用于主动推送 */
  private userConnections = new Map<string, Set<string>>();
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
        const conn = this.connections.get(connectionId);
        if (conn) {
          // 清理 userId 反向索引
          const connSet = this.userConnections.get(conn.userId);
          if (connSet) {
            connSet.delete(connectionId);
            if (connSet.size === 0) this.userConnections.delete(conn.userId);
          }
        }
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
    // 维护 userId 反向索引
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(connectionId);

    const channelMsg: ChannelMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userId,
      content: clientMsg.content || '',
      images: clientMsg.images,  // 新增：映射图片数据
      timestamp: new Date(),
      channel: 'websocket',
      metadata: { connectionId, messageType: clientMsg.type },
    };

    const context: ChannelContext = {
      // 禁用流式：统一发送完整响应
      send: async (text: string) => {
        this.sendToWs(ws, { type: 'event', event: createMessageEndEvent(text) });
        this.sendToWs(ws, { type: 'done' });
      },
    };

    await this.messageHandler(channelMsg, context);
  }

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  /**
   * 主动向用户发送消息（无需用户先发消息）
   * 通过 userId 反向索引找到所有活跃的 WebSocket 连接并推送
   * @param userId 用户ID（格式: "websocket:xxx"）
   * @param text 消息内容
   * @returns 是否成功送达至少一个连接
   */
  async sendToUser(userId: string, text: string): Promise<boolean> {
    const connIds = this.userConnections.get(userId);
    if (!connIds || connIds.size === 0) return false;

    let delivered = false;
    for (const connId of connIds) {
      const conn = this.connections.get(connId);
      if (conn && conn.ws.readyState === WebSocket.OPEN) {
        this.sendToWs(conn.ws, { type: 'event', event: createMessageEndEvent(text) });
        this.sendToWs(conn.ws, { type: 'done' });
        delivered = true;
      }
    }
    return delivered;
  }
}

export const createWebSocketChannel = (options: WebSocketChannelOptions): WebSocketChannel => {
  return new WebSocketChannel(options);
};
