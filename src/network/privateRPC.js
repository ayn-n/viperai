/**
 * PRIVATE RPC - High-performance RPC connection management
 */

const { Connection } = require('@solana/web3.js');
const { PRIVATE_RPC, PUBLIC_RPC, JITO_RPC } = require('../../config/rpcEndpoints');
const logger = require('../../utils/logger');

class PrivateRPCManager {
  constructor() {
    this.connections = new Map();
    this.defaultEndpoint = process.env.NODE_ENV === 'production' ? PRIVATE_RPC : PUBLIC_RPC;
  }

  /**
   * Get connection (cached)
   */
  getConnection(endpoint = null) {
    const rpcUrl = endpoint || this.defaultEndpoint;
    
    if (this.connections.has(rpcUrl)) {
      return this.connections.get(rpcUrl);
    }

    const connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
      disableRetryOnRateLimit: false,
      httpHeaders: {
        'Content-Type': 'application/json',
      }
    });

    this.connections.set(rpcUrl, connection);
    logger.info(`RPC connection created: ${rpcUrl.split('/')[2]}`);
    
    return connection;
  }

  /**
   * Get JITO connection for bundling
   */
  getJitoConnection() {
    return this.getConnection(JITO_RPC);
  }

  /**
   * Test connection speed
   */
  async testConnection(endpoint = null) {
    const connection = this.getConnection(endpoint);
    const start = Date.now();
    
    try {
      const slot = await connection.getSlot();
      const latency = Date.now() - start;
      
      return {
        success: true,
        slot,
        latency,
        endpoint: endpoint || this.defaultEndpoint
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        latency: Date.now() - start
      };
    }
  }

  /**
   * Get fastest connection
   */
  async getFastestConnection(endpoints = [PRIVATE_RPC, PUBLIC_RPC]) {
    const results = await Promise.all(
      endpoints.map(async (endpoint) => {
        const result = await this.testConnection(endpoint);
        return { ...result, endpoint };
      })
    );

    const fastest = results
      .filter(r => r.success)
      .sort((a, b) => a.latency - b.latency)[0];

    if (fastest) {
      logger.info(`Fastest RPC: ${fastest.endpoint.split('/')[2]} (${fastest.latency}ms)`);
      return this.getConnection(fastest.endpoint);
    }

    logger.warn('No successful RPC, using default');
    return this.getConnection();
  }

  /**
   * Clear connection cache
   */
  clearCache() {
    this.connections.clear();
    logger.info('RPC connection cache cleared');
  }
}

module.exports = new PrivateRPCManager();