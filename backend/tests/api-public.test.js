/**
 * API Publique Tests
 * Tests for /api/v1/* endpoints
 * 20 comprehensive tests
 */

import { jest } from '@jest/globals';
import express from 'express';

// ============================================
// MOCK SETUP
// ============================================

// Mock data stores
const stores = {
  clients: [],
  rendezvous: [],
  services: [],
  api_keys: [],
  webhooks: [],
  api_logs: []
};

const resetStores = () => {
  Object.keys(stores).forEach(k => { stores[k] = []; });
};

// Mock bcryptjs
jest.unstable_mockModule('bcryptjs', () => ({
  default: {
    compare: jest.fn().mockImplementation((plain, hash) => {
      // Simple mock: compare prefix
      return Promise.resolve(plain.startsWith('nxk_prod_abc') || plain.startsWith('nxk_test_'));
    }),
    hash: jest.fn().mockResolvedValue('hashed_key')
  }
}));

// Mock Supabase
jest.unstable_mockModule('../src/config/supabase.js', () => {
  function createBuilder(table) {
    let data = [...(stores[table] || [])];
    let filters = [];
    let singleMode = false;
    let countMode = false;

    const builder = {
      select: (f, opts = {}) => {
        if (opts.count === 'exact') countMode = true;
        return builder;
      },
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
      delete: () => {
        stores[table] = stores[table].filter(item => !filters.every(f => f(item)));
        return builder;
      },
      eq: (field, value) => {
        filters.push(item => item[field] === value);
        data = data.filter(item => item[field] === value);
        return builder;
      },
      or: () => builder,
      order: () => builder,
      range: (from, to) => {
        data = data.slice(from, to + 1);
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
          resolve({ data, error: null, count: countMode ? stores[table].length : undefined });
        }
      }
    };
    return builder;
  }

  return {
    supabase: { from: (table) => createBuilder(table) }
  };
});

// Import after mocking
const { supabase } = await import('../src/config/supabase.js');
const { default: request } = await import('supertest');

// ============================================
// TEST HELPERS
// ============================================

const TEST_TENANT_ID = 'tenant_test_123';
const TEST_API_KEY = 'nxk_prod_abc123def456ghi789jkl012mno345pqr';
const TEST_KEY_PREFIX = 'nxk_prod_abc1';

// Setup test API key in store
const setupApiKey = (scopes = ['read:clients', 'write:clients', 'read:reservations', 'write:reservations', 'delete:reservations', 'read:services', 'read:webhooks', 'write:webhooks', 'admin']) => {
  stores.api_keys.push({
    id: 'key_1',
    tenant_id: TEST_TENANT_ID,
    key_hash: 'hashed_key',
    key_prefix: TEST_KEY_PREFIX,
    scopes,
    rate_limit_per_hour: 1000,
    is_active: true,
    expires_at: null
  });
};

// Create test Express app
const createTestApp = async () => {
  const app = express();
  app.use(express.json());

  const apiPublic = (await import('../src/routes/api-public.js')).default;
  app.use('/api/v1', apiPublic);

  return app;
};

// ============================================
// TESTS
// ============================================

