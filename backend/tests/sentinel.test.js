/**
 * SENTINEL Tests
 * Tests for /api/sentinel/* endpoints
 * 15 comprehensive tests
 */

import { jest } from '@jest/globals';
import express from 'express';

// ============================================
// MOCK SETUP
// ============================================

const stores = {
  sentinel_daily_snapshots: [],
  sentinel_daily_costs: [],
  sentinel_goals: [],
  sentinel_insights: []
};

const resetStores = () => {
  Object.keys(stores).forEach(k => { stores[k] = []; });
};

// Mock Supabase
jest.unstable_mockModule('../src/config/supabase.js', () => {
  function createBuilder(table) {
    let data = [...(stores[table] || [])];
    let filters = [];
    let singleMode = false;

    const builder = {
      select: () => builder,
      insert: (newData) => {
        const items = Array.isArray(newData) ? newData : [newData];
        const inserted = items.map(item => ({
          id: item.id || `${table}_${Date.now()}`,
          ...item,
          created_at: new Date().toISOString()
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
      upsert: (newData, opts = {}) => {
        const items = Array.isArray(newData) ? newData : [newData];
        items.forEach(item => {
          const key = opts.onConflict || 'id';
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
      eq: (field, value) => {
        filters.push(item => item[field] === value);
        data = data.filter(item => item[field] === value);
        return builder;
      },
      gte: (field, value) => {
        data = data.filter(item => item[field] >= value);
        return builder;
      },
      order: (field, opts = {}) => {
        data.sort((a, b) => opts.ascending !== false ? (a[field] > b[field] ? 1 : -1) : (a[field] < b[field] ? 1 : -1));
        return builder;
      },
      limit: (n) => {
        data = data.slice(0, n);
        return builder;
      },
      single: () => { singleMode = true; return builder; },
      then: (resolve) => {
        if (singleMode) {
          resolve({ data: data[0] || null, error: data.length === 0 ? { code: 'PGRST116' } : null });
        } else {
          resolve({ data, error: null });
        }
      }
    };
    return builder;
  }

  return {
    supabase: { from: (table) => createBuilder(table) }
  };
});

// Mock auth middleware
jest.unstable_mockModule('../src/middleware/auth.js', () => ({
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Token manquant' });
    }
    req.user = {
      id: 'user_test',
      tenant_id: 'tenant_test_123',
      plan: 'business'
    };
    next();
  },
  requirePlan: (plan) => (req, res, next) => {
    const planHierarchy = { starter: 1, pro: 2, business: 3, enterprise: 4 };
    if (planHierarchy[req.user.plan] >= planHierarchy[plan]) {
      next();
    } else {
      res.status(403).json({ success: false, error: 'Plan insuffisant' });
    }
  }
}));

// Mock services
jest.unstable_mockModule('../src/services/sentinelCollector.js', () => ({
  sentinelCollector: {
    collectRealtime: jest.fn().mockResolvedValue(true)
  }
}));

jest.unstable_mockModule('../src/services/sentinelInsights.js', () => ({
  sentinelInsights: {
    generateInsights: jest.fn().mockResolvedValue([
      { id: 'insight_1', type: 'opportunity', title: 'Test Insight', priority: 8 }
    ]),
    generateSpecificInsight: jest.fn().mockResolvedValue([
      { action: 'Test action', benefit: 'Test benefit', effort: 'low' }
    ]),
    dismissInsight: jest.fn().mockResolvedValue({ success: true, data: { status: 'dismissed' } }),
    markAsImplemented: jest.fn().mockResolvedValue({ success: true, data: { status: 'implemented' } })
  }
}));

const { supabase } = await import('../src/config/supabase.js');
const { default: request } = await import('supertest');

// ============================================
// TEST HELPERS
// ============================================

const TEST_TENANT_ID = 'tenant_test_123';
const AUTH_HEADER = 'Bearer test_token';

// Generate snapshot data for last N days
const generateSnapshots = (tenantId, days) => {
  const snapshots = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    snapshots.push({
      id: `snap_${i}`,
      tenant_id: tenantId,
      date: date.toISOString().split('T')[0],
      total_clients: 100 + i,
      new_clients: Math.floor(Math.random() * 10),
      total_reservations: 20 + Math.floor(Math.random() * 10),
      revenue_paid: 1000 + Math.random() * 500,
      no_show_rate: Math.random() * 10
    });
  }

  return snapshots;
};

// Generate cost data
const generateCosts = (tenantId, days) => {
  const costs = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    costs.push({
      id: `cost_${i}`,
      tenant_id: tenantId,
      date: date.toISOString().split('T')[0],
      ai_cost_eur: Math.random() * 5,
      sms_cost_eur: Math.random() * 2,
      voice_cost_eur: Math.random() * 3,
      emails_cost_eur: Math.random() * 0.5,
      total_cost_eur: Math.random() * 10
    });
  }

  return costs;
};

// Create test app
const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  const sentinelRoutes = (await import('../src/routes/sentinel.js')).default;
  app.use('/api/sentinel', sentinelRoutes);

  return app;
};

// ============================================
// TESTS
// ============================================

describe('SENTINEL Analytics', () => {
  let app;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    resetStores();
  });

  // ============================================
  // AUTHENTICATION TESTS (2 tests)
  // ============================================

  describe('Authentication', () => {
    test('1. Should reject request without authentication', async () => {
      const res = await request(app)
        .get('/api/sentinel/dashboard')
        .expect(401);

      expect(res.body.error).toBe('Token manquant');
    });

    test('2. Should accept authenticated request', async () => {
      const res = await request(app)
        .get('/api/sentinel/dashboard')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // ============================================
  // DASHBOARD TESTS (3 tests)
  // ============================================

  describe('Dashboard', () => {
    test('3. Should return dashboard with all sections', async () => {
      stores.sentinel_daily_snapshots = generateSnapshots(TEST_TENANT_ID, 30);
      stores.sentinel_daily_costs = generateCosts(TEST_TENANT_ID, 30);

      const res = await request(app)
        .get('/api/sentinel/dashboard')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.today).toBeDefined();
      expect(res.body.data.trends).toBeDefined();
      expect(res.body.data.costs).toBeDefined();
      expect(res.body.data.period).toBeDefined();
    });

    test('4. Should return empty snapshot when no data', async () => {
      const res = await request(app)
        .get('/api/sentinel/dashboard')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.today.total_clients).toBe(0);
    });

    test('5. Should refresh data on demand', async () => {
      const res = await request(app)
        .post('/api/sentinel/refresh')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Data refreshed');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ============================================
  // ACTIVITY TESTS (3 tests)
  // ============================================

  describe('Activity', () => {
    test('6. Should return 7-day activity', async () => {
      stores.sentinel_daily_snapshots = generateSnapshots(TEST_TENANT_ID, 10);

      const res = await request(app)
        .get('/api/sentinel/activity/7d')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.period).toBe('7d');
      expect(res.body.data.days).toBe(7);
      expect(res.body.data.totals).toBeDefined();
      expect(res.body.data.averages).toBeDefined();
    });

    test('7. Should return 30-day activity', async () => {
      stores.sentinel_daily_snapshots = generateSnapshots(TEST_TENANT_ID, 35);

      const res = await request(app)
        .get('/api/sentinel/activity/30d')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.period).toBe('30d');
    });

    test('8. Should reject invalid period', async () => {
      const res = await request(app)
        .get('/api/sentinel/activity/invalid')
        .set('Authorization', AUTH_HEADER)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid period');
    });
  });

  // ============================================
  // COSTS TESTS (2 tests)
  // ============================================

  describe('Costs', () => {
    test('9. Should return cost breakdown', async () => {
      stores.sentinel_daily_costs = generateCosts(TEST_TENANT_ID, 30);

      const res = await request(app)
        .get('/api/sentinel/costs/30d')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.summary.breakdown).toBeDefined();
      expect(res.body.data.summary.breakdown.ai).toBeDefined();
      expect(res.body.data.summary.breakdown.sms).toBeDefined();
    });

    test('10. Should calculate estimated monthly cost', async () => {
      stores.sentinel_daily_costs = generateCosts(TEST_TENANT_ID, 7);

      const res = await request(app)
        .get('/api/sentinel/costs/7d')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.estimated_monthly).toBeDefined();
    });
  });

  // ============================================
  // INSIGHTS TESTS (3 tests)
  // ============================================

  describe('Insights', () => {
    test('11. Should list active insights', async () => {
      stores.sentinel_insights = [
        { id: 'ins_1', tenant_id: TEST_TENANT_ID, status: 'active', priority: 9, title: 'High Priority' },
        { id: 'ins_2', tenant_id: TEST_TENANT_ID, status: 'active', priority: 5, title: 'Low Priority' },
        { id: 'ins_3', tenant_id: TEST_TENANT_ID, status: 'dismissed', priority: 7, title: 'Dismissed' }
      ];

      const res = await request(app)
        .get('/api/sentinel/insights')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    test('12. Should generate new insights', async () => {
      const res = await request(app)
        .post('/api/sentinel/insights/generate')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.message).toContain('Generated');
    });

    test('13. Should ask for specific insight', async () => {
      const res = await request(app)
        .post('/api/sentinel/insights/ask')
        .set('Authorization', AUTH_HEADER)
        .send({ topic: 'revenue' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.topic).toBe('revenue');
    });
  });

  // ============================================
  // GOALS TESTS (2 tests)
  // ============================================

  describe('Goals', () => {
    test('14. Should return goals or defaults', async () => {
      const res = await request(app)
        .get('/api/sentinel/goals')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    test('15. Should update goals', async () => {
      const res = await request(app)
        .put('/api/sentinel/goals')
        .set('Authorization', AUTH_HEADER)
        .send({
          goal_revenue_monthly: 10000,
          goal_new_clients_monthly: 50,
          alert_no_show_rate_threshold: 10
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
