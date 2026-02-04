// Module Commercial (CRM) - crmService.js (ESM)
import { supabase } from '../../config/supabase.js';
import { getConfig, updateConfig, createInvoice } from '../accounting/accountingService.js';

// ==================== CONTACTS ====================

export async function getContacts(tenantId, filters = {}) {
  let query = supabase
    .from('crm_contacts')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.search) {
    query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company.ilike.%${filters.search}%`);
  }
  if (filters.tags && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags);
  }

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getContactById(tenantId, contactId) {
  const { data: contact, error } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('id', contactId)
    .eq('tenant_id', tenantId)
    .single();

  if (error) return { success: false, error: error.message };

  const { data: interactions } = await supabase
    .from('contact_interactions')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });

  const { data: quotes } = await supabase
    .from('quotes')
    .select('*')
    .eq('contact_id', contactId)
    .order('issue_date', { ascending: false });

  return { success: true, data: { ...contact, interactions: interactions || [], quotes: quotes || [] } };
}

export async function createContact(tenantId, contactData) {
  const { data, error } = await supabase
    .from('crm_contacts')
    .insert({ tenant_id: tenantId, ...contactData })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateContact(tenantId, contactId, contactData) {
  const { data, error } = await supabase
    .from('crm_contacts')
    .update({ ...contactData, updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function deleteContact(tenantId, contactId) {
  const { error } = await supabase
    .from('crm_contacts')
    .delete()
    .eq('id', contactId)
    .eq('tenant_id', tenantId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function convertToClient(tenantId, contactId) {
  const { data, error } = await supabase
    .from('crm_contacts')
    .update({ status: 'client', converted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function markAsLost(tenantId, contactId, reason) {
  const { data, error } = await supabase
    .from('crm_contacts')
    .update({ status: 'lost', lost_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== DEVIS ====================

async function getNextQuoteNumber(tenantId) {
  const configResult = await getConfig(tenantId);
  const config = configResult.data || {};
  const prefix = config.quote_prefix || 'DEV';
  const nextNum = config.next_quote_number || 1;
  const year = new Date().getFullYear();
  const number = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`;

  await updateConfig(tenantId, { next_quote_number: nextNum + 1 });
  return number;
}

export async function getQuotes(tenantId, filters = {}) {
  let query = supabase
    .from('quotes')
    .select('*, crm_contacts(first_name, last_name, email)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.contact_id) query = query.eq('contact_id', filters.contact_id);
  if (filters.start_date) query = query.gte('issue_date', filters.start_date);
  if (filters.end_date) query = query.lte('issue_date', filters.end_date);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getQuoteById(tenantId, quoteId) {
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*, crm_contacts(first_name, last_name, email, phone, company)')
    .eq('id', quoteId)
    .eq('tenant_id', tenantId)
    .single();

  if (error) return { success: false, error: error.message };

  const { data: items } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', quoteId)
    .order('sort_order');

  return { success: true, data: { ...quote, quote_items: items || [] } };
}

export async function createQuote(tenantId, quoteData) {
  const quoteNumber = await getNextQuoteNumber(tenantId);

  const items = quoteData.items || [];
  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_price)), 0);
  const taxRate = parseFloat(quoteData.tax_rate) || 20;
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  const issueDate = quoteData.issue_date || new Date().toISOString().split('T')[0];
  const validUntil = quoteData.valid_until || (() => {
    const d = new Date(issueDate);
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  })();

  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      tenant_id: tenantId,
      quote_number: quoteNumber,
      contact_id: quoteData.contact_id || null,
      status: 'draft',
      issue_date: issueDate,
      valid_until: validUntil,
      subtotal: Math.round(subtotal * 100) / 100,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      notes: quoteData.notes,
      terms: quoteData.terms
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  if (items.length > 0) {
    const itemsToInsert = items.map((item, i) => ({
      quote_id: quote.id,
      description: item.description,
      quantity: parseFloat(item.quantity),
      unit_price: parseFloat(item.unit_price),
      total: Math.round(parseFloat(item.quantity) * parseFloat(item.unit_price) * 100) / 100,
      sort_order: i
    }));
    await supabase.from('quote_items').insert(itemsToInsert);
  }

  // Return with items
  const result = await getQuoteById(tenantId, quote.id);
  return result;
}

