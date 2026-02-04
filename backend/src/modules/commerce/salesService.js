/**
 * Sales Service
 * Gestion des ventes et statistiques
 */

import { supabase } from '../../config/supabase.js';
import { sellProduct } from './stockService.js';

// ============ VENTES ============

export async function createSale(tenantId, saleData) {
  const {
    customerName,
    customerPhone,
    customerId,
    items,
    paymentMethod = 'cash',
    discount = 0,
    notes,
  } = saleData;

  if (!items || items.length === 0) {
    return { success: false, error: 'Au moins un article requis' };
  }

  try {
    let subtotal = 0;
    let taxAmount = 0;
    const processedItems = [];

    for (const item of items) {
      const lineTotal = item.quantity * item.unitPrice;
      const lineTax = (lineTotal * (item.taxRate || 20)) / 100;
      subtotal += lineTotal;
      taxAmount += lineTax;

      processedItems.push({
        product_id: item.productId,
        product_name: item.productName,
        product_sku: item.productSku || null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        tax_rate: item.taxRate || 20,
        discount_percent: item.discountPercent || 0,
        line_total: lineTotal,
      });
    }

    const discountAmount = discount;
    const total = subtotal + taxAmount - discountAmount;
    const saleNumber = `V-${Date.now()}`;

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        tenant_id: tenantId,
        sale_number: saleNumber,
        customer_id: customerId || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        subtotal,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total,
        payment_method: paymentMethod,
        payment_status: 'paid',
        sale_type: 'direct',
        notes: notes || null,
      })
      .select()
      .single();

    if (saleError) throw saleError;

    const itemsToInsert = processedItems.map((item) => ({
      tenant_id: tenantId,
      sale_id: sale.id,
      ...item,
    }));

    const { error: itemsError } = await supabase.from('sale_items').insert(itemsToInsert);
    if (itemsError) throw itemsError;

    // Décrémenter le stock
    for (const item of items) {
      if (item.productId) {
        await sellProduct(tenantId, item.productId, item.quantity, sale.id);
      }
    }

    return { success: true, data: { ...sale, items: processedItems } };
  } catch (err) {
    console.error('[SALES] Error creating sale:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getSaleById(tenantId, saleId) {
  try {
    const { data, error } = await supabase
      .from('sales')
      .select(`*, items:sale_items(*)`)
      .eq('id', saleId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[SALES] Error getting sale:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getSales(tenantId, options = {}) {
  try {
    const { startDate, endDate, limit = 50, offset = 0 } = options;

    let query = supabase
      .from('sales')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data, error, count } = await query;
    if (error) throw error;

    return { success: true, data, count };
  } catch (err) {
    console.error('[SALES] Error getting sales:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ STATISTIQUES ============

function getPeriodDates(period) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case 'today':
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
    case 'yesterday': {
      const y = new Date(today.getTime() - 86400000);
      return { start: y.toISOString(), end: today.toISOString() };
    }
    case 'week':
      return { start: new Date(today.getTime() - 7 * 86400000).toISOString(), end: now.toISOString() };
    case 'month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: now.toISOString() };
    case 'year':
      return { start: new Date(now.getFullYear(), 0, 1).toISOString(), end: now.toISOString() };
    default:
      return { start: null, end: null };
  }
}

export async function getSalesStats(tenantId, period = 'month') {
  try {
    const { start, end } = getPeriodDates(period);

    let query = supabase
      .from('sales')
      .select('total, subtotal, tax_amount, discount_amount, payment_method')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'paid');

    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', end);

    const { data, error } = await query;
    if (error) throw error;

    const stats = {
      period,
      totalSales: data.length,
      totalRevenue: 0,
      totalSubtotal: 0,
      totalTax: 0,
      totalDiscount: 0,
      averageOrderValue: 0,
      byPaymentMethod: {},
    };

    for (const sale of data) {
      stats.totalRevenue += parseFloat(sale.total) || 0;
      stats.totalSubtotal += parseFloat(sale.subtotal) || 0;
      stats.totalTax += parseFloat(sale.tax_amount) || 0;
      stats.totalDiscount += parseFloat(sale.discount_amount) || 0;

      const method = sale.payment_method || 'other';
      if (!stats.byPaymentMethod[method]) {
        stats.byPaymentMethod[method] = { count: 0, total: 0 };
      }
      stats.byPaymentMethod[method].count++;
      stats.byPaymentMethod[method].total += parseFloat(sale.total) || 0;
    }

    if (stats.totalSales > 0) {
      stats.averageOrderValue = stats.totalRevenue / stats.totalSales;
    }

    stats.totalRevenue = Math.round(stats.totalRevenue * 100) / 100;
    stats.totalSubtotal = Math.round(stats.totalSubtotal * 100) / 100;
    stats.totalTax = Math.round(stats.totalTax * 100) / 100;
    stats.totalDiscount = Math.round(stats.totalDiscount * 100) / 100;
    stats.averageOrderValue = Math.round(stats.averageOrderValue * 100) / 100;

    return { success: true, data: stats };
  } catch (err) {
    console.error('[SALES] Error getting stats:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getTopProducts(tenantId, period = 'month', limit = 10) {
  try {
    const { start, end } = getPeriodDates(period);

    let salesQuery = supabase
      .from('sales')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'paid');

    if (start) salesQuery = salesQuery.gte('created_at', start);
    if (end) salesQuery = salesQuery.lte('created_at', end);

    const { data: sales, error: salesError } = await salesQuery;
    if (salesError) throw salesError;

    if (sales.length === 0) return { success: true, data: [] };

    const saleIds = sales.map((s) => s.id);

    const { data: items, error: itemsError } = await supabase
      .from('sale_items')
      .select('product_id, product_name, quantity, line_total')
      .eq('tenant_id', tenantId)
      .in('sale_id', saleIds);

    if (itemsError) throw itemsError;

    const productStats = {};
    for (const item of items) {
      const key = item.product_id || item.product_name;
      if (!productStats[key]) {
        productStats[key] = { productId: item.product_id, productName: item.product_name, totalQuantity: 0, totalRevenue: 0 };
      }
      productStats[key].totalQuantity += item.quantity;
      productStats[key].totalRevenue += parseFloat(item.line_total) || 0;
    }

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, limit)
      .map((p) => ({ ...p, totalRevenue: Math.round(p.totalRevenue * 100) / 100 }));

    return { success: true, data: topProducts };
  } catch (err) {
    console.error('[SALES] Error getting top products:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getDailyRevenue(tenantId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('sales')
      .select('total, created_at')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'paid')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw error;

    const dailyData = {};
    for (const sale of data) {
      const day = sale.created_at.split('T')[0];
      if (!dailyData[day]) dailyData[day] = { date: day, revenue: 0, count: 0 };
      dailyData[day].revenue += parseFloat(sale.total) || 0;
      dailyData[day].count++;
    }

    const result = [];
    const current = new Date(startDate);
    const today = new Date();
    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];
      result.push(dailyData[dateStr] || { date: dateStr, revenue: 0, count: 0 });
      current.setDate(current.getDate() + 1);
    }

    return {
      success: true,
      data: result.map((d) => ({ ...d, revenue: Math.round(d.revenue * 100) / 100 })),
    };
  } catch (err) {
    console.error('[SALES] Error getting daily revenue:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getComparison(tenantId, period = 'month') {
  try {
    const current = await getSalesStats(tenantId, period);
    if (!current.success) throw new Error(current.error);

    const { start: currentStart } = getPeriodDates(period);
    const currentStartDate = new Date(currentStart);

    let previousStart, previousEnd;
    switch (period) {
      case 'today':
        previousStart = new Date(currentStartDate.getTime() - 86400000);
        previousEnd = currentStartDate;
        break;
      case 'week':
        previousStart = new Date(currentStartDate.getTime() - 7 * 86400000);
        previousEnd = currentStartDate;
        break;
      case 'month':
        previousStart = new Date(currentStartDate.getFullYear(), currentStartDate.getMonth() - 1, 1);
        previousEnd = currentStartDate;
        break;
      default:
        previousStart = currentStartDate;
        previousEnd = currentStartDate;
    }

    const { data: previousData, error } = await supabase
      .from('sales')
      .select('total')
      .eq('tenant_id', tenantId)
      .eq('payment_status', 'paid')
      .gte('created_at', previousStart.toISOString())
      .lt('created_at', previousEnd.toISOString());

    if (error) throw error;

    const previousRevenue = previousData.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    const previousSales = previousData.length;

    const revenueChange = previousRevenue > 0
      ? ((current.data.totalRevenue - previousRevenue) / previousRevenue) * 100
      : current.data.totalRevenue > 0 ? 100 : 0;

    const salesChange = previousSales > 0
      ? ((current.data.totalSales - previousSales) / previousSales) * 100
      : current.data.totalSales > 0 ? 100 : 0;

    return {
      success: true,
      data: {
        current: current.data,
        previous: { totalRevenue: Math.round(previousRevenue * 100) / 100, totalSales: previousSales },
        change: { revenue: Math.round(revenueChange * 10) / 10, sales: Math.round(salesChange * 10) / 10 },
      },
    };
  } catch (err) {
    console.error('[SALES] Error getting comparison:', err.message);
    return { success: false, error: err.message };
  }
}
