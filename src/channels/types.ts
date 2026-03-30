import type { AgentEvent } from '@mariozechner/pi-agent-core';

export interface ChannelAdapter {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: MessageHandler): void;
}

/**
 * 通道接收到的消息（通道无关的统一格式）
 */
export interface ChannelMessage {
  /** 消息唯一ID */
  id: string;
  /** 用户ID（跨通道统一标识） */
  userId: string;
  /** 消息内容 */
  content: string;
  /** 时间戳 */
  timestamp: Date;
  /** 原始通道标识 */
  channel: string;
  /** 通道特定的额外数据 */
  metadata?: Record<string, unknown>;
  /** 图片列表（base64 数据） */
  images?: Array<{ data: string; mimeType: string }>;
}

/**
 * 返回给通道的响应
 */
export interface ChannelResponse {
  /** 响应内容 */
  content: string;
  /** 是否结束对话 */
  done?: boolean;
  /** 额外数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 流式响应块（用于打字机效果）
 */
export interface ChannelStreamChunk {
  /** 内容块 */
  content: string;
  /** 是否最后一个块 */
  done: boolean;
}

/**
 * 通道能力声明。
 * 所有字段默认 false，非流式通道无需声明任何能力。
 */
export interface ChannelCapabilities {
  /** 支持流式输出（如 WebSocket） */
  streaming?: boolean;
}

/**
 * 通道上下文：定义通道如何发送响应。
 *
 * 能力驱动：
 * - send() 必须实现，发送完整响应（默认路径，所有通道都支持）
 * - sendStream() 仅在 capabilities.streaming=true 时由通道实现
 * - handler 通过 capabilities.streaming 判断是否走流式路径
 * - 不声明 capabilities 的通道自动走 send() 路径
 */
export interface ChannelContext {
  /** 发送完整文本响应（所有通道必须实现） */
  send(text: string): Promise<void>;
  /** 流式发送文本增量（仅 capabilities.streaming=true 的通道实现） */
  sendStream?(text: string, done: boolean): Promise<void>;
  /** 通道能力声明 */
  capabilities?: ChannelCapabilities;
}

export type MessageHandler = (
  message: ChannelMessage,
  context: ChannelContext
) => Promise<void>;

/**
 * 支持主动推送的通道
 * 在 ChannelAdapter 基础上增加向用户主动发送消息的能力
 * 用于 heartbeat、cron 等场景，无需用户先发消息
 */
export interface DeliverableChannel extends ChannelAdapter {
  /**
   * 主动向用户发送消息
   * @param userId 用户ID（格式: "websocket:xxx" 或 "qq:xxx"）
   * @param text 消息内容
   * @returns 是否成功送达
   */
  sendToUser(userId: string, text: string): Promise<boolean>;
}

// WebSocket 特有类型
export interface ClientMessage {
  type: 'prompt' | 'continue' | 'abort';
  content?: string;
  sessionId?: string;
  /** 图片列表（base64 数据） */
  images?: Array<{ data: string; mimeType: string }>;
}

export interface ServerMessage {
  type: 'event' | 'error' | 'done' | 'aborted';
  event?: AgentEvent;
  error?: string;
}
