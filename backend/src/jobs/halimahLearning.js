/**
 * JOB D'APPRENTISSAGE AUTOMATIQUE HALIMAH
 * Analyse les conversations et génère des insights
 */

import { supabase } from '../config/supabase.js';
import {
  createInsight,
  recordLearning,
  remember as memoryRemember
} from '../services/halimahMemory.js';

// ============================================================
// === ANALYSE QUOTIDIENNE ===
// ============================================================

/**
 * Analyse quotidienne des conversations et activités
 * À lancer via un cron job ou manuellement
 */
export async function dailyLearning() {
  console.log('[LEARNING] 📊 Démarrage de l\'analyse quotidienne...');

  try {
    // 1. Analyser les conversations des dernières 24h
    await analyzeRecentConversations();

    // 2. Analyser les réservations
    await analyzeReservations();

    // 3. Analyser les services populaires
    await analyzePopularServices();

    // 4. Nettoyer les souvenirs obsolètes
    await cleanupOldMemories();

    console.log('[LEARNING] ✅ Analyse quotidienne terminée');
    return { success: true };
  } catch (error) {
    console.error('[LEARNING] ❌ Erreur analyse quotidienne:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// === ANALYSE DES CONVERSATIONS ===
// ============================================================

/**
 * Analyse les conversations récentes pour détecter des patterns
 */
async function analyzeRecentConversations() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  // Récupérer les conversations des dernières 24h depuis halimah_conversations
  const { data: conversations, error } = await supabase
    .from('halimah_conversations')
    .select('*')
    .gte('created_at', yesterday.toISOString());

  if (error) {
    console.warn('[LEARNING] Pas de table halimah_conversations:', error.message);
    return;
  }

  if (!conversations || conversations.length === 0) {
    console.log('[LEARNING] Aucune conversation récente à analyser');
    return;
  }

  // Analyser les sujets fréquents
  const topicCounts = {};
  conversations.forEach(conv => {
    if (conv.topic) {
      topicCounts[conv.topic] = (topicCounts[conv.topic] || 0) + 1;
    }
  });

  // Créer un insight si un sujet revient souvent
  const frequentTopics = Object.entries(topicCounts)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  for (const [topic, count] of frequentTopics) {
    await createInsight({
      insightType: 'trend',
      title: `Sujet fréquent : ${topic}`,
      description: `Le sujet "${topic}" a été abordé ${count} fois ces dernières 24h. Peut-être créer une FAQ ou un contenu dédié ?`,
      data: { topic, count },
      priority: Math.min(count + 3, 10)
    });
  }

  // Analyser la durée moyenne des conversations
  const avgDuration = conversations.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / conversations.length;
  if (avgDuration > 300) { // Plus de 5 minutes en moyenne
    await createInsight({
      insightType: 'warning',
      title: 'Conversations longues',
      description: `La durée moyenne des conversations est de ${Math.round(avgDuration / 60)} minutes. Les clients ont peut-être besoin de plus d'informations en amont.`,
      data: { avgDuration },
      priority: 6
    });
  }

  console.log(`[LEARNING] Analysé ${conversations.length} conversation(s)`);
}

// ============================================================
// === ANALYSE DES RÉSERVATIONS ===
// ============================================================

/**
 * Analyse les réservations pour détecter des tendances
 */
async function analyzeReservations() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('*')
    .gte('created_at', oneWeekAgo.toISOString());

  if (error || !reservations) {
    console.warn('[LEARNING] Erreur récupération réservations:', error?.message);
    return;
  }

  if (reservations.length === 0) {
    return;
  }

  // Analyser les jours populaires
  const daysCounts = {};
  const hoursCounts = {};

  reservations.forEach(r => {
    if (r.date) {
      const date = new Date(r.date);
      const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
      daysCounts[dayName] = (daysCounts[dayName] || 0) + 1;
    }
    if (r.heure) {
      const hour = r.heure.split(':')[0];
      hoursCounts[hour] = (hoursCounts[hour] || 0) + 1;
    }
  });

  // Trouver le jour le plus populaire
  const mostPopularDay = Object.entries(daysCounts)
    .sort((a, b) => b[1] - a[1])[0];

  if (mostPopularDay && mostPopularDay[1] >= 3) {
    await recordLearning({
      category: 'business',
      key: 'jour_rdv_populaire',
      value: `${mostPopularDay[0]} (${mostPopularDay[1]} RDV cette semaine)`,
      metadata: { daysCounts }
    });
  }

  // Trouver l'heure la plus populaire
  const mostPopularHour = Object.entries(hoursCounts)
    .sort((a, b) => b[1] - a[1])[0];

  if (mostPopularHour && mostPopularHour[1] >= 3) {
    await recordLearning({
      category: 'business',
      key: 'heure_rdv_populaire',
      value: `${mostPopularHour[0]}h (${mostPopularHour[1]} RDV cette semaine)`,
      metadata: { hoursCounts }
    });
  }

  // Analyser le taux d'annulation
  const cancelled = reservations.filter(r => r.statut === 'annule').length;
  const cancellationRate = (cancelled / reservations.length) * 100;

  if (cancellationRate > 20) {
    await createInsight({
      insightType: 'warning',
      title: 'Taux d\'annulation élevé',
      description: `${cancellationRate.toFixed(1)}% des réservations ont été annulées cette semaine. Peut-être envoyer des rappels plus fréquents ?`,
      data: { cancelled, total: reservations.length, rate: cancellationRate },
      priority: 8
    });
  }

  console.log(`[LEARNING] Analysé ${reservations.length} réservation(s)`);
}

// ============================================================
// === ANALYSE DES SERVICES ===
// ============================================================

/**
 * Analyse les services populaires
 */
async function analyzePopularServices() {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('service_nom, prix_total')
    .gte('created_at', oneMonthAgo.toISOString())
    .in('statut', ['confirme', 'termine']);

  if (error || !reservations) {
    return;
  }

  // Compter les services
  const serviceCounts = {};
  const serviceRevenue = {};

  reservations.forEach(r => {
    if (r.service_nom) {
      serviceCounts[r.service_nom] = (serviceCounts[r.service_nom] || 0) + 1;
      serviceRevenue[r.service_nom] = (serviceRevenue[r.service_nom] || 0) + (r.prix_total || 0);
    }
  });

  // Top service par nombre
  const topByCount = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])[0];

  if (topByCount) {
    await recordLearning({
      category: 'business',
      key: 'service_plus_demande',
      value: `${topByCount[0]} (${topByCount[1]} fois ce mois)`,
      metadata: { serviceCounts }
    });
  }

  // Top service par CA
  const topByRevenue = Object.entries(serviceRevenue)
    .sort((a, b) => b[1] - a[1])[0];

  if (topByRevenue) {
    await recordLearning({
      category: 'business',
      key: 'service_plus_rentable',
      value: `${topByRevenue[0]} (${(topByRevenue[1] / 100).toFixed(2)}€ ce mois)`,
      metadata: { serviceRevenue }
    });
  }

  // Détecter les services peu demandés
  const lowDemandServices = Object.entries(serviceCounts)
    .filter(([_, count]) => count <= 1)
    .map(([service]) => service);

  if (lowDemandServices.length > 0) {
    await createInsight({
      insightType: 'opportunity',
      title: 'Services peu demandés',
      description: `Les services suivants ont été peu demandés ce mois : ${lowDemandServices.join(', ')}. Peut-être promouvoir ou ajuster les tarifs ?`,
      data: { services: lowDemandServices },
      priority: 5
    });
  }

  console.log('[LEARNING] Analyse des services terminée');
}

