/**
 * Stock Service
 * Gestion des mouvements de stock et alertes
 */

import { supabase } from '../../config/supabase.js';

// Types de mouvements
export const MOVEMENT_TYPES = {
  IN: 'in',
  OUT: 'out',
  ADJUSTMENT: 'adjustment',
  RETURN: 'return',
  LOSS: 'loss',
  TRANSFER: 'transfer',
};

export async function getProductStock(tenantId, productId) {
  try {
    const { data, error } = await supabase
      .from('product_stock')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('product_id', productId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return {
      success: true,
      data: data || { quantity: 0, reserved_quantity: 0 },
    };
  } catch (err) {
    console.error('[STOCK] Error getting stock:', err.message);
    return { success: false, error: err.message };
  }
}

export async function addStockMovement(tenantId, productId, movement) {
  const { type, quantity, reason, referenceId, createdBy } = movement;

  if (!Object.values(MOVEMENT_TYPES).includes(type)) {
    return { success: false, error: `Type de mouvement invalide: ${type}` };
  }

  if (!quantity && quantity !== 0) {
    return { success: false, error: 'Quantité requise' };
  }

  try {
    const { data: currentStock } = await supabase
      .from('product_stock')
      .select('quantity')
      .eq('tenant_id', tenantId)
      .eq('product_id', productId)
      .single();

    const previousQuantity = currentStock?.quantity || 0;
    let newQuantity;
    let actualQuantity = Math.abs(quantity);

    switch (type) {
      case MOVEMENT_TYPES.IN:
      case MOVEMENT_TYPES.RETURN:
        newQuantity = previousQuantity + actualQuantity;
        break;
      case MOVEMENT_TYPES.OUT:
      case MOVEMENT_TYPES.LOSS:
        newQuantity = previousQuantity - actualQuantity;
        if (newQuantity < 0) {
          return { success: false, error: `Stock insuffisant. Disponible: ${previousQuantity}` };
        }
        actualQuantity = -actualQuantity;
        break;
      case MOVEMENT_TYPES.ADJUSTMENT:
        newQuantity = quantity;
        actualQuantity = quantity - previousQuantity;
        break;
      default:
        return { success: false, error: 'Type de mouvement non géré' };
    }

    const updateData = {
      tenant_id: tenantId,
      product_id: productId,
      quantity: newQuantity,
      updated_at: new Date().toISOString(),
    };

    if (type === MOVEMENT_TYPES.IN) {
      updateData.last_restock_at = new Date().toISOString();
    } else if (type === MOVEMENT_TYPES.OUT) {
      updateData.last_sale_at = new Date().toISOString();
    }

    const { error: upsertError } = await supabase
      .from('product_stock')
      .upsert(updateData, { onConflict: 'tenant_id,product_id' });

    if (upsertError) throw upsertError;

    const { data: movementData, error: movementError } = await supabase
      .from('stock_movements')
      .insert({
        tenant_id: tenantId,
        product_id: productId,
        movement_type: type,
        quantity: actualQuantity,
        previous_quantity: previousQuantity,
        new_quantity: newQuantity,
        reason: reason || null,
        reference_id: referenceId || null,
        created_by: createdBy || null,
      })
      .select()
      .single();

    if (movementError) throw movementError;

    await checkStockAlert(tenantId, productId, newQuantity);

    return {
      success: true,
      data: {
        movement: movementData,
        previousQuantity,
        newQuantity,
      },
    };
  } catch (err) {
    console.error('[STOCK] Error adding movement:', err.message);
    return { success: false, error: err.message };
  }
}

export async function restockProduct(tenantId, productId, quantity, reason = 'Réapprovisionnement') {
  return addStockMovement(tenantId, productId, {
    type: MOVEMENT_TYPES.IN,
    quantity,
    reason,
  });
}

export async function sellProduct(tenantId, productId, quantity, orderId = null) {
  return addStockMovement(tenantId, productId, {
    type: MOVEMENT_TYPES.OUT,
    quantity,
    reason: 'Vente',
    referenceId: orderId,
  });
}

export async function adjustStock(tenantId, productId, newQuantity, reason = 'Ajustement inventaire') {
  return addStockMovement(tenantId, productId, {
    type: MOVEMENT_TYPES.ADJUSTMENT,
    quantity: newQuantity,
    reason,
  });
}

export async function getStockMovements(tenantId, options = {}) {
  try {
    const { productId, type, limit = 50, offset = 0, startDate, endDate } = options;

    let query = supabase
      .from('stock_movements')
      .select(`
        *,
        product:products(id, name, sku)
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (productId) query = query.eq('product_id', productId);
    if (type) query = query.eq('movement_type', type);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, data };
  } catch (err) {
    console.error('[STOCK] Error getting movements:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ ALERTES STOCK BAS ============

async function checkStockAlert(tenantId, productId, currentQuantity) {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('min_stock_alert, name')
      .eq('id', productId)
      .single();

    if (error || !product) return;

    if (currentQuantity <= product.min_stock_alert) {
      console.log(`[STOCK ALERT] ${product.name}: ${currentQuantity} (seuil: ${product.min_stock_alert})`);
    }
  } catch (err) {
    console.error('[STOCK] Error checking alert:', err.message);
  }
}

export async function getLowStockProducts(tenantId) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, sku, min_stock_alert,
        stock:product_stock(quantity, reserved_quantity)
      `)
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (error) throw error;

    const lowStockProducts = data
      .map((p) => ({
        ...p,
        currentStock: p.stock?.[0]?.quantity || 0,
        reservedStock: p.stock?.[0]?.reserved_quantity || 0,
        availableStock: (p.stock?.[0]?.quantity || 0) - (p.stock?.[0]?.reserved_quantity || 0),
      }))
      .filter((p) => p.currentStock <= p.min_stock_alert)
      .sort((a, b) => a.currentStock - b.currentStock);

    return { success: true, data: lowStockProducts, count: lowStockProducts.length };
  } catch (err) {
    console.error('[STOCK] Error getting low stock:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getOutOfStockProducts(tenantId) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, name, sku,
        stock:product_stock(quantity)
      `)
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (error) throw error;

    const outOfStock = data
      .filter((p) => (p.stock?.[0]?.quantity || 0) === 0)
      .map((p) => ({ id: p.id, name: p.name, sku: p.sku, currentStock: 0 }));

    return { success: true, data: outOfStock, count: outOfStock.length };
  } catch (err) {
    console.error('[STOCK] Error getting out of stock:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getStockStats(tenantId) {
  try {
    const [lowStock, outOfStock, allProducts] = await Promise.all([
      getLowStockProducts(tenantId),
      getOutOfStockProducts(tenantId),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
    ]);

    return {
      success: true,
      data: {
        totalProducts: allProducts.count || 0,
        lowStockCount: lowStock.count || 0,
        outOfStockCount: outOfStock.count || 0,
        lowStockProducts: lowStock.data?.slice(0, 5) || [],
        outOfStockProducts: outOfStock.data?.slice(0, 5) || [],
      },
    };
  } catch (err) {
    console.error('[STOCK] Error getting stats:', err.message);
    return { success: false, error: err.message };
  }
}
