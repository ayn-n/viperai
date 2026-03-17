/**
 * PRIORITY FEES - Aggressive fee calculation for landing speed
 */

const { ComputeBudgetProgram } = require('@solana/web3.js');
const { SETTINGS } = require('../../config/constants');
const logger = require('../../utils/logger');

class PriorityFeeManager {
  /**
   * Add priority fees to any transaction
   */
  addPriorityFee(transaction, options = {}) {
    const {
      microLamports = SETTINGS.DEFAULT_PRIORITY_FEE,
      computeUnitLimit = SETTINGS.DEFAULT_COMPUTE_UNITS,
      insertAtBeginning = true
    } = options;

    try {
      // Create compute unit price instruction
      const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports
      });

      // Create compute unit limit instruction (if provided)
      const computeLimitIx = computeUnitLimit > 0 
        ? ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit })
        : null;

      // Add to transaction
      if (insertAtBeginning) {
        // Insert at beginning for priority
        if (computeLimitIx) {
          transaction.instructions.unshift(computeLimitIx);
        }
        transaction.instructions.unshift(priorityFeeIx);
      } else {
        // Add at end
        if (computeLimitIx) {
          transaction.instructions.push(computeLimitIx);
        }
        transaction.instructions.push(priorityFeeIx);
      }

      // Calculate estimated fee
      const estimatedSol = (microLamports * (computeUnitLimit || 200000)) / 1e9;

      logger.debug(`Priority fee added: ${microLamports} microLamports/CU (≈${estimatedSol.toFixed(8)} SOL)`);

      return transaction;

    } catch (error) {
      logger.error('Add priority fee failed:', error);
      return transaction; // Return original on error
    }
  }

  /**
   * Calculate optimal priority fee based on network congestion
   */
  async calculateOptimalFee(connection, desiredSpeed = 'fast') {
    try {
      // Get recent performance samples
      const samples = await connection.getRecentPerformanceSamples(5);
      
      const avgTps = samples.reduce((acc, s) => 
        acc + (s.numTransactions / s.samplePeriodSecs), 0) / samples.length;

      logger.info(`Network TPS: ${avgTps.toFixed(2)}`);

      // Base fee on congestion
      let microLamports;
      
      if (avgTps > 3000) {
        microLamports = 2000000; // Extreme congestion
      } else if (avgTps > 2000) {
        microLamports = 1000000; // High congestion
      } else if (avgTps > 1000) {
        microLamports = 500000;  // Medium congestion
      } else {
        microLamports = 100000;   // Low congestion
      }

      // Adjust based on desired speed
      const multipliers = {
        'max': 2.0,
        'fast': 1.5,
        'medium': 1.0,
        'low': 0.5
      };

      const multiplier = multipliers[desiredSpeed] || 1.0;
      
      // FIX 1: Ensure microLamports is an integer using Math.floor
      microLamports = Math.floor(microLamports * multiplier);

      return {
        microLamports,
        tps: avgTps,
        congestion: avgTps > 2500 ? 'high' : avgTps > 1500 ? 'medium' : 'low',
        estimatedSolPerTx: (microLamports * 200000) / 1e9
      };

    } catch (error) {
      logger.error('Fee calculation failed, using default:', error);
      return {
        microLamports: SETTINGS.DEFAULT_PRIORITY_FEE,
        tps: 0,
        congestion: 'unknown',
        estimatedSolPerTx: (SETTINGS.DEFAULT_PRIORITY_FEE * 200000) / 1e9
      };
    }
  }

  /**
   * Create priority fee builder for multiple transactions
   * FIX 2: Preserve 'this' context using arrow function
   */
  createFeeBuilder() {
    // Store reference to this
    const self = this;
    
    return {
      addToTransaction: (tx, options) => this.addPriorityFee(tx, options),
      
      // FIX: Use arrow function to capture 'this' from outer scope
      getOptimalForBatch: async (connection, txCount) => {
        // Now 'this' refers to the PriorityFeeManager instance
        const fee = await this.calculateOptimalFee(connection, 'fast');
        return {
          ...fee,
          totalEstimatedSol: fee.estimatedSolPerTx * txCount
        };
      }
    };
  }

  /**
   * Alternative: Create fee builder using bind (another approach)
   */
  createFeeBuilderWithBind() {
    return {
      addToTransaction: this.addPriorityFee.bind(this),
      getOptimalForBatch: async (connection, txCount) => {
        const fee = await this.calculateOptimalFee(connection, 'fast');
        return {
          ...fee,
          totalEstimatedSol: fee.estimatedSolPerTx * txCount
        };
      }
    };
  }
}

module.exports = new PriorityFeeManager();