import { orchestrator } from '../core/orchestrator.js';

/**
 * Middleware: Router vers bon tenant
 */
export async function tenantRouter(req, res, next) {
  // Mode dégradé si orchestrator pas initialisé
  if (!orchestrator.initialized) {
    req.tenantId = 1;
    return next();
  }

  try {
    const startTime = Date.now();

    const tenant = await orchestrator.routeRequest(req);

    req.tenant = tenant;
    req.tenantId = tenant.id;
    req.tenantConfig = tenant.config;
    req.tenantFeatures = tenant.features;

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      tenant.metrics.avgResponseTime =
        (tenant.metrics.avgResponseTime * 0.9) + (duration * 0.1);

      if (res.statusCode >= 500) {
        tenant.metrics.errors++;
      }
    });

    next();
  } catch (error) {
    console.error('[TENANT ROUTER] Erreur:', error.message);
    // Fallback: let request through with default tenant
    req.tenantId = 1;
    next();
  }
}

/**
 * Middleware: Vérifier feature activée
 */
export function requireFeature(featureName) {
  return (req, res, next) => {
    const tenantId = req.tenantId || req.tenant?.id;

    if (!orchestrator.hasFeature(tenantId, featureName)) {
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
 * Middleware: Protéger tenant frozen
 */
export function protectFrozen(req, res, next) {
  const tenantId = req.tenantId || req.tenant?.id;

  if (orchestrator.isFrozen(tenantId)) {
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
