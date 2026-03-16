/**
 * ERROR HANDLER - Silent retry logic with rejection detection
 */

const logger = require('../../utils/logger');

class ErrorHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 3000;
    this.silentMode = options.silentMode || false;
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry(fn, options = {}) {
    const maxAttempts = options.maxAttempts || this.maxRetries;
    const delay = options.delay || this.retryDelay;
    const silent = options.silent ?? this.silentMode;

    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (!silent) {
          logger.debug(`Attempt ${attempt}/${maxAttempts}`);
        }
        
        const result = await fn();
        
        if (!silent && attempt > 1) {
          logger.info(`Success after ${attempt} attempts`);
        }
        
        return {
          success: true,
          result,
          attempts: attempt
        };
        
      } catch (error) {
        lastError = error;
        
        // Check if it's a user rejection (should not retry silently)
        if (this.isUserRejection(error)) {
          if (!silent) {
            logger.warn(`User rejected (attempt ${attempt})`);
          }
          
          if (attempt < maxAttempts) {
            if (!silent) {
              logger.info(`Retrying in ${delay/1000}s...`);
            }
            await this.sleep(delay);
            continue;
          }
        }
        
        // Non-rejection error or out of retries
        if (attempt === maxAttempts) {
          if (!silent) {
            logger.error(`All ${maxAttempts} attempts failed:`, error);
          }
          
          return {
            success: false,
            error: error.message,
            attempts: attempt,
            userRejected: this.isUserRejection(error)
          };
        }
        
        // Retry other errors
        if (!silent) {
          logger.warn(`Attempt ${attempt} failed, retrying in ${delay/1000}s...`);
        }
        await this.sleep(delay);
      }
    }
  }

  /**
   * Detect user rejection across wallets
   */
  isUserRejection(error) {
    const rejectionMessages = [
      'User rejected',
      'Transaction rejected',
      'User cancelled',
      'Canceled',
      'Cancelled',
      'Signature canceled',
      'User did not approve',
      'Request rejected',
      'window.solana.signAndSendTransaction: User rejected',
      'User declined',
      'Rejected by user',
      ' rejected ',
      'denied by user'
    ];
    
    const errorMessage = error.message?.toLowerCase() || error.toString().toLowerCase();
    
    return rejectionMessages.some(msg => 
      errorMessage.includes(msg.toLowerCase())
    );
  }

  /**
   * Silent execution (no logs)
   */
  async executeSilent(fn) {
    const originalSilent = this.silentMode;
    this.silentMode = true;
    
    try {
      const result = await this.executeWithRetry(fn, { silent: true });
      return result;
    } finally {
      this.silentMode = originalSilent;
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create wrapped function with retry
   */
  wrap(fn) {
    return async (...args) => {
      return this.executeWithRetry(() => fn(...args));
    };
  }
}

module.exports = new ErrorHandler();