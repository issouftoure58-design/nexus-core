/**
 * SENTINEL Learning Engine - Intelligence Phase 5
 * Moteur d'apprentissage et adaptation automatique
 */

import auditTrail from '../reports/auditTrail.js';

class LearningEngine {
  constructor() {
    this.patterns = new Map(); // pattern -> { occurrences, lastSeen, actions }
    this.errorPatterns = [];
    this.successPatterns = [];
    this.adaptations = [];
    this.isLearning = false;

    this.config = {
      minOccurrences: 3, // Minimum pour considerer un pattern
      patternExpiry: 7 * 24 * 60 * 60 * 1000, // 7 jours
      maxPatterns: 500
    };

    this.stats = {
      patternsLearned: 0,
      errorsAnalyzed: 0,
      successesAnalyzed: 0,
      adaptationsApplied: 0
    };
  }

  /**
   * Demarre le moteur d'apprentissage
   */
  start() {
    if (this.isLearning) {
      return { success: false, reason: 'Already learning' };
    }

    this.isLearning = true;

    auditTrail.logAction({
      type: 'LEARNING_ENGINE_STARTED',
      details: { config: this.config }
    });

    console.log('[LEARNING] Engine started');
    return { success: true };
  }

  /**
   * Arrete le moteur
   */
  stop() {
    this.isLearning = false;

    auditTrail.logAction({
      type: 'LEARNING_ENGINE_STOPPED',
      details: { patternsLearned: this.patterns.size }
    });

    console.log('[LEARNING] Engine stopped');
    return { success: true };
  }

  /**
   * Apprend d'une erreur
   */
  learnFromError(error, context = {}) {
    if (!this.isLearning) return { learned: false, reason: 'Not learning' };

    this.stats.errorsAnalyzed++;

    // Extraire le pattern de l'erreur
    const pattern = this.extractErrorPattern(error);
    const patternKey = this.generatePatternKey(pattern);

    // Enregistrer ou mettre a jour le pattern
    const existing = this.patterns.get(patternKey);
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date().toISOString();
      existing.contexts.push(context);
      if (existing.contexts.length > 10) {
        existing.contexts = existing.contexts.slice(-10);
      }
    } else {
      this.patterns.set(patternKey, {
        type: 'ERROR',
        pattern,
        occurrences: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        contexts: [context],
        suggestedActions: this.suggestActionsForError(pattern)
      });
      this.stats.patternsLearned++;
    }

    // Sauvegarder dans l'historique des erreurs
    this.errorPatterns.push({
      pattern,
      context,
      timestamp: new Date().toISOString()
    });
    if (this.errorPatterns.length > 100) {
      this.errorPatterns.shift();
    }

    // Verifier si adaptation necessaire
    const patternData = this.patterns.get(patternKey);
    if (patternData.occurrences >= this.config.minOccurrences) {
      this.suggestAdaptation(patternData);
    }

