/**
 * JITO BUNDLER - Bundle transactions for MEV protection
 */

const { VersionedTransaction } = require('@solana/web3.js');
const { JITO_ACCOUNTS } = require('../../config/jitoAccounts');
const { JITO_RPC } = require('../../config/rpcEndpoints');
const logger = require('../../utils/logger');

class JitoBundler {
  constructor() {
    this.bundleId = null;
  }

  /**
   * Send transactions as a Jito bundle
   */
  async sendBundle(connection, wallet, transactions, options = {}) {
    const { tipAmount = 1000, tipAccount = this.getRandomTipAccount() } = options;

    try {
      logger.info(`Creating Jito bundle with ${transactions.length} txs`);

      // Get blockhash
      const { blockhash } = await connection.getLatestBlockhash('finalized');

      // Prepare all transactions with same blockhash
      const preparedTxs = [];
      
      // Add tip transaction first
      const tipTx = await this.createTipTransaction(
        connection,
        wallet.publicKey,
        tipAccount,
        tipAmount,
        blockhash
      );
      preparedTxs.push(tipTx);

      // Add user transactions
      for (const tx of transactions) {
        // Ensure same blockhash
        if (tx.version === 0) {
          // Versioned transaction
          const message = tx.message;
          // Create new with same blockhash if needed
          preparedTxs.push(tx);
        } else {
          // Legacy transaction
          tx.recentBlockhash = blockhash;
          preparedTxs.push(tx);
        }
      }

      // Sign all transactions
      const signedTxs = [];
      for (let i = 0; i < preparedTxs.length; i++) {
        const tx = preparedTxs[i];
        
        if (i === 0) {
          // Sign tip transaction
          const signed = await wallet.signTransaction(tx);
          signedTxs.push(signed);
        } else {
          // Sign user transaction
          const signed = await wallet.signTransaction(tx);
          signedTxs.push(signed);
        }
      }

      // Serialize for bundle
      const serializedBundle = signedTxs.map(tx => {
        if (tx.version === 0) {
          return Buffer.from(tx.serialize()).toString('base64');
        } else {
          return tx.serialize({ requireAllSignatures: false }).toString('base64');
        }
      });

      // Send to Jito RPC
      const response = await fetch(JITO_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'sendBundle',
          params: [serializedBundle]
        })
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      this.bundleId = result.result;
      
      logger.success(`Bundle sent: ${this.bundleId}`);

      // Wait for confirmation (optional)
      if (options.waitForConfirmation) {
        await this.waitForBundleConfirmation(connection, this.bundleId);
      }

      return {
        success: true,
        bundleId: this.bundleId,
        transactionCount: signedTxs.length,
        signatures: signedTxs.map(tx => tx.signatures?.[0]?.toString()).filter(Boolean)
      };

    } catch (error) {
      logger.error('Jito bundle failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create tip transaction
   */
  async createTipTransaction(connection, fromPubkey, tipAccount, tipAmount, blockhash) {
    const { SystemProgram, Transaction } = require('@solana/web3.js');
    
    const transaction = new Transaction();
    transaction.feePayer = fromPubkey;
    transaction.recentBlockhash = blockhash;
    
    transaction.add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey: tipAccount,
        lamports: tipAmount
      })
    );

    return transaction;
  }

  /**
   * Get random tip account
   */
  getRandomTipAccount() {
    return JITO_ACCOUNTS[Math.floor(Math.random() * JITO_ACCOUNTS.length)];
  }

  /**
   * Wait for bundle confirmation
   */
  async waitForBundleConfirmation(connection, bundleId, timeout = 30000) {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(JITO_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBundleStatuses',
            params: [[bundleId]]
          })
        });

        const result = await response.json();
        const status = result.result?.value?.[0];
        
        if (status && status.confirmationStatus) {
          logger.info(`Bundle status: ${status.confirmationStatus}`);
          
          if (status.confirmationStatus === 'confirmed' || 
              status.confirmationStatus === 'finalized') {
            return status;
          }
        }
      } catch (error) {
        logger.debug('Status check error:', error.message);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Bundle confirmation timeout');
  }

  /**
   * Check if RPC supports Jito
   */
  async checkJitoSupport(rpcUrl = JITO_RPC) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBundleStatuses',
          params: [['test']]
        })
      });

      const result = await response.json();
      return { supported: !result.error, endpoint: rpcUrl };
    } catch {
      return { supported: false, endpoint: rpcUrl };
    }
  }
}

module.exports = new JitoBundler();