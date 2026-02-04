import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';
import { verifyLogin, changePassword } from '../sentinel/security/accountService.js';
import { POLICY, validatePasswordStrength } from '../sentinel/security/passwordPolicy.js';

const router = express.Router();

// 🔒 C2: JWT Secret - DOIT être défini dans .env (pas de fallback)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ ERREUR CRITIQUE: JWT_SECRET non défini dans .env');
  // En dev, utiliser un secret temporaire mais loguer un warning
  if (process.env.NODE_ENV === 'development') {
    console.warn('⚠️ Mode dev: utilisation d\'un secret temporaire (NE PAS UTILISER EN PROD)');
  }
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || (process.env.NODE_ENV === 'development' ? 'dev-only-secret-change-in-prod' : null);
if (!EFFECTIVE_JWT_SECRET) {
  throw new Error('JWT_SECRET must be defined in .env for production');
}

// 🔒 G4: Rate limiting pour login (protection brute force)
const loginAttempts = new Map(); // IP -> { count, lastAttempt }
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip);

  if (!attempts) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  // Reset si lockout expiré
  if (now - attempts.lastAttempt > LOCKOUT_DURATION) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  if (attempts.count >= MAX_ATTEMPTS) {
    const remainingMs = LOCKOUT_DURATION - (now - attempts.lastAttempt);
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { allowed: false, remainingMin };
  }

  attempts.count++;
  attempts.lastAttempt = now;
  return { allowed: true };
}

function resetRateLimit(ip) {
  loginAttempts.delete(ip);
}

// POST /api/admin/auth/login
router.post('/login', async (req, res) => {
  // 🔒 Empêcher le cache (fix Chrome/Service Worker)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

    // 🔒 G4: Vérifier rate limit (in-memory, garde pour compatibilité)
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      console.warn(`[AUTH] ⚠️ Rate limit dépassé pour IP: ${clientIp}`);
      return res.status(429).json({
        error: `Trop de tentatives. Réessayez dans ${rateCheck.remainingMin} minutes.`
      });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    // 🔒 SENTINEL: verifyLogin avec politique de sécurité
    const loginResult = await verifyLogin(email, password, req);

    if (!loginResult.success) {
      const status = loginResult.expired ? 403 : 401;
      return res.status(status).json({ error: loginResult.error });
    }

    // Générer JWT (🔒 M4: durée réduite à 24h pour admin)
    const token = jwt.sign(
      { id: loginResult.user.id, email: loginResult.user.email, role: loginResult.user.role },
      EFFECTIVE_JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 🔒 G4: Reset rate limit après login réussi
    resetRateLimit(clientIp);

    // Logger l'action
    try {
      await supabase.from('historique_admin').insert({
        admin_id: loginResult.user.id,
        action: 'login',
        entite: 'admin',
        details: { ip: req.ip }
      });
    } catch (_) { /* non-blocking */ }

    const response = {
      token,
      admin: {
        id: loginResult.user.id,
        email: loginResult.user.email,
        nom: loginResult.user.nom,
        role: loginResult.user.role,
      },
    };

    // Signaler si changement de mot de passe requis
    if (loginResult.mustChangePassword) {
      response.mustChangePassword = true;
      response.message = loginResult.message;
    }
    if (loginResult.passwordExpired) {
      response.passwordExpired = true;
      response.message = loginResult.message;
    }

    res.json(response);

  } catch (error) {
    console.error('[ADMIN AUTH] Erreur login:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/auth/logout
router.post('/logout', async (req, res) => {
  // 🔒 Empêcher le cache (fix Chrome/Service Worker)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    // En JWT, logout côté client (supprimer token)
    res.json({ message: 'Déconnecté avec succès' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/auth/change-password
router.post('/change-password', authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
    }

    const result = await changePassword(req.admin.id, currentPassword, newPassword);

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        details: result.details,
      });
    }

    res.json(result);
  } catch (error) {
    console.error('[ADMIN AUTH] Erreur change-password:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/admin/auth/password-policy
router.get('/password-policy', (req, res) => {
  res.json({
    policy: {
      minLength: POLICY.minLength,
      requireUppercase: POLICY.requireUppercase,
      requireLowercase: POLICY.requireLowercase,
      requireNumbers: POLICY.requireNumbers,
      requireSymbols: POLICY.requireSymbols,
      maxAge: POLICY.maxAge,
      historyCount: POLICY.historyCount,
      provisionalExpiry: POLICY.provisionalExpiry,
    },
  });
});

// GET /api/admin/auth/me (vérifier token)
router.get('/me', authenticateAdmin, async (req, res) => {
  // 🔒 Empêcher le cache (fix Chrome/Service Worker)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const { data: admin } = await supabase
      .from('admin_users')
      .select('id, email, nom, role')
      .eq('id', req.admin.id)
      .single();

    res.json({ admin });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Middleware authentification
export function authenticateAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET);

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

// Middleware super admin (role = 'super_admin')
export function requireSuperAdmin(req, res, next) {
  if (!req.admin) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  if (req.admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Accès réservé au super admin' });
  }
  next();
}

export default router;
