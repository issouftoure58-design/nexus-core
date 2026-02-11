/**
 * Test App Builder
 * Creates Express app with mocked dependencies for testing
 */

import express from 'express';
import { jest } from '@jest/globals';

// Create a mock Supabase instance
export function createMockSupabase() {
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

  function createQueryBuilder(table) {
    let data = [...(stores[table] || [])];
    let filters = [];
    let countMode = false;
    let singleMode = false;

    const builder = {
      select: (fields, options = {}) => {
        if (options.count === 'exact') countMode = true;
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
        stores[table] = stores[table].map(item => {
          if (filters.every(f => f(item))) {
            return { ...item, ...updates };
          }
          return item;
        });
        data = stores[table].filter(item => filters.every(f => f(item)));
        return builder;
      },
      upsert: (newData, options = {}) => {
        const items = Array.isArray(newData) ? newData : [newData];
        items.forEach(item => {
          const key = options.onConflict || 'id';
          const idx = stores[table].findIndex(e => e[key] === item[key]);
          if (idx >= 0) {
            stores[table][idx] = { ...stores[table][idx], ...item };
            data = [stores[table][idx]];
          } else {
            const newItem = { id: `${table}_${Date.now()}`, ...item };
            stores[table].push(newItem);
            data = [newItem];
          }
        });
        return builder;
      },
      delete: () => {
        stores[table] = stores[table].filter(item => !filters.every(f => f(item)));
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
      gte: (field, value) => {
        filters.push(item => item[field] >= value);
        data = data.filter(item => item[field] >= value);
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
      or: () => builder,
      order: (field, opts = {}) => {
        data.sort((a, b) => opts.ascending !== false ? (a[field] > b[field] ? 1 : -1) : (a[field] < b[field] ? 1 : -1));
        return builder;
      },
      range: (from, to) => {
        data = data.slice(from, to + 1);
        return builder;
      },
      limit: (count) => {
        data = data.slice(0, count);
        return builder;
      },
      single: () => {
        singleMode = true;
        return builder;
      },
      then: (resolve) => {
        if (singleMode) {
          resolve({
            data: data[0] || null,
            error: data.length === 0 ? { code: 'PGRST116' } : null
          });
        } else {
          resolve({
            data,
            error: null,
            count: countMode ? data.length : undefined
          });
        }
      }
    };

    return builder;
  }

  return {
    from: (table) => createQueryBuilder(table),
    stores,
    resetStores: () => {
      Object.keys(stores).forEach(k => { stores[k] = []; });
    },
    seedData: (table, data) => {
      if (stores[table]) {
        if (Array.isArray(data)) stores[table].push(...data);
        else stores[table].push(data);
      }
    }
  };
}

// Create test JWT token
export function createTestToken(payload = {}) {
  const defaultPayload = {
    id: 'user_test_123',
    tenant_id: 'tenant_test_123',
    email: 'test@example.com',
    role: 'admin',
    plan: 'business'
  };

  // Simple base64 encoding for test purposes
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const data = Buffer.from(JSON.stringify({ ...defaultPayload, ...payload })).toString('base64url');
  const signature = 'test_signature';

  return `${header}.${data}.${signature}`;
}

// Create API key for testing
export function createTestApiKey(prefix = 'nxs_prod') {
  return `${prefix}_${Math.random().toString(36).substr(2, 32)}`;
}

export default { createMockSupabase, createTestToken, createTestApiKey };