export async function updateQuote(tenantId, quoteId, quoteData) {
  const existing = await getQuoteById(tenantId, quoteId);
  if (!existing.success) return existing;
  if (existing.data.status === 'accepted' || existing.data.status === 'rejected') {
    return { success: false, error: 'Impossible de modifier un devis accepté ou rejeté' };
  }

  const updates = { updated_at: new Date().toISOString() };
  if (quoteData.notes !== undefined) updates.notes = quoteData.notes;
  if (quoteData.terms !== undefined) updates.terms = quoteData.terms;
  if (quoteData.valid_until) updates.valid_until = quoteData.valid_until;
  if (quoteData.contact_id) updates.contact_id = quoteData.contact_id;

  if (quoteData.items) {
    const items = quoteData.items;
    const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.unit_price)), 0);
    const taxRate = parseFloat(quoteData.tax_rate) || parseFloat(existing.data.tax_rate) || 20;
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    updates.subtotal = Math.round(subtotal * 100) / 100;
    updates.tax_rate = taxRate;
    updates.tax_amount = taxAmount;
    updates.total = Math.round((subtotal + taxAmount) * 100) / 100;

    await supabase.from('quote_items').delete().eq('quote_id', quoteId);
    const itemsToInsert = items.map((item, i) => ({
      quote_id: quoteId,
      description: item.description,
      quantity: parseFloat(item.quantity),
      unit_price: parseFloat(item.unit_price),
      total: Math.round(parseFloat(item.quantity) * parseFloat(item.unit_price) * 100) / 100,
      sort_order: i
    }));
    await supabase.from('quote_items').insert(itemsToInsert);
  }

  const { error } = await supabase
    .from('quotes')
    .update(updates)
    .eq('id', quoteId)
    .eq('tenant_id', tenantId);

  if (error) return { success: false, error: error.message };
  return getQuoteById(tenantId, quoteId);
}

export async function deleteQuote(tenantId, quoteId) {
  const existing = await getQuoteById(tenantId, quoteId);
  if (!existing.success) return existing;
  if (existing.data.status !== 'draft') {
    return { success: false, error: 'Seuls les devis brouillon peuvent être supprimés' };
  }

  const { error } = await supabase.from('quotes').delete().eq('id', quoteId).eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function sendQuote(tenantId, quoteId) {
  const { data, error } = await supabase
    .from('quotes')
    .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', quoteId)
    .eq('tenant_id', tenantId)
    .eq('status', 'draft')
    .select()
    .single();

  if (error) return { success: false, error: 'Devis non trouvé ou déjà envoyé' };

  // Auto-create follow-up J+7
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + 7);
  await createFollowUp(tenantId, {
    quote_id: quoteId,
    contact_id: data.contact_id,
    type: 'quote_reminder',
    scheduled_date: followUpDate.toISOString().split('T')[0],
    message: `Relance automatique pour le devis ${data.quote_number}`
  });

  return { success: true, data };
}

export async function acceptQuote(tenantId, quoteId) {
  const { data, error } = await supabase
    .from('quotes')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', quoteId)
    .eq('tenant_id', tenantId)
    .in('status', ['sent', 'draft'])
    .select()
    .single();

  if (error) return { success: false, error: 'Devis non trouvé ou statut incompatible' };

  // Auto-convert contact to client
  if (data.contact_id) {
    const { data: contact } = await supabase
      .from('crm_contacts')
      .select('status')
      .eq('id', data.contact_id)
      .single();

    if (contact && (contact.status === 'lead' || contact.status === 'prospect')) {
      await convertToClient(tenantId, data.contact_id);
    }
  }

  return { success: true, data };
}

