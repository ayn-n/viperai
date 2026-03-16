/**
 * HELPERS - Utility functions
 */

const { PublicKey } = require('@solana/web3.js');

/**
 * Sleep for ms
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate Solana address
 */
function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Truncate address for display
 */
function truncateAddress(address, chars = 8) {
  if (!address) return '';
  const str = address.toString();
  if (str.length <= chars * 2) return str;
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}

/**
 * Format SOL amount
 */
function formatSol(lamports) {
  return (lamports / 1e9).toFixed(6);
}

/**
 * Convert SOL to lamports
 */
function solToLamports(sol) {
  return Math.floor(sol * 1e9);
}

/**
 * Retry with exponential backoff
 */
async function retry(fn, maxAttempts = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts) break;
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Chunk array into batches
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Generate random ID
 */
function generateId(prefix = 'tx') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Safe JSON parse
 */
function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = {
  sleep,
  isValidSolanaAddress,
  truncateAddress,
  formatSol,
  solToLamports,
  retry,
  chunkArray,
  generateId,
  safeJsonParse
};