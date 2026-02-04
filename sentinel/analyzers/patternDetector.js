/**
 * SENTINEL Pattern Detector
 * Detecte les patterns suspects (injection, brute force, etc.)
 */

import errorCollector from '../collectors/errorCollector.js';

class PatternDetector {
  constructor() {
    this.suspiciousPatterns = [];
    this.maxPatterns = 100;

    // Buffer pour tracker les requetes suspectes
    this.requestBuffer = [];
    this.maxBufferSize = 5000;

    // Patterns de detection
    this.sqlInjectionPatterns = [
      /'\s*or\s+['"]?1['"]?\s*=\s*['"]?1/i,
      /union\s+select/i,
      /drop\s+table/i,
      /;\s*--/,
      /xp_cmdshell/i,
      /%27/,
      /'\s*or\s+'.*'\s*=\s*'/i
    ];

    this.xssPatterns = [
      /<script/i,
      /javascript:/i,
      /onerror\s*=/i,
      /onload\s*=/i,
      /<iframe/i,
      /eval\s*\(/i,
      /document\.cookie/i
    ];

    this.pathTraversalPatterns = [
      /\.\.\//,
      /\.\.\\/,
      /%2e%2e%2f/i,
      /%2e%2e\//i
    ];
  }

  /**
   * Enregistre une requete pour analyse
   */
  recordRequest(request) {
    const entry = {
      timestamp: Date.now(),
      ip: request.ip || 'unknown',
      path: request.path || '/',
      method: request.method || 'GET',
      query: request.query || {},
      body: this.sanitizeBody(request.body),
      headers: {
        userAgent: request.headers?.['user-agent'] || '',
        contentType: request.headers?.['content-type'] || ''
      },
      tenantId: request.tenantId || null,
      userId: request.userId || null
    };

    this.requestBuffer.push(entry);
    if (this.requestBuffer.length > this.maxBufferSize) {
      this.requestBuffer.shift();
    }

    // Analyse en temps reel
    this.analyzeRequest(entry);
  }

  /**
   * Sanitize body pour eviter de stocker des donnees sensibles
   */
  sanitizeBody(body) {
    if (!body) return null;

    // Ne garder que les cles, pas les valeurs sensibles
    const sanitized = {};
    Object.keys(body).forEach(key => {
      if (['password', 'token', 'secret', 'apiKey', 'api_key'].includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof body[key] === 'string' && body[key].length > 200) {
        sanitized[key] = body[key].substring(0, 200) + '...';
      } else {
        sanitized[key] = body[key];
      }
    });

    return sanitized;
  }

  /**
   * Analyse une requete en temps reel
   */
  analyzeRequest(request) {
    const content = JSON.stringify({
      path: request.path,
      query: request.query,
      body: request.body
    });

    // SQL Injection
    for (const pattern of this.sqlInjectionPatterns) {
      if (pattern.test(content)) {
        this.addPattern({
          type: 'SQL_INJECTION_ATTEMPT',
          severity: 'CRITICAL',
          timestamp: new Date().toISOString(),
          details: {
            ip: request.ip,
            path: request.path,
            pattern: pattern.toString(),
            tenantId: request.tenantId
          },
          message: `SQL injection attempt detected from ${request.ip}`
        });
        return; // Une seule alerte par requete
      }
    }

    // XSS
    for (const pattern of this.xssPatterns) {
      if (pattern.test(content)) {
        this.addPattern({
          type: 'XSS_ATTEMPT',
          severity: 'HIGH',
          timestamp: new Date().toISOString(),
          details: {
            ip: request.ip,
            path: request.path,
            pattern: pattern.toString(),
            tenantId: request.tenantId
          },
          message: `XSS attempt detected from ${request.ip}`
        });
        return;
      }
    }

    // Path Traversal
    for (const pattern of this.pathTraversalPatterns) {
      if (pattern.test(content)) {
        this.addPattern({
          type: 'PATH_TRAVERSAL_ATTEMPT',
          severity: 'HIGH',
          timestamp: new Date().toISOString(),
          details: {
            ip: request.ip,
            path: request.path,
            pattern: pattern.toString(),
            tenantId: request.tenantId
          },
          message: `Path traversal attempt detected from ${request.ip}`
        });
        return;
      }
    }
  }

  /**
   * Detecte les patterns suspects sur une periode
   */
  async detectSuspiciousPatterns(timeWindowMinutes = 60) {
    try {
      const patterns = [];
      const since = Date.now() - timeWindowMinutes * 60 * 1000;

      // 1. Brute force authentication
      const bruteForce = this.detectBruteForce(since);
      if (bruteForce.length > 0) patterns.push(...bruteForce);

      // 2. API abuse (requetes excessives par IP)
      const apiAbuse = this.detectAPIAbuse(since);
      if (apiAbuse.length > 0) patterns.push(...apiAbuse);

      // 3. Analyser les erreurs pour patterns suspects
      const errorPatterns = this.detectSuspiciousErrors(timeWindowMinutes);
      if (errorPatterns.length > 0) patterns.push(...errorPatterns);

      // Sauvegarder
      patterns.forEach(p => this.addPattern(p));

      if (patterns.length > 0) {
        console.log(`[PATTERN] ${patterns.length} pattern(s) suspect(s) detecte(s)`);
      }

      return patterns;

    } catch (error) {
      console.error('[PATTERN] Detection failed:', error.message);
      return [];
    }
  }

  /**
   * Detecte brute force authentication
   */
  detectBruteForce(since) {
    // Filtrer les requetes auth recentes
    const authRequests = this.requestBuffer.filter(r =>
      r.timestamp >= since &&
      (r.path.includes('login') || r.path.includes('auth'))
    );

    // Grouper par IP
    const byIP = {};
    authRequests.forEach(r => {
      if (!byIP[r.ip]) {
        byIP[r.ip] = { count: 0, attempts: [] };
      }
      byIP[r.ip].count++;
      byIP[r.ip].attempts.push(r.timestamp);
    });

    const patterns = [];

    // >10 tentatives en periode = brute force probable
    Object.entries(byIP).forEach(([ip, data]) => {
      if (data.count > 10) {
        patterns.push({
          type: 'BRUTE_FORCE_AUTH',
          severity: 'HIGH',
          timestamp: new Date().toISOString(),
          details: {
            ip,
            attempts: data.count,
            firstAttempt: new Date(data.attempts[0]).toISOString(),
            lastAttempt: new Date(data.attempts[data.attempts.length - 1]).toISOString()
          },
          message: `Brute force detected: ${data.count} auth attempts from ${ip}`
        });
      }
    });

    return patterns;
  }

  /**
   * Detecte API abuse
   */
  detectAPIAbuse(since) {
    const recentRequests = this.requestBuffer.filter(r => r.timestamp >= since);

    // Grouper par IP
    const byIP = {};
    recentRequests.forEach(r => {
      if (!byIP[r.ip]) {
        byIP[r.ip] = { count: 0, paths: new Set() };
      }
      byIP[r.ip].count++;
      byIP[r.ip].paths.add(r.path);
    });

    const patterns = [];
    const timeWindowMinutes = (Date.now() - since) / 60000;

    // >500 requetes par heure par IP = abuse
    Object.entries(byIP).forEach(([ip, data]) => {
      const requestsPerHour = (data.count / timeWindowMinutes) * 60;
      if (requestsPerHour > 500) {
        patterns.push({
          type: 'API_ABUSE',
          severity: 'MEDIUM',
          timestamp: new Date().toISOString(),
          details: {
            ip,
            requests: data.count,
            requestsPerHour: requestsPerHour.toFixed(0),
            uniquePaths: data.paths.size
          },
          message: `API abuse detected: ${requestsPerHour.toFixed(0)} req/hour from ${ip}`
        });
      }
    });

    return patterns;
  }

  /**
   * Detecte patterns suspects dans les erreurs
   */
  detectSuspiciousErrors(timeWindowMinutes) {
    const since = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const errors = errorCollector.getRecentErrors({ since: since.toISOString() });

    const patterns = [];

    // Chercher des erreurs qui ressemblent a des attaques
    const suspiciousKeywords = [
      'injection', 'unauthorized', 'forbidden', 'malformed',
      'invalid token', 'access denied', 'permission denied'
    ];

    const suspiciousErrors = errors.filter(e => {
      const msg = e.message.toLowerCase();
      return suspiciousKeywords.some(kw => msg.includes(kw));
    });

    if (suspiciousErrors.length > 5) {
      // Grouper par IP
      const byIP = {};
      suspiciousErrors.forEach(e => {
        const ip = e.context.ip || 'unknown';
        if (!byIP[ip]) {
          byIP[ip] = [];
        }
        byIP[ip].push(e);
      });

      Object.entries(byIP).forEach(([ip, errs]) => {
        if (errs.length > 3) {
          patterns.push({
            type: 'SUSPICIOUS_ERROR_PATTERN',
            severity: 'MEDIUM',
            timestamp: new Date().toISOString(),
            details: {
              ip,
              errorCount: errs.length,
              errorTypes: [...new Set(errs.map(e => e.message.substring(0, 50)))].slice(0, 5)
            },
            message: `Suspicious errors from ${ip}: ${errs.length} security-related errors`
          });
        }
      });
    }

    return patterns;
  }

  /**
   * Ajoute un pattern suspect
   */
  addPattern(pattern) {
    // Eviter les doublons recents (meme type + IP dans les 5 dernieres minutes)
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const isDuplicate = this.suspiciousPatterns.some(p =>
      p.type === pattern.type &&
      p.details?.ip === pattern.details?.ip &&
      new Date(p.timestamp).getTime() > fiveMinAgo
    );

    if (!isDuplicate) {
      this.suspiciousPatterns.push(pattern);
      if (this.suspiciousPatterns.length > this.maxPatterns) {
        this.suspiciousPatterns.shift();
      }
    }
  }

  /**
   * Recupere les patterns suspects
   */
  getPatterns(options = {}) {
    const { severity = null, type = null, limit = 50 } = options;

    let filtered = [...this.suspiciousPatterns];

    if (severity) {
      filtered = filtered.filter(p => p.severity === severity);
    }

    if (type) {
      filtered = filtered.filter(p => p.type === type);
    }

    return filtered.slice(-limit);
  }

  /**
   * Stats patterns
   */
  getStats() {
    const total = this.suspiciousPatterns.length;

    const byType = {};
    const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

    this.suspiciousPatterns.forEach(p => {
      byType[p.type] = (byType[p.type] || 0) + 1;
      bySeverity[p.severity]++;
    });

    return {
      total,
      byType,
      bySeverity,
      requestBufferSize: this.requestBuffer.length,
      lastDetected: total > 0
        ? this.suspiciousPatterns[total - 1].timestamp
        : null
    };
  }

  /**
   * Clear patterns (pour tests)
   */
  clear() {
    this.suspiciousPatterns = [];
    this.requestBuffer = [];
  }
}

// Singleton
const patternDetector = new PatternDetector();
export { patternDetector };
export default patternDetector;
