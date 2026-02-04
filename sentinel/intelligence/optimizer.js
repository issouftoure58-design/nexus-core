/**
 * SENTINEL Optimizer - Intelligence Phase 5
 * Optimisation des performances et ressources
 */

import auditTrail from '../reports/auditTrail.js';

class Optimizer {
  constructor() {
    this.metrics = [];
    this.recommendations = [];
    this.optimizations = [];
    this.maxMetricsSize = 1000;

    this.thresholds = {
      responseTime: 1000, // ms
      memoryUsage: 80, // %
      errorRate: 5, // %
      cpuUsage: 80 // %
    };

    this.stats = {
      metricsCollected: 0,
      recommendationsGenerated: 0,
      optimizationsApplied: 0
    };
  }

  /**
   * Enregistre une metrique de performance
   */
  recordMetric(type, value, metadata = {}) {
    const metric = {
      type,
      value,
      metadata,
      timestamp: new Date().toISOString()
    };

    this.metrics.push(metric);
    this.stats.metricsCollected++;

    // Limiter la taille
    if (this.metrics.length > this.maxMetricsSize) {
      this.metrics.shift();
    }

    // Analyser et generer des recommandations si necessaire
    this.analyzeMetric(metric);

    return metric;
  }

  /**
   * Analyse une metrique et genere des recommandations
   */
  analyzeMetric(metric) {
    switch (metric.type) {
      case 'response_time':
        if (metric.value > this.thresholds.responseTime) {
          this.addRecommendation({
            type: 'PERFORMANCE',
            priority: metric.value > this.thresholds.responseTime * 2 ? 'HIGH' : 'MEDIUM',
            message: `Temps de reponse eleve: ${metric.value}ms (seuil: ${this.thresholds.responseTime}ms)`,
            suggestion: 'Optimiser les requetes DB, ajouter du cache, ou augmenter les ressources',
            metric
          });
        }
        break;

      case 'memory_usage':
        if (metric.value > this.thresholds.memoryUsage) {
          this.addRecommendation({
            type: 'RESOURCE',
            priority: metric.value > 90 ? 'CRITICAL' : 'HIGH',
            message: `Usage memoire eleve: ${metric.value}%`,
            suggestion: 'Verifier les fuites memoire, redemarrer le service, ou augmenter la RAM',
            metric
          });
        }
        break;

      case 'error_rate':
        if (metric.value > this.thresholds.errorRate) {
          this.addRecommendation({
            type: 'RELIABILITY',
            priority: metric.value > 10 ? 'CRITICAL' : 'HIGH',
            message: `Taux d'erreur eleve: ${metric.value}%`,
            suggestion: 'Analyser les logs, corriger les bugs, ou augmenter les timeouts',
            metric
          });
        }
        break;

      case 'cpu_usage':
        if (metric.value > this.thresholds.cpuUsage) {
          this.addRecommendation({
            type: 'RESOURCE',
            priority: metric.value > 95 ? 'CRITICAL' : 'HIGH',
            message: `Usage CPU eleve: ${metric.value}%`,
            suggestion: 'Optimiser le code, ajouter du scaling, ou augmenter les ressources',
            metric
          });
        }
        break;
    }
  }

  /**
   * Ajoute une recommandation
   */
  addRecommendation(recommendation) {
    const rec = {
      id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...recommendation,
      status: 'NEW',
      createdAt: new Date().toISOString()
    };

    this.recommendations.push(rec);
    this.stats.recommendationsGenerated++;

    // Limiter a 100 recommandations
    if (this.recommendations.length > 100) {
      this.recommendations = this.recommendations.slice(-100);
    }

    auditTrail.logAction({
      type: 'OPTIMIZATION_RECOMMENDATION',
      details: { type: rec.type, priority: rec.priority, message: rec.message }
    });

    return rec;
  }

  /**
   * Analyse les performances globales
   */
  analyzePerformance(hoursBack = 1) {
    const since = Date.now() - (hoursBack * 60 * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => new Date(m.timestamp).getTime() > since);

    const analysis = {
      period: { hours: hoursBack, since: new Date(since).toISOString() },
      metrics: {
        total: recentMetrics.length,
        byType: {}
      },
      averages: {},
      issues: [],
      score: 100
    };

    // Grouper par type
    recentMetrics.forEach(m => {
      if (!analysis.metrics.byType[m.type]) {
        analysis.metrics.byType[m.type] = [];
      }
      analysis.metrics.byType[m.type].push(m.value);
    });

    // Calculer les moyennes
    for (const [type, values] of Object.entries(analysis.metrics.byType)) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);

      analysis.averages[type] = { avg: Math.round(avg * 100) / 100, max, min };