    return { learned: true, pattern: patternKey, occurrences: patternData?.occurrences };
  }

  /**
   * Apprend d'un succes
   */
  learnFromSuccess(action, result, context = {}) {
    if (!this.isLearning) return { learned: false };

    this.stats.successesAnalyzed++;

    const pattern = {
      action,
      resultType: typeof result,
      contextKeys: Object.keys(context)
    };
    const patternKey = `success_${action}_${this.hashObject(pattern)}`;

    const existing = this.patterns.get(patternKey);
    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date().toISOString();
    } else {
      this.patterns.set(patternKey, {
        type: 'SUCCESS',
        pattern,
        occurrences: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      });
      this.stats.patternsLearned++;
    }

    this.successPatterns.push({
      pattern,
      context,
      timestamp: new Date().toISOString()
    });
    if (this.successPatterns.length > 100) {
      this.successPatterns.shift();
    }

    return { learned: true };
  }

  /**
   * Extrait un pattern d'une erreur
   */
  extractErrorPattern(error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    return {
      name: errorObj.name || 'Error',
      messagePattern: this.normalizeMessage(errorObj.message),
      stackTrace: this.normalizeStack(errorObj.stack),
      code: errorObj.code || null
    };
  }

  /**
   * Normalise un message d'erreur pour le pattern matching
   */
  normalizeMessage(message) {
    if (!message) return 'unknown';

    return message
      // Remplacer les IDs, timestamps, etc. par des placeholders
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '{UUID}')
      .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, '{TIMESTAMP}')
      .replace(/\b\d+\b/g, '{N}')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Normalise une stack trace
   */
  normalizeStack(stack) {
    if (!stack) return null;

    const lines = stack.split('\n').slice(0, 5);
    return lines.map(line => {
      return line
        .replace(/:\d+:\d+\)?$/, ':{LINE}:{COL}')
        .replace(/\(.*node_modules.*\)/, '(node_modules)')
        .trim();
    }).join('\n');
  }

  /**
   * Genere une cle unique pour un pattern
   */
  generatePatternKey(pattern) {
    return `${pattern.name}_${this.hashObject(pattern.messagePattern)}`;
  }

  /**
   * Hash simple d'un objet
   */
  hashObject(obj) {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Suggere des actions pour un pattern d'erreur
   */
  suggestActionsForError(pattern) {
    const suggestions = [];

    // Erreurs de connexion
    if (pattern.messagePattern.includes('connect') || pattern.messagePattern.includes('econnrefused')) {
      suggestions.push({
        type: 'RETRY',
        description: 'Implementer retry avec backoff',
        auto: true
      });
      suggestions.push({
        type: 'CIRCUIT_BREAKER',
        description: 'Activer circuit breaker',
        auto: true
      });
    }

    // Erreurs de timeout
    if (pattern.messagePattern.includes('timeout')) {
      suggestions.push({
        type: 'INCREASE_TIMEOUT',
        description: 'Augmenter le timeout',
        auto: false
      });
    }

    // Erreurs de memoire
    if (pattern.messagePattern.includes('heap') || pattern.messagePattern.includes('memory')) {
      suggestions.push({
        type: 'RESTART',
        description: 'Redemarrer le service',
        auto: false
      });
    }

    // Erreurs de validation
    if (pattern.messagePattern.includes('validation') || pattern.messagePattern.includes('invalid')) {
      suggestions.push({
        type: 'LOG_DETAILS',
        description: 'Logger les details pour debug',
        auto: true
      });
    }

    return suggestions;
  }

  /**
   * Suggere une adaptation basee sur un pattern
   */
  suggestAdaptation(patternData) {
    if (patternData.adaptationSuggested) return;

    const adaptation = {
      id: `adapt_${Date.now()}`,
      patternKey: this.generatePatternKey(patternData.pattern),
      reason: `Pattern vu ${patternData.occurrences} fois`,
      suggestedActions: patternData.suggestedActions,
      createdAt: new Date().toISOString(),
      status: 'PENDING'
    };

    this.adaptations.push(adaptation);
    patternData.adaptationSuggested = true;

    auditTrail.logAction({
      type: 'ADAPTATION_SUGGESTED',
      details: {
        patternType: patternData.pattern.name,
        occurrences: patternData.occurrences,
        actions: patternData.suggestedActions?.map(a => a.type)
      }
    });

    console.log(`[LEARNING] Adaptation suggested for pattern with ${patternData.occurrences} occurrences`);
    return adaptation;
  }

  /**
   * Applique une adaptation
   */
  applyAdaptation(adaptationId) {
    const adaptation = this.adaptations.find(a => a.id === adaptationId);
    if (!adaptation) {
      return { success: false, error: 'Adaptation not found' };
    }

    adaptation.status = 'APPLIED';
    adaptation.appliedAt = new Date().toISOString();
    this.stats.adaptationsApplied++;

    auditTrail.logAction({
      type: 'ADAPTATION_APPLIED',
      details: { adaptationId }
    });

    return { success: true, adaptation };
  }

  /**
   * Nettoie les patterns expires
   */
  cleanExpiredPatterns() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, pattern] of this.patterns) {
      const lastSeen = new Date(pattern.lastSeen).getTime();
      if (now - lastSeen > this.config.patternExpiry) {
        this.patterns.delete(key);
        cleaned++;
      }
    }

    // Limiter le nombre de patterns
    if (this.patterns.size > this.config.maxPatterns) {
      const sorted = Array.from(this.patterns.entries())
        .sort((a, b) => a[1].occurrences - b[1].occurrences);

      const toDelete = sorted.slice(0, this.patterns.size - this.config.maxPatterns);
      toDelete.forEach(([key]) => this.patterns.delete(key));
      cleaned += toDelete.length;
    }

    return { cleaned };
  }

  /**
   * Analyse les tendances
   */
  analyzeTrends() {
    const errorsByType = {};
    const timeDistribution = {};

    this.errorPatterns.forEach(ep => {
      const type = ep.pattern.name;
      errorsByType[type] = (errorsByType[type] || 0) + 1;

      const hour = new Date(ep.timestamp).getHours();
      timeDistribution[hour] = (timeDistribution[hour] || 0) + 1;
    });

    // Trouver l'heure avec le plus d'erreurs
    const peakHour = Object.entries(timeDistribution)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      errorsByType,
      timeDistribution,
      peakHour: peakHour ? { hour: parseInt(peakHour[0]), count: peakHour[1] } : null,
      topPatterns: Array.from(this.patterns.values())
        .filter(p => p.type === 'ERROR')
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 5)
        .map(p => ({
          name: p.pattern.name,
          message: p.pattern.messagePattern,
          occurrences: p.occurrences
        }))
    };
  }

  /**
   * Retourne les patterns
   */
  getPatterns(options = {}) {
    let patterns = Array.from(this.patterns.values());

    if (options.type) {
      patterns = patterns.filter(p => p.type === options.type);
    }

    if (options.minOccurrences) {
      patterns = patterns.filter(p => p.occurrences >= options.minOccurrences);
    }

    return patterns;
  }

  /**
   * Retourne les adaptations
   */
  getAdaptations(status = null) {
    if (status) {
      return this.adaptations.filter(a => a.status === status);
    }
    return this.adaptations;
  }

  /**
   * Retourne les stats
   */
  getStats() {
    return {
      ...this.stats,
      patternsActive: this.patterns.size,
      adaptationsPending: this.adaptations.filter(a => a.status === 'PENDING').length,
      isLearning: this.isLearning
    };
  }

  /**
   * Retourne le status
   */
  getStatus() {
    return {
      learning: this.isLearning,
      patterns: this.patterns.size,
      adaptations: this.adaptations.length,
      stats: this.stats
    };
  }

  /**
   * Clear (pour tests)
   */
  clear() {
    this.patterns.clear();
    this.errorPatterns = [];
    this.successPatterns = [];
    this.adaptations = [];
    this.stats = { patternsLearned: 0, errorsAnalyzed: 0, successesAnalyzed: 0, adaptationsApplied: 0 };
  }
}

// Singleton
const learningEngine = new LearningEngine();
export { learningEngine };
export default learningEngine;
