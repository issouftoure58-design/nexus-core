/**
 * SENTINEL CSRF Protection
 * Protege contre les Cross-Site Request Forgery
 */

import crypto from 'crypto';

const tokens = new Map();
const TOKEN_TTL = 60 * 60 * 1000; // 1 hour

// Cleanup expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of tokens.entries()) {
    if (now - data.createdAt > TOKEN_TTL) {
      tokens.delete(key);
    }
  }
}, 10 * 60 * 1000);

export function generateCsrfToken(sessionId) {
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, { sessionId, createdAt: Date.now() });
  return token;
}

export function validateCsrfToken(token, sessionId) {
  if (!token) return false;
  const data = tokens.get(token);
  if (!data) return false;
  if (Date.now() - data.createdAt > TOKEN_TTL) {
    tokens.delete(token);
    return false;
  }
  if (data.sessionId !== sessionId) return false;
  return true;
}

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

const EXEMPT_ROUTES = [
  '/api/chat',
  '/api/whatsapp',
  '/api/twilio',
  '/api/stripe/webhook',
  '/api/admin/auth/login',
  '/api/admin/login',
  '/api/client/auth',
];

function isExempt(path, method) {
  if (SAFE_METHODS.includes(method)) return true;
  return EXEMPT_ROUTES.some((route) => path.startsWith(route));
}

export function csrfMiddleware(req, res, next) {
  if (isExempt(req.path, req.method)) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body?._csrf;
  const sessionId = req.admin?.id || req.headers['authorization'] || 'anonymous';

  if (!validateCsrfToken(token, sessionId)) {
    console.log(`[SENTINEL SECURITY] CSRF validation failed: ip=${req.ip} path=${req.path}`);
    return res.status(403).json({
      error: 'CSRF Validation Failed',
      message: 'Token de securite invalide ou expire',
    });
  }

  next();
}

export function getCsrfTokenHandler(req, res) {
  const sessionId = req.admin?.id || req.headers['authorization'] || 'anonymous';
  const token = generateCsrfToken(sessionId);
  res.json({ csrfToken: token });
}

export { EXEMPT_ROUTES };
