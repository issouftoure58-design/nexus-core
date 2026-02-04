/**
 * VOICE ROUTES - API endpoints pour la synthèse vocale optimisée
 *
 * Routes pour la génération de voix avec ElevenLabs
 * avec cache, optimisation et pré-génération
 *
 * @module routes/voice
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import voiceService from '../services/voiceService.js';

const router = express.Router();

// ============================================
// AUDIO SERVING (pour Twilio <Play>)
// ============================================

/**
 * GET /api/voice/audio/:filename
 * Sert un fichier MP3 depuis le cache vocal
 */
router.get('/audio/:filename', (req, res) => {
  const { filename } = req.params;

  // Sécurité : empêcher traversée de répertoire
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Nom de fichier invalide' });
  }

  const filePath = path.join(voiceService.CACHE_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.error(`[VOICE AUDIO] Fichier introuvable: ${filename}`);
    return res.status(404).json({ error: 'Audio non trouvé' });
  }

  res.set({
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'public, max-age=3600'
  });
  res.sendFile(filePath);
});

// ============================================
// ROUTES PRINCIPALES
// ============================================

/**
 * POST /api/voice/synthesize
 * Convertir texte en audio (avec optimisation et cache)
 *
 * Body:
 * - text: string (texte à convertir)
 * - voiceId: string (optionnel - ID de la voix)
 * - useCache: boolean (optionnel - utiliser le cache, défaut: true)
 * - optimize: boolean (optionnel - optimiser le texte, défaut: true)
 *
 * Response: audio/mpeg avec headers X-From-Cache et X-Characters-Used
 */
router.post('/synthesize', async (req, res) => {
  try {
    const { text, voiceId, useCache = true, optimize = true } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Texte requis' });
    }

    if (!voiceService.isConfigured()) {
      return res.status(503).json({
        error: 'Service vocal non configuré',
        message: 'Clé API ElevenLabs manquante'
      });
    }

    const result = await voiceService.textToSpeech(text, {
      voiceId,
      useCache,
      optimize
    });

    if (result.success) {
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': result.audio.length,
        'X-From-Cache': result.fromCache ? 'true' : 'false',
        'X-Characters-Used': result.characters.toString(),
        'Cache-Control': 'no-cache'
      });
      res.send(result.audio);
    } else {
      res.status(500).json({ error: result.error });
    }

  } catch (error) {
    console.error('[VOICE ROUTE] Erreur synthesize:', error.message);
    res.status(500).json({ error: 'Erreur de synthèse vocale', details: error.message });
  }
});

/**
 * POST /api/voice/smart
 * Convertir réponse complète (découpe en segments, utilise le cache)
 *
 * Body:
 * - text: string (texte complet à convertir)
 * - voiceId: string (optionnel)
 *
 * Response: audio/mpeg avec header X-Stats
 */
router.post('/smart', async (req, res) => {
  try {
    const { text, voiceId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Texte requis' });
    }

    if (!voiceService.isConfigured()) {
      return res.status(503).json({
        error: 'Service vocal non configuré',
        message: 'Clé API ElevenLabs manquante'
      });
    }

    const result = await voiceService.textToSpeechSmart(text, { voiceId });

    if (result.success) {
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': result.audio.length,
        'X-Stats': JSON.stringify(result.stats),
        'Cache-Control': 'no-cache'
      });
      res.send(result.audio);
    } else {
      res.status(500).json({ error: result.error });
    }

  } catch (error) {
    console.error('[VOICE ROUTE] Erreur smart:', error.message);
    res.status(500).json({ error: 'Erreur de synthèse', details: error.message });
  }
});

/**
 * POST /api/voice/stream
 * Synthèse en streaming
 */
router.post('/stream', async (req, res) => {
  try {
    const { text, voiceId } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Le texte est requis' });
    }

    if (!voiceService.isConfigured()) {
      return res.status(503).json({
        error: 'Service vocal non configuré',
        message: 'Clé API ElevenLabs manquante'
      });
    }

    const audioStream = await voiceService.textToSpeechStream(text, { voiceId });

    if (!audioStream) {
      return res.status(500).json({ error: 'Erreur de streaming vocal' });
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache'
    });

    const reader = audioStream.getReader();

    async function pump() {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
      return pump();
    }

    await pump();

  } catch (error) {
    console.error('[VOICE ROUTE] Erreur stream:', error.message);
    res.status(500).json({ error: 'Erreur de streaming', details: error.message });
  }
});

// ============================================
// GESTION DU CACHE
// ============================================

/**
 * GET /api/voice/cache/stats
 * Statistiques du cache et de la session
 */
