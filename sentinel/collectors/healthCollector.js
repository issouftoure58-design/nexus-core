/**
 * SENTINEL Health Collector
 * Verifie la sante des services NEXUS
 */

class HealthCollector {
  constructor() {
    const isDev = process.env.NODE_ENV === 'development';
    this.services = [
      { name: 'database', check: this.checkDatabase.bind(this), critical: true },
      { name: 'claude_api', check: this.checkClaudeAPI.bind(this), critical: true },
      { name: 'twilio', check: this.checkTwilio.bind(this), critical: false },
      { name: 'elevenlabs', check: this.checkElevenLabs.bind(this), critical: false },
      // Mémoire non-critique en dev (Vite/HMR consomme beaucoup)
      { name: 'memory', check: this.checkMemory.bind(this), critical: !isDev },
      { name: 'disk', check: this.checkDisk.bind(this), critical: false }
    ];
    this.healthStatus = {};
    this.lastCheck = null;
    this.checkHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Health check complet
   */
  async checkAll() {
    const results = {};
    const startTime = Date.now();
    let criticalDown = 0;
    let nonCriticalDown = 0;

    for (const service of this.services) {
      try {
        const serviceStart = Date.now();
        const checkResult = await service.check();

        results[service.name] = {
          status: checkResult.healthy ? 'healthy' : 'unhealthy',
          responseTime: Date.now() - serviceStart,
          lastCheck: new Date().toISOString(),
          details: checkResult.details || null,
          critical: service.critical
        };

        if (!checkResult.healthy) {
          if (service.critical) {
            criticalDown++;
          } else {
            nonCriticalDown++;
          }
        }
      } catch (error) {
        results[service.name] = {
          status: 'unhealthy',
          error: error.message,
          lastCheck: new Date().toISOString(),
          critical: service.critical
        };

        if (service.critical) {
          criticalDown++;
        } else {
          nonCriticalDown++;
        }
      }
    }

    this.healthStatus = results;
    this.lastCheck = new Date().toISOString();

    const overall = this.calculateOverallHealth(criticalDown, nonCriticalDown);

    const checkResult = {
      overall,
      services: results,
      totalResponseTime: Date.now() - startTime,
      timestamp: this.lastCheck,
      summary: {
        total: this.services.length,
        healthy: this.services.length - criticalDown - nonCriticalDown,
        unhealthy: criticalDown + nonCriticalDown,
        criticalDown,
        nonCriticalDown
      }
    };

    // Historique
    this.checkHistory.push(checkResult);
    if (this.checkHistory.length > this.maxHistorySize) {
      this.checkHistory.shift();
    }

    return checkResult;
  }

  /**
   * Check database
   */
  async checkDatabase() {
    try {
      // Import dynamique pour eviter erreurs au boot
      // Le fichier est .ts mais on importe sans extension (gere par le runtime)
      const { db } = await import('../../server/db.ts');

      const start = Date.now();
      await db.execute('SELECT 1');
      const responseTime = Date.now() - start;

      return {
        healthy: true,
        details: { responseTime, status: 'connected' }
      };
    } catch (error) {
      // Fallback: tenter import via supabase
      try {
        const { supabase } = await import('../../server/supabase.ts');
        const start = Date.now();
        const { error: dbError } = await supabase.from('services').select('id').limit(1);
        const responseTime = Date.now() - start;

        if (dbError) throw dbError;

        return {
          healthy: true,
          details: { responseTime, status: 'connected via supabase' }
        };
      } catch (fallbackError) {
        return {
          healthy: false,
          details: { error: fallbackError.message || error.message }
        };
      }
    }
  }

  /**
   * Check Claude API
   */
  async checkClaudeAPI() {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return {
        healthy: false,
        details: { error: 'ANTHROPIC_API_KEY not configured' }
      };
    }

    // Verifier que la cle a le bon format
    if (!apiKey.startsWith('sk-ant-')) {
      return {
        healthy: false,
        details: { error: 'Invalid API key format' }
      };
    }

    return {
      healthy: true,
      details: { status: 'configured' }
    };
  }

  /**
   * Check Twilio
   */
  async checkTwilio() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return {
        healthy: false,
        details: { error: 'Twilio credentials not configured' }
      };
    }

    return {
      healthy: true,
      details: { status: 'configured', accountSid: accountSid.substring(0, 8) + '...' }
    };
  }

  /**
   * Check ElevenLabs
   */
  async checkElevenLabs() {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return {
        healthy: false,
        details: { error: 'ElevenLabs API key not configured' }
      };
    }

    return {
      healthy: true,
      details: { status: 'configured' }
    };
  }

  /**
   * Check Memory
   */
  async checkMemory() {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const rssMB = Math.round(used.rss / 1024 / 1024);

    // Seuil: 90% de heap = unhealthy
    const heapPercent = (used.heapUsed / used.heapTotal) * 100;

    return {
      healthy: heapPercent < 90,
      details: {
        heapUsedMB,
        heapTotalMB,
        heapPercent: Math.round(heapPercent),
        rssMB
      }
    };
  }

  /**
   * Check Disk (simplifie)
   */
  async checkDisk() {
    // Retourne toujours healthy pour l'instant
    // TODO: Implementer vraie verification disque
    return {
      healthy: true,
      details: { status: 'not_implemented' }
    };
  }

  /**
   * Calcule la sante globale
   */
  calculateOverallHealth(criticalDown, nonCriticalDown) {
    if (criticalDown > 0) return 'critical';
    if (nonCriticalDown > 0) return 'degraded';
    return 'healthy';
  }

  /**
   * Retourne le statut actuel
   */
  getStatus() {
    return {
      status: this.healthStatus,
      lastCheck: this.lastCheck,
      overall: this.calculateOverallHealth(
        Object.values(this.healthStatus).filter(s => s.status === 'unhealthy' && s.critical).length,
        Object.values(this.healthStatus).filter(s => s.status === 'unhealthy' && !s.critical).length
      )
    };
  }

  /**
   * Retourne l'historique des checks
   */
  getHistory(limit = 50) {
    return this.checkHistory.slice(-limit);
  }

  /**
   * Verifie un service specifique
   */
  async checkService(serviceName) {
    const service = this.services.find(s => s.name === serviceName);
    if (!service) {
      return { error: `Service ${serviceName} not found` };
    }

    try {
      const start = Date.now();
      const result = await service.check();
      return {
        name: serviceName,
        status: result.healthy ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - start,
        details: result.details,
        critical: service.critical
      };
    } catch (error) {
      return {
        name: serviceName,
        status: 'unhealthy',
        error: error.message,
        critical: service.critical
      };
    }
  }
}

// Singleton
const healthCollector = new HealthCollector();
export { healthCollector };
export default healthCollector;
