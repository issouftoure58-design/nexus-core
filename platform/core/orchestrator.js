/**
 * NEXUS ORCHESTRATOR
 *
 * Gere le cycle de vie des tenants.
 * Charge registry + configs JSON au demarrage.
 */

import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

class NexusOrchestrator {
  constructor() {
    this.tenants = new Map();
    this.registry = null;
    this.initialized = false;
  }

  /**
   * Initialiser orchestrator
   */
  async initialize() {
    if (this.initialized) return;

    console.log('[ORCHESTRATOR] Initialisation...');

    try {
      await this.loadRegistry();

      for (const tenant of this.registry.tenants) {
        if (tenant.status === 'active' || tenant.status === 'staging') {
          await this.loadTenant(tenant.id);
        }
      }

      this.initialized = true;
      console.log(`[ORCHESTRATOR] ✅ Initialisé - ${this.tenants.size} tenants chargés`);
    } catch (error) {
      console.error('[ORCHESTRATOR] ❌ Erreur initialisation:', error);
      throw error;
    }
  }

  /**
   * Charger registry
   */
  async loadRegistry() {
    const registryPath = path.join(process.cwd(), 'tenants', 'registry.json');
    const data = await fs.readFile(registryPath, 'utf-8');
    this.registry = JSON.parse(data);
    console.log(`[ORCHESTRATOR] Registry chargé: ${this.registry.tenants.length} tenants`);
  }

  /**
   * Charger configuration d'un tenant
   */
  async loadTenant(tenantId) {
    try {
      const tenantDir = path.join(process.cwd(), 'tenants', `tenant-${tenantId}`);

      const configData = await fs.readFile(path.join(tenantDir, 'config.json'), 'utf-8');
      const config = JSON.parse(configData);

      const featuresData = await fs.readFile(path.join(tenantDir, 'features.json'), 'utf-8');
      const features = JSON.parse(featuresData);

      // Connexion DB avec schema tenant si configuré
      const dbSchema = config.technical?.database?.schema || 'public';
      let db = null;

      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        db = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { db: { schema: dbSchema } }
        );
        console.log(`[ORCHESTRATOR] Tenant ${tenantId} DB schema: ${dbSchema}`);
      }

      this.tenants.set(tenantId, {
        id: tenantId,
        config,
        features,
        db,
        dbSchema,
        metrics: {
          requests: 0,
          errors: 0,
          avgResponseTime: 0,
          lastRequest: null,
        },
        loadedAt: new Date().toISOString(),
      });

      console.log(`[ORCHESTRATOR] Tenant ${tenantId} (${config.name}) chargé`);
      return this.tenants.get(tenantId);
    } catch (error) {
      console.error(`[ORCHESTRATOR] Erreur chargement tenant ${tenantId}:`, error.message);
      return null;
    }
  }

  /**
   * Obtenir tenant
   */
  getTenant(tenantId) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} non trouvé ou non chargé`);
    }
    return tenant;
  }

  /**
   * Identifier tenant depuis requête
   */
  identifyTenant(req) {
    // Header
    if (req.headers?.['x-tenant-id']) {
      return parseInt(req.headers['x-tenant-id']);
    }

    // Body
    if (req.body?.tenant_id) {
      return parseInt(req.body.tenant_id);
    }

    // Domaine
    const hostname = req.hostname || req.headers?.host || '';
    for (const [id, tenant] of this.tenants) {
      if (tenant.config.technical?.domain && hostname.includes(tenant.config.technical.domain)) {
        return id;
      }
    }

    // Défaut: tenant 1 (Fat's Hair)
    return 1;
  }

  /**
   * Router requête vers tenant
   */
  async routeRequest(req) {
    const tenantId = this.identifyTenant(req);
    const tenant = this.getTenant(tenantId);

    if (tenant.config.status !== 'active' && tenant.config.status !== 'staging') {
      throw new Error(`Tenant ${tenantId} inactif (status: ${tenant.config.status})`);
    }

    tenant.metrics.requests++;
    tenant.metrics.lastRequest = new Date().toISOString();

    return tenant;
  }

  /**
   * Obtenir client DB pour un tenant
   */
  getDb(tenantId) {
    const tenant = this.getTenant(tenantId);
    if (!tenant.db) {
      throw new Error(`Tenant ${tenantId} n'a pas de connexion DB configurée`);
    }
    return tenant.db;
  }

  /**
   * Vérifier si feature activée
   */
  hasFeature(tenantId, featureName) {
    const tenant = this.getTenant(tenantId);

    for (const category of Object.values(tenant.features)) {
      if (typeof category === 'object' && category !== null && category[featureName] === true) {
        return true;
      }
    }

    return false;
  }

  /**
   * Vérifier si tenant frozen
   */
  isFrozen(tenantId) {
    const tenant = this.getTenant(tenantId);
    return tenant.config.frozen === true;
  }

  /**
   * Metrics globales
   */
  getGlobalMetrics() {
    const tenants = Array.from(this.tenants.values());

    return {
      totalTenants: this.tenants.size,
      activeTenants: tenants.filter(t => t.config.status === 'active').length,
      totalRequests: tenants.reduce((sum, t) => sum + t.metrics.requests, 0),
      totalErrors: tenants.reduce((sum, t) => sum + t.metrics.errors, 0),
      tenants: tenants.map(t => ({
        id: t.id,
        name: t.config.name,
        status: t.config.status,
        requests: t.metrics.requests,
        errors: t.metrics.errors,
      })),
    };
  }
}

// Singleton
export const orchestrator = new NexusOrchestrator();
