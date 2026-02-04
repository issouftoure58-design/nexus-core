/**
 * Tenant Loader — Multi-tenant configuration system
 *
 * Identification du tenant par :
 * 1. Header X-Tenant-ID
 * 2. Parse du domaine (host)
 * 3. Défaut : fatshairafro
 */

import fatshairafro from './fatshairafro.js';
import decoevent from './decoevent.js';
import template from './template.js';

const tenants = {
  fatshairafro,
  decoevent,
  // Futurs tenants ici
};

/**
 * Retourne la config complète d'un tenant par son ID.
 * Fallback sur le template si inconnu.
 */
export function getTenantConfig(tenantId) {
  return tenants[tenantId] || template;
}

/**
 * Identifie le tenant à partir d'une requête HTTP.
 * Ordre : header X-Tenant-ID > host > défaut
 */
export function identifyTenant(req) {
  // 1. Header explicite
  const headerTenant = req?.headers?.['x-tenant-id'];
  if (headerTenant && tenants[headerTenant]) {
    return headerTenant;
  }

  // 2. Parse du domaine
  const host = req?.headers?.host || '';
  if (host.includes('fatshairafro')) return 'fatshairafro';
  if (host.includes('decoevent')) return 'decoevent';

  // 3. Défaut
  return 'fatshairafro';
}

/**
 * Shortcut : identifie le tenant ET retourne sa config.
 */
export function getTenantFromRequest(req) {
  const tenantId = identifyTenant(req);
  return { tenantId, config: getTenantConfig(tenantId) };
}

/**
 * Liste tous les tenants enregistrés.
 */
export function listTenants() {
  return Object.keys(tenants);
}

/**
 * Vérifie si un tenant est frozen (production protégée).
 */
export function isFrozen(tenantId) {
  const config = getTenantConfig(tenantId);
  return config.frozen === true;
}

/**
 * Vérifie si une feature est activée pour un tenant.
 */
export function hasFeature(tenantId, featureName) {
  const config = getTenantConfig(tenantId);
  return config.features?.[featureName] === true;
}

/**
 * Vérifie si un tenant peut être modifié (non frozen ou mode dev).
 */
export function canModify(tenantId, reason = '') {
  if (isFrozen(tenantId)) {
    console.warn(`[TENANT ${tenantId}] FROZEN - Modification refusée: ${reason}`);
    return false;
  }
  return true;
}

export default { getTenantConfig, identifyTenant, getTenantFromRequest, listTenants, isFrozen, hasFeature, canModify };
