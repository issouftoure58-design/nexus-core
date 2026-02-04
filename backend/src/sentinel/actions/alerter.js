/**
 * SENTINEL - Alerter
 *
 * Canaux: SMS (critique), Email (important), Dashboard (info)
 * Numero SMS alertes critiques: 0760537694
 */

import { ALERT_PHONE } from '../config/thresholds.js';

class Alerter {
  constructor() {
    this.alertHistory = [];
    this.lastAlertTime = {};
    this.cooldownMinutes = 5; // Minimum time between same alerts
  }

  async send(level, title, data = {}) {
    const alert = {
      id: Date.now().toString(36),
      level,
      title,
      data,
      timestamp: new Date().toISOString()
    };

    // Check cooldown to avoid spam
    const alertKey = `${level}:${title}`;
    const lastTime = this.lastAlertTime[alertKey];
    if (lastTime) {
      const minutesSince = (Date.now() - lastTime) / 1000 / 60;
      if (minutesSince < this.cooldownMinutes) {
        console.log(`[SENTINEL] Alert suppressed (cooldown): ${alertKey}`);
        return { sent: false, reason: 'cooldown' };
      }
    }

    this.lastAlertTime[alertKey] = Date.now();
    this.alertHistory.push(alert);

    // Keep only last 1000 alerts
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-1000);
    }

    console.log(`[SENTINEL] ALERT ${level}: ${title}`, data);

    // Send based on level
    switch (level) {
      case 'CRITICAL':
        await this.sendSMS(alert);
        await this.logToFile(alert);
        break;
      case 'URGENT':
        await this.sendEmail(alert);
        await this.logToFile(alert);
        break;
      case 'WARNING':
        await this.logToFile(alert);
        break;
      case 'INFO':
        // Just log
        break;
    }

    return { sent: true, alert };
  }

  async sendSMS(alert) {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        console.log('[SENTINEL] SMS not configured, logging only');
        return { sent: false, reason: 'not_configured' };
      }

      const twilio = (await import('twilio')).default;
      const client = twilio(accountSid, authToken);

      const message = `[NEXUS ALERT] ${alert.level}\n${alert.title}\n${new Date().toLocaleString('fr-FR')}`;

      await client.messages.create({
        body: message.substring(0, 160), // SMS limit
        from: fromNumber,
        to: ALERT_PHONE.startsWith('+') ? ALERT_PHONE : `+33${ALERT_PHONE.substring(1)}`
      });

      console.log(`[SENTINEL] SMS sent to ${ALERT_PHONE}`);
      return { sent: true };
    } catch (error) {
      console.error('[SENTINEL] SMS failed:', error.message);
      return { sent: false, error: error.message };
    }
  }

  async sendEmail(alert) {
    // Email implementation via Resend
    try {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        console.log('[SENTINEL] Email not configured');
        return { sent: false, reason: 'not_configured' };
      }

      // TODO: Implement Resend email
      console.log('[SENTINEL] Email alert logged (Resend integration pending)');
      return { sent: false, reason: 'not_implemented' };
    } catch (error) {
      console.error('[SENTINEL] Email failed:', error.message);
      return { sent: false, error: error.message };
    }
  }

  async logToFile(alert) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const alertsDir = path.join(process.cwd(), 'data', 'sentinel', 'alerts');
      const date = new Date().toISOString().split('T')[0];
      const filePath = path.join(alertsDir, `${date}.json`);

      let alerts = [];
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        alerts = JSON.parse(content);
      } catch {
        // File doesn't exist yet
      }

      alerts.push(alert);
      await fs.writeFile(filePath, JSON.stringify(alerts, null, 2));

      return { logged: true };
    } catch (error) {
      console.error('[SENTINEL] Log to file failed:', error.message);
      return { logged: false, error: error.message };
    }
  }

  getHistory(limit = 50) {
    return this.alertHistory.slice(-limit);
  }

  getByLevel(level) {
    return this.alertHistory.filter(a => a.level === level);
  }
}

export const alerter = new Alerter();
export default alerter;
