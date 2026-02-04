/**
 * SENTINEL Password Policy
 * Gestion des mots de passe securises
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// Configuration de la politique
export const POLICY = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSymbols: true,
  maxAge: 90,                    // Jours avant expiration
  historyCount: 5,               // Nombre d'anciens mots de passe a verifier
  provisionalExpiry: 7,          // Jours avant expiration ID provisoire
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

// Regex pour symboles (pre-escaped)
const SYMBOL_REGEX = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/;

// Valider la complexite d'un mot de passe
export function validatePasswordStrength(password) {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Mot de passe requis'], strength: 0 };
  }

  if (password.length < POLICY.minLength) {
    errors.push(`Minimum ${POLICY.minLength} caractères`);
  }

  if (POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Au moins une majuscule requise');
  }

  if (POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Au moins une minuscule requise');
  }

  if (POLICY.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Au moins un chiffre requis');
  }

  if (POLICY.requireSymbols && !SYMBOL_REGEX.test(password)) {
    errors.push('Au moins un symbole requis (!@#$%^&*...)');
  }

  // Patterns faibles
  const weakPatterns = [
    /^(.)\1+$/,
    /^(012|123|234|345|456|567|678|789|890)+$/,
    /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+$/i,
    /password|motdepasse|azerty|qwerty/i,
  ];

  for (const pattern of weakPatterns) {
    if (pattern.test(password)) {
      errors.push('Mot de passe trop prévisible');
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    strength: calculateStrength(password),
  };
}

// Calculer la force du mot de passe (0-100)
export function calculateStrength(password) {
  if (!password) return 0;
  let score = 0;

  score += Math.min(password.length * 4, 40);
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  if (password.length > 16) score += 15;

  return Math.min(score, 100);
}

// Generer un mot de passe provisoire securise
export function generateProvisionalPassword() {
  const length = 16;
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const syms = '!@#$%^&*';
  const charset = upper + lower + digits + syms;

  const bytes = crypto.randomBytes(length);
  let password = '';

  // Garantir au moins un de chaque type
  password += upper[bytes[0] % upper.length];
  password += lower[bytes[1] % lower.length];
  password += digits[bytes[2] % digits.length];
  password += syms[bytes[3] % syms.length];

  // Completer le reste
  for (let i = 4; i < length; i++) {
    password += charset[bytes[i] % charset.length];
  }

  // Melanger avec Fisher-Yates (crypto-safe)
  const arr = password.split('');
  const shuffleBytes = crypto.randomBytes(arr.length);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.join('');
}

// Generer un ID provisoire
export function generateProvisionalId(prefix = 'user') {
  const randomPart = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${randomPart}`;
}

// Verifier si le mot de passe est dans l'historique
export async function isPasswordInHistory(password, passwordHistory) {
  if (!passwordHistory || passwordHistory.length === 0) return false;

  for (const oldHash of passwordHistory.slice(0, POLICY.historyCount)) {
    const match = await bcrypt.compare(password, oldHash);
    if (match) return true;
  }

  return false;
}

// Date d'expiration du compte provisoire
export function getProvisionalExpiry() {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + POLICY.provisionalExpiry);
  return expiry;
}

// Verifier si le compte provisoire est expire
export function isProvisionalExpired(expiryDate) {
  if (!expiryDate) return false;
  return new Date() > new Date(expiryDate);
}

// Verifier si le mot de passe doit etre change (expiration)
export function isPasswordExpired(lastChanged) {
  if (!lastChanged || !POLICY.maxAge) return false;

  const expiryDate = new Date(lastChanged);
  expiryDate.setDate(expiryDate.getDate() + POLICY.maxAge);

  return new Date() > expiryDate;
}

// Hash du mot de passe
export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

// Verifier le mot de passe
export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}
