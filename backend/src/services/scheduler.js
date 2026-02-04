import cron from 'node-cron';
import { addTask, scheduleRecurringTask, TaskTypes, parseTimeExpression, parseToCronPattern, getQueue } from './taskQueue.js';
import { isAvailable as isRedisAvailable, initRedis } from '../config/redis.js';

let schedulerInitialized = false;
const scheduledJobs = new Map();

/**
 * Initialise toutes les tâches planifiées
 * Le scheduler fonctionne même sans Redis (les tâches seront simplement ignorées)
 */
export async function initScheduler(tenantId = 'default') {
  if (schedulerInitialized) {
    console.log('[SCHEDULER] ⚠️ Déjà initialisé');
    return;
  }

  console.log('[SCHEDULER] 🕐 Initialisation du scheduler...');

  // Initialiser Redis (optionnel)
  await initRedis();

  if (!isRedisAvailable()) {
    console.log('[SCHEDULER] ⚠️ Redis non disponible - Tâches automatiques désactivées');
    console.log('[SCHEDULER] Le serveur fonctionne normalement sans les tâches planifiées');
    schedulerInitialized = true;
    return { jobs: [], initialized: true, redisAvailable: false };
  }

  // ============ QUOTIDIEN ============

  // Rapport quotidien - tous les jours à 20h
  const dailyReport = cron.schedule('0 20 * * *', async () => {
    console.log('[SCHEDULER] 📊 Déclenchement rapport quotidien');
    try {
      await addTask(TaskTypes.DAILY_REPORT, { tenantId });
    } catch (error) {
      console.error('[SCHEDULER] Erreur rapport quotidien:', error.message);
    }
  }, { scheduled: true, timezone: 'Europe/Paris' });
  scheduledJobs.set('daily_report', dailyReport);

  // Vérifier les anniversaires - tous les jours à 8h
  const birthdayCheck = cron.schedule('0 8 * * *', async () => {
    console.log('[SCHEDULER] 🎂 Vérification anniversaires');
    try {
      await addTask(TaskTypes.BIRTHDAY_WISH, { tenantId, checkAll: true });
    } catch (error) {
      console.error('[SCHEDULER] Erreur anniversaires:', error.message);
    }
  }, { scheduled: true, timezone: 'Europe/Paris' });
  scheduledJobs.set('birthday_check', birthdayCheck);

  // ============ HEBDOMADAIRE ============

  // Analytics hebdo - tous les lundis à 9h
  const weeklyAnalytics = cron.schedule('0 9 * * 1', async () => {
    console.log('[SCHEDULER] 📈 Analytics hebdomadaire');
    try {
      await addTask(TaskTypes.WEEKLY_ANALYTICS, { tenantId });
    } catch (error) {
      console.error('[SCHEDULER] Erreur analytics:', error.message);
    }
  }, { scheduled: true, timezone: 'Europe/Paris' });
  scheduledJobs.set('weekly_analytics', weeklyAnalytics);

  // Veille concurrentielle - tous les mercredis à 14h
  const competitorCheck = cron.schedule('0 14 * * 3', async () => {
    console.log('[SCHEDULER] 🔍 Veille concurrentielle');
    try {
      await addTask(TaskTypes.COMPETITOR_CHECK, { tenantId });
    } catch (error) {
      console.error('[SCHEDULER] Erreur veille:', error.message);
    }
  }, { scheduled: true, timezone: 'Europe/Paris' });
  scheduledJobs.set('competitor_check', competitorCheck);

  // Mise à jour des insights - tous les dimanches à 3h
  const insightsUpdate = cron.schedule('0 3 * * 0', async () => {
    console.log('[SCHEDULER] 🧠 Mise à jour des insights');
    try {
      await addTask(TaskTypes.UPDATE_INSIGHTS, { tenantId });
    } catch (error) {
      console.error('[SCHEDULER] Erreur insights:', error.message);
    }
  }, { scheduled: true, timezone: 'Europe/Paris' });
  scheduledJobs.set('insights_update', insightsUpdate);

  schedulerInitialized = true;
  console.log('[SCHEDULER] ✅ Scheduler initialisé avec', scheduledJobs.size, 'tâches planifiées');

  return {
    jobs: Array.from(scheduledJobs.keys()),
    initialized: true,
    redisAvailable: true
  };
}

/**
 * Arrête le scheduler
 */
