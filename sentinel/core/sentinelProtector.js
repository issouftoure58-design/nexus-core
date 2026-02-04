/**
 * SENTINEL Protector - Orchestrateur Phase 4
 * Coordonne firewall, IP blocker, encryption et 2FA
 */

import firewall from '../security/firewall.js';
import ipBlocker from '../security/ipBlocker.js';
import encryption from '../security/encryption.js';
import twoFactorAuth from '../security/twoFactorAuth.js';
import auditTrail from '../reports/auditTrail.js';

class SentinelProtector {
  constructor() {
    this.isActive = false;
    this.startTime = null;
    this.config = {
      enableFirewall: true,
      enableIPBlocker: true,
      loadDefaultRules: true
    };
  }

  /**
   * Demarre SENTINEL Protector
   */
  start(config = {}) {
    if (this.isActive) {
      console.log('[PROTECTOR] Already running');
      return { success: false, reason: 'Already running' };
    }

    console.log('[PROTECTOR] Starting...');
    this.isActive = true;
    this.startTime = new Date().toISOString();
    this.config = { ...this.config, ...config };

    // Activer le firewall
    if (this.config.enableFirewall) {
      firewall.enable();
      if (this.config.loadDefaultRules) {
        firewall.loadDefaultRules();
      }
    }

    // Activer le blocker IP
    if (this.config.enableIPBlocker) {
      ipBlocker.enable();
    }

    // Log audit
    auditTrail.logAction({
      type: 'PROTECTOR_STARTED',
      details: {
        startTime: this.startTime,
        config: this.config
      }
    });

    console.log('[PROTECTOR] Started successfully');
    console.log(`[PROTECTOR]   - Firewall: ${this.config.enableFirewall ? 'ON' : 'OFF'}`);
    console.log(`[PROTECTOR]   - IP Blocker: ${this.config.enableIPBlocker ? 'ON' : 'OFF'}`);

    return { success: true };
  }

  /**
   * Arrete SENTINEL Protector
   */
  stop() {
    if (!this.isActive) {
      console.log('[PROTECTOR] Not running');
      return { success: false, reason: 'Not running' };
    }

    firewall.disable();
    ipBlocker.disable();

    // Log audit
    auditTrail.logAction({
      type: 'PROTECTOR_STOPPED',
      details: { uptime: this.getUptime() }
    });

    this.isActive = false;
    console.log('[PROTECTOR] Stopped');
    return { success: true };
  }

  /**
   * Middleware combine pour Express
   */
  middleware() {
    return (req, res, next) => {
      if (!this.isActive) {
        return next();
      }

      const ip = req.ip || req.connection?.remoteAddress || 'unknown';

      // Verifier IP blocker d'abord
      const ipResult = ipBlocker.isBlocked(ip);
      if (ipResult.blocked) {
        auditTrail.logAction({
          type: 'REQUEST_BLOCKED_IP',
          details: { ip, reason: ipResult.reason }
        });
        return res.status(403).json({
          error: 'Access Denied',
          reason: ipResult.reason
        });
      }

      // Verifier firewall
      const fwResult = firewall.checkRequest(req);
      if (!fwResult.allowed) {
        auditTrail.logAction({
          type: 'REQUEST_BLOCKED_FIREWALL',
          details: { ip, path: req.path, reason: fwResult.reason }
        });
        return res.status(403).json({
          error: 'Forbidden',
          reason: fwResult.reason
        });
      }

      next();
    };
  }

  /**
   * Enregistre une tentative d'authentification echouee
   */
  recordAuthFailure(ip, userId = null) {
    const result = ipBlocker.recordFailedAttempt(ip, 'Authentication failure');

    auditTrail.logAction({
      type: 'AUTH_FAILURE_RECORDED',
      details: { ip, userId, banned: result.banned }
    });

    return result;
  }

  /**
   * Reset les tentatives apres succes
   */
  recordAuthSuccess(ip) {
    ipBlocker.resetAttempts(ip);
  }

  /**
   * Chiffre des donnees sensibles
   */
  encryptData(data, purpose = 'storage') {
    return encryption.encryptSensitiveData(data, purpose);
  }

  /**
   * Dechiffre des donnees sensibles
   */
  decryptData(encryptedData, purpose = 'storage') {
    return encryption.decryptSensitiveData(encryptedData, purpose);
  }

  /**
   * Hash un mot de passe
   */
  hashPassword(password) {
    return encryption.hashPassword(password);
  }

  /**
   * Verifie un mot de passe
   */
  verifyPassword(password, hash) {
    return encryption.verifyPassword(password, hash);
  }

  /**
   * Setup 2FA pour un utilisateur
   */
  setup2FA(userId) {
    return twoFactorAuth.generateSecret(userId);
  }

  /**
   * Active 2FA pour un utilisateur
   */
  enable2FA(userId, code) {
    return twoFactorAuth.enable(userId, code);
  }

  /**
   * Verifie un code 2FA
   */
  verify2FA(userId, code) {
    return twoFactorAuth.verify(userId, code);
  }

  /**
   * Desactive 2FA pour un utilisateur
   */
  disable2FA(userId) {
    return twoFactorAuth.disable(userId);
  }

  /**
   * Verifie si 2FA est active
   */
  is2FAEnabled(userId) {
    return twoFactorAuth.isEnabled(userId);
  }

  /**
   * Ajoute une regle firewall
   */
  addFirewallRule(rule) {
    return firewall.addRule(rule);
  }

  /**
   * Bloque une IP
   */
  blockIP(ip, reason, duration = null) {
    return ipBlocker.block(ip, reason, duration);
  }

  /**
   * Debloque une IP
   */
  unblockIP(ip) {
    return ipBlocker.unblock(ip);
  }

  /**
   * Ajoute une IP a la whitelist
   */
  whitelistIP(ip) {
    return ipBlocker.whitelist_add(ip);
  }

  /**
   * Calcule l'uptime
   */
  getUptime() {
    if (!this.startTime) return 0;
    return Math.round((Date.now() - new Date(this.startTime).getTime()) / 1000);
  }

  /**
   * Status complet
   */
  getStatus() {
    return {
      active: this.isActive,
      startTime: this.startTime,
      uptime: this.getUptime(),
      components: {
        firewall: firewall.getStatus(),
        ipBlocker: ipBlocker.getStatus(),
        encryption: encryption.getStatus(),
        twoFactorAuth: twoFactorAuth.getStatus()
      }
    };
  }

  /**
   * Stats detaillees
   */
  getStats() {
    return {
      firewall: firewall.getStats(),
      ipBlocker: ipBlocker.getStats(),
      encryption: encryption.getStats(),
      twoFactorAuth: twoFactorAuth.getStats()
    };
  }

  /**
   * Retourne les regles firewall
   */
  getFirewallRules() {
    return firewall.getRules();
  }

  /**
   * Retourne les listes IP
   */
  getIPLists() {
    return ipBlocker.getLists();
  }
}

// Singleton
const sentinelProtector = new SentinelProtector();
export { sentinelProtector };
export default sentinelProtector;
