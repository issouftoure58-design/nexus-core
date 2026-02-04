/**
 * SENTINEL Tech Watch - Intelligence Phase 5
 * Veille technologique et detection de vulnerabilites
 */

import auditTrail from '../reports/auditTrail.js';

class TechWatch {
  constructor() {
    this.dependencies = new Map();
    this.vulnerabilities = [];
    this.lastCheck = null;
    this.checkInterval = null;

    this.stats = {
      checksPerformed: 0,
      vulnerabilitiesFound: 0,
      dependenciesTracked: 0
    };
  }

  /**
   * Demarre la veille automatique
   */
  start(intervalMs = 24 * 60 * 60 * 1000) { // Par defaut: 1 jour
    if (this.checkInterval) {
      return { success: false, reason: 'Already running' };
    }

    console.log('[TECH-WATCH] Starting...');

    // Premier check immediat
    this.checkDependencies();

    // Checks periodiques
    this.checkInterval = setInterval(() => {
      this.checkDependencies();
    }, intervalMs);

    auditTrail.logAction({
      type: 'TECH_WATCH_STARTED',
      details: { intervalMs }
    });

    return { success: true };
  }

  /**
   * Arrete la veille
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    auditTrail.logAction({
      type: 'TECH_WATCH_STOPPED',
      details: {}
    });

    console.log('[TECH-WATCH] Stopped');
    return { success: true };
  }

  /**
   * Enregistre les dependances du projet
   */
  registerDependencies(packageJson) {
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    for (const [name, version] of Object.entries(deps)) {
      this.dependencies.set(name, {
        name,
        version: version.replace(/[\^~]/, ''),
        type: packageJson.dependencies?.[name] ? 'prod' : 'dev',
        addedAt: new Date().toISOString()
      });
    }

    this.stats.dependenciesTracked = this.dependencies.size;
    console.log(`[TECH-WATCH] Registered ${this.dependencies.size} dependencies`);

    return { success: true, count: this.dependencies.size };
  }

  /**
   * Verifie les dependances
   */
  async checkDependencies() {
    console.log('[TECH-WATCH] Checking dependencies...');
    this.stats.checksPerformed++;
    this.lastCheck = new Date().toISOString();

    const results = {
      timestamp: this.lastCheck,
      checked: 0,
      vulnerabilities: [],
      outdated: []
    };

    // Simuler la verification des dependances
    // Dans un vrai scenario, on interrogerait une API comme npm audit
    for (const [name, dep] of this.dependencies) {
      results.checked++;

      // Verifier les patterns de vulnerabilites connues
      const vulns = this.checkKnownVulnerabilities(name, dep.version);
      if (vulns.length > 0) {
        results.vulnerabilities.push(...vulns);
        this.vulnerabilities.push(...vulns);
      }
    }

    // Limiter l'historique des vulnerabilites
    if (this.vulnerabilities.length > 100) {
      this.vulnerabilities = this.vulnerabilities.slice(-100);
    }

    this.stats.vulnerabilitiesFound += results.vulnerabilities.length;

    if (results.vulnerabilities.length > 0) {
      auditTrail.logAction({
        type: 'VULNERABILITIES_FOUND',
        details: {
          count: results.vulnerabilities.length,
          packages: results.vulnerabilities.map(v => v.package)
        }
      });
    }

    console.log(`[TECH-WATCH] Check complete - ${results.vulnerabilities.length} vulnerabilities found`);
    return results;
  }

  /**
   * Verifie les vulnerabilites connues
   */
  checkKnownVulnerabilities(packageName, version) {
    const vulns = [];

    // Base de donnees simplifiee de vulnerabilites connues
    // Dans un vrai scenario, on utiliserait une API comme Snyk ou npm audit
    const knownVulns = {
      'lodash': {
        affected: ['< 4.17.21'],
        severity: 'HIGH',
        cve: 'CVE-2021-23337',
        description: 'Prototype Pollution'
      },
      'axios': {
        affected: ['< 0.21.1'],
        severity: 'MEDIUM',
        cve: 'CVE-2020-28168',
        description: 'Server-Side Request Forgery'
      },
      'express': {
        affected: ['< 4.17.3'],
        severity: 'MEDIUM',
        cve: 'CVE-2022-24999',
        description: 'Open Redirect'
      },
      'jsonwebtoken': {
        affected: ['< 9.0.0'],
        severity: 'HIGH',
        cve: 'CVE-2022-23529',
        description: 'JWT Algorithm Confusion'
      }
    };

    const vuln = knownVulns[packageName];
    if (vuln) {
      // Simplification: on considere vulnerable si version ancienne
      // Une vraie implementation comparerait les versions semantiques
      const currentMajor = parseInt(version.split('.')[0]);
      const affectedVersion = vuln.affected[0].replace(/[<>=\s]/g, '');
      const affectedMajor = parseInt(affectedVersion.split('.')[0]);

      if (currentMajor <= affectedMajor) {
        vulns.push({
          package: packageName,
          version,
          severity: vuln.severity,
          cve: vuln.cve,
          description: vuln.description,
          detectedAt: new Date().toISOString()
        });
      }
    }

    return vulns;
  }

