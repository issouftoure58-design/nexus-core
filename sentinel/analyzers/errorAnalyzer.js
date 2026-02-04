/**
 * SENTINEL Error Analyzer
 * Analyse les erreurs et determine la root cause + action suggeree
 */

import errorCollector from '../collectors/errorCollector.js';

class ErrorAnalyzer {
  constructor() {
    // Mapping root cause -> actions possibles
    this.repairActions = {
      'DATABASE_CONNECTION_LOST': 'RESTART_DATABASE_POOL',
      'DATABASE_TIMEOUT': 'RESTART_DATABASE_POOL',
      'DATABASE_CONSTRAINT_VIOLATION': 'LOG_ONLY',
      'API_RATE_LIMIT_EXCEEDED': 'FALLBACK_TO_HAIKU',
      'API_TIMEOUT': 'INCREASE_TIMEOUT',
      'API_UNAUTHORIZED': 'ALERT_ADMIN',
      'API_QUOTA_EXCEEDED': 'FALLBACK_TO_HAIKU',
      'MEMORY_EXHAUSTION': 'FORCE_GC',
      'VALIDATION_ERROR': 'LOG_ONLY',
      'TENANT_ERROR_SPIKE': 'ISOLATE_TENANT',
      'UNKNOWN': 'LOG_ONLY'
    };

    // Actions qui peuvent etre auto-reparees
    this.autoRepairableActions = [
      'RESTART_DATABASE_POOL',
      'FALLBACK_TO_HAIKU',
      'INCREASE_TIMEOUT',
      'FORCE_GC',
      'ISOLATE_TENANT'
    ];
  }

  /**
   * Analyse une erreur et determine la root cause
   */
  async analyzeError(error, context = {}) {
    const analysis = {
      rootCause: this.identifyRootCause(error),
      category: this.categorizeError(error),
      severity: this.determineSeverity(error),
      isRecurring: await this.checkRecurring(error),
      affectedScope: this.determineScope(error, context),
      suggestedAction: null,
      autoRepairPossible: false,
      confidence: 0
    };

    // Determiner l'action suggeree
    analysis.suggestedAction = this.suggestAction(analysis, error, context);
    analysis.autoRepairPossible = this.canAutoRepair(analysis);
    analysis.confidence = this.calculateConfidence(analysis);

    return analysis;
  }

  /**
   * Identifie la root cause
   */
  identifyRootCause(error) {
    const message = (error.message || '').toLowerCase();

    // Database errors
    if (message.includes('econnrefused') && message.includes('5432')) {
      return 'DATABASE_CONNECTION_LOST';
    }
    if (message.includes('connection') && message.includes('database')) {
      return 'DATABASE_CONNECTION_LOST';
    }
    if (message.includes('timeout') && (message.includes('database') || message.includes('postgres'))) {
      return 'DATABASE_TIMEOUT';
    }
    if (message.includes('constraint') || message.includes('unique') || message.includes('duplicate')) {
      return 'DATABASE_CONSTRAINT_VIOLATION';
    }

    // API rate limits
    if (message.includes('rate limit') || message.includes('rate_limit') || message.includes('429')) {
      return 'API_RATE_LIMIT_EXCEEDED';
    }
    if (message.includes('quota') || message.includes('exceeded')) {
      return 'API_QUOTA_EXCEEDED';
    }

    // API errors
    if (message.includes('timeout') && !message.includes('database')) {
      return 'API_TIMEOUT';
    }
    if (message.includes('unauthorized') || message.includes('401') || message.includes('invalid api key')) {
      return 'API_UNAUTHORIZED';
    }

    // Memory errors
    if (message.includes('out of memory') || message.includes('heap') || message.includes('allocation')) {
      return 'MEMORY_EXHAUSTION';
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return 'VALIDATION_ERROR';
    }

    return 'UNKNOWN';
  }

  /**
   * Categorise l'erreur (utilise errorCollector)
   */
  categorizeError(error) {
    // Reutilise la logique de errorCollector
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

    return 'unknown';
  }

