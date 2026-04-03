import { Hono } from 'hono';
import { loginWithQR } from 'weixin-ilink';
import type { BotManager } from '../bot/bot-manager';
import { createLogger } from '../infrastructure/logger';
const log = createLogger('wechat');

/**
 * 微信 QR 扫码登录的状态
 * 用于在 API 端点之间共享登录进度
 */
interface WechatLoginState {
  /** 当前状态 */
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired' | 'error';
  /** QR 码图片 URL */
  qrCodeUrl?: string;
  /** 登录成功后的 userId（绑定完成） */
  userId?: string;
  /** 错误信息 */
  error?: string;
  /** QR URL 的 Promise resolve（用于 POST /qrcode 等待 QR 就绪） */
  resolveQR?: (url: string) => void;
}

/**
 * 活跃的 QR 登录会话（内存存储，服务重启后清空）
 */
const loginStates = new Map<string, WechatLoginState>();

/**
 * 创建微信 QR 登录路由
 *
 * 流程：
 * 1. 前端调用 POST /qrcode 生成 QR 码
 * 2. 前端轮询 GET /login-status/:loginId 跟踪状态
 * 3. 用户用微信扫码 → 后端自动绑定（重复绑定会自动替换旧绑定）→ 返回 confirmed
 *
 * @param botManager Bot 管理器实例
 * @returns Hono 子应用
 */
export function createWechatRoutes(botManager: BotManager): Hono {
  const router = new Hono();

  /**
   * POST /qrcode
   * 生成微信 QR 码，启动扫码登录流程
   * 后台运行 loginWithQR()，扫码成功后检查是否需要二次确认
   */
  router.post('/qrcode', async (c) => {
    const loginId = `wechat-${Date.now()}`;
    const state: WechatLoginState = { status: 'waiting' };

    // 创建 Promise 等待 QR URL 就绪
    const qrPromise = new Promise<string>((resolve) => {
      state.resolveQR = resolve;
    });

    loginStates.set(loginId, state);

    log.info('QR login session created loginId=%s', loginId);

    // 后台启动 QR 登录流程
    loginWithQR({
      onQRCode: (url) => {
        log.info('QR code generated loginId=%s', loginId);
        state.qrCodeUrl = url;
        state.resolveQR?.(url);
      },
      onStatusChange: (status) => {
        log.info('login status change loginId=%s status=%s', loginId, status);
        if (status === 'scanned') {
          state.status = 'scanned';
        } else if (status === 'refreshing') {
          // QR 过期后自动刷新，状态重置为 waiting
          state.status = 'waiting';
        } else if (status === 'waiting') {
          state.status = 'waiting';
        }
      },
    }).then(async (result) => {
      log.info('login confirmed loginId=%s accountId=%s ilinkUserId=%s', loginId, result.accountId, result.userId);
      try {
        const credentials: Record<string, string> = {
          botToken: result.botToken,
          baseUrl: result.baseUrl,
          accountId: result.accountId,
          ilinkUserId: result.userId || '',
        };

        log.info('attempting bind loginId=%s ilinkUserId=%s', loginId, credentials.ilinkUserId);
        const userId = await botManager.bind('wechat', credentials);

        log.info('bind success loginId=%s userId=%s', loginId, userId);
        state.userId = userId;
        state.status = 'confirmed';
      } catch (err) {
        log.error('bind failed loginId=%s error=%s', loginId, (err as Error).message);
        state.error = (err as Error).message;
        state.status = 'error';
      }
    }).catch((err) => {
      log.error('QR login failed loginId=%s error=%s', loginId, err.message);
      state.error = err.message;
      state.status = 'error';
    });

    // 等待 QR URL 就绪后返回（loginWithQR 会异步生成 QR 码）
    const qrCodeUrl = await qrPromise;

    return c.json({ loginId, qrCodeUrl });
  });

  /**
   * GET /login-status/:loginId
   * 查询 QR 扫码登录状态
   * 前端每 2 秒轮询此接口，直到状态变为 confirmed / needs_rebind / error
   *
   * 状态流转：
   *   waiting → scanned → confirmed（新用户）
   *                       → needs_rebind（已有绑定，等确认）
   *                       → error
   */
  router.get('/login-status/:loginId', async (c) => {
    const loginId = c.req.param('loginId');
    const state = loginStates.get(loginId);

    if (!state) {
      log.warn('login status queried for unknown loginId=%s', loginId);
      return c.json({ error: '登录会话不存在或已过期' }, 404);
    }

    const { status, qrCodeUrl, userId, error } = state;

    // 终态 60 秒后清理，让客户端有时间获取最终状态
    if (status === 'confirmed' || status === 'error') {
      log.info('login session cleanup loginId=%s status=%s userId=%s', loginId, status, userId || '');
      setTimeout(() => loginStates.delete(loginId), 60_000);
    }

    return c.json({ status, qrCodeUrl, userId, error });
  });

  return router;
}
