/**
 * API client pour CLI
 *
 * Lit les fichiers locaux (registry, configs) et appelle l'API serveur.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '../..');
const registryPath = join(projectRoot, 'tenants', 'registry.json');

const API_BASE = process.env.NEXUS_API_URL || 'http://localhost:5000';

/**
 * Creer tenant
 */
export async function createTenant(data) {
  const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));

  const newId = Math.max(...registry.tenants.map((t) => t.id), 0) + 1;
  const slug = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const tenant = {
    id: newId,
    slug,
    name: data.name,
    status: 'pending',
    tier: data.tier || 'starter',
    version: '1.0.0',
    frozen: false,
    created: new Date().toISOString().split('T')[0],
  };

  // Add to registry
  registry.tenants.push(tenant);
  if (registry.stats) {
    registry.stats.totalTenants = registry.tenants.length;
  }

  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');

  // Create tenant directory
  const tenantDir = join(projectRoot, 'tenants', `tenant-${newId}`);
  if (!existsSync(tenantDir)) {
    mkdirSync(tenantDir, { recursive: true });
  }

  // Create config.json
  const config = {
    id: newId,
    slug,
    name: data.name,
    businessType: data.businessType || 'commerce',
    status: 'pending',
    frozen: false,
    version: '1.0.0',
    created: new Date().toISOString(),
    owner: {
      name: data.owner || data.name,
      email: data.email || '',
      phone: data.phone || '',
    },
    technical: {
      database: {
        schema: `tenant_${newId}_${slug}`,
        url: '${SUPABASE_URL}',
        migrated: false,
        migrationDate: null,
      },
      domain: data.domain || '',
      region: 'eu-west-1',
      timezone: 'Europe/Paris',
    },
    limits: {
      maxReservationsPerDay: 20,
      maxSMSPerMonth: 500,
      maxAICallsPerDay: 100,
      maxUsers: 3,
      maxStorageGB: 20,
    },
    billing: {
      plan: data.tier || 'starter',
      amount: data.tier === 'business' ? 399 : data.tier === 'pro' ? 199 : 99,
      currency: 'EUR',
      interval: 'monthly',
    },
  };

  writeFileSync(
    join(tenantDir, 'config.json'),
    JSON.stringify(config, null, 2) + '\n'
  );

  // Create features.json based on tier
  const isProOrAbove = ['pro', 'business'].includes(data.tier);
  const isBusiness = data.tier === 'business';

  const features = {
    core: {
      reservations: true,
      reservations_web: true,
      reservations_telephone: false,
      reservations_chat: true,
      reservations_whatsapp: false,
      client_management: true,
      services_management: true,
      services_variables: false,
    },
    notifications: {
      sms_confirmation: true,
      sms_rappel_24h: true,
      sms_remerciement: false,
      email_notifications: false,
      whatsapp_notifications: false,
    },
    ai: {
      halimah_chat: true,
      halimah_voice: false,
      smart_scheduling: false,
      sentiment_analysis: false,
      auto_responses: false,
    },
    admin: {
      dashboard: true,
      analytics: true,
      export_data: isProOrAbove,
      multi_user: isBusiness,
    },
    modules: {
      accounting: isProOrAbove,
      marketing_campaigns: isProOrAbove,
      marketing_crm: isProOrAbove,
      seo: isBusiness,
      rh_employees: isBusiness,
      rh_payroll: isBusiness,
      commerce_catalogue: false,
      commerce_orders: false,
      commerce_payments: false,
      sentinel_client: isBusiness,
    },
    integrations: {
      google_calendar: false,
      stripe: false,
      mailchimp: false,
      zapier: false,
    },
  };

  writeFileSync(
    join(tenantDir, 'features.json'),
    JSON.stringify(features, null, 2) + '\n'
  );

  return {
    tenantId: newId,
    config: { ...config, slug },
  };
}

/**
 * Lister tenants
 */
export async function listTenants(filters = {}) {
  const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));

  let tenants = registry.tenants;

  if (filters.status) {
    tenants = tenants.filter((t) => t.status === filters.status);
  }

  if (filters.tier) {
    tenants = tenants.filter((t) => t.tier === filters.tier);
  }

  return tenants;
}

/**
 * Obtenir tenant
 */
