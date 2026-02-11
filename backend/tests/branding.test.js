/**
 * Branding & White-Label Tests
 * Tests for /api/branding/* endpoints
 * 10 comprehensive tests
 */

import { jest } from '@jest/globals';
import express from 'express';

// ============================================
// MOCK SETUP
// ============================================

const stores = {
  branding: [],
  themes: [],
  custom_pages: []
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
      delete: () => {
        stores[table] = stores[table].filter(item => !filters.every(f => f(item)));
        return builder;
      },
      eq: (field, value) => {
        filters.push(item => item[field] === value);
        data = data.filter(item => item[field] === value);
        return builder;
      },
      order: () => builder,
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
      plan: req.headers['x-test-plan'] || 'business'
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

const { supabase } = await import('../src/config/supabase.js');
const { default: request } = await import('supertest');

// ============================================
// TEST HELPERS
// ============================================

const TEST_TENANT_ID = 'tenant_test_123';
const AUTH_HEADER = 'Bearer test_token';

// Create test app
const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  const brandingRoutes = (await import('../src/routes/branding.js')).default;
  app.use('/api/branding', brandingRoutes);

  return app;
};

// ============================================
// TESTS
// ============================================

describe('Branding & White-Label', () => {
  let app;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    resetStores();
  });

  // ============================================
  // BRANDING BASIC TESTS (3 tests)
  // ============================================

  describe('Branding Configuration', () => {
    test('1. Should return default branding when none configured', async () => {
      const res = await request(app)
        .get('/api/branding')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.primary_color).toBe('#3B82F6'); // Default color
      expect(res.body.data.font_family).toBe('Inter'); // Default font
    });

    test('2. Should update branding settings', async () => {
      const res = await request(app)
        .put('/api/branding')
        .set('Authorization', AUTH_HEADER)
        .send({
          primary_color: '#FF5733',
          company_name: 'My Salon',
          font_family: 'Roboto'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.primary_color).toBe('#FF5733');
      expect(res.body.data.company_name).toBe('My Salon');
    });

    test('3. Should validate hex color format', async () => {
      const res = await request(app)
        .put('/api/branding')
        .set('Authorization', AUTH_HEADER)
        .send({
          primary_color: 'not-a-color'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid hex color');
    });
  });

  // ============================================
  // THEMES TESTS (2 tests)
  // ============================================

  describe('Themes', () => {
    test('4. Should list available themes', async () => {
      stores.themes = [
        { id: 'theme_1', name: 'Dark Mode', is_premium: false },
        { id: 'theme_2', name: 'Premium Gold', is_premium: true }
      ];

      const res = await request(app)
        .get('/api/branding/themes')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    test('5. Should apply theme', async () => {
      stores.themes.push({
        id: 'theme_apply',
        name: 'Ocean Blue',
        is_premium: false,
        settings: {
          primary_color: '#0077B6',
          secondary_color: '#023E8A'
        }
      });

      const res = await request(app)
        .post('/api/branding/apply-theme')
        .set('Authorization', AUTH_HEADER)
        .send({ theme_id: 'theme_apply' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Ocean Blue');
    });
  });

  // ============================================
  // CUSTOM DOMAIN TESTS (2 tests)
  // ============================================

  describe('Custom Domain', () => {
    test('6. Should configure custom domain', async () => {
      const res = await request(app)
        .post('/api/branding/domain')
        .set('Authorization', AUTH_HEADER)
        .send({ custom_domain: 'mysalon.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.custom_domain).toBe('mysalon.com');
      expect(res.body.data.verification_token).toBeDefined();
      expect(res.body.data.instructions).toBeDefined();
    });

    test('7. Should validate domain format', async () => {
      const res = await request(app)
        .post('/api/branding/domain')
        .set('Authorization', AUTH_HEADER)
        .send({ custom_domain: 'invalid domain' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid domain');
    });
  });

  // ============================================
  // CSS GENERATION TESTS (1 test)
  // ============================================

  describe('CSS Generation', () => {
    test('8. Should generate theme CSS', async () => {
      stores.branding.push({
        tenant_id: TEST_TENANT_ID,
        primary_color: '#E91E63',
        secondary_color: '#9C27B0',
        font_family: 'Poppins'
      });

      const res = await request(app)
        .get(`/api/branding/theme.css?tenant_id=${TEST_TENANT_ID}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/css');
      expect(res.text).toContain('--color-primary: #E91E63');
      expect(res.text).toContain('--font-family:');
    });
  });

  // ============================================
  // CUSTOM PAGES TESTS (2 tests)
  // ============================================

  describe('Custom Pages', () => {
    test('9. Should create custom page', async () => {
      const res = await request(app)
        .post('/api/branding/pages')
        .set('Authorization', AUTH_HEADER)
        .send({
          page_type: 'about',
          slug: 'about-us',
          title: 'About Our Salon',
          content: '<h1>Welcome</h1><p>Our story...</p>',
          is_published: true
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.slug).toBe('about-us');
      expect(res.body.data.title).toBe('About Our Salon');
    });

    test('10. Should validate slug format', async () => {
      const res = await request(app)
        .post('/api/branding/pages')
        .set('Authorization', AUTH_HEADER)
        .send({
          page_type: 'about',
          slug: 'Invalid Slug With Spaces',
          title: 'Test Page'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('lowercase alphanumeric');
    });
  });
});
