/**
 * Service de synthèse vocale OPTIMISÉ pour économiser les crédits ElevenLabs
 *
 * Stratégies d'économie :
 * 1. CACHE AUDIO : Ne pas re-générer les phrases répétitives (~70% économie)
 * 2. TEXTE CONCIS : Réduire sans perdre le naturel (~30% économie)
 * 3. PRÉ-GÉNÉRATION : Générer les phrases courantes à l'avance (100% économie)
 * 4. CHUNKS INTELLIGENTS : Découper et cacher les segments communs
 *
 * @module voiceService
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ============================================
// CONFIGURATION
// ============================================

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Dossier de cache audio
const CACHE_DIR = path.join(process.cwd(), 'data', 'voice-cache');

// Créer le dossier cache s'il n'existe pas
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  console.log('[VOICE SERVICE] Dossier cache créé:', CACHE_DIR);
}

// Statistiques d'utilisation
let stats = {
  totalCharacters: 0,
  cachedHits: 0,
  apiCalls: 0,
  charactersSaved: 0,
  sessionStart: new Date().toISOString()
};

// Voix par défaut (Ingrid - française naturelle)
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'FFXYdAYPzn8Tw8KiHZqg';

// Paramètres optimisés pour qualité/coût
const VOICE_SETTINGS = {
  stability: 0.7,           // Plus stable pour le téléphone
  similarity_boost: 0.75,
  style: 0.35,              // Pas trop haut pour éviter les artefacts
  use_speaker_boost: true
};

// Modèle : turbo = moins cher et plus rapide, v2 = meilleure qualité
const MODEL_ID = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';

// ============================================
// PHRASES PRÉ-GÉNÉRÉES (à générer 1 fois)
// ============================================

const PREGENERATED_PHRASES = {
  // Salutations
  'bonjour': "Bonjour ! Comment allez-vous ?",
  'bonjour_matin': "Bonjour ! Bien dormi ?",
  'bonjour_aprem': "Bonjour ! Comment se passe votre journée ?",
  'bonsoir': "Bonsoir ! Comment allez-vous ?",

  // Présentations
  'je_suis_halimah': "Moi c'est Halimah, enchantée !",
  'bienvenue': "Bienvenue chez Fat's Hair-Afro !",
  'bienvenue_complet': "Fat's Hair-Afro bonjour ! Moi c'est Halimah...",

  // Confirmations
  'ok': "D'accord !",
  'parfait': "Parfait !",
  'super': "Super !",
  'cest_note': "C'est noté !",
  'tres_bien': "Très bien !",
  'entendu': "Bien entendu !",
  'cest_bon': "C'est bon !",
  'ca_marche': "Ça marche !",

  // Transitions
  'alors': "Alors...",
  'voyons': "Voyons voir...",
  'attendez': "Attendez, je vérifie...",
  'un_instant': "Un petit instant...",
  'je_regarde': "Je regarde ça...",
  'je_verifie': "Je vérifie les disponibilités...",

  // Questions
  'ca_vous_va': "Ça vous va ?",
  'autre_chose': "Vous avez besoin d'autre chose ?",
  'des_questions': "Vous avez des questions ?",
  'on_fait_ca': "On fait comme ça ?",
  'vous_preferez_quand': "Vous préférez quand ?",
  'quel_jour': "Quel jour vous arrangerait ?",
  'quelle_heure': "À quelle heure ?",
  'votre_adresse': "Quelle est votre adresse ?",
  'votre_nom': "C'est à quel nom ?",
  'votre_telephone': "Votre numéro de téléphone ?",

  // Empathie
  'je_comprends': "Je comprends...",
  'pas_de_souci': "Pas de souci !",
  'aucun_probleme': "Aucun problème !",
  'desolee': "Je suis désolée...",
  'ah_mince': "Ah mince...",

  // Au revoir
  'au_revoir': "Au revoir, à bientôt !",
  'a_samedi': "Allez, à samedi !",
  'bonne_journee': "Bonne journée !",
  'bonne_soiree': "Bonne soirée !",
  'prenez_soin': "Prenez soin de vous !",
  'a_tres_vite': "À très vite !",
  'merci_au_revoir': "Merci et à bientôt !",

  // Services courants
  'locks_reprise': "Reprise de locks, cinquante euros.",
  'locks_creation': "Création de locks, deux cents euros.",
  'tresses_braids': "Des braids, soixante euros.",
  'soin_complet': "Un soin complet, cinquante euros.",

  // Lieux
  'chez_vous_ou_fatou': "Chez vous ou chez Fatou ?",
  'domicile_ou_salon': "À domicile ou au salon ?",
  'adresse_fatou': "C'est au huit rue des Monts Rouges, à Franconville."
};

// ============================================
// CACHE AUDIO
// ============================================

/**
 * Génère un hash unique pour un texte
 * @param {string} text - Texte à hasher
 * @param {string} voiceId - ID de la voix
 * @returns {string} - Hash MD5
 */
