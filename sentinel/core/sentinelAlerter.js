/**
 * SENTINEL Alerter - Orchestrateur Phase 3
 * Coordonne les notifications et rapports
 */

import alertManager from '../alerts/alertManager.js';
import weeklyReport from '../dashboards/weeklyReport.js';
import emailAlerts from '../alerts/emailAlerts.js';
import auditTrail from '../reports/auditTrail.js';

class SentinelAlerter {
  constructor() {
    this.isActive = false;
    this.weeklyReportInterval = null;
    this.startTime = null;
  }

  /**
   * Demarre SENTINEL Alerter
   */
  start() {
    if (this.isActive) {
      console.log('[ALERTER] Already running');
      return { success: false, reason: 'Already running' };
    }

    console.log('[ALERTER] Starting...');
    this.isActive = true;
    this.startTime = new Date().toISOString();

    // Rapport hebdomadaire tous les lundis a 9h
    this.scheduleWeeklyReport();

    // Log audit
    auditTrail.logAction({
      type: 'ALERTER_STARTED',
      details: { startTime: this.startTime }
    });

    console.log('[ALERTER] Started successfully');
    return { success: true };
  }

  /**
   * Arrete SENTINEL Alerter
   */
  stop() {
    if (this.weeklyReportInterval) {
      clearInterval(this.weeklyReportInterval);
      this.weeklyReportInterval = null;
    }
    this.isActive = false;

    // Log audit
    auditTrail.logAction({
      type: 'ALERTER_STOPPED',
      details: { uptime: this.getUptime() }
    });

    console.log('[ALERTER] Stopped');
    return { success: true };
  }

  /**
   * Schedule rapport hebdomadaire
   */
  scheduleWeeklyReport() {
    // Verifier toutes les heures
    this.weeklyReportInterval = setInterval(async () => {
      const now = new Date();

      // Lundi a 9h
      if (now.getDay() === 1 && now.getHours() === 9 && now.getMinutes() < 5) {
        await this.sendWeeklyReport();
      }
    }, 60 * 60 * 1000); // Toutes les heures
  }

  /**
   * Envoie le rapport hebdomadaire
   */
  async sendWeeklyReport() {
    try {
      console.log('[ALERTER] Generating weekly report...');

      const report = await weeklyReport.generate();
      const markdown = weeklyReport.formatMarkdown(report);

      // Envoyer par email
      await emailAlerts.send({
        type: 'WEEKLY_REPORT',
        severity: 'LOW',
        timestamp: new Date().toISOString(),
        message: 'Rapport hebdomadaire SENTINEL',
        details: report,
        customBody: markdown
      });

      // Log audit
      auditTrail.logAction({
        type: 'WEEKLY_REPORT_SENT',
        details: {
          healthScore: report.healthScore,
          anomalies: report.anomalies.total,
          recommendations: report.recommendations.length
        }
      });

      console.log('[ALERTER] Weekly report sent');
      return { success: true, report };
    } catch (error) {
      console.error('[ALERTER] Failed to send weekly report:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Gere une anomalie detectee
   */
  async handleAnomaly(anomaly) {
    console.log(`[ALERTER] Alerting anomaly: ${anomaly.type}`);

    const result = await alertManager.sendAlert({
      type: anomaly.type,
      severity: anomaly.severity,
      timestamp: anomaly.timestamp,
      message: anomaly.message,
      details: anomaly.details,
      suggestedAction: anomaly.suggestedAction || 'Review SENTINEL dashboard'
    });

    return result;
  }

  /**
   * Gere un pattern suspect detecte
   */
  async handleSuspiciousPattern(pattern) {
    console.log(`[ALERTER] Alerting suspicious pattern: ${pattern.type}`);

    const result = await alertManager.sendAlert({
      type: pattern.type,
      severity: pattern.severity,
      timestamp: pattern.timestamp,
      message: pattern.message,
      details: pattern.details,
      suggestedAction: 'Review security logs immediately'
    });

    return result;
  }

  /**
   * Teste les alertes
   */
  async testAlerts() {
    console.log('[ALERTER] Testing alerts...');
    return await alertManager.testNotifications();
  }

  /**
   * Force l'envoi du rapport hebdomadaire
   */
  async forceWeeklyReport() {
    return await this.sendWeeklyReport();
  }

  /**
   * Calcule l'uptime
   */
  getUptime() {
    if (!this.startTime) return 0;
    return Math.round((Date.now() - new Date(this.startTime).getTime()) / 1000);
  }

  /**
   * Status SENTINEL Alerter
   */
  getStatus() {
    return {
      active: this.isActive,
      startTime: this.startTime,
      uptime: this.getUptime(),
      channels: alertManager.getStats()
    };
  }
}

// Singleton
const sentinelAlerter = new SentinelAlerter();
export { sentinelAlerter };
export default sentinelAlerter;
