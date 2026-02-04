/**
 * SENTINEL Alert Manager
 * Orchestrateur des alertes sur tous les canaux
 */

import emailAlerts from './emailAlerts.js';
import smsAlerts from './smsAlerts.js';
import slackAlerts from './slackAlerts.js';
import auditTrail from '../reports/auditTrail.js';

class AlertManager {
  constructor() {
    this.alertQueue = [];
    this.processing = false;
  }

  /**
   * Envoie une alerte sur tous les canaux appropries
   */
  async sendAlert(alert) {
    try {
      const results = {
        email: null,
        sms: null,
        slack: null,
        timestamp: new Date().toISOString()
      };

      // Email
      const emailResult = await emailAlerts.send(alert);
      results.email = emailResult;

      // SMS (uniquement CRITICAL)
      if (alert.severity === 'CRITICAL') {
        const smsResult = await smsAlerts.send(alert);
        results.sms = smsResult;
      } else {
        results.sms = { success: false, reason: 'NOT_CRITICAL' };
      }

      // Slack
      const slackResult = await slackAlerts.send(alert);
      results.slack = slackResult;

      // Log audit
      auditTrail.logAction({
        type: 'ALERT_SENT',
        details: {
          alertType: alert.type,
          severity: alert.severity,
          channels: {
            email: results.email?.success || false,
            sms: results.sms?.success || false,
            slack: results.slack?.success || false
          }
        }
      });

      return results;

    } catch (error) {
      console.error('[ALERT-MANAGER] Failed to send alerts:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Ajoute une alerte a la queue
   */
  queueAlert(alert) {
    this.alertQueue.push(alert);

    // Traiter la queue si pas deja en cours
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Traite la queue d'alertes
   */
  async processQueue() {
    if (this.alertQueue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;

    while (this.alertQueue.length > 0) {
      const alert = this.alertQueue.shift();
      await this.sendAlert(alert);

      // Attendre 1 seconde entre chaque alerte
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.processing = false;
  }

  /**
   * Teste les notifications
   */
  async testNotifications() {
    const testAlert = {
      type: 'TEST_ALERT',
      severity: 'LOW',
      timestamp: new Date().toISOString(),
      message: 'Test de notifications SENTINEL',
      details: {
        source: 'manual_test',
        timestamp: new Date().toISOString()
      }
    };

    console.log('[ALERT-MANAGER] Testing notifications...');
    return await this.sendAlert(testAlert);
  }

  /**
   * Envoie une alerte critique (tous les canaux)
   */
  async sendCriticalAlert(type, message, details = {}) {
    const alert = {
      type,
      severity: 'CRITICAL',
      timestamp: new Date().toISOString(),
      message,
      details
    };

    return await this.sendAlert(alert);
  }

  /**
   * Envoie une alerte haute priorite (email + slack)
   */
  async sendHighAlert(type, message, details = {}) {
    const alert = {
      type,
      severity: 'HIGH',
      timestamp: new Date().toISOString(),
      message,
      details
    };

    return await this.sendAlert(alert);
  }

  /**
   * Stats globales
   */
  getStats() {
    return {
      email: emailAlerts.getStats(),
      sms: smsAlerts.getStats(),
      slack: slackAlerts.getStats(),
      queueSize: this.alertQueue.length,
      processing: this.processing
    };
  }

  /**
   * Clear all histories (pour tests)
   */
  clear() {
    emailAlerts.clear();
    smsAlerts.clear();
    slackAlerts.clear();
    this.alertQueue = [];
  }
}

// Singleton
const alertManager = new AlertManager();
export { alertManager };
export default alertManager;