export async function rejectQuote(tenantId, quoteId, reason) {
  const { data, error } = await supabase
    .from('quotes')
    .update({ status: 'rejected', rejected_at: new Date().toISOString(), rejection_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', quoteId)
    .eq('tenant_id', tenantId)
    .in('status', ['sent', 'draft'])
    .select()
    .single();

  if (error) return { success: false, error: 'Devis non trouvé ou statut incompatible' };
  return { success: true, data };
}

export async function convertQuoteToInvoice(tenantId, quoteId) {
  const quoteResult = await getQuoteById(tenantId, quoteId);
  if (!quoteResult.success) return quoteResult;
  const quote = quoteResult.data;

  if (quote.status !== 'accepted') {
    return { success: false, error: 'Seuls les devis acceptés peuvent être convertis en facture' };
  }
  if (quote.invoice_id) {
    return { success: false, error: 'Ce devis a déjà été converti en facture' };
  }

  const contact = quote.crm_contacts || {};
  const clientName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Client';

  const invoiceResult = await createInvoice(tenantId, {
    client: {
      name: clientName,
      email: contact.email,
      phone: contact.phone,
      address: contact.company || ''
    },
    items: (quote.quote_items || []).map(item => ({
      description: item.description,
      quantity: parseFloat(item.quantity),
      unit_price: parseFloat(item.unit_price),
      vat_rate: parseFloat(quote.tax_rate) || 20
    })),
    notes: `Converti du devis ${quote.quote_number}`
  });

  if (!invoiceResult.success) return invoiceResult;

  await supabase
    .from('quotes')
    .update({ invoice_id: invoiceResult.data.id, updated_at: new Date().toISOString() })
    .eq('id', quoteId);

  return { success: true, data: invoiceResult.data };
}

// ==================== RELANCES ====================

export async function getFollowUps(tenantId, filters = {}) {
  let query = supabase
    .from('follow_ups')
    .select('*, crm_contacts(first_name, last_name, email), quotes(quote_number)')
    .eq('tenant_id', tenantId)
    .order('scheduled_date', { ascending: true });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.contact_id) query = query.eq('contact_id', filters.contact_id);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createFollowUp(tenantId, followUpData) {
  const { data, error } = await supabase
    .from('follow_ups')
    .insert({ tenant_id: tenantId, ...followUpData })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function completeFollowUp(tenantId, followUpId) {
  const { data, error } = await supabase
    .from('follow_ups')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', followUpId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function cancelFollowUp(tenantId, followUpId) {
  const { data, error } = await supabase
    .from('follow_ups')
    .update({ status: 'cancelled' })
    .eq('id', followUpId)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== INTERACTIONS ====================

export async function getContactInteractions(tenantId, contactId) {
  const { data, error } = await supabase
    .from('contact_interactions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function addInteraction(tenantId, contactId, interactionData) {
  const { data, error } = await supabase
    .from('contact_interactions')
    .insert({ tenant_id: tenantId, contact_id: contactId, ...interactionData })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

// ==================== STATS ====================

export async function getCRMStats(tenantId) {
  const { data: contacts } = await supabase
    .from('crm_contacts')
    .select('status')
    .eq('tenant_id', tenantId);

  const all = contacts || [];
  const stats = {
    total: all.length,
    leads: all.filter(c => c.status === 'lead').length,
    prospects: all.filter(c => c.status === 'prospect').length,
    clients: all.filter(c => c.status === 'client').length,
    lost: all.filter(c => c.status === 'lost').length
  };
  stats.conversion_rate = stats.total > 0 ? Math.round((stats.clients / stats.total) * 10000) / 100 : 0;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const { data: newContacts } = await supabase
    .from('crm_contacts')
    .select('id')
    .eq('tenant_id', tenantId)
    .gte('created_at', startOfMonth.toISOString());

  stats.new_this_month = newContacts?.length || 0;

  return { success: true, data: stats };
}

export async function getQuoteStats(tenantId) {
  const { data: quotes } = await supabase
    .from('quotes')
    .select('status, total')
    .eq('tenant_id', tenantId);

  const all = quotes || [];
  const stats = {
    total: all.length,
    draft: all.filter(q => q.status === 'draft').length,
    sent: all.filter(q => q.status === 'sent').length,
    accepted: all.filter(q => q.status === 'accepted').length,
    rejected: all.filter(q => q.status === 'rejected').length,
    expired: all.filter(q => q.status === 'expired').length
  };

  const decided = stats.accepted + stats.rejected;
  stats.acceptance_rate = decided > 0 ? Math.round((stats.accepted / decided) * 10000) / 100 : 0;
  stats.potential_revenue = Math.round(all.filter(q => q.status === 'sent').reduce((s, q) => s + parseFloat(q.total), 0) * 100) / 100;
  stats.realized_revenue = Math.round(all.filter(q => q.status === 'accepted').reduce((s, q) => s + parseFloat(q.total), 0) * 100) / 100;

  return { success: true, data: stats };
}

export async function getPipelineStats(tenantId) {
  const result = await getCRMStats(tenantId);
  const s = result.data;
  return {
    success: true,
    data: {
      stages: [
        { name: 'Leads', count: s.leads, color: '#3B82F6' },
        { name: 'Prospects', count: s.prospects, color: '#8B5CF6' },
        { name: 'Clients', count: s.clients, color: '#10B981' },
        { name: 'Perdus', count: s.lost, color: '#EF4444' }
      ]
    }
  };
}

export async function getConversionFunnel(tenantId) {
  const result = await getCRMStats(tenantId);
  const s = result.data;
  return {
    success: true,
    data: {
      funnel: [
        { stage: 'Leads', count: s.leads, percentage: 100 },
        { stage: 'Prospects', count: s.prospects, percentage: s.leads > 0 ? Math.round((s.prospects / s.leads) * 10000) / 100 : 0 },
        { stage: 'Clients', count: s.clients, percentage: s.leads > 0 ? Math.round((s.clients / s.leads) * 10000) / 100 : 0 }
      ],
      conversion_rate: s.conversion_rate
    }
  };
}
