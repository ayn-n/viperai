/**
 * GAS CALCULATOR - Smart lamport calculation (sweep max minus rent)
 */

const { SystemProgram, Transaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { SETTINGS } = require('../../config/constants');
const logger = require('../../utils/logger');

class GasCalculator {
  /**
   * Calculate transferable amount after reserving fees
   */
  async calculateTransferAmount(connection, walletPubkey, options = {}) {
    const { feeReserve = SETTINGS.FEE_RESERVE_SOL } = options;

    try {
      // Get SOL balance
      const balanceLamports = await connection.getBalance(walletPubkey);
      const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

      // Fee reserve in lamports
      const feeReserveLamports = feeReserve * LAMPORTS_PER_SOL;

      // Transferable amount
      const transferableLamports = balanceLamports - feeReserveLamports;
      const transferableSol = transferableLamports / LAMPORTS_PER_SOL;

      logger.info(`Balance: ${balanceSol.toFixed(6)} SOL, Reserve: ${feeReserve} SOL, Transfer: ${transferableSol.toFixed(6)} SOL`);

      if (transferableLamports <= 0) {
        logger.warn(`Insufficient balance after reserving fees`);
      }

      return {
        success: true,
        totalBalance: { lamports: balanceLamports, sol: balanceSol },
        feeReserve: { lamports: feeReserveLamports, sol: feeReserve },
        transferAmount: { lamports: transferableLamports, sol: transferableSol },
        canTransfer: transferableLamports > 0
      };

    } catch (error) {
      logger.error('Gas calculation failed:', error);
      return {
        success: false,
        error: error.message,
        transferAmount: { lamports: 0, sol: 0 },
        canTransfer: false
      };
    }
  }

  /**
   * Create SOL transfer with calculated amount
   */
  async createSolTransfer(connection, fromPubkey, toPubkey, amountLamports = null) {
    try {
      let transferAmount = amountLamports;
      
      if (transferAmount === null) {
        const calc = await this.calculateTransferAmount(connection, fromPubkey);
        if (!calc.canTransfer) {
          throw new Error('Insufficient balance after fees');
        }
        transferAmount = calc.transferAmount.lamports;
      }

      const { blockhash } = await connection.getLatestBlockhash('finalized');
      
      const transaction = new Transaction();
      transaction.feePayer = fromPubkey;
      transaction.recentBlockhash = blockhash;
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: transferAmount
        })
      );

      return transaction;

    } catch (error) {
      logger.error('Create SOL transfer failed:', error);
      throw error;
    }
  }

  /**
   * Calculate rent-exempt minimum for token accounts
   */
  async getRentExemptMinimum(connection, space = 165) { // Token account space
    const rent = await connection.getMinimumBalanceForRentExemption(space);
    return rent / LAMPORTS_PER_SOL;
  }

  /**
   * Check if account can be closed to recover rent
   */
  async canCloseAccount(connection, tokenAccount) {
    try {
      const balance = await connection.getBalance(tokenAccount);
      const rentExempt = await connection.getMinimumBalanceForRentExemption(165);
      
      return {
        canClose: balance > rentExempt,
        recoverableLamports: balance - rentExempt,
        recoverableSol: (balance - rentExempt) / LAMPORTS_PER_SOL
      };
    } catch (error) {
      logger.error('Close account check failed:', error);
      return { canClose: false, recoverableLamports: 0 };
    }
  }

  /**
   * Calculate total sweep amount including token account closures
   */
  async calculateTotalSweep(connection, walletPubkey, tokens) {
    const solCalc = await this.calculateTransferAmount(connection, walletPubkey);
    
    let totalRecoverable = 0;
    
    for (const token of tokens) {
      const closeInfo = await this.canCloseAccount(connection, token.accountAddress);
      if (closeInfo.canClose) {
        totalRecoverable += closeInfo.recoverableLamports;
      }
    }

    const totalLamports = solCalc.transferAmount.lamports + totalRecoverable;
    
    return {
      solTransfer: solCalc.transferAmount.sol,
      tokenAccountRecoverable: totalRecoverable / LAMPORTS_PER_SOL,
      totalSol: totalLamports / LAMPORTS_PER_SOL,
      totalLamports
    };
  }
}

module.exports = new GasCalculator();