router.get('/cache/stats', (req, res) => {
  try {
    const stats = voiceService.getCacheStats();
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('[VOICE ROUTE] Erreur cache stats:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/voice/cache
 * Vider le cache audio
 */
router.delete('/cache', (req, res) => {
  try {
    const result = voiceService.clearCache();
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[VOICE ROUTE] Erreur clear cache:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PRÉ-GÉNÉRATION
// ============================================

/**
 * POST /api/voice/pregenerate
 * Pré-générer toutes les phrases courantes
 */
router.post('/pregenerate', async (req, res) => {
  try {
    if (!voiceService.isConfigured()) {
      return res.status(503).json({
        error: 'Service vocal non configuré',
        message: 'Clé API ElevenLabs manquante'
      });
    }

    const { voiceId } = req.body;
    const result = await voiceService.pregenerateCommonPhrases(voiceId);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[VOICE ROUTE] Erreur pregenerate:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voice/phrases
 * Liste des phrases pré-générées disponibles
 */
router.get('/phrases', (req, res) => {
  res.json({
    success: true,
    phrases: voiceService.PREGENERATED_PHRASES,
    count: Object.keys(voiceService.PREGENERATED_PHRASES).length
  });
});

// ============================================
// UTILITAIRES
// ============================================

/**
 * GET /api/voice/status
 * Statut du service vocal
 */
router.get('/status', (req, res) => {
  const stats = voiceService.getCacheStats();
  res.json({
    configured: voiceService.isConfigured(),
    defaultVoice: voiceService.DEFAULT_VOICE_ID,
    voiceSettings: voiceService.VOICE_SETTINGS,
    cacheFiles: stats.cacheFiles,
    cacheSize: stats.cacheSize,
    sessionStats: {
      totalCharacters: stats.totalCharacters,
      cachedHits: stats.cachedHits,
      apiCalls: stats.apiCalls,
      charactersSaved: stats.charactersSaved,
      savingsPercent: stats.savingsPercent
    }
  });
});

/**
 * GET /api/voice/quota
 * Quota ElevenLabs restant
 */
router.get('/quota', async (req, res) => {
  try {
    const quota = await voiceService.getQuota();
    res.json(quota);
  } catch (error) {
    console.error('[VOICE ROUTE] Erreur quota:', error.message);
    res.status(500).json({ error: 'Erreur vérification quota', details: error.message });
  }
});

/**
 * GET /api/voice/voices
 * Liste des voix disponibles
 */
router.get('/voices', async (req, res) => {
  try {
    const voices = await voiceService.listVoices();
    res.json({
      success: true,
      voices,
      count: voices.length,
      default: voiceService.DEFAULT_VOICE_ID
    });
  } catch (error) {
    console.error('[VOICE ROUTE] Erreur voices:', error.message);
    res.status(500).json({ error: 'Erreur récupération voix', details: error.message });
  }
});

/**
 * POST /api/voice/reset-stats
 * Réinitialiser les statistiques de session
 */
router.post('/reset-stats', (req, res) => {
  try {
    const stats = voiceService.resetStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[VOICE ROUTE] Erreur reset stats:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/voice/optimize
 * Optimiser un texte (debug/test)
 */
router.post('/optimize', (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Texte requis' });
    }

    const optimized = voiceService.optimizeText(text);
    const pregenMatch = voiceService.findPregeneratedMatch(text);

    res.json({
      success: true,
      original: text,
      originalLength: text.length,
      optimized,
      optimizedLength: optimized.length,
      saved: text.length - optimized.length,
      percentSaved: Math.round(((text.length - optimized.length) / text.length) * 100),
      pregeneratedMatch: pregenMatch
    });

  } catch (error) {
    console.error('[VOICE ROUTE] Erreur optimize:', error.message);
    res.status(500).json({ error: 'Erreur optimisation', details: error.message });
  }
});

/**
 * GET /api/voice/test
 * Test rapide de la synthèse vocale
 */
router.get('/test', async (req, res) => {
  try {
    if (!voiceService.isConfigured()) {
      return res.status(503).json({
        error: 'Service vocal non configuré',
        message: 'Clé API ElevenLabs manquante'
      });
    }

    const testText = "Fat's Hair-Afro bonjour ! Moi c'est Halimah...";

    const result = await voiceService.textToSpeech(testText);

    if (result.success) {
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': result.audio.length,
        'X-From-Cache': result.fromCache ? 'true' : 'false',
        'X-Characters-Used': result.characters.toString()
      });
      res.send(result.audio);
    } else {
      res.status(500).json({ error: result.error });
    }

  } catch (error) {
    console.error('[VOICE ROUTE] Erreur test:', error.message);
    res.status(500).json({ error: 'Erreur de test', details: error.message });
  }
});

// ============================================
// EXPORT
// ============================================

export default router;