describe('API Publique v1', () => {
  let app;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    resetStores();
  });

  // ============================================
  // AUTHENTICATION TESTS (4 tests)
  // ============================================

  describe('Authentication', () => {
    test('1. Should reject request without API key', async () => {
      const res = await request(app)
        .get('/api/v1/clients')
        .expect(401);

      expect(res.body.error).toBe('unauthorized');
    });

    test('2. Should reject request with invalid API key format', async () => {
      const res = await request(app)
        .get('/api/v1/clients')
        .set('Authorization', 'Bearer invalid_key')
        .expect(401);

      expect(res.body.error).toBe('invalid_key_format');
    });

    test('3. Should reject request when no API key found', async () => {
      // No API keys in store
      const res = await request(app)
        .get('/api/v1/clients')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(401);

      expect(res.body.error).toBe('invalid_key');
    });

    test('4. Should authenticate with valid API key', async () => {
      setupApiKey();

      const res = await request(app)
        .post('/api/v1/auth/token')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.tenant_id).toBe(TEST_TENANT_ID);
    });
  });

  // ============================================
  // CLIENTS TESTS (5 tests)
  // ============================================

  describe('Clients', () => {
    beforeEach(() => {
      setupApiKey();
    });

    test('5. Should list clients with pagination', async () => {
      // Add test clients
      for (let i = 0; i < 25; i++) {
        stores.clients.push({
          id: `client_${i}`,
          tenant_id: TEST_TENANT_ID,
          nom: `Client ${i}`,
          prenom: 'Test',
          telephone: `+336000000${i.toString().padStart(2, '0')}`
        });
      }

      const res = await request(app)
        .get('/api/v1/clients?page=1&limit=10')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(10);
      expect(res.body.pagination).toBeDefined();
    });

    test('6. Should get client by ID', async () => {
      stores.clients.push({
        id: 'client_123',
        tenant_id: TEST_TENANT_ID,
        nom: 'Dupont',
        prenom: 'Jean',
        telephone: '+33612345678'
      });

      const res = await request(app)
        .get('/api/v1/clients/client_123')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.nom).toBe('Dupont');
    });

    test('7. Should create new client', async () => {
      const res = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          nom: 'Martin',
          prenom: 'Sophie',
          telephone: '+33698765432',
          email: 'sophie.martin@test.com'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.nom).toBe('Martin');
      expect(stores.clients.length).toBe(1);
    });

    test('8. Should validate required fields when creating client', async () => {
      const res = await request(app)
        .post('/api/v1/clients')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          prenom: 'Test'
          // Missing nom and telephone
        })
        .expect(400);

      expect(res.body.error).toBe('validation_error');
    });

    test('9. Should update client', async () => {
      stores.clients.push({
        id: 'client_update',
        tenant_id: TEST_TENANT_ID,
        nom: 'Original',
        prenom: 'Name',
        telephone: '+33600000000'
      });

      const res = await request(app)
        .patch('/api/v1/clients/client_update')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          nom: 'Updated'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.nom).toBe('Updated');
    });
  });

  // ============================================
  // RESERVATIONS TESTS (5 tests)
  // ============================================

  describe('Reservations', () => {
    beforeEach(() => {
      setupApiKey();
      stores.clients.push({
        id: 'client_rdv',
        tenant_id: TEST_TENANT_ID,
        nom: 'Client',
        telephone: '+33600000000'
      });
    });

    test('10. Should list reservations', async () => {
      stores.rendezvous.push({
        id: 'rdv_1',
        tenant_id: TEST_TENANT_ID,
        client_id: 'client_rdv',
        date: '2024-03-15',
        heure: '10:00',
        statut: 'confirme'
      });

      const res = await request(app)
        .get('/api/v1/reservations')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    test('11. Should filter reservations by status', async () => {
      stores.rendezvous.push(
        { id: 'rdv_a', tenant_id: TEST_TENANT_ID, statut: 'confirme', date: '2024-03-10', heure: '10:00' },
        { id: 'rdv_b', tenant_id: TEST_TENANT_ID, statut: 'annule', date: '2024-03-20', heure: '14:00' }
      );

      const res = await request(app)
        .get('/api/v1/reservations?status=confirme')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    test('12. Should create reservation', async () => {
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          client_id: 'client_rdv',
          date: '2024-03-15',
          heure: '14:00',
          service_name: 'Coupe homme'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.statut).toBe('confirme');
      expect(res.body.data.source).toBe('api');
    });

    test('13. Should validate client exists when creating reservation', async () => {
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          client_id: 'nonexistent_client',
          date: '2024-03-15',
          heure: '14:00'
        })
        .expect(400);

      expect(res.body.error).toBe('validation_error');
    });

    test('14. Should cancel reservation (soft delete)', async () => {
      stores.rendezvous.push({
        id: 'rdv_cancel',
        tenant_id: TEST_TENANT_ID,
        client_id: 'client_rdv',
        date: '2024-03-15',
        heure: '10:00',
        statut: 'confirme'
      });

      const res = await request(app)
        .delete('/api/v1/reservations/rdv_cancel')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.statut).toBe('annule');
    });
  });

  // ============================================
  // SERVICES TESTS (2 tests)
  // ============================================

  describe('Services', () => {
    beforeEach(() => {
      setupApiKey();
    });

    test('15. Should list active services', async () => {
      stores.services.push(
        { id: 'svc_1', tenant_id: TEST_TENANT_ID, name: 'Coupe homme', is_active: true, ordre: 1 },
        { id: 'svc_2', tenant_id: TEST_TENANT_ID, name: 'Coupe femme', is_active: true, ordre: 2 }
      );

      const res = await request(app)
        .get('/api/v1/services')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    test('16. Should reject without read:services scope', async () => {
      resetStores();
      stores.api_keys.push({
        id: 'key_limited',
        tenant_id: TEST_TENANT_ID,
        key_hash: 'hashed_key',
        key_prefix: TEST_KEY_PREFIX,
        scopes: ['read:clients'], // No read:services
        is_active: true,
        rate_limit_per_hour: 1000
      });

      const res = await request(app)
        .get('/api/v1/services')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(403);

      expect(res.body.error).toBe('insufficient_permissions');
    });
  });

  // ============================================
  // WEBHOOKS TESTS (3 tests)
  // ============================================

  describe('Webhooks', () => {
    beforeEach(() => {
      setupApiKey();
    });

    test('17. Should list webhooks', async () => {
      stores.webhooks.push({
        id: 'webhook_1',
        tenant_id: TEST_TENANT_ID,
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['client.created'],
        is_active: true
      });

      const res = await request(app)
        .get('/api/v1/webhooks')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    test('18. Should create webhook', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          name: 'New Webhook',
          url: 'https://myserver.com/hook',
          events: ['client.created', 'reservation.created']
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.secret).toBeDefined();
      expect(res.body.message).toContain('Save the secret');
    });

    test('19. Should validate URL format for webhook', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          name: 'Invalid Webhook',
          url: 'not-a-valid-url',
          events: ['client.created']
        })
        .expect(400);

      expect(res.body.error).toBe('validation_error');
    });
  });

  // ============================================
  // API INFO TESTS (1 test)
  // ============================================

  describe('API Info', () => {
    beforeEach(() => {
      setupApiKey();
    });

    test('20. Should list available events', async () => {
      const res = await request(app)
        .get('/api/v1/events')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data['client.created']).toBeDefined();
      expect(res.body.data['reservation.created']).toBeDefined();
    });
  });
});
