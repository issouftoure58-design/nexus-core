/**
 * SENTINEL Self-Diagnostic - Intelligence Phase 5
 * Auto-diagnostic et verification de l'integrite systeme
 */

import auditTrail from '../reports/auditTrail.js';

class SelfDiagnostic {
  constructor() {
    this.lastDiagnostic = null;
    this.diagnosticHistory = [];
    this.maxHistorySize = 100;
    this.checks = [];

    this.stats = {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  /**
   * Enregistre un check de diagnostic
   */
  registerCheck(name, checkFn, options = {}) {
    this.checks.push({
      name,
      checkFn,
      category: options.category || 'general',
      critical: options.critical || false,
      timeout: options.timeout || 5000
    });
    console.log(`[SELF-DIAGNOSTIC] Registered check: ${name}`);
  }

  /**
   * Execute tous les diagnostics
   */
  async runDiagnostics() {
    console.log('[SELF-DIAGNOSTIC] Running diagnostics...');

    const startTime = Date.now();
    const results = {
      timestamp: new Date().toISOString(),
      checks: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      },
      duration: 0
    };

    // Executer les checks enregistres
    for (const check of this.checks) {
      const checkResult = await this.runSingleCheck(check);
      results.checks.push(checkResult);

      results.summary.total++;
      if (checkResult.status === 'PASS') results.summary.passed++;
      else if (checkResult.status === 'FAIL') results.summary.failed++;
      else if (checkResult.status === 'WARN') results.summary.warnings++;
    }

    // Ajouter les checks systeme par defaut
    const systemChecks = await this.runSystemChecks();
    results.checks.push(...systemChecks);

    systemChecks.forEach(check => {
      results.summary.total++;
      if (check.status === 'PASS') results.summary.passed++;
      else if (check.status === 'FAIL') results.summary.failed++;
      else if (check.status === 'WARN') results.summary.warnings++;
    });

    results.duration = Date.now() - startTime;
    results.healthScore = this.calculateHealthScore(results.summary);

    // Sauvegarder
    this.lastDiagnostic = results;
    this.diagnosticHistory.push(results);
    if (this.diagnosticHistory.length > this.maxHistorySize) {
      this.diagnosticHistory.shift();
    }

    // Mettre a jour les stats
    this.stats.total++;
    this.stats.passed += results.summary.passed;
    this.stats.failed += results.summary.failed;
    this.stats.warnings += results.summary.warnings;

    // Log audit
    auditTrail.logAction({
      type: 'DIAGNOSTIC_RUN',
      details: {
        healthScore: results.healthScore,
        summary: results.summary,
        duration: results.duration
      }
    });

    console.log(`[SELF-DIAGNOSTIC] Complete - Score: ${results.healthScore}/100`);
    return results;
  }

  /**
   * Execute un seul check avec timeout
   */
  async runSingleCheck(check) {
    const result = {
      name: check.name,
      category: check.category,
      critical: check.critical,
      status: 'PASS',
      message: '',
      duration: 0,
      timestamp: new Date().toISOString()
    };

    const startTime = Date.now();

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), check.timeout);
      });

      const checkPromise = check.checkFn();
      const checkResult = await Promise.race([checkPromise, timeoutPromise]);

      result.status = checkResult.status || 'PASS';
      result.message = checkResult.message || 'OK';
      result.data = checkResult.data;

    } catch (error) {
      result.status = 'FAIL';
      result.message = error.message;
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Checks systeme par defaut
   */
  async runSystemChecks() {
    const checks = [];

    // Check memoire
    checks.push(this.checkMemory());

    // Check event loop
    checks.push(await this.checkEventLoop());

    // Check variables environnement critiques
    checks.push(this.checkEnvironment());

    // Check process uptime
    checks.push(this.checkUptime());

    return checks;
  }

  /**
   * Check memoire
   */
  checkMemory() {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const ratio = heapUsedMB / heapTotalMB;

    let status = 'PASS';
    let message = `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB`;

    if (ratio > 0.9) {
      status = 'FAIL';
      message = `Memory critical: ${Math.round(ratio * 100)}% used`;
    } else if (ratio > 0.7) {
      status = 'WARN';
      message = `Memory warning: ${Math.round(ratio * 100)}% used`;
    }

    return {
      name: 'Memory Usage',
      category: 'system',
      critical: true,
      status,
      message,
      data: {
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        external: Math.round(usage.external / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024)
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check event loop lag
   */
  async checkEventLoop() {
    return new Promise(resolve => {
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;

        let status = 'PASS';
        let message = `Event loop lag: ${lag}ms`;

        if (lag > 100) {
          status = 'FAIL';
          message = `Event loop blocked: ${lag}ms`;
        } else if (lag > 50) {
          status = 'WARN';
          message = `Event loop slow: ${lag}ms`;
        }

        resolve({
          name: 'Event Loop',
          category: 'system',
          critical: true,
          status,
          message,
          data: { lag },
          timestamp: new Date().toISOString()
        });
      });
    });
  }

  /**
   * Check variables environnement
   */
  checkEnvironment() {
    const required = ['DATABASE_URL', 'ANTHROPIC_API_KEY'];
    const missing = required.filter(key => !process.env[key]);

    let status = 'PASS';
    let message = 'All required env vars present';

    if (missing.length > 0) {
      status = 'WARN';
      message = `Missing env vars: ${missing.join(', ')}`;
    }

    return {
      name: 'Environment',
      category: 'config',
      critical: false,
      status,
      message,
      data: { missing },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check uptime
   */
  checkUptime() {
    const uptimeSeconds = process.uptime();
    const uptimeHours = uptimeSeconds / 3600;

    let status = 'PASS';
    let message = `Uptime: ${Math.round(uptimeHours * 10) / 10}h`;

    // Alerter si uptime tres long (possible memory leak)
    if (uptimeHours > 168) { // 7 jours
      status = 'WARN';
      message = `Long uptime: ${Math.round(uptimeHours)}h - Consider restart`;
    }

    return {
      name: 'Process Uptime',
      category: 'system',
      critical: false,
      status,
      message,
      data: { uptimeSeconds: Math.round(uptimeSeconds) },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calcule le score de sante
   */
  calculateHealthScore(summary) {
    if (summary.total === 0) return 100;

    const passRate = summary.passed / summary.total;
    const warnPenalty = (summary.warnings / summary.total) * 0.2;
    const failPenalty = (summary.failed / summary.total) * 0.8;

    return Math.max(0, Math.round((passRate - warnPenalty - failPenalty) * 100));
  }

  /**
   * Retourne le dernier diagnostic
   */
  getLastDiagnostic() {
    return this.lastDiagnostic;
  }

  /**
   * Retourne l'historique
   */
  getHistory(limit = 10) {
    return this.diagnosticHistory.slice(-limit);
  }

  /**
   * Retourne les stats
   */
  getStats() {
    return {
      ...this.stats,
      checksRegistered: this.checks.length,
      lastRun: this.lastDiagnostic?.timestamp
    };
  }

  /**
   * Retourne le status
   */
  getStatus() {
    return {
      lastDiagnostic: this.lastDiagnostic?.timestamp,
      lastHealthScore: this.lastDiagnostic?.healthScore,
      checksRegistered: this.checks.length,
      historySize: this.diagnosticHistory.length
    };
  }

  /**
   * Clear (pour tests)
   */
  clear() {
    this.lastDiagnostic = null;
    this.diagnosticHistory = [];
    this.stats = { total: 0, passed: 0, failed: 0, warnings: 0 };
  }
}

// Singleton
const selfDiagnostic = new SelfDiagnostic();
export { selfDiagnostic };
export default selfDiagnostic;
