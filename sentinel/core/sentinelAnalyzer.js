/**
 * SENTINEL Analyzer - Orchestrateur Phase 2
 * Coordonne la detection d'anomalies, patterns suspects et audit trail
 */

import anomalyDetector from '../analyzers/anomalyDetector.js';
import patternDetector from '../analyzers/patternDetector.js';
import stackTraceAnalyzer from '../analyzers/stackTraceAnalyzer.js';
import baselineMetrics from '../models/baselineMetrics.js';
import auditTrail from '../reports/auditTrail.js';

class SentinelAnalyzer {
  constructor() {
    this.isActive = false;
    this.analysisInterval = null;
    this.baselineInterval = null;
    this.startTime = null;

    // Configuration
    this.config = {
      baselineUpdateIntervalHours: 6,
      analysisIntervalMinutes: 5,
      anomalyTimeWindowMinutes: 60,
      patternTimeWindowMinutes: 60
    };
  }

  /**
   * Demarre SENTINEL Analyzer
   */
  start() {
    if (this.isActive) {
      console.log('[ANALYZER] Already running');
      return { success: false, reason: 'Already running' };
    }

    console.log('[ANALYZER] Starting...');
    this.isActive = true;
    this.startTime = new Date().toISOString();

    // Calcul baseline toutes les X heures
    this.baselineInterval = setInterval(async () => {
      await this.updateBaseline();
    }, this.config.baselineUpdateIntervalHours * 60 * 60 * 1000);

    // Analyse anomalies + patterns toutes les X minutes
    this.analysisInterval = setInterval(async () => {
      await this.performAnalysis();
    }, this.config.analysisIntervalMinutes * 60 * 1000);

    // Premier baseline + analyse apres 10 secondes
    setTimeout(async () => {
      await this.updateBaseline();
      await this.performAnalysis();
    }, 10000);

    // Log audit
    auditTrail.logAction({
      type: 'ANALYZER_STARTED',
      details: { config: this.config }
    });

    console.log('[ANALYZER] Started successfully');
    return { success: true };
  }

  /**
   * Arrete SENTINEL Analyzer
   */
  stop() {
    if (this.baselineInterval) {
      clearInterval(this.baselineInterval);
      this.baselineInterval = null;
    }
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    this.isActive = false;

    // Log audit
    auditTrail.logAction({
      type: 'ANALYZER_STOPPED',
      details: { uptime: this.getUptime() }
    });

    console.log('[ANALYZER] Stopped');
    return { success: true };
  }

  /**
   * Met a jour la baseline
   */
  async updateBaseline() {
    try {
      console.log('[ANALYZER] Updating baseline...');
      const baseline = await baselineMetrics.calculateBaseline(24);

      auditTrail.logAction({
        type: 'BASELINE_UPDATED',
        details: {
          errorsPerHour: baseline.errorsPerHour,
          tokensPerHour: baseline.tokensPerHour,
          avgResponseTime: baseline.avgResponseTime
        }
      });

      return baseline;
    } catch (error) {
      console.error('[ANALYZER] Baseline update failed:', error.message);
      return null;
    }
  }

  /**
   * Analyse periodique
   */
  async performAnalysis() {
    try {
      console.log('[ANALYZER] Running periodic analysis...');

      const results = {
        timestamp: new Date().toISOString(),
        anomalies: [],
        patterns: []
      };

      // 1. Detection anomalies
      const anomalies = await anomalyDetector.detectAnomalies(this.config.anomalyTimeWindowMinutes);
      results.anomalies = anomalies;

      if (anomalies.length > 0) {
        console.log(`[ANALYZER] ${anomalies.length} anomalie(s) detectee(s)`);
        anomalies.forEach(a => {
          console.log(`  - [${a.severity}] ${a.type}: ${a.message}`);
        });

        // Log audit pour chaque anomalie critique
        anomalies.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH').forEach(a => {
          auditTrail.logAction({
            type: 'ANOMALY_DETECTED',
            details: { type: a.type, severity: a.severity, message: a.message }
          });
        });
      }

      // 2. Detection patterns suspects
      const patterns = await patternDetector.detectSuspiciousPatterns(this.config.patternTimeWindowMinutes);
      results.patterns = patterns;

      if (patterns.length > 0) {
        console.log(`[ANALYZER] ${patterns.length} pattern(s) suspect(s) detecte(s)`);
        patterns.forEach(p => {
          console.log(`  - [${p.severity}] ${p.type}: ${p.message}`);
        });

        // Log audit pour patterns critiques
        patterns.filter(p => p.severity === 'CRITICAL' || p.severity === 'HIGH').forEach(p => {
          auditTrail.logAction({
            type: 'PATTERN_DETECTED',
            details: { type: p.type, severity: p.severity, message: p.message }
          });
        });
      }

