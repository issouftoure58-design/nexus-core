/**
 * SENTINEL Collector
 * Collecte quotidienne des metriques business pour clients Business
 *
 * Fonctionne via cron job chaque nuit a 00:30
 * Calcule KPIs et snapshots pour dashboard analytics
 */

import { supabase } from '../config/supabase.js';

// Prix unitaires pour calcul couts
const PRICING = {
  // Anthropic Claude (par 1M tokens)
  AI_INPUT_PER_1M: 3.00, // $3 / 1M input tokens
  AI_OUTPUT_PER_1M: 15.00, // $15 / 1M output tokens
  USD_TO_EUR: 0.92,

  // Twilio
  SMS_FR: 0.0725, // EUR par SMS France
  SMS_INTL: 0.12, // EUR par SMS international
  VOICE_PER_MIN: 0.015, // EUR par minute

  // Resend
  EMAIL_PER_1K: 1.00, // $1 pour 1000 emails

  // Storage (Supabase)
  STORAGE_PER_GB: 0.021, // $0.021 per GB
};

class SentinelCollector {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Collecte snapshot quotidien pour un tenant
   */
  async collectDailySnapshot(tenantId, dateStr) {
    console.log(`[SENTINEL] Collecting snapshot for ${tenantId} on ${dateStr}`);

    const startOfDay = new Date(dateStr + 'T00:00:00Z');
    const endOfDay = new Date(dateStr + 'T23:59:59Z');

    try {
      // 1. CLIENTS
      const { data: allClients } = await supabase
        .from('clients')
        .select('id, created_at')
        .eq('tenant_id', tenantId);

      const totalClients = allClients?.length || 0;
      const newClients = allClients?.filter(c =>
        new Date(c.created_at) >= startOfDay &&
        new Date(c.created_at) <= endOfDay
      ).length || 0;

      // Clients actifs (avec RDV dans les 30 derniers jours)
      const thirtyDaysAgo = new Date(startOfDay);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: activeClientIds } = await supabase
        .from('rendezvous')
        .select('client_id')
        .eq('tenant_id', tenantId)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

      const activeClients = new Set(activeClientIds?.map(r => r.client_id) || []).size;

      // 2. RESERVATIONS DU JOUR
      const { data: reservations } = await supabase
        .from('rendezvous')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('date', dateStr);

      const totalReservations = reservations?.length || 0;
      const confirmed = reservations?.filter(r => r.statut === 'confirme').length || 0;
      const cancelled = reservations?.filter(r => r.statut === 'annule').length || 0;
      const completed = reservations?.filter(r => r.statut === 'termine').length || 0;
      const pending = reservations?.filter(r => r.statut === 'en_attente').length || 0;
      const noShows = reservations?.filter(r => r.statut === 'no_show').length || 0;

      // 3. REVENUS
      const { data: paidReservations } = await supabase
        .from('rendezvous')
        .select('prix, statut_paiement')
        .eq('tenant_id', tenantId)
        .eq('date', dateStr);

      const revenueTotal = paidReservations?.reduce((sum, r) => sum + (parseFloat(r.prix) || 0), 0) || 0;
      const revenuePaid = paidReservations?.filter(r => r.statut_paiement === 'paye')
        .reduce((sum, r) => sum + (parseFloat(r.prix) || 0), 0) || 0;
      const revenuePending = revenueTotal - revenuePaid;
      const averageBasket = totalReservations > 0 ? revenueTotal / totalReservations : 0;

      // 4. TAUX
      const noShowRate = totalReservations > 0 ? (noShows / totalReservations) * 100 : 0;
      const cancellationRate = totalReservations > 0 ? (cancelled / totalReservations) * 100 : 0;
      const completionRate = (confirmed + completed) > 0 ? (completed / (confirmed + completed)) * 100 : 0;

      // 5. USAGE MODULES CRM
      const { count: crmActions } = await supabase
        .from('crm_activities')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString());

      // 6. USAGE MARKETING
      const { count: marketingEmails } = await supabase
        .from('marketing_emails')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('sent_at', startOfDay.toISOString())
        .lte('sent_at', endOfDay.toISOString());

