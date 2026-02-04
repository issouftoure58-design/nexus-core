/**
 * SENTINEL IP Blocker - Protection Phase 4
 * Gestion des IPs bloques et listes blanches
 */

import auditTrail from '../reports/auditTrail.js';

class IPBlocker {
  constructor() {
    this.blacklist = new Map(); // IP -> { reason, timestamp, expiry }
    this.whitelist = new Set();
    this.tempBans = new Map(); // IP -> { attempts, lastAttempt, banUntil }
    this.enabled = false;

    this.config = {
      maxAttempts: 5,
      banDuration: 30 * 60 * 1000, // 30 minutes
      attemptWindow: 5 * 60 * 1000 // 5 minutes
    };

    this.stats = {
      checked: 0,
      blocked: 0,
      whitelisted: 0,
      tempBanned: 0
    };
  }

  /**
   * Active le blocker
   */
  enable() {
    this.enabled = true;
    auditTrail.logAction({
      type: 'IP_BLOCKER_ENABLED',
      details: { blacklistSize: this.blacklist.size, whitelistSize: this.whitelist.size }
    });
    console.log('[IP-BLOCKER] Enabled');
    return { success: true };
  }

  /**
   * Desactive le blocker
   */
  disable() {
    this.enabled = false;
    auditTrail.logAction({
      type: 'IP_BLOCKER_DISABLED',
      details: {}
    });
    console.log('[IP-BLOCKER] Disabled');
    return { success: true };
  }

  /**
   * Verifie si une IP est bloquee
   */
  isBlocked(ip) {
    this.stats.checked++;

    if (!this.enabled) {
      return { blocked: false, reason: 'IP Blocker disabled' };
    }

    // Whitelist prioritaire
    if (this.whitelist.has(ip)) {
      this.stats.whitelisted++;
      return { blocked: false, reason: 'Whitelisted' };
    }

    // Verifier blacklist permanente
    const blacklistEntry = this.blacklist.get(ip);
    if (blacklistEntry) {
      // Verifier expiration
      if (blacklistEntry.expiry && new Date() > new Date(blacklistEntry.expiry)) {
        this.blacklist.delete(ip);
      } else {
        this.stats.blocked++;
        return { blocked: true, reason: blacklistEntry.reason || 'Blacklisted', permanent: !blacklistEntry.expiry };
      }
    }

    // Verifier ban temporaire
    const tempBan = this.tempBans.get(ip);
    if (tempBan && tempBan.banUntil) {
      if (new Date() < new Date(tempBan.banUntil)) {
        this.stats.tempBanned++;
        return { blocked: true, reason: 'Temporarily banned', until: tempBan.banUntil };
      } else {
        // Ban expire
        this.tempBans.delete(ip);
      }
    }

    return { blocked: false };
  }

  /**
   * Ajoute une IP a la blacklist
   */
  block(ip, reason = 'Manual block', duration = null) {
    const entry = {
      reason,
      timestamp: new Date().toISOString(),
      expiry: duration ? new Date(Date.now() + duration).toISOString() : null
    };

    this.blacklist.set(ip, entry);

    auditTrail.logAction({
      type: 'IP_BLOCKED',
      details: { ip, reason, permanent: !duration }
    });

    console.log(`[IP-BLOCKER] Blocked: ${ip} - ${reason}`);
    return { success: true, entry };
  }

  /**
   * Retire une IP de la blacklist
   */
  unblock(ip) {
    if (!this.blacklist.has(ip)) {
      return { success: false, reason: 'IP not in blacklist' };
    }

    this.blacklist.delete(ip);
    this.tempBans.delete(ip);

    auditTrail.logAction({
      type: 'IP_UNBLOCKED',
      details: { ip }
    });

    console.log(`[IP-BLOCKER] Unblocked: ${ip}`);
    return { success: true };
  }

