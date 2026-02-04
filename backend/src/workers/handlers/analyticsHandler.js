import { TaskTypes } from '../../services/taskQueue.js';
import { supabase } from '../../config/supabase.js';
import { createInsight } from '../../services/halimahMemory.js';

/**
 * Handler pour les tâches d'analytics
 */
export async function handleAnalyticsTask(job) {
  const { type, data, tenantId } = job.data;

  console.log(`[ANALYTICS] 📊 Traitement tâche ${type}`);

  switch (type) {
    case TaskTypes.DAILY_REPORT:
      return await generateDailyReport(tenantId);

    case TaskTypes.WEEKLY_ANALYTICS:
      return await generateWeeklyAnalytics(tenantId);

    case TaskTypes.COMPETITOR_CHECK:
      return await checkCompetitors(data, tenantId);

    default:
      throw new Error(`Handler analytics inconnu: ${type}`);
  }
}

/**
 * Génère le rapport quotidien
 */
async function generateDailyReport(tenantId) {
  console.log('[ANALYTICS] 📈 Génération rapport quotidien...');

  const today = new Date().toISOString().split('T')[0];

  try {
    // Récupérer les RDV du jour
    const { data: bookings, error: bookingsError } = await supabase
      .from('rendezvous')
      .select(`
        *,
        clients (nom, prenom),
        services (nom, prix)
      `)
      .eq('date', today);

    if (bookingsError) {
      console.error('[ANALYTICS] Erreur récupération RDV:', bookingsError);
    }

    // Calculer le CA du jour
    const { data: payments } = await supabase
      .from('rendezvous')
      .select('prix_total')
      .eq('date', today)
      .eq('statut', 'termine');

    const revenue = payments?.reduce((sum, p) => sum + (p.prix_total || 0), 0) || 0;

    // Nouveaux clients
    const { data: newClients } = await supabase
      .from('clients')
      .select('id')
      .gte('created_at', today);

    const report = {
      date: today,
      bookings: {
        total: bookings?.length || 0,
        confirmed: bookings?.filter(b => b.statut === 'confirme').length || 0,
        completed: bookings?.filter(b => b.statut === 'termine').length || 0,
        cancelled: bookings?.filter(b => b.statut === 'annule').length || 0
      },
      revenue: {
        total: revenue,
        formatted: `${(revenue / 100).toFixed(2)}€`
      },
      newClients: newClients?.length || 0,
      generatedAt: new Date().toISOString()
    };

    // Sauvegarder comme insight
    if (createInsight) {
      await createInsight({
        tenantId: tenantId || 'default',
        category: 'business',
        insight: `Rapport du ${today}: ${report.bookings.total} RDV, CA: ${report.revenue.formatted}`,
        data: report,
        confidence: 1.0
      });
    }

    console.log('[ANALYTICS] ✅ Rapport quotidien généré');
    console.log(`[ANALYTICS]    RDV: ${report.bookings.total}`);
    console.log(`[ANALYTICS]    CA: ${report.revenue.formatted}`);

    return report;

  } catch (error) {
    console.error('[ANALYTICS] ❌ Erreur rapport quotidien:', error);
    return {
      date: today,
      error: error.message,
      generatedAt: new Date().toISOString()
    };
  }
}

/**
 * Génère l'analyse hebdomadaire
 */
async function generateWeeklyAnalytics(tenantId) {
  console.log('[ANALYTICS] 📊 Génération analytics hebdomadaires...');

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    // RDV de la semaine
    const { data: bookings } = await supabase
      .from('rendezvous')
      .select('*')
      .gte('date', weekAgo.toISOString().split('T')[0])
      .lte('date', today.toISOString().split('T')[0]);

    // Services les plus populaires
    const serviceCount = {};
    bookings?.forEach(b => {
      const service = b.service_nom || 'Autre';
      serviceCount[service] = (serviceCount[service] || 0) + 1;
    });

    const popularServices = Object.entries(serviceCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Jours les plus chargés
    const dayCount = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    bookings?.forEach(b => {
      const day = new Date(b.date).getDay();
      dayCount[day]++;
    });

    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const busyDays = Object.entries(dayCount)
      .map(([day, count]) => ({ day: dayNames[day], count }))
      .sort((a, b) => b.count - a.count);

    // CA de la semaine
    const completedBookings = bookings?.filter(b => b.statut === 'termine') || [];
    const weeklyRevenue = completedBookings.reduce((sum, b) => sum + (b.prix_total || 0), 0);

    const analytics = {
      period: {
        start: weekAgo.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0]
      },
      bookings: {
        total: bookings?.length || 0,
        completed: completedBookings.length,
        completionRate: bookings?.length
          ? ((completedBookings.length / bookings.length) * 100).toFixed(1) + '%'
          : '0%'
      },
      revenue: {
        total: weeklyRevenue,
        formatted: `${(weeklyRevenue / 100).toFixed(2)}€`,
        average: bookings?.length
          ? `${((weeklyRevenue / bookings.length) / 100).toFixed(2)}€`
          : '0€'
      },
      popularServices,
      busyDays,
      recommendations: generateRecommendations(popularServices, busyDays, bookings),
      generatedAt: new Date().toISOString()
    };

    console.log('[ANALYTICS] ✅ Analytics hebdo générés');

    return analytics;

  } catch (error) {
    console.error('[ANALYTICS] ❌ Erreur analytics hebdo:', error);
    return { error: error.message };
  }
}

/**
 * Génère des recommandations basées sur les données
 */
function generateRecommendations(popularServices, busyDays, bookings) {
  const recommendations = [];

  // Recommandation sur les services
  if (popularServices.length > 0) {
    recommendations.push(
      `Mettre en avant "${popularServices[0].name}" sur les réseaux sociaux`
    );
  }

  // Recommandation sur les jours
  const busiestDay = busyDays[0];
  const slowestDay = busyDays[busyDays.length - 1];
  if (slowestDay && slowestDay.count === 0) {
    recommendations.push(
      `Proposer une promo le ${slowestDay.day} pour remplir ce créneau`
    );
  }

  // Recommandation générale
  if (bookings && bookings.length < 10) {
    recommendations.push(
      'Augmenter la visibilité avec plus de posts Instagram'
    );
  }

  return recommendations;
}

/**
 * Vérifie les concurrents
 */
async function checkCompetitors(data, tenantId) {
  console.log('[ANALYTICS] 🔍 Veille concurrentielle...');

  // TODO: Utiliser Tavily pour rechercher les concurrents
  // et analyser leurs réseaux sociaux

  const mockAnalysis = {
    competitors: [
      {
        name: 'Concurrent A',
        instagram_followers: 'Non analysé',
        price_range: 'Non analysé'
      }
    ],
    insights: [
      'Analyse concurrentielle nécessite intégration Tavily',
      'Surveiller les hashtags locaux (#coiffureafro, #braids)'
    ],
    checkedAt: new Date().toISOString()
  };

  return mockAnalysis;
}
