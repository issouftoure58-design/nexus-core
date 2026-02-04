/**
 * SENTINEL Action - Module AGIR
 * Orchestre la detection, analyse et reparation automatique
 */

import autoRepair from '../actions/autoRepair.js';
import errorCollector from '../collectors/errorCollector.js';
import healthCollector from '../collectors/healthCollector.js';
import errorAnalyzer from '../analyzers/errorAnalyzer.js';

class SentinelAction {
  constructor() {
    this.isActive = false;
    this.healthCheckInterval = null;
    this.errorMonitorInterval = null;
    this.startTime = null;

    // Configuration
    this.config = {
      healthCheckIntervalMs: 30000,    // 30 secondes
      errorMonitorIntervalMs: 60000,   // 60 secondes
      recurringErrorThreshold: 5,      // Seuil pour pattern recurrent
      autoRepairEnabled: true
    };
  }

  /**
   * Demarre SENTINEL Action
   */
  start() {
    if (this.isActive) {
      console.log('[SENTINEL-ACTION] Already running');
      return { success: false, reason: 'already_running' };
    }

    console.log('[SENTINEL-ACTION] Starting...');
    this.isActive = true;
    this.startTime = new Date().toISOString();

    // Health checks periodiques
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);

    // Monitoring erreurs periodique
    this.errorMonitorInterval = setInterval(async () => {
      await this.monitorErrors();
    }, this.config.errorMonitorIntervalMs);

    // Premier check immediat
    this.performHealthCheck();

