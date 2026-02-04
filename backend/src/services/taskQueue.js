import { Queue } from 'bullmq';
import { getRedis, isAvailable, initRedis } from '../config/redis.js';

// ============ QUEUES (LAZY LOADING) ============

let halimahQueue = null;
let queueInitialized = false;

/**
 * Initialise la queue (lazy)
 * @returns {Queue|null}
 */
async function initQueue() {
  if (queueInitialized) {
    return halimahQueue;
  }
  queueInitialized = true;

  // S'assurer que Redis est initialisé
  await initRedis();

  if (!isAvailable()) {
    console.log('[QUEUE] ⚠️ Redis non disponible - File de tâches désactivée');
    return null;
  }

  const redis = getRedis();
  if (!redis) {
    return null;
  }

  halimahQueue = new Queue('halimah-tasks', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: 100,
      removeOnFail: 50
    }
  });

  console.log('[QUEUE] ✅ File de tâches initialisée');
  return halimahQueue;
}

/**
 * Récupère la queue (peut être null si Redis non disponible)
 */
export async function getQueue() {
  if (!queueInitialized) {
    await initQueue();
  }
  return halimahQueue;
}

// Exporter pour compatibilité (sera null jusqu'à l'init)
export { halimahQueue };

// ============ TYPES DE TÂCHES ============

export const TaskTypes = {
  // Réseaux sociaux
  POST_INSTAGRAM: 'post_instagram',
  POST_FACEBOOK: 'post_facebook',
  POST_TIKTOK: 'post_tiktok',
  RESPOND_DM: 'respond_dm',
  ANALYZE_ENGAGEMENT: 'analyze_engagement',

  // Contenu
  GENERATE_CONTENT: 'generate_content',
  GENERATE_IMAGE: 'generate_image',

  // Clients
  SEND_REMINDER: 'send_reminder',
  FOLLOWUP_CLIENT: 'followup_client',
  BIRTHDAY_WISH: 'birthday_wish',

  // Business
  DAILY_REPORT: 'daily_report',
  WEEKLY_ANALYTICS: 'weekly_analytics',
  COMPETITOR_CHECK: 'competitor_check',

  // Apprentissage
  LEARN_FROM_FEEDBACK: 'learn_from_feedback',
  UPDATE_INSIGHTS: 'update_insights',

  // Custom
  CUSTOM_TASK: 'custom_task'
};

// ============ AJOUTER UNE TÂCHE ============

/**
 * Ajoute une tâche à la queue
 * @param {string} type - Type de tâche (TaskTypes)
 * @param {object} data - Données de la tâche
 * @param {object} options - Options (delay, priority, etc.)
 */
export async function addTask(type, data, options = {}) {
  const queue = await getQueue();

  if (!queue) {
    console.log(`[QUEUE] ⚠️ Tâche ${type} ignorée (Redis non disponible)`);
    return null;
  }

  try {
    const job = await queue.add(type, {
      type,
      data,
      createdAt: new Date().toISOString(),
      tenantId: data.tenantId || 'default'
    }, {
      priority: options.priority || 5,
      delay: options.delay || 0,
      ...options
    });

    console.log(`[QUEUE] 📋 Tâche ajoutée: ${type} (ID: ${job.id})`);
    return job;
  } catch (error) {
    console.error(`[QUEUE] ❌ Erreur ajout tâche ${type}:`, error.message);
    throw error;
  }
}

/**
 * Planifie une tâche récurrente
 * @param {string} type - Type de tâche
 * @param {object} data - Données
 * @param {string} pattern - Cron pattern (ex: "0 10 * * *" = tous les jours à 10h)
 */
export async function scheduleRecurringTask(type, data, pattern) {
  const queue = await getQueue();

  if (!queue) {
    console.log(`[QUEUE] ⚠️ Tâche récurrente ${type} ignorée (Redis non disponible)`);
    return null;
  }

  try {
    const job = await queue.add(type, {
      type,
      data,
      recurring: true,
      pattern,
      tenantId: data.tenantId || 'default'
    }, {
      repeat: {
        pattern: pattern
      }
    });

    console.log(`[QUEUE] 🔄 Tâche récurrente planifiée: ${type} (${pattern})`);
    return job;
  } catch (error) {
    console.error(`[QUEUE] ❌ Erreur planification récurrente ${type}:`, error.message);
    throw error;
  }
}

/**
 * Planifie une tâche pour une date spécifique
 * @param {string} type - Type de tâche
 * @param {object} data - Données
 * @param {Date|string} scheduledDate - Date d'exécution
 */
export async function scheduleTaskAt(type, data, scheduledDate) {
  const targetDate = new Date(scheduledDate);
  const delay = targetDate.getTime() - Date.now();

  if (delay <= 0) {
    console.warn(`[QUEUE] ⚠️ Date passée, exécution immédiate de ${type}`);
    return await addTask(type, data);
  }

  return await addTask(type, data, { delay });
}

/**
 * Liste les tâches en attente
 */
