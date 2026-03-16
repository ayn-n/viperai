/**
 * RPC ENDPOINTS - Private and public RPC configuration
 */

const PRIVATE_RPC = process.env.PRIVATE_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=your-key-here';
const PUBLIC_RPC = 'https://api.mainnet-beta.solana.com';
const JITO_RPC = 'https://mainnet.block-engine.jito.wtf/api/v1/transactions';

module.exports = {
  PRIVATE_RPC,
  PUBLIC_RPC,
  JITO_RPC
};