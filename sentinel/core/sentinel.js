/**
 * SENTINEL - Monitoring & Auto-Repair System
 *
 * Surveille NEXUS et tous les tenants
 * Détecte anomalies et répare automatiquement
 */

import { orchestrator } from '../../platform/core/orchestrator.js';
import { MetricsCollector } from '../collectors/metrics.js';
import { AnomalyDetector } from '../analyzers/anomaly.js';
import { AutoRepairer } from '../actions/repair.js';
import { AlertManager } from '../actions/alerts.js';

class Sentinel {
  constructor() {
    this.collector = new MetricsCollector();
    this.detector = new AnomalyDetector();
    this.repairer = new AutoRepairer();
    this.alerts = new AlertManager();

    this.running = false;
    this.interval = null;
    this.metrics = new Map();
  }

  /**
   * Démarrer surveillance
   */
  async start() {
    if (this.running) {
      console.log('[SENTINEL] Déjà démarré');
      return;
    }

    console.log('[SENTINEL] 🔍 Démarrage surveillance...');

    this.running = true;

    // Collecter métriques toutes les 30 secondes
    this.interval = setInterval(() => {
      this.collect();
    }, 30000);

    // Première collecte immédiate
    await this.collect();

    console.log('[SENTINEL] ✅ Surveillance active');
  }

  /**
   * Arrêter surveillance
   */
  stop() {
    if (!this.running) return;

    console.log('[SENTINEL] Arrêt surveillance...');

    clearInterval(this.interval);
    this.running = false;

    console.log('[SENTINEL] ✅ Arrêté');
  }

  /**
   * Collecter métriques
   */
  async collect() {
    try {
      const timestamp = new Date().toISOString();

      // Métriques globales
      const globalMetrics = await this.collector.collectGlobal();

      // Métriques par tenant
      const tenantMetrics = await this.collector.collectTenants();

      // Stocker
      this.metrics.set(timestamp, {
        global: globalMetrics,
        tenants: tenantMetrics,
      });

      // Nettoyer vieilles métriques (garder 1h)
      this.cleanOldMetrics();

      // Analyser anomalies
      await this.analyze(globalMetrics, tenantMetrics);
    } catch (error) {
      console.error('[SENTINEL] Erreur collecte:', error);
    }
  }

  /**
   * Analyser anomalies
   */
  async analyze(globalMetrics, tenantMetrics) {
    const anomalies = this.detector.detect({
      global: globalMetrics,
      tenants: tenantMetrics,
      history: Array.from(this.metrics.values()),
    });

    if (anomalies.length === 0) {
      return;
    }

    console.log(`[SENTINEL] ⚠️  ${anomalies.length} anomalie(s) détectée(s)`);

    for (const anomaly of anomalies) {
      await this.handleAnomaly(anomaly);
    }
  }

  /**
   * Gérer anomalie
   */
  async handleAnomaly(anomaly) {
    console.log(`[SENTINEL] Anomalie: ${anomaly.type} - ${anomaly.severity}`);

    const repaired = await this.repairer.repair(anomaly);

    if (repaired) {
      console.log(`[SENTINEL] ✅ Auto-réparé: ${anomaly.type}`);
      await this.logRepair(anomaly, 'success');
    } else {
      console.log(`[SENTINEL] ❌ Réparation impossible: ${anomaly.type}`);

      if (anomaly.severity === 'critical') {
        await this.alerts.send({
          type: 'critical_anomaly',
          anomaly,
          message: `Anomalie critique non réparée: ${anomaly.type}`,
        });
      }

      await this.logRepair(anomaly, 'failed');
    }
  }

  /**
   * Nettoyer vieilles métriques
   */
  cleanOldMetrics() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const [timestamp] of this.metrics) {
      if (new Date(timestamp).getTime() < oneHourAgo) {
        this.metrics.delete(timestamp);
      }
    }
  }

  /**
   * Logger réparation
   */
  async logRepair(anomaly, status) {
    console.log(`[SENTINEL] Log réparation: ${anomaly.type} - ${status}`);
  }

  /**
   * Obtenir métriques actuelles
   */
  getCurrentMetrics() {
    const latest = Array.from(this.metrics.entries()).pop();
    return latest ? latest[1] : null;
  }

  /**
   * Obtenir historique
   */
  getHistory(duration = 3600000) {
    const since = Date.now() - duration;

    return Array.from(this.metrics.entries())
      .filter(([timestamp]) => new Date(timestamp).getTime() > since)
      .map(([timestamp, data]) => ({
        timestamp,
        ...data,
      }));
  }

  /**
   * Santé globale
   */
  getHealth() {
    const metrics = this.getCurrentMetrics();

    if (!metrics) {
      return {
        status: 'unknown',
        message: 'Pas de métriques disponibles',
      };
    }

    const { global: g } = metrics;

    const totalRequests = g.orchestrator.totalRequests || 0;
    const totalErrors = g.orchestrator.totalErrors || 0;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
    const avgResponseTime = g.performance.avgResponseTime || 0;

    if (errorRate > 0.1) {
      return {
        status: 'critical',
        message: `Taux erreur élevé: ${(errorRate * 100).toFixed(2)}%`,
      };
    }

    if (errorRate > 0.05) {
      return {
        status: 'warning',
        message: `Taux erreur moyen: ${(errorRate * 100).toFixed(2)}%`,
      };
    }

    if (avgResponseTime > 2000) {
      return {
        status: 'warning',
        message: `Réponse lente: ${avgResponseTime}ms`,
      };
    }

    return {
      status: 'healthy',
      message: 'Tous les systèmes opérationnels',
    };
  }
}

// Singleton
export const sentinel = new Sentinel();
