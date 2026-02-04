/**
 * Gestionnaire alertes
 */

export class AlertManager {
  /**
   * Envoyer alerte
   */
  async send({ type, anomaly, message }) {
    console.log(`[ALERT] ${type}: ${message}`);

    // TODO: Email
    // TODO: SMS si critique
    // TODO: Webhook Slack/Discord

    return true;
  }
}