function getTextHash(text, voiceId) {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return crypto.createHash('md5').update(`${normalized}_${voiceId}`).digest('hex');
}

/**
 * Vérifie si l'audio est en cache
 * @param {string} text - Texte à vérifier
 * @param {string} voiceId - ID de la voix
 * @returns {Buffer|null} - Buffer audio ou null
 */
function getCachedAudio(text, voiceId = DEFAULT_VOICE_ID) {
  const hash = getTextHash(text, voiceId);
  const cachePath = path.join(CACHE_DIR, `${hash}.mp3`);

  if (fs.existsSync(cachePath)) {
    stats.cachedHits++;
    stats.charactersSaved += text.length;
    console.log(`[VOICE] Cache HIT: "${text.substring(0, 30)}..." (${text.length} chars économisés)`);
    return fs.readFileSync(cachePath);
  }

  return null;
}

/**
 * Sauvegarde l'audio en cache
 * @param {string} text - Texte généré
 * @param {string} voiceId - ID de la voix
 * @param {Buffer} audioBuffer - Buffer audio à cacher
 */
function cacheAudio(text, voiceId, audioBuffer) {
  const hash = getTextHash(text, voiceId);
  const cachePath = path.join(CACHE_DIR, `${hash}.mp3`);
  fs.writeFileSync(cachePath, audioBuffer);
  console.log(`[VOICE] Cached: "${text.substring(0, 30)}..."`);
}

// ============================================
// OPTIMISATION DU TEXTE
// ============================================

/**
 * Optimise le texte pour réduire les caractères sans perdre le naturel
 * @param {string} text - Texte à optimiser
 * @returns {string} - Texte optimisé
 */
