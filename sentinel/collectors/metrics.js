/**
 * Collecteurs métriques
 */

import { orchestrator } from '../../platform/core/orchestrator.js';
import os from 'os';

export class MetricsCollector {
  /**
   * Métriques globales système
   */
  async collectGlobal() {
    const orchestratorMetrics = orchestrator.initialized
      ? orchestrator.getGlobalMetrics()
      : { totalTenants: 0, activeTenants: 0, totalRequests: 0, totalErrors: 0, tenants: [] };

    return {
      timestamp: new Date().toISOString(),

      system: {
        platform: os.platform(),
        cpuUsage: this.getCPUUsage(),
        memoryUsage: this.getMemoryUsage(),
        uptime: process.uptime(),
      },

      orchestrator: {
        totalTenants: orchestratorMetrics.totalTenants,
        activeTenants: orchestratorMetrics.activeTenants,
        totalRequests: orchestratorMetrics.totalRequests,
        totalErrors: orchestratorMetrics.totalErrors,
        errorRate:
          orchestratorMetrics.totalRequests > 0
            ? orchestratorMetrics.totalErrors / orchestratorMetrics.totalRequests
            : 0,
      },

      performance: {
        avgResponseTime: this.getAvgResponseTime(),
        requestsPerMinute: this.getRequestsPerMinute(),
      },
    };
  }

  /**
   * Métriques par tenant
   */
  async collectTenants() {
    if (!orchestrator.initialized) return [];

    const tenants = orchestrator.getGlobalMetrics().tenants;

    return tenants.map((tenant) => ({
      tenantId: tenant.id,
      name: tenant.name,
      status: tenant.status,
      metrics: {
        requests: tenant.requests,
        errors: tenant.errors,
        errorRate: tenant.requests > 0 ? tenant.errors / tenant.requests : 0,
      },
    }));
  }

  /**
   * CPU usage
   */
  getCPUUsage() {
    const cpus = os.cpus();

    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~((100 * idle) / total);

    return usage;
  }

  /**
   * Memory usage
   */
  getMemoryUsage() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      total: Math.round(total / 1024 / 1024),
      used: Math.round(used / 1024 / 1024),
      free: Math.round(free / 1024 / 1024),
      percentage: Math.round((used / total) * 100),
    };
  }

  /**
   * Temps réponse moyen
   */
  getAvgResponseTime() {
    if (!orchestrator.initialized) return 0;

    const tenants = Array.from(orchestrator.tenants.values());
    if (tenants.length === 0) return 0;

    const totalAvg = tenants.reduce((sum, t) => sum + (t.metrics.avgResponseTime || 0), 0);
    return Math.round(totalAvg / tenants.length);
  }

  /**
   * Requêtes par minute
   */
  getRequestsPerMinute() {
    return 0;
  }
}