  /**
   * Ajoute une IP a la whitelist
   */
  whitelist_add(ip) {
    this.whitelist.add(ip);

    // Retirer de la blacklist si presente
    this.blacklist.delete(ip);
    this.tempBans.delete(ip);

    auditTrail.logAction({
      type: 'IP_WHITELISTED',
      details: { ip }
    });

    console.log(`[IP-BLOCKER] Whitelisted: ${ip}`);
    return { success: true };
  }

  /**
   * Retire une IP de la whitelist
   */
  whitelist_remove(ip) {
    if (!this.whitelist.has(ip)) {
      return { success: false, reason: 'IP not in whitelist' };
    }

    this.whitelist.delete(ip);

    auditTrail.logAction({
      type: 'IP_WHITELIST_REMOVED',
      details: { ip }
    });

    return { success: true };
  }

  /**
   * Enregistre une tentative echouee (pour ban auto)
   */
  recordFailedAttempt(ip, reason = 'Failed attempt') {
    if (this.whitelist.has(ip)) return { banned: false };

    const now = Date.now();
    let entry = this.tempBans.get(ip) || { attempts: 0, lastAttempt: now, banUntil: null };

    // Reset si window depassee
    if (now - entry.lastAttempt > this.config.attemptWindow) {
      entry.attempts = 0;
    }

    entry.attempts++;
    entry.lastAttempt = now;

    // Ban si trop de tentatives
    if (entry.attempts >= this.config.maxAttempts) {
      entry.banUntil = new Date(now + this.config.banDuration).toISOString();

      auditTrail.logAction({
        type: 'IP_TEMP_BANNED',
        details: { ip, attempts: entry.attempts, reason }
      });

      console.log(`[IP-BLOCKER] Temp banned: ${ip} - ${entry.attempts} attempts`);
    }

    this.tempBans.set(ip, entry);

    return {
      banned: entry.banUntil !== null,
      attempts: entry.attempts,
      maxAttempts: this.config.maxAttempts,
      banUntil: entry.banUntil
    };
  }

  /**
   * Reset les tentatives pour une IP
   */
  resetAttempts(ip) {
    this.tempBans.delete(ip);
    return { success: true };
  }

  /**
   * Middleware Express
   */
  middleware() {
    return (req, res, next) => {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const result = this.isBlocked(ip);

      if (result.blocked) {
        return res.status(403).json({
          error: 'Access Denied',
          reason: result.reason,
          until: result.until
        });
      }

      next();
    };
  }

  /**
   * Configure les parametres
   */
  configure(config) {
    this.config = { ...this.config, ...config };
    return { success: true, config: this.config };
  }

  /**
   * Retourne les stats
   */
  getStats() {
    return {
      enabled: this.enabled,
      blacklistSize: this.blacklist.size,
      whitelistSize: this.whitelist.size,
      tempBansActive: Array.from(this.tempBans.values()).filter(b => b.banUntil && new Date() < new Date(b.banUntil)).length,
      ...this.stats,
      config: this.config
    };
  }

  /**
   * Retourne les listes
   */
  getLists() {
    return {
      blacklist: Array.from(this.blacklist.entries()).map(([ip, data]) => ({ ip, ...data })),
      whitelist: Array.from(this.whitelist),
      tempBans: Array.from(this.tempBans.entries())
        .filter(([_, data]) => data.banUntil && new Date() < new Date(data.banUntil))
        .map(([ip, data]) => ({ ip, ...data }))
    };
  }

  /**
   * Retourne le status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      blacklist: this.blacklist.size,
      whitelist: this.whitelist.size,
      tempBans: this.tempBans.size
    };
  }

  /**
   * Clear (pour tests)
   */
  clear() {
    this.blacklist.clear();
    this.whitelist.clear();
    this.tempBans.clear();
    this.stats = { checked: 0, blocked: 0, whitelisted: 0, tempBanned: 0 };
  }
}

// Singleton
const ipBlocker = new IPBlocker();
export { ipBlocker };
export default ipBlocker;
