/**
 * Routes SENTINEL - Dashboard Analytics Client
 * Business Intelligence pour clients Business plan
 */

import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateToken, requirePlan } from '../middleware/auth.js';
import { sentinelCollector } from '../services/sentinelCollector.js';
import { sentinelInsights } from '../services/sentinelInsights.js';

const router = express.Router();

// ============================================
// DASHBOARD PRINCIPAL
// ============================================

/**
 * GET /api/sentinel/dashboard
 * Dashboard principal avec resume complet
 */
router.get('/dashboard', authenticateToken, requirePlan('business'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const today = new Date().toISOString().split('T')[0];

    // 1. Snapshot aujourd'hui
    const { data: todaySnapshot } = await supabase
      .from('sentinel_daily_snapshots')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('date', today)
      .single();

    // 2. Snapshots 30 derniers jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: snapshots } = await supabase
      .from('sentinel_daily_snapshots')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: true });

    // 3. Couts 30 derniers jours
    const { data: costs } = await supabase
      .from('sentinel_daily_costs')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: true });

    // 4. Insights actifs
    const { data: insights } = await supabase
      .from('sentinel_insights')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('priority', { ascending: false })
      .limit(10);

    // 5. Objectifs
    const { data: goals } = await supabase
      .from('sentinel_goals')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    // 6. Calculer tendances
    const trends = calculateTrends(snapshots || []);
    const costSummary = calculateCostSummary(costs || []);

    // 7. Calculer progression objectifs
    const performance = calculateGoalPerformance(snapshots || [], goals);

    res.json({
      success: true,
      data: {
        today: todaySnapshot || getEmptySnapshot(tenantId, today),
        trends,
        costs: costSummary,
        insights: insights || [],
        goals: goals || {},
        performance,
        period: {
          start: thirtyDaysAgo.toISOString().split('T')[0],
          end: today,
          days: 30
        }
      }
    });

  } catch (error) {
    console.error('[SENTINEL] Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sentinel/refresh
 * Forcer rafraichissement des donnees (temps reel)
 */
router.post('/refresh', authenticateToken, requirePlan('business'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    await sentinelCollector.collectRealtime(tenantId);

    res.json({
      success: true,
      message: 'Data refreshed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[SENTINEL] Refresh error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ACTIVITE DETAILLEE
// ============================================

/**
 * GET /api/sentinel/activity/:period
 * Activite detaillee par periode (7d, 30d, 90d)
 */
router.get('/activity/:period', authenticateToken, requirePlan('business'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { period } = req.params;

    // Valider periode
    const days = { '7d': 7, '30d': 30, '90d': 90 }[period];
    if (!days) {
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Use: 7d, 30d, or 90d'
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: snapshots, error } = await supabase
      .from('sentinel_daily_snapshots')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) throw error;

    // Calculer totaux et moyennes
    const totals = {
      revenue: snapshots.reduce((s, d) => s + (d.revenue_paid || 0), 0),
      reservations: snapshots.reduce((s, d) => s + (d.total_reservations || 0), 0),
      new_clients: snapshots.reduce((s, d) => s + (d.new_clients || 0), 0),
      no_shows: snapshots.reduce((s, d) => s + (d.no_show_count || 0), 0),
      cancelled: snapshots.reduce((s, d) => s + (d.reservations_cancelled || 0), 0),
    };

    const averages = {
      daily_revenue: totals.revenue / days,
      daily_reservations: totals.reservations / days,
      no_show_rate: snapshots.length > 0
        ? snapshots.reduce((s, d) => s + (d.no_show_rate || 0), 0) / snapshots.length
        : 0,
      basket: totals.reservations > 0 ? totals.revenue / totals.reservations : 0,
    };

    res.json({
      success: true,
      data: {
        period,
        days,
        snapshots,
        totals,
        averages,
        trends: calculateTrends(snapshots)
      }
    });

  } catch (error) {
    console.error('[SENTINEL] Activity error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// COUTS
// ============================================

/**
 * GET /api/sentinel/costs/:period
 * Couts detailles par periode
 */
router.get('/costs/:period', authenticateToken, requirePlan('business'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { period } = req.params;

    const days = { '7d': 7, '30d': 30, '90d': 90 }[period];
    if (!days) {
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Use: 7d, 30d, or 90d'
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: costs, error } = await supabase
      .from('sentinel_daily_costs')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) throw error;

    // Breakdown par type
    const breakdown = {
      ai: costs.reduce((s, c) => s + (c.ai_cost_eur || 0), 0),
      sms: costs.reduce((s, c) => s + (c.sms_cost_eur || 0), 0),
      voice: costs.reduce((s, c) => s + (c.voice_cost_eur || 0), 0),
      email: costs.reduce((s, c) => s + (c.emails_cost_eur || 0), 0),
    };

    const total = breakdown.ai + breakdown.sms + breakdown.voice + breakdown.email;
    const avgDaily = costs.length > 0 ? total / costs.length : 0;

    res.json({
      success: true,
      data: {
        period,
        days,
        costs,
        summary: {
          total: Math.round(total * 100) / 100,
          avg_daily: Math.round(avgDaily * 100) / 100,
          estimated_monthly: Math.round(avgDaily * 30 * 100) / 100,
          breakdown
        }
      }
    });

  } catch (error) {
    console.error('[SENTINEL] Costs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// INSIGHTS & RECOMMANDATIONS
// ============================================

/**
 * GET /api/sentinel/insights
 * Liste des insights actifs
 */
router.get('/insights', authenticateToken, requirePlan('business'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { status = 'active', limit = 20 } = req.query;

    const { data: insights, error } = await supabase
      .from('sentinel_insights')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', status)
      .order('priority', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({ success: true, data: insights });

  } catch (error) {
    console.error('[SENTINEL] Insights error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sentinel/insights/generate
 * Forcer generation de nouveaux insights
 */
router.post('/insights/generate', authenticateToken, requirePlan('business'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const insights = await sentinelInsights.generateInsights(tenantId);

    res.json({
      success: true,
      data: insights,
      message: `Generated ${insights.length} new insights`
    });

  } catch (error) {
    console.error('[SENTINEL] Generate insights error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sentinel/insights/ask
 * Demander un insight specifique
 */
router.post('/insights/ask', authenticateToken, requirePlan('business'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { topic } = req.body;

    if (!topic) {
      return res.status(400).json({
        success: false,
        error: 'topic is required (revenue, marketing, operations, costs, retention)'
      });
    }

    const advice = await sentinelInsights.generateSpecificInsight(tenantId, topic);

    res.json({
      success: true,
      topic,
      data: advice
    });

  } catch (error) {
    console.error('[SENTINEL] Ask insight error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/sentinel/insights/:id/dismiss
 * Ignorer un insight
 */
router.patch('/insights/:id/dismiss', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const result = await sentinelInsights.dismissInsight(id, reason);

    if (!result.success) {
      return res.status(404).json({ success: false, error: 'Insight not found' });
    }

    res.json({ success: true, data: result.data });

  } catch (error) {
    console.error('[SENTINEL] Dismiss insight error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/sentinel/insights/:id/implement
 * Marquer un insight comme implemente
 */
router.patch('/insights/:id/implement', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const result = await sentinelInsights.markAsImplemented(id, notes);

    if (!result.success) {
      return res.status(404).json({ success: false, error: 'Insight not found' });
    }

    res.json({ success: true, data: result.data });

  } catch (error) {
    console.error('[SENTINEL] Implement insight error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// OBJECTIFS
// ============================================

/**
 * GET /api/sentinel/goals
 * Recuperer objectifs du tenant
 */
router.get('/goals', authenticateToken, requirePlan('business'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;

    const { data: goals, error } = await supabase
      .from('sentinel_goals')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    res.json({
      success: true,
      data: goals || getDefaultGoals(tenantId)
    });

  } catch (error) {
    console.error('[SENTINEL] Get goals error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/sentinel/goals
 * Mettre a jour objectifs
 */
router.put('/goals', authenticateToken, requirePlan('business'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const {
      goal_revenue_monthly,
      goal_new_clients_monthly,
      goal_reservations_monthly,
      goal_conversion_rate,
      goal_completion_rate,
      alert_no_show_rate_threshold,
      alert_cancellation_rate_threshold,
      alert_cost_daily_threshold,
      alert_low_booking_threshold,
      notify_daily_summary,
      notify_weekly_report,
      notify_goal_achieved,
      notify_alerts,
      notification_email,
      notification_phone
    } = req.body;

    const { data, error } = await supabase
      .from('sentinel_goals')
      .upsert({
        tenant_id: tenantId,
        goal_revenue_monthly,
        goal_new_clients_monthly,
        goal_reservations_monthly,
        goal_conversion_rate,
        goal_completion_rate,
        alert_no_show_rate_threshold,
        alert_cancellation_rate_threshold,
        alert_cost_daily_threshold,
        alert_low_booking_threshold,
        notify_daily_summary,
        notify_weekly_report,
        notify_goal_achieved,
        notify_alerts,
        notification_email,
        notification_phone,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id' })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });

  } catch (error) {
    console.error('[SENTINEL] Update goals error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HELPERS
// ============================================

function calculateTrends(snapshots) {
  if (!snapshots || snapshots.length < 2) {
    return { insufficient_data: true };
  }

  const mid = Math.floor(snapshots.length / 2);
  const firstHalf = snapshots.slice(0, mid);
  const secondHalf = snapshots.slice(mid);

  const avgFirst = {
    revenue: firstHalf.reduce((s, d) => s + (d.revenue_paid || 0), 0) / firstHalf.length,
    reservations: firstHalf.reduce((s, d) => s + (d.total_reservations || 0), 0) / firstHalf.length,
  };

  const avgSecond = {
    revenue: secondHalf.reduce((s, d) => s + (d.revenue_paid || 0), 0) / secondHalf.length,
    reservations: secondHalf.reduce((s, d) => s + (d.total_reservations || 0), 0) / secondHalf.length,
  };

  const calcChange = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  return {
    total_revenue: Math.round(snapshots.reduce((s, d) => s + (d.revenue_paid || 0), 0)),
    total_reservations: snapshots.reduce((s, d) => s + (d.total_reservations || 0), 0),
    total_new_clients: snapshots.reduce((s, d) => s + (d.new_clients || 0), 0),
    avg_daily_revenue: Math.round(avgSecond.revenue),
    revenue_trend: avgSecond.revenue >= avgFirst.revenue ? 'up' : 'down',
    revenue_change: calcChange(avgSecond.revenue, avgFirst.revenue),
    reservations_trend: avgSecond.reservations >= avgFirst.reservations ? 'up' : 'down',
    reservations_change: calcChange(avgSecond.reservations, avgFirst.reservations),
  };
}

function calculateCostSummary(costs) {
  if (!costs || costs.length === 0) {
    return { total: 0, avg_daily: 0, estimated_monthly: 0 };
  }

  const total = costs.reduce((s, c) => s + (c.total_cost_eur || 0), 0);
  const avgDaily = total / costs.length;

  return {
    total: Math.round(total * 100) / 100,
    avg_daily: Math.round(avgDaily * 100) / 100,
    estimated_monthly: Math.round(avgDaily * 30 * 100) / 100,
    breakdown: {
      ai: Math.round(costs.reduce((s, c) => s + (c.ai_cost_eur || 0), 0) * 100) / 100,
      sms: Math.round(costs.reduce((s, c) => s + (c.sms_cost_eur || 0), 0) * 100) / 100,
      voice: Math.round(costs.reduce((s, c) => s + (c.voice_cost_eur || 0), 0) * 100) / 100,
      email: Math.round(costs.reduce((s, c) => s + (c.emails_cost_eur || 0), 0) * 100) / 100,
    }
  };
}

function calculateGoalPerformance(snapshots, goals) {
  if (!goals || !snapshots || snapshots.length === 0) {
    return { no_goals: true };
  }

  // Calculer totaux du mois en cours
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthSnapshots = snapshots.filter(s => new Date(s.date) >= firstOfMonth);

  const monthRevenue = monthSnapshots.reduce((s, d) => s + (d.revenue_paid || 0), 0);
  const monthNewClients = monthSnapshots.reduce((s, d) => s + (d.new_clients || 0), 0);
  const monthReservations = monthSnapshots.reduce((s, d) => s + (d.total_reservations || 0), 0);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const projectionMultiplier = daysInMonth / dayOfMonth;

  return {
    revenue: {
      current: Math.round(monthRevenue),
      goal: goals.goal_revenue_monthly || 0,
      projected: Math.round(monthRevenue * projectionMultiplier),
      progress: goals.goal_revenue_monthly > 0
        ? Math.round((monthRevenue / goals.goal_revenue_monthly) * 100)
        : 0
    },
    new_clients: {
      current: monthNewClients,
      goal: goals.goal_new_clients_monthly || 0,
      projected: Math.round(monthNewClients * projectionMultiplier),
      progress: goals.goal_new_clients_monthly > 0
        ? Math.round((monthNewClients / goals.goal_new_clients_monthly) * 100)
        : 0
    },
    reservations: {
      current: monthReservations,
      goal: goals.goal_reservations_monthly || 0,
      projected: Math.round(monthReservations * projectionMultiplier),
      progress: goals.goal_reservations_monthly > 0
        ? Math.round((monthReservations / goals.goal_reservations_monthly) * 100)
        : 0
    }
  };
}

function getEmptySnapshot(tenantId, date) {
  return {
    tenant_id: tenantId,
    date,
    total_clients: 0,
    new_clients: 0,
    total_reservations: 0,
    revenue_paid: 0,
    no_show_rate: 0
  };
}

function getDefaultGoals(tenantId) {
  return {
    tenant_id: tenantId,
    goal_revenue_monthly: null,
    goal_new_clients_monthly: null,
    goal_reservations_monthly: null,
    alert_no_show_rate_threshold: 15,
    alert_cancellation_rate_threshold: 20,
    alert_cost_daily_threshold: 50,
    notify_daily_summary: true,
    notify_weekly_report: true,
    notify_alerts: true
  };
}

export default router;