    console.log('[SENTINEL-ACTION] Started successfully');
    return { success: true, startTime: this.startTime };
  }

  /**
   * Arrete SENTINEL Action
   */
  stop() {
    if (!this.isActive) {
      console.log('[SENTINEL-ACTION] Not running');
      return { success: false, reason: 'not_running' };
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.errorMonitorInterval) {
      clearInterval(this.errorMonitorInterval);
      this.errorMonitorInterval = null;
    }

    this.isActive = false;
    console.log('[SENTINEL-ACTION] Stopped');
    return { success: true };
  }

  /**
   * Health check periodique
   */
  async performHealthCheck() {
    try {
      const health = await healthCollector.checkAll();

      if (health.overall === 'critical') {
        console.error('[SENTINEL-ACTION] CRITICAL: System health critical!');

        // Tenter reparations sur services critiques down
        for (const [serviceName, serviceStatus] of Object.entries(health.services)) {
          if (serviceStatus.status === 'unhealthy' && serviceStatus.critical) {
            await this.handleUnhealthyService(serviceName, serviceStatus);
          }
        }
      } else if (health.overall === 'degraded') {
        console.warn('[SENTINEL-ACTION] WARNING: System health degraded');
        console.warn('  Unhealthy services:',
          Object.entries(health.services)
            .filter(([_, v]) => v.status === 'unhealthy')
            .map(([k]) => k)
            .join(', ')
        );
      }

      return health;
    } catch (error) {
      console.error('[SENTINEL-ACTION] Health check failed:', error.message);
      return null;
    }
  }

  /**
   * Gere un service en mauvaise sante
   */
  async handleUnhealthyService(serviceName, serviceStatus) {
    console.log(`[SENTINEL-ACTION] Handling unhealthy service: ${serviceName}`);

    // Creer une erreur fictive pour declencher la reparation
    const mockError = new Error(`Service ${serviceName} unhealthy: ${serviceStatus.error || 'unknown'}`);

    if (serviceName === 'database') {
      mockError.message = 'Database connection lost';
    } else if (serviceName === 'memory') {
      mockError.message = 'Memory exhaustion detected';
    }

    // Tenter reparation
    if (this.config.autoRepairEnabled) {
      const result = await autoRepair.repair(mockError, { service: serviceName });
      console.log(`[SENTINEL-ACTION] Repair result for ${serviceName}:`, result.success ? 'SUCCESS' : 'FAILED');
    }
  }

  /**
   * Monitoring erreurs recurrentes
   */
  async monitorErrors() {
    try {
      const patterns = errorCollector.detectPatterns(5); // 5 minutes

      // Patterns recurrents au-dessus du seuil
      const recurring = patterns.filter(p => p.count >= this.config.recurringErrorThreshold);

      if (recurring.length > 0) {
        console.warn(`[SENTINEL-ACTION] ${recurring.length} recurring error pattern(s) detected`);

        for (const pattern of recurring) {
          await this.handleRecurringPattern(pattern);
        }
      }

      return { patterns: patterns.length, recurring: recurring.length };
    } catch (error) {
      console.error('[SENTINEL-ACTION] Error monitoring failed:', error.message);
      return null;
    }
  }

  /**
   * Gere un pattern d'erreurs recurrentes
   */
  async handleRecurringPattern(pattern) {
    console.log(`[SENTINEL-ACTION] Handling recurring pattern: ${pattern.category} (${pattern.count}x)`);

    if (!pattern.samples || pattern.samples.length === 0) {
      return;
    }

    // Utiliser le dernier sample pour l'analyse
    const sample = pattern.samples[pattern.samples.length - 1];
    const mockError = new Error(sample.message);
    mockError.stack = sample.stack;

    // Tenter reparation si auto-repair active
    if (this.config.autoRepairEnabled) {
      const result = await autoRepair.repair(mockError, sample.context || {});

      if (result.success) {
        console.log(`[SENTINEL-ACTION] Auto-repair successful: ${result.action}`);
      } else if (result.suggestedManualAction) {
        console.log(`[SENTINEL-ACTION] Manual action suggested: ${result.suggestedManualAction}`);
      }
    }
  }

  /**
   * Gere une erreur (point d'entree pour le middleware)
   */
  async handleError(error, context = {}) {
    try {
      // 1. Collecter l'erreur
      const errorEntry = errorCollector.collect(error, context);

      // 2. Analyser
      const analysis = await errorAnalyzer.analyzeError(error, context);

      // 3. Tenter auto-reparation si possible et active
      let repairResult = null;
      if (this.config.autoRepairEnabled && analysis.autoRepairPossible) {
        repairResult = await autoRepair.repair(error, context);

        if (repairResult.success) {
          console.log(`[SENTINEL-ACTION] Auto-repair successful: ${repairResult.action}`);
        }
      }

      return {
        collected: true,
        errorId: errorEntry.id,
        severity: errorEntry.severity,
        category: errorEntry.category,
        analyzed: true,
        rootCause: analysis.rootCause,
        repaired: repairResult?.success || false,
        repairResult,
        suggestedAction: analysis.suggestedAction
      };

    } catch (handlingError) {
      console.error('[SENTINEL-ACTION] Error handling failed:', handlingError.message);
      return {
        collected: false,
        analyzed: false,
        repaired: false,
        error: handlingError.message
      };
    }
  }

  /**
   * Status complet SENTINEL Action
   */
  getStatus() {
    return {
      active: this.isActive,
      startTime: this.startTime,
      uptime: this.startTime ? Math.round((Date.now() - new Date(this.startTime).getTime()) / 1000) : 0,
      config: this.config,
      health: healthCollector.getStatus(),
      errors: errorCollector.getStats(),
      repairs: autoRepair.getStats(),
      patterns: errorAnalyzer.getPatternSummary()
    };
  }

  /**
   * Configure SENTINEL Action
   */
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('[SENTINEL-ACTION] Configuration updated:', this.config);
    return { success: true, config: this.config };
  }

  /**
   * Active/desactive auto-repair
   */
  setAutoRepair(enabled) {
    this.config.autoRepairEnabled = enabled;
    console.log(`[SENTINEL-ACTION] Auto-repair ${enabled ? 'enabled' : 'disabled'}`);
    return { success: true, autoRepairEnabled: enabled };
  }

  /**
   * Force un health check immediat
   */
  async forceHealthCheck() {
    console.log('[SENTINEL-ACTION] Forcing health check...');
    return await this.performHealthCheck();
  }

  /**
   * Force un check des patterns d'erreurs
   */
  async forceErrorCheck() {
    console.log('[SENTINEL-ACTION] Forcing error pattern check...');
    return await this.monitorErrors();
  }

  /**
   * Reset tous les flags de reparation
   */
  resetRepairFlags() {
    return autoRepair.resetAll();
  }

  /**
   * Verifie si un tenant est isole
   */
  isTenantIsolated(tenantId) {
    return autoRepair.isTenantIsolated(tenantId);
  }

  /**
   * Verifie si le mode fallback est actif
   */
  isFallbackActive() {
    return autoRepair.isFallbackActive();
  }
}

// Singleton
const sentinelAction = new SentinelAction();
export { sentinelAction };
export default sentinelAction;