// ============================================================
// === NETTOYAGE ===
// ============================================================

/**
 * Nettoie les souvenirs obsolètes ou à faible confiance
 */
async function cleanupOldMemories() {
  // Supprimer les souvenirs à très faible confiance (< 0.1) de plus d'un mois
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const { data, error } = await supabase
    .from('halimah_memory')
    .delete()
    .lt('confidence', 0.1)
    .lt('created_at', oneMonthAgo.toISOString())
    .select();

  if (data && data.length > 0) {
    console.log(`[LEARNING] 🧹 Supprimé ${data.length} souvenir(s) obsolète(s)`);
  }

  // Désactiver les insights traités depuis plus d'une semaine
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  await supabase
    .from('halimah_insights')
    .delete()
    .eq('is_actioned', true)
    .lt('actioned_at', oneWeekAgo.toISOString());
}

// ============================================================
// === EXTRACTION D'APPRENTISSAGES DEPUIS CONVERSATIONS ===
// ============================================================

/**
 * Extrait des apprentissages d'une conversation
 */
export async function learnFromConversation(messages, clientId = null) {
  const learnings = [];

  // Patterns pour détecter des préférences
  const preferencePatterns = [
    { regex: /préfère\s+(.+)/i, type: 'preference' },
    { regex: /aime\s+(.+)/i, type: 'preference' },
    { regex: /n'aime pas\s+(.+)/i, type: 'preference' },
    { regex: /toujours\s+(.+)/i, type: 'preference' },
    { regex: /jamais\s+(.+)/i, type: 'preference' }
  ];

  // Patterns pour détecter des infos business
  const businessPatterns = [
    { regex: /tarif.+(\d+)\s*€/i, type: 'fact', key: 'tarif_mentionne' },
    { regex: /horaire.+(\d+h)/i, type: 'fact', key: 'horaire_mentionne' },
    { regex: /zone.+intervention.+(.+)/i, type: 'fact', key: 'zone_intervention' }
  ];

  // Analyser chaque message
  for (const msg of messages) {
    if (msg.role !== 'user') continue;

    const content = msg.content || '';

    // Chercher des préférences
    for (const pattern of preferencePatterns) {
      const match = content.match(pattern.regex);
      if (match) {
        learnings.push({
          type: pattern.type,
          category: clientId ? 'client' : 'admin',
          key: `preference_${Date.now()}`,
          value: match[1].trim(),
          clientId
        });
      }
    }

    // Chercher des infos business
    for (const pattern of businessPatterns) {
      const match = content.match(pattern.regex);
      if (match) {
        learnings.push({
          type: pattern.type,
          category: 'business',
          key: pattern.key,
          value: match[1].trim()
        });
      }
    }
  }

  // Sauvegarder les apprentissages
  for (const learning of learnings) {
    await memoryRemember({
      type: learning.type,
      category: learning.category,
      subjectType: learning.clientId ? 'client' : null,
      subjectId: learning.clientId || null,
      key: learning.key,
      value: learning.value,
      confidence: 0.6
    });
  }

  return learnings.length;
}

// ============================================================
// === EXPORTS ===
// ============================================================

export default {
  dailyLearning,
  learnFromConversation
};
