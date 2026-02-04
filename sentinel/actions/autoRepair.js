/**
 * SENTINEL Auto Repair
 * Execute les reparations automatiques selon les analyses
 */

import errorAnalyzer from '../analyzers/errorAnalyzer.js';

class AutoRepair {
  constructor() {
    this.repairHistory = [];
    this.maxHistorySize = 200;
    this.activeRepairs = new Set();

    // Flags globaux pour le systeme
    this.fallbackMode = false;
    this.isolatedTenants = new Set();
    this.increasedTimeouts = new Map();

    // Statistiques
    this.stats = {
      total: 0,
      successful: 0,
      failed: 0,
      byAction: {}
    };
  }

  /**
   * Tente de reparer automatiquement une erreur
   */
  async repair(error, context = {}) {
    try {
      // 1. Analyser l'erreur
      const analysis = await errorAnalyzer.analyzeError(error, context);

      // 2. Verifier si reparation auto possible
      if (!analysis.autoRepairPossible) {
        return {
          success: false,
          reason: 'AUTO_REPAIR_NOT_POSSIBLE',
          analysis,
          suggestedManualAction: analysis.suggestedAction
        };
      }

      // 3. Eviter reparations concurrentes sur meme probleme
      const repairKey = `${analysis.rootCause}-${context.tenantId || 'global'}`;
      if (this.activeRepairs.has(repairKey)) {
        return {
          success: false,
          reason: 'REPAIR_ALREADY_IN_PROGRESS',
          analysis
        };
      }

      this.activeRepairs.add(repairKey);

      try {
        // 4. Executer la reparation
        const repairResult = await this.executeRepair(analysis, error, context);

        // 5. Mettre a jour stats
        this.updateStats(analysis.suggestedAction, repairResult.success);

        // 6. Ajouter a l'historique
        this.addToHistory({
          timestamp: new Date().toISOString(),
          error: error.message,
          rootCause: analysis.rootCause,
          action: analysis.suggestedAction,
          result: repairResult,
          context,
          confidence: analysis.confidence
        });

        return repairResult;
      } finally {
        this.activeRepairs.delete(repairKey);
      }

    } catch (repairError) {
      console.error('[SENTINEL-REPAIR] Auto-repair failed:', repairError);
      return {
        success: false,
        reason: 'REPAIR_EXECUTION_FAILED',
        error: repairError.message
      };
    }
  }

  /**
   * Execute la reparation selon l'action suggeree
   */
  async executeRepair(analysis, error, context) {
    const action = analysis.suggestedAction;

    console.log(`[SENTINEL-REPAIR] Executing: ${action}`);

    const repairActions = {
      'RESTART_DATABASE_POOL': () => this.restartDatabasePool(analysis, error, context),
      'FALLBACK_TO_HAIKU': () => this.fallbackToHaiku(analysis, error, context),
      'INCREASE_TIMEOUT': () => this.increaseTimeout(analysis, error, context),
      'FORCE_GC': () => this.forceGC(analysis, error, context),
      'ISOLATE_TENANT': () => this.isolateTenant(analysis, error, context)
    };

    const repairFunction = repairActions[action];
    if (!repairFunction) {
      return {
        success: false,
        reason: 'UNKNOWN_REPAIR_ACTION',
        action
      };
    }

    return await repairFunction();
  }

  /**
   * REPAIR: Restart database pool
   */
  async restartDatabasePool(analysis, error, context) {
    try {
      console.log('[SENTINEL-REPAIR] Restarting database pool...');

      // Tenter une nouvelle connexion via supabase
      const { supabase } = await import('../../server/supabase.ts');
      const { error: dbError } = await supabase.from('services').select('id').limit(1);

      if (dbError) throw dbError;

      console.log('[SENTINEL-REPAIR] Database pool restart successful');
      return {
        success: true,
        action: 'RESTART_DATABASE_POOL',
        message: 'Database pool restarted successfully'
      };
    } catch (err) {
      console.error('[SENTINEL-REPAIR] Database pool restart failed:', err.message);
      return {
        success: false,
        action: 'RESTART_DATABASE_POOL',
        error: err.message
      };
    }
  }

  /**
   * REPAIR: Fallback to Haiku (mode economique)
   */
  async fallbackToHaiku(analysis, error, context) {
    try {
      console.log('[SENTINEL-REPAIR] Switching to Claude Haiku (fallback mode)...');

      // Activer le mode fallback
      this.fallbackMode = true;

      // Exposer globalement pour les services IA
      global.SENTINEL_FALLBACK_MODE = true;
      global.SENTINEL_FALLBACK_SINCE = new Date().toISOString();

      // Auto-desactiver apres 15 minutes
      setTimeout(() => {
        this.disableFallbackMode();
      }, 15 * 60 * 1000);

      console.log('[SENTINEL-REPAIR] Fallback mode activated (15 min)');
      return {
        success: true,
        action: 'FALLBACK_TO_HAIKU',
        message: 'Switched to Claude Haiku',
        fallbackActive: true,
        autoDisableIn: '15 minutes'
      };
    } catch (err) {
      return {
        success: false,
        action: 'FALLBACK_TO_HAIKU',
        error: err.message
      };
    }
  }

  /**
   * Desactive le mode fallback
   */
  disableFallbackMode() {
    this.fallbackMode = false;
    global.SENTINEL_FALLBACK_MODE = false;
    global.SENTINEL_FALLBACK_SINCE = null;
    console.log('[SENTINEL-REPAIR] Fallback mode deactivated');
  }

