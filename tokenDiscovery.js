/**
 * TOKEN DISCOVERY - Scan wallets for all SPL tokens
 */

const { PublicKey } = require('@solana/web3.js');
const { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  DESTINATION_WALLET 
} = require('../../config/constants');
const logger = require('../../utils/logger');

class TokenDiscovery {
  /**
   * Get all token accounts with non-zero balances
   */
  async scanWalletTokens(connection, walletPublicKey, options = {}) {
    const { includeZeroBalances = false, logResults = true } = options;

    try {
      if (!connection || !walletPublicKey) {
        throw new Error('Connection and wallet required');
      }

      if (logResults) {
        logger.info(`Scanning tokens for: ${walletPublicKey.toBase58()}`);
      }

      // Get all token accounts
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletPublicKey,
        { programId: TOKEN_PROGRAM_ID }
      );

      // Process accounts
      const results = [];
      
      for (const accountInfo of tokenAccounts.value) {
        const parsed = accountInfo.account.data.parsed.info;
        const balance = parsed.tokenAmount.uiAmount;
        const rawBalance = parsed.tokenAmount.amount;
        const decimals = parsed.tokenAmount.decimals;
        const mint = parsed.mint;
        const accountAddress = accountInfo.pubkey;

        // Get associated token account for destination (using imported DESTINATION_WALLET)
        const destinationAta = await this.getAssociatedTokenAddress(
          new PublicKey(mint),
          DESTINATION_WALLET  // Now properly imported
        );

        const tokenData = {
          mint,
          balance,
          rawBalance: BigInt(rawBalance),
          decimals,
          accountAddress,
          destinationAta,
          tokenInfo: parsed,
          symbol: parsed.symbol || 'Unknown',
          name: parsed.name || mint.slice(0, 8)
        };

        if (balance > 0 || includeZeroBalances) {
          results.push(tokenData);
          
          if (logResults && balance > 0) {
            logger.debug(`Found: ${balance} ${tokenData.symbol} (${mint.slice(0, 8)}...)`);
          }
        }
      }

      if (logResults) {
        logger.info(`Found ${results.length} tokens with balance`);
      }

      return results;

    } catch (error) {
      logger.error('Token discovery failed:', error);
      throw error;
    }
  }

  /**
   * Get associated token address
   * Now using imported constants instead of require inside function
   */
  async getAssociatedTokenAddress(mint, owner) {
    // Using imported TOKEN_PROGRAM_ID and ASSOCIATED_TOKEN_PROGRAM_ID
    const [address] = await PublicKey.findProgramAddress(
      [
        owner.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer()
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID  // Now properly imported
    );
    
    return address;
  }

  /**
   * Get token balance for specific mint
   */
  async getTokenBalance(connection, walletAddress, mintAddress) {
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletAddress,
        { mint: mintAddress }
      );

      if (tokenAccounts.value.length === 0) {
        return { balance: 0, rawBalance: 0, account: null };
      }

      const account = tokenAccounts.value[0];
      const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
      const rawBalance = account.account.data.parsed.info.tokenAmount.amount;

      return {
        balance,
        rawBalance: BigInt(rawBalance),
        account: account.pubkey
      };
    } catch (error) {
      logger.error('Get token balance failed:', error);
      return { balance: 0, rawBalance: 0, account: null };
    }
  }
}

// Export instance (same as before)
module.exports = new TokenDiscovery();