  /**
   * Determine la severite
   */
  determineSeverity(error) {
    const rootCause = this.identifyRootCause(error);

    const criticalCauses = ['DATABASE_CONNECTION_LOST', 'MEMORY_EXHAUSTION'];
    const highCauses = ['API_RATE_LIMIT_EXCEEDED', 'API_QUOTA_EXCEEDED', 'API_UNAUTHORIZED', 'DATABASE_TIMEOUT'];
    const mediumCauses = ['API_TIMEOUT', 'DATABASE_CONSTRAINT_VIOLATION'];

    if (criticalCauses.includes(rootCause)) return 'CRITICAL';
    if (highCauses.includes(rootCause)) return 'HIGH';
    if (mediumCauses.includes(rootCause)) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Verifie si erreur recurrente
   */
  async checkRecurring(error) {
    const fingerprint = errorCollector.generateFingerprint(error);
    const patterns = errorCollector.detectPatterns(5); // 5 minutes

    const matching = patterns.find(p => p.fingerprint === fingerprint);

    if (matching && matching.count >= 3) {
      return {
        isRecurring: true,
        count: matching.count,
        timeWindow: '5 minutes',
        affectedTenants: matching.affectedTenants
      };
    }

    return { isRecurring: false };
  }

  /**
   * Determine le scope affecte
   */
  determineScope(error, context) {
    // Si tenant specifique
    if (context.tenantId) {
      return {
        level: 'tenant',
        tenantId: context.tenantId
      };
    }

    // Erreurs globales
    const rootCause = this.identifyRootCause(error);
    const globalCauses = ['DATABASE_CONNECTION_LOST', 'MEMORY_EXHAUSTION', 'API_RATE_LIMIT_EXCEEDED'];

    if (globalCauses.includes(rootCause)) {
      return {
        level: 'platform'
      };
    }

    return {
      level: 'isolated'
    };
  }

  /**
   * Suggere une action
   */
  suggestAction(analysis, error, context) {
    const { rootCause, isRecurring, affectedScope } = analysis;

    // Si erreur tres recurrente sur un tenant, isoler
    if (isRecurring.isRecurring && isRecurring.count > 10 && affectedScope.level === 'tenant') {
      return 'ISOLATE_TENANT';
    }

    // Si erreur critique recurrente, alerter admin
    if (isRecurring.isRecurring && isRecurring.count > 5 && analysis.severity === 'CRITICAL') {
      return 'ALERT_ADMIN';
    }

    // Action par defaut selon root cause
    return this.repairActions[rootCause] || 'LOG_ONLY';
  }

  /**
   * Determine si auto-reparation possible
   */
  canAutoRepair(analysis) {
    return this.autoRepairableActions.includes(analysis.suggestedAction);
  }

  /**
   * Calcule un score de confiance (0-100)
   */
  calculateConfidence(analysis) {
    let confidence = 50; // Base

    // Root cause connue
    if (analysis.rootCause !== 'UNKNOWN') {
      confidence += 20;
    }

    // Pattern recurrent confirme
    if (analysis.isRecurring.isRecurring) {
      confidence += 15;
    }

    // Severite haute = plus de confiance dans le diagnostic
    if (analysis.severity === 'CRITICAL' || analysis.severity === 'HIGH') {
      confidence += 10;
    }

    // Action auto-reparable = pattern connu
    if (analysis.autoRepairPossible) {
      confidence += 5;
    }

    return Math.min(confidence, 100);
  }

  /**
   * Analyse un batch d'erreurs
   */
  async analyzeBatch(errors, context = {}) {
    const results = [];

    for (const error of errors) {
      const analysis = await this.analyzeError(error, context);
      results.push({
        error: error.message,
        analysis
      });
    }

    return results;
  }

  /**
   * Resume des patterns actuels
   */
  getPatternSummary() {
    const patterns = errorCollector.detectPatterns(15); // 15 minutes

    return patterns.map(p => ({
      fingerprint: p.fingerprint,
      count: p.count,
      severity: p.severity,
      category: p.category,
      message: p.message.substring(0, 100),
      rootCause: this.identifyRootCause({ message: p.message }),
      suggestedAction: this.repairActions[this.identifyRootCause({ message: p.message })] || 'LOG_ONLY',
      affectedTenants: p.affectedTenants
    }));
  }
}

// Singleton
const errorAnalyzer = new ErrorAnalyzer();
export { errorAnalyzer };
export default errorAnalyzer;
