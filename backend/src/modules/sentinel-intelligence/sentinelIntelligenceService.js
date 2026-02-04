// Module Sentinel Intelligence - sentinelIntelligenceService.js (ESM)
import { supabase } from '../../config/supabase.js';

// ==================== MÉTRIQUES ====================

export async function captureMetrics(tenantId) {
  const today = new Date().toISOString().split('T')[0];

  // Capture TECHNICAL platform metrics only (no business/tenant data)
  const techData = await getTechnicalMetrics();

  const metrics = {
    tenant_id: tenantId,
    date: today,
    // Repurpose columns for technical platform metrics
    revenue_day: techData.avg_latency_ms,        // avg latency ms
    revenue_week: techData.services_up,           // services up count
    revenue_month: techData.services_total,       // services total count
    bookings_day: techData.security_events_24h,   // security events
    bookings_week: techData.security_critical,    // critical security events
    bookings_month: techData.security_high,       // high severity events
    customers_total: techData.uptime_seconds,     // server uptime
    customers_new: techData.rate_limited_blocked,  // rate limited IPs
    customers_active: techData.rate_limited_total, // tracked connections
    stock_items_low: techData.memory_percent,     // memory usage %
    stock_items_out: 0,
    orders_pending: 0,
    orders_completed: 0,
    leaves_pending: 0,
    payments_failed: 0,
  };

  metrics.health_score = calculateHealthScore(metrics);

  // Upsert (unique on tenant_id + date)
  const { data: existing } = await supabase
    .from('si_metrics')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('date', today)
    .single();

  let result;
  if (existing) {
    const { data, error } = await supabase
      .from('si_metrics')
      .update(metrics)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    result = data;
  } else {
    const { data, error } = await supabase
      .from('si_metrics')
      .insert(metrics)
      .select()
      .single();
    if (error) return { success: false, error: error.message };
    result = data;
  }

  return { success: true, data: result };
}