      // 7. USAGE IA (conversations)
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id, messages_count')
        .eq('tenant_id', tenantId)
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString());

      const aiConversations = conversations?.length || 0;
      const aiMessages = conversations?.reduce((sum, c) => sum + (c.messages_count || 0), 0) || 0;

      // 8. SMS ENVOYES
      const { count: smsSent } = await supabase
        .from('sms_logs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('sent_at', startOfDay.toISOString())
        .lte('sent_at', endOfDay.toISOString());

      // 9. TOP SERVICES
      const serviceStats = {};
      reservations?.forEach(r => {
        const serviceName = r.service_name || 'Autre';
        serviceStats[serviceName] = (serviceStats[serviceName] || 0) + 1;
      });
      const topServices = Object.entries(serviceStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // 10. UPSERT SNAPSHOT
      const { error } = await supabase
        .from('sentinel_daily_snapshots')
        .upsert({
          tenant_id: tenantId,
          date: dateStr,
          total_clients: totalClients,
          new_clients: newClients,
          active_clients: activeClients,
          total_reservations: totalReservations,
          reservations_confirmed: confirmed,
          reservations_cancelled: cancelled,
          reservations_completed: completed,
          reservations_pending: pending,
          no_show_count: noShows,
          revenue_total: revenueTotal,
          revenue_paid: revenuePaid,
          revenue_pending: revenuePending,
          average_basket: averageBasket,
          no_show_rate: noShowRate,
          cancellation_rate: cancellationRate,
          completion_rate: completionRate,
          crm_actions: crmActions || 0,
          marketing_emails_sent: marketingEmails || 0,
          ai_conversations: aiConversations,
          ai_messages_count: aiMessages,
          sms_sent: smsSent || 0,
          top_services: topServices
        }, { onConflict: 'tenant_id,date' });

      if (error) {
        console.error(`[SENTINEL] Snapshot error for ${tenantId}:`, error);
      } else {
        console.log(`[SENTINEL] Snapshot saved for ${tenantId}: ${totalReservations} RDV, ${revenuePaid}€`);
      }

      return { success: !error };

    } catch (error) {
      console.error(`[SENTINEL] Error collecting snapshot for ${tenantId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Collecte couts quotidiens pour un tenant
   */
  async collectDailyCosts(tenantId, dateStr) {
    console.log(`[SENTINEL] Collecting costs for ${tenantId} on ${dateStr}`);

    const startOfDay = new Date(dateStr + 'T00:00:00Z');
    const endOfDay = new Date(dateStr + 'T23:59:59Z');

    try {
      // 1. COUTS IA (tokens Anthropic)
      const { data: aiLogs } = await supabase
        .from('ai_usage_logs')
        .select('input_tokens, output_tokens')
        .eq('tenant_id', tenantId)
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString());

      const aiTokensInput = aiLogs?.reduce((sum, l) => sum + (l.input_tokens || 0), 0) || 0;
      const aiTokensOutput = aiLogs?.reduce((sum, l) => sum + (l.output_tokens || 0), 0) || 0;

      const aiCostUsd = (aiTokensInput / 1000000) * PRICING.AI_INPUT_PER_1M +
                        (aiTokensOutput / 1000000) * PRICING.AI_OUTPUT_PER_1M;
      const aiCostEur = aiCostUsd * PRICING.USD_TO_EUR;

      // 2. COUTS SMS
      const { data: smsLogs } = await supabase
        .from('sms_logs')
        .select('id, destination')
        .eq('tenant_id', tenantId)
        .eq('status', 'sent')
        .gte('sent_at', startOfDay.toISOString())
        .lte('sent_at', endOfDay.toISOString());

      const smsSent = smsLogs?.length || 0;
      const smsCostEur = smsSent * PRICING.SMS_FR; // Approximation France

      // 3. COUTS VOIX
      const { data: callLogs } = await supabase
        .from('call_logs')
        .select('duration_seconds')
        .eq('tenant_id', tenantId)
        .gte('started_at', startOfDay.toISOString())
        .lte('started_at', endOfDay.toISOString());

      const voiceCalls = callLogs?.length || 0;
      const voiceMinutes = callLogs?.reduce((sum, c) => sum + Math.ceil((c.duration_seconds || 0) / 60), 0) || 0;
      const voiceCostEur = voiceMinutes * PRICING.VOICE_PER_MIN;

      // 4. COUTS EMAIL
      const { count: emailsSent } = await supabase
        .from('email_logs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('sent_at', startOfDay.toISOString())
        .lte('sent_at', endOfDay.toISOString());

      const emailCostEur = ((emailsSent || 0) / 1000) * PRICING.EMAIL_PER_1K * PRICING.USD_TO_EUR;

      // 5. TOTAL
      const totalCostEur = aiCostEur + smsCostEur + voiceCostEur + emailCostEur;

      // 6. COMPARAISON HIER
      const yesterday = new Date(startOfDay);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const { data: yesterdayCost } = await supabase
        .from('sentinel_daily_costs')
        .select('total_cost_eur')
        .eq('tenant_id', tenantId)
        .eq('date', yesterdayStr)
        .single();

      const costVsYesterday = yesterdayCost?.total_cost_eur > 0
        ? ((totalCostEur - yesterdayCost.total_cost_eur) / yesterdayCost.total_cost_eur) * 100
        : 0;

      // 7. UPSERT COSTS
      const { error } = await supabase
        .from('sentinel_daily_costs')
        .upsert({
          tenant_id: tenantId,
          date: dateStr,
          ai_tokens_input: aiTokensInput,
          ai_tokens_output: aiTokensOutput,
          ai_cost_eur: Math.round(aiCostEur * 100) / 100,
          sms_sent: smsSent,
          sms_cost_eur: Math.round(smsCostEur * 100) / 100,
          voice_calls: voiceCalls,
          voice_minutes: voiceMinutes,
          voice_cost_eur: Math.round(voiceCostEur * 100) / 100,
          emails_sent: emailsSent || 0,
          emails_cost_eur: Math.round(emailCostEur * 100) / 100,
          total_cost_eur: Math.round(totalCostEur * 100) / 100,
          cost_vs_yesterday_percent: Math.round(costVsYesterday * 10) / 10
        }, { onConflict: 'tenant_id,date' });

      if (error) {
        console.error(`[SENTINEL] Costs error for ${tenantId}:`, error);
      } else {
        console.log(`[SENTINEL] Costs saved for ${tenantId}: ${totalCostEur.toFixed(2)}€`);
      }

      return { success: !error, totalCost: totalCostEur };

    } catch (error) {
      console.error(`[SENTINEL] Error collecting costs for ${tenantId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifie alertes et notifie si seuils depasses
   */
  async checkAlerts(tenantId, dateStr) {
    try {
      // Recuperer snapshot et goals
      const { data: snapshot } = await supabase
        .from('sentinel_daily_snapshots')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('date', dateStr)
        .single();

      const { data: costs } = await supabase
        .from('sentinel_daily_costs')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('date', dateStr)
        .single();

      const { data: goals } = await supabase
        .from('sentinel_goals')
        .select('*')
        .eq('tenant_id', tenantId)
        .single();

      if (!goals || !goals.notify_alerts) return;

      const alerts = [];

      // Check no-show rate
      if (snapshot?.no_show_rate > goals.alert_no_show_rate_threshold) {
        alerts.push({
          type: 'warning',
          title: 'Taux de no-show eleve',
          message: `Votre taux de no-show est de ${snapshot.no_show_rate.toFixed(1)}% (seuil: ${goals.alert_no_show_rate_threshold}%)`
        });
      }

      // Check cancellation rate
      if (snapshot?.cancellation_rate > goals.alert_cancellation_rate_threshold) {
        alerts.push({
          type: 'warning',
          title: 'Taux annulation eleve',
          message: `Votre taux d'annulation est de ${snapshot.cancellation_rate.toFixed(1)}%`
        });
      }

      // Check daily cost
      if (costs?.total_cost_eur > goals.alert_cost_daily_threshold) {
        alerts.push({
          type: 'warning',
          title: 'Couts journaliers eleves',
          message: `Vos couts du jour sont de ${costs.total_cost_eur.toFixed(2)}€ (seuil: ${goals.alert_cost_daily_threshold}€)`
        });
      }

      // Check low bookings
      if (snapshot?.total_reservations < goals.alert_low_booking_threshold) {
        alerts.push({
          type: 'info',
          title: 'Peu de reservations',
          message: `Seulement ${snapshot.total_reservations} RDV aujourd'hui`
        });
      }

      // Envoyer notifications (TODO: integrer avec service notifications)
      for (const alert of alerts) {
        console.log(`[SENTINEL ALERT] ${tenantId}: ${alert.title}`);
        // await notificationService.send(tenantId, alert);
      }

      return alerts;

    } catch (error) {
      console.error(`[SENTINEL] Alert check error:`, error);
      return [];
    }
  }

  /**
   * Recupere tenants Business actifs
   */
  async getBusinessTenants() {
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, plan_id')
      .eq('statut', 'actif')
      .in('plan_id', ['business', 'enterprise']);

    return tenants || [];
  }

  /**
   * Execute collecte quotidienne pour tous tenants Business
   */
  async runDailyCollection(dateStr = null) {
    if (this.isRunning) {
      console.log('[SENTINEL] Collection already running, skipping');
      return;
    }

    this.isRunning = true;

    // Date par defaut = hier
    if (!dateStr) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      dateStr = yesterday.toISOString().split('T')[0];
    }

    console.log(`[SENTINEL] Starting daily collection for ${dateStr}`);

    try {
      const tenants = await this.getBusinessTenants();
      console.log(`[SENTINEL] Found ${tenants.length} Business tenants`);

      for (const tenant of tenants) {
        await this.collectDailySnapshot(tenant.id, dateStr);
        await this.collectDailyCosts(tenant.id, dateStr);
        await this.checkAlerts(tenant.id, dateStr);

        // Petit delai entre tenants pour ne pas surcharger
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log(`[SENTINEL] Daily collection completed for ${dateStr}`);

    } catch (error) {
      console.error('[SENTINEL] Daily collection failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Collecte en temps reel (pour dashboard live)
   */
  async collectRealtime(tenantId) {
    const today = new Date().toISOString().split('T')[0];
    await this.collectDailySnapshot(tenantId, today);
    await this.collectDailyCosts(tenantId, today);
    return { collected: true, date: today };
  }
}

// Instance singleton
export const sentinelCollector = new SentinelCollector();

export default sentinelCollector;