export async function getPendingTasks() {
  const queue = await getQueue();

  if (!queue) {
    return { waiting: [], delayed: [], active: [], repeatable: [] };
  }

  try {
    const waiting = await queue.getWaiting();
    const delayed = await queue.getDelayed();
    const active = await queue.getActive();
    const repeatable = await queue.getRepeatableJobs();

    return {
      waiting: waiting.map(j => ({
        id: j.id,
        type: j.name,
        data: j.data,
        createdAt: j.data?.createdAt
      })),
      delayed: delayed.map(j => ({
        id: j.id,
        type: j.name,
        data: j.data,
        processAt: new Date(j.processedOn || j.timestamp + (j.opts?.delay || 0)).toISOString()
      })),
      active: active.map(j => ({
        id: j.id,
        type: j.name,
        data: j.data,
        startedAt: j.processedOn ? new Date(j.processedOn).toISOString() : null
      })),
      repeatable: repeatable.map(j => ({
        key: j.key,
        name: j.name,
        pattern: j.pattern,
        next: j.next ? new Date(j.next).toISOString() : null
      }))
    };
  } catch (error) {
    console.error('[QUEUE] ❌ Erreur récupération tâches:', error.message);
    return { waiting: [], delayed: [], active: [], repeatable: [] };
  }
}

/**
 * Annule une tâche
 */
export async function cancelTask(jobId) {
  const queue = await getQueue();

  if (!queue) {
    return { success: false, message: 'Redis non disponible' };
  }

  try {
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[QUEUE] 🗑️ Tâche annulée: ${jobId}`);
      return { success: true, message: `Tâche ${jobId} annulée` };
    }
    return { success: false, message: `Tâche ${jobId} non trouvée` };
  } catch (error) {
    console.error(`[QUEUE] ❌ Erreur annulation tâche ${jobId}:`, error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Annule une tâche récurrente
 */
export async function cancelRecurringTask(key) {
  const queue = await getQueue();

  if (!queue) {
    return { success: false, message: 'Redis non disponible' };
  }

  try {
    const removed = await queue.removeRepeatableByKey(key);
    if (removed) {
      console.log(`[QUEUE] 🗑️ Tâche récurrente annulée: ${key}`);
      return { success: true, message: `Tâche récurrente ${key} annulée` };
    }
    return { success: false, message: `Tâche récurrente ${key} non trouvée` };
  } catch (error) {
    console.error(`[QUEUE] ❌ Erreur annulation récurrente ${key}:`, error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Obtient les statistiques de la queue
 */
export async function getQueueStats() {
  const queue = await getQueue();

  if (!queue) {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, total: 0, available: false };
  }

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
      available: true
    };
  } catch (error) {
    console.error('[QUEUE] ❌ Erreur stats:', error.message);
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, total: 0, available: false };
  }
}

/**
 * Parse une expression temporelle naturelle en délai (millisecondes)
 */
export function parseTimeExpression(expression) {
  if (!expression) return 0;

  const now = new Date();
  const expr = expression.toLowerCase().trim();

  // "maintenant" ou "now"
  if (expr === 'maintenant' || expr === 'now') {
    return 0;
  }

  // "dans X heures/minutes"
  const inMatch = expr.match(/dans\s+(\d+)\s+(heure|heures|minute|minutes|h|min|m)/i);
  if (inMatch) {
    const value = parseInt(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    if (unit.startsWith('h')) return value * 60 * 60 * 1000;
    if (unit.startsWith('m')) return value * 60 * 1000;
  }

  // "demain à Xh"
  const tomorrowMatch = expr.match(/demain\s+(?:à\s+)?(\d{1,2})(?:h|:)?(\d{0,2})?/i);
  if (tomorrowMatch) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(parseInt(tomorrowMatch[1]), parseInt(tomorrowMatch[2] || 0), 0, 0);
    return tomorrow.getTime() - now.getTime();
  }

  // "lundi/mardi/... à Xh"
  const dayMatch = expr.match(/(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(?:à\s+)?(\d{1,2})(?:h|:)?(\d{0,2})?/i);
  if (dayMatch) {
    const days = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
    const targetDay = days[dayMatch[1].toLowerCase()];
    const targetDate = new Date(now);
    const currentDay = targetDate.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    targetDate.setDate(targetDate.getDate() + daysUntil);
    targetDate.setHours(parseInt(dayMatch[2]), parseInt(dayMatch[3] || 0), 0, 0);
    return targetDate.getTime() - now.getTime();
  }

  return 0; // Par défaut, exécution immédiate
}

/**
 * Parse une expression temporelle en pattern cron
 */
export function parseToCronPattern(expression) {
  if (!expression) return null;

  const expr = expression.toLowerCase().trim();

  // "tous les jours à Xh"
  const dailyMatch = expr.match(/tous\s+les\s+jours\s+(?:à\s+)?(\d{1,2})(?:h|:)?(\d{0,2})?/i);
  if (dailyMatch) {
    return `${dailyMatch[2] || 0} ${dailyMatch[1]} * * *`;
  }

  // "tous les lundis/mardis/... à Xh"
  const weeklyMatch = expr.match(/tous\s+les\s+(lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?)\s+(?:à\s+)?(\d{1,2})(?:h|:)?(\d{0,2})?/i);
  if (weeklyMatch) {
    const dayMap = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
    const dayName = weeklyMatch[1].replace(/s$/, '');
    return `${weeklyMatch[3] || 0} ${weeklyMatch[2]} * * ${dayMap[dayName]}`;
  }

  // "toutes les X heures"
  const hourlyMatch = expr.match(/toutes\s+les\s+(\d+)\s+heures?/i);
  if (hourlyMatch) {
    return `0 */${hourlyMatch[1]} * * *`;
  }

  return null; // Non reconnu
}