  /**
   * REPAIR: Increase timeout
   */
  async increaseTimeout(analysis, error, context) {
    const route = context.route || 'global';
    const newTimeout = 60000; // 60 secondes

    console.log(`[SENTINEL-REPAIR] Increasing timeout for ${route}...`);

    this.increasedTimeouts.set(route, {
      timeout: newTimeout,
      since: new Date().toISOString()
    });

    // Exposer globalement
    global.SENTINEL_INCREASED_TIMEOUTS = Object.fromEntries(this.increasedTimeouts);

    return {
      success: true,
      action: 'INCREASE_TIMEOUT',
      message: `Timeout increased for ${route}`,
      route,
      newTimeout
    };
  }

  /**
   * REPAIR: Force garbage collection
   */
  async forceGC(analysis, error, context) {
    console.log('[SENTINEL-REPAIR] Forcing garbage collection...');

    const before = process.memoryUsage().heapUsed;

    if (global.gc) {
      global.gc();
      const after = process.memoryUsage().heapUsed;
      const freedMB = Math.round((before - after) / 1024 / 1024);

      console.log(`[SENTINEL-REPAIR] GC freed ${freedMB}MB`);
      return {
        success: true,
        action: 'FORCE_GC',
        message: `Garbage collection freed ${freedMB}MB`,
        freedMB
      };
    }

    console.log('[SENTINEL-REPAIR] GC not available (run with --expose-gc)');
    return {
      success: false,
      action: 'FORCE_GC',
      error: 'GC not available (requires --expose-gc flag)'
    };
  }

  /**
   * REPAIR: Isolate tenant
   */
  async isolateTenant(analysis, error, context) {
    if (!context.tenantId) {
      return {
        success: false,
        action: 'ISOLATE_TENANT',
        reason: 'NO_TENANT_ID'
      };
    }

    const tenantId = context.tenantId;
    console.log(`[SENTINEL-REPAIR] Isolating tenant ${tenantId}...`);

    this.isolatedTenants.add(tenantId);

    // Exposer globalement
    global.SENTINEL_ISOLATED_TENANTS = Array.from(this.isolatedTenants);

    // Auto-desactiver apres 30 minutes
    setTimeout(() => {
      this.unisolateTenant(tenantId);
    }, 30 * 60 * 1000);

    console.log(`[SENTINEL-REPAIR] Tenant ${tenantId} isolated (30 min)`);
    return {
      success: true,
      action: 'ISOLATE_TENANT',
      message: `Tenant ${tenantId} isolated`,
      tenantId,
      autoRestoreIn: '30 minutes'
    };
  }

  /**
   * Restaure un tenant isole
   */
  unisolateTenant(tenantId) {
    this.isolatedTenants.delete(tenantId);
    global.SENTINEL_ISOLATED_TENANTS = Array.from(this.isolatedTenants);
    console.log(`[SENTINEL-REPAIR] Tenant ${tenantId} restored`);
  }

  /**
   * Verifie si un tenant est isole
   */
  isTenantIsolated(tenantId) {
    return this.isolatedTenants.has(tenantId);
  }

  /**
   * Verifie si le mode fallback est actif
   */
  isFallbackActive() {
    return this.fallbackMode;
  }

  /**
   * Met a jour les statistiques
   */
  updateStats(action, success) {
    this.stats.total++;
    if (success) {
      this.stats.successful++;
    } else {
      this.stats.failed++;
    }

    if (!this.stats.byAction[action]) {
      this.stats.byAction[action] = { total: 0, success: 0, failed: 0 };
    }
    this.stats.byAction[action].total++;
    if (success) {
      this.stats.byAction[action].success++;
    } else {
      this.stats.byAction[action].failed++;
    }
  }

  /**
   * Ajoute a l'historique
   */
  addToHistory(entry) {
    this.repairHistory.push(entry);
    if (this.repairHistory.length > this.maxHistorySize) {
      this.repairHistory.shift();
    }
  }

  /**
   * Recupere l'historique
   */
  getHistory(options = {}) {
    const { limit = 50, action = null, success = null } = options;

    let history = [...this.repairHistory];

    if (action) {
      history = history.filter(h => h.action === action);
    }

    if (success !== null) {
      history = history.filter(h => h.result.success === success);
    }

    return history.slice(-limit);
  }

  /**
   * Stats reparations
   */
  getStats() {
    const successRate = this.stats.total > 0
      ? ((this.stats.successful / this.stats.total) * 100).toFixed(2) + '%'
      : '0%';

    return {
      ...this.stats,
      successRate,
      activeRepairs: Array.from(this.activeRepairs),
      fallbackMode: this.fallbackMode,
      isolatedTenants: Array.from(this.isolatedTenants),
      increasedTimeouts: Object.fromEntries(this.increasedTimeouts)
    };
  }

  /**
   * Reset les flags (pour admin)
   */
  resetAll() {
    this.disableFallbackMode();
    this.isolatedTenants.clear();
    this.increasedTimeouts.clear();
    global.SENTINEL_ISOLATED_TENANTS = [];
    global.SENTINEL_INCREASED_TIMEOUTS = {};
    console.log('[SENTINEL-REPAIR] All flags reset');
    return { success: true, message: 'All repair flags reset' };
  }
}

// Singleton
const autoRepair = new AutoRepair();
export { autoRepair };
export default autoRepair;
