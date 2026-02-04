/**
 * SENTINEL SMS Alerts
 * Notifications SMS via Twilio (uniquement CRITICAL/HIGH)
 */

import alertRules from '../config/alertRules.js';

class SmsAlerts {
  constructor() {
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.enabled = !!(this.twilioAccountSid && this.twilioAuthToken && this.twilioPhoneNumber);
    this.sentHistory = [];
    this.maxHistory = 100;
  }

  /**
   * Envoie une alerte SMS
   */
  async send(alert) {
    try {
      const rule = alertRules.events[alert.type] || {};
      const severityConfig = alertRules.severity[alert.severity] || {};

      // Verifier si SMS active pour cette severite
      if (!severityConfig.sms) {
        return { success: false, reason: 'SEVERITY_NOT_CONFIGURED_FOR_SMS' };
      }

      // SMS uniquement pour CRITICAL
      if (alert.severity !== 'CRITICAL') {
        return { success: false, reason: 'SEVERITY_TOO_LOW' };
      }

      // Verifier cooldown
      if (this.isInCooldown(alert.type)) {
        return { success: false, reason: 'COOLDOWN_ACTIVE' };
      }

      // Verifier limit SMS par heure
      if (this.hasReachedHourlyLimit()) {
        return { success: false, reason: 'HOURLY_LIMIT_REACHED' };
      }

      const recipientPhone = alertRules.recipients.sms;
      if (!recipientPhone) {
        return { success: false, reason: 'NO_RECIPIENT' };
      }

      // Construire le message
      const body = this.buildMessage(alert);

      // Envoyer via Twilio si configure en production
      if (process.env.NODE_ENV === 'production' && this.enabled) {
        // Import dynamique de twilio
        const twilio = (await import('twilio')).default;
        const client = twilio(this.twilioAccountSid, this.twilioAuthToken);

        await client.messages.create({
          body,
          from: this.twilioPhoneNumber,
          to: recipientPhone
        });

        console.log('[SMS] Alert sent to', recipientPhone);
      } else {
        // Mode dev - log seulement
        console.log('[SMS ALERT]', recipientPhone);
        console.log(body);
      }

      // Enregistrer l'envoi
      this.recordSent(alert);

      return {
        success: true,
        timestamp: new Date().toISOString(),
        recipient: recipientPhone,
        mode: this.enabled ? 'production' : 'simulation'
      };

    } catch (error) {
      console.error('[SMS] Failed to send alert:', error.message);
      return {
        success: false,
        reason: 'SEND_FAILED',
        error: error.message
      };
    }
  }

  /**
   * Verifie le cooldown
   */
  isInCooldown(alertType) {
    const rule = alertRules.events[alertType];
    if (!rule || !rule.cooldown) return false;

    const recent = this.sentHistory.find(
      h => h.type === alertType &&
      Date.now() - new Date(h.timestamp).getTime() < rule.cooldown
    );

    return !!recent;
  }

  /**
   * Verifie la limite horaire
   */
  hasReachedHourlyLimit() {
    const lastHour = this.sentHistory.filter(
      h => Date.now() - new Date(h.timestamp).getTime() < 60 * 60 * 1000
    );

    return lastHour.length >= alertRules.thresholds.maxAlertsPerHour.sms;
  }

  /**
   * Enregistre un envoi
   */
  recordSent(alert) {
    this.sentHistory.push({
      type: alert.type,
      severity: alert.severity,
      timestamp: new Date().toISOString()
    });

    if (this.sentHistory.length > this.maxHistory) {
      this.sentHistory.shift();
    }
  }

  /**
   * Construit le message SMS
   */
  buildMessage(alert) {
    // SMS limite a 160 caracteres
    const template = alertRules.templates.sms.body;
    const message = template
      .replace('{severity}', alert.severity)
      .replace('{event}', alert.type)
      .replace('{timestamp}', new Date(alert.timestamp).toLocaleTimeString());

    return message.substring(0, 160);
  }

  /**
   * Stats SMS
   */
  getStats() {
    const last24h = this.sentHistory.filter(
      h => Date.now() - new Date(h.timestamp).getTime() < 24 * 60 * 60 * 1000
    );

    return {
      total: this.sentHistory.length,
      last24h: last24h.length,
      enabled: this.enabled,
      configured: !!(this.twilioAccountSid && this.twilioAuthToken)
    };
  }

  /**
   * Clear history (pour tests)
   */
  clear() {
    this.sentHistory = [];
  }
}

// Singleton
const smsAlerts = new SmsAlerts();
export { smsAlerts };
export default smsAlerts;