  /**
   * Ajoute une alerte de vulnerabilite manuelle
   */
  addVulnerability(vulnerability) {
    const vuln = {
      ...vulnerability,
      addedAt: new Date().toISOString(),
      manual: true
    };

    this.vulnerabilities.push(vuln);
    this.stats.vulnerabilitiesFound++;

    auditTrail.logAction({
      type: 'VULNERABILITY_ADDED',
      details: vuln
    });

    return { success: true, vulnerability: vuln };
  }

  /**
   * Marque une vulnerabilite comme resolue
   */
  resolveVulnerability(cve) {
    const index = this.vulnerabilities.findIndex(v => v.cve === cve);
    if (index === -1) {
      return { success: false, error: 'Vulnerability not found' };
    }

    const resolved = this.vulnerabilities.splice(index, 1)[0];
    resolved.resolvedAt = new Date().toISOString();

    auditTrail.logAction({
      type: 'VULNERABILITY_RESOLVED',
      details: { cve, package: resolved.package }
    });

    return { success: true, resolved };
  }

  /**
   * Genere un rapport de securite
   */
  generateReport() {
    const bySeverity = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: []
    };

    for (const vuln of this.vulnerabilities) {
      const severity = vuln.severity || 'MEDIUM';
      if (bySeverity[severity]) {
        bySeverity[severity].push(vuln);
      }
    }

    return {
      timestamp: new Date().toISOString(),
      lastCheck: this.lastCheck,
      dependenciesTracked: this.dependencies.size,
      vulnerabilities: {
        total: this.vulnerabilities.length,
        bySeverity,
        list: this.vulnerabilities
      },
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Genere des recommandations
   */
  generateRecommendations() {
    const recs = [];

    const criticalCount = this.vulnerabilities.filter(v => v.severity === 'CRITICAL').length;
    const highCount = this.vulnerabilities.filter(v => v.severity === 'HIGH').length;

    if (criticalCount > 0) {
      recs.push({
        priority: 'URGENT',
        message: `${criticalCount} vulnerabilite(s) critique(s) - Mise a jour immediate requise`
      });
    }

    if (highCount > 0) {
      recs.push({
        priority: 'HIGH',
        message: `${highCount} vulnerabilite(s) haute priorite - Planifier mise a jour`
      });
    }

    if (this.vulnerabilities.length === 0) {
      recs.push({
        priority: 'INFO',
        message: 'Aucune vulnerabilite connue detectee'
      });
    }

    return recs;
  }

  /**
   * Retourne les vulnerabilites
   */
  getVulnerabilities(options = {}) {
    let vulns = [...this.vulnerabilities];

    if (options.severity) {
      vulns = vulns.filter(v => v.severity === options.severity);
    }

    if (options.package) {
      vulns = vulns.filter(v => v.package === options.package);
    }

    return vulns;
  }

  /**
   * Retourne les stats
   */
  getStats() {
    return {
      ...this.stats,
      activeVulnerabilities: this.vulnerabilities.length,
      lastCheck: this.lastCheck,
      isRunning: this.checkInterval !== null
    };
  }

  /**
   * Retourne le status
   */
  getStatus() {
    return {
      running: this.checkInterval !== null,
      lastCheck: this.lastCheck,
      dependencies: this.dependencies.size,
      vulnerabilities: this.vulnerabilities.length
    };
  }

  /**
   * Clear (pour tests)
   */
  clear() {
    this.dependencies.clear();
    this.vulnerabilities = [];
    this.lastCheck = null;
    this.stats = { checksPerformed: 0, vulnerabilitiesFound: 0, dependenciesTracked: 0 };
  }
}

// Singleton
const techWatch = new TechWatch();
export { techWatch };
export default techWatch;
