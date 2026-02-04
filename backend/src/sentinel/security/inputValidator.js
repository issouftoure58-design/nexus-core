/**
 * SENTINEL Input Validator
 * Valide et nettoie toutes les entrees utilisateur
 */

// Patterns dangereux - SQL injection (sequences specifiques, pas les mots isoles)
const SQL_INJECTION_PATTERNS = [
  /('\s*(OR|AND)\s*'?\s*[=<>])/gi,
  /('\s*(OR|AND)\s+\d+\s*[=<>])/gi,
  /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|EXEC)\s/gi,
  /UNION\s+(ALL\s+)?SELECT\s/gi,
  /--\s*$/gm,
  /\/\*[\s\S]*?\*\//g,
  /\bEXEC(\s+|\()xp_/gi,
  /\bDECLARE\s+@/gi,
];

// XSS patterns
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript\s*:/gi,
  /\bon\w+\s*=\s*["']/gi,
  /<iframe[\s>]/gi,
  /<object[\s>]/gi,
  /<embed[\s>]/gi,
  /<svg[\s>].*?onload/gi,
  /expression\s*\(/gi,
  /url\s*\(\s*['"]?\s*data:/gi,
];

// Path traversal
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//g,
  /\.\.\\+/g,
  /%2e%2e(%2f|%5c)/gi,
];

// HTML entities for escaping
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

export function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

export function detectSqlInjection(value) {
  if (typeof value !== 'string') return false;
  return SQL_INJECTION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function detectXss(value) {
  if (typeof value !== 'string') return false;
  return XSS_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function detectPathTraversal(value) {
  if (typeof value !== 'string') return false;
  return PATH_TRAVERSAL_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function sanitizeString(str, options = {}) {
  if (typeof str !== 'string') return str;

  let sanitized = str.trim();

  const maxLength = options.maxLength || 10000;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Supprimer les caracteres de controle (sauf newlines et tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  if (options.escapeHtml) {
    sanitized = escapeHtml(sanitized);
  }

  return sanitized;
}

export function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

export function validatePhone(phone) {
  if (typeof phone !== 'string') return false;
  const phoneRegex = /^(\+33|0033|0)[1-9](\d{8})$|^\+?[\d\s\-().]{10,20}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

// Valider un objet recursivement
export function validateObject(obj, depth = 0) {
  if (depth > 10) {
    return { valid: false, threats: [{ path: '', type: 'DEPTH_EXCEEDED' }] };
  }

  const threats = [];

  const checkValue = (value, path) => {
    if (typeof value === 'string') {
      if (detectSqlInjection(value)) {
        threats.push({ path, type: 'SQL_INJECTION', snippet: value.substring(0, 50) });
      }
      if (detectXss(value)) {
        threats.push({ path, type: 'XSS', snippet: value.substring(0, 50) });
      }
      if (detectPathTraversal(value)) {
        threats.push({ path, type: 'PATH_TRAVERSAL', snippet: value.substring(0, 50) });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => checkValue(item, `${path}[${i}]`));
    } else if (value && typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        checkValue(val, `${path}.${key}`);
      }
    }
  };

  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      checkValue(value, key);
    }
  }

  return { valid: threats.length === 0, threats };
}

// Sanitizer un objet recursivement
export function sanitizeObject(obj, options = {}, depth = 0) {
  if (depth > 10) return obj;

  if (typeof obj === 'string') {
    return sanitizeString(obj, options);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, options, depth + 1));
  }

  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const safeKey = sanitizeString(key, { maxLength: 100 });
      sanitized[safeKey] = sanitizeObject(value, options, depth + 1);
    }
    return sanitized;
  }

  return obj;
}

// Middleware Express
export function inputValidationMiddleware(req, res, next) {
  const toValidate = {};
  if (req.body && Object.keys(req.body).length > 0) toValidate.body = req.body;
  if (req.query && Object.keys(req.query).length > 0) toValidate.query = req.query;
  if (req.params && Object.keys(req.params).length > 0) toValidate.params = req.params;

  const validation = validateObject(toValidate);

  if (!validation.valid) {
    console.log(`[SENTINEL SECURITY] Input validation failed:`, {
      ip: req.ip,
      path: req.path,
      method: req.method,
      threats: validation.threats,
    });

    // Log async (non-blocking)
    import('./securityLogger.js').then(({ logInvalidInput }) => {
      logInvalidInput(req, validation.threats);
    }).catch(() => {});

    return res.status(400).json({
      error: 'Invalid Input',
      message: 'Donnees invalides detectees',
      details: process.env.NODE_ENV === 'development' ? validation.threats : undefined,
    });
  }

  // Sanitizer body (trim strings, remove control chars)
  if (req.body) {
    req.body = sanitizeObject(req.body, { escapeHtml: false });
  }

  next();
}
