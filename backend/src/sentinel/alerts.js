/**
 * SENTINEL - Système d'alertes
 *
 * Déclenche des alertes quand un tenant approche (80%) ou dépasse (100%) son quota.
 * Canaux : logs console + webhook Slack (optionnel).
 * Anti-spam : même alerte pas renvoyée avant 1h.
 */

// Seuils d'alerte
import { saveAlert } from './persistence.js';

export const THRESHOLDS_ALERTS = {
  warning: 80,   // 80% du quota
  critical: 100, // 100% du quota
};

// Historique des alertes envoyées (évite spam)
const sentAlerts = {};

function getAlertKey(tenantId, level) {
  return `${tenantId}-${level}`;
}

function shouldSendAlert(tenantId, level) {
  const key = getAlertKey(tenantId, level);
  const lastSent = sentAlerts[key];

  // Ne pas renvoyer la même alerte avant 1h
  if (lastSent && (Date.now() - lastSent) < 60 * 60 * 1000) {
    return false;
  }
  return true;
}

function markAlertSent(tenantId, level) {
  sentAlerts[getAlertKey(tenantId, level)] = Date.now();
}

export async function sendSlackAlert(message) {
  const webhookUrl = process.env.SENTINEL_SLACK_WEBHOOK;

  if (!webhookUrl) {
    console.log(`[SENTINEL ALERT] Slack non configuré - ${message}`);
    return { success: false, reason: 'no_webhook' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '🚨 SENTINEL Alert',
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: message },
          },
        ],
      }),
    });

    if (response.ok) {
      console.log('[SENTINEL ALERT] Slack envoyé');
      return { success: true };
    } else {
      console.error(`[SENTINEL ALERT] Slack erreur: ${response.status}`);
      return { success: false, reason: 'slack_error' };
    }
  } catch (error) {
    console.error('[SENTINEL ALERT] Erreur:', error.message);
    return { success: false, reason: error.message };
  }
}

/**
 * Vérifie les seuils et envoie les alertes si nécessaire.
 * @param {string} tenantId
 * @param {{ percentage: number, cost: number, limit: number }} usage - depuis checkQuota().usage
 * @param {string} plan - nom du plan (ex: "Starter")
 * @returns {Promise<Array>} alertes déclenchées
 */
export async function checkAndAlert(tenantId, usage, plan) {
  const percentage = usage.percentage;
  const alerts = [];

  // Alerte critique (100%)
  if (percentage >= THRESHOLDS_ALERTS.critical) {
    if (shouldSendAlert(tenantId, 'critical')) {
      const message = `🔴 *CRITICAL* - Tenant *${tenantId}* a dépassé son quota!\n` +
        `• Utilisation: ${percentage}% (${usage.cost.toFixed(2)}€ / ${usage.limit}€)\n` +
        `• Plan: ${plan}\n` +
        `• Action requise: upgrade ou limitation`;

      console.log(`[SENTINEL ALERT] CRITICAL - ${tenantId} à ${percentage}%`);
      await sendSlackAlert(message);
      saveAlert(tenantId, 'critical', percentage, message).catch(() => {});
      markAlertSent(tenantId, 'critical');
      alerts.push({ level: 'critical', percentage });
    }
  }
  // Alerte warning (80%)
  else if (percentage >= THRESHOLDS_ALERTS.warning) {
    if (shouldSendAlert(tenantId, 'warning')) {
      const message = `🟠 *WARNING* - Tenant *${tenantId}* approche de son quota\n` +
        `• Utilisation: ${percentage}% (${usage.cost.toFixed(2)}€ / ${usage.limit}€)\n` +
        `• Plan: ${plan}\n` +
        `• Seuil critique: ${THRESHOLDS_ALERTS.critical}%`;

      console.log(`[SENTINEL ALERT] WARNING - ${tenantId} à ${percentage}%`);
      await sendSlackAlert(message);
      saveAlert(tenantId, 'warning', percentage, message).catch(() => {});
      markAlertSent(tenantId, 'warning');
      alerts.push({ level: 'warning', percentage });
    }
  }

  return alerts;
}

/**
 * Reset les alertes envoyées (pour un tenant ou tous).
 */
export function resetAlerts(tenantId) {
  if (tenantId) {
    delete sentAlerts[getAlertKey(tenantId, 'warning')];
    delete sentAlerts[getAlertKey(tenantId, 'critical')];
  } else {
    Object.keys(sentAlerts).forEach(k => delete sentAlerts[k]);
  }
}
