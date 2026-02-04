/**
 * Persistance SENTINEL dans Supabase
 *
 * Sauvegarde les stats d'usage par tenant/jour et les alertes.
 * Charge au démarrage pour restaurer l'état.
 */

import { supabase } from '../config/supabase.js';

/**
 * Sauvegarder/mettre à jour usage du jour pour un tenant.
 * Upsert : crée ou met à jour la ligne tenant_id + date du jour.
 */
export async function saveUsage(tenantId, usage) {
  const today = new Date().toISOString().split('T')[0];

  try {
    const { error } = await supabase
      .from('sentinel_usage')
      .upsert({
        tenant_id: tenantId,
        date: today,
        calls: usage.calls,
        tokens_in: usage.tokensIn,
        tokens_out: usage.tokensOut,
        cost: usage.cost,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id,date',
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[SENTINEL] Erreur sauvegarde usage:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Charger usage du mois en cours pour un tenant (pour calcul quota).
 */
export async function loadMonthUsage(tenantId) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  try {
    const { data, error } = await supabase
      .from('sentinel_usage')
      .select('calls, tokens_in, tokens_out, cost')
      .eq('tenant_id', tenantId)
      .gte('date', startOfMonth.toISOString().split('T')[0]);

    if (error) throw error;

    const totals = (data || []).reduce((acc, row) => ({
      calls: acc.calls + row.calls,
      tokensIn: acc.tokensIn + row.tokens_in,
      tokensOut: acc.tokensOut + row.tokens_out,
      cost: acc.cost + parseFloat(row.cost),
    }), { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 });

    return totals;
  } catch (error) {
    console.error('[SENTINEL] Erreur chargement usage:', error.message);
    return { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
  }
}

/**
 * Charger usage de tous les tenants (mois en cours), pour dashboard.
 */
export async function loadAllUsage() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);

  try {
    const { data, error } = await supabase
      .from('sentinel_usage')
      .select('tenant_id, calls, tokens_in, tokens_out, cost')
      .gte('date', startOfMonth.toISOString().split('T')[0]);

    if (error) throw error;

    const byTenant = {};
    for (const row of (data || [])) {
      if (!byTenant[row.tenant_id]) {
        byTenant[row.tenant_id] = { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
      }
      byTenant[row.tenant_id].calls += row.calls;
      byTenant[row.tenant_id].tokensIn += row.tokens_in;
      byTenant[row.tenant_id].tokensOut += row.tokens_out;
      byTenant[row.tenant_id].cost += parseFloat(row.cost);
    }

    return byTenant;
  } catch (error) {
    console.error('[SENTINEL] Erreur chargement all usage:', error.message);
    return {};
  }
}

/**
 * Sauvegarder une alerte dans Supabase.
 */
export async function saveAlert(tenantId, level, percentage, message) {
  try {
    const { error } = await supabase
      .from('sentinel_alerts')
      .insert({
        tenant_id: tenantId,
        level,
        percentage,
        message,
      });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('[SENTINEL] Erreur sauvegarde alerte:', error.message);
    return { success: false };
  }
}

/**
 * Charger les alertes récentes depuis Supabase.
 */
export async function loadRecentAlerts(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('sentinel_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[SENTINEL] Erreur chargement alertes:', error.message);
    return [];
  }
}
