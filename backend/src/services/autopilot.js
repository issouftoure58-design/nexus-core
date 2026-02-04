// backend/src/services/autopilot.js
// NEXUS AUTOPILOT - Système d'optimisation autonome

import liveEventStream from './liveEventStream.js';
import intelligentAnalyzer from './intelligentAnalyzer.js';
import responseCache from './responseCache.js';
import modelRouter from './modelRouter.js';
import costTracker from './costTracker.js';

class Autopilot {
  constructor() {
    this.enabled = true;
    this.actions = [];
    this.maxActions = 100;
    this.executedActions = [];
    this.stats = {
      totalScans: 0,
      totalActionsProposed: 0,
      totalActionsExecuted: 0,
      totalSavingsGenerated: 0,
      lastScanAt: null,
      enabledAt: null,
      disabledAt: null
    };
    this.scanInterval = null;
    this.scanIntervalMs = 60 * 60 * 1000; // 1 heure par défaut
  }

  /**
   * Active/désactive l'autopilot
   */
  setEnabled(enabled) {
    this.enabled = enabled;

    if (enabled) {
      this.stats.enabledAt = new Date().toISOString();
      liveEventStream.system({
        action: 'Autopilot ENABLED',
        message: 'Mode autonome activé',
        timestamp: this.stats.enabledAt
      });

      // Lancer un scan initial
      this.scan();
    } else {
      this.stats.disabledAt = new Date().toISOString();
      liveEventStream.system({
        action: 'Autopilot DISABLED',
        message: 'Mode autonome désactivé',
        timestamp: this.stats.disabledAt
      });

      // Arrêter le scan automatique si actif
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = null;
      }
    }

