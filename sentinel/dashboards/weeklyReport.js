/**
 * SENTINEL Weekly Report
 * Generation de rapports hebdomadaires
 */

import anomalyDetector from '../analyzers/anomalyDetector.js';
import patternDetector from '../analyzers/patternDetector.js';
import autoRepair from '../actions/autoRepair.js';
import baselineMetrics from '../models/baselineMetrics.js';
import auditTrail from '../reports/auditTrail.js';

class WeeklyReport {
  /**
   * Genere un rapport hebdomadaire
   */
  async generate(tenantId = null) {
    const hoursBack = 7 * 24; // 7 jours
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const report = {
      period: {
        start: since.toISOString(),
        end: new Date().toISOString(),
        days: 7
      },
      tenantId,

      // Metriques baseline
      baseline: this.getBaselineMetrics(),

      // Anomalies
      anomalies: this.getAnomaliesStats(),

      // Patterns suspects
      security: this.getSecurityStats(),

      // Auto-reparations
      repairs: autoRepair.getStats(),

      // Activite audit
      audit: auditTrail.generateReport(hoursBack),

      // Score sante
      healthScore: this.calculateHealthScore(),

      // Recommandations
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  /**
   * Recupere les metriques baseline
   */
  getBaselineMetrics() {
    const baseline = baselineMetrics.getBaseline();
    const history = baselineMetrics.getHistory(168); // 7 jours

    return {
      current: {
        errorsPerHour: (baseline.errorsPerHour || 0).toFixed(2),
        tokensPerHour: (baseline.tokensPerHour || 0).toFixed(0),
        avgResponseTime: (baseline.avgResponseTime || 0).toFixed(2) + 'ms',
        tenantsActive: baseline.tenantsActive || 0
      },
      trend: this.calculateTrend(history),
      lastUpdated: baseline.lastUpdated
    };
  }

  /**
   * Recupere les stats anomalies
   */
  getAnomaliesStats() {
    const stats = anomalyDetector.getStats();
    const anomalies = anomalyDetector.getAnomalies({ limit: 1000 });

    // Grouper par jour
    const byDay = {};
    anomalies.forEach(a => {
      const day = new Date(a.timestamp).toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { total: 0, bySeverity: {} };
      }
      byDay[day].total++;
      byDay[day].bySeverity[a.severity] = (byDay[day].bySeverity[a.severity] || 0) + 1;
    });

    return {
      total: stats.total,
      bySeverity: stats.bySeverity,
      byType: stats.byType,
      byDay
    };
  }

  /**
   * Recupere les stats securite
   */
  getSecurityStats() {
    const stats = patternDetector.getStats();
    const patterns = patternDetector.getPatterns({ limit: 1000 });

    // Grouper par type
    const byType = {};
    patterns.forEach(p => {
      if (!byType[p.type]) {
        byType[p.type] = { count: 0, severity: p.severity };
      }
      byType[p.type].count++;
    });

    return {
      total: stats.total,
      byType,
      bySeverity: stats.bySeverity,
      criticalIncidents: patterns.filter(p => p.severity === 'CRITICAL').length
    };
  }

  /**
   * Calcule la tendance
   */
  calculateTrend(history) {
    if (history.length < 2) return 'stable';

    const recent = history.slice(-24); // Dernier jour
    const previous = history.slice(-48, -24); // Jour precedent

    if (recent.length === 0 || previous.length === 0) return 'insufficient_data';

    const recentAvg = recent.reduce((acc, h) => acc + (h.baseline?.errorsPerHour || 0), 0) / recent.length;
    const previousAvg = previous.reduce((acc, h) => acc + (h.baseline?.errorsPerHour || 0), 0) / previous.length;

    if (previousAvg === 0) return 'stable';

    const change = ((recentAvg - previousAvg) / previousAvg) * 100;

    if (change > 20) return 'increasing';
    if (change < -20) return 'decreasing';
    return 'stable';
  }

  /**
   * Calcule le score de sante (0-100)
   */
  calculateHealthScore() {
    const anomalyStats = anomalyDetector.getStats();
    const patternStats = patternDetector.getStats();
    const repairStats = autoRepair.getStats();

    let score = 100;

    // Penalites anomalies
    score -= (anomalyStats.bySeverity.CRITICAL || 0) * 10;
    score -= (anomalyStats.bySeverity.HIGH || 0) * 5;
    score -= (anomalyStats.bySeverity.MEDIUM || 0) * 2;

    // Penalites patterns suspects
    score -= (patternStats.bySeverity?.CRITICAL || 0) * 15;
    score -= (patternStats.bySeverity?.HIGH || 0) * 8;

    // Bonus reparations reussies
    if (repairStats.total > 0) {
      const successRate = (repairStats.successful / repairStats.total) * 100;
      score += successRate * 0.1;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Genere des recommandations
   */
  generateRecommendations() {
    const recommendations = [];
    const anomalyStats = anomalyDetector.getStats();
    const patternStats = patternDetector.getStats();
    const healthScore = this.calculateHealthScore();

    if (healthScore < 50) {
      recommendations.push({
        priority: 'URGENT',
        category: 'health',
        message: 'Score de sante critique - Investigation approfondie requise'
      });
    }

    if ((anomalyStats.bySeverity.CRITICAL || 0) > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'anomalies',
        message: `${anomalyStats.bySeverity.CRITICAL} anomalies critiques cette semaine`
      });
    }

    if (patternStats.byType?.BRUTE_FORCE_AUTH) {
      recommendations.push({
        priority: 'HIGH',
        category: 'security',
        message: 'Activer 2FA pour tous les comptes admin'
      });
    }

    if (anomalyStats.byType?.HIGH_TOKEN_USAGE) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'cost',
        message: 'Optimiser l\'usage API pour reduire les couts'
      });
    }

    if (patternStats.byType?.SQL_INJECTION_ATTEMPT) {
      recommendations.push({
        priority: 'URGENT',
        category: 'security',
        message: 'Tentatives d\'injection SQL detectees - Audit securite requis'
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'INFO',
        category: 'status',
        message: 'Systeme stable - Aucune action requise'
      });
    }

    return recommendations;
  }

  /**
   * Formate le rapport en markdown
   */
  formatMarkdown(report) {
    return `
# SENTINEL - Rapport Hebdomadaire

**Periode**: ${new Date(report.period.start).toLocaleDateString()} - ${new Date(report.period.end).toLocaleDateString()}

---

## Score de Sante

**${report.healthScore}/100** ${this.getHealthEmoji(report.healthScore)}

---

## Metriques Baseline

- **Erreurs/heure**: ${report.baseline.current.errorsPerHour}
- **Tokens/heure**: ${report.baseline.current.tokensPerHour}
- **Temps reponse**: ${report.baseline.current.avgResponseTime}
- **Tendance**: ${report.baseline.trend}

---

## Anomalies

- **Total**: ${report.anomalies.total}
- **CRITICAL**: ${report.anomalies.bySeverity.CRITICAL || 0}
- **HIGH**: ${report.anomalies.bySeverity.HIGH || 0}
- **MEDIUM**: ${report.anomalies.bySeverity.MEDIUM || 0}

---

## Securite

- **Incidents**: ${report.security.total}
- **Incidents critiques**: ${report.security.criticalIncidents}

---

## Auto-Reparations

- **Total**: ${report.repairs.total}
- **Reussies**: ${report.repairs.successful}
- **Taux succes**: ${report.repairs.successRate}

---

## Recommandations

${report.recommendations.map(r => `- **[${r.priority}]** ${r.message}`).join('\n')}

---

*Genere par SENTINEL le ${new Date().toLocaleString()}*
    `.trim();
  }

  /**
   * Emoji selon score sante
   */
  getHealthEmoji(score) {
    if (score >= 90) return '(Excellent)';
    if (score >= 70) return '(Bon)';
    if (score >= 50) return '(Moyen)';
    return '(Critique)';
  }
}

// Singleton
const weeklyReport = new WeeklyReport();
export { weeklyReport };
export default weeklyReport;
