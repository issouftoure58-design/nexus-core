/**
 * Pickup Service (Click & Collect)
 * Gestion des créneaux de retrait en magasin
 */

import { supabase } from '../../config/supabase.js';

// ============ CONFIGURATION CRÉNEAUX ============

export async function getPickupConfig(tenantId) {
  try {
    const { data, error } = await supabase
      .from('pickup_slots_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('day_of_week')
      .order('start_time');

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[PICKUP] Error getting config:', err.message);
    return { success: false, error: err.message };
  }
}

export async function setPickupConfig(tenantId, configData) {
  const { dayOfWeek, startTime, endTime, slotDuration = 30, maxOrdersPerSlot = 5, isActive = true } = configData;

  try {
    const { data, error } = await supabase
      .from('pickup_slots_config')
      .upsert({
        tenant_id: tenantId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        slot_duration: slotDuration,
        max_orders_per_slot: maxOrdersPerSlot,
        is_active: isActive,
      }, { onConflict: 'tenant_id,day_of_week,start_time' })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[PICKUP] Error setting config:', err.message);
    return { success: false, error: err.message };
  }
}

export async function deletePickupConfig(tenantId, configId) {
  try {
    const { error } = await supabase
      .from('pickup_slots_config')
      .delete()
      .eq('id', configId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[PICKUP] Error deleting config:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ EXCEPTIONS ============

export async function getExceptions(tenantId, startDate, endDate) {
  try {
    let query = supabase
      .from('pickup_slots_exceptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('exception_date');

    if (startDate) query = query.gte('exception_date', startDate);
    if (endDate) query = query.lte('exception_date', endDate);

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[PICKUP] Error getting exceptions:', err.message);
    return { success: false, error: err.message };
  }
}

export async function setException(tenantId, exceptionData) {
  const { date, isClosed = false, customStartTime, customEndTime, reason } = exceptionData;

  try {
    const { data, error } = await supabase
      .from('pickup_slots_exceptions')
      .upsert({
        tenant_id: tenantId,
        exception_date: date,
        is_closed: isClosed,
        custom_start_time: customStartTime || null,
        custom_end_time: customEndTime || null,
        reason: reason || null,
      }, { onConflict: 'tenant_id,exception_date' })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[PICKUP] Error setting exception:', err.message);
    return { success: false, error: err.message };
  }
}

export async function deleteException(tenantId, exceptionId) {
  try {
    const { error } = await supabase
      .from('pickup_slots_exceptions')
      .delete()
      .eq('id', exceptionId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[PICKUP] Error deleting exception:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ CRÉNEAUX DISPONIBLES ============

function generateSlotsForDate(config, date) {
  const slots = [];
  const [startHour, startMin] = config.start_time.split(':').map(Number);
  const [endHour, endMin] = config.end_time.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const duration = config.slot_duration || 30;

  for (let minutes = startMinutes; minutes < endMinutes; minutes += duration) {
    const hour = Math.floor(minutes / 60);
    const min = minutes % 60;
    const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    slots.push({ date, time: timeStr, maxOrders: config.max_orders_per_slot });
  }

  return slots;
}

export async function getAvailableSlots(tenantId, startDate, days = 7) {
  try {
    const configResult = await getPickupConfig(tenantId);
    if (!configResult.success || configResult.data.length === 0) {
      return { success: true, data: [], message: 'Aucun créneau configuré' };
    }

    const config = configResult.data;
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    const exceptionsResult = await getExceptions(tenantId, startDate, endDate.toISOString().split('T')[0]);
    const exceptionsByDate = {};
    for (const exc of exceptionsResult.data || []) {
      exceptionsByDate[exc.exception_date] = exc;
    }

    // Compter les commandes existantes par créneau
    const { data: existingOrders, error: ordersError } = await supabase
      .from('commerce_orders')
      .select('pickup_date, pickup_time')
      .eq('tenant_id', tenantId)
      .eq('order_type', 'click_collect')
      .in('status', ['pending', 'confirmed', 'preparing', 'ready'])
      .gte('pickup_date', startDate)
      .lte('pickup_date', endDate.toISOString().split('T')[0]);

    if (ordersError) throw ordersError;

    const reservationCount = {};
    for (const order of existingOrders || []) {
      if (order.pickup_date && order.pickup_time) {
        // Normalize time to HH:MM (DB may store HH:MM:SS)
        const normalizedTime = order.pickup_time.slice(0, 5);
        const key = `${order.pickup_date}_${normalizedTime}`;
        reservationCount[key] = (reservationCount[key] || 0) + 1;
      }
    }

    const allSlots = [];
    const currentDate = new Date(startDate);
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayOfWeek = currentDate.getDay();

      const exception = exceptionsByDate[dateStr];
      if (exception?.is_closed) {
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      const dayConfig = config.filter((c) => c.day_of_week === dayOfWeek);

      for (const cfg of dayConfig) {
        const effectiveConfig = exception
          ? { ...cfg, start_time: exception.custom_start_time || cfg.start_time, end_time: exception.custom_end_time || cfg.end_time }
          : cfg;

        const slots = generateSlotsForDate(effectiveConfig, dateStr);

        for (const slot of slots) {
          // Skip past slots for today (1h minimum lead time)
          if (dateStr === now.toISOString().split('T')[0]) {
            const [slotH, slotM] = slot.time.split(':').map(Number);
            const slotTime = new Date(currentDate);
            slotTime.setHours(slotH, slotM, 0, 0);
            if (slotTime.getTime() < now.getTime() + 3600000) continue;
          }

          const key = `${slot.date}_${slot.time}`;
          const reserved = reservationCount[key] || 0;
          const available = slot.maxOrders - reserved;

          allSlots.push({
            ...slot,
            reserved,
            available: Math.max(0, available),
            full: available <= 0,
          });
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return { success: true, data: allSlots };
  } catch (err) {
    console.error('[PICKUP] Error getting available slots:', err.message);
    return { success: false, error: err.message };
  }
}

export async function validateSlot(tenantId, date, time) {
  try {
    const slotsResult = await getAvailableSlots(tenantId, date, 1);
    if (!slotsResult.success) return { valid: false, error: slotsResult.error };

    const slot = slotsResult.data.find((s) => s.date === date && s.time === time);
    if (!slot) return { valid: false, error: 'Créneau non disponible' };
    if (slot.full) return { valid: false, error: 'Créneau complet' };

    return { valid: true, slot };
  } catch (err) {
    console.error('[PICKUP] Error validating slot:', err.message);
    return { valid: false, error: err.message };
  }
}
