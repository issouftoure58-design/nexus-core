/**
 * Supabase Mock for Testing
 * Simulates Supabase client behavior
 */

// In-memory data stores
const stores = {
  clients: [],
  rendezvous: [],
  services: [],
  api_keys: [],
  webhooks: [],
  branding: [],
  themes: [],
  custom_pages: [],
  sentinel_daily_snapshots: [],
  sentinel_daily_costs: [],
  sentinel_goals: [],
  sentinel_insights: [],
  tenants: []
};

// Helper to reset stores between tests
export function resetStores() {
  Object.keys(stores).forEach(key => {
    stores[key] = [];
  });
}

// Helper to seed data
export function seedData(table, data) {
  if (stores[table]) {
    if (Array.isArray(data)) {
      stores[table].push(...data);
    } else {
      stores[table].push(data);
    }
  }
}

// Helper to get store data
export function getStore(table) {
  return stores[table] || [];
}

// Create mock query builder
function createQueryBuilder(table) {
  let data = [...(stores[table] || [])];
  let filters = [];
  let selectedFields = null;
  let countMode = false;
  let orderConfig = null;
  let rangeConfig = null;
  let limitConfig = null;
  let singleMode = false;

  const builder = {
    select: (fields, options = {}) => {
      selectedFields = fields;
      if (options.count === 'exact') {
        countMode = true;
      }
      return builder;
    },

    insert: (newData) => {
      const items = Array.isArray(newData) ? newData : [newData];
      const inserted = items.map(item => ({
        id: item.id || `${table}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...item,
        created_at: item.created_at || new Date().toISOString()
      }));
      stores[table].push(...inserted);
      data = inserted;
      return builder;
    },

    update: (updates) => {
      data = data.map(item => {
        const shouldUpdate = filters.every(f => f(item));
        if (shouldUpdate) {
          return { ...item, ...updates, updated_at: new Date().toISOString() };
        }
        return item;
      });
      // Also update the store
      stores[table] = stores[table].map(item => {
        const shouldUpdate = filters.every(f => f(item));
        if (shouldUpdate) {
          return { ...item, ...updates, updated_at: new Date().toISOString() };
        }
        return item;
      });
      return builder;
    },

    upsert: (newData, options = {}) => {
      const items = Array.isArray(newData) ? newData : [newData];
      items.forEach(item => {
        const conflictKey = options.onConflict || 'id';
        const existingIndex = stores[table].findIndex(
          existing => existing[conflictKey] === item[conflictKey]
        );
        if (existingIndex >= 0) {
          stores[table][existingIndex] = { ...stores[table][existingIndex], ...item };
          data = [stores[table][existingIndex]];
        } else {
          const newItem = {
            id: item.id || `${table}_${Date.now()}`,
            ...item,
            created_at: item.created_at || new Date().toISOString()
          };
          stores[table].push(newItem);
          data = [newItem];
        }
      });
      return builder;
    },

    delete: () => {
      const toDelete = data.filter(item => filters.every(f => f(item)));
      stores[table] = stores[table].filter(item => !toDelete.includes(item));
      data = toDelete;
      return builder;
    },

    eq: (field, value) => {
      filters.push(item => item[field] === value);
      data = data.filter(item => item[field] === value);
      return builder;
    },

    neq: (field, value) => {
      filters.push(item => item[field] !== value);
      data = data.filter(item => item[field] !== value);
      return builder;
    },

    gt: (field, value) => {
      filters.push(item => item[field] > value);
      data = data.filter(item => item[field] > value);
      return builder;
    },

    gte: (field, value) => {
      filters.push(item => item[field] >= value);
      data = data.filter(item => item[field] >= value);
      return builder;
    },

    lt: (field, value) => {
      filters.push(item => item[field] < value);
      data = data.filter(item => item[field] < value);
      return builder;
    },

    lte: (field, value) => {
      filters.push(item => item[field] <= value);
      data = data.filter(item => item[field] <= value);
      return builder;
    },

    in: (field, values) => {
      filters.push(item => values.includes(item[field]));
      data = data.filter(item => values.includes(item[field]));
      return builder;
    },

    or: (condition) => {
      // Simplified OR handling
      return builder;
    },

    order: (field, options = {}) => {
      orderConfig = { field, ascending: options.ascending !== false };
      data.sort((a, b) => {
        if (orderConfig.ascending) {
          return a[field] > b[field] ? 1 : -1;
        }
        return a[field] < b[field] ? 1 : -1;
      });
      return builder;
    },

    range: (from, to) => {
      rangeConfig = { from, to };
      data = data.slice(from, to + 1);
      return builder;
    },

    limit: (count) => {
      limitConfig = count;
      data = data.slice(0, count);
      return builder;
    },

    single: () => {
      singleMode = true;
      return builder;
    },

    // Execute and return results
    then: (resolve) => {
      let result;
      if (singleMode) {
        result = {
          data: data[0] || null,
          error: data.length === 0 ? { code: 'PGRST116', message: 'Not found' } : null
        };
      } else {
        result = {
          data,
          error: null,
          count: countMode ? stores[table].filter(item => filters.every(f => f(item))).length : undefined
        };
      }
      resolve(result);
    }
  };

  return builder;
}

// Mock Supabase client
export const mockSupabase = {
  from: (table) => createQueryBuilder(table),
  auth: {
    getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null })
  }
};

export default mockSupabase;
