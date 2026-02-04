/**
 * SENTINEL Error Collector
 * Collecte et analyse les erreurs de la plateforme NEXUS
 */

class ErrorCollector {
  constructor() {
    this.errorBuffer = [];
    this.maxBufferSize = 1000;
    this.errorStats = {
      total: 0,
      bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      byCategory: {},
      last24h: 0
    };
  }

  /**
   * Collecte une erreur
   */
  collect(error, context = {}) {
    const errorEntry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack,
      context: {
        tenantId: context.tenantId || null,
        userId: context.userId || null,
        route: context.route || null,
        method: context.method || null,
        ip: context.ip || null,
        userAgent: context.userAgent || null,
        ...context
      },
      severity: this.determineSeverity(error),
      category: this.categorizeError(error),
      fingerprint: this.generateFingerprint(error)
    };

    // Buffer en memoire
    this.errorBuffer.push(errorEntry);
    if (this.errorBuffer.length > this.maxBufferSize) {
      this.errorBuffer.shift();
    }

    // Mise a jour stats
    this.updateStats(errorEntry);

    // Log console selon severite
    this.logError(errorEntry);

    return errorEntry;
  }

  /**
   * Genere un ID unique
   */
  generateId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Determine la severite d'une erreur
   */
  determineSeverity(error) {
    const message = (error.message || '').toLowerCase();
    const stack = (error.stack || '').toLowerCase();

    // CRITICAL - Affecte toute la plateforme
    if (message.includes('database') && (message.includes('connection') || message.includes('connect'))) {
      return 'CRITICAL';
    }
    if (message.includes('econnrefused') || message.includes('enotfound')) {
      return 'CRITICAL';
    }
    if (message.includes('out of memory') || message.includes('heap')) {
      return 'CRITICAL';
    }

    // HIGH - Affecte des fonctionnalites majeures
    if (message.includes('payment') || message.includes('stripe') || message.includes('transaction')) {
      return 'HIGH';
    }
    if (message.includes('auth') || message.includes('token') || message.includes('jwt')) {
      return 'HIGH';
    }
    if (message.includes('rate limit') || message.includes('429') || message.includes('quota')) {
      return 'HIGH';
    }
    if (message.includes('anthropic') || message.includes('claude')) {
      return 'HIGH';
    }

    // MEDIUM - Erreurs fonctionnelles
    if (message.includes('validation') || message.includes('invalid')) {
      return 'MEDIUM';
    }
    if (message.includes('not found') || message.includes('404')) {
      return 'MEDIUM';
    }
    if (message.includes('timeout')) {
      return 'MEDIUM';
    }

    // LOW - Erreurs mineures
    return 'LOW';
  }

  /**
   * Categorise l'erreur
   */
  categorizeError(error) {
    const message = (error.message || '').toLowerCase();

    if (message.includes('database') || message.includes('sql') || message.includes('postgres')) {
      return 'database';
    }
    if (message.includes('auth') || message.includes('token') || message.includes('permission')) {
      return 'authentication';
    }
    if (message.includes('api') || message.includes('fetch') || message.includes('request')) {
      return 'api';
    }
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return 'validation';
    }
    if (message.includes('timeout') || message.includes('slow')) {
      return 'performance';
    }
    if (message.includes('memory') || message.includes('cpu') || message.includes('resource')) {
      return 'resource';
    }
    if (message.includes('file') || message.includes('fs') || message.includes('path')) {
      return 'filesystem';
    }
    if (message.includes('network') || message.includes('connect') || message.includes('socket')) {
      return 'network';
    }

    return 'unknown';
  }

  /**
   * Genere une empreinte unique pour grouper erreurs similaires
   */
  generateFingerprint(error) {
    const message = error.message || '';
    const type = error.name || 'Error';
    // Prendre seulement la premiere ligne de la stack
    const stackLine = (error.stack || '').split('\n')[1] || '';

    const combined = `${type}:${message.substring(0, 100)}:${stackLine.trim()}`;
    return this.simpleHash(combined);
  }

  /**
   * Hash simple pour fingerprint
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Met a jour les statistiques
   */
  updateStats(errorEntry) {
    this.errorStats.total++;
    this.errorStats.bySeverity[errorEntry.severity]++;

    if (!this.errorStats.byCategory[errorEntry.category]) {
      this.errorStats.byCategory[errorEntry.category] = 0;
    }
    this.errorStats.byCategory[errorEntry.category]++;
  }

  /**
   * Log l'erreur selon severite
   */
  logError(errorEntry) {
    const prefix = `[SENTINEL-ERROR][${errorEntry.severity}]`;
    const msg = `${prefix} ${errorEntry.category}: ${errorEntry.message}`;

    if (errorEntry.severity === 'CRITICAL') {
      console.error('\x1b[31m%s\x1b[0m', msg); // Rouge
    } else if (errorEntry.severity === 'HIGH') {
      console.error('\x1b[33m%s\x1b[0m', msg); // Jaune
    } else if (errorEntry.severity === 'MEDIUM') {
      console.warn(msg);
    }
    // LOW: pas de log pour eviter le bruit
  }

  /**
   * Recupere les erreurs recentes
   */
  getRecentErrors(options = {}) {
    const {
      tenantId = null,
      severity = null,
      category = null,
      limit = 100,
      since = null
    } = options;

    let errors = [...this.errorBuffer];

    // Filtrer par tenant
    if (tenantId !== null) {
      errors = errors.filter(e => e.context.tenantId === tenantId);
    }

    // Filtrer par severite
    if (severity) {
      errors = errors.filter(e => e.severity === severity);
    }

    // Filtrer par categorie
    if (category) {
      errors = errors.filter(e => e.category === category);
    }

    // Filtrer par date
    if (since) {
      const sinceTime = new Date(since).getTime();
      errors = errors.filter(e => new Date(e.timestamp).getTime() >= sinceTime);
    }

    // Trier par date decroissante et limiter
    return errors
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Detecte les patterns d'erreurs repetees
   */
  detectPatterns(timeWindowMinutes = 5) {
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const errors = this.getRecentErrors({ since: since.toISOString() });

    // Grouper par fingerprint
    const grouped = {};
    errors.forEach(error => {
      const fp = error.fingerprint;
      if (!grouped[fp]) {
        grouped[fp] = {
          fingerprint: fp,
          count: 0,
          samples: [],
          firstSeen: error.timestamp,
          lastSeen: error.timestamp,
          severity: error.severity,
          category: error.category,
          message: error.message,
          affectedTenants: new Set()
        };
      }
      grouped[fp].count++;
      grouped[fp].lastSeen = error.timestamp;
      if (grouped[fp].samples.length < 3) {
        grouped[fp].samples.push(error);
      }
      if (error.context.tenantId) {
        grouped[fp].affectedTenants.add(error.context.tenantId);
      }
    });

    // Convertir en tableau et trier par count
    const patterns = Object.values(grouped).map(p => ({
      ...p,
      affectedTenants: Array.from(p.affectedTenants)
    }));
    patterns.sort((a, b) => b.count - a.count);

    return patterns;
  }

  /**
   * Retourne les statistiques
   */
  getStats() {
    // Calculer erreurs des dernieres 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24h = this.errorBuffer.filter(e =>
      new Date(e.timestamp) >= since24h
    ).length;

    return {
      ...this.errorStats,
      last24h,
      bufferSize: this.errorBuffer.length,
      maxBufferSize: this.maxBufferSize
    };
  }

  /**
   * Vide le buffer (pour tests)
   */
  clear() {
    this.errorBuffer = [];
    this.errorStats = {
      total: 0,
      bySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      byCategory: {},
      last24h: 0
    };
  }
}

// Singleton
const errorCollector = new ErrorCollector();
export { errorCollector };
export default errorCollector;
