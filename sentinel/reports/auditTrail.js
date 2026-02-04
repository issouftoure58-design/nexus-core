/**
 * SENTINEL Audit Trail
 * Tracabilite complete des actions critiques
 */

class AuditTrail {
  constructor() {
    this.auditLog = [];
    this.maxLogSize = 10000;

    // Types d'actions critiques a tracker
    this.criticalActions = [
      'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
      'PASSWORD_CHANGE', 'PERMISSION_CHANGE',
      'DATA_CREATE', 'DATA_UPDATE', 'DATA_DELETE',
      'CONFIG_CHANGE', 'API_KEY_GENERATE', 'API_KEY_REVOKE',
      'TENANT_CREATE', 'TENANT_UPDATE', 'TENANT_DELETE',
      'ADMIN_ACTION', 'SECURITY_ALERT',
      'ANOMALY_DETECTED', 'REPAIR_EXECUTED', 'PATTERN_DETECTED'
    ];
  }

  /**
   * Log une action
   */
  logAction(action, context = {}) {
    const entry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      action: action.type || action,
      details: action.details || {},
      actor: context.userId || context.ip || context.actor || 'system',
      actorType: context.actorType || (context.userId ? 'user' : 'system'),
      tenantId: context.tenantId || null,
      ip: context.ip || null,
      userAgent: context.userAgent || null,
      sessionId: context.sessionId || null,
      metadata: {
        ...action.metadata,
        source: context.source || 'api'
      }
    };

    this.auditLog.push(entry);

    // Rotation si trop de logs
    if (this.auditLog.length > this.maxLogSize) {
      this.auditLog.shift();
    }

    // Log critique en console
    if (this.isCriticalAction(entry.action)) {
      console.log(`[AUDIT] ${entry.action} by ${entry.actor} at ${entry.timestamp}`);
    }

    return entry;
  }

  /**
   * Genere un ID unique
   */
  generateId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Verifie si une action est critique
   */
  isCriticalAction(actionType) {
    return this.criticalActions.some(ca =>
      actionType.toUpperCase().includes(ca) || ca.includes(actionType.toUpperCase())
    );
  }

  /**
   * Recupere l'audit trail
   */
  getTrail(options = {}) {
    const {
      tenantId = null,
      userId = null,
      actionType = null,
      actorType = null,
      since = null,
      until = null,
      limit = 100,
      offset = 0
    } = options;

    let filtered = [...this.auditLog];

    if (tenantId) {
      filtered = filtered.filter(l => l.tenantId === tenantId);
    }

    if (userId) {
      filtered = filtered.filter(l => l.actor === userId);
    }

    if (actionType) {
      filtered = filtered.filter(l =>
        l.action.toUpperCase().includes(actionType.toUpperCase())
      );
    }

    if (actorType) {
      filtered = filtered.filter(l => l.actorType === actorType);
    }

    if (since) {
      const sinceTime = new Date(since).getTime();
      filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= sinceTime);
    }

    if (until) {
      const untilTime = new Date(until).getTime();
      filtered = filtered.filter(l => new Date(l.timestamp).getTime() <= untilTime);
    }

    // Trier par date decroissante
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Pagination
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Genere un rapport d'audit
   */
  generateReport(hoursBack = 24) {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const trail = this.getTrail({ since: since.toISOString(), limit: 10000 });

    // Stats par action
    const byAction = {};
    const byActor = {};
    const byTenant = {};
    const byHour = {};

    trail.forEach(entry => {
      // Par action
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;

      // Par actor
      byActor[entry.actor] = (byActor[entry.actor] || 0) + 1;

      // Par tenant
      const tenant = entry.tenantId || 'system';
      byTenant[tenant] = (byTenant[tenant] || 0) + 1;

      // Par heure
      const hour = entry.timestamp.slice(0, 13); // YYYY-MM-DDTHH
      byHour[hour] = (byHour[hour] || 0) + 1;
    });

    // Top actions
    const topActions = Object.entries(byAction)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    // Top actors
    const topActors = Object.entries(byActor)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([actor, count]) => ({ actor, count }));

    // Actions critiques
    const criticalActions = trail.filter(e => this.isCriticalAction(e.action));

    return {
      period: {
        start: since.toISOString(),
        end: new Date().toISOString(),
        hours: hoursBack
      },
      summary: {
        totalActions: trail.length,
        uniqueActors: Object.keys(byActor).length,
        uniqueTenants: Object.keys(byTenant).length,
        criticalActions: criticalActions.length
      },
      breakdown: {
        byAction,
        byActor,
        byTenant,
        byHour
      },
      topActions,
      topActors,
      recentCriticalActions: criticalActions.slice(0, 10),
      recentActions: trail.slice(0, 10)
    };
  }

  /**
   * Recherche dans l'audit trail
   */
  search(query, options = {}) {
    const { limit = 50 } = options;
    const searchLower = query.toLowerCase();

    return this.auditLog
      .filter(entry => {
        const searchableText = [
          entry.action,
          entry.actor,
          JSON.stringify(entry.details)
        ].join(' ').toLowerCase();

        return searchableText.includes(searchLower);
      })
      .slice(-limit);
  }

  /**
   * Exporte l'audit trail en JSON
   */
  export(options = {}) {
    const trail = this.getTrail(options);
    return {
      exportedAt: new Date().toISOString(),
      count: trail.length,
      entries: trail
    };
  }

  /**
   * Stats de l'audit trail
   */
  getStats() {
    const now = Date.now();
    const last24h = this.auditLog.filter(e =>
      new Date(e.timestamp).getTime() > now - 24 * 60 * 60 * 1000
    ).length;

    const lastHour = this.auditLog.filter(e =>
      new Date(e.timestamp).getTime() > now - 60 * 60 * 1000
    ).length;

    const criticalCount = this.auditLog.filter(e =>
      this.isCriticalAction(e.action)
    ).length;

    return {
      total: this.auditLog.length,
      last24h,
      lastHour,
      criticalCount,
      maxSize: this.maxLogSize,
      oldestEntry: this.auditLog[0]?.timestamp || null,
      newestEntry: this.auditLog[this.auditLog.length - 1]?.timestamp || null
    };
  }

  /**
   * Clear l'audit trail (pour tests)
   */
  clear() {
    this.auditLog = [];
  }
}

// Singleton
const auditTrail = new AuditTrail();
export { auditTrail };
export default auditTrail;
