// Module Marketing - marketingService.js (ESM)
import { supabase } from '../../config/supabase.js';
import { Resend } from 'resend';

const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// ==================== CAMPAGNES ====================

export async function getCampaigns(tenantId, filters = {}) {
  let query = supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.type) query = query.eq('type', filters.type);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getCampaignById(tenantId, id) {
  const { data: campaign, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (error) return { success: false, error: error.message };

  const { data: sends } = await supabase
    .from('campaign_sends')
    .select('*')
    .eq('campaign_id', id)
    .order('sent_at', { ascending: false })
    .limit(100);

  return { success: true, data: { ...campaign, sends: sends || [] } };
}

export async function createCampaign(tenantId, campaignData) {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .insert({ tenant_id: tenantId, ...campaignData })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateCampaign(tenantId, id, updates) {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function deleteCampaign(tenantId, id) {
  const { data: existing } = await supabase
    .from('marketing_campaigns')
    .select('status')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!existing) return { success: false, error: 'Campagne non trouvée' };
  if (existing.status === 'running') return { success: false, error: 'Impossible de supprimer une campagne en cours' };

  const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id).eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function scheduleCampaign(tenantId, id, scheduledAt) {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update({ status: 'scheduled', scheduled_at: scheduledAt, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', 'draft')
    .select()
    .single();

  if (error) return { success: false, error: 'Campagne non trouvée ou pas en brouillon' };
  return { success: true, data };
}

export async function sendCampaign(tenantId, id) {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update({ status: 'running', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .in('status', ['draft', 'scheduled'])
    .select()
    .single();

  if (error) return { success: false, error: 'Campagne non trouvée ou statut incompatible' };

  // Fetch recipients: from segment if specified, otherwise all clients with email
  let recipients = [];
  if (data.segment_id) {
    const { data: segClients } = await supabase
      .from('clients')
      .select('email, nom, prenom')
      .eq('tenant_id', tenantId)
      .not('email', 'is', null);
    recipients = (segClients || []).filter(c => c.email);
  } else {
    const { data: allClients } = await supabase
      .from('clients')
      .select('email, nom, prenom')
      .eq('tenant_id', tenantId)
      .not('email', 'is', null);
    recipients = (allClients || []).filter(c => c.email);
  }

  if (recipients.length === 0) {
    await supabase.from('marketing_campaigns').update({
      status: 'completed', completed_at: new Date().toISOString(),
      stats_sent: 0, stats_delivered: 0, stats_opened: 0, stats_clicked: 0, stats_bounced: 0,
    }).eq('id', id);
    return { success: true, data: { ...data, stats_sent: 0, stats_delivered: 0, status: 'completed' } };
  }

  let sentCount = 0;
  let failedCount = 0;

  if (resendClient) {
    const results = await Promise.allSettled(
      recipients.map(async (r) => {
        const sendResult = await resendClient.emails.send({
          from: data.from_email || 'noreply@nexus-platform.com',
          to: r.email,
          subject: data.subject || data.name,
          html: data.html_content || data.content || `<p>${data.name}</p>`,
        });
        await supabase.from('campaign_sends').insert({
          campaign_id: id,
          tenant_id: tenantId,
          recipient_email: r.email,
          recipient_name: `${r.prenom || ''} ${r.nom || ''}`.trim(),
          status: 'sent',
          sent_at: new Date().toISOString(),
          message_id: sendResult.data?.id || null,
        }).catch(() => {});
        return sendResult;
      })
    );
    sentCount = results.filter(r => r.status === 'fulfilled').length;
    failedCount = results.filter(r => r.status === 'rejected').length;
  } else {
    console.warn('[MARKETING] RESEND_API_KEY manquante - envoi impossible');
    failedCount = recipients.length;
  }

  const finalStats = {
    status: 'completed',
    completed_at: new Date().toISOString(),
    stats_sent: sentCount,
    stats_delivered: sentCount,
    stats_opened: 0,
    stats_clicked: 0,
    stats_bounced: failedCount,
  };

  await supabase.from('marketing_campaigns').update(finalStats).eq('id', id);

  return { success: true, data: { ...data, ...finalStats, recipients_total: recipients.length } };
}

export async function pauseCampaign(tenantId, id) {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', 'running')
    .select()
    .single();

  if (error) return { success: false, error: 'Campagne non trouvée ou pas en cours' };
  return { success: true, data };
}

export async function getCampaignStats(tenantId, id) {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('stats_sent, stats_delivered, stats_opened, stats_clicked, stats_bounced, stats_unsubscribed')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (error) return { success: false, error: error.message };

  const sent = data.stats_sent || 0;
  const delivered = data.stats_delivered || 0;
  const opened = data.stats_opened || 0;
  const clicked = data.stats_clicked || 0;

  return {
    success: true,
    data: {
      ...data,
      delivery_rate: sent > 0 ? Math.round((delivered / sent) * 10000) / 100 : 0,
      open_rate: delivered > 0 ? Math.round((opened / delivered) * 10000) / 100 : 0,
      click_rate: opened > 0 ? Math.round((clicked / opened) * 10000) / 100 : 0
    }
  };
}

// ==================== SEGMENTS ====================

export async function getSegments(tenantId) {
  const { data, error } = await supabase
    .from('customer_segments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name');

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createSegment(tenantId, segmentData) {
  const { data, error } = await supabase
    .from('customer_segments')
    .insert({ tenant_id: tenantId, ...segmentData })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateSegment(tenantId, id, updates) {
  const { data, error } = await supabase
    .from('customer_segments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function deleteSegment(tenantId, id) {
  const { error } = await supabase.from('customer_segments').delete().eq('id', id).eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function refreshSegmentCount(tenantId, id) {
  // Fetch segment criteria
  const { data: segment, error: segError } = await supabase
    .from('customer_segments')
    .select('criteria')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (segError) return { success: false, error: 'Segment non trouvé' };

  // Count real clients matching criteria
  let query = supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const criteria = segment?.criteria || {};
  if (criteria.tags && criteria.tags.length > 0) {
    query = query.contains('tags', criteria.tags);
  }
  if (criteria.min_visits) {
    query = query.gte('visit_count', criteria.min_visits);
  }
  if (criteria.last_visit_after) {
    query = query.gte('last_visit_at', criteria.last_visit_after);
  }
  if (criteria.last_visit_before) {
    query = query.lte('last_visit_at', criteria.last_visit_before);
  }
  if (criteria.has_email === true) {
    query = query.not('email', 'is', null);
  }
  if (criteria.has_phone === true) {
    query = query.not('telephone', 'is', null);
  }

  const { count: realCount, error: countError } = await query;
  if (countError) {
    console.error('[MARKETING] Error counting segment:', countError.message);
    return { success: false, error: countError.message };
  }

  const count = realCount || 0;
  const { data, error } = await supabase
    .from('customer_segments')
    .update({ customer_count: count, last_refreshed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== CODES PROMO ====================

export async function getPromoCodes(tenantId, filters = {}) {
  let query = supabase
    .from('promo_codes')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
  if (filters.type) query = query.eq('type', filters.type);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createPromoCode(tenantId, promoData) {
  const { data, error } = await supabase
    .from('promo_codes')
    .insert({ tenant_id: tenantId, ...promoData })
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      return { success: false, error: 'Ce code promo existe déjà' };
    }
    return { success: false, error: error.message };
  }
  return { success: true, data };
}

export async function updatePromoCode(tenantId, id, updates) {
  const { data, error } = await supabase
    .from('promo_codes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function deletePromoCode(tenantId, id) {
  const { error } = await supabase.from('promo_codes').delete().eq('id', id).eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function validatePromoCode(tenantId, code, orderAmount = 0) {
  const { data: promo, error } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .single();

  if (error || !promo) return { success: false, error: 'Code promo invalide' };

  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from).getTime() > now.getTime() + 60000) return { success: false, error: 'Code promo pas encore actif' };
  if (promo.valid_until && new Date(promo.valid_until) < now) return { success: false, error: 'Code promo expiré' };
  if (promo.max_uses && promo.current_uses >= promo.max_uses) return { success: false, error: 'Code promo épuisé' };
  if (orderAmount > 0 && parseFloat(promo.min_order_amount) > 0 && orderAmount < parseFloat(promo.min_order_amount)) {
    return { success: false, error: `Montant minimum requis: ${promo.min_order_amount}€` };
  }

  let discount = 0;
  if (promo.type === 'percentage') {
    discount = Math.round(orderAmount * (parseFloat(promo.value) / 100) * 100) / 100;
  } else if (promo.type === 'fixed_amount') {
    discount = Math.min(parseFloat(promo.value), orderAmount);
  } else if (promo.type === 'free_shipping') {
    discount = 0; // shipping handled separately
  }

  return {
    success: true,
    data: {
      promo_code_id: promo.id,
      code: promo.code,
      type: promo.type,
      value: parseFloat(promo.value),
      discount,
      final_amount: Math.round((orderAmount - discount) * 100) / 100
    }
  };
}

export async function applyPromoCode(tenantId, code, { orderAmount, customerEmail, customerName }) {
  const validation = await validatePromoCode(tenantId, code, orderAmount);
  if (!validation.success) return validation;

  // Record usage
  await supabase.from('promo_code_uses').insert({
    tenant_id: tenantId,
    promo_code_id: validation.data.promo_code_id,
    customer_email: customerEmail,
    customer_name: customerName,
    order_amount: orderAmount,
    discount_amount: validation.data.discount
  });

  // Increment usage count
  const { data: currentPromo } = await supabase
    .from('promo_codes')
    .select('current_uses')
    .eq('id', validation.data.promo_code_id)
    .single();

  if (currentPromo) {
    await supabase
      .from('promo_codes')
      .update({ current_uses: (currentPromo.current_uses || 0) + 1 })
      .eq('id', validation.data.promo_code_id);
  }

  return { success: true, data: { ...validation.data, applied: true } };
}

export async function getPromoCodeStats(tenantId, id) {
  const { data: promo } = await supabase
    .from('promo_codes')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!promo) return { success: false, error: 'Code promo non trouvé' };

  const { data: uses } = await supabase
    .from('promo_code_uses')
    .select('*')
    .eq('promo_code_id', id)
    .order('used_at', { ascending: false });

  const totalDiscount = (uses || []).reduce((s, u) => s + parseFloat(u.discount_amount || 0), 0);
  const totalOrders = (uses || []).reduce((s, u) => s + parseFloat(u.order_amount || 0), 0);

  return {
    success: true,
    data: {
      ...promo,
      uses: uses || [],
      total_uses: uses?.length || 0,
      total_discount_given: Math.round(totalDiscount * 100) / 100,
      total_order_amount: Math.round(totalOrders * 100) / 100,
      remaining_uses: promo.max_uses ? promo.max_uses - (promo.current_uses || 0) : null
    }
  };
}

// ==================== PARRAINAGE ====================

export async function getReferrals(tenantId, filters = {}) {
  let query = supabase
    .from('referral_program')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createReferral(tenantId, referralData) {
  const code = `REF-${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await supabase
    .from('referral_program')
    .insert({
      tenant_id: tenantId,
      referral_code: code,
      ...referralData
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function completeReferral(tenantId, id, referredData) {
  const { data, error } = await supabase
    .from('referral_program')
    .update({
      status: 'completed',
      referred_name: referredData.name,
      referred_email: referredData.email,
      referred_phone: referredData.phone,
      completed_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) return { success: false, error: 'Parrainage non trouvé ou déjà complété' };
  return { success: true, data };
}

export async function rewardReferral(tenantId, id) {
  const { data, error } = await supabase
    .from('referral_program')
    .update({ status: 'rewarded', rewarded_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .select()
    .single();

  if (error) return { success: false, error: 'Parrainage non trouvé ou pas encore complété' };
  return { success: true, data };
}

export async function getReferralStats(tenantId) {
  const { data: referrals } = await supabase
    .from('referral_program')
    .select('status, referrer_reward_value, referred_reward_value')
    .eq('tenant_id', tenantId);

  const all = referrals || [];
  return {
    success: true,
    data: {
      total: all.length,
      pending: all.filter(r => r.status === 'pending').length,
      completed: all.filter(r => r.status === 'completed').length,
      rewarded: all.filter(r => r.status === 'rewarded').length,
      total_rewards_given: all.filter(r => r.status === 'rewarded').reduce((s, r) => s + parseFloat(r.referrer_reward_value || 0) + parseFloat(r.referred_reward_value || 0), 0)
    }
  };
}

// ==================== STATS GLOBALES ====================

export async function getMarketingOverview(tenantId) {
  const [campaigns, promos, referrals] = await Promise.all([
    supabase.from('marketing_campaigns').select('status, stats_sent, stats_opened, stats_clicked').eq('tenant_id', tenantId),
    supabase.from('promo_codes').select('current_uses, is_active').eq('tenant_id', tenantId),
    supabase.from('referral_program').select('status').eq('tenant_id', tenantId)
  ]);

  const allCampaigns = campaigns.data || [];
  const allPromos = promos.data || [];
  const allReferrals = referrals.data || [];

  const totalSent = allCampaigns.reduce((s, c) => s + (c.stats_sent || 0), 0);
  const totalOpened = allCampaigns.reduce((s, c) => s + (c.stats_opened || 0), 0);
  const totalClicked = allCampaigns.reduce((s, c) => s + (c.stats_clicked || 0), 0);

  return {
    success: true,
    data: {
      campaigns: {
        total: allCampaigns.length,
        active: allCampaigns.filter(c => c.status === 'running' || c.status === 'scheduled').length,
        completed: allCampaigns.filter(c => c.status === 'completed').length,
        total_sent: totalSent,
        avg_open_rate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 10000) / 100 : 0,
        avg_click_rate: totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 10000) / 100 : 0
      },
      promo_codes: {
        total: allPromos.length,
        active: allPromos.filter(p => p.is_active).length,
        total_uses: allPromos.reduce((s, p) => s + (p.current_uses || 0), 0)
      },
      referrals: {
        total: allReferrals.length,
        completed: allReferrals.filter(r => r.status === 'completed' || r.status === 'rewarded').length
      }
    }
  };
}

export async function getCampaignPerformance(tenantId, { from, to } = {}) {
  const year = new Date().getFullYear();
  let query = supabase
    .from('marketing_campaigns')
    .select('name, type, status, stats_sent, stats_delivered, stats_opened, stats_clicked, stats_bounced, completed_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  if (from) query = query.gte('completed_at', from);
  if (to) query = query.lte('completed_at', to);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const performance = (data || []).map(c => ({
    name: c.name,
    type: c.type,
    sent: c.stats_sent,
    delivered: c.stats_delivered,
    opened: c.stats_opened,
    clicked: c.stats_clicked,
    delivery_rate: c.stats_sent > 0 ? Math.round((c.stats_delivered / c.stats_sent) * 10000) / 100 : 0,
    open_rate: c.stats_delivered > 0 ? Math.round((c.stats_opened / c.stats_delivered) * 10000) / 100 : 0,
    click_rate: c.stats_opened > 0 ? Math.round((c.stats_clicked / c.stats_opened) * 10000) / 100 : 0
  }));

  return { success: true, data: performance };
}

export async function getPromoPerformance(tenantId) {
  const { data: promos } = await supabase
    .from('promo_codes')
    .select('id, code, type, value, current_uses, max_uses, is_active')
    .eq('tenant_id', tenantId)
    .order('current_uses', { ascending: false });

  const promoIds = (promos || []).map(p => p.id);

  let totalDiscount = 0;
  let totalOrders = 0;
  if (promoIds.length > 0) {
    const { data: uses } = await supabase
      .from('promo_code_uses')
      .select('discount_amount, order_amount')
      .in('promo_code_id', promoIds);

    (uses || []).forEach(u => {
      totalDiscount += parseFloat(u.discount_amount || 0);
      totalOrders += parseFloat(u.order_amount || 0);
    });
  }

  return {
    success: true,
    data: {
      codes: promos || [],
      total_discount_given: Math.round(totalDiscount * 100) / 100,
      total_order_amount: Math.round(totalOrders * 100) / 100,
      roi: totalDiscount > 0 ? Math.round((totalOrders / totalDiscount) * 100) / 100 : 0
    }
  };
}
