/**
 * SENTINEL Baseline Metrics
 * Calcule et maintient les metriques de reference pour la detection d'anomalies
 */

class BaselineMetrics {
  constructor() {
    this.baseline = {
      // Metriques par heure sur 24h
      errorsPerHour: 0,
      requestsPerHour: 0,
      avgResponseTime: 0,

      // Metriques par tenant
      tenantsActive: 0,

      // Metriques API
      tokensPerHour: 0,
      apiCallsPerHour: 0,

      // Seuils d'anomalie (multiplicateur)
      thresholds: {
        errorRate: 2.5,      // 2.5x la baseline = anomalie
        responseTime: 3.0,   // 3x la baseline = anomalie
        tokenUsage: 2.0      // 2x la baseline = anomalie
      },

      lastUpdated: null
    };

    this.history = [];
    this.maxHistorySize = 168; // 7 jours x 24h

    // Collecteurs de metriques en temps reel
    this.metricsCollector = {
      errors: [],
      requests: [],
      responseTimes: [],
      tokens: [],
      maxSamples: 10000
    };
  }

  /**
   * Enregistre une metrique
   */
  recordMetric(type, value, context = {}) {
    const entry = {
      timestamp: Date.now(),
      value,
      tenantId: context.tenantId || null
    };

    if (this.metricsCollector[type]) {
      this.metricsCollector[type].push(entry);
      if (this.metricsCollector[type].length > this.metricsCollector.maxSamples) {
        this.metricsCollector[type].shift();
      }
    }
  }

  /**
   * Calcule la baseline a partir des metriques collectees
   */
  async calculateBaseline(hoursBack = 24) {
    try {
      const since = Date.now() - hoursBack * 60 * 60 * 1000;

      // Filtrer les metriques dans la fenetre de temps
      const recentErrors = this.metricsCollector.errors.filter(m => m.timestamp >= since);
      const recentRequests = this.metricsCollector.requests.filter(m => m.timestamp >= since);
      const recentResponseTimes = this.metricsCollector.responseTimes.filter(m => m.timestamp >= since);
      const recentTokens = this.metricsCollector.tokens.filter(m => m.timestamp >= since);

      // Calculer moyennes par heure
      this.baseline.errorsPerHour = (recentErrors.length / hoursBack) || 0;
      this.baseline.requestsPerHour = (recentRequests.length / hoursBack) || 0;

      // Temps de reponse moyen
      if (recentResponseTimes.length > 0) {
        const sum = recentResponseTimes.reduce((a, b) => a + b.value, 0);
        this.baseline.avgResponseTime = sum / recentResponseTimes.length;
      }

      // Tokens par heure
      const totalTokens = recentTokens.reduce((a, b) => a + b.value, 0);
      this.baseline.tokensPerHour = (totalTokens / hoursBack) || 0;

      // Tenants actifs uniques
      const uniqueTenants = new Set([
        ...recentErrors.map(m => m.tenantId),
        ...recentRequests.map(m => m.tenantId)
      ].filter(Boolean));
      this.baseline.tenantsActive = uniqueTenants.size;

      this.baseline.lastUpdated = new Date().toISOString();

      // Ajouter a l'historique
      this.addToHistory({
        timestamp: this.baseline.lastUpdated,
        baseline: { ...this.baseline }
      });

      console.log('[BASELINE] Updated:', {
        errorsPerHour: this.baseline.errorsPerHour.toFixed(2),
        requestsPerHour: this.baseline.requestsPerHour.toFixed(2),
        avgResponseTime: this.baseline.avgResponseTime.toFixed(2) + 'ms',
        tokensPerHour: this.baseline.tokensPerHour.toFixed(0)
      });

      return this.baseline;

    } catch (error) {
      console.error('[BASELINE] Failed to calculate:', error.message);
      return this.baseline;
    }
  }

  /**
   * Calcule la moyenne
   */
  calculateMean(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calcule l'ecart-type
   */
  calculateStdDev(values, mean) {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Detecte si une metrique est anormale
   */
  isAnomaly(currentValue, baselineValue, metricType = 'default') {
    if (baselineValue === 0) {
      // Si baseline = 0, toute valeur > seuil absolu est anomalie
      const absoluteThresholds = {
        errorRate: 10,     // Plus de 10 erreurs/h sans baseline
        responseTime: 5000, // Plus de 5s
        tokenUsage: 100000  // Plus de 100k tokens/h
      };
      return currentValue > (absoluteThresholds[metricType] || 100);
    }

    const threshold = this.baseline.thresholds[metricType] || 2.5;
    const ratio = currentValue / baselineValue;

    return ratio > threshold;
  }

  /**
   * Retourne le ratio par rapport a la baseline
   */
  getRatio(currentValue, baselineValue) {
    if (baselineValue === 0) return currentValue > 0 ? Infinity : 0;
    return currentValue / baselineValue;
  }

  /**
   * Ajoute a l'historique
   */
  addToHistory(entry) {
    this.history.push(entry);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Recupere la baseline actuelle
   */
  getBaseline() {
    return this.baseline;
  }

  /**
   * Recupere l'historique
   */
  getHistory(limit = 24) {
    return this.history.slice(-limit);
  }

  /**
   * Recupere les metriques collectees
   */
  getCollectedMetrics(type, hoursBack = 1) {
    const since = Date.now() - hoursBack * 60 * 60 * 1000;
    const metrics = this.metricsCollector[type] || [];
    return metrics.filter(m => m.timestamp >= since);
  }

  /**
   * Reset les metriques (pour tests)
   */
  reset() {
    this.metricsCollector = {
      errors: [],
      requests: [],
      responseTimes: [],
      tokens: [],
      maxSamples: 10000
    };
    this.history = [];
  }
}

// Singleton
const baselineMetrics = new BaselineMetrics();
export { baselineMetrics };
export default baselineMetrics;