function optimizeText(text) {
  let optimized = text;

  // 1. Supprimer les espaces multiples
  optimized = optimized.replace(/\s+/g, ' ').trim();

  // 2. Supprimer les emojis (ne se prononcent pas)
  optimized = optimized.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');

  // 3. Raccourcir les formulations verbeuses
  const shortenings = {
    "je vous confirme que": "c'est confirmé,",
    "je vous informe que": "",
    "je souhaiterais": "je voudrais",
    "est-ce que vous": "vous",
    "est-ce que": "",
    "n'hésitez pas à": "",
    "je me permets de": "",
    "je vous remercie pour": "merci pour",
    "je vous remercie de": "merci de",
    "dans le cadre de": "pour",
    "au niveau de": "pour",
    "en ce qui concerne": "pour",
    "il est possible de": "on peut",
    "afin de": "pour",
    "permettre de": "",
    "actuellement": "",
    "également": "aussi",
    "néanmoins": "mais",
    "toutefois": "mais",
    "cependant": "mais",
    "par conséquent": "donc",
    "je reste à votre disposition": "",
    "n'hésitez pas": "",
    "il est important de noter que": "",
    "je tiens à vous informer que": "",
    "je vous prie de": ""
  };

  for (const [long, short] of Object.entries(shortenings)) {
    optimized = optimized.replace(new RegExp(long, 'gi'), short);
  }

  // 4. Convertir les symboles
  optimized = optimized.replace(/(\d+)\s*€/g, '$1 euro');
  optimized = optimized.replace(/(\d+)\s*EUR/gi, '$1 euro');
  // D'abord les heures rondes (9h00, 17H00 → "9 heures", "17 heures")
  optimized = optimized.replace(/(\d{1,2})\s*[hH]00(?!\s*heure)/g, '$1 heures');
  // Puis les heures avec minutes (9h30 → "9 heures 30")
  optimized = optimized.replace(/(\d{1,2})\s*[hH](\d{2})(?!\s*heure)/g, '$1 heures $2');
  // Puis les heures sans minutes (9h → "9 heures") — (?![a-zà-ü\d]) évite de matcher le h de "heures"
  optimized = optimized.replace(/(\d{1,2})\s*[hH](?![a-z\u00e0-\u00fc\d])/gi, '$1 heures');

  // 5. Nettoyer les espaces créés
  optimized = optimized.replace(/\s+/g, ' ').trim();
  optimized = optimized.replace(/\s+([,.\?!])/g, '$1');
  optimized = optimized.replace(/,\s*,/g, ',');

  // 6. Supprimer le markdown
  optimized = optimized.replace(/\*\*(.*?)\*\*/g, '$1');
  optimized = optimized.replace(/\*(.*?)\*/g, '$1');
  optimized = optimized.replace(/`(.*?)`/g, '$1');
  optimized = optimized.replace(/#{1,6}\s/g, '');
  optimized = optimized.replace(/[-*+]\s/g, '');

  return optimized;
}

/**
 * Détecte si une phrase pré-générée peut être utilisée
 * @param {string} text - Texte à analyser
 * @returns {string|null} - Clé de la phrase pré-générée ou null
 */
function findPregeneratedMatch(text) {
  const normalized = text.toLowerCase().trim();

  // Correspondance exacte
  for (const [key, phrase] of Object.entries(PREGENERATED_PHRASES)) {
    if (normalized === phrase.toLowerCase()) {
      return key;
    }
  }

  // Détection par patterns
  if (/^bonjour\s*[!.]?\s*$/i.test(normalized)) return 'bonjour';
  if (/^bonsoir\s*[!.]?\s*$/i.test(normalized)) return 'bonsoir';
  if (/^d'accord\s*[!.]?\s*$/i.test(normalized) || /^ok\s*[!.]?\s*$/i.test(normalized)) return 'ok';
  if (/^parfait\s*[!.]?\s*$/i.test(normalized)) return 'parfait';
  if (/^super\s*[!.]?\s*$/i.test(normalized)) return 'super';
  if (/^c'est not[eé]\s*[!.]?\s*$/i.test(normalized)) return 'cest_note';
  if (/^tr[eè]s bien\s*[!.]?\s*$/i.test(normalized)) return 'tres_bien';
  if (/au revoir|[aà] bient[oô]t/i.test(normalized)) return 'au_revoir';
  if (/[çc]a vous va\s*\??\s*$/i.test(normalized)) return 'ca_vous_va';
  if (/je comprends/i.test(normalized)) return 'je_comprends';
  if (/pas de souci/i.test(normalized)) return 'pas_de_souci';
  if (/un instant|un moment/i.test(normalized)) return 'un_instant';
  if (/je v[eé]rifie/i.test(normalized)) return 'je_verifie';
  if (/bonne journ[eé]e/i.test(normalized)) return 'bonne_journee';
  if (/bonne soir[eé]e/i.test(normalized)) return 'bonne_soiree';

  return null;
}

// ============================================
// APPEL API ELEVENLABS
// ============================================

/**
 * Appelle l'API ElevenLabs (seulement si pas en cache)
 * @param {string} text - Texte à synthétiser
 * @param {string} voiceId - ID de la voix
 * @returns {Promise<Buffer>} - Buffer audio
 */
async function callElevenLabsAPI(text, voiceId = DEFAULT_VOICE_ID) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY non configurée');
  }

  stats.apiCalls++;
  stats.totalCharacters += text.length;

  console.log(`[VOICE] API Call: "${text.substring(0, 40)}..." (${text.length} chars)`);

  const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text: text,
      model_id: MODEL_ID,
      voice_settings: VOICE_SETTINGS,
      speed: 0.9
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs error ${response.status}: ${error}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ============================================
// FONCTIONS PRINCIPALES
// ============================================

/**
 * Convertit du texte en audio avec optimisation maximale
 * @param {string} text - Texte à convertir
 * @param {Object} options - Options
 * @returns {Promise<Object>} - Résultat avec audio et stats
 */
async function textToSpeech(text, options = {}) {
  const {
    voiceId = DEFAULT_VOICE_ID,
    useCache = true,
    optimize = true
  } = options;

  // 1. Optimiser le texte si demandé
  let processedText = optimize ? optimizeText(text) : text;

  // Log l'économie
  if (optimize && processedText.length < text.length) {
    const saved = text.length - processedText.length;
    console.log(`[VOICE] Optimisé: ${text.length} → ${processedText.length} chars (-${saved})`);
  }

  // 2. Vérifier le cache
  if (useCache) {
    const cached = getCachedAudio(processedText, voiceId);
    if (cached) {
      return {
        success: true,
        audio: cached,
        fromCache: true,
        characters: 0  // Pas de caractères consommés
      };
    }
  }

  // 3. Appeler l'API
  try {
    const audio = await callElevenLabsAPI(processedText, voiceId);

    // 4. Mettre en cache
    if (useCache) {
      cacheAudio(processedText, voiceId, audio);
    }

    return {
      success: true,
      audio,
      fromCache: false,
      characters: processedText.length
    };

  } catch (error) {
    console.error('[VOICE] Erreur TTS:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Génère l'audio pour une réponse complète (découpe en segments)
 * @param {string} text - Texte complet
 * @param {Object} options - Options
 * @returns {Promise<Object>} - Résultat avec audio et stats
 */
async function textToSpeechSmart(text, options = {}) {
  const { voiceId = DEFAULT_VOICE_ID } = options;

  // Découper en segments (par phrase)
  const segments = text
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0);

  const audioBuffers = [];
  let totalChars = 0;
  let cachedChars = 0;

  for (const segment of segments) {
    // Vérifier si c'est une phrase pré-générée
    const pregenKey = findPregeneratedMatch(segment);
    const textToGenerate = pregenKey
      ? PREGENERATED_PHRASES[pregenKey]
      : segment;

    const result = await textToSpeech(textToGenerate, { voiceId });

    if (result.success) {
      audioBuffers.push(result.audio);
      if (result.fromCache) {
        cachedChars += textToGenerate.length;
      } else {
        totalChars += result.characters;
      }
    }
  }

  // Concaténer les audios
  const finalAudio = Buffer.concat(audioBuffers);

  return {
    success: true,
    audio: finalAudio,
    stats: {
      segments: segments.length,
      charactersUsed: totalChars,
      charactersCached: cachedChars,
      percentSaved: cachedChars > 0
        ? Math.round((cachedChars / (totalChars + cachedChars)) * 100)
        : 0
    }
  };
}

/**
 * Synthèse vocale en streaming pour réponses temps réel
 * @param {string} text - Texte à convertir
 * @param {Object} options - Options
 * @returns {Promise<ReadableStream>} - Stream audio
 */
async function textToSpeechStream(text, options = {}) {
  if (!ELEVENLABS_API_KEY) {
    console.warn('[VOICE] ElevenLabs API key non configurée');
    return null;
  }

  const processedText = optimizeText(text);
  const voiceId = options.voiceId || DEFAULT_VOICE_ID;

  console.log(`[VOICE] Stream: "${processedText.substring(0, 50)}..."`);

  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: processedText,
        model_id: MODEL_ID,
        voice_settings: VOICE_SETTINGS,
        speed: 0.9,
        optimize_streaming_latency: 3
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs streaming error ${response.status}: ${errorText}`);
    }

    stats.apiCalls++;
    stats.totalCharacters += processedText.length;

    return response.body;

  } catch (error) {
    console.error('[VOICE] Erreur stream:', error.message);
    throw error;
  }
}

// ============================================
// PRÉ-GÉNÉRATION DES PHRASES COURANTES
// ============================================

/**
 * Pré-génère toutes les phrases courantes (à appeler au démarrage ou 1 fois)
 * @param {string} voiceId - ID de la voix
 * @returns {Promise<Object>} - Résultat avec compteurs
 */
async function pregenerateCommonPhrases(voiceId = DEFAULT_VOICE_ID) {
  console.log('[VOICE] Pré-génération des phrases courantes...');

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  const phrases = Object.entries(PREGENERATED_PHRASES);

  for (const [key, phrase] of phrases) {
    // Vérifier si déjà en cache
    const cached = getCachedAudio(phrase, voiceId);
    if (cached) {
      skipped++;
      continue;
    }

    // Générer et cacher
    try {
      const result = await textToSpeech(phrase, { voiceId, useCache: true, optimize: false });
      if (result.success) {
        generated++;
        console.log(`[VOICE] Généré: ${key}`);
      } else {
        errors++;
      }
    } catch (error) {
      console.error(`[VOICE] Erreur pour ${key}:`, error.message);
      errors++;
    }

    // Pause pour éviter le rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[VOICE] Pré-génération terminée: ${generated} générés, ${skipped} en cache, ${errors} erreurs`);

  return { generated, skipped, errors, total: phrases.length };
}

// ============================================
// GESTION DU CACHE
// ============================================

/**
 * Vide le cache audio
 * @returns {Object} - Nombre de fichiers supprimés
 */
function clearCache() {
  const files = fs.readdirSync(CACHE_DIR);
  files.forEach(file => {
    if (file.endsWith('.mp3')) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
  });
  console.log(`[VOICE] Cache vidé: ${files.length} fichiers supprimés`);
  return { cleared: files.length };
}

/**
 * Statistiques du cache
 * @returns {Object} - Stats du cache et de la session
 */
function getCacheStats() {
  let files = [];
  let totalSize = 0;

  try {
    files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.mp3'));
    files.forEach(file => {
      const stat = fs.statSync(path.join(CACHE_DIR, file));
      totalSize += stat.size;
    });
  } catch (error) {
    console.error('[VOICE] Erreur lecture cache:', error.message);
  }

  return {
    cacheFiles: files.length,
    cacheSize: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
    ...stats,
    savingsPercent: stats.totalCharacters > 0
      ? Math.round((stats.charactersSaved / (stats.totalCharacters + stats.charactersSaved)) * 100)
      : 0
  };
}

// ============================================
// UTILITAIRES
// ============================================

/**
 * Obtenir le quota ElevenLabs restant
 * @returns {Promise<Object>} - Informations de quota
 */
async function getQuota() {
  if (!ELEVENLABS_API_KEY) {
    return { available: false, reason: 'API key non configurée' };
  }

  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/user/subscription`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY }
    });

    if (!response.ok) {
      throw new Error(`Quota check failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      available: true,
      used: data.character_count,
      limit: data.character_limit,
      remaining: data.character_limit - data.character_count,
      percentUsed: Math.round((data.character_count / data.character_limit) * 100),
      tier: data.tier
    };
  } catch (error) {
    console.error('[VOICE] Erreur quota:', error.message);
    return { available: false, error: error.message };
  }
}

/**
 * Liste les voix disponibles
 * @returns {Promise<Array>} - Liste des voix
 */
async function listVoices() {
  if (!ELEVENLABS_API_KEY) {
    return [];
  }

  try {
    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY }
    });

    if (!response.ok) {
      throw new Error(`Voice list failed: ${response.status}`);
    }

    const data = await response.json();
    return data.voices.map(v => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels
    }));
  } catch (error) {
    console.error('[VOICE] Erreur liste voix:', error.message);
    return [];
  }
}