      // Detecter les problemes
      if (type === 'response_time' && avg > this.thresholds.responseTime) {
        analysis.issues.push({
          type: 'SLOW_RESPONSE',
          severity: 'HIGH',
          message: `Temps de reponse moyen: ${Math.round(avg)}ms`
        });
        analysis.score -= 20;
      }

      if (type === 'error_rate' && avg > this.thresholds.errorRate) {
        analysis.issues.push({
          type: 'HIGH_ERRORS',
          severity: 'CRITICAL',
          message: `Taux d'erreur moyen: ${avg.toFixed(2)}%`
        });
        analysis.score -= 30;
      }
    }

    analysis.score = Math.max(0, analysis.score);
    return analysis;
  }

  /**
   * Genere des optimisations automatiques
   */
  async suggestOptimizations() {
    const analysis = this.analyzePerformance(24);
    const optimizations = [];

    // Optimisations basees sur l'analyse
    if (analysis.issues.some(i => i.type === 'SLOW_RESPONSE')) {
      optimizations.push({
        type: 'CACHE',
        description: 'Ajouter du cache pour les requetes frequentes',
        impact: 'HIGH',
        effort: 'MEDIUM',
        commands: [
          'Implementer Redis pour le cache',
          'Ajouter des headers cache HTTP',
          'Utiliser memoization pour les calculs couteux'
        ]
      });
    }

    if (analysis.issues.some(i => i.type === 'HIGH_ERRORS')) {
      optimizations.push({
        type: 'RELIABILITY',
        description: 'Ameliorer la gestion des erreurs',
        impact: 'CRITICAL',
        effort: 'HIGH',
        commands: [
          'Ajouter des retry avec backoff exponentiel',
          'Implementer circuit breaker',
          'Ameliorer le monitoring'
        ]
      });
    }

    // Recommandations generales
    const memoryMetrics = analysis.averages.memory_usage;
    if (memoryMetrics && memoryMetrics.avg > 70) {
      optimizations.push({
        type: 'MEMORY',
        description: 'Optimiser l\'usage memoire',
        impact: 'MEDIUM',
        effort: 'MEDIUM',
        commands: [
          'Analyser les fuites memoire avec heapdump',
          'Optimiser les structures de donnees',
          'Implementer le garbage collection manuel si necessaire'
        ]
      });
    }

    return {
      timestamp: new Date().toISOString(),
      analysis,
      optimizations,
      autoApplicable: optimizations.filter(o => o.effort === 'LOW')
    };
  }

  /**
   * Applique une optimisation
   */
  applyOptimization(optimizationId, result) {
    const optimization = {
      id: optimizationId,
      result,
      appliedAt: new Date().toISOString()
    };

    this.optimizations.push(optimization);
    this.stats.optimizationsApplied++;

    auditTrail.logAction({
      type: 'OPTIMIZATION_APPLIED',
      details: optimization
    });

    return { success: true, optimization };
  }

  /**
   * Configure les seuils
   */
  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
    return { success: true, thresholds: this.thresholds };
  }

  /**
   * Retourne les metriques
   */
  getMetrics(options = {}) {
    let metrics = [...this.metrics];

    if (options.type) {
      metrics = metrics.filter(m => m.type === options.type);
    }

    if (options.since) {
      const since = new Date(options.since).getTime();
      metrics = metrics.filter(m => new Date(m.timestamp).getTime() > since);
    }

    if (options.limit) {
      metrics = metrics.slice(-options.limit);
    }

    return metrics;
  }

  /**
   * Retourne les recommandations
   */
  getRecommendations(options = {}) {
    let recs = [...this.recommendations];

    if (options.status) {
      recs = recs.filter(r => r.status === options.status);
    }

    if (options.priority) {
      recs = recs.filter(r => r.priority === options.priority);
    }

    return recs;
  }

  /**
   * Retourne les stats
   */
  getStats() {
    return {
      ...this.stats,
      currentMetricsCount: this.metrics.length,
      activeRecommendations: this.recommendations.filter(r => r.status === 'NEW').length,
      thresholds: this.thresholds
    };
  }

  /**
   * Retourne le status
   */
  getStatus() {
    return {
      metrics: this.metrics.length,
      recommendations: this.recommendations.length,
      optimizations: this.optimizations.length,
      thresholds: this.thresholds
    };
  }

  /**
   * Clear (pour tests)
   */
  clear() {
    this.metrics = [];
    this.recommendations = [];
    this.optimizations = [];
    this.stats = { metricsCollected: 0, recommendationsGenerated: 0, optimizationsApplied: 0 };
  }
}

// Singleton
const optimizer = new Optimizer();
export { optimizer };
export default optimizer;
