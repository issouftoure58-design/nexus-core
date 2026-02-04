/**
 * SENTINEL Firewall - Protection Phase 4
 * Gere les regles de filtrage et la protection reseau
 */

import auditTrail from '../reports/auditTrail.js';

class Firewall {
  constructor() {
    this.rules = [];
    this.enabled = false;
    this.blocked = [];
    this.stats = {
      requests: 0,
      blocked: 0,
      allowed: 0
    };
  }

  /**
   * Active le firewall
   */
  enable() {
    this.enabled = true;
    auditTrail.logAction({
      type: 'FIREWALL_ENABLED',
      details: { rulesCount: this.rules.length }
    });
    console.log('[FIREWALL] Enabled');
    return { success: true };
  }

  /**
   * Desactive le firewall
   */
  disable() {
    this.enabled = false;
    auditTrail.logAction({
      type: 'FIREWALL_DISABLED',
      details: {}
    });
    console.log('[FIREWALL] Disabled');
    return { success: true };
  }

  /**
   * Ajoute une regle
   */
  addRule(rule) {
    const newRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...rule,
      createdAt: new Date().toISOString()
    };
    this.rules.push(newRule);

    auditTrail.logAction({
      type: 'FIREWALL_RULE_ADDED',
      details: { rule: newRule }
    });

    console.log(`[FIREWALL] Rule added: ${rule.name || rule.type}`);
    return newRule;
  }

  /**
   * Supprime une regle
   */
  removeRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index === -1) {
      return { success: false, reason: 'Rule not found' };
    }

    const removed = this.rules.splice(index, 1)[0];
    auditTrail.logAction({
      type: 'FIREWALL_RULE_REMOVED',
      details: { rule: removed }
    });

    return { success: true, removed };
  }

  /**
   * Verifie une requete contre les regles
   */
  checkRequest(req) {
    this.stats.requests++;

    if (!this.enabled) {
      this.stats.allowed++;
      return { allowed: true, reason: 'Firewall disabled' };
    }

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const path = req.path || req.url;
    const method = req.method;
    const userAgent = req.headers?.['user-agent'] || '';

    // Verifier chaque regle
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const match = this.matchRule(rule, { ip, path, method, userAgent });

      if (match && rule.action === 'BLOCK') {
        this.stats.blocked++;
        this.blocked.push({
          ip,
          path,
          method,
          rule: rule.id,
          timestamp: new Date().toISOString()
        });

        // Garder seulement les 1000 dernieres entrees
        if (this.blocked.length > 1000) {
          this.blocked = this.blocked.slice(-1000);
        }

        auditTrail.logAction({
          type: 'REQUEST_BLOCKED',
          details: { ip, path, method, ruleId: rule.id }
        });

        return { allowed: false, reason: `Blocked by rule: ${rule.name}`, ruleId: rule.id };
      }
    }

    this.stats.allowed++;
    return { allowed: true };
  }

  /**
   * Verifie si une regle matche
   */
  matchRule(rule, request) {
    switch (rule.type) {
      case 'IP':
        return this.matchIP(rule.pattern, request.ip);

      case 'PATH':
        return this.matchPath(rule.pattern, request.path);

      case 'METHOD':
        return rule.pattern === request.method;

      case 'USER_AGENT':
        return request.userAgent.toLowerCase().includes(rule.pattern.toLowerCase());

      case 'RATE_LIMIT':
        return this.checkRateLimit(rule, request.ip);

      case 'GEO':
        // Placeholder pour geolocalisation
        return false;

      default:
        return false;
    }
  }

  /**
   * Match IP avec pattern (supporte CIDR et wildcards)
   */
  matchIP(pattern, ip) {
    if (pattern === '*') return true;
    if (pattern === ip) return true;

    // Wildcard simple (ex: 192.168.*)
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return regex.test(ip);
    }

    // CIDR (ex: 192.168.1.0/24)
    if (pattern.includes('/')) {
      return this.matchCIDR(pattern, ip);
    }

    return false;
  }

  /**
   * Match CIDR
   */
  matchCIDR(cidr, ip) {
    try {
      const [range, bits] = cidr.split('/');
      const mask = ~(2 ** (32 - parseInt(bits)) - 1);

      const ipToInt = (ip) => {
        const parts = ip.split('.').map(Number);
        return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
      };

      return (ipToInt(ip) & mask) === (ipToInt(range) & mask);
    } catch {
      return false;
    }
  }

  /**
   * Match path avec pattern
   */
  matchPath(pattern, path) {
    if (pattern === '*') return true;
    if (pattern === path) return true;

    // Wildcard (ex: /api/*)
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(path);
    }

    return path.startsWith(pattern);
  }

  /**
   * Verifie rate limit
   */
  checkRateLimit(rule, ip) {
    // Rate limiting basique
    const now = Date.now();
    const windowMs = rule.windowMs || 60000;
    const maxRequests = rule.maxRequests || 100;

    if (!this.rateLimitMap) {
      this.rateLimitMap = new Map();
    }

    const key = `${rule.id}_${ip}`;
    const entry = this.rateLimitMap.get(key) || { count: 0, windowStart: now };

    if (now - entry.windowStart > windowMs) {
      entry.count = 1;
      entry.windowStart = now;
    } else {
      entry.count++;
    }

    this.rateLimitMap.set(key, entry);

    return entry.count > maxRequests;
  }

  /**
   * Middleware Express
   */
  middleware() {
    return (req, res, next) => {
      const result = this.checkRequest(req);

      if (!result.allowed) {
        return res.status(403).json({
          error: 'Forbidden',
          reason: result.reason
        });
      }

      next();
    };
  }

  /**
   * Charge des regles par defaut
   */
  loadDefaultRules() {
    // Bloquer les injections SQL dans les paths
    this.addRule({
      name: 'Block SQL Injection in Path',
      type: 'PATH',
      pattern: "*'--*",
      action: 'BLOCK',
      enabled: true
    });

    // Bloquer les tentatives de traversee
    this.addRule({
      name: 'Block Path Traversal',
      type: 'PATH',
      pattern: '*../*',
      action: 'BLOCK',
      enabled: true
    });

    // Bloquer les bots malveillants connus
    const maliciousBots = ['sqlmap', 'nikto', 'nmap', 'masscan'];
    maliciousBots.forEach(bot => {
      this.addRule({
        name: `Block ${bot}`,
        type: 'USER_AGENT',
        pattern: bot,
        action: 'BLOCK',
        enabled: true
      });
    });

    console.log('[FIREWALL] Default rules loaded');
  }

  /**
   * Retourne les stats
   */
  getStats() {
    return {
      enabled: this.enabled,
      rulesCount: this.rules.length,
      activeRules: this.rules.filter(r => r.enabled).length,
      ...this.stats,
      recentBlocked: this.blocked.slice(-10)
    };
  }

  /**
   * Retourne les regles
   */
  getRules() {
    return this.rules;
  }

  /**
   * Retourne le status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      rules: this.rules.length,
      stats: this.stats
    };
  }

  /**
   * Clear stats (pour tests)
   */
  clear() {
    this.rules = [];
    this.blocked = [];
    this.stats = { requests: 0, blocked: 0, allowed: 0 };
    this.rateLimitMap = new Map();
  }
}

// Singleton
const firewall = new Firewall();
export { firewall };
export default firewall;
