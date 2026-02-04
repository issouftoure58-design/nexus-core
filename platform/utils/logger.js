/**
 * Logger centralise NEXUS
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const CURRENT_LEVEL =
  LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.INFO;

function timestamp() {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

class Logger {
  error(message, ...args) {
    if (CURRENT_LEVEL >= LOG_LEVELS.ERROR) {
      console.error(`${timestamp()} [ERROR] ${message}`, ...args);
    }
  }

  warn(message, ...args) {
    if (CURRENT_LEVEL >= LOG_LEVELS.WARN) {
      console.warn(`${timestamp()} [WARN] ${message}`, ...args);
    }
  }

  info(message, ...args) {
    if (CURRENT_LEVEL >= LOG_LEVELS.INFO) {
      console.log(`${timestamp()} [INFO] ${message}`, ...args);
    }
  }

  debug(message, ...args) {
    if (CURRENT_LEVEL >= LOG_LEVELS.DEBUG) {
      console.log(`${timestamp()} [DEBUG] ${message}`, ...args);
    }
  }

  tenant(tenantId, message, ...args) {
    this.info(`[TENANT ${tenantId}] ${message}`, ...args);
  }

  api(method, path, status, duration) {
    this.info(`${method} ${path} ${status} ${duration}ms`);
  }
}

export const logger = new Logger();
