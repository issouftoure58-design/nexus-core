/**
 * SENTINEL Slack Alerts
 * Notifications Slack via webhook
 */

import alertRules from '../config/alertRules.js';

class SlackAlerts {
  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
    this.enabled = !!this.webhookUrl;
    this.sentHistory = [];
    this.maxHistory = 100;
  }

  /**
   * Envoie une alerte Slack
   */
  async send(alert) {
    try {
      const rule = alertRules.events[alert.type] || {};
      const severityConfig = alertRules.severity[alert.severity] || {};

      // Verifier si Slack active pour cette severite
      if (!severityConfig.slack) {
        return { success: false, reason: 'SEVERITY_NOT_CONFIGURED_FOR_SLACK' };
      }

      // Verifier cooldown
      if (this.isInCooldown(alert.type)) {
        return { success: false, reason: 'COOLDOWN_ACTIVE' };
      }

      // Construire le payload Slack
      const payload = this.buildPayload(alert);

      // Envoyer via webhook si configure
      if (this.enabled) {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error('Slack webhook error: ' + response.status);
        }

        console.log('[SLACK] Alert sent');
      } else {
        // Mode non configure - log seulement
        console.log('[SLACK ALERT]', alert.type, '-', alert.severity);
      }

      // Enregistrer l'envoi
      this.recordSent(alert);

      return {
        success: true,
        timestamp: new Date().toISOString(),
        mode: this.enabled ? 'production' : 'simulation'
      };

    } catch (error) {
      console.error('[SLACK] Failed to send alert:', error.message);
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
   * Construit le payload Slack
   */
  buildPayload(alert) {
    const template = alertRules.templates.slack;
    const color = template.color[alert.severity] || '#999999';

    // Emoji par severite
    const emoji = {
      CRITICAL: ':rotating_light:',
      HIGH: ':warning:',
      MEDIUM: ':zap:',
      LOW: ':information_source:'
    }[alert.severity] || ':chart_with_upwards_trend:';

    return {
      username: template.username,
      icon_emoji: template.icon_emoji,
      attachments: [{
        color,
        title: `${emoji} ${alert.severity} - ${alert.type}`,
        text: alert.message || alertRules.events[alert.type]?.message || 'Alert detected',
        fields: [
          {
            title: 'Time',
            value: new Date(alert.timestamp).toLocaleString(),
            short: true
          },
          {
            title: 'Severity',
            value: alert.severity,
            short: true
          },
          ...(alert.details ? [{
            title: 'Details',
            value: '```' + JSON.stringify(alert.details, null, 2).substring(0, 500) + '```',
            short: false
          }] : []),
          ...(alert.suggestedAction ? [{
            title: 'Suggested Action',
            value: alert.suggestedAction,
            short: false
          }] : [])
        ],
        footer: 'NEXUS SENTINEL',
        ts: Math.floor(new Date(alert.timestamp).getTime() / 1000)
      }]
    };
  }

  /**
   * Stats Slack
   */
  getStats() {
    const last24h = this.sentHistory.filter(
      h => Date.now() - new Date(h.timestamp).getTime() < 24 * 60 * 60 * 1000
    );

    return {
      total: this.sentHistory.length,
      last24h: last24h.length,
      enabled: this.enabled,
      configured: !!this.webhookUrl
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
const slackAlerts = new SlackAlerts();
export { slackAlerts };
export default slackAlerts;
