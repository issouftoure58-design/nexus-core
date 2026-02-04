import { Worker } from 'bullmq';
import { getRedis, isAvailable, initRedis } from '../config/redis.js';
import { TaskTypes } from '../services/taskQueue.js';

// Importers les handlers
import { handleSocialMediaTask } from './handlers/socialMediaHandler.js';
import { handleContentTask } from './handlers/contentHandler.js';
import { handleClientTask } from './handlers/clientHandler.js';
import { handleAnalyticsTask } from './handlers/analyticsHandler.js';
import { handleLearningTask } from './handlers/learningHandler.js';

// ============ WORKER PRINCIPAL ============

let worker = null;
let isInitialized = false;

/**
 * Initialise le worker Halimah
 * @returns {Worker|null} Worker instance ou null si Redis non disponible
 */
export async function initWorker() {
  if (isInitialized) {
    console.log('[WORKER] ⚠️ Worker déjà initialisé');
    return worker;
  }

  // S'assurer que Redis est initialisé
  await initRedis();

  // Vérifier si Redis est disponible
  if (!isAvailable()) {
    console.log('[WORKER] ⚠️ Redis non disponible - Worker désactivé');
    console.log('[WORKER] Le serveur fonctionne normalement sans le worker');
    isInitialized = true;
    return null;
  }

  const redis = getRedis();
  if (!redis) {
    console.log('[WORKER] ⚠️ Connexion Redis non disponible - Worker désactivé');
    isInitialized = true;
    return null;
  }

  console.log('[WORKER] 🚀 Démarrage du worker Halimah...');

  try {
    worker = new Worker('halimah-tasks', async (job) => {
      console.log(`\n[WORKER] 🤖 Halimah exécute: ${job.name}`);
      console.log(`[WORKER]    ID: ${job.id}`);
      console.log(`[WORKER]    Données:`, JSON.stringify(job.data, null, 2));

      const startTime = Date.now();

      try {
        let result;

        // Router vers le bon handler selon le type
        switch (job.name) {
          // Réseaux sociaux
          case TaskTypes.POST_INSTAGRAM:
          case TaskTypes.POST_FACEBOOK:
          case TaskTypes.POST_TIKTOK:
          case TaskTypes.RESPOND_DM:
          case TaskTypes.ANALYZE_ENGAGEMENT:
            result = await handleSocialMediaTask(job);
            break;

          // Contenu
          case TaskTypes.GENERATE_CONTENT:
          case TaskTypes.GENERATE_IMAGE:
            result = await handleContentTask(job);
            break;

          // Clients
          case TaskTypes.SEND_REMINDER:
          case TaskTypes.FOLLOWUP_CLIENT:
          case TaskTypes.BIRTHDAY_WISH:
            result = await handleClientTask(job);
            break;

          // Analytics
          case TaskTypes.DAILY_REPORT:
          case TaskTypes.WEEKLY_ANALYTICS:
          case TaskTypes.COMPETITOR_CHECK:
            result = await handleAnalyticsTask(job);
            break;

          // Apprentissage
          case TaskTypes.LEARN_FROM_FEEDBACK:
          case TaskTypes.UPDATE_INSIGHTS:
            result = await handleLearningTask(job);
            break;

          // Custom
          case TaskTypes.CUSTOM_TASK:
            result = await handleCustomTask(job);
            break;

          default:
            console.warn(`[WORKER] ⚠️ Type de tâche inconnu: ${job.name}`);
            result = { status: 'unknown_task_type', type: job.name };
        }

        const duration = Date.now() - startTime;
        console.log(`[WORKER] ✅ Tâche terminée en ${duration}ms`);

        return {
          success: true,
          result,
          duration
        };

      } catch (error) {
        console.error(`[WORKER] ❌ Erreur tâche ${job.name}:`, error);
        throw error;
      }

    }, {
      connection: redis,
      concurrency: 5,  // Max 5 tâches en parallèle
      limiter: {
        max: 10,
        duration: 1000  // Max 10 tâches par seconde
      }
    });

    // ============ ÉVÉNEMENTS ============

    worker.on('completed', (job, result) => {
      console.log(`[WORKER] ✅ Job ${job.id} terminé`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[WORKER] ❌ Job ${job?.id} échoué:`, err.message);
    });

    worker.on('error', (err) => {
      console.error('[WORKER] ❌ Erreur Worker:', err);
    });

    worker.on('ready', () => {
      console.log('[WORKER] ✅ Worker prêt à recevoir des tâches');
    });

    isInitialized = true;
    return worker;

  } catch (error) {
    console.error('[WORKER] ❌ Erreur initialisation:', error.message);
    console.log('[WORKER] Le serveur continue sans le worker');
    isInitialized = true;
    return null;
  }
}

/**
 * Arrête le worker proprement
 */
export async function stopWorker() {
  if (worker) {
    console.log('[WORKER] 🛑 Arrêt du worker...');
    await worker.close();
    worker = null;
    isInitialized = false;
    console.log('[WORKER] ✅ Worker arrêté');
  }
}

/**
 * Vérifie si le worker est actif
 */
export function isWorkerActive() {
  return worker !== null && isInitialized;
}

/**
 * Handler pour les tâches personnalisées
 */
async function handleCustomTask(job) {
  const { data } = job.data;

  console.log('[WORKER] 📝 Tâche personnalisée:', data);

  // Ici on pourrait appeler Halimah Pro pour exécuter une action complexe
  // Pour l'instant, on log simplement

  return {
    executed: true,
    data: data,
    timestamp: new Date().toISOString()
  };
}

export default { initWorker, stopWorker, isWorkerActive };
