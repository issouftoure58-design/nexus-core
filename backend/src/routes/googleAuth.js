/**
 * Routes d'authentification Google Drive pour Halimah Pro
 */

import express from 'express';
import { authenticateAdmin } from './adminAuth.js';
import {
  isConfigured,
  isConnected,
  getAuthUrl,
  handleCallback,
  disconnect,
  getStatus
} from '../services/googleDriveService.js';

const router = express.Router();

/**
 * GET /api/google/status
 * Vérifie le statut de la connexion Google Drive
 */
router.get('/status', authenticateAdmin, async (req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (error) {
    console.error('[GOOGLE AUTH] Erreur status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/google/auth
 * Redirige vers la page d'authentification Google
 */
router.get('/auth', authenticateAdmin, (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(400).json({
        error: 'Google Drive non configuré',
        message: 'Ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env'
      });
    }

    const result = getAuthUrl();
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Rediriger vers Google
    res.redirect(result.url);
  } catch (error) {
    console.error('[GOOGLE AUTH] Erreur auth:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/google/auth-url
 * Retourne l'URL d'authentification sans rediriger
 * (pour les clients qui veulent gérer la redirection eux-mêmes)
 */
router.get('/auth-url', authenticateAdmin, (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'Google Drive non configuré',
        message: 'Ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env'
      });
    }

    const result = getAuthUrl();
    res.json(result);
  } catch (error) {
    console.error('[GOOGLE AUTH] Erreur auth-url:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/google/callback
 * Callback OAuth - Google redirige ici après authentification
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, error: googleError } = req.query;

    if (googleError) {
      console.error('[GOOGLE AUTH] Erreur Google:', googleError);
      return res.redirect('/admin/parametres?google=error&message=' + encodeURIComponent(googleError));
    }

    if (!code) {
      return res.redirect('/admin/parametres?google=error&message=Code+manquant');
    }

    const result = await handleCallback(code);

    if (result.success) {
      console.log('[GOOGLE AUTH] ✅ Authentification réussie');
      res.redirect('/admin/parametres?google=success');
    } else {
      console.error('[GOOGLE AUTH] Erreur callback:', result.error);
      res.redirect('/admin/parametres?google=error&message=' + encodeURIComponent(result.error));
    }
  } catch (error) {
    console.error('[GOOGLE AUTH] Exception callback:', error);
    res.redirect('/admin/parametres?google=error&message=' + encodeURIComponent(error.message));
  }
});

/**
 * POST /api/google/disconnect
 * Déconnecte Google Drive
 */
router.post('/disconnect', authenticateAdmin, async (req, res) => {
  try {
    const result = await disconnect();
    if (result.success) {
      console.log('[GOOGLE AUTH] ✅ Déconnexion réussie');
    }
    res.json(result);
  } catch (error) {
    console.error('[GOOGLE AUTH] Erreur disconnect:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
