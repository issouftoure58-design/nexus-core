/**
 * SENTINEL Anomaly Detector
 * Detecte les anomalies basees sur les metriques de reference
 */

import baselineMetrics from '../models/baselineMetrics.js';
import errorCollector from '../collectors/errorCollector.js';

class AnomalyDetector {
  constructor() {
    this.detectedAnomalies = [];
    this.maxAnomalies = 100;
  }

  /**
   * Detecte les anomalies actuelles
   */
  async detectAnomalies(timeWindowMinutes = 60) {
    try {
      const anomalies = [];
      const baseline = baselineMetrics.getBaseline();

      // Calculer baseline si pas encore fait
      if (!baseline.lastUpdated) {
        console.log('[ANOMALY] No baseline available, calculating...');
        await baselineMetrics.calculateBaseline(24);
      }

      // 1. Anomalie : Taux d'erreurs eleve
      const errorAnomaly = await this.detectErrorRateAnomaly(timeWindowMinutes, baseline);
      if (errorAnomaly) anomalies.push(errorAnomaly);

      // 2. Anomalie : Temps de reponse eleve
      const responseAnomaly = this.detectResponseTimeAnomaly(timeWindowMinutes, baseline);
      if (responseAnomaly) anomalies.push(responseAnomaly);

      // 3. Anomalie : Usage tokens explosif
      const tokenAnomaly = this.detectTokenUsageAnomaly(timeWindowMinutes, baseline);
      if (tokenAnomaly) anomalies.push(tokenAnomaly);

      // 4. Anomalie : Tenant specifique problematique
      const tenantAnomalies = await this.detectTenantAnomalies(timeWindowMinutes);
      anomalies.push(...tenantAnomalies);

      // 5. Anomalie : Patterns d'erreurs inhabituels
      const patternAnomalies = this.detectUnusualPatterns(timeWindowMinutes);
      anomalies.push(...patternAnomalies);

      // Sauvegarder
      anomalies.forEach(a => this.addAnomaly(a));

      if (anomalies.length > 0) {
        console.log(`[ANOMALY] ${anomalies.length} anomalie(s) detectee(s)`);
      }

      return anomalies;

    } catch (error) {
      console.error('[ANOMALY] Detection failed:', error.message);
      return [];
    }
  }

  /**
   * Detecte anomalie : taux d'erreurs
   */
  async detectErrorRateAnomaly(timeWindowMinutes, baseline) {
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const errors = errorCollector.getRecentErrors({ since: since.toISOString() });

    const errorsPerHour = (errors.length / timeWindowMinutes) * 60;

    if (baselineMetrics.isAnomaly(errorsPerHour, baseline.errorsPerHour, 'errorRate')) {
      const ratio = baselineMetrics.getRatio(errorsPerHour, baseline.errorsPerHour);
      return {
        type: 'HIGH_ERROR_RATE',
        severity: ratio > 5 ? 'CRITICAL' : 'HIGH',
        timestamp: new Date().toISOString(),
        details: {
          current: errorsPerHour.toFixed(2),
          baseline: baseline.errorsPerHour.toFixed(2),
          ratio: ratio.toFixed(2) + 'x',
          timeWindow: timeWindowMinutes + ' minutes',
          errorCount: errors.length
        },
        message: `Error rate ${ratio.toFixed(1)}x above baseline (${errors.length} errors in ${timeWindowMinutes}min)`
      };
    }

    return null;
  }

  /**
   * Detecte anomalie : temps de reponse
   */
  detectResponseTimeAnomaly(timeWindowMinutes, baseline) {
    const metrics = baselineMetrics.getCollectedMetrics('responseTimes', timeWindowMinutes / 60);

    if (metrics.length === 0) return null;

    const avgResponseTime = metrics.reduce((a, b) => a + b.value, 0) / metrics.length;

    if (baselineMetrics.isAnomaly(avgResponseTime, baseline.avgResponseTime, 'responseTime')) {
      const ratio = baselineMetrics.getRatio(avgResponseTime, baseline.avgResponseTime);
      return {
        type: 'HIGH_RESPONSE_TIME',
        severity: ratio > 5 ? 'HIGH' : 'MEDIUM',
        timestamp: new Date().toISOString(),
        details: {
          current: avgResponseTime.toFixed(2) + 'ms',
          baseline: baseline.avgResponseTime.toFixed(2) + 'ms',
          ratio: ratio.toFixed(2) + 'x',
          samples: metrics.length
        },
        message: `Response time ${ratio.toFixed(1)}x above baseline (${avgResponseTime.toFixed(0)}ms avg)`
      };
    }

    return null;
  }

