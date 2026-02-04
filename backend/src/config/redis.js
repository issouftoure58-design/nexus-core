/**
 * Configuration Redis OPTIONNELLE
 * Le serveur fonctionne sans Redis, mais certaines fonctionnalités seront désactivées
 * (Agent Autonome, File de tâches BullMQ)
 */

import { Redis } from 'ioredis';

let redisConnection = null;
let isRedisAvailable = false;
let connectionAttempted = false;

/**
 * Initialise la connexion Redis (optionnel)
 * @returns {Redis|null} Instance Redis ou null si non disponible
 */
export async function initRedis() {
  if (connectionAttempted) {
    return redisConnection;
  }
  connectionAttempted = true;

  // Si pas d'URL Redis configurée, skip silencieusement
  if (!process.env.REDIS_URL) {
    console.log('[REDIS] ⚠️ REDIS_URL non configurée - Agent Autonome désactivé');
    return null;
  }

  try {
    redisConnection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null, // Requis par BullMQ
      enableReadyCheck: false,
      connectTimeout: 5000,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 2) {
          console.log('[REDIS] ⚠️ Connexion échouée - Agent Autonome désactivé');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 1000);
      }
    });

    // Tester la connexion
    await redisConnection.connect();
    await redisConnection.ping();

    isRedisAvailable = true;
    console.log('[REDIS] ✅ Connecté');

    // Event handlers
    redisConnection.on('ready', () => {
      console.log('[REDIS] ✅ Prêt à recevoir des commandes');
    });

    redisConnection.on('error', (err) => {
      // Ne pas logger les erreurs de connexion si déjà marqué comme non disponible
      if (isRedisAvailable) {
        console.error('[REDIS] ❌ Erreur:', err.message);
      }
    });

    redisConnection.on('close', () => {
      if (isRedisAvailable) {
        console.log('[REDIS] ⚠️ Connexion fermée');
        isRedisAvailable = false;
      }
    });

    return redisConnection;

  } catch (error) {
    console.log('[REDIS] ⚠️ Non disponible - Agent Autonome désactivé');
    console.log('[REDIS] Le serveur fonctionne normalement sans Redis');
    redisConnection = null;
    isRedisAvailable = false;
    return null;
  }
}

/**
 * Récupère l'instance Redis (peut être null)
 */
export function getRedis() {
  return redisConnection;
}

/**
 * Vérifie si Redis est disponible
 */
export function isAvailable() {
  return isRedisAvailable;
}

/**
 * Récupère la connexion Redis ou initialise si nécessaire
 * Pour compatibilité avec le code existant
 */
export async function getOrInitRedis() {
  if (!connectionAttempted) {
    await initRedis();
  }
  return redisConnection;
}

// Export par défaut pour compatibilité avec l'ancien code
// ATTENTION: Ce sera null si Redis n'est pas initialisé
export default redisConnection;

// Export nommés
export { redisConnection };
