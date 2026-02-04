/**
 * SENTINEL Rate Limiter
 * Protege contre les abus et attaques DDoS
 */

// Stockage en memoire (Redis en production si besoin)
const requests = new Map();

// Configuration par type de route
export const LIMITS = {
  public: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    blockDuration: 5 * 60 * 1000,
  },
  api: {
    windowMs: 60 * 1000,
    maxRequests: 120,
    blockDuration: 5 * 60 * 1000,
  },
  admin: {
    windowMs: 60 * 1000,
    maxRequests: 200,
    blockDuration: 2 * 60 * 1000,
  },
  auth: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    blockDuration: 30 * 60 * 1000,
  },
};

// Nettoyer les anciennes entrees toutes les 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requests.entries()) {
    if (now - data.firstRequest > data.windowMs * 2) {
      requests.delete(key);
    }
  }
}, 5 * 60 * 1000);

function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

function getRouteType(path) {
  if (path.includes('/auth/login') || path.includes('/auth/register')) {
    return 'auth';
  }
  if (path.startsWith('/api/admin') || path.startsWith('/api/nexus')) {
    return 'admin';
  }
  if (path.startsWith('/api/')) {
    return 'api';
  }
  return 'public';
}

export function checkRateLimit(req) {
  const ip = getClientIP(req);
  const path = req.path || req.url;
  const routeType = getRouteType(path);
  const limits = LIMITS[routeType];

  const key = `${ip}:${routeType}`;
  const now = Date.now();

  let data = requests.get(key);

  // Verifier si bloque
  if (data?.blockedUntil && now < data.blockedUntil) {
    const remainingSeconds = Math.ceil((data.blockedUntil - now) / 1000);
    return {
      allowed: false,
      blocked: true,
      remaining: 0,
      remainingSeconds,
      reason: `Trop de requetes. Reessayez dans ${remainingSeconds}s`,
    };
  }

  // Nouvelle fenetre ou premiere requete
  if (!data || now - data.firstRequest > limits.windowMs) {
    data = {
      firstRequest: now,
      count: 1,
      windowMs: limits.windowMs,
      blockedUntil: null,
    };
    requests.set(key, data);
    return { allowed: true, remaining: limits.maxRequests - 1 };
  }

  // Incrementer le compteur
  data.count++;

  // Verifier la limite
  if (data.count > limits.maxRequests) {
    data.blockedUntil = now + limits.blockDuration;
    requests.set(key, data);

    console.log(
      `[SENTINEL SECURITY] Rate limit exceeded: IP=${ip}, route=${routeType}, count=${data.count}`
    );

    return {
      allowed: false,
      blocked: true,
      remaining: 0,
      remainingSeconds: Math.ceil(limits.blockDuration / 1000),
      reason: `Limite depassee (${limits.maxRequests} requetes/${limits.windowMs / 1000}s)`,
    };
  }

  requests.set(key, data);
  return {
    allowed: true,
    remaining: limits.maxRequests - data.count,
  };
}

// Middleware Express
export function rateLimitMiddleware(req, res, next) {
  const result = checkRateLimit(req);

  res.setHeader('X-RateLimit-Remaining', result.remaining || 0);

  if (!result.allowed) {
    // Log async (non-blocking)
    import('./securityLogger.js').then(({ logRateLimitExceeded }) => {
      logRateLimitExceeded(req);
    }).catch(() => {});

    res.setHeader('Retry-After', result.remainingSeconds);
    return res.status(429).json({
      error: 'Too Many Requests',
      message: result.reason,
      retryAfter: result.remainingSeconds,
    });
  }

  next();
}

// Stats pour monitoring
export function getRateLimitStats() {
  const stats = {
    totalTracked: requests.size,
    blocked: 0,
    byRouteType: {},
  };

  for (const [key, data] of requests.entries()) {
    const routeType = key.split(':')[1];
    if (!stats.byRouteType[routeType]) {
      stats.byRouteType[routeType] = { count: 0, blocked: 0 };
    }
    stats.byRouteType[routeType].count++;
    if (data.blockedUntil && Date.now() < data.blockedUntil) {
      stats.blocked++;
      stats.byRouteType[routeType].blocked++;
    }
  }

  return stats;
}

export function resetIP(ip) {
  for (const key of requests.keys()) {
    if (key.startsWith(ip + ':')) {
      requests.delete(key);
    }
  }
}
