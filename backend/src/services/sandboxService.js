/**
 * Sandbox Service - Environnement de test pour Halimah
 *
 * Permet de :
 * - Tester les actions avant de les exécuter en production
 * - Simuler des publications sans vraiment publier
 * - Valider le contenu avant mise en ligne
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Chemin de base du sandbox
const SANDBOX_BASE = path.join(process.cwd(), 'data', 'sandbox');

// Modes disponibles
export const SandboxModes = {
  SIMULATION: 'simulation',   // Teste sans rien faire
  VALIDATION: 'validation',   // Prépare pour approbation
  PRODUCTION: 'production'    // Exécute réellement
};

// État global du sandbox
let currentMode = SandboxModes.SIMULATION;
let pendingValidations = new Map();

/**
 * Obtenir le mode actuel
 */
export function getMode() {
  return currentMode;
}

/**
 * Définir le mode du sandbox
 */
export function setMode(mode) {
  if (!Object.values(SandboxModes).includes(mode)) {
    throw new Error(`Mode invalide: ${mode}. Modes disponibles: ${Object.values(SandboxModes).join(', ')}`);
  }

  const previousMode = currentMode;
  currentMode = mode;

  console.log(`[SANDBOX] Mode changé: ${previousMode} → ${mode}`);

  return {
    previousMode,
    currentMode: mode,
    message: `Mode sandbox changé de "${previousMode}" à "${mode}"`
  };
}

/**
 * Vérifier si on est en mode production
 */
export function isProduction() {
  return currentMode === SandboxModes.PRODUCTION;
}

/**
 * Vérifier si on est en mode simulation
 */
export function isSimulation() {
  return currentMode === SandboxModes.SIMULATION;
}

/**
 * Simuler un post (sans vraiment publier)
 */
export async function simulatePost(platform, content, options = {}) {
  const postId = uuidv4();
  const timestamp = new Date().toISOString();

  console.log(`[SANDBOX] Simulation post ${platform} (ID: ${postId})`);

  // Analyser le contenu
  const analysis = analyzeContent(content, platform);

  // Créer la preview
  const preview = {
    id: postId,
    platform,
    content: {
      text: content.caption || content.text || content,
      hashtags: content.hashtags || extractHashtags(content.caption || content),
      imageUrl: content.imagePath || content.imageUrl || null,
      videoUrl: content.videoPath || content.videoUrl || null
    },
    analysis,
    options,
    createdAt: timestamp,
    mode: currentMode,
    status: 'simulated'
  };

  // Sauvegarder dans le dossier sandbox
  await saveSimulatedPost(preview);

  // Si en mode validation, ajouter aux pending
  if (currentMode === SandboxModes.VALIDATION) {
    preview.status = 'pending_validation';
    pendingValidations.set(postId, preview);
  }

  return {
    success: true,
    postId,
    preview,
    analysis,
    message: currentMode === SandboxModes.VALIDATION
      ? `Post préparé pour validation (ID: ${postId})`
      : `Post simulé avec succès (ID: ${postId})`,
    wouldPublish: currentMode === SandboxModes.PRODUCTION
  };
}

/**
 * Analyser le contenu d'un post
 */