  /**
   * Detecte anomalie : usage tokens
   */
  detectTokenUsageAnomaly(timeWindowMinutes, baseline) {
    const metrics = baselineMetrics.getCollectedMetrics('tokens', timeWindowMinutes / 60);

    if (metrics.length === 0) return null;

    const totalTokens = metrics.reduce((a, b) => a + b.value, 0);
    const tokensPerHour = (totalTokens / timeWindowMinutes) * 60;

    if (baselineMetrics.isAnomaly(tokensPerHour, baseline.tokensPerHour, 'tokenUsage')) {
      const ratio = baselineMetrics.getRatio(tokensPerHour, baseline.tokensPerHour);
      const estimatedCost = (tokensPerHour * 0.000003).toFixed(4);
      return {
        type: 'HIGH_TOKEN_USAGE',
        severity: ratio > 3 ? 'HIGH' : 'MEDIUM',
        timestamp: new Date().toISOString(),
        details: {
          current: tokensPerHour.toFixed(0),
          baseline: baseline.tokensPerHour.toFixed(0),
          ratio: ratio.toFixed(2) + 'x',
          estimatedCostPerHour: estimatedCost + ' USD'
        },
        message: `Token usage ${ratio.toFixed(1)}x above baseline (~$${estimatedCost}/hour)`
      };
    }

    return null;
  }

  /**
   * Detecte anomalie : tenant specifique
   */
  async detectTenantAnomalies(timeWindowMinutes) {
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const errors = errorCollector.getRecentErrors({ since: since.toISOString() });

    // Grouper par tenant
    const byTenant = {};
    errors.forEach(e => {
      const tenantId = e.context.tenantId || 'null';
      if (!byTenant[tenantId]) {
        byTenant[tenantId] = { count: 0, errors: [] };
      }
      byTenant[tenantId].count++;
      byTenant[tenantId].errors.push(e);
    });

    const anomalies = [];
    const totalErrors = errors.length;

    // Un tenant avec >50% des erreurs = anomalie
    Object.entries(byTenant).forEach(([tenantId, data]) => {
      const percentage = totalErrors > 0 ? (data.count / totalErrors) * 100 : 0;

      if (percentage > 50 && totalErrors > 5) {
        anomalies.push({
          type: 'PROBLEMATIC_TENANT',
          severity: 'HIGH',
          timestamp: new Date().toISOString(),
          details: {
            tenantId: tenantId === 'null' ? null : tenantId,
            errorCount: data.count,
            percentage: percentage.toFixed(1) + '%',
            totalErrors,
            topErrors: data.errors.slice(0, 3).map(e => e.message)
          },
          message: `Tenant ${tenantId} responsible for ${percentage.toFixed(0)}% of errors (${data.count}/${totalErrors})`
        });
      }
    });

    return anomalies;
  }

  /**
   * Detecte patterns inhabituels
   */
  detectUnusualPatterns(timeWindowMinutes) {
    const patterns = errorCollector.detectPatterns(timeWindowMinutes);
    const anomalies = [];

    // Pattern qui se repete >20 fois = inhabituel
    patterns.forEach(p => {
      if (p.count > 20) {
        anomalies.push({
          type: 'UNUSUAL_ERROR_PATTERN',
          severity: p.severity === 'CRITICAL' ? 'CRITICAL' : 'MEDIUM',
          timestamp: new Date().toISOString(),
          details: {
            fingerprint: p.fingerprint,
            count: p.count,
            message: p.message || 'Unknown',
            category: p.category,
            affectedTenants: p.affectedTenants.length,
            firstSeen: p.firstSeen,
            lastSeen: p.lastSeen
          },
          message: `Error pattern repeated ${p.count} times in ${timeWindowMinutes} minutes: "${p.message?.substring(0, 50)}..."`
        });
      }
    });

    return anomalies;
  }

  /**
   * Ajoute une anomalie detectee
   */
  addAnomaly(anomaly) {
    this.detectedAnomalies.push(anomaly);
    if (this.detectedAnomalies.length > this.maxAnomalies) {
      this.detectedAnomalies.shift();
    }
  }

  /**
   * Recupere les anomalies recentes
   */
  getAnomalies(options = {}) {
    const { severity = null, type = null, limit = 50 } = options;

    let filtered = [...this.detectedAnomalies];

    if (severity) {
      filtered = filtered.filter(a => a.severity === severity);
    }

    if (type) {
      filtered = filtered.filter(a => a.type === type);
    }

    return filtered.slice(-limit);
  }

  /**
   * Stats anomalies
   */
  getStats() {
    const total = this.detectedAnomalies.length;

    const bySeverity = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0
    };

    const byType = {};

    this.detectedAnomalies.forEach(a => {
      bySeverity[a.severity]++;
      byType[a.type] = (byType[a.type] || 0) + 1;
    });

    return {
      total,
      bySeverity,
      byType,
      lastDetected: this.detectedAnomalies.length > 0
        ? this.detectedAnomalies[this.detectedAnomalies.length - 1].timestamp
        : null
    };
  }

  /**
   * Clear anomalies (pour tests)
   */
  clear() {
    this.detectedAnomalies = [];
  }
}

// Singleton
const anomalyDetector = new AnomalyDetector();
export { anomalyDetector };
export default anomalyDetector;