/**
 * Réinitialise les statistiques de session
 * @returns {Object} - Stats réinitialisées
 */
function resetStats() {
  stats = {
    totalCharacters: 0,
    cachedHits: 0,
    apiCalls: 0,
    charactersSaved: 0,
    sessionStart: new Date().toISOString()
  };
  return stats;
}

/**
 * Vérifie si le service est configuré
 * @returns {boolean}
 */
function isConfigured() {
  return !!ELEVENLABS_API_KEY;
}

// ============================================
// EXPORTS
// ============================================

export default {
  textToSpeech,
  textToSpeechSmart,
  textToSpeechStream,
  pregenerateCommonPhrases,
  clearCache,
  getCacheStats,
  getQuota,
  listVoices,
  resetStats,
  isConfigured,
  optimizeText,
  findPregeneratedMatch,
  getTextHash,
  PREGENERATED_PHRASES,
  VOICE_SETTINGS,
  DEFAULT_VOICE_ID,
  CACHE_DIR
};

export {
  textToSpeech,
  textToSpeechSmart,
  textToSpeechStream,
  pregenerateCommonPhrases,
  clearCache,
  getCacheStats,
  getQuota,
  listVoices,
  resetStats,
  isConfigured,
  optimizeText,
  findPregeneratedMatch,
  getTextHash,
  PREGENERATED_PHRASES,
  VOICE_SETTINGS,
  DEFAULT_VOICE_ID,
  CACHE_DIR
};
