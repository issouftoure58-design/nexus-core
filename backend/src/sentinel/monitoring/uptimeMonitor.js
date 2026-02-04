/**
 * SENTINEL Uptime Monitor
 * Surveillance de la disponibilite des services
 */

import { supabase } from '../../config/supabase.js';

// Services a surveiller
const SERVICES = {
  database: {
    name: 'Database (Supabase)',
    critical: true,
    check: async () => {
      const start = Date.now();
      try {
        const { error } = await supabase.from('sentinel_usage').select('id').limit(1);
        const latency = Date.now() - start;
        if (error) throw error;
        return { status: 'up', latency };
      } catch (err) {
        return { status: 'down', error: err.message, latency: Date.now() - start };
      }
    },
  },
  api: {
    name: 'API Server',
    critical: true,
    check: async () => {
      return { status: 'up', latency: 0 };
    },
  },
  claude: {
    name: 'Claude API',
    critical: true,
    check: async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        return { status: 'degraded', error: 'API key not configured' };
      }
      return { status: 'up', latency: 0 };
    },
  },
  twilio: {
    name: 'Twilio (SMS/Voice)',
    critical: false,
    check: async () => {
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        return { status: 'degraded', error: 'Credentials not configured' };
      }
      return { status: 'up', latency: 0 };
    },
  },
  elevenlabs: {
    name: 'ElevenLabs (Voice)',
    critical: false,
    check: async () => {
      if (!process.env.ELEVENLABS_API_KEY) {
        return { status: 'degraded', error: 'API key not configured' };
      }
      return { status: 'up', latency: 0 };
    },
  },
  whatsapp: {
    name: 'WhatsApp Business',
    critical: false,
    check: async () => {
      if (!process.env.WHATSAPP_TOKEN) {
        return { status: 'degraded', error: 'Token not configured' };
      }
      return { status: 'up', latency: 0 };
    },
  },
};

// Etat actuel
let serviceStatus = {};
let lastCheck = null;
let consecutiveFailures = {};

// Executer tous les health checks
export async function checkAllServices() {
  const results = {};
  let allUp = true;
  let criticalDown = false;

  for (const [serviceId, service] of Object.entries(SERVICES)) {
    try {
      const result = await service.check();
      results[serviceId] = {
        name: service.name,
        critical: service.critical,
        ...result,
        checkedAt: new Date().toISOString(),
      };

      if (result.status !== 'up') {
        allUp = false;
        if (service.critical) criticalDown = true;
        consecutiveFailures[serviceId] = (consecutiveFailures[serviceId] || 0) + 1;
      } else {
        consecutiveFailures[serviceId] = 0;
      }
    } catch (err) {
      results[serviceId] = {
        name: service.name,
        critical: service.critical,
        status: 'error',
        error: err.message,
        checkedAt: new Date().toISOString(),
      };
      allUp = false;
      if (service.critical) criticalDown = true;
      consecutiveFailures[serviceId] = (consecutiveFailures[serviceId] || 0) + 1;
    }
  }

  serviceStatus = results;
  lastCheck = new Date().toISOString();

  // Alerter si service critique down (apres 2 echecs consecutifs)
  for (const [serviceId, failures] of Object.entries(consecutiveFailures)) {
    if (failures >= 2 && SERVICES[serviceId]?.critical) {
      await triggerAlert(serviceId, results[serviceId]);
    }
  }

  return {
    status: criticalDown ? 'critical' : allUp ? 'healthy' : 'degraded',
    services: results,
    checkedAt: lastCheck,
  };
}

// Declencher une alerte
async function triggerAlert(serviceId, status) {
  console.log(`[SENTINEL ALERT] Service DOWN: ${serviceId}`, status);

  try {
    const { logSecurityEvent, SEVERITY } = await import('../security/securityLogger.js');
    await logSecurityEvent({
      type: 'service_down',
      severity: SEVERITY.CRITICAL,
      details: {
        service: serviceId,
        serviceName: status.name,
        error: status.error,
        consecutiveFailures: consecutiveFailures[serviceId],
      },
    });
  } catch (_) { /* non-blocking */ }
}

// Obtenir le status actuel (sans re-checker)
export function getStatus() {
  const criticalDown = Object.entries(serviceStatus).some(
    ([id, s]) => SERVICES[id]?.critical && s.status !== 'up'
  );
  const allUp = Object.values(serviceStatus).every((s) => s.status === 'up');

  return {
    status: criticalDown ? 'critical' : allUp ? 'healthy' : 'degraded',
    services: serviceStatus,
    lastCheck,
    uptime: process.uptime(),
  };
}

// Health check simple pour load balancers
export function getSimpleHealth() {
  const status = getStatus();
  return {
    status: status.status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  };
}

// Scheduler
let monitorInterval = null;

export function startMonitoring(intervalSeconds = 60) {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }

  console.log(`[SENTINEL] Uptime monitoring started: every ${intervalSeconds}s`);

  // Premier check immediat
  checkAllServices().catch((err) =>
    console.error('[SENTINEL] Initial health check failed:', err.message)
  );

  monitorInterval = setInterval(async () => {
    try {
      await checkAllServices();
    } catch (err) {
      console.error('[SENTINEL] Health check failed:', err.message);
    }
  }, intervalSeconds * 1000);
}

export function stopMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('[SENTINEL] Uptime monitoring stopped');
  }
}

export { SERVICES };
