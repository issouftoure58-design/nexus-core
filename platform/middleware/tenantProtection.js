import { identifyTenant, getTenantConfig, isFrozen, hasFeature } from '../config/tenants/index.js';

/**
 * Middleware : Identifier le tenant et attacher sa config à la requête.
 */
export function attachTenant(req, res, next) {
  const tenantId = identifyTenant(req);
  const config = getTenantConfig(tenantId);

  req.tenantId = tenantId;
  req.tenantConfig = config;

  next();
}

/**
 * Middleware : Vérifier qu'une feature est activée pour le tenant.
 */
export function requireFeature(featureName) {
  return (req, res, next) => {
    const tenantId = req.tenantId || identifyTenant(req);

    if (!hasFeature(tenantId, featureName)) {
      console.log(`[TENANT ${tenantId}] Feature '${featureName}' non activée`);
      return res.status(403).json({
        success: false,
        error: `Feature '${featureName}' non disponible pour votre compte`,
        code: 'FEATURE_DISABLED',
      });
    }

    next();
  };
}

/**
 * Middleware : Bloquer les modifications sur tenants frozen en production.
 */
export function protectFrozen(req, res, next) {
  const tenantId = req.tenantId || identifyTenant(req);

  if (isFrozen(tenantId)) {
    const isDev = process.env.NODE_ENV === 'development';

    if (!isDev) {
      console.warn(`[TENANT ${tenantId}] Tentative modification sur tenant FROZEN`);
      return res.status(403).json({
        success: false,
        error: 'Modifications directes interdites sur compte production',
        code: 'TENANT_FROZEN',
      });
    }

    console.log(`[DEV MODE] Autorisation modification tenant frozen ${tenantId}`);
  }

  next();
}

/**
 * Middleware : Logger les requêtes avec info tenant.
 */
export function logTenant(req, res, next) {
  const tenantId = req.tenantId || identifyTenant(req);
  const config = getTenantConfig(tenantId);

  req.tenantId = tenantId;
  req.tenantConfig = config;

  console.log(`[TENANT ${tenantId}] ${config.name} - ${req.method} ${req.path}`);

  next();
}
