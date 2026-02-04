// Module Compta - accountingService.js (ESM)
import { supabase } from '../../config/supabase.js';

// ==================== CONFIG ====================

export async function getConfig(tenantId) {
  const { data, error } = await supabase
    .from('accounting_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  if (error && error.code === 'PGRST116') {
    // No config yet, return defaults
    return { success: true, data: { default_vat_rate: 20, invoice_prefix: 'FAC', invoice_next_number: 1, currency: 'EUR', payment_terms: 30, country: 'France' } };
  }
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateConfig(tenantId, config) {
  // Check if config exists
  const { data: existing } = await supabase
    .from('accounting_config')
    .select('id')
    .eq('tenant_id', tenantId)
    .single();

  let result;
  if (existing) {
    result = await supabase
      .from('accounting_config')
      .update({ ...config, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .select()
      .single();
  } else {
    result = await supabase
      .from('accounting_config')
      .insert({ ...config, tenant_id: tenantId })
      .select()
      .single();
  }

  if (result.error) return { success: false, error: result.error.message };
  return { success: true, data: result.data };
}

// ==================== CATEGORIES ====================

export async function getCategories(tenantId, { type } = {}) {
  let query = supabase
    .from('accounting_categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name');

  if (type) query = query.eq('type', type);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function createCategory(tenantId, category) {
  const { data, error } = await supabase
    .from('accounting_categories')
    .insert({ ...category, tenant_id: tenantId })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateCategory(tenantId, id, updates) {
  const { data, error } = await supabase
    .from('accounting_categories')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function deleteCategory(tenantId, id) {
  const { error } = await supabase
    .from('accounting_categories')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ==================== INVOICES ====================

async function getNextInvoiceNumber(tenantId) {
  const { data: config } = await supabase
    .from('accounting_config')
    .select('invoice_prefix, invoice_next_number')
    .eq('tenant_id', tenantId)
    .single();

  const prefix = config?.invoice_prefix || 'FAC';
  const nextNum = config?.invoice_next_number || 1;
  const year = new Date().getFullYear();
  const number = `${prefix}-${year}-${String(nextNum).padStart(3, '0')}`;

  // Increment
  if (config) {
    await supabase
      .from('accounting_config')
      .update({ invoice_next_number: nextNum + 1 })
      .eq('tenant_id', tenantId);
  } else {
    await supabase
      .from('accounting_config')
      .insert({ tenant_id: tenantId, invoice_next_number: 2 });
  }

  return number;
}

function computeInvoiceTotals(items) {
  let subtotal = 0;
  let vatAmount = 0;
  const computed = items.map((item, i) => {
    const qty = parseFloat(item.quantity) || 1;
    const price = parseFloat(item.unit_price) || 0;
    const vat = parseFloat(item.vat_rate) || 20;
    const totalHt = Math.round(qty * price * 100) / 100;
    const totalTtc = Math.round(totalHt * (1 + vat / 100) * 100) / 100;
    subtotal += totalHt;
    vatAmount += totalTtc - totalHt;
    return { ...item, quantity: qty, unit_price: price, vat_rate: vat, total_ht: totalHt, total_ttc: totalTtc, sort_order: i };
  });
  return { items: computed, subtotal: Math.round(subtotal * 100) / 100, vat_amount: Math.round(vatAmount * 100) / 100, total: Math.round((subtotal + vatAmount) * 100) / 100 };
}

export async function getInvoices(tenantId, { status, clientName, from, to, page = 1, limit = 20 } = {}) {
  let query = supabase
    .from('invoices')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (clientName) query = query.ilike('client_name', `%${clientName}%`);
  if (from) query = query.gte('issue_date', from);
  if (to) query = query.lte('issue_date', to);

  const offset = (parseInt(page) - 1) * parseInt(limit);
  query = query.range(offset, offset + parseInt(limit) - 1);

  const { data, error, count } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data, pagination: { page: parseInt(page), limit: parseInt(limit), total: count } };
}

export async function getInvoiceById(tenantId, id) {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (error) return { success: false, error: error.message };

  const { data: items } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', id)
    .order('sort_order');

  return { success: true, data: { ...invoice, items: items || [] } };
}

export async function createInvoice(tenantId, { client, items, notes, due_date, payment_method }) {
  const invoiceNumber = await getNextInvoiceNumber(tenantId);
  const totals = computeInvoiceTotals(items);

  // Get config for payment_terms
  const { data: config } = await supabase
    .from('accounting_config')
    .select('payment_terms')
    .eq('tenant_id', tenantId)
    .single();

  const paymentTerms = config?.payment_terms || 30;
  const issueDate = new Date();
  const dueDate = due_date || new Date(issueDate.getTime() + paymentTerms * 86400000).toISOString().split('T')[0];

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      tenant_id: tenantId,
      invoice_number: invoiceNumber,
      client_name: client.name,
      client_email: client.email,
      client_phone: client.phone,
      client_address: client.address,
      client_siret: client.siret,
      issue_date: issueDate.toISOString().split('T')[0],
      due_date: dueDate,
      subtotal: totals.subtotal,
      vat_amount: totals.vat_amount,
      total: totals.total,
      notes,
      payment_method
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Insert items
  const itemsToInsert = totals.items.map(item => ({
    invoice_id: invoice.id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    vat_rate: item.vat_rate,
    total_ht: item.total_ht,
    total_ttc: item.total_ttc,
    sort_order: item.sort_order
  }));

  await supabase.from('invoice_items').insert(itemsToInsert);

  return { success: true, data: { ...invoice, items: totals.items } };
}

export async function updateInvoice(tenantId, id, { client, items, notes, due_date, payment_method }) {
  // Only draft invoices can be edited
  const { data: existing } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!existing) return { success: false, error: 'Facture non trouvée' };
  if (existing.status !== 'draft') return { success: false, error: 'Seules les factures brouillon peuvent être modifiées' };

  const updates = { updated_at: new Date().toISOString() };
  if (client) {
    if (client.name) updates.client_name = client.name;
    if (client.email) updates.client_email = client.email;
    if (client.phone) updates.client_phone = client.phone;
    if (client.address) updates.client_address = client.address;
    if (client.siret) updates.client_siret = client.siret;
  }
  if (notes !== undefined) updates.notes = notes;
  if (due_date) updates.due_date = due_date;
  if (payment_method) updates.payment_method = payment_method;

  if (items) {
    const totals = computeInvoiceTotals(items);
    updates.subtotal = totals.subtotal;
    updates.vat_amount = totals.vat_amount;
    updates.total = totals.total;

    // Replace items
    await supabase.from('invoice_items').delete().eq('invoice_id', id);
    const itemsToInsert = totals.items.map(item => ({
      invoice_id: id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      vat_rate: item.vat_rate,
      total_ht: item.total_ht,
      total_ttc: item.total_ttc,
      sort_order: item.sort_order
    }));
    await supabase.from('invoice_items').insert(itemsToInsert);
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function deleteInvoice(tenantId, id) {
  const { data: existing } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (!existing) return { success: false, error: 'Facture non trouvée' };
  if (existing.status !== 'draft') return { success: false, error: 'Seules les factures brouillon peuvent être supprimées' };

  const { error } = await supabase.from('invoices').delete().eq('id', id).eq('tenant_id', tenantId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function sendInvoice(tenantId, id) {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('status', 'draft')
    .select()
    .single();

  if (error) return { success: false, error: 'Facture non trouvée ou déjà envoyée' };
  return { success: true, data };
}

export async function markInvoicePaid(tenantId, id, { payment_method, date } = {}) {
  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (fetchErr || !invoice) return { success: false, error: 'Facture non trouvée' };
  if (invoice.status === 'paid') return { success: false, error: 'Facture déjà payée' };
  if (invoice.status === 'cancelled') return { success: false, error: 'Facture annulée' };

  const paidAt = date || new Date().toISOString();
  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: paidAt,
      payment_method: payment_method || invoice.payment_method,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  // Auto-create revenue transaction
  await supabase.from('transactions').insert({
    tenant_id: tenantId,
    type: 'revenue',
    invoice_id: id,
    description: `Paiement facture ${invoice.invoice_number} - ${invoice.client_name}`,
    amount: parseFloat(invoice.total),
    vat_rate: invoice.subtotal > 0 ? Math.round((parseFloat(invoice.vat_amount) / parseFloat(invoice.subtotal)) * 10000) / 100 : 20,
    vat_amount: parseFloat(invoice.vat_amount),
    date: paidAt.split('T')[0],
    payment_method: payment_method || invoice.payment_method,
    reference: invoice.invoice_number
  });

  return { success: true, data };
}

export async function cancelInvoice(tenantId, id) {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .in('status', ['draft', 'sent'])
    .select()
    .single();

  if (error) return { success: false, error: 'Facture non trouvée ou statut incompatible' };
  return { success: true, data };
}

// ==================== TRANSACTIONS ====================

export async function getTransactions(tenantId, { type, categoryId, from, to, page = 1, limit = 20 } = {}) {
  let query = supabase
    .from('transactions')
    .select('*, category:accounting_categories(id, name, type, color)', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('date', { ascending: false });

  if (type) query = query.eq('type', type);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (from) query = query.gte('date', from);
  if (to) query = query.lte('date', to);

  const offset = (parseInt(page) - 1) * parseInt(limit);
  query = query.range(offset, offset + parseInt(limit) - 1);

  const { data, error, count } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data, pagination: { page: parseInt(page), limit: parseInt(limit), total: count } };
}

export async function createTransaction(tenantId, transaction) {
  const amount = parseFloat(transaction.amount);
  const vatRate = parseFloat(transaction.vat_rate) || 20;
  const amountHt = Math.round((amount / (1 + vatRate / 100)) * 100) / 100;
  const vatAmount = Math.round((amount - amountHt) * 100) / 100;

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      tenant_id: tenantId,
      type: transaction.type,
      category_id: transaction.category_id || null,
      description: transaction.description,
      amount,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      date: transaction.date || new Date().toISOString().split('T')[0],
      payment_method: transaction.payment_method,
      reference: transaction.reference,
      notes: transaction.notes
    })
    .select('*, category:accounting_categories(id, name, type, color)')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function updateTransaction(tenantId, id, updates) {
  if (updates.amount) {
    updates.amount = parseFloat(updates.amount);
    const vatRate = parseFloat(updates.vat_rate || 20);
    const amountHt = Math.round((updates.amount / (1 + vatRate / 100)) * 100) / 100;
    updates.vat_amount = Math.round((updates.amount - amountHt) * 100) / 100;
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('*, category:accounting_categories(id, name, type, color)')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function deleteTransaction(tenantId, id) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ==================== STATS ====================

export async function getOverview(tenantId, { from, to } = {}) {
  const year = new Date().getFullYear();
  const defaultFrom = from || `${year}-01-01`;
  const defaultTo = to || `${year}-12-31`;

  const { data: transactions } = await supabase
    .from('transactions')
    .select('type, amount, vat_amount')
    .eq('tenant_id', tenantId)
    .gte('date', defaultFrom)
    .lte('date', defaultTo);

  const { data: invoices } = await supabase
    .from('invoices')
    .select('status, total')
    .eq('tenant_id', tenantId)
    .gte('issue_date', defaultFrom)
    .lte('issue_date', defaultTo);

  let totalRevenue = 0, totalExpenses = 0, totalVatCollected = 0, totalVatPaid = 0;
  (transactions || []).forEach(t => {
    const amt = parseFloat(t.amount);
    const vat = parseFloat(t.vat_amount);
    if (t.type === 'revenue') { totalRevenue += amt; totalVatCollected += vat; }
    else { totalExpenses += amt; totalVatPaid += vat; }
  });

  const invoiceCounts = { draft: 0, sent: 0, paid: 0, cancelled: 0, overdue: 0 };
  let invoiceTotal = 0, invoicePaid = 0;
  (invoices || []).forEach(inv => {
    invoiceCounts[inv.status] = (invoiceCounts[inv.status] || 0) + 1;
    invoiceTotal += parseFloat(inv.total);
    if (inv.status === 'paid') invoicePaid += parseFloat(inv.total);
  });

  return {
    success: true,
    data: {
      period: { from: defaultFrom, to: defaultTo },
      revenue: Math.round(totalRevenue * 100) / 100,
      expenses: Math.round(totalExpenses * 100) / 100,
      profit: Math.round((totalRevenue - totalExpenses) * 100) / 100,
      vat: {
        collected: Math.round(totalVatCollected * 100) / 100,
        paid: Math.round(totalVatPaid * 100) / 100,
        balance: Math.round((totalVatCollected - totalVatPaid) * 100) / 100
      },
      invoices: invoiceCounts,
      invoiceTotal: Math.round(invoiceTotal * 100) / 100,
      invoicePaid: Math.round(invoicePaid * 100) / 100
    }
  };
}

export async function getRevenueStats(tenantId, { from, to, groupBy = 'month' } = {}) {
  const year = new Date().getFullYear();
  const defaultFrom = from || `${year}-01-01`;
  const defaultTo = to || `${year}-12-31`;

  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, date')
    .eq('tenant_id', tenantId)
    .eq('type', 'revenue')
    .gte('date', defaultFrom)
    .lte('date', defaultTo)
    .order('date');

  const grouped = {};
  (transactions || []).forEach(t => {
    const key = groupBy === 'day' ? t.date : groupBy === 'week'
      ? t.date.substring(0, 7) + '-W' + Math.ceil(parseInt(t.date.substring(8)) / 7)
      : t.date.substring(0, 7);
    grouped[key] = (grouped[key] || 0) + parseFloat(t.amount);
  });

  const result = Object.entries(grouped).map(([period, amount]) => ({ period, amount: Math.round(amount * 100) / 100 }));
  return { success: true, data: result };
}

export async function getExpensesByCategory(tenantId, { from, to } = {}) {
  const year = new Date().getFullYear();
  const defaultFrom = from || `${year}-01-01`;
  const defaultTo = to || `${year}-12-31`;

  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, category:accounting_categories(id, name, color)')
    .eq('tenant_id', tenantId)
    .eq('type', 'expense')
    .gte('date', defaultFrom)
    .lte('date', defaultTo);

  const grouped = {};
  (transactions || []).forEach(t => {
    const catName = t.category?.name || 'Non catégorisé';
    const catId = t.category?.id || 'none';
    const color = t.category?.color || '#999';
    if (!grouped[catId]) grouped[catId] = { category: catName, color, amount: 0 };
    grouped[catId].amount += parseFloat(t.amount);
  });

  const result = Object.values(grouped).map(g => ({ ...g, amount: Math.round(g.amount * 100) / 100 })).sort((a, b) => b.amount - a.amount);
  return { success: true, data: result };
}

export async function getCashflow(tenantId, { months = 6 } = {}) {
  const data = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const startDate = `${yearMonth}-01`;
    const endDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const endDate = `${yearMonth}-${endDay}`;

    const { data: txns } = await supabase
      .from('transactions')
      .select('type, amount')
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate);

    let revenue = 0, expenses = 0;
    (txns || []).forEach(t => {
      if (t.type === 'revenue') revenue += parseFloat(t.amount);
      else expenses += parseFloat(t.amount);
    });

    data.push({
      month: yearMonth,
      revenue: Math.round(revenue * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      net: Math.round((revenue - expenses) * 100) / 100
    });
  }
  return { success: true, data };
}

export async function getVatReport(tenantId, { from, to } = {}) {
  const year = new Date().getFullYear();
  const defaultFrom = from || `${year}-01-01`;
  const defaultTo = to || `${year}-12-31`;

  const { data: transactions } = await supabase
    .from('transactions')
    .select('type, amount, vat_rate, vat_amount, date')
    .eq('tenant_id', tenantId)
    .gte('date', defaultFrom)
    .lte('date', defaultTo)
    .order('date');

  let vatCollected = 0, vatDeductible = 0;
  const byRate = {};
  (transactions || []).forEach(t => {
    const vat = parseFloat(t.vat_amount);
    const rate = parseFloat(t.vat_rate);
    if (t.type === 'revenue') vatCollected += vat;
    else vatDeductible += vat;

    const rateKey = `${rate}%`;
    if (!byRate[rateKey]) byRate[rateKey] = { rate, collected: 0, deductible: 0 };
    if (t.type === 'revenue') byRate[rateKey].collected += vat;
    else byRate[rateKey].deductible += vat;
  });

  const byRateResult = Object.values(byRate).map(r => ({
    rate: r.rate,
    collected: Math.round(r.collected * 100) / 100,
    deductible: Math.round(r.deductible * 100) / 100,
    balance: Math.round((r.collected - r.deductible) * 100) / 100
  }));

  return {
    success: true,
    data: {
      period: { from: defaultFrom, to: defaultTo },
      vatCollected: Math.round(vatCollected * 100) / 100,
      vatDeductible: Math.round(vatDeductible * 100) / 100,
      vatDue: Math.round((vatCollected - vatDeductible) * 100) / 100,
      byRate: byRateResult
    }
  };
}

// ==================== EXPORTS ====================

export async function exportTransactionsCSV(tenantId, { from, to, type } = {}) {
  const year = new Date().getFullYear();
  const defaultFrom = from || `${year}-01-01`;
  const defaultTo = to || `${year}-12-31`;

  let query = supabase
    .from('transactions')
    .select('*, category:accounting_categories(name)')
    .eq('tenant_id', tenantId)
    .gte('date', defaultFrom)
    .lte('date', defaultTo)
    .order('date');

  if (type) query = query.eq('type', type);

  const { data: transactions, error } = await query;
  if (error) return { success: false, error: error.message };

  const headers = 'Date,Type,Catégorie,Description,Montant HT,TVA,Montant TTC,Méthode paiement,Référence\n';
  const rows = (transactions || []).map(t => {
    const amountHt = parseFloat(t.amount) - parseFloat(t.vat_amount);
    return [
      t.date,
      t.type === 'revenue' ? 'Recette' : 'Dépense',
      t.category?.name || '',
      `"${(t.description || '').replace(/"/g, '""')}"`,
      amountHt.toFixed(2),
      parseFloat(t.vat_amount).toFixed(2),
      parseFloat(t.amount).toFixed(2),
      t.payment_method || '',
      t.reference || ''
    ].join(',');
  }).join('\n');

  return { success: true, data: { csv: headers + rows, count: transactions.length, period: { from: defaultFrom, to: defaultTo } } };
}

export async function exportVatDeclaration(tenantId, { quarter, year } = {}) {
  const currentYear = year || new Date().getFullYear();
  const q = quarter || Math.ceil((new Date().getMonth() + 1) / 3);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = q * 3;
  const from = `${currentYear}-${String(startMonth).padStart(2, '0')}-01`;
  const endDay = new Date(currentYear, endMonth, 0).getDate();
  const to = `${currentYear}-${String(endMonth).padStart(2, '0')}-${endDay}`;

  const vatReport = await getVatReport(tenantId, { from, to });
  const config = await getConfig(tenantId);

  return {
    success: true,
    data: {
      company: config.data,
      quarter: `T${q} ${currentYear}`,
      period: { from, to },
      ...vatReport.data
    }
  };
}
