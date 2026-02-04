/**
 * Product Service
 * Gestion du catalogue produits multi-tenant
 */

import { supabase } from '../../config/supabase.js';

// ============ CATEGORIES ============

export async function getCategories(tenantId, includeInactive = false) {
  try {
    let query = supabase
      .from('product_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[PRODUCTS] Error getting categories:', err.message);
    return { success: false, error: err.message };
  }
}

export async function createCategory(tenantId, categoryData) {
  try {
    const { data, error } = await supabase
      .from('product_categories')
      .insert({
        tenant_id: tenantId,
        name: categoryData.name,
        description: categoryData.description || null,
        parent_id: categoryData.parentId || null,
        sort_order: categoryData.sortOrder || 0,
        is_active: categoryData.isActive !== false,
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[PRODUCTS] Error creating category:', err.message);
    return { success: false, error: err.message };
  }
}

export async function updateCategory(tenantId, categoryId, updates) {
  try {
    const dbUpdates = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.parentId !== undefined) dbUpdates.parent_id = updates.parentId;
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    dbUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('product_categories')
      .update(dbUpdates)
      .eq('id', categoryId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[PRODUCTS] Error updating category:', err.message);
    return { success: false, error: err.message };
  }
}

export async function deleteCategory(tenantId, categoryId) {
  try {
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .eq('tenant_id', tenantId);

    if (count > 0) {
      return { success: false, error: `Impossible de supprimer: ${count} produits dans cette catégorie` };
    }

    const { error } = await supabase
      .from('product_categories')
      .delete()
      .eq('id', categoryId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[PRODUCTS] Error deleting category:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ PRODUITS ============

export async function getProducts(tenantId, options = {}) {
  try {
    const { categoryId, includeInactive, search, limit = 100, offset = 0 } = options;

    let query = supabase
      .from('products')
      .select(`
        *,
        category:product_categories(id, name),
        stock:product_stock(quantity, reserved_quantity)
      `)
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const products = (data || []).map((p) => ({
      ...p,
      stock: p.stock?.[0] || { quantity: 0, reserved_quantity: 0 },
      availableStock: (p.stock?.[0]?.quantity || 0) - (p.stock?.[0]?.reserved_quantity || 0),
    }));

    return { success: true, data: products, count: products.length };
  } catch (err) {
    console.error('[PRODUCTS] Error getting products:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getProductById(tenantId, productId) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category:product_categories(id, name),
        stock:product_stock(quantity, reserved_quantity, last_restock_at, last_sale_at)
      `)
      .eq('id', productId)
      .eq('tenant_id', tenantId)
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        ...data,
        stock: data.stock?.[0] || { quantity: 0, reserved_quantity: 0 },
        availableStock: (data.stock?.[0]?.quantity || 0) - (data.stock?.[0]?.reserved_quantity || 0),
      },
    };
  } catch (err) {
    console.error('[PRODUCTS] Error getting product:', err.message);
    return { success: false, error: err.message };
  }
}

export async function createProduct(tenantId, productData) {
  try {
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        tenant_id: tenantId,
        category_id: productData.categoryId || null,
        sku: productData.sku || null,
        name: productData.name,
        description: productData.description || null,
        price: productData.price || 0,
        cost_price: productData.costPrice || 0,
        tax_rate: productData.taxRate ?? 20,
        unit: productData.unit || 'unite',
        image_url: productData.imageUrl || null,
        barcode: productData.barcode || null,
        is_active: productData.isActive !== false,
        is_featured: productData.isFeatured || false,
        min_stock_alert: productData.minStockAlert || 5,
      })
      .select()
      .single();

    if (productError) throw productError;

    // Stock initial
    await supabase.from('product_stock').insert({
      tenant_id: tenantId,
      product_id: product.id,
      quantity: productData.initialStock || 0,
    });

    // Mouvement de stock initial
    if (productData.initialStock > 0) {
      await supabase.from('stock_movements').insert({
        tenant_id: tenantId,
        product_id: product.id,
        movement_type: 'in',
        quantity: productData.initialStock,
        previous_quantity: 0,
        new_quantity: productData.initialStock,
        reason: 'Stock initial',
      });
    }

    return { success: true, data: product };
  } catch (err) {
    console.error('[PRODUCTS] Error creating product:', err.message);
    return { success: false, error: err.message };
  }
}

export async function updateProduct(tenantId, productId, updates) {
  try {
    const dbUpdates = {};
    if (updates.categoryId !== undefined) dbUpdates.category_id = updates.categoryId;
    if (updates.sku !== undefined) dbUpdates.sku = updates.sku;
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.price !== undefined) dbUpdates.price = updates.price;
    if (updates.costPrice !== undefined) dbUpdates.cost_price = updates.costPrice;
    if (updates.taxRate !== undefined) dbUpdates.tax_rate = updates.taxRate;
    if (updates.unit !== undefined) dbUpdates.unit = updates.unit;
    if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;
    if (updates.barcode !== undefined) dbUpdates.barcode = updates.barcode;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.isFeatured !== undefined) dbUpdates.is_featured = updates.isFeatured;
    if (updates.minStockAlert !== undefined) dbUpdates.min_stock_alert = updates.minStockAlert;
    dbUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('id', productId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[PRODUCTS] Error updating product:', err.message);
    return { success: false, error: err.message };
  }
}

export async function deleteProduct(tenantId, productId) {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .eq('tenant_id', tenantId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('[PRODUCTS] Error deleting product:', err.message);
    return { success: false, error: err.message };
  }
}
