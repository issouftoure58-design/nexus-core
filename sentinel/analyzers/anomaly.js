/**
 * Détecteur d'anomalies
 */

export class AnomalyDetector {
  constructor() {
    this.isDev = process.env.NODE_ENV === 'development';
    // En dev, seuil mémoire plus permissif (Vite/HMR)
    this.memoryThreshold = this.isDev ? 95 : 90;
  }

  /**
   * Détecter anomalies
   */
  detect({ global, tenants, history }) {
    const anomalies = [];

    // Vérifier taux erreur global
    if (global.orchestrator.errorRate > 0.1) {
      anomalies.push({
        type: 'high_error_rate',
        severity: 'critical',
        value: global.orchestrator.errorRate,
        threshold: 0.1,
        message: `Taux erreur global: ${(global.orchestrator.errorRate * 100).toFixed(2)}%`,
      });
    }

    // Vérifier CPU
    if (global.system.cpuUsage > 90) {
      anomalies.push({
        type: 'high_cpu',
        severity: 'warning',
        value: global.system.cpuUsage,
        threshold: 90,
        message: `CPU élevé: ${global.system.cpuUsage}%`,
      });
    }

    // Vérifier mémoire (seuil plus permissif en dev)
    if (global.system.memoryUsage.percentage > this.memoryThreshold) {
      anomalies.push({
        type: 'high_memory',
        severity: 'warning',
        value: global.system.memoryUsage.percentage,
        threshold: this.memoryThreshold,
        message: `Mémoire élevée: ${global.system.memoryUsage.percentage}%`,
      });
    }

    // Vérifier temps réponse
    if (global.performance.avgResponseTime > 2000) {
      anomalies.push({
        type: 'slow_response',
        severity: 'warning',
        value: global.performance.avgResponseTime,
        threshold: 2000,
        message: `Réponse lente: ${global.performance.avgResponseTime}ms`,
      });
    }

    // Vérifier tenants individuels
    for (const tenant of tenants) {
      if (tenant.metrics.errorRate > 0.15) {
        anomalies.push({
          type: 'tenant_high_error_rate',
          severity: 'warning',
          tenantId: tenant.tenantId,
          tenantName: tenant.name,
          value: tenant.metrics.errorRate,
          threshold: 0.15,
          message: `Tenant ${tenant.name}: taux erreur ${(tenant.metrics.errorRate * 100).toFixed(2)}%`,
        });
      }
    }

    return anomalies;
  }
}
