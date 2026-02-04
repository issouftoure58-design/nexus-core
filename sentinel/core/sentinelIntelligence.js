/**
 * SENTINEL Intelligence - Orchestrateur Phase 5
 * Coordonne auto-diagnostic, veille tech, optimiseur et apprentissage
 */

import selfDiagnostic from '../intelligence/selfDiagnostic.js';
import techWatch from '../intelligence/techWatch.js';
import optimizer from '../intelligence/optimizer.js';
import learningEngine from '../intelligence/learningEngine.js';
import auditTrail from '../reports/auditTrail.js';

class SentinelIntelligence {
  constructor() {
    this.isActive = false;
    this.startTime = null;
    this.diagnosticInterval = null;
    this.config = {
      enableLearning: true,
      enableTechWatch: true,
      diagnosticIntervalMs: 60 * 60 * 1000, // 1 heure
      techWatchIntervalMs: 24 * 60 * 60 * 1000 // 24 heures
    };
  }

  /**
   * Demarre SENTINEL Intelligence
   */
  start(config = {}) {
    if (this.isActive) {
      console.log('[INTELLIGENCE] Already running');
      return { success: false, reason: 'Already running' };
    }

    console.log('[INTELLIGENCE] Starting...');
    this.isActive = true;
    this.startTime = new Date().toISOString();
    this.config = { ...this.config, ...config };

    // Demarrer le moteur d'apprentissage
    if (this.config.enableLearning) {
      learningEngine.start();
    }

    // Demarrer la veille technologique
    if (this.config.enableTechWatch) {
      techWatch.start(this.config.techWatchIntervalMs);
    }

    // Diagnostic periodique
    this.scheduleDiagnostics();

    // Premier diagnostic immediat
    this.runDiagnostics();

    // Log audit
    auditTrail.logAction({
      type: 'INTELLIGENCE_STARTED',
      details: {
        startTime: this.startTime,
        config: this.config
      }
    });

    console.log('[INTELLIGENCE] Started successfully');
    console.log(`[INTELLIGENCE]   - Learning: ${this.config.enableLearning ? 'ON' : 'OFF'}`);
    console.log(`[INTELLIGENCE]   - Tech Watch: ${this.config.enableTechWatch ? 'ON' : 'OFF'}`);

    return { success: true };
  }

  /**
   * Arrete SENTINEL Intelligence
   */
  stop() {
    if (!this.isActive) {
      console.log('[INTELLIGENCE] Not running');
      return { success: false, reason: 'Not running' };
    }

    // Arreter les composants
    learningEngine.stop();
    techWatch.stop();

    // Arreter les diagnostics periodiques
    if (this.diagnosticInterval) {
      clearInterval(this.diagnosticInterval);
      this.diagnosticInterval = null;
    }

    // Log audit
    auditTrail.logAction({
      type: 'INTELLIGENCE_STOPPED',
      details: { uptime: this.getUptime() }
    });

    this.isActive = false;
    console.log('[INTELLIGENCE] Stopped');
    return { success: true };
  }

  /**
   * Planifie les diagnostics periodiques
   */
  scheduleDiagnostics() {
    this.diagnosticInterval = setInterval(async () => {
      await this.runDiagnostics();
    }, this.config.diagnosticIntervalMs);
  }

  /**
   * Execute un diagnostic complet
   */
  async runDiagnostics() {
    console.log('[INTELLIGENCE] Running diagnostics...');

    try {
      const results = await selfDiagnostic.runDiagnostics();

      // Apprendre des resultats
      if (results.summary.failed > 0) {
        results.checks
          .filter(c => c.status === 'FAIL')
          .forEach(c => {
            learningEngine.learnFromError(new Error(c.message), {
              source: 'diagnostic',
              checkName: c.name
            });
          });
      }

      // Enregistrer les metriques de performance
      const memoryCheck = results.checks.find(c => c.name === 'Memory Usage');
      if (memoryCheck?.data) {
        const usagePercent = (memoryCheck.data.heapUsed / memoryCheck.data.heapTotal) * 100;
        optimizer.recordMetric('memory_usage', usagePercent, { source: 'diagnostic' });
      }

      return results;
    } catch (error) {
      console.error('[INTELLIGENCE] Diagnostic failed:', error.message);
      learningEngine.learnFromError(error, { source: 'diagnostic' });
      return null;
    }
  }

  /**
   * Apprend d'une erreur (interface publique)
   */
  learnFromError(error, context = {}) {
    return learningEngine.learnFromError(error, context);
  }

  /**
   * Apprend d'un succes (interface publique)
   */
  learnFromSuccess(action, result, context = {}) {
    return learningEngine.learnFromSuccess(action, result, context);
  }

