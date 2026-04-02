import type { Store } from '../store';
import { ChannelBindingStore } from '../store/channel-binding-store';
import { UserBot } from './user-bot';
import { getChannelFactory } from '../channels/registry';
import type { CronService } from '../cron/service';
import { logger } from '../infrastructure/logger';

/**
 * Bot 管理器
 * 负责管理所有用户的 UserBot 实例生命周期
 * - 启动时从数据库恢复已绑定用户
 * - 新用户绑定时创建并启动 UserBot
 * - 解绑时停止并销毁 UserBot
 */
export class BotManager {
  /** 活跃的 UserBot 实例，按 userId 索引 */
  private bots: Map<string, UserBot> = new Map();
  /** 渠道绑定存储层 */
  private bindingStore: ChannelBindingStore;

  constructor(
    private store: Store,
    private cronService?: CronService,
  ) {
    this.bindingStore = new ChannelBindingStore(store.db);
  }

  /**
   * 初始化：从数据库加载所有已绑定用户，恢复 Bot 实例
   * 在服务启动时调用
   */
  async init(): Promise<void> {
    const bindings = await this.bindingStore.listActive();
    logger.info('[bot-manager] restoring %d bindings', bindings.length);

    for (const binding of bindings) {
      try {
        await this.createAndStart(binding.userId, binding.channelType, JSON.parse(binding.credentials));
        logger.info('[bot-manager] restored userId=%s channel=%s', binding.userId, binding.channelType);
      } catch (err) {
        logger.error('[bot-manager] restore failed userId=%s error=%s', binding.userId, (err as Error).message);
      }
    }
  }

  /**
   * 创建并启动一个新的 UserBot
   * 1. 获取渠道工厂
   * 2. 用凭据创建渠道实例
   * 3. 创建 UserBot 并添加渠道
   *
   * @param userId 用户ID
   * @param channelType 渠道类型标识
   * @param credentials 渠道凭据
   * @returns 启动成功的 UserBot 实例
   */
  async createAndStart(
    userId: string,
    channelType: string,
    credentials: Record<string, string>,
  ): Promise<UserBot> {
    // 如果该用户已有 Bot 实例，先停止
    const existing = this.bots.get(userId);
    if (existing) {
      await existing.stop();
    }

    // 获取渠道工厂
    const factory = getChannelFactory(channelType);
    if (!factory) {
      throw new Error(`不支持的渠道类型: ${channelType}`);
    }

    // 用凭据创建渠道实例（工厂内部会验证凭据有效性）
    const channel = await factory.create(credentials);

    // 创建 UserBot 并添加渠道
    const bot = new UserBot(userId, this.store, this.cronService);
    logger.info('[bot-manager] DEBUG cronService=%s for userId=%s', typeof this.cronService, userId);
    await bot.addChannel(channel);

    // 注册到管理器
    this.bots.set(userId, bot);

    logger.info('[bot-manager] started userId=%s channel=%s total=%d', userId, channelType, this.bots.size);
    return bot;
  }

  /**
   * 绑定新用户：创建绑定记录 + 启动 Bot 实例
   * @param channelType 渠道类型
   * @param credentials 凭据
   * @returns 绑定后的 userId
   */
  async bind(channelType: string, credentials: Record<string, string>): Promise<string> {
    const factory = getChannelFactory(channelType);
    if (!factory) {
      throw new Error(`不支持的渠道类型: ${channelType}`);
    }

    if (!factory.enabled) {
      throw new Error(`渠道 ${factory.name} 暂未开放`);
    }

    // 根据 channelType 和凭据生成 userId
    // QQ 用 appId 作为标识
    const channelId = this.extractChannelId(channelType, credentials);
    const userId = `${channelType}:${channelId}`;

    // 检查是否已绑定
    const existing = await this.bindingStore.getActiveByUserId(userId);
    if (existing) {
      throw new Error(`该 ${factory.name} 已绑定，请先解绑`);
    }

    // 写入绑定记录
    await this.bindingStore.create({
      userId,
      channelType,
      credentials: JSON.stringify(credentials),
      status: 'active',
    });

    // 创建用户档案（如果不存在）
    const profile = await this.store.profile.get(userId);
    if (!profile) {
      await this.store.profile.upsert(userId, {});
    }

    // 启动 Bot 实例
    await this.createAndStart(userId, channelType, credentials);

    return userId;
  }

  /**
   * 解绑用户：停止 Bot + 更新绑定状态
   * @param userId 用户ID
   */
  async unbind(userId: string): Promise<void> {
    // 停止 Bot 实例
    const bot = this.bots.get(userId);
    if (bot) {
      await bot.stop();
      this.bots.delete(userId);
    }

    // 更新绑定状态为 inactive
    await this.bindingStore.updateStatus(userId, 'inactive');

    logger.info('[bot-manager] unbound userId=%s', userId);
  }

  /**
   * 获取指定用户的 Bot 实例
   */
  getBot(userId: string): UserBot | undefined {
    return this.bots.get(userId);
  }

  /**
   * 获取已有 Bot，或为未绑定用户创建临时 Bot
   * 用于 WebSocket 开发/调试场景：用户未通过绑定流程，但需要通过 WebSocket 交互
   * 临时 Bot 只有 Agent + Session，没有渠道，不能主动推送
   * @param userId 用户ID
   */
  async getOrCreateBot(userId: string): Promise<UserBot> {
    const existing = this.bots.get(userId);
    if (existing) return existing;

    // 创建无渠道的裸 Bot（只有 Agent + Session）
    const bot = new UserBot(userId, this.store, this.cronService);
    this.bots.set(userId, bot);

    // 确保用户档案存在
    const profile = await this.store.profile.get(userId);
    if (!profile) {
      await this.store.profile.upsert(userId, {});
    }

    logger.info('[bot-manager] created bare bot userId=%s', userId);
    return bot;
  }

  /**
   * 获取所有活跃的 Bot 实例
   */
  getAllBots(): UserBot[] {
    return Array.from(this.bots.values());
  }

  /**
   * 停止所有 Bot 实例
   * 在服务关闭时调用
   */
  async stopAll(): Promise<void> {
    for (const bot of this.bots.values()) {
      try {
        await bot.stop();
      } catch (err) {
        logger.error('[bot-manager] stop failed userId=%s error=%s', bot.userId, (err as Error).message);
      }
    }
    this.bots.clear();
    logger.info('[bot-manager] all bots stopped');
  }

  /**
   * 从凭据中提取渠道标识
   * 不同渠道使用不同的字段作为唯一标识
   * @param channelType 渠道类型
   * @param credentials 凭据
   */
  private extractChannelId(channelType: string, credentials: Record<string, string>): string {
    switch (channelType) {
      case 'qq':
        return credentials.appId;
      // 未来渠道在此添加：
      // case 'wechat': return credentials.appId;
      // case 'telegram': return credentials.botToken;
      default:
        throw new Error(`未知的渠道类型: ${channelType}`);
    }
  }
}
