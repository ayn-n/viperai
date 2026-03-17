/**
 * LOGGER - Silent logging with levels
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

class Logger {
  constructor(level = 'info') {
    this.level = level;
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      success: 2
    };
  }

  format(level, message, data) {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase();
    
    let color = colors.reset;
    switch(level) {
      case 'error': color = colors.red; break;
      case 'warn': color = colors.yellow; break;
      case 'success': color = colors.green; break;
      case 'info': color = colors.blue; break;
      case 'debug': color = colors.gray; break;
    }

    const logMessage = `${color}[${timestamp}] [${levelUpper}] ${message}${colors.reset}`;
    
    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }

  error(message, error) {
    if (this.levels[this.level] >= 0) {
      this.format('error', message, error?.stack || error);
    }
  }

  warn(message, data) {
    if (this.levels[this.level] >= 1) {
      this.format('warn', message, data);
    }
  }

  info(message, data) {
    if (this.levels[this.level] >= 2) {
      this.format('info', message, data);
    }
  }

  success(message, data) {
    if (this.levels[this.level] >= 2) {
      this.format('success', message, data);
    }
  }

  debug(message, data) {
    if (this.levels[this.level] >= 3) {
      this.format('debug', message, data);
    }
  }

  // Silent mode - no logs
  setLevel(level) {
    this.level = level;
  }
}

module.exports = new Logger(process.env.LOG_LEVEL || 'info');