  /**
   * Enregistre une metrique de performance
   */
  recordMetric(type, value, metadata = {}) {
    return optimizer.recordMetric(type, value, metadata);
  }

  /**
   * Analyse les performances
   */
  analyzePerformance(hoursBack = 1) {
    return optimizer.analyzePerformance(hoursBack);
  }

  /**
   * Suggere des optimisations
   */
  async suggestOptimizations() {
    return await optimizer.suggestOptimizations();
  }

  /**
   * Enregistre les dependances pour la veille
   */
  registerDependencies(packageJson) {
    return techWatch.registerDependencies(packageJson);
  }

  /**
   * Force un check des dependances
   */
  async checkDependencies() {
    return await techWatch.checkDependencies();
  }

  /**
   * Genere un rapport de securite
   */
  generateSecurityReport() {
    return techWatch.generateReport();
  }

  /**
   * Analyse les tendances d'erreurs
   */
  analyzeTrends() {
    return learningEngine.analyzeTrends();
  }

  /**
   * Retourne les patterns appris
   */
  getLearnedPatterns(options = {}) {
    return learningEngine.getPatterns(options);
  }

  /**
   * Retourne les adaptations suggeres
   */
  getSuggestedAdaptations() {
    return learningEngine.getAdaptations('PENDING');
  }

  /**
   * Applique une adaptation
   */
  applyAdaptation(adaptationId) {
    return learningEngine.applyAdaptation(adaptationId);
  }

  /**
   * Enregistre un check de diagnostic personnalise
   */
  registerDiagnosticCheck(name, checkFn, options = {}) {
    selfDiagnostic.registerCheck(name, checkFn, options);
  }

  /**
   * Retourne le dernier diagnostic
   */
  getLastDiagnostic() {
    return selfDiagnostic.getLastDiagnostic();
  }

  /**
   * Retourne l'historique des diagnostics
   */
  getDiagnosticHistory(limit = 10) {
    return selfDiagnostic.getHistory(limit);
  }

  /**
   * Retourne les vulnerabilites detectees
   */
  getVulnerabilities(options = {}) {
    return techWatch.getVulnerabilities(options);
  }

  /**
   * Retourne les recommandations d'optimisation
   */
  getOptimizationRecommendations(options = {}) {
    return optimizer.getRecommendations(options);
  }

  /**
   * Calcule l'uptime
   */
  getUptime() {
    if (!this.startTime) return 0;
    return Math.round((Date.now() - new Date(this.startTime).getTime()) / 1000);
  }

  /**
   * Status complet
   */
  getStatus() {
    return {
      active: this.isActive,
      startTime: this.startTime,
      uptime: this.getUptime(),
      components: {
        selfDiagnostic: selfDiagnostic.getStatus(),
        techWatch: techWatch.getStatus(),
        optimizer: optimizer.getStatus(),
        learningEngine: learningEngine.getStatus()
      }
    };
  }

  /**
   * Stats detaillees
   */
  getStats() {
    return {
      selfDiagnostic: selfDiagnostic.getStats(),
      techWatch: techWatch.getStats(),
      optimizer: optimizer.getStats(),
      learningEngine: learningEngine.getStats()
    };
  }

  /**
   * Rapport global d'intelligence
   */
  async generateIntelligenceReport() {
    const diagnostic = selfDiagnostic.getLastDiagnostic();
    const securityReport = techWatch.generateReport();
    const performanceAnalysis = optimizer.analyzePerformance(24);
    const trends = learningEngine.analyzeTrends();
    const optimizations = await optimizer.suggestOptimizations();

    return {
      timestamp: new Date().toISOString(),
      health: {
        score: diagnostic?.healthScore || 0,
        lastCheck: diagnostic?.timestamp
      },
      security: {
        vulnerabilities: securityReport.vulnerabilities.total,
        critical: securityReport.vulnerabilities.bySeverity.CRITICAL?.length || 0
      },
      performance: {
        score: performanceAnalysis.score,
        issues: performanceAnalysis.issues.length
      },
      learning: {
        patterns: learningEngine.getStats().patternsActive,
        adaptations: learningEngine.getAdaptations('PENDING').length
      },
      recommendations: [
        ...securityReport.recommendations,
        ...optimizations.optimizations.map(o => ({
          priority: o.impact === 'CRITICAL' ? 'URGENT' : o.impact,
          category: 'performance',
          message: o.description
        }))
      ],
      trends
    };
  }
}

// Singleton
const sentinelIntelligence = new SentinelIntelligence();
export { sentinelIntelligence };
export default sentinelIntelligence;