export async function getMetrics(tenantId, startDate, endDate) {
  let query = supabase
    .from('si_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getHealthScore(tenantId) {
  // Compute health score from LIVE technical monitoring (no tenant business data)
  const techData = await getTechnicalMetrics();

  // === Uptime score: % services UP, critical down = big penalty ===
  let uptimeScore = techData.services_total > 0
    ? Math.round((techData.services_up / techData.services_total) * 100)
    : 100;
  if (techData.critical_down > 0) uptimeScore = Math.min(uptimeScore, 30);

  // === Latency score: based on avg response time ===
  let latencyScore = 100;
  const lat = techData.avg_latency_ms;
  if (lat > 2000) latencyScore = 20;
  else if (lat > 1000) latencyScore = 50;
  else if (lat > 500) latencyScore = 70;
  else if (lat > 200) latencyScore = 85;

  // === Security score: inverse of events severity ===
  let securityScore = 100;
  if (techData.security_critical > 0) securityScore -= 40;
  if (techData.security_high > 5) securityScore -= 20;
  else if (techData.security_high > 0) securityScore -= 10;
  if (techData.security_events_24h > 50) securityScore -= 15;
  else if (techData.security_events_24h > 20) securityScore -= 5;
  securityScore = Math.max(0, securityScore);

  // === Performance score: memory usage ===
  let performanceScore = 100;
  const mem = techData.memory_percent;
  if (mem > 90) performanceScore = 20;
  else if (mem > 80) performanceScore = 50;
  else if (mem > 70) performanceScore = 75;

  // === Stability score: rate limits + uptime duration ===
  let stabilityScore = 100;
  if (techData.rate_limited_blocked > 10) stabilityScore -= 30;
  else if (techData.rate_limited_blocked > 3) stabilityScore -= 15;
  else if (techData.rate_limited_blocked > 0) stabilityScore -= 5;
  // Bonus for long uptime
  if (techData.uptime_seconds > 86400) stabilityScore = Math.min(100, stabilityScore + 5);

  // Weighted overall score
  const score = Math.max(0, Math.min(100, Math.round(
    uptimeScore * 0.35 +
    latencyScore * 0.20 +
    securityScore * 0.20 +
    performanceScore * 0.15 +
    stabilityScore * 0.10
  )));

  const status = score >= 80 ? 'excellent' : score >= 60 ? 'bon' : score >= 40 ? 'attention' : 'critique';

  return {
    success: true,
    data: {
      score,
      status,
      breakdown: {
        uptime: uptimeScore,
        latency: latencyScore,
        security: securityScore,
        performance: performanceScore,
        stability: stabilityScore,
      },
      details: {
        services_total: techData.services_total,
        services_up: techData.services_up,
        critical_down: techData.critical_down,
        avg_latency_ms: techData.avg_latency_ms,
        security_events_24h: techData.security_events_24h,
        security_critical: techData.security_critical,
        memory_percent: techData.memory_percent,
        rate_limited: techData.rate_limited_blocked,
        uptime_seconds: techData.uptime_seconds,
      },
    },
  };
}

// ==================== DASHBOARD BI ====================

export async function getDashboard(tenantId) {
  const [metricsRes, alertsRes, predictionsRes, anomaliesRes] = await Promise.all([
    supabase.from('si_metrics').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }).limit(7),
    supabase.from('si_alerts').select('*').eq('tenant_id', tenantId).eq('status', 'active').order('created_at', { ascending: false }).limit(10),
    supabase.from('si_predictions').select('*').eq('tenant_id', tenantId).order('target_date', { ascending: false }).limit(5),
    supabase.from('si_anomalies').select('*').eq('tenant_id', tenantId).eq('resolved', false).order('detected_at', { ascending: false }).limit(5),
  ]);

  const metrics = metricsRes.data || [];
  const latest = metrics[0] || null;

  return {
    success: true,
    data: {
      kpis: latest ? {
        revenue_day: latest.revenue_day,
        revenue_week: latest.revenue_week,
        revenue_month: latest.revenue_month,
        bookings_day: latest.bookings_day,
        bookings_month: latest.bookings_month,
        customers_total: latest.customers_total,
        customers_new: latest.customers_new,
        health_score: latest.health_score,
      } : null,
      active_alerts: (alertsRes.data || []).length,
      alerts: alertsRes.data || [],
      predictions: predictionsRes.data || [],
      anomalies_unresolved: (anomaliesRes.data || []).length,
      anomalies: anomaliesRes.data || [],
      metrics_history: metrics,
    },
  };
}

export async function getKPITrends(tenantId, metric, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('si_metrics')
    .select(`date, ${metric}`)
    .eq('tenant_id', tenantId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true });

  if (error) return { success: false, error: error.message };

  const values = (data || []).map(d => parseFloat(d[metric]) || 0);
  const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const trend = values.length >= 2 ? ((values[values.length - 1] - values[0]) / (values[0] || 1)) * 100 : 0;

  return {
    success: true,
    data: {
      metric,
      days,
      data_points: data || [],
      average: Math.round(avg * 100) / 100,
      trend_percent: Math.round(trend * 100) / 100,
      direction: trend > 5 ? 'up' : trend < -5 ? 'down' : 'stable',
    },
  };
}

