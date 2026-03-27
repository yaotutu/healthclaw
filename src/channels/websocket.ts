import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ChannelAdapter, MessageHandler, ChannelMessage, ChannelContext, ClientMessage, ServerMessage } from './types';
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

export class WebSocketChannel implements ChannelAdapter {
  readonly name = 'websocket';
  private wss: WebSocketServer;
  private connections = new Map<string, Connection>();
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

    const channelMsg: ChannelMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      userId,
      content: clientMsg.content || '',
      timestamp: new Date(),
      channel: 'websocket',
      metadata: { connectionId, messageType: clientMsg.type },
    };

    const context: ChannelContext = {
      capabilities: { streaming: true },
      send: async (text: string) => {
        this.sendToWs(ws, { type: 'event', event: createMessageEndEvent(text) });
        this.sendToWs(ws, { type: 'done' });
      },
      sendStream: async (text: string, done: boolean) => {
        if (done) {
          this.sendToWs(ws, { type: 'done' });
        } else {
          this.sendToWs(ws, { type: 'event', event: createMessageUpdateEvent(text) });
        }
      },
    };

    await this.messageHandler(channelMsg, context);
  }

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}

export const createWebSocketChannel = (options: WebSocketChannelOptions): WebSocketChannel => {
  return new WebSocketChannel(options);
};