export async function getTenant(id) {
  const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));

  const tenant = registry.tenants.find((t) => t.id === parseInt(id));

  if (!tenant) {
    throw new Error(`Tenant ${id} non trouve`);
  }

  // Try to load full config
  try {
    const tenantDir = join(projectRoot, 'tenants', `tenant-${id}`);
    const config = JSON.parse(
      readFileSync(join(tenantDir, 'config.json'), 'utf-8')
    );
    return { ...tenant, ...config };
  } catch {
    return tenant;
  }
}

/**
 * Activer feature
 */
export async function enableFeature(tenantId, feature) {
  const tenantDir = join(projectRoot, 'tenants', `tenant-${tenantId}`);
  const featuresPath = join(tenantDir, 'features.json');

  const features = JSON.parse(readFileSync(featuresPath, 'utf-8'));

  let found = false;
  for (const category of Object.values(features)) {
    if (typeof category === 'object' && category !== null && feature in category) {
      category[feature] = true;
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error(
      `Feature '${feature}' non trouvee. Verifier le nom exact dans features.json`
    );
  }

  writeFileSync(featuresPath, JSON.stringify(features, null, 2) + '\n');
}

/**
 * Desactiver feature
 */
export async function disableFeature(tenantId, feature) {
  const tenantDir = join(projectRoot, 'tenants', `tenant-${tenantId}`);
  const featuresPath = join(tenantDir, 'features.json');

  const features = JSON.parse(readFileSync(featuresPath, 'utf-8'));

  let found = false;
  for (const category of Object.values(features)) {
    if (typeof category === 'object' && category !== null && feature in category) {
      category[feature] = false;
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error(
      `Feature '${feature}' non trouvee. Verifier le nom exact dans features.json`
    );
  }

  writeFileSync(featuresPath, JSON.stringify(features, null, 2) + '\n');
}

/**
 * Metriques globales (via API)
 */
export async function getGlobalMetrics() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/sentinel/status`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.sentinel?.metrics?.global) {
        return data.sentinel.metrics.global;
      }
    }
  } catch {
    // Fallback to local data
  }

  // Fallback: read from orchestrator metrics
  const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
  const activeTenants = registry.tenants.filter(
    (t) => t.status === 'active'
  ).length;

  return {
    orchestrator: {
      totalTenants: registry.tenants.length,
      activeTenants,
      totalRequests: 0,
      totalErrors: 0,
      errorRate: 0,
    },
    performance: {
      avgResponseTime: 0,
      requestsPerMinute: 0,
    },
    system: {
      cpuUsage: 0,
      memoryUsage: { total: 0, used: 0, free: 0, percentage: 0 },
      uptime: 0,
    },
  };
}

/**
 * Metriques tenant
 */
export async function getTenantMetrics(tenantId) {
  try {
    const response = await fetch(
      `${API_BASE}/api/admin/orchestrator/tenant/${tenantId}`
    );

    if (response.ok) {
      const data = await response.json();
      if (data.tenant) {
        return {
          name: data.tenant.config.name,
          metrics: data.tenant.metrics,
        };
      }
    }
  } catch {
    // Fallback
  }

  const tenant = await getTenant(tenantId);
  return {
    name: tenant.name,
    metrics: { requests: 0, errors: 0, errorRate: 0 },
  };
}

/**
 * Health check
 */
export async function getHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/admin/sentinel/health`);

    if (response.ok) {
      return await response.json();
    }

    // Try basic health
    const basicResponse = await fetch(`${API_BASE}/health`);
    if (basicResponse.ok) {
      return { status: 'healthy', message: 'Server responding (Sentinel not available)' };
    }

    throw new Error('Service indisponible');
  } catch (error) {
    return {
      status: 'critical',
      message: `Connexion impossible: ${error.message}`,
    };
  }
}

/**
 * Backup tenant
 */
export async function backupTenant(tenantId) {
  // Placeholder - requires pg_dump access
  return {
    filename: `tenant_${tenantId}_${Date.now()}.sql.gz`,
    size: 'N/A (run infrastructure/scripts/backup-production.sh)',
    date: new Date().toISOString(),
  };
}

/**
 * Lister backups
 */
export async function listBackups() {
  const backupsDir = join(projectRoot, 'backups');

  try {
    const { readdirSync, statSync } = await import('fs');
    const dirs = readdirSync(backupsDir).filter((d) =>
      d.startsWith('pre-migration-')
    );

    return dirs.map((d) => {
      const stat = statSync(join(backupsDir, d));
      return {
        filename: d,
        size: `${Math.round(stat.size / 1024)}KB`,
        date: stat.mtime.toISOString(),
      };
    });
  } catch {
    return [];
  }
}
