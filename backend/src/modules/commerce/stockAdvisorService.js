/**
 * Stock Advisor Service
 * Conseils IA pour la gestion du stock
 */

import { supabase } from '../../config/supabase.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============ COLLECTE DE DONNÉES ============

export async function getStockData(tenantId) {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id, name, sku, price, cost_price, min_stock_alert, is_active,
        category:product_categories(name),
        stock:product_stock(quantity, reserved_quantity, last_restock_at, last_sale_at)
      `)
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (error) throw error;

    return products.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: parseFloat(p.price),
      costPrice: p.cost_price ? parseFloat(p.cost_price) : null,
      margin: parseFloat(p.price) - (p.cost_price ? parseFloat(p.cost_price) : 0),
      marginPercent: p.cost_price ? Math.round(((parseFloat(p.price) - parseFloat(p.cost_price)) / parseFloat(p.price)) * 100) : null,
      category: p.category?.name || 'Sans catégorie',
      currentStock: p.stock?.[0]?.quantity || 0,
      reservedStock: p.stock?.[0]?.reserved_quantity || 0,
      availableStock: (p.stock?.[0]?.quantity || 0) - (p.stock?.[0]?.reserved_quantity || 0),
      minStockAlert: p.min_stock_alert,
      lastRestockAt: p.stock?.[0]?.last_restock_at,
      lastSaleAt: p.stock?.[0]?.last_sale_at,
      isLowStock: (p.stock?.[0]?.quantity || 0) <= p.min_stock_alert,
      isOutOfStock: (p.stock?.[0]?.quantity || 0) === 0,
    }));
  } catch (err) {
    console.error('[STOCK ADVISOR] Error getting stock data:', err.message);
    return [];
  }
}

export async function getSalesData(tenantId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: saleItems, error } = await supabase
      .from('sale_items')
      .select(`
        product_id, product_name, quantity, line_total, created_at,
        sale:sales(created_at)
      `)
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    const productSales = {};
    for (const item of saleItems) {
      if (!productSales[item.product_id]) {
        productSales[item.product_id] = {
          productId: item.product_id,
          productName: item.product_name,
          totalQuantity: 0,
          totalRevenue: 0,
          salesCount: 0,
          lastSaleDate: null,
        };
      }
      productSales[item.product_id].totalQuantity += item.quantity;
      productSales[item.product_id].totalRevenue += parseFloat(item.line_total);
      productSales[item.product_id].salesCount++;

      const saleDate = item.sale?.created_at || item.created_at;
      if (!productSales[item.product_id].lastSaleDate || saleDate > productSales[item.product_id].lastSaleDate) {
        productSales[item.product_id].lastSaleDate = saleDate;
      }
    }

    return Object.values(productSales).map(p => ({
      ...p,
      avgDailySales: Math.round((p.totalQuantity / days) * 100) / 100,
      totalRevenue: Math.round(p.totalRevenue * 100) / 100,
    }));
  } catch (err) {
    console.error('[STOCK ADVISOR] Error getting sales data:', err.message);
    return [];
  }
}

// ============ ANALYSES ============

export async function analyzeStock(tenantId) {
  const stockData = await getStockData(tenantId);
  const salesData = await getSalesData(tenantId, 30);

  if (stockData.length === 0) {
    return {
      success: true,
      data: { summary: { totalProducts: 0 }, alerts: [], recommendations: [] },
    };
  }

  const salesByProduct = {};
  for (const sale of salesData) {
    salesByProduct[sale.productId] = sale;
  }

  const enrichedProducts = stockData.map(product => {
    const sales = salesByProduct[product.id] || { totalQuantity: 0, avgDailySales: 0, lastSaleDate: null, totalRevenue: 0 };
    const daysOfStock = sales.avgDailySales > 0
      ? Math.round(product.availableStock / sales.avgDailySales)
      : product.availableStock > 0 ? 999 : 0;
    const rotation = product.currentStock > 0
      ? Math.round((sales.totalQuantity / product.currentStock) * 100) / 100
      : 0;

    return {
      ...product,
      sales30d: sales.totalQuantity,
      avgDailySales: sales.avgDailySales,
      revenue30d: sales.totalRevenue || 0,
      lastSaleDate: sales.lastSaleDate,
      daysOfStock,
      rotation,
    };
  });

  const alerts = [];
  const recommendations = [];

  for (const product of enrichedProducts) {
    if (product.isOutOfStock) {
      alerts.push({
        type: 'out_of_stock', severity: 'critical',
        productId: product.id, productName: product.name,
        message: `${product.name} est en rupture de stock`,
        action: 'Réapprovisionner immédiatement',
      });
    } else if (product.isLowStock) {
      alerts.push({
        type: 'low_stock', severity: 'warning',
        productId: product.id, productName: product.name,
        currentStock: product.currentStock, minStock: product.minStockAlert,
        message: `${product.name}: stock bas (${product.currentStock}/${product.minStockAlert})`,
        action: 'Prévoir réapprovisionnement',
      });
    }

    if (product.daysOfStock > 0 && product.daysOfStock < 7 && !product.isLowStock) {
      alerts.push({
        type: 'predicted_stockout', severity: 'warning',
        productId: product.id, productName: product.name,
        daysOfStock: product.daysOfStock,
        message: `${product.name}: rupture prévue dans ${product.daysOfStock} jours`,
        action: `Commander environ ${Math.ceil(product.avgDailySales * 14)} unités`,
      });
    }

    if (product.rotation < 0.5 && product.currentStock > product.minStockAlert * 2) {
      recommendations.push({
        type: 'slow_moving',
        productId: product.id, productName: product.name,
        currentStock: product.currentStock, sales30d: product.sales30d, rotation: product.rotation,
        message: `${product.name}: faible rotation (${product.sales30d} vendus en 30j, ${product.currentStock} en stock)`,
        suggestion: 'Envisager une promotion pour écouler le stock',
      });
    }

    if (product.avgDailySales > 2 && product.daysOfStock < 14 && product.daysOfStock > 0) {
      recommendations.push({
        type: 'fast_moving_restock',
        productId: product.id, productName: product.name,
        avgDailySales: product.avgDailySales, daysOfStock: product.daysOfStock,
        message: `${product.name}: produit populaire (${product.avgDailySales}/jour), ${product.daysOfStock} jours de stock`,
        suggestion: `Commander ${Math.ceil(product.avgDailySales * 21)} unités pour 3 semaines`,
      });
    }

    if (product.sales30d === 0 && product.currentStock > 0) {
      const daysSinceLastSale = product.lastSaleAt
        ? Math.floor((Date.now() - new Date(product.lastSaleAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      recommendations.push({
        type: 'no_sales',
        productId: product.id, productName: product.name,
        currentStock: product.currentStock, daysSinceLastSale,
        message: `${product.name}: aucune vente en 30 jours (${product.currentStock} en stock)`,
        suggestion: daysSinceLastSale && daysSinceLastSale > 60
          ? 'Envisager de retirer ce produit ou forte promotion'
          : 'Mettre en avant ou proposer en promotion',
      });
    }
  }

  alerts.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  const summary = {
    totalProducts: stockData.length,
    outOfStock: stockData.filter(p => p.isOutOfStock).length,
    lowStock: stockData.filter(p => p.isLowStock && !p.isOutOfStock).length,
    healthyStock: stockData.filter(p => !p.isLowStock && !p.isOutOfStock).length,
    totalAlerts: alerts.length,
    totalRecommendations: recommendations.length,
    topSellers: enrichedProducts
      .filter(p => p.sales30d > 0)
      .sort((a, b) => b.sales30d - a.sales30d)
      .slice(0, 5)
      .map(p => ({ name: p.name, sales: p.sales30d, revenue: p.revenue30d })),
    slowMovers: enrichedProducts
      .filter(p => p.rotation < 0.3 && p.currentStock > 0)
      .sort((a, b) => a.rotation - b.rotation)
      .slice(0, 5)
      .map(p => ({ name: p.name, stock: p.currentStock, sales30d: p.sales30d })),
  };

  return {
    success: true,
    data: { summary, alerts, recommendations, analyzedAt: new Date().toISOString() },
  };
}

// ============ RAPPORT IA AVANCÉ ============

export async function generateAIReport(tenantId, tenantName = 'Commerce') {
  try {
    const analysis = await analyzeStock(tenantId);
    if (!analysis.success) return { success: false, error: 'Erreur analyse stock' };

    const { summary, alerts, recommendations } = analysis.data;

    const context = `
Tu es un conseiller expert en gestion de stock pour une épicerie/commerce.
Voici les données actuelles pour "${tenantName}":

RÉSUMÉ:
- Produits actifs: ${summary.totalProducts}
- En rupture: ${summary.outOfStock}
- Stock bas: ${summary.lowStock}
- Stock sain: ${summary.healthyStock}

TOP 5 VENTES (30 jours):
${summary.topSellers.map(p => `- ${p.name}: ${p.sales} vendus, ${p.revenue}€`).join('\n') || '- Aucune vente'}

PRODUITS À FAIBLE ROTATION:
${summary.slowMovers.map(p => `- ${p.name}: ${p.stock} en stock, ${p.sales30d} vendus en 30j`).join('\n') || '- Aucun'}

ALERTES (${alerts.length}):
${alerts.slice(0, 10).map(a => `- [${a.severity.toUpperCase()}] ${a.message}`).join('\n') || '- Aucune'}

RECOMMANDATIONS (${recommendations.length}):
${recommendations.slice(0, 10).map(r => `- ${r.message}`).join('\n') || '- Aucune'}
`;

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `${context}

Génère un rapport de conseil concis et actionnable (max 500 mots) avec:
1. État général du stock (1-2 phrases)
2. Actions prioritaires (3-5 points maximum)
3. Opportunités de vente (promos suggérées)
4. Prévisions pour la semaine

Sois direct et pratique. Utilise des chiffres concrets.`,
      }],
    });

    return {
      success: true,
      data: {
        analysis: analysis.data,
        aiReport: response.content[0].text,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    console.error('[STOCK ADVISOR] Error generating AI report:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ SUGGESTIONS PROMO ============

export async function suggestPromotions(tenantId) {
  try {
    const stockData = await getStockData(tenantId);
    const salesData = await getSalesData(tenantId, 30);

    const salesByProduct = {};
    for (const sale of salesData) {
      salesByProduct[sale.productId] = sale;
    }

    const promoSuggestions = [];

    for (const product of stockData) {
      const sales = salesByProduct[product.id];

      if (product.currentStock > product.minStockAlert * 3 && (!sales || sales.totalQuantity < 5)) {
        const suggestedDiscount = product.currentStock > product.minStockAlert * 5 ? 30 : 20;
        promoSuggestions.push({
          productId: product.id, productName: product.name,
          currentPrice: product.price,
          suggestedDiscount,
          suggestedPrice: Math.round(product.price * (1 - suggestedDiscount / 100) * 100) / 100,
          reason: 'Stock élevé, faibles ventes',
          currentStock: product.currentStock,
          sales30d: sales?.totalQuantity || 0,
          priority: 'high',
        });
      } else if (product.lastRestockAt) {
        const daysSinceRestock = Math.floor(
          (Date.now() - new Date(product.lastRestockAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceRestock > 60 && product.currentStock > 10) {
          promoSuggestions.push({
            productId: product.id, productName: product.name,
            currentPrice: product.price,
            suggestedDiscount: 15,
            suggestedPrice: Math.round(product.price * 0.85 * 100) / 100,
            reason: `Stock ancien (${daysSinceRestock} jours)`,
            currentStock: product.currentStock,
            daysSinceRestock,
            priority: 'medium',
          });
        }
      }
    }

    promoSuggestions.sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return priority[a.priority] - priority[b.priority];
    });

    return { success: true, data: promoSuggestions };
  } catch (err) {
    console.error('[STOCK ADVISOR] Error suggesting promos:', err.message);
    return { success: false, error: err.message };
  }
}
