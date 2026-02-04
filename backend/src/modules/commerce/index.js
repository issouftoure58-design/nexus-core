/**
 * Commerce Module - Catalogue Produits
 * Re-exports pour accès simplifié
 */

export {
  // Catégories
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // Produits
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from './productService.js';

export {
  MOVEMENT_TYPES,
  getProductStock,
  addStockMovement,
  restockProduct,
  sellProduct,
  adjustStock,
  getStockMovements,
  getLowStockProducts,
  getOutOfStockProducts,
  getStockStats,
} from './stockService.js';

export {
  createSale,
  getSaleById,
  getSales,
  getSalesStats,
  getTopProducts,
  getDailyRevenue,
  getComparison,
} from './salesService.js';

export {
  ORDER_STATUS,
  ORDER_TYPES,
  createOrder,
  getOrderById,
  getOrderByNumber,
  getOrders,
  updateOrderStatus,
  cancelOrder,
  getOrderStats,
} from './orderService.js';

export {
  getPickupConfig,
  setPickupConfig,
  deletePickupConfig,
  getExceptions,
  setException,
  deleteException,
  getAvailableSlots,
  validateSlot,
} from './pickupService.js';

export {
  DELIVERY_STATUS,
  getDeliveryZones,
  saveDeliveryZone,
  deleteDeliveryZone,
  findZoneByPostalCode,
  calculateDeliveryFee,
  createDeliveryTracking,
  getDeliveryTracking,
  updateDeliveryStatus,
  assignDriver,
  markPickedUp,
  markInTransit,
  markDelivered,
  markFailed,
  getPendingDeliveries,
  getDeliveryStats,
} from './deliveryService.js';

export {
  analyzeStock,
  generateAIReport,
  suggestPromotions,
  getStockData,
  getSalesData,
} from './stockAdvisorService.js';