export function analyzeContent(content, platform) {
  const text = content.caption || content.text || (typeof content === 'string' ? content : '');
  const hashtags = content.hashtags || extractHashtags(text);

  const analysis = {
    score: 0,
    maxScore: 100,
    checks: [],
    warnings: [],
    suggestions: []
  };

  // Check 1: Longueur du texte
  const textLength = text.replace(/#\w+/g, '').trim().length;
  if (textLength > 20) {
    analysis.score += 15;
    analysis.checks.push({ name: 'text_length', passed: true, detail: `${textLength} caractères` });
  } else {
    analysis.warnings.push('Le texte est trop court. Ajoutez plus de contexte.');
    analysis.checks.push({ name: 'text_length', passed: false, detail: `${textLength} caractères (minimum recommandé: 20)` });
  }

  // Check 2: Hashtags
  const hashtagCount = hashtags.length;
  const optimalHashtags = platform === 'instagram' ? { min: 5, max: 30 } :
                          platform === 'tiktok' ? { min: 3, max: 10 } :
                          { min: 1, max: 5 };

  if (hashtagCount >= optimalHashtags.min && hashtagCount <= optimalHashtags.max) {
    analysis.score += 20;
    analysis.checks.push({ name: 'hashtags', passed: true, detail: `${hashtagCount} hashtags` });
  } else if (hashtagCount < optimalHashtags.min) {
    analysis.warnings.push(`Ajoutez plus de hashtags (${optimalHashtags.min}-${optimalHashtags.max} recommandés pour ${platform})`);
    analysis.checks.push({ name: 'hashtags', passed: false, detail: `${hashtagCount} hashtags (min: ${optimalHashtags.min})` });
  } else {
    analysis.warnings.push(`Trop de hashtags. ${platform} recommande ${optimalHashtags.max} maximum.`);
    analysis.checks.push({ name: 'hashtags', passed: false, detail: `${hashtagCount} hashtags (max: ${optimalHashtags.max})` });
  }

  // Check 3: Média attaché
  const hasMedia = content.imagePath || content.imageUrl || content.videoPath || content.videoUrl;
  if (hasMedia) {
    analysis.score += 25;
    analysis.checks.push({ name: 'media', passed: true, detail: 'Média attaché' });
  } else {
    analysis.warnings.push('Aucun média attaché. Les posts avec images/vidéos ont plus d\'engagement.');
    analysis.checks.push({ name: 'media', passed: false, detail: 'Pas de média' });
  }

  // Check 4: Call to action
  const ctaPatterns = [
    /réserv/i, /rdv/i, /rendez-vous/i, /contact/i, /appelez/i,
    /lien/i, /bio/i, /dm/i, /message/i, /comment/i,
    /likez/i, /partagez/i, /suivez/i, /abonnez/i
  ];
  const hasCTA = ctaPatterns.some(pattern => pattern.test(text));
  if (hasCTA) {
    analysis.score += 15;
    analysis.checks.push({ name: 'cta', passed: true, detail: 'Call-to-action présent' });
  } else {
    analysis.suggestions.push('Ajoutez un call-to-action (ex: "Réservez maintenant", "Lien en bio")');
    analysis.checks.push({ name: 'cta', passed: false, detail: 'Pas de call-to-action' });
  }

  // Check 5: Emojis
  const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
  const emojis = text.match(emojiPattern) || [];
  if (emojis.length > 0 && emojis.length <= 10) {
    analysis.score += 10;
    analysis.checks.push({ name: 'emojis', passed: true, detail: `${emojis.length} emojis` });
  } else if (emojis.length === 0) {
    analysis.suggestions.push('Ajoutez quelques emojis pour rendre le post plus engageant');
    analysis.checks.push({ name: 'emojis', passed: false, detail: 'Pas d\'emojis' });
  } else {
    analysis.warnings.push('Trop d\'emojis peuvent distraire du message');
    analysis.checks.push({ name: 'emojis', passed: false, detail: `${emojis.length} emojis (trop)` });
  }

  // Check 6: Mentions de prix
  const hasPricing = /\d+\s*€|\d+\s*euros?/i.test(text);
  if (hasPricing) {
    analysis.score += 10;
    analysis.checks.push({ name: 'pricing', passed: true, detail: 'Prix mentionné' });
  } else {
    analysis.suggestions.push('Mentionner le prix peut aider à qualifier les prospects');
    analysis.checks.push({ name: 'pricing', passed: false, detail: 'Pas de prix mentionné' });
  }

  // Check 7: Horaires de publication optimaux
  const now = new Date();
  const hour = now.getHours();
  const isOptimalTime = (hour >= 11 && hour <= 13) || (hour >= 18 && hour <= 21);
  if (isOptimalTime) {
    analysis.score += 5;
    analysis.checks.push({ name: 'timing', passed: true, detail: `Publication à ${hour}h (optimal)` });
  } else {
    analysis.suggestions.push(`L'heure actuelle (${hour}h) n'est pas optimale. Les meilleurs créneaux sont 11h-13h et 18h-21h.`);
    analysis.checks.push({ name: 'timing', passed: false, detail: `Publication à ${hour}h (non optimal)` });
  }

  // Qualification du score
  analysis.grade = analysis.score >= 80 ? 'A' :
                   analysis.score >= 60 ? 'B' :
                   analysis.score >= 40 ? 'C' :
                   analysis.score >= 20 ? 'D' : 'F';

  analysis.recommendation = analysis.score >= 70
    ? 'Prêt à publier'
    : analysis.score >= 50
    ? 'Quelques améliorations recommandées'
    : 'Améliorations nécessaires avant publication';

  return analysis;
}

/**
 * Extraire les hashtags d'un texte
 */
function extractHashtags(text) {
  if (!text) return [];
  const matches = text.match(/#\w+/g);
  return matches || [];
}

/**
 * Sauvegarder un post simulé
 */
async function saveSimulatedPost(post) {
  const filename = `${post.platform}_${post.id}.json`;
  const filepath = path.join(SANDBOX_BASE, 'posts', filename);

  await fs.mkdir(path.join(SANDBOX_BASE, 'posts'), { recursive: true });
  await fs.writeFile(filepath, JSON.stringify(post, null, 2), 'utf-8');

  // Logger l'action
  await logSandboxAction('simulate_post', post);

  return filepath;
}

/**
 * Logger une action sandbox
 */
async function logSandboxAction(action, data) {
  const logDir = path.join(SANDBOX_BASE, 'logs');
  await fs.mkdir(logDir, { recursive: true });

  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(logDir, `sandbox_${today}.log`);

  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    mode: currentMode,
    data: {
      id: data.id,
      platform: data.platform,
      status: data.status
    }
  };

  await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n', 'utf-8');
}

/**
 * Valider un post en attente
 */
export async function validatePost(postId, approved, feedback = '') {
  const post = pendingValidations.get(postId);

  if (!post) {
    // Essayer de charger depuis le fichier
    try {
      const files = await fs.readdir(path.join(SANDBOX_BASE, 'posts'));
      const postFile = files.find(f => f.includes(postId));
      if (postFile) {
        const content = await fs.readFile(path.join(SANDBOX_BASE, 'posts', postFile), 'utf-8');
        const loadedPost = JSON.parse(content);
        if (loadedPost.status !== 'pending_validation') {
          return {
            success: false,
            error: `Post ${postId} n'est pas en attente de validation (status: ${loadedPost.status})`
          };
        }
        pendingValidations.set(postId, loadedPost);
      } else {
        return {
          success: false,
          error: `Post ${postId} non trouvé`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Impossible de charger le post ${postId}: ${error.message}`
      };
    }
  }

  const validatedPost = pendingValidations.get(postId);
  validatedPost.validatedAt = new Date().toISOString();
  validatedPost.approved = approved;
  validatedPost.feedback = feedback;
  validatedPost.status = approved ? 'approved' : 'rejected';

  // Sauvegarder les modifications
  await saveSimulatedPost(validatedPost);

  // Retirer des pending
  pendingValidations.delete(postId);

  // Logger
  await logSandboxAction(approved ? 'approve_post' : 'reject_post', validatedPost);

  return {
    success: true,
    postId,
    status: validatedPost.status,
    message: approved
      ? `Post ${postId} approuvé et prêt pour publication`
      : `Post ${postId} rejeté. Feedback: ${feedback}`,
    post: validatedPost
  };
}

/**
 * Lister les posts en attente de validation
 */
export async function getPendingValidations() {
  const pending = Array.from(pendingValidations.values());

  // Aussi charger depuis les fichiers
  try {
    const postsDir = path.join(SANDBOX_BASE, 'posts');
    const files = await fs.readdir(postsDir);

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(postsDir, file), 'utf-8');
        const post = JSON.parse(content);
        if (post.status === 'pending_validation' && !pendingValidations.has(post.id)) {
          pending.push(post);
          pendingValidations.set(post.id, post);
        }
      }
    }
  } catch (error) {
    // Dossier n'existe pas encore
  }

  return {
    count: pending.length,
    posts: pending,
    message: pending.length > 0
      ? `${pending.length} post(s) en attente de validation`
      : 'Aucun post en attente de validation'
  };
}

/**
 * Obtenir un post simulé par ID
 */
export async function getSimulatedPost(postId) {
  // Chercher en mémoire
  if (pendingValidations.has(postId)) {
    return pendingValidations.get(postId);
  }

  // Chercher dans les fichiers
  try {
    const postsDir = path.join(SANDBOX_BASE, 'posts');
    const files = await fs.readdir(postsDir);
    const postFile = files.find(f => f.includes(postId));

    if (postFile) {
      const content = await fs.readFile(path.join(postsDir, postFile), 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    // Fichier non trouvé
  }

  return null;
}

/**
 * Lister tous les posts simulés
 */
export async function listSimulatedPosts(options = {}) {
  const { platform, status, limit = 20 } = options;
  const posts = [];

  try {
    const postsDir = path.join(SANDBOX_BASE, 'posts');
    const files = await fs.readdir(postsDir);

    for (const file of files.slice(0, limit * 2)) {
      if (!file.endsWith('.json')) continue;

      // Filtrer par plateforme si spécifié
      if (platform && !file.startsWith(platform)) continue;

      const content = await fs.readFile(path.join(postsDir, file), 'utf-8');
      const post = JSON.parse(content);

      // Filtrer par status si spécifié
      if (status && post.status !== status) continue;

      posts.push(post);

      if (posts.length >= limit) break;
    }
  } catch (error) {
    // Dossier n'existe pas encore
  }

  // Trier par date (plus récent en premier)
  posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    count: posts.length,
    posts,
    filters: { platform, status, limit }
  };
}

/**
 * Supprimer un post simulé
 */
export async function deleteSimulatedPost(postId) {
  // Retirer de la mémoire
  pendingValidations.delete(postId);

  // Supprimer le fichier
  try {
    const postsDir = path.join(SANDBOX_BASE, 'posts');
    const files = await fs.readdir(postsDir);
    const postFile = files.find(f => f.includes(postId));

    if (postFile) {
      await fs.unlink(path.join(postsDir, postFile));
      await logSandboxAction('delete_post', { id: postId });

      return {
        success: true,
        message: `Post ${postId} supprimé`
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Impossible de supprimer le post: ${error.message}`
    };
  }

  return {
    success: false,
    error: `Post ${postId} non trouvé`
  };
}

/**
 * Nettoyer les anciens fichiers sandbox
 */
export async function cleanupSandbox(olderThanDays = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  let deletedCount = 0;
  const directories = ['posts', 'screenshots', 'temp'];

  for (const dir of directories) {
    try {
      const dirPath = path.join(SANDBOX_BASE, dir);
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        const filepath = path.join(dirPath, file);
        const stats = await fs.stat(filepath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filepath);
          deletedCount++;
        }
      }
    } catch (error) {
      // Dossier n'existe pas
    }
  }

  // Nettoyer les logs de plus de 30 jours
  try {
    const logsDir = path.join(SANDBOX_BASE, 'logs');
    const logFiles = await fs.readdir(logsDir);
    const logCutoff = new Date();
    logCutoff.setDate(logCutoff.getDate() - 30);

    for (const file of logFiles) {
      const filepath = path.join(logsDir, file);
      const stats = await fs.stat(filepath);

      if (stats.mtime < logCutoff) {
        await fs.unlink(filepath);
        deletedCount++;
      }
    }
  } catch (error) {
    // Dossier n'existe pas
  }

  return {
    success: true,
    deletedCount,
    message: `${deletedCount} fichier(s) nettoyé(s) (plus anciens que ${olderThanDays} jours)`
  };
}

/**
 * Obtenir les statistiques du sandbox
 */
export async function getSandboxStats() {
  const stats = {
    mode: currentMode,
    pendingValidations: pendingValidations.size,
    posts: { total: 0, byStatus: {}, byPlatform: {} }
  };

  try {
    const postsDir = path.join(SANDBOX_BASE, 'posts');
    const files = await fs.readdir(postsDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const content = await fs.readFile(path.join(postsDir, file), 'utf-8');
      const post = JSON.parse(content);

      stats.posts.total++;
      stats.posts.byStatus[post.status] = (stats.posts.byStatus[post.status] || 0) + 1;
      stats.posts.byPlatform[post.platform] = (stats.posts.byPlatform[post.platform] || 0) + 1;
    }
  } catch (error) {
    // Dossier n'existe pas encore
  }

  return stats;
}

export default {
  SandboxModes,
  getMode,
  setMode,
  isProduction,
  isSimulation,
  simulatePost,
  analyzeContent,
  validatePost,
  getPendingValidations,
  getSimulatedPost,
  listSimulatedPosts,
  deleteSimulatedPost,
  cleanupSandbox,
  getSandboxStats
};
