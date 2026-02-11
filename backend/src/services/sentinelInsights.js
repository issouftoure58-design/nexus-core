/**
 * SENTINEL Insights Generator
 * Genere recommandations IA pour optimiser le business client
 *
 * Analyse tendances et propose actions concretes
 * Execute hebdomadairement (chaque lundi 9h)
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/supabase.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

class SentinelInsights {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Recupere snapshots des N derniers jours
   */
  async getSnapshots(tenantId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data } = await supabase
      .from('sentinel_daily_snapshots')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    return data || [];
  }

  /**
   * Recupere couts des N derniers jours
   */
  async getCosts(tenantId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data } = await supabase
      .from('sentinel_daily_costs')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    return data || [];
  }

  /**
   * Recupere objectifs du tenant
   */
  async getGoals(tenantId) {
    const { data } = await supabase
      .from('sentinel_goals')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    return data || {};
  }

  /**
   * Calcule tendances sur les donnees
   */
  calculateTrends(snapshots) {
    if (snapshots.length < 7) {
      return { insufficient_data: true };
    }

    // Diviser en deux periodes pour comparer
    const mid = Math.floor(snapshots.length / 2);
    const firstHalf = snapshots.slice(0, mid);
    const secondHalf = snapshots.slice(mid);

    // Moyennes premiere periode
    const avgFirst = {
      revenue: firstHalf.reduce((s, d) => s + (d.revenue_paid || 0), 0) / firstHalf.length,
      reservations: firstHalf.reduce((s, d) => s + (d.total_reservations || 0), 0) / firstHalf.length,
      newClients: firstHalf.reduce((s, d) => s + (d.new_clients || 0), 0) / firstHalf.length,
      noShowRate: firstHalf.reduce((s, d) => s + (d.no_show_rate || 0), 0) / firstHalf.length,
    };

    // Moyennes seconde periode
    const avgSecond = {
      revenue: secondHalf.reduce((s, d) => s + (d.revenue_paid || 0), 0) / secondHalf.length,
      reservations: secondHalf.reduce((s, d) => s + (d.total_reservations || 0), 0) / secondHalf.length,
      newClients: secondHalf.reduce((s, d) => s + (d.new_clients || 0), 0) / secondHalf.length,
      noShowRate: secondHalf.reduce((s, d) => s + (d.no_show_rate || 0), 0) / secondHalf.length,
    };

    // Calculer variations
    const calcChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    // Totaux
    const totalRevenue = snapshots.reduce((s, d) => s + (d.revenue_paid || 0), 0);
    const totalReservations = snapshots.reduce((s, d) => s + (d.total_reservations || 0), 0);
    const totalNewClients = snapshots.reduce((s, d) => s + (d.new_clients || 0), 0);

    return {
      period_days: snapshots.length,

      // Totaux
      total_revenue: Math.round(totalRevenue),
      total_reservations: totalReservations,
      total_new_clients: totalNewClients,

      // Moyennes
      avg_daily_revenue: Math.round(totalRevenue / snapshots.length),
      avg_daily_reservations: Math.round((totalReservations / snapshots.length) * 10) / 10,
      avg_no_show_rate: Math.round((snapshots.reduce((s, d) => s + (d.no_show_rate || 0), 0) / snapshots.length) * 10) / 10,
      avg_basket: Math.round(totalRevenue / Math.max(totalReservations, 1)),

      // Tendances
      revenue_trend: avgSecond.revenue > avgFirst.revenue ? 'up' : 'down',
      revenue_change: Math.round(calcChange(avgSecond.revenue, avgFirst.revenue)),

      reservations_trend: avgSecond.reservations > avgFirst.reservations ? 'up' : 'down',
      reservations_change: Math.round(calcChange(avgSecond.reservations, avgFirst.reservations)),

      clients_trend: avgSecond.newClients > avgFirst.newClients ? 'up' : 'down',
      clients_change: Math.round(calcChange(avgSecond.newClients, avgFirst.newClients)),

      noshow_trend: avgSecond.noShowRate > avgFirst.noShowRate ? 'up' : 'down',
      noshow_change: Math.round(calcChange(avgSecond.noShowRate, avgFirst.noShowRate)),

      // Top services
      top_services: this.aggregateTopServices(snapshots),
    };
  }

  /**
   * Agrege les top services sur la periode
   */
  aggregateTopServices(snapshots) {
    const serviceCounts = {};

    snapshots.forEach(s => {
      if (s.top_services && Array.isArray(s.top_services)) {
        s.top_services.forEach(svc => {
          serviceCounts[svc.name] = (serviceCounts[svc.name] || 0) + svc.count;
        });
      }
    });

    return Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }

  /**
   * Calcule tendances couts
   */
  calculateCostTrends(costs) {
    if (costs.length < 7) {
      return { insufficient_data: true };
    }

    const totalCost = costs.reduce((s, c) => s + (c.total_cost_eur || 0), 0);
    const avgDailyCost = totalCost / costs.length;

    // Breakdown par type
    const breakdown = {
      ai: costs.reduce((s, c) => s + (c.ai_cost_eur || 0), 0),
      sms: costs.reduce((s, c) => s + (c.sms_cost_eur || 0), 0),
      voice: costs.reduce((s, c) => s + (c.voice_cost_eur || 0), 0),
      email: costs.reduce((s, c) => s + (c.emails_cost_eur || 0), 0),
    };

    return {
      total_cost: Math.round(totalCost * 100) / 100,
      avg_daily_cost: Math.round(avgDailyCost * 100) / 100,
      estimated_monthly: Math.round(avgDailyCost * 30 * 100) / 100,
      breakdown,
      main_cost_driver: Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none',
    };
  }

  /**
   * Genere insights via Claude API
   */
  async generateInsights(tenantId) {
    console.log(`[SENTINEL] Generating insights for ${tenantId}`);

    try {
      // 1. Recuperer donnees
      const snapshots = await this.getSnapshots(tenantId, 30);
      const costs = await this.getCosts(tenantId, 30);
      const goals = await this.getGoals(tenantId);

      if (snapshots.length < 7) {
        console.log(`[SENTINEL] Insufficient data for ${tenantId}, need at least 7 days`);
        return [];
      }

      // 2. Calculer tendances
      const trends = this.calculateTrends(snapshots);
      const costTrends = this.calculateCostTrends(costs);

      // 3. Construire prompt
      const prompt = `Tu es un consultant business expert en analytics pour entreprises de services (coiffure, beaute, bien-etre).

DONNEES CLIENT SUR 30 JOURS :
- Chiffre d'affaires total : ${trends.total_revenue}€
- CA moyen/jour : ${trends.avg_daily_revenue}€
- Reservations totales : ${trends.total_reservations}
- Nouveaux clients : ${trends.total_new_clients}
- Panier moyen : ${trends.avg_basket}€
- Taux no-show moyen : ${trends.avg_no_show_rate}%

TENDANCES :
- CA : ${trends.revenue_trend} (${trends.revenue_change > 0 ? '+' : ''}${trends.revenue_change}%)
- Reservations : ${trends.reservations_trend} (${trends.reservations_change > 0 ? '+' : ''}${trends.reservations_change}%)
- Nouveaux clients : ${trends.clients_trend} (${trends.clients_change > 0 ? '+' : ''}${trends.clients_change}%)
- No-show : ${trends.noshow_trend} (${trends.noshow_change > 0 ? '+' : ''}${trends.noshow_change}%)

SERVICES LES PLUS DEMANDES :
${trends.top_services?.map((s, i) => `${i + 1}. ${s.name}: ${s.count} fois`).join('\n') || 'Non disponible'}

COUTS D'UTILISATION :
- Total 30j : ${costTrends.total_cost || 0}€
- Estimation mensuelle : ${costTrends.estimated_monthly || 0}€
- Principal poste : ${costTrends.main_cost_driver || 'N/A'}

OBJECTIFS CLIENT :
- Objectif CA mensuel : ${goals.goal_revenue_monthly || 'Non defini'}€
- Objectif nouveaux clients/mois : ${goals.goal_new_clients_monthly || 'Non defini'}

Genere 3 a 5 insights actionnables et pertinents.

IMPORTANT :
- Sois concret et specifique, pas generique
- Donne des chiffres quand possible
- Propose des actions realisables immediatement
- Priorise les opportunites de revenus

Format JSON strict (pas de texte avant ou apres) :
[{
  "type": "opportunity|warning|tip|trend|achievement",
  "category": "revenue|clients|marketing|operations|costs|performance",
  "title": "Titre court et accrocheur (max 60 chars)",
  "description": "Description detaillee avec contexte et chiffres",
  "impact_type": "revenue_increase|cost_reduction|time_saving|client_retention",
  "impact_value": 500,
  "impact_unit": "eur|percent|hours|clients",
  "suggested_actions": [
    {"action": "Action concrete 1", "priority": 5, "effort": "low|medium|high"},
    {"action": "Action concrete 2", "priority": 3, "effort": "low|medium|high"}
  ],
  "priority": 8
}]`;

      // 4. Appeler Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      });

      // 5. Parser reponse
      let insights = [];
      try {
        const content = response.content[0].text;
        // Nettoyer le JSON (enlever backticks si present)
        const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        insights = JSON.parse(jsonContent);
      } catch (parseError) {
        console.error('[SENTINEL] Error parsing Claude response:', parseError);
        console.log('[SENTINEL] Raw response:', response.content[0].text);
        return [];
      }

      // 6. Sauvegarder insights
      const savedInsights = [];
      for (const insight of insights) {
        // Calculer date expiration (30 jours)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const { data, error } = await supabase
          .from('sentinel_insights')
          .insert({
            tenant_id: tenantId,
            insight_type: insight.type,
            category: insight.category,
            title: insight.title,
            description: insight.description,
            data_snapshot: { trends, costTrends },
            comparison_period: '30d',
            impact_type: insight.impact_type,
            impact_value: insight.impact_value,
            impact_unit: insight.impact_unit,
            suggested_actions: insight.suggested_actions,
            priority: insight.priority,
            expires_at: expiresAt.toISOString()
          })
          .select()
          .single();

        if (!error && data) {
          savedInsights.push(data);
        }
      }

      console.log(`[SENTINEL] Generated ${savedInsights.length} insights for ${tenantId}`);
      return savedInsights;

    } catch (error) {
      console.error(`[SENTINEL] Error generating insights for ${tenantId}:`, error);
      return [];
    }
  }

  /**
   * Genere un insight specifique sur demande
   */
  async generateSpecificInsight(tenantId, topic) {
    const validTopics = ['revenue', 'marketing', 'operations', 'costs', 'retention'];

    if (!validTopics.includes(topic)) {
      throw new Error(`Invalid topic. Valid topics: ${validTopics.join(', ')}`);
    }

    const snapshots = await this.getSnapshots(tenantId, 30);
    const trends = this.calculateTrends(snapshots);

    const topicPrompts = {
      revenue: `Comment augmenter mon chiffre d'affaires? CA actuel: ${trends.avg_daily_revenue}€/jour`,
      marketing: `Comment attirer plus de clients? Nouveaux clients recents: ${trends.total_new_clients}`,
      operations: `Comment reduire les no-shows? Taux actuel: ${trends.avg_no_show_rate}%`,
      costs: `Comment optimiser mes couts? Budget moyen/jour`,
      retention: `Comment fideliser mes clients?`,
    };

    const prompt = `Tu es un consultant business expert. Reponds a cette question specifique pour une entreprise de services:

${topicPrompts[topic]}

Contexte:
- CA 30j: ${trends.total_revenue}€
- Reservations 30j: ${trends.total_reservations}
- Tendance CA: ${trends.revenue_trend} (${trends.revenue_change}%)

Donne 3 conseils ultra-concrets et actionnables. Format JSON:
[{
  "action": "Action concrete",
  "benefit": "Benefice attendu",
  "effort": "low|medium|high",
  "timeline": "immediat|1 semaine|1 mois"
}]`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0].text;
    const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonContent);
  }

  /**
   * Marque un insight comme implemente
   */
  async markAsImplemented(insightId, notes = null) {
    const { data, error } = await supabase
      .from('sentinel_insights')
      .update({
        status: 'implemented',
        implemented_at: new Date().toISOString(),
        implemented_notes: notes
      })
      .eq('id', insightId)
      .select()
      .single();

    return { success: !error, data };
  }

  /**
   * Marque un insight comme ignore
   */
  async dismissInsight(insightId, reason = null) {
    const { data, error } = await supabase
      .from('sentinel_insights')
      .update({
        status: 'dismissed',
        dismissed_at: new Date().toISOString(),
        dismissed_reason: reason
      })
      .eq('id', insightId)
      .select()
      .single();

    return { success: !error, data };
  }

  /**
   * Execute generation hebdomadaire pour tous tenants Business
   */
  async runWeeklyGeneration() {
    if (this.isRunning) {
      console.log('[SENTINEL] Insights generation already running');
      return;
    }

    this.isRunning = true;
    console.log('[SENTINEL] Starting weekly insights generation');

    try {
      // Recuperer tenants Business
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('statut', 'actif')
        .in('plan_id', ['business', 'enterprise']);

      console.log(`[SENTINEL] Found ${tenants?.length || 0} Business tenants`);

      for (const tenant of tenants || []) {
        await this.generateInsights(tenant.id);
        // Delai entre tenants
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log('[SENTINEL] Weekly insights generation completed');

    } catch (error) {
      console.error('[SENTINEL] Weekly generation failed:', error);
    } finally {
      this.isRunning = false;
    }
  }
}

// Instance singleton
export const sentinelInsights = new SentinelInsights();

export default sentinelInsights;
