/**
 * Order Service
 * Gestion des commandes en ligne
 */

import { supabase } from '../../config/supabase.js';
import { sellProduct } from './stockService.js';
import { validateSlot } from './pickupService.js';
import { calculateDeliveryFee, createDeliveryTracking } from './deliveryService.js';

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const ORDER_TYPES = {
  ONLINE: 'online',
  CLICK_COLLECT: 'click_collect',
  DELIVERY: 'delivery',
};

function generateOrderNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CMD-${dateStr}-${random}`;
}

// Helper: modifier reserved_quantity (pas de supabase.raw)
async function updateReservedQuantity(tenantId, productId, delta) {
  const { data } = await supabase
    .from('product_stock')
    .select('reserved_quantity')
    .eq('tenant_id', tenantId)
    .eq('product_id', productId)
    .single();

  const current = data?.reserved_quantity || 0;
  const newVal = Math.max(0, current + delta);

  await supabase
    .from('product_stock')
    .update({ reserved_quantity: newVal })
    .eq('tenant_id', tenantId)
    .eq('product_id', productId);
}

// ============ CRÉATION COMMANDE (CLIENT) ============

export async function createOrder(tenantId, orderData) {
  const {
    customerName, customerEmail, customerPhone,
    orderType = ORDER_TYPES.CLICK_COLLECT,
    items, deliveryAddress, deliveryCity, deliveryPostalCode,
    deliveryFee = 0, pickupDate, pickupTime, customerNotes, paymentMethod,
  } = orderData;

  if (!customerName || !customerPhone) {
    return { success: false, error: 'Nom et téléphone requis' };
  }
  if (!items || items.length === 0) {
    return { success: false, error: 'Panier vide' };
  }
  if (orderType === ORDER_TYPES.DELIVERY && (!deliveryAddress || !deliveryCity || !deliveryPostalCode)) {
    return { success: false, error: 'Adresse de livraison complète requise' };
  }

  // Validation créneau Click & Collect
  if (orderType === ORDER_TYPES.CLICK_COLLECT) {
    if (!pickupDate || !pickupTime) {
      return { success: false, error: 'Date et heure de retrait requises pour Click & Collect' };
    }
    const slotValidation = await validateSlot(tenantId, pickupDate, pickupTime);
    if (!slotValidation.valid) {
      return { success: false, error: slotValidation.error };
    }
  }

  try {
    let subtotal = 0;
    let taxAmount = 0;
    const processedItems = [];

    for (const item of items) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select(`
          id, name, sku, price, tax_rate, is_active,
          stock:product_stock(quantity, reserved_quantity)
        `)
        .eq('id', item.productId)
        .eq('tenant_id', tenantId)
        .single();

      if (productError || !product) {
        return { success: false, error: `Produit non trouvé: ${item.productId}` };
      }
      if (!product.is_active) {
        return { success: false, error: `Produit indisponible: ${product.name}` };
      }

      const stockData = product.stock?.[0] || { quantity: 0, reserved_quantity: 0 };
      const availableStock = stockData.quantity - stockData.reserved_quantity;

      if (item.quantity > availableStock) {
        return { success: false, error: `Stock insuffisant pour ${product.name}. Disponible: ${availableStock}` };
      }

      const lineTotal = item.quantity * product.price;
      const lineTax = (lineTotal * (product.tax_rate || 20)) / 100;
      subtotal += lineTotal;
      taxAmount += lineTax;

      processedItems.push({
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        quantity: item.quantity,
        unit_price: product.price,
        tax_rate: product.tax_rate || 20,
        line_total: lineTotal,
      });
    }

    // Calculer frais de livraison si delivery
    let actualDeliveryFee = deliveryFee;
    if (orderType === ORDER_TYPES.DELIVERY && deliveryPostalCode) {
      const feeResult = await calculateDeliveryFee(tenantId, deliveryPostalCode, subtotal);
      if (!feeResult.success) {
        return { success: false, error: feeResult.error };
      }
      actualDeliveryFee = feeResult.data.deliveryFee;
    }

    const total = subtotal + taxAmount + actualDeliveryFee;
    const orderNumber = generateOrderNumber();

    const { data: order, error: orderError } = await supabase
      .from('commerce_orders')
      .insert({
        tenant_id: tenantId,
        order_number: orderNumber,
        customer_name: customerName,
        customer_email: customerEmail || null,
        customer_phone: customerPhone,
        order_type: orderType,
        status: ORDER_STATUS.PENDING,
        subtotal,
        tax_amount: taxAmount,
        delivery_fee: actualDeliveryFee,
        total,
        payment_method: paymentMethod || null,
        payment_status: 'pending',
        delivery_address: deliveryAddress || null,
        delivery_city: deliveryCity || null,
        delivery_postal_code: deliveryPostalCode || null,
        pickup_date: pickupDate || null,
        pickup_time: pickupTime || null,
        customer_notes: customerNotes || null,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const itemsToInsert = processedItems.map((item) => ({
      tenant_id: tenantId,
      order_id: order.id,
      ...item,
    }));

    const { error: itemsError } = await supabase.from('commerce_order_items').insert(itemsToInsert);
    if (itemsError) throw itemsError;

    // Réserver le stock
    for (const item of processedItems) {
      await updateReservedQuantity(tenantId, item.product_id, item.quantity);
    }

    // Créer le tracking livraison si delivery
    if (orderType === ORDER_TYPES.DELIVERY) {
      await createDeliveryTracking(tenantId, order.id);
    }

    return { success: true, data: { ...order, items: processedItems } };
  } catch (err) {
    console.error('[ORDERS] Error creating order:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ GESTION COMMANDES ============

export async function getOrderById(tenantId, orderId) {
  try {
    const { data, error } = await supabase
      .from('commerce_orders')
      .select(`*, items:commerce_order_items(*)`)
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[ORDERS] Error getting order:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getOrderByNumber(tenantId, orderNumber) {
  try {
    const { data, error } = await supabase
      .from('commerce_orders')
      .select(`
        id, order_number, status, order_type, total,
        pickup_date, pickup_time, created_at,
        items:commerce_order_items(product_name, quantity, unit_price, line_total)
      `)
      .eq('order_number', orderNumber)
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[ORDERS] Error getting order by number:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getOrders(tenantId, options = {}) {
  try {
    const { status, orderType, startDate, endDate, limit = 50, offset = 0 } = options;

    let query = supabase
      .from('commerce_orders')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (orderType) query = query.eq('order_type', orderType);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data, error, count } = await query;
    if (error) throw error;

    return { success: true, data, count };
  } catch (err) {
    console.error('[ORDERS] Error getting orders:', err.message);
    return { success: false, error: err.message };
  }
}

export async function updateOrderStatus(tenantId, orderId, newStatus, adminNotes = null) {
  try {
    const { data: order, error: fetchError } = await supabase
      .from('commerce_orders')
      .select('*, items:commerce_order_items(*)')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !order) {
      return { success: false, error: 'Commande non trouvée' };
    }

    const validTransitions = {
      [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.READY]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED],
      [ORDER_STATUS.COMPLETED]: [],
      [ORDER_STATUS.CANCELLED]: [],
    };

    if (!validTransitions[order.status]?.includes(newStatus)) {
      return { success: false, error: `Transition invalide: ${order.status} → ${newStatus}` };
    }

    const updates = { status: newStatus, updated_at: new Date().toISOString() };
    if (adminNotes) updates.admin_notes = adminNotes;

    if (newStatus === ORDER_STATUS.CONFIRMED) updates.confirmed_at = new Date().toISOString();
    else if (newStatus === ORDER_STATUS.READY) updates.ready_at = new Date().toISOString();
    else if (newStatus === ORDER_STATUS.COMPLETED) {
      updates.completed_at = new Date().toISOString();
      updates.payment_status = 'paid';
    } else if (newStatus === ORDER_STATUS.CANCELLED) {
      updates.cancelled_at = new Date().toISOString();
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('commerce_orders')
      .update(updates)
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Actions post-transition
    if (newStatus === ORDER_STATUS.COMPLETED) {
      for (const item of order.items) {
        await sellProduct(tenantId, item.product_id, item.quantity, orderId);
        await updateReservedQuantity(tenantId, item.product_id, -item.quantity);
      }
    } else if (newStatus === ORDER_STATUS.CANCELLED) {
      for (const item of order.items) {
        await updateReservedQuantity(tenantId, item.product_id, -item.quantity);
      }
    }

    return { success: true, data: updatedOrder };
  } catch (err) {
    console.error('[ORDERS] Error updating status:', err.message);
    return { success: false, error: err.message };
  }
}

export async function cancelOrder(tenantId, orderId, reason) {
  const result = await updateOrderStatus(tenantId, orderId, ORDER_STATUS.CANCELLED);

  if (result.success && reason) {
    await supabase
      .from('commerce_orders')
      .update({ cancellation_reason: reason })
      .eq('id', orderId);
  }

  return result;
}

export async function getOrderStats(tenantId) {
  try {
    const { data, error } = await supabase
      .from('commerce_orders')
      .select('status')
      .eq('tenant_id', tenantId);

    if (error) throw error;

    const stats = { total: data.length, byStatus: {} };
    for (const order of data) {
      stats.byStatus[order.status] = (stats.byStatus[order.status] || 0) + 1;
    }

    return { success: true, data: stats };
  } catch (err) {
    console.error('[ORDERS] Error getting stats:', err.message);
    return { success: false, error: err.message };
  }
}