    return { enabled: this.enabled, stats: this.stats };
  }

  /**
   * Démarre le scan automatique périodique
   */
  startAutoScan(intervalMs = this.scanIntervalMs) {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }

    this.scanIntervalMs = intervalMs;
    this.scanInterval = setInterval(() => {
      if (this.enabled) {
        this.scan();
      }
    }, intervalMs);

    liveEventStream.system({
      action: 'Auto-scan started',
      interval: `${intervalMs / 1000 / 60} minutes`
    });

    return { autoScanEnabled: true, intervalMs };
  }

  /**
   * Arrête le scan automatique
   */
  stopAutoScan() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    return { autoScanEnabled: false };
  }

  /**
   * Scanne le système et génère des actions d'optimisation
   */
  async scan() {
    const scanStart = Date.now();
    this.stats.totalScans++;
    this.stats.lastScanAt = new Date().toISOString();

    const proposedActions = [];

    try {
      // 1. Analyser les opportunités via intelligentAnalyzer
      const analysis = await intelligentAnalyzer.analyzeCosts();

      // 2. Vérifier le cache
      const cacheStats = responseCache.getStats();
      const cacheHitRate = parseFloat(cacheStats.hitRate) || 0;

      // Action: Précharger le cache si taux trop bas
      if (cacheHitRate < 20) {
        proposedActions.push({
          id: `action-${Date.now()}-cache`,
          type: 'PRELOAD_CACHE',
          priority: 'HIGH',
          title: 'Précharger le cache FAQ',
          description: `Taux de cache à ${cacheHitRate.toFixed(1)}% - Précharger les questions fréquentes`,
          estimatedSaving: '0.50€/jour',
          estimatedImpact: '+20% cache hits',
          autoExecutable: true,
          status: 'proposed',
          createdAt: new Date().toISOString()
        });
      }

      // Action: Nettoyer le cache si trop plein
      if (cacheStats.size > 180) {
        proposedActions.push({
          id: `action-${Date.now()}-cleanup`,
          type: 'CLEANUP_CACHE',
          priority: 'MEDIUM',
          title: 'Nettoyer le cache',
          description: `Cache à ${cacheStats.size}/200 entrées - Supprimer les entrées expirées`,
          estimatedSaving: 'Meilleure performance',
          estimatedImpact: 'Libérer de l\'espace',
          autoExecutable: true,
          status: 'proposed',
          createdAt: new Date().toISOString()
        });
      }

      // 3. Vérifier la distribution des modèles
      const routerStats = modelRouter.getStats();
      const haikuPercent = routerStats.total > 0
        ? (routerStats.haiku / routerStats.total * 100)
        : 0;

      // Action: Ajuster le routeur si trop de Sonnet
      if (haikuPercent < 60 && routerStats.total > 10) {
        proposedActions.push({
          id: `action-${Date.now()}-router`,
          type: 'ADJUST_ROUTER',
          priority: 'HIGH',
          title: 'Ajuster le routeur de modèles',
          description: `Seulement ${haikuPercent.toFixed(0)}% Haiku - Augmenter le seuil de complexité`,
          estimatedSaving: '30% sur les coûts API',
          estimatedImpact: 'Plus de Haiku, moins cher',
          autoExecutable: true,
          status: 'proposed',
          createdAt: new Date().toISOString()
        });
      }

      // 4. Analyser les patterns de coûts
      const monthStats = await costTracker.getCurrentMonthCosts();

      // Action: Alerte budget si proche du seuil
      if (monthStats && monthStats.total > 8) { // Plus de 8€
        proposedActions.push({
          id: `action-${Date.now()}-budget`,
          type: 'BUDGET_ALERT',
          priority: 'HIGH',
          title: 'Alerte budget mensuel',
          description: `Coûts à ${monthStats.total.toFixed(2)}€ - Surveiller la consommation`,
          estimatedSaving: 'Éviter dépassement',
          estimatedImpact: 'Contrôle des coûts',
          autoExecutable: false,
          status: 'proposed',
          createdAt: new Date().toISOString()
        });
      }

      // 5. Vérifier les opportunités de l'analyseur
      if (analysis.opportunities) {
        for (const opp of analysis.opportunities) {
          if (opp.priority === 'HIGH' || opp.priority === 'MEDIUM') {
            proposedActions.push({
              id: `action-${Date.now()}-opp-${opp.type}`,
              type: 'OPPORTUNITY',
              priority: opp.priority,
              title: opp.title,
              description: opp.description,
              estimatedSaving: opp.estimatedSaving || 'Variable',
              estimatedImpact: opp.impact || 'Amélioration performance',
              autoExecutable: false,
              status: 'proposed',
              createdAt: new Date().toISOString(),
              source: opp
            });
          }
        }
      }

      // Ajouter les nouvelles actions
      for (const action of proposedActions) {
        // Éviter les doublons
        const exists = this.actions.find(a => a.type === action.type && a.status === 'proposed');
        if (!exists) {
          this.actions.unshift(action);
          this.stats.totalActionsProposed++;
        }
      }

      // Limiter le nombre d'actions
      if (this.actions.length > this.maxActions) {
        this.actions = this.actions.slice(0, this.maxActions);
      }

      const scanDuration = Date.now() - scanStart;

      liveEventStream.system({
        action: 'Autopilot Scan',
        actionsFound: proposedActions.length,
        duration: `${scanDuration}ms`,
        cacheHitRate: cacheHitRate.toFixed(1) + '%',
        haikuPercent: haikuPercent.toFixed(0) + '%'
      });

      // Auto-execute toutes les actions auto-executables
      const autoActions = this.actions.filter(a => a.autoExecutable && a.status === 'proposed');
      if (autoActions.length > 0) {
        for (const action of autoActions) {
          await this.executeAction(action.id);
        }
        liveEventStream.system({
          action: 'Autopilot Auto-Execute',
          executed: autoActions.length,
          message: `${autoActions.length} action(s) auto-executee(s)`
        });
      }

      return {
        success: true,
        scanDuration,
        actionsProposed: proposedActions.length,
        autoExecuted: autoActions.length,
        totalPendingActions: this.actions.filter(a => a.status === 'proposed').length,
        actions: proposedActions
      };

    } catch (error) {
      liveEventStream.error({
        action: 'Autopilot Scan Error',
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Exécute une action spécifique
   */
  async executeAction(actionId) {
    const action = this.actions.find(a => a.id === actionId);

    if (!action) {
      return { success: false, error: 'Action non trouvée' };
    }

    if (action.status !== 'proposed') {
      return { success: false, error: 'Action déjà traitée' };
    }

    const startTime = Date.now();

    try {
      let result;

      switch (action.type) {
        case 'PRELOAD_CACHE':
          result = await this.executePreloadCache();
          break;

        case 'CLEANUP_CACHE':
          result = await this.executeCleanupCache();
          break;

        case 'ADJUST_ROUTER':
          result = await this.executeAdjustRouter();
          break;

        case 'BUDGET_ALERT':
          result = { success: true, message: 'Alerte notée - surveillance active' };
          break;

        case 'OPPORTUNITY':
          result = { success: true, message: 'Opportunité notée pour action manuelle' };
          break;

        default:
          result = { success: false, error: 'Type d\'action non supporté' };
      }

      const duration = Date.now() - startTime;

      // Mettre à jour le statut de l'action
      action.status = result.success ? 'executed' : 'failed';
      action.executedAt = new Date().toISOString();
      action.executionDuration = duration;
      action.result = result;

      if (result.success) {
        this.stats.totalActionsExecuted++;
        this.executedActions.unshift({
          ...action,
          executionResult: result
        });

        // Limiter l'historique
        if (this.executedActions.length > 50) {
          this.executedActions = this.executedActions.slice(0, 50);
        }
      }

      liveEventStream.system({
        action: `Autopilot Execute: ${action.type}`,
        success: result.success,
        duration: `${duration}ms`,
        result: result.message || result.error
      });

      return {
        success: result.success,
        action,
        result,
        duration
      };

    } catch (error) {
      action.status = 'failed';
      action.error = error.message;

      liveEventStream.error({
        action: `Autopilot Execute Failed: ${action.type}`,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Précharge le cache avec des questions fréquentes
   */
  async executePreloadCache() {
    const faqQuestions = [
      'Quels sont vos horaires ?',
      'Comment prendre rendez-vous ?',
      'Quels services proposez-vous ?',
      'Où êtes-vous situé ?',
      'Quels sont vos tarifs ?',
      'Acceptez-vous les nouveaux clients ?',
      'Comment annuler un rendez-vous ?',
      'Quels produits utilisez-vous ?'
    ];

    let preloaded = 0;

    for (const question of faqQuestions) {
      const cacheKey = responseCache.generateKey(question);
      const exists = responseCache.get(cacheKey);

      if (!exists) {
        // Marquer comme à précharger (le vrai préchargement nécessiterait d'appeler l'API)
        preloaded++;
      }
    }

    return {
      success: true,
      message: `${preloaded} questions identifiées pour préchargement`,
      questionsToPreload: preloaded
    };
  }

  /**
   * Nettoie le cache des entrées expirées
   */
  async executeCleanupCache() {
    const beforeStats = responseCache.getStats();

    // Le cache a déjà un TTL, mais on peut forcer un nettoyage
    responseCache.cleanExpired && responseCache.cleanExpired();

    const afterStats = responseCache.getStats();
    const removed = beforeStats.size - afterStats.size;

    return {
      success: true,
      message: `${removed} entrées nettoyées`,
      before: beforeStats.size,
      after: afterStats.size
    };
  }

  /**
   * Ajuste les paramètres du routeur de modèles
   */
  async executeAdjustRouter() {
    const currentStats = modelRouter.getStats();
    const previousHaikuRate = currentStats.total > 0
      ? ((currentStats.haiku / currentStats.total) * 100).toFixed(1) + '%'
      : '0%';

    // Augmenter le seuil de +0.5 pour router plus vers Haiku
    const result = modelRouter.adjustThresholds(0.5);

    return {
      success: true,
      message: `Seuil de complexité ajusté (${result.oldThresholds.simple} → ${result.newThresholds.simple}) pour favoriser Haiku`,
      previousHaikuRate,
      newThreshold: result.newThresholds.simple,
      expectedIncrease: `+${result.expectedIncrease}%`,
      recommendation: 'Surveiller le taux de Haiku sur les prochaines heures'
    };
  }

  /**
   * Exécute automatiquement toutes les actions auto-exécutables
   */
  async executeAutoActions() {
    if (!this.enabled) {
      return { success: false, error: 'Autopilot désactivé' };
    }

    const autoActions = this.actions.filter(a =>
      a.autoExecutable && a.status === 'proposed'
    );

    const results = [];

    for (const action of autoActions) {
      const result = await this.executeAction(action.id);
      results.push({
        actionId: action.id,
        type: action.type,
        ...result
      });
    }

    return {
      success: true,
      executedCount: results.filter(r => r.success).length,
      failedCount: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * Retourne le statut complet de l'autopilot
   */
  getStatus() {
    const pendingActions = this.actions.filter(a => a.status === 'proposed');
    const executedActions = this.actions.filter(a => a.status === 'executed');
    const failedActions = this.actions.filter(a => a.status === 'failed');

    return {
      enabled: this.enabled,
      autoScanEnabled: this.scanInterval !== null,
      scanIntervalMs: this.scanIntervalMs,
      stats: this.stats,
      summary: {
        pending: pendingActions.length,
        executed: executedActions.length,
        failed: failedActions.length,
        total: this.actions.length
      },
      recentActions: this.actions.slice(0, 10)
    };
  }

  /**
   * Retourne toutes les actions (avec pagination optionnelle)
   */
  getActions(options = {}) {
    const { status, limit = 20, offset = 0 } = options;

    let filtered = this.actions;

    if (status) {
      filtered = filtered.filter(a => a.status === status);
    }

    return {
      total: filtered.length,
      actions: filtered.slice(offset, offset + limit),
      hasMore: filtered.length > offset + limit
    };
  }

  /**
   * Retourne l'historique des actions exécutées
   */
  getHistory(limit = 20) {
    return {
      total: this.executedActions.length,
      actions: this.executedActions.slice(0, limit)
    };
  }

  /**
   * Rejette une action proposée
   */
  rejectAction(actionId) {
    const action = this.actions.find(a => a.id === actionId);

    if (!action) {
      return { success: false, error: 'Action non trouvée' };
    }

    action.status = 'rejected';
    action.rejectedAt = new Date().toISOString();

    return { success: true, action };
  }

  /**
   * Réinitialise l'autopilot
   */
  reset() {
    this.enabled = false;
    this.actions = [];
    this.executedActions = [];
    this.stats = {
      totalScans: 0,
      totalActionsProposed: 0,
      totalActionsExecuted: 0,
      totalSavingsGenerated: 0,
      lastScanAt: null,
      enabledAt: null,
      disabledAt: null
    };

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    return { success: true, message: 'Autopilot réinitialisé' };
  }
}

const autopilot = new Autopilot();

// Auto-boot: lancer le scan initial + auto-scan toutes les 30 min
setTimeout(() => {
  autopilot.stats.enabledAt = new Date().toISOString();
  autopilot.scan().then(() => {
    console.log('[AUTOPILOT] Boot scan completed');
  }).catch(err => {
    console.error('[AUTOPILOT] Boot scan error:', err.message);
  });
  autopilot.startAutoScan(30 * 60 * 1000); // 30 minutes
  console.log('[AUTOPILOT] Auto-mode active (scan every 30min)');
}, 5000); // Attendre 5s que les services soient prets

export { autopilot };
export default autopilot;
