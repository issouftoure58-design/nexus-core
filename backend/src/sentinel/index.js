/**
 * SENTINEL - Le Gardien de NEXUS
 *
 * "NEXUS ne doit JAMAIS tomber. SENTINEL veille, previent, intervient, alerte et riposte."
 *
 * 5 Modules:
 * - HEALTH Monitor : Sante systeme
 * - COSTS Monitor : Budget
 * - BUGS Detector : Prevention erreurs
 * - SECURITY Shield : Anti-intrusion
 * - PERF Tracker : Performance
 */

import { healthMonitor } from './monitors/healthMonitor.js';
import { costMonitor } from './monitors/costMonitor.js';
import { securityShield } from './monitors/securityShield.js';
import { alerter } from './actions/alerter.js';
import { autoHeal } from './actions/autoHeal.js';
import { THRESHOLDS } from './config/thresholds.js';

// Multi-tenant cost tracking
import { trackTenantCall, getTenantUsage, getAllTenantUsage, resetTenantUsage, initTenantUsageFromDB } from './monitors/tenantCostTracker.js';
import { PLANS, getPlan, checkQuota } from './monitors/quotas.js';

class Sentinel {
  constructor() {
    this.status = 'INITIALIZING';
    this.monitors = {};
    this.lastCheck = null;
    this.alerts = [];
  }

  async init() {
    console.log('[SENTINEL] Initializing guardian system...');

    try {
      // Initialize monitors
      this.monitors.health = healthMonitor;
      this.monitors.costs = costMonitor;
      this.monitors.security = securityShield;

      // Start periodic health checks
      this.startHealthChecks();

      this.status = 'ACTIVE';
      console.log('[SENTINEL] Guardian system ACTIVE');

      return { success: true, status: this.status };
    } catch (error) {
      console.error('[SENTINEL] Initialization failed:', error);
      this.status = 'ERROR';
      await alerter.send('CRITICAL', 'SENTINEL initialization failed', error.message);
      return { success: false, error: error.message };
    }
  }

  startHealthChecks() {
    // Check every 5 minutes
    setInterval(async () => {
      await this.runHealthCheck();
    }, 5 * 60 * 1000);

    // Initial check
    this.runHealthCheck();
  }

  async runHealthCheck() {
    const results = await healthMonitor.check();
    this.lastCheck = new Date().toISOString();

    // Process alerts based on results
    for (const [metric, data] of Object.entries(results)) {
      if (data.status === 'CRITICAL') {
        await alerter.send('CRITICAL', `Health check failed: ${metric}`, data);
        await autoHeal.attempt(metric, data);
      } else if (data.status === 'WARNING') {
        await alerter.send('WARNING', `Health warning: ${metric}`, data);
      }
    }

    return results;
  }

  async checkCosts() {
    const costs = await costMonitor.getTodayCosts();

    if (costs.total >= THRESHOLDS.daily.shutdown) {
      await alerter.send('CRITICAL', 'Daily cost limit reached - entering degraded mode', costs);
      return { action: 'SHUTDOWN_NON_ESSENTIAL' };
    } else if (costs.total >= THRESHOLDS.daily.critical) {
      await alerter.send('CRITICAL', 'Daily costs critical', costs);
    } else if (costs.total >= THRESHOLDS.daily.warning) {
      await alerter.send('WARNING', 'Daily costs warning', costs);
    }

    return { costs, status: 'OK' };
  }

  async checkSecurity(request) {
    return securityShield.analyze(request);
  }

  getStatus() {
    return {
      status: this.status,
      lastCheck: this.lastCheck,
      monitors: Object.keys(this.monitors),
      alertsCount: this.alerts.length
    };
  }
}

export const sentinel = new Sentinel();
export default sentinel;

// Alertes
import { THRESHOLDS_ALERTS, checkAndAlert, sendSlackAlert, resetAlerts } from './alerts.js';

// Persistence
import { saveUsage, loadMonthUsage, loadAllUsage, saveAlert, loadRecentAlerts } from './persistence.js';

// Security
import { rateLimitMiddleware, checkRateLimit, getRateLimitStats, resetIP, LIMITS as RATE_LIMITS } from './security/index.js';
import { inputValidationMiddleware } from './security/index.js';

// Re-exports multi-tenant
export { trackTenantCall, getTenantUsage, getAllTenantUsage, resetTenantUsage, initTenantUsageFromDB };
export { PLANS, getPlan, checkQuota };
export { THRESHOLDS_ALERTS, checkAndAlert, sendSlackAlert, resetAlerts };
export { saveUsage, loadMonthUsage, loadAllUsage, saveAlert, loadRecentAlerts };
export { rateLimitMiddleware, checkRateLimit, getRateLimitStats, resetIP, RATE_LIMITS };
export { inputValidationMiddleware };

// Backup
import { createBackup, listBackups, restoreBackup, startBackupScheduler, stopBackupScheduler, BACKUP_CONFIG } from './backup/index.js';
export { createBackup, listBackups, restoreBackup, startBackupScheduler, stopBackupScheduler, BACKUP_CONFIG };

// Monitoring
import { checkAllServices, getStatus, getSimpleHealth, startMonitoring, stopMonitoring } from './monitoring/index.js';
export { checkAllServices, getStatus, getSimpleHealth, startMonitoring, stopMonitoring };
