/**
 * Delivery Service
 * Gestion des livraisons
 */

import { supabase } from '../../config/supabase.js';

export const DELIVERY_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  FAILED: 'failed',
};

// ============ ZONES DE LIVRAISON ============

export async function getDeliveryZones(tenantId, includeInactive = false) {
  try {
    let query = supabase
      .from('delivery_zones')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order')
      .order('name');

    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[DELIVERY] Error getting zones:', err.message);
    return { success: false, error: err.message };
  }
}

export async function saveDeliveryZone(tenantId, zoneData) {
  const {
    id, name, postalCodes, deliveryFee, minOrderAmount = 0,
    freeDeliveryThreshold, estimatedTime, isActive = true, sortOrder = 0,
  } = zoneData;

  try {
    const row = {
      tenant_id: tenantId,
      name,
      postal_codes: postalCodes,
      delivery_fee: deliveryFee,
      min_order_amount: minOrderAmount,
      free_delivery_threshold: freeDeliveryThreshold || null,
      estimated_time: estimatedTime || null,
      is_active: isActive,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (id) {
      const { data, error } = await supabase
        .from('delivery_zones')
        .update(row)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('delivery_zones')
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    return { success: true, data: result };
  } catch (err) {
    console.error('[DELIVERY] Error saving zone:', err.message);
    return { success: false, error: err.message };
  }
}

export async function deleteDeliveryZone(tenantId, zoneId) {
  try {
    const { error } = await supabase
      .from('delivery_zones')
      .delete()
      .eq('id', zoneId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[DELIVERY] Error deleting zone:', err.message);
    return { success: false, error: err.message };
  }
}

export async function findZoneByPostalCode(tenantId, postalCode) {
  try {
    const { data: zones, error } = await supabase
      .from('delivery_zones')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order');

    if (error) throw error;

    for (const zone of zones) {
      if (zone.postal_codes && zone.postal_codes.includes(postalCode)) {
        return { success: true, data: zone };
      }
    }

    return { success: false, error: 'Zone non couverte', notCovered: true };
  } catch (err) {
    console.error('[DELIVERY] Error finding zone:', err.message);
    return { success: false, error: err.message };
  }
}

export async function calculateDeliveryFee(tenantId, postalCode, orderAmount) {
  try {
    const zoneResult = await findZoneByPostalCode(tenantId, postalCode);

    if (!zoneResult.success) {
      return {
        success: false,
        error: zoneResult.notCovered ? 'Livraison non disponible dans votre zone' : zoneResult.error,
        notCovered: zoneResult.notCovered,
      };
    }

    const zone = zoneResult.data;

    if (orderAmount < zone.min_order_amount) {
      return {
        success: false,
        error: `Commande minimum de ${zone.min_order_amount}€ pour la livraison`,
        minOrderRequired: zone.min_order_amount,
      };
    }

    let fee = parseFloat(zone.delivery_fee);
    if (zone.free_delivery_threshold && orderAmount >= parseFloat(zone.free_delivery_threshold)) {
      fee = 0;
    }

    return {
      success: true,
      data: {
        zone: { id: zone.id, name: zone.name },
        deliveryFee: fee,
        estimatedTime: zone.estimated_time,
        freeDeliveryThreshold: zone.free_delivery_threshold,
        amountForFreeDelivery: zone.free_delivery_threshold
          ? Math.max(0, parseFloat(zone.free_delivery_threshold) - orderAmount)
          : null,
      },
    };
  } catch (err) {
    console.error('[DELIVERY] Error calculating fee:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ SUIVI LIVRAISON ============

export async function createDeliveryTracking(tenantId, orderId) {
  try {
    const { data, error } = await supabase
      .from('delivery_tracking')
      .insert({ tenant_id: tenantId, order_id: orderId, status: DELIVERY_STATUS.PENDING })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[DELIVERY] Error creating tracking:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getDeliveryTracking(tenantId, orderId) {
  try {
    const { data, error } = await supabase
      .from('delivery_tracking')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return { success: true, data: data || null };
  } catch (err) {
    console.error('[DELIVERY] Error getting tracking:', err.message);
    return { success: false, error: err.message };
  }
}

export async function updateDeliveryStatus(tenantId, orderId, updates) {
  const { status, driverName, driverPhone, estimatedArrival, deliveryNotes, failureReason } = updates;

  try {
    const updateData = { updated_at: new Date().toISOString() };
    if (status) updateData.status = status;
    if (driverName !== undefined) updateData.driver_name = driverName;
    if (driverPhone !== undefined) updateData.driver_phone = driverPhone;
    if (estimatedArrival !== undefined) updateData.estimated_arrival = estimatedArrival;
    if (deliveryNotes !== undefined) updateData.delivery_notes = deliveryNotes;
    if (failureReason !== undefined) updateData.failure_reason = failureReason;

    if (status === DELIVERY_STATUS.DELIVERED) {
      updateData.actual_delivery_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('delivery_tracking')
      .update(updateData)
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[DELIVERY] Error updating tracking:', err.message);
    return { success: false, error: err.message };
  }
}

export async function assignDriver(tenantId, orderId, driverName, driverPhone, estimatedArrival = null) {
  return updateDeliveryStatus(tenantId, orderId, {
    status: DELIVERY_STATUS.ASSIGNED, driverName, driverPhone, estimatedArrival,
  });
}

export async function markPickedUp(tenantId, orderId) {
  return updateDeliveryStatus(tenantId, orderId, { status: DELIVERY_STATUS.PICKED_UP });
}

export async function markInTransit(tenantId, orderId, estimatedArrival = null) {
  return updateDeliveryStatus(tenantId, orderId, { status: DELIVERY_STATUS.IN_TRANSIT, estimatedArrival });
}

export async function markDelivered(tenantId, orderId, notes = null) {
  return updateDeliveryStatus(tenantId, orderId, { status: DELIVERY_STATUS.DELIVERED, deliveryNotes: notes });
}

export async function markFailed(tenantId, orderId, reason) {
  return updateDeliveryStatus(tenantId, orderId, { status: DELIVERY_STATUS.FAILED, failureReason: reason });
}

export async function getPendingDeliveries(tenantId) {
  try {
    const { data, error } = await supabase
      .from('delivery_tracking')
      .select(`
        *,
        order:commerce_orders(
          id, order_number, customer_name, customer_phone,
          delivery_address, delivery_city, delivery_postal_code, total
        )
      `)
      .eq('tenant_id', tenantId)
      .in('status', [DELIVERY_STATUS.PENDING, DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.IN_TRANSIT])
      .order('created_at', { ascending: true });

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[DELIVERY] Error getting pending deliveries:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getDeliveryStats(tenantId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('delivery_tracking')
      .select('status, created_at, actual_delivery_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    const stats = { total: data.length, byStatus: {}, delivered: 0, failed: 0, successRate: 0 };
    for (const d of data) {
      stats.byStatus[d.status] = (stats.byStatus[d.status] || 0) + 1;
      if (d.status === DELIVERY_STATUS.DELIVERED) stats.delivered++;
      if (d.status === DELIVERY_STATUS.FAILED) stats.failed++;
    }

    const completed = stats.delivered + stats.failed;
    if (completed > 0) stats.successRate = Math.round((stats.delivered / completed) * 100);

    return { success: true, data: stats };
  } catch (err) {
    console.error('[DELIVERY] Error getting stats:', err.message);
    return { success: false, error: err.message };
  }
}