export async function getComparison(tenantId, period = 'week') {
  const now = new Date();
  let currentStart, previousStart, previousEnd;

  if (period === 'week') {
    currentStart = new Date(now); currentStart.setDate(now.getDate() - 7);
    previousEnd = new Date(currentStart); previousEnd.setDate(previousEnd.getDate() - 1);
    previousStart = new Date(previousEnd); previousStart.setDate(previousStart.getDate() - 6);
  } else {
    currentStart = new Date(now); currentStart.setDate(now.getDate() - 30);
    previousEnd = new Date(currentStart); previousEnd.setDate(previousEnd.getDate() - 1);
    previousStart = new Date(previousEnd); previousStart.setDate(previousStart.getDate() - 29);
  }

  const [currentRes, previousRes] = await Promise.all([
    supabase.from('si_metrics').select('*').eq('tenant_id', tenantId)
      .gte('date', currentStart.toISOString().split('T')[0])
      .lte('date', now.toISOString().split('T')[0]),
    supabase.from('si_metrics').select('*').eq('tenant_id', tenantId)
      .gte('date', previousStart.toISOString().split('T')[0])
      .lte('date', previousEnd.toISOString().split('T')[0]),
  ]);

  const current = currentRes.data || [];
  const previous = previousRes.data || [];

  const sumMetric = (arr, key) => arr.reduce((s, m) => s + parseFloat(m[key] || 0), 0);
  const change = (curr, prev) => prev > 0 ? Math.round(((curr - prev) / prev) * 100 * 100) / 100 : 0;

  const currentRevenue = sumMetric(current, 'revenue_day');
  const previousRevenue = sumMetric(previous, 'revenue_day');
  const currentBookings = sumMetric(current, 'bookings_day');
  const previousBookings = sumMetric(previous, 'bookings_day');

  return {
    success: true,
    data: {
      period,
      current: { revenue: currentRevenue, bookings: currentBookings, days: current.length },
      previous: { revenue: previousRevenue, bookings: previousBookings, days: previous.length },
      change: {
        revenue: change(currentRevenue, previousRevenue),
        bookings: change(currentBookings, previousBookings),
      },
    },
  };
}

// ==================== ALERTES ====================

