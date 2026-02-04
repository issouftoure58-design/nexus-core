/**
 * SENTINEL - Security Shield
 *
 * Protection contre:
 * - Prompt injection
 * - Rate limiting abuse
 * - DDoS patterns
 * - Malicious IPs
 */

import { THRESHOLDS } from '../config/thresholds.js';

class SecurityShield {
  constructor() {
    this.blacklist = new Set();
    this.requestCounts = new Map();
    this.blockedRequests = [];

    // Prompt injection patterns
    this.dangerousPatterns = [
      /ignore previous instructions/i,
      /ignore all previous/i,
      /you are now/i,
      /disregard your training/i,
      /reveal your prompt/i,
      /show me your system prompt/i,
      /what are your instructions/i,
      /forget everything/i,
      /new instructions:/i,
      /override:/i,
      /sudo/i,
      /admin mode/i,
      /developer mode/i,
      /jailbreak/i,
      /DAN mode/i
    ];
  }

  analyze(request) {
    const result = {
      allowed: true,
      warnings: [],
      blocked: false,
      reason: null
    };

    // Check IP blacklist
    const ip = request.ip || request.headers?.['x-forwarded-for'] || 'unknown';
    if (this.blacklist.has(ip)) {
      result.allowed = false;
      result.blocked = true;
      result.reason = 'IP_BLACKLISTED';
      this.logBlocked(request, result.reason);
      return result;
    }

    // Check rate limits
    const rateCheck = this.checkRateLimit(ip);
    if (!rateCheck.allowed) {
      result.allowed = false;
      result.blocked = true;
      result.reason = rateCheck.reason;
      this.logBlocked(request, result.reason);

      // Auto-ban if too many violations
      if (rateCheck.violations > 10) {
        this.blacklist.add(ip);
        console.log(`[SENTINEL] IP blacklisted: ${ip}`);
      }

      return result;
    }

    // Check for prompt injection (if message content available)
    const message = request.body?.message || request.body?.content || '';
    const injectionCheck = this.checkPromptInjection(message);
    if (injectionCheck.detected) {
      result.warnings.push('PROMPT_INJECTION_ATTEMPT');
      result.allowed = false;
      result.blocked = true;
      result.reason = 'PROMPT_INJECTION';
      this.logBlocked(request, result.reason, { pattern: injectionCheck.pattern });
      return result;
    }

    return result;
  }

  checkRateLimit(ip) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(now / 3600000);
    const day = Math.floor(now / 86400000);

    const key = `${ip}`;

    if (!this.requestCounts.has(key)) {
      this.requestCounts.set(key, {
        minute: { count: 0, window: minute },
        hour: { count: 0, window: hour },
        day: { count: 0, window: day },
        violations: 0
      });
    }

    const counts = this.requestCounts.get(key);

    // Reset windows if needed
    if (counts.minute.window !== minute) {
      counts.minute = { count: 0, window: minute };
    }
    if (counts.hour.window !== hour) {
      counts.hour = { count: 0, window: hour };
    }
    if (counts.day.window !== day) {
      counts.day = { count: 0, window: day };
      counts.violations = 0; // Reset violations daily
    }

    // Increment counts
    counts.minute.count++;
    counts.hour.count++;
    counts.day.count++;

    // Check limits
    if (counts.minute.count > THRESHOLDS.rateLimit.perMinute) {
      counts.violations++;
      return { allowed: false, reason: 'RATE_LIMIT_MINUTE', violations: counts.violations };
    }
    if (counts.hour.count > THRESHOLDS.rateLimit.perHour) {
      counts.violations++;
      return { allowed: false, reason: 'RATE_LIMIT_HOUR', violations: counts.violations };
    }
    if (counts.day.count > THRESHOLDS.rateLimit.perDay) {
      counts.violations++;
      return { allowed: false, reason: 'RATE_LIMIT_DAY', violations: counts.violations };
    }

    return { allowed: true };
  }

  checkPromptInjection(message) {
    if (!message || typeof message !== 'string') {
      return { detected: false };
    }

    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(message)) {
        return {
          detected: true,
          pattern: pattern.toString()
        };
      }
    }

    return { detected: false };
  }

  logBlocked(request, reason, details = {}) {
    const log = {
      timestamp: new Date().toISOString(),
      ip: request.ip || request.headers?.['x-forwarded-for'] || 'unknown',
      path: request.path || request.url,
      method: request.method,
      reason,
      details
    };

    this.blockedRequests.push(log);
    console.log(`[SENTINEL] Blocked request: ${reason}`, log);

    // Keep only last 1000 blocked requests
    if (this.blockedRequests.length > 1000) {
      this.blockedRequests.shift();
    }
  }

  addToBlacklist(ip) {
    this.blacklist.add(ip);
    console.log(`[SENTINEL] Added to blacklist: ${ip}`);
  }

  removeFromBlacklist(ip) {
    this.blacklist.delete(ip);
    console.log(`[SENTINEL] Removed from blacklist: ${ip}`);
  }

  getBlacklist() {
    return Array.from(this.blacklist);
  }

  getBlockedRequests(limit = 50) {
    return this.blockedRequests.slice(-limit);
  }

  getStats() {
    return {
      blacklistSize: this.blacklist.size,
      blockedTotal: this.blockedRequests.length,
      activeTracking: this.requestCounts.size
    };
  }
}

export const securityShield = new SecurityShield();
export default securityShield;