      return results;

    } catch (error) {
      console.error('[ANALYZER] Analysis failed:', error.message);
      return { timestamp: new Date().toISOString(), anomalies: [], patterns: [], error: error.message };
    }
  }

  /**
   * Analyse une erreur specifique
   */
  analyzeError(error, context = {}) {
    // Diagnostic stack trace
    const diagnosis = stackTraceAnalyzer.diagnose(error);

    // Enregistrer dans les metriques
    baselineMetrics.recordMetric('errors', 1, context);

    // Log audit si erreur critique
    if (diagnosis.priority === 'HIGH' || diagnosis.category === 'bug') {
      auditTrail.logAction({
        type: 'ERROR_ANALYZED',
        details: {
          errorType: diagnosis.summary,
          category: diagnosis.category,
          location: diagnosis.location,
          action: diagnosis.suggestedAction
        }
      }, context);
    }

    return diagnosis;
  }

  /**
   * Enregistre une requete pour analyse
   */
  recordRequest(request) {
    // Enregistrer dans pattern detector
    patternDetector.recordRequest(request);

    // Enregistrer metriques
    baselineMetrics.recordMetric('requests', 1, {
      tenantId: request.tenantId
    });

    if (request.responseTime) {
      baselineMetrics.recordMetric('responseTimes', request.responseTime, {
        tenantId: request.tenantId
      });
    }

    if (request.tokensUsed) {
      baselineMetrics.recordMetric('tokens', request.tokensUsed, {
        tenantId: request.tenantId
      });
    }
  }

  /**
   * Status SENTINEL Analyzer
   */
  getStatus() {
    return {
      active: this.isActive,
      startTime: this.startTime,
      uptime: this.getUptime(),
      config: this.config,
      baseline: baselineMetrics.getBaseline(),
      anomalies: anomalyDetector.getStats(),
      suspiciousPatterns: patternDetector.getStats(),
      auditTrail: auditTrail.getStats()
    };
  }

  /**
   * Calcule l'uptime
   */
  getUptime() {
    if (!this.startTime) return 0;
    return Math.round((Date.now() - new Date(this.startTime).getTime()) / 1000);
  }

  /**
   * Genere un rapport complet
   */
  async generateReport(hoursBack = 24) {
    const auditReport = auditTrail.generateReport(hoursBack);
    const anomalyStats = anomalyDetector.getStats();
    const patternStats = patternDetector.getStats();
    const baseline = baselineMetrics.getBaseline();

    return {
      generatedAt: new Date().toISOString(),
      period: auditReport.period,
      status: {
        analyzerActive: this.isActive,
        uptime: this.getUptime()
      },
      baseline: {
        errorsPerHour: baseline.errorsPerHour.toFixed(2),
        requestsPerHour: baseline.requestsPerHour.toFixed(2),
        tokensPerHour: baseline.tokensPerHour.toFixed(0),
        avgResponseTime: baseline.avgResponseTime.toFixed(2) + 'ms',
        tenantsActive: baseline.tenantsActive,
        lastUpdated: baseline.lastUpdated
      },
      anomalies: {
        ...anomalyStats,
        recent: anomalyDetector.getAnomalies({ limit: 10 })
      },
      suspiciousPatterns: {
        ...patternStats,
        recent: patternDetector.getPatterns({ limit: 10 })
      },
      audit: auditReport.summary,
      recommendations: this.generateRecommendations(anomalyStats, patternStats)
    };
  }

  /**
   * Genere des recommandations
   */
  generateRecommendations(anomalyStats, patternStats) {
    const recommendations = [];

    if (anomalyStats.bySeverity.CRITICAL > 0) {
      recommendations.push({
        priority: 'URGENT',
        type: 'ANOMALY',
        message: `${anomalyStats.bySeverity.CRITICAL} anomalie(s) critique(s) detectee(s) - investigation immediate requise`,
        action: 'CHECK_ANOMALIES'
      });
    }

    if (patternStats.bySeverity.CRITICAL > 0) {
      recommendations.push({
        priority: 'URGENT',
        type: 'SECURITY',
        message: `${patternStats.bySeverity.CRITICAL} pattern(s) d'attaque detecte(s) - verifier les logs de securite`,
        action: 'CHECK_SECURITY_PATTERNS'
      });
    }

    if (anomalyStats.byType?.HIGH_ERROR_RATE > 0) {
      recommendations.push({
        priority: 'HIGH',
        type: 'STABILITY',
        message: 'Taux d\'erreurs eleve - verifier la sante des services',
        action: 'CHECK_HEALTH'
      });
    }

    if (anomalyStats.byType?.HIGH_TOKEN_USAGE > 0) {
      recommendations.push({
        priority: 'HIGH',
        type: 'COST',
        message: 'Usage tokens eleve - verifier les couts API',
        action: 'CHECK_TOKEN_USAGE'
      });
    }

    if (patternStats.byType?.BRUTE_FORCE_AUTH > 0) {
      recommendations.push({
        priority: 'HIGH',
        type: 'SECURITY',
        message: 'Tentatives de brute force detectees - considerer 2FA ou rate limiting',
        action: 'ENABLE_2FA'
      });
    }

    if (patternStats.byType?.SQL_INJECTION_ATTEMPT > 0) {
      recommendations.push({
        priority: 'URGENT',
        type: 'SECURITY',
        message: 'Tentatives d\'injection SQL detectees - verifier les protections',
        action: 'AUDIT_SQL_PROTECTION'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'INFO',
        type: 'STATUS',
        message: 'Aucune anomalie critique detectee - systeme stable',
        action: 'NONE'
      });
    }

    return recommendations;
  }

  /**
   * Force une analyse immediate
   */
  async forceAnalysis() {
    return await this.performAnalysis();
  }

  /**
   * Force un recalcul de baseline
   */
  async forceBaselineUpdate() {
    return await this.updateBaseline();
  }
}

// Singleton
const sentinelAnalyzer = new SentinelAnalyzer();
export { sentinelAnalyzer };
export default sentinelAnalyzer;