export async function getAlerts(tenantId, filters = {}) {
  let query = supabase
    .from('si_alerts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.severity) query = query.eq('severity', filters.severity);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createAlert(tenantId, data) {
  const { type, severity, title, message } = data;
  if (!type || !severity || !title || !message) {
    return { success: false, error: 'type, severity, title, message requis' };
  }

  const { data: alert, error } = await supabase
    .from('si_alerts')
    .insert({
      tenant_id: tenantId,
      type, severity, title, message,
      impact: data.impact || null,
      recommendations: data.recommendations || null,
      data: data.data || null,
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: alert };
}

export async function dismissAlert(tenantId, alertId, userId) {
  const { data, error } = await supabase
    .from('si_alerts')
    .update({ status: 'dismissed', dismissed_at: new Date().toISOString(), dismissed_by: userId || null })
    .eq('id', alertId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function resolveAlert(tenantId, alertId) {
  const { data, error } = await supabase
    .from('si_alerts')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function checkAlertConditions(tenantId) {
  // Check TECHNICAL platform conditions for alerts
  const techData = await getTechnicalMetrics();
  const alertsCreated = [];

  // Critical service down
  if (techData.critical_down > 0) {
    const result = await createAlert(tenantId, {
      type: 'service_down', severity: 'critical',
      title: 'Service critique indisponible',
      message: `${techData.critical_down} service(s) critique(s) DOWN sur ${techData.services_total}`,
      impact: 'critical',
      recommendations: ['Verifier la connexion base de donnees', 'Verifier les cles API', 'Redemarrer les services'],
    });
    if (result.success) alertsCreated.push(result.data);
  }

  // High latency
  if (techData.avg_latency_ms > 1000) {
    const result = await createAlert(tenantId, {
      type: 'high_latency', severity: 'warning',
      title: 'Latence elevee',
      message: `Latence moyenne : ${techData.avg_latency_ms}ms (seuil: 1000ms)`,
      impact: 'medium',
      recommendations: ['Verifier la charge serveur', 'Verifier la connexion base de donnees', 'Analyser les requetes lentes'],
    });
    if (result.success) alertsCreated.push(result.data);
  }

  // Security: critical events
  if (techData.security_critical > 0) {
    const result = await createAlert(tenantId, {
      type: 'security_critical', severity: 'urgent',
      title: 'Evenements securite critiques',
      message: `${techData.security_critical} evenement(s) critique(s) dans les 24h`,
      impact: 'high',
      recommendations: ['Analyser les logs de securite', 'Verifier les IPs bloquees', 'Renforcer les regles de securite'],
    });
    if (result.success) alertsCreated.push(result.data);
  }

  // Memory usage critical
  if (techData.memory_percent > 85) {
    const result = await createAlert(tenantId, {
      type: 'memory_high', severity: 'warning',
      title: 'Memoire elevee',
      message: `Utilisation memoire : ${techData.memory_percent}% (seuil: 85%)`,
      impact: 'medium',
      recommendations: ['Verifier les fuites memoire', 'Redemarrer le serveur si necessaire', 'Augmenter les ressources'],
    });
    if (result.success) alertsCreated.push(result.data);
  }

  return { success: true, data: { alerts_created: alertsCreated.length, alerts: alertsCreated } };
}

// ==================== PRÉDICTIONS ====================

export async function generatePredictions(tenantId) {
  const { data: history } = await supabase
    .from('si_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false })
    .limit(30);

  if (!history || history.length < 3) {
    return { success: true, data: { message: 'Minimum 3 jours de données nécessaires', predictions: [] } };
  }

  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const revenueValues = history.map(m => parseFloat(m.revenue_day));
  const bookingValues = history.map(m => parseInt(m.bookings_day));

  const revenuePred = predictLinear(revenueValues);
  const bookingPred = predictLinear(bookingValues);

  const predictions = [
    {
      tenant_id: tenantId,
      prediction_date: today.toISOString().split('T')[0],
      target_date: nextWeek.toISOString().split('T')[0],
      type: 'revenue',
      predicted_value: Math.round(revenuePred.predicted * 7 * 100) / 100,
      confidence_score: revenuePred.confidence,
      baseline_value: Math.round(revenueValues.slice(0, 7).reduce((s, v) => s + v, 0) * 100) / 100,
      details: { method: 'linear_regression', data_points: history.length },
    },
    {
      tenant_id: tenantId,
      prediction_date: today.toISOString().split('T')[0],
      target_date: nextWeek.toISOString().split('T')[0],
      type: 'bookings',
      predicted_value: Math.round(bookingPred.predicted * 7),
      confidence_score: bookingPred.confidence,
      baseline_value: bookingValues.slice(0, 7).reduce((s, v) => s + v, 0),
      details: { method: 'linear_regression', data_points: history.length },
    },
  ];

  const { data, error } = await supabase.from('si_predictions').insert(predictions).select();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getPredictions(tenantId, targetDate) {
  let query = supabase
    .from('si_predictions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (targetDate) query = query.eq('target_date', targetDate);
  else query = query.limit(10);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updatePredictionActuals(tenantId, predictionId, actualValue) {
  const { data, error } = await supabase
    .from('si_predictions')
    .update({ actual_value: actualValue })
    .eq('id', predictionId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getPredictionAccuracy(tenantId) {
  const { data } = await supabase
    .from('si_predictions')
    .select('*')
    .eq('tenant_id', tenantId)
    .not('actual_value', 'is', null);

  if (!data || data.length === 0) {
    return { success: true, data: { accuracy: null, message: 'Aucune prédiction vérifiée', total: 0 } };
  }

  const errors = data.map(p => {
    const predicted = parseFloat(p.predicted_value);
    const actual = parseFloat(p.actual_value);
    return actual > 0 ? Math.abs((predicted - actual) / actual) * 100 : 0;
  });

  const avgError = errors.reduce((s, e) => s + e, 0) / errors.length;
  const accuracy = Math.max(0, 100 - avgError);

  return {
    success: true,
    data: {
      accuracy: Math.round(accuracy * 100) / 100,
      avg_error_percent: Math.round(avgError * 100) / 100,
      total_predictions: data.length,
      verified: data.length,
    },
  };
}

// ==================== RAPPORTS ====================

export async function generateReport(tenantId, type, startDate, endDate) {
  const start = startDate || getDefaultStart(type);
  const end = endDate || new Date().toISOString().split('T')[0];

  // Get metrics for period
  const { data: metrics } = await supabase
    .from('si_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true });

  const m = metrics || [];
  const totalRevenue = m.reduce((s, d) => s + parseFloat(d.revenue_day || 0), 0);
  const totalBookings = m.reduce((s, d) => s + parseInt(d.bookings_day || 0), 0);
  const avgHealth = m.length > 0 ? Math.round(m.reduce((s, d) => s + (d.health_score || 0), 0) / m.length) : 0;
  const totalNewCustomers = m.reduce((s, d) => s + (d.customers_new || 0), 0);

  const summary = {
    period: { start, end, days: m.length },
    revenue: Math.round(totalRevenue * 100) / 100,
    bookings: totalBookings,
    avg_health_score: avgHealth,
    new_customers: totalNewCustomers,
    avg_revenue_per_day: m.length > 0 ? Math.round((totalRevenue / m.length) * 100) / 100 : 0,
  };

  const highlights = [
    `CA total : ${summary.revenue}€ sur ${m.length} jours`,
    `${totalBookings} réservations (${m.length > 0 ? Math.round(totalBookings / m.length) : 0}/jour en moyenne)`,
    `Score santé moyen : ${avgHealth}/100`,
    `${totalNewCustomers} nouveaux clients acquis`,
  ];

  const recommendations = [
    avgHealth < 60 ? 'Améliorer le score santé : vérifier stock et paiements' : 'Maintenir la dynamique positive',
    totalNewCustomers < m.length ? 'Augmenter l\'acquisition clients (promotions, parrainage)' : 'Bonne acquisition, fidéliser les nouveaux clients',
    'Planifier les actions marketing pour la période suivante',
  ];

  const charts = {
    revenue_by_day: m.map(d => ({ date: d.date, value: parseFloat(d.revenue_day) })),
    bookings_by_day: m.map(d => ({ date: d.date, value: parseInt(d.bookings_day) })),
    health_by_day: m.map(d => ({ date: d.date, value: d.health_score })),
  };

  const fileUrl = `/reports/${tenantId}_${type}_${start}_${end}.pdf`;

  const { data: report, error } = await supabase
    .from('si_reports')
    .insert({
      tenant_id: tenantId, type,
      period_start: start, period_end: end,
      summary, highlights, recommendations, charts,
      file_url: fileUrl,
      status: 'generated',
      generated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: report };
}

export async function getReports(tenantId, filters = {}) {
  let query = supabase
    .from('si_reports')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function sendReport(tenantId, reportId, email) {
  const { data, error } = await supabase
    .from('si_reports')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', reportId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data, message: `Rapport envoyé à ${email || 'admin'}` };
}

// ==================== ANOMALIES ====================

export async function detectAnomalies(tenantId) {
  const { data: history } = await supabase
    .from('si_metrics')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false })
    .limit(30);

  if (!history || history.length < 7) {
    return { success: true, data: { anomalies_detected: 0, message: 'Minimum 7 jours nécessaires' } };
  }

  const latest = history[0];
  const baseline = history.slice(1);
  const detected = [];

  // Check revenue anomaly
  const revenueHistory = baseline.map(m => parseFloat(m.revenue_day));
  const revenueAnomaly = detectStatAnomaly('revenue_day', revenueHistory, parseFloat(latest.revenue_day));
  if (revenueAnomaly.detected) {
    const { data: anom } = await supabase.from('si_anomalies').insert({
      tenant_id: tenantId, type: revenueAnomaly.current < revenueAnomaly.baseline ? 'revenue_drop' : 'revenue_spike',
      metric: 'revenue_day', baseline_value: revenueAnomaly.baseline, current_value: revenueAnomaly.current,
      deviation_percent: revenueAnomaly.deviationPercent, severity: revenueAnomaly.severity,
      possible_causes: revenueAnomaly.current < revenueAnomaly.baseline
        ? ['Annulations massives', 'Jour férié non prévu', 'Problème technique']
        : ['Promotion virale', 'Événement spécial', 'Nouveaux clients'],
    }).select().single();
    if (anom) detected.push(anom);
  }

  // Check bookings anomaly
  const bookingHistory = baseline.map(m => parseInt(m.bookings_day));
  const bookingAnomaly = detectStatAnomaly('bookings_day', bookingHistory, parseInt(latest.bookings_day));
  if (bookingAnomaly.detected) {
    const { data: anom } = await supabase.from('si_anomalies').insert({
      tenant_id: tenantId, type: bookingAnomaly.current < bookingAnomaly.baseline ? 'booking_drop' : 'booking_spike',
      metric: 'bookings_day', baseline_value: bookingAnomaly.baseline, current_value: bookingAnomaly.current,
      deviation_percent: bookingAnomaly.deviationPercent, severity: bookingAnomaly.severity,
      possible_causes: ['Variation saisonnière', 'Impact promotion', 'Changement horaire'],
    }).select().single();
    if (anom) detected.push(anom);
  }

  return { success: true, data: { anomalies_detected: detected.length, anomalies: detected } };
}

export async function getAnomalies(tenantId, filters = {}) {
  let query = supabase
    .from('si_anomalies')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('detected_at', { ascending: false });

  if (filters.resolved !== undefined) query = query.eq('resolved', filters.resolved === 'true');
  if (filters.severity) query = query.eq('severity', filters.severity);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function investigateAnomaly(tenantId, anomalyId, notes) {
  const { data, error } = await supabase
    .from('si_anomalies')
    .update({ investigated: true, investigation_notes: notes || 'Investigué' })
    .eq('id', anomalyId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function resolveAnomaly(tenantId, anomalyId) {
  const { data, error } = await supabase
    .from('si_anomalies')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', anomalyId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== INSIGHTS ====================

export async function generateInsights(tenantId) {
  // Technical platform insights
  const techData = await getTechnicalMetrics();
  const healthRes = await getHealthScore(tenantId);
  const score = healthRes.data?.score ?? 0;
  const insights = [];

  // Uptime
  if (techData.critical_down > 0) {
    insights.push(`Service(s) critique(s) DOWN : ${techData.critical_down}/${techData.services_total}. Intervention requise.`);
  } else if (techData.services_up === techData.services_total) {
    insights.push(`Tous les services operationnels (${techData.services_up}/${techData.services_total}).`);
  } else {
    insights.push(`${techData.services_up}/${techData.services_total} services UP. Services non-critiques degrades.`);
  }

  // Latency
  if (techData.avg_latency_ms > 500) {
    insights.push(`Latence moyenne elevee : ${techData.avg_latency_ms}ms. Investiguer les performances.`);
  } else if (techData.avg_latency_ms > 0) {
    insights.push(`Latence moyenne : ${techData.avg_latency_ms}ms (bon).`);
  }

  // Security
  if (techData.security_critical > 0) {
    insights.push(`${techData.security_critical} evenement(s) securite critique(s) dans les 24h.`);
  }
  if (techData.security_events_24h > 20) {
    insights.push(`${techData.security_events_24h} evenements securite (24h). Activite elevee.`);
  } else if (techData.security_events_24h === 0) {
    insights.push(`Aucun evenement securite dans les 24h.`);
  }

  // Memory
  if (techData.memory_percent > 80) {
    insights.push(`Memoire utilisee a ${techData.memory_percent}%. Surveiller.`);
  }

  // Uptime duration
  const uptimeHours = Math.floor(techData.uptime_seconds / 3600);
  if (uptimeHours > 24) {
    insights.push(`Serveur stable depuis ${uptimeHours}h.`);
  }

  // Overall
  if (score >= 80) insights.push(`Excellente sante plateforme (${score}/100).`);
  else if (score < 50) insights.push(`Score sante bas (${score}/100). Attention requise.`);

  return { success: true, data: { insights, health_score: score } };
}

export async function getActionableRecommendations(tenantId) {
  const [healthRes, alertsRes] = await Promise.all([
    getHealthScore(tenantId),
    supabase.from('si_alerts').select('type, severity, title').eq('tenant_id', tenantId).eq('status', 'active').order('created_at', { ascending: false }).limit(5),
  ]);

  const recommendations = [];
  const health = healthRes.data;

  if (health && health.score !== null) {
    if (health.score < 40) recommendations.push({ priority: 1, action: 'Sante plateforme critique : verifier services et securite', category: 'health' });
    if (health.breakdown?.uptime < 80) recommendations.push({ priority: 1, action: 'Services indisponibles : verifier la connectivite', category: 'uptime' });
    if (health.breakdown?.security < 70) recommendations.push({ priority: 2, action: 'Evenements securite detectes : analyser les logs', category: 'security' });
    if (health.breakdown?.performance < 60) recommendations.push({ priority: 2, action: 'Performance degradee : verifier memoire et charge', category: 'performance' });
    if (health.breakdown?.latency < 70) recommendations.push({ priority: 3, action: 'Latence elevee : optimiser les requetes', category: 'latency' });
  }

  const activeAlerts = alertsRes.data || [];
  for (const alert of activeAlerts.slice(0, 2)) {
    recommendations.push({ priority: alert.severity === 'critical' ? 1 : 3, action: alert.title, category: 'alert' });
  }

  if (recommendations.length === 0) {
    recommendations.push({ priority: 5, action: 'Plateforme saine. Aucune action requise.', category: 'positive' });
  }

  recommendations.sort((a, b) => a.priority - b.priority);

  return { success: true, data: recommendations.slice(0, 5) };
}

// ==================== HELPERS ====================

// Collect live technical metrics from monitoring modules
async function getTechnicalMetrics() {
  try {
    const { getStatus } = await import('../../sentinel/monitoring/uptimeMonitor.js');
    const { getSecurityStats } = await import('../../sentinel/security/securityLogger.js');
    const { getRateLimitStats } = await import('../../sentinel/security/rateLimiter.js');

    const uptimeStatus = getStatus();
    const securityStats = await getSecurityStats(24);
    const rateLimitStats = getRateLimitStats();

    const services = Object.values(uptimeStatus.services || {});
    const servicesUp = services.filter(s => s.status === 'up').length;
    const criticalDown = services.filter(s => s.critical && s.status !== 'up').length;
    const latencies = services.filter(s => s.latency > 0).map(s => s.latency);
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length)
      : 0;

    const memUsage = process.memoryUsage();
    const memPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

    return {
      services_total: services.length,
      services_up: servicesUp,
      critical_down: criticalDown,
      avg_latency_ms: avgLatency,
      security_events_24h: securityStats.total || 0,
      security_critical: securityStats.critical || 0,
      security_high: securityStats.high || 0,
      memory_percent: memPercent,
      uptime_seconds: Math.floor(process.uptime()),
      rate_limited_blocked: rateLimitStats.blocked || 0,
      rate_limited_total: rateLimitStats.totalTracked || 0,
    };
  } catch (err) {
    console.error('[SI] Error collecting technical metrics:', err.message);
    return {
      services_total: 0, services_up: 0, critical_down: 0,
      avg_latency_ms: 0, security_events_24h: 0, security_critical: 0,
      security_high: 0, memory_percent: 0, uptime_seconds: Math.floor(process.uptime()),
      rate_limited_blocked: 0, rate_limited_total: 0,
    };
  }
}

function calculateHealthScore(techData) {
  // Technical health score based on platform metrics
  let uptimeScore = techData.services_total > 0
    ? Math.round((techData.services_up / techData.services_total) * 100)
    : 100;
  if (techData.critical_down > 0) uptimeScore = Math.min(uptimeScore, 30);

  let securityScore = 100;
  if (techData.security_critical > 0) securityScore -= 40;
  if (techData.security_high > 0) securityScore -= 10;
  securityScore = Math.max(0, securityScore);

  let performanceScore = 100;
  if (techData.memory_percent > 90) performanceScore = 20;
  else if (techData.memory_percent > 80) performanceScore = 50;

  return Math.max(0, Math.min(100, Math.round(
    uptimeScore * 0.5 + securityScore * 0.25 + performanceScore * 0.25
  )));
}

function predictLinear(values) {
  if (values.length < 3) return { predicted: 0, confidence: 0 };
  const recent = values.slice(0, Math.min(7, values.length));
  const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const trend = recent.length >= 2 ? (recent[0] - recent[recent.length - 1]) / recent.length : 0;
  const predicted = Math.max(0, avg + trend);
  const confidence = Math.min(0.95, 0.5 + (values.length / 40));
  return { predicted: Math.round(predicted * 100) / 100, confidence: Math.round(confidence * 100) / 100 };
}

function detectStatAnomaly(metric, historicalData, currentValue) {
  if (historicalData.length < 5) return { detected: false };
  const mean = historicalData.reduce((s, v) => s + v, 0) / historicalData.length;
  const stdDev = Math.sqrt(historicalData.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / historicalData.length);
  if (stdDev === 0) return { detected: false };

  const deviation = Math.abs(currentValue - mean);
  const zScore = deviation / stdDev;

  if (zScore > 2) {
    return {
      detected: true,
      baseline: Math.round(mean * 100) / 100,
      current: currentValue,
      deviationPercent: Math.round(((currentValue - mean) / mean) * 100 * 100) / 100,
      severity: zScore > 3 ? 'high' : 'medium',
    };
  }
  return { detected: false };
}

function getDefaultStart(type) {
  const now = new Date();
  if (type === 'weekly') {
    now.setDate(now.getDate() - 7);
  } else if (type === 'monthly') {
    now.setMonth(now.getMonth() - 1);
  } else {
    now.setMonth(now.getMonth() - 3);
  }
  return now.toISOString().split('T')[0];
}

// ==================== AUTO-ANALYSIS ====================

let autoAnalysisInterval = null;

export function startAutoAnalysis(tenantIds = ['default'], intervalMs = 2 * 60 * 60 * 1000) {
  if (autoAnalysisInterval) clearInterval(autoAnalysisInterval);

  const runCycle = async () => {
    for (const tenantId of tenantIds) {
      try {
        // 1. Capturer les metriques
        const metricsResult = await captureMetrics(tenantId);
        console.log(`[SI-AUTO] Metrics captured for ${tenantId}:`, metricsResult.success ? 'OK' : metricsResult.error);

        // 2. Detecter les anomalies
        const anomaliesResult = await detectAnomalies(tenantId);
        console.log(`[SI-AUTO] Anomalies detected for ${tenantId}:`, anomaliesResult.success ? `${anomaliesResult.data?.length || 0} found` : anomaliesResult.error);

        // 3. Generer des predictions
        const predictionsResult = await generatePredictions(tenantId);
        console.log(`[SI-AUTO] Predictions for ${tenantId}:`, predictionsResult.success ? 'OK' : predictionsResult.error);

        // 4. Verifier les conditions d'alerte
        const alertsResult = await checkAlertConditions(tenantId);
        console.log(`[SI-AUTO] Alerts check for ${tenantId}:`, alertsResult.success ? `${alertsResult.data?.triggered || 0} triggered` : alertsResult.error);
      } catch (err) {
        console.error(`[SI-AUTO] Error for ${tenantId}:`, err.message);
      }
    }
  };

  // Premier cycle immédiat
  runCycle();

  // Puis toutes les intervalMs (2h par défaut)
  autoAnalysisInterval = setInterval(runCycle, intervalMs);
  console.log(`[SI-AUTO] Auto-analysis started (every ${intervalMs / 1000 / 60}min) for ${tenantIds.length} tenant(s)`);
}

export function stopAutoAnalysis() {
  if (autoAnalysisInterval) {
    clearInterval(autoAnalysisInterval);
    autoAnalysisInterval = null;
  }
}
