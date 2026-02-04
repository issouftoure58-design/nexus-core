/**
 * SENTINEL Email Alerts
 * Notifications par email via Resend
 */

import alertRules from '../config/alertRules.js';

class EmailAlerts {
  constructor() {
    this.resendApiKey = process.env.RESEND_API_KEY;
    this.enabled = !!this.resendApiKey;
    this.sentHistory = [];
    this.maxHistory = 100;
  }

  /**
   * Envoie une alerte email
   */
  async send(alert) {
    try {
      const rule = alertRules.events[alert.type] || {};
      const severityConfig = alertRules.severity[alert.severity] || {};

      // Verifier si email active pour cette severite
      if (!severityConfig.email && alert.severity !== 'LOW') {
        return { success: false, reason: 'SEVERITY_NOT_CONFIGURED_FOR_EMAIL' };
      }

      // Verifier cooldown
      if (this.isInCooldown(alert.type)) {
        return { success: false, reason: 'COOLDOWN_ACTIVE' };
      }

      // Construire le message
      const subject = this.buildSubject(alert);
      const body = alert.customBody || this.buildBody(alert);

      // Envoyer via Resend si configure en production
      if (process.env.NODE_ENV === 'production' && this.resendApiKey) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'SENTINEL <sentinel@nexus.com>',
            to: [alertRules.recipients.email],
            subject,
            html: this.buildHtmlBody(alert)
          })
        });

        if (!response.ok) {
          throw new Error('Resend API error: ' + response.status);
        }

        console.log('[EMAIL] Alert sent to', alertRules.recipients.email);
      } else {
        // Mode dev - log seulement
        console.log('[EMAIL ALERT]', subject);
        if (process.env.NODE_ENV !== 'test') {
          console.log(body.substring(0, 200) + '...');
        }
      }

      // Enregistrer l'envoi
      this.recordSent(alert);

      return {
        success: true,
        timestamp: new Date().toISOString(),
        recipient: alertRules.recipients.email,
        mode: this.enabled ? 'production' : 'simulation'
      };

    } catch (error) {
      console.error('[EMAIL] Failed to send alert:', error.message);
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
   * Construit le sujet
   */
  buildSubject(alert) {
    return alertRules.templates.email.subject
      .replace('{severity}', alert.severity)
      .replace('{event}', alert.type);
  }

  /**
   * Construit le corps texte
   */
  buildBody(alert) {
    return alertRules.templates.email.body
      .replace('{severity}', alert.severity)
      .replace('{event}', alert.type)
      .replace('{timestamp}', alert.timestamp)
      .replace('{details}', JSON.stringify(alert.details || {}, null, 2))
      .replace('{suggestedAction}', alert.suggestedAction || 'Review logs');
  }

  /**
   * Construit le corps HTML
   */
  buildHtmlBody(alert) {
    const severityColors = {
      CRITICAL: '#FF0000',
      HIGH: '#FF6600',
      MEDIUM: '#FFCC00',
      LOW: '#00FF00'
    };

    const color = severityColors[alert.severity] || '#999';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; }
          .header { background: ${color}; color: white; padding: 20px; }
          .content { padding: 20px; }
          .details { background: #f5f5f5; padding: 15px; border-radius: 5px; }
          .footer { color: #666; font-size: 12px; padding: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>SENTINEL Alert</h1>
          <h2>${alert.severity} - ${alert.type}</h2>
        </div>
        <div class="content">
          <p><strong>Time:</strong> ${alert.timestamp}</p>
          <p><strong>Message:</strong> ${alert.message || 'No message'}</p>

          <div class="details">
            <h3>Details:</h3>
            <pre>${JSON.stringify(alert.details || {}, null, 2)}</pre>
          </div>

          ${alert.suggestedAction ? `
            <p><strong>Suggested Action:</strong> ${alert.suggestedAction}</p>
          ` : ''}
        </div>
        <div class="footer">
          <p>NEXUS Platform Monitoring</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Stats emails
   */
  getStats() {
    const last24h = this.sentHistory.filter(
      h => Date.now() - new Date(h.timestamp).getTime() < 24 * 60 * 60 * 1000
    );

    return {
      total: this.sentHistory.length,
      last24h: last24h.length,
      enabled: this.enabled,
      configured: !!this.resendApiKey
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
const emailAlerts = new EmailAlerts();
export { emailAlerts };
export default emailAlerts;