export function stopScheduler() {
  console.log('[SCHEDULER] 🛑 Arrêt du scheduler...');

  scheduledJobs.forEach((job, name) => {
    job.stop();
    console.log(`[SCHEDULER]    Arrêté: ${name}`);
  });

  scheduledJobs.clear();
  schedulerInitialized = false;
  console.log('[SCHEDULER] ✅ Scheduler arrêté');
}

/**
 * Planifie un post pour une plateforme
 * @param {string} tenantId - ID du tenant
 * @param {string} platform - instagram, facebook, tiktok
 * @param {string} template - Type de contenu
 * @param {string} when - Quand poster (naturel ou cron)
 * @param {object} data - Données additionnelles
 */
export async function schedulePost(tenantId, platform, template, when, data = {}) {
  const taskType = {
    instagram: TaskTypes.POST_INSTAGRAM,
    facebook: TaskTypes.POST_FACEBOOK,
    tiktok: TaskTypes.POST_TIKTOK
  }[platform.toLowerCase()];

  if (!taskType) {
    throw new Error(`Plateforme inconnue: ${platform}`);
  }

  // Vérifier si c'est une tâche récurrente
  const cronPattern = parseToCronPattern(when);
  if (cronPattern) {
    console.log(`[SCHEDULER] 🔄 Post ${platform} récurrent: ${cronPattern}`);
    return await scheduleRecurringTask(taskType, {
      tenantId,
      template,
      auto: true,
      ...data
    }, cronPattern);
  }

  // Sinon, c'est un post unique avec délai
  const delay = parseTimeExpression(when);
  console.log(`[SCHEDULER] 📅 Post ${platform} dans ${delay}ms`);

  return await addTask(taskType, {
    tenantId,
    template,
    ...data
  }, { delay });
}

/**
 * Planifie un rappel de RDV
 * @param {string} tenantId - ID du tenant
 * @param {string} clientId - ID du client
 * @param {string} bookingId - ID du RDV
 * @param {Date|string} reminderDate - Date du rappel
 * @param {string} channel - Canal (whatsapp, sms, email)
 */
export async function scheduleReminder(tenantId, clientId, bookingId, reminderDate, channel = 'whatsapp') {
  const targetDate = new Date(reminderDate);
  const delay = targetDate.getTime() - Date.now();

  if (delay <= 0) {
    console.warn('[SCHEDULER] ⚠️ Date de rappel déjà passée, envoi immédiat');
  }

  console.log(`[SCHEDULER] ⏰ Rappel planifié pour ${targetDate.toLocaleString('fr-FR')}`);

  return await addTask(TaskTypes.SEND_REMINDER, {
    tenantId,
    clientId,
    bookingId,
    channel
  }, { delay: Math.max(0, delay) });
}

/**
 * Planifie une relance client
 */
export async function scheduleFollowup(tenantId, clientId, delayDays = 30) {
  const delay = delayDays * 24 * 60 * 60 * 1000;

  console.log(`[SCHEDULER] 📞 Relance planifiée dans ${delayDays} jours`);

  return await addTask(TaskTypes.FOLLOWUP_CLIENT, {
    tenantId,
    clientId,
    daysSinceLastVisit: delayDays
  }, { delay });
}

/**
 * Planifie une génération de contenu
 */
export async function scheduleContent(tenantId, template, platform, when, data = {}) {
  const delay = parseTimeExpression(when);

  console.log(`[SCHEDULER] 🎨 Contenu planifié dans ${delay}ms`);

  return await addTask(TaskTypes.GENERATE_CONTENT, {
    tenantId,
    template,
    platform,
    ...data
  }, { delay });
}

/**
 * Liste les tâches planifiées actives
 */
export function getScheduledJobs() {
  return Array.from(scheduledJobs.entries()).map(([name, job]) => ({
    name,
    running: job.getStatus() === 'running'
  }));
}

/**
 * Active ou désactive une tâche planifiée
 */
export function toggleJob(jobName, enabled) {
  const job = scheduledJobs.get(jobName);
  if (!job) {
    return { success: false, error: `Tâche "${jobName}" non trouvée` };
  }

  if (enabled) {
    job.start();
    console.log(`[SCHEDULER] ▶️ Tâche "${jobName}" activée`);
  } else {
    job.stop();
    console.log(`[SCHEDULER] ⏸️ Tâche "${jobName}" désactivée`);
  }

  return { success: true, jobName, enabled };
}
