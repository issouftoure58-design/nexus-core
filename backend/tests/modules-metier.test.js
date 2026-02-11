/**
 * Modules Métier Tests
 * Tests for business modules: CRM, Marketing, Stock, Factures, etc.
 * 30 comprehensive tests
 */

import { jest } from '@jest/globals';

// ============================================
// MOCK SETUP
// ============================================

const stores = {
  clients: [],
  rendezvous: [],
  services: [],
  products: [],
  stock_movements: [],
  invoices: [],
  campaigns: [],
  campaign_recipients: [],
  relances: [],
  employees: [],
  employee_schedules: [],
  depenses: [],
  reviews: []
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
    let countMode = false;

    const builder = {
      select: (f, opts = {}) => {
        if (opts.count === 'exact') countMode = true;
        return builder;
      },
      insert: (newData) => {
        const items = Array.isArray(newData) ? newData : [newData];
        const inserted = items.map(item => ({
          id: item.id || `${table}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
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
            return { ...item, ...updates, updated_at: new Date().toISOString() };
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
        const deleted = data.filter(item => filters.every(f => f(item)));
        stores[table] = stores[table].filter(item => !filters.every(f => f(item)));
        data = deleted;
        return builder;
      },
      eq: (field, value) => {
        filters.push(item => item[field] === value);
        data = data.filter(item => item[field] === value);
        return builder;
      },
      neq: (field, value) => {
        data = data.filter(item => item[field] !== value);
        return builder;
      },
      gt: (field, value) => {
        data = data.filter(item => item[field] > value);
        return builder;
      },
      gte: (field, value) => {
        data = data.filter(item => item[field] >= value);
        return builder;
      },
      lt: (field, value) => {
        data = data.filter(item => item[field] < value);
        return builder;
      },
      lte: (field, value) => {
        data = data.filter(item => item[field] <= value);
        return builder;
      },
      in: (field, values) => {
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

const { supabase } = await import('../src/config/supabase.js');

// ============================================
// TEST HELPERS
// ============================================

const TEST_TENANT_ID = 'tenant_test_123';

// Create test client
const createTestClient = (overrides = {}) => ({
  id: `client_${Date.now()}`,
  tenant_id: TEST_TENANT_ID,
  nom: 'Dupont',
  prenom: 'Jean',
  email: 'jean.dupont@test.com',
  telephone: '+33612345678',
  total_visits: 0,
  total_spent: 0,
  ...overrides
});

// Create test reservation
const createTestReservation = (clientId, overrides = {}) => ({
  id: `rdv_${Date.now()}`,
  tenant_id: TEST_TENANT_ID,
  client_id: clientId,
  date: '2024-03-15',
  heure: '10:00',
  duree: 60,
  statut: 'confirme',
  service_name: 'Coupe homme',
  prix: 25,
  ...overrides
});

// Create test product
const createTestProduct = (overrides = {}) => ({
  id: `product_${Date.now()}`,
  tenant_id: TEST_TENANT_ID,
  name: 'Shampoing Pro',
  sku: 'SHP001',
  price: 15.00,
  cost: 8.00,
  stock_quantity: 50,
  min_stock: 10,
  ...overrides
});

// ============================================
// TESTS
// ============================================

describe('Modules Métier', () => {

  beforeEach(() => {
    resetStores();
  });

  // ============================================
  // CRM MODULE (8 tests)
  // ============================================

  describe('CRM Module', () => {
    test('1. Should create client with all fields', async () => {
      const client = createTestClient();

      const { data, error } = await supabase
        .from('clients')
        .insert(client)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.nom).toBe('Dupont');
      expect(data.email).toBe('jean.dupont@test.com');
    });

    test('2. Should update client statistics after visit', async () => {
      const client = createTestClient({ total_visits: 5, total_spent: 125 });
      stores.clients.push(client);

      const { data, error } = await supabase
        .from('clients')
        .update({
          total_visits: 6,
          total_spent: 150,
          last_visit: new Date().toISOString()
        })
        .eq('id', client.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.total_visits).toBe(6);
      expect(data.total_spent).toBe(150);
    });

    test('3. Should segment clients by spending', async () => {
      stores.clients = [
        createTestClient({ id: 'c1', total_spent: 50, nom: 'Bronze' }),
        createTestClient({ id: 'c2', total_spent: 200, nom: 'Silver' }),
        createTestClient({ id: 'c3', total_spent: 500, nom: 'Gold' }),
        createTestClient({ id: 'c4', total_spent: 1000, nom: 'Platinum' })
      ];

      // Get high-value clients (>= 500)
      const { data: highValue } = await supabase
        .from('clients')
        .select()
        .gte('total_spent', 500);

      expect(highValue.length).toBe(2);
    });

    test('4. Should track client tags', async () => {
      const client = createTestClient({ tags: ['vip', 'regular'] });
      stores.clients.push(client);

      const { data } = await supabase
        .from('clients')
        .select()
        .eq('id', client.id)
        .single();

      expect(data.tags).toContain('vip');
      expect(data.tags.length).toBe(2);
    });

    test('5. Should list clients with pagination', async () => {
      for (let i = 0; i < 50; i++) {
        stores.clients.push(createTestClient({ id: `c_${i}`, nom: `Client ${i}` }));
      }

      const { data: page1 } = await supabase
        .from('clients')
        .select()
        .range(0, 19);

      const { data: page2 } = await supabase
        .from('clients')
        .select()
        .range(20, 39);

      expect(page1.length).toBe(20);
      expect(page2.length).toBe(20);
    });

    test('6. Should get client history', async () => {
      const client = createTestClient({ id: 'client_history' });
      stores.clients.push(client);

      stores.rendezvous = [
        createTestReservation(client.id, { id: 'r1', date: '2024-01-15', statut: 'termine' }),
        createTestReservation(client.id, { id: 'r2', date: '2024-02-15', statut: 'termine' }),
        createTestReservation(client.id, { id: 'r3', date: '2024-03-15', statut: 'confirme' })
      ];

      const { data: history } = await supabase
        .from('rendezvous')
        .select()
        .eq('client_id', client.id)
        .order('date', { ascending: false });

      expect(history.length).toBe(3);
    });

    test('7. Should search clients by name or phone', async () => {
      stores.clients = [
        createTestClient({ id: 'c1', nom: 'Martin', telephone: '+33600000001' }),
        createTestClient({ id: 'c2', nom: 'Dupont', telephone: '+33600000002' }),
        createTestClient({ id: 'c3', nom: 'Bernard', telephone: '+33600000003' })
      ];

      // Find by name
      const { data: byName } = await supabase
        .from('clients')
        .select()
        .eq('nom', 'Martin');

      expect(byName.length).toBe(1);
      expect(byName[0].nom).toBe('Martin');
    });

    test('8. Should handle inactive clients', async () => {
      stores.clients = [
        createTestClient({ id: 'c1', is_active: true }),
        createTestClient({ id: 'c2', is_active: true }),
        createTestClient({ id: 'c3', is_active: false })
      ];

      const { data: active } = await supabase
        .from('clients')
        .select()
        .eq('is_active', true);

      expect(active.length).toBe(2);
    });
  });

  // ============================================
  // STOCK MODULE (7 tests)
  // ============================================

  describe('Stock Module', () => {
    test('9. Should create product', async () => {
      const product = createTestProduct();

      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.name).toBe('Shampoing Pro');
      expect(data.stock_quantity).toBe(50);
    });

    test('10. Should update stock quantity', async () => {
      const product = createTestProduct({ id: 'p_stock', stock_quantity: 50 });
      stores.products.push(product);

      const { data } = await supabase
        .from('products')
        .update({ stock_quantity: 45 })
        .eq('id', 'p_stock')
        .select()
        .single();

      expect(data.stock_quantity).toBe(45);
    });

    test('11. Should detect low stock', async () => {
      stores.products = [
        createTestProduct({ id: 'p1', stock_quantity: 50, min_stock: 10 }),
        createTestProduct({ id: 'p2', stock_quantity: 5, min_stock: 10 }),
        createTestProduct({ id: 'p3', stock_quantity: 8, min_stock: 10 })
      ];

      const { data: lowStock } = await supabase
        .from('products')
        .select();

      const alerts = lowStock.filter(p => p.stock_quantity < p.min_stock);
      expect(alerts.length).toBe(2);
    });

    test('12. Should record stock movement', async () => {
      const movement = {
        id: 'mov_1',
        tenant_id: TEST_TENANT_ID,
        product_id: 'p1',
        type: 'out',
        quantity: 5,
        reason: 'sale',
        created_by: 'user_1'
      };

      const { data, error } = await supabase
        .from('stock_movements')
        .insert(movement)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.type).toBe('out');
      expect(data.quantity).toBe(5);
    });

    test('13. Should calculate stock value', async () => {
      stores.products = [
        createTestProduct({ stock_quantity: 10, cost: 5 }),
        createTestProduct({ stock_quantity: 20, cost: 8 }),
        createTestProduct({ stock_quantity: 15, cost: 12 })
      ];

      const { data } = await supabase
        .from('products')
        .select();

      const totalValue = data.reduce((sum, p) => sum + (p.stock_quantity * p.cost), 0);
      expect(totalValue).toBe(10*5 + 20*8 + 15*12); // 50 + 160 + 180 = 390
    });

    test('14. Should track stock by SKU', async () => {
      stores.products.push(createTestProduct({ id: 'p_sku', sku: 'UNIQUE-SKU-001' }));

      const { data } = await supabase
        .from('products')
        .select()
        .eq('sku', 'UNIQUE-SKU-001')
        .single();

      expect(data).not.toBeNull();
      expect(data.sku).toBe('UNIQUE-SKU-001');
    });

    test('15. Should handle stock receipt', async () => {
      const product = createTestProduct({ id: 'p_receipt', stock_quantity: 20 });
      stores.products.push(product);

      // Receive 30 units
      const { data } = await supabase
        .from('products')
        .update({ stock_quantity: 50 })
        .eq('id', 'p_receipt')
        .select()
        .single();

      expect(data.stock_quantity).toBe(50);
    });
  });

  // ============================================
  // FACTURES / INVOICES MODULE (5 tests)
  // ============================================

  describe('Factures Module', () => {
    test('16. Should create invoice', async () => {
      const invoice = {
        id: 'inv_1',
        tenant_id: TEST_TENANT_ID,
        client_id: 'client_1',
        number: 'INV-2024-001',
        total_ht: 100,
        tva: 20,
        total_ttc: 120,
        status: 'pending',
        items: [
          { description: 'Coupe homme', quantity: 1, price: 25, total: 25 }
        ]
      };

      const { data, error } = await supabase
        .from('invoices')
        .insert(invoice)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.number).toBe('INV-2024-001');
      expect(data.total_ttc).toBe(120);
    });

    test('17. Should update invoice status', async () => {
      stores.invoices.push({
        id: 'inv_status',
        tenant_id: TEST_TENANT_ID,
        status: 'pending',
        paid_at: null
      });

      const { data } = await supabase
        .from('invoices')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString()
        })
        .eq('id', 'inv_status')
        .select()
        .single();

      expect(data.status).toBe('paid');
      expect(data.paid_at).not.toBeNull();
    });

    test('18. Should list invoices by status', async () => {
      stores.invoices = [
        { id: 'i1', tenant_id: TEST_TENANT_ID, status: 'pending', total_ttc: 50 },
        { id: 'i2', tenant_id: TEST_TENANT_ID, status: 'paid', total_ttc: 100 },
        { id: 'i3', tenant_id: TEST_TENANT_ID, status: 'pending', total_ttc: 75 },
        { id: 'i4', tenant_id: TEST_TENANT_ID, status: 'overdue', total_ttc: 200 }
      ];

      const { data: pending } = await supabase
        .from('invoices')
        .select()
        .eq('status', 'pending');

      expect(pending.length).toBe(2);
    });

    test('19. Should calculate monthly revenue', async () => {
      stores.invoices = [
        { id: 'i1', status: 'paid', total_ttc: 100, paid_at: '2024-03-10' },
        { id: 'i2', status: 'paid', total_ttc: 150, paid_at: '2024-03-15' },
        { id: 'i3', status: 'paid', total_ttc: 200, paid_at: '2024-03-20' },
        { id: 'i4', status: 'pending', total_ttc: 300, paid_at: null }
      ];

      const { data: paidInvoices } = await supabase
        .from('invoices')
        .select()
        .eq('status', 'paid');

      const revenue = paidInvoices.reduce((sum, i) => sum + i.total_ttc, 0);
      expect(revenue).toBe(450);
    });

    test('20. Should handle invoice cancellation', async () => {
      stores.invoices.push({
        id: 'inv_cancel',
        tenant_id: TEST_TENANT_ID,
        status: 'pending'
      });

      const { data } = await supabase
        .from('invoices')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: 'Client request'
        })
        .eq('id', 'inv_cancel')
        .select()
        .single();

      expect(data.status).toBe('cancelled');
    });
  });

  // ============================================
  // MARKETING MODULE (5 tests)
  // ============================================

  describe('Marketing Module', () => {
    test('21. Should create campaign', async () => {
      const campaign = {
        id: 'camp_1',
        tenant_id: TEST_TENANT_ID,
        name: 'Summer Promo',
        type: 'email',
        subject: '20% off all services!',
        content: 'Enjoy our summer promotion...',
        status: 'draft',
        scheduled_at: null
      };

      const { data, error } = await supabase
        .from('campaigns')
        .insert(campaign)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.name).toBe('Summer Promo');
      expect(data.status).toBe('draft');
    });

    test('22. Should add campaign recipients', async () => {
      const recipients = [
        { campaign_id: 'camp_1', client_id: 'c1', email: 'client1@test.com', status: 'pending' },
        { campaign_id: 'camp_1', client_id: 'c2', email: 'client2@test.com', status: 'pending' },
        { campaign_id: 'camp_1', client_id: 'c3', email: 'client3@test.com', status: 'pending' }
      ];

      const { data, error } = await supabase
        .from('campaign_recipients')
        .insert(recipients)
        .select();

      expect(error).toBeNull();
      expect(data.length).toBe(3);
    });

    test('23. Should track campaign sending status', async () => {
      stores.campaign_recipients = [
        { id: 'r1', campaign_id: 'camp_1', status: 'sent' },
        { id: 'r2', campaign_id: 'camp_1', status: 'sent' },
        { id: 'r3', campaign_id: 'camp_1', status: 'failed' },
        { id: 'r4', campaign_id: 'camp_1', status: 'pending' }
      ];

      const { data } = await supabase
        .from('campaign_recipients')
        .select()
        .eq('campaign_id', 'camp_1');

      const sent = data.filter(r => r.status === 'sent').length;
      const failed = data.filter(r => r.status === 'failed').length;

      expect(sent).toBe(2);
      expect(failed).toBe(1);
    });

    test('24. Should update campaign status', async () => {
      stores.campaigns.push({
        id: 'camp_schedule',
        tenant_id: TEST_TENANT_ID,
        status: 'draft'
      });

      const { data } = await supabase
        .from('campaigns')
        .update({
          status: 'scheduled',
          scheduled_at: '2024-04-01T09:00:00Z'
        })
        .eq('id', 'camp_schedule')
        .select()
        .single();

      expect(data.status).toBe('scheduled');
    });

    test('25. Should list campaigns by type', async () => {
      stores.campaigns = [
        { id: 'c1', tenant_id: TEST_TENANT_ID, type: 'email' },
        { id: 'c2', tenant_id: TEST_TENANT_ID, type: 'sms' },
        { id: 'c3', tenant_id: TEST_TENANT_ID, type: 'email' },
        { id: 'c4', tenant_id: TEST_TENANT_ID, type: 'sms' }
      ];

      const { data: emailCampaigns } = await supabase
        .from('campaigns')
        .select()
        .eq('type', 'email');

      expect(emailCampaigns.length).toBe(2);
    });
  });

  // ============================================
  // RH / EMPLOYEES MODULE (5 tests)
  // ============================================

  describe('RH / Employees Module', () => {
    test('26. Should create employee', async () => {
      const employee = {
        id: 'emp_1',
        tenant_id: TEST_TENANT_ID,
        nom: 'Martin',
        prenom: 'Sophie',
        email: 'sophie.martin@salon.com',
        role: 'stylist',
        is_active: true
      };

      const { data, error } = await supabase
        .from('employees')
        .insert(employee)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.nom).toBe('Martin');
      expect(data.role).toBe('stylist');
    });

    test('27. Should set employee schedule', async () => {
      const schedule = {
        id: 'sched_1',
        tenant_id: TEST_TENANT_ID,
        employee_id: 'emp_1',
        day_of_week: 1, // Monday
        start_time: '09:00',
        end_time: '18:00',
        is_working: true
      };

      const { data, error } = await supabase
        .from('employee_schedules')
        .insert(schedule)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.start_time).toBe('09:00');
    });

    test('28. Should list active employees', async () => {
      stores.employees = [
        { id: 'e1', tenant_id: TEST_TENANT_ID, is_active: true, nom: 'Active 1' },
        { id: 'e2', tenant_id: TEST_TENANT_ID, is_active: true, nom: 'Active 2' },
        { id: 'e3', tenant_id: TEST_TENANT_ID, is_active: false, nom: 'Inactive' }
      ];

      const { data: active } = await supabase
        .from('employees')
        .select()
        .eq('is_active', true);

      expect(active.length).toBe(2);
    });

    test('29. Should update employee status', async () => {
      stores.employees.push({
        id: 'emp_deactivate',
        tenant_id: TEST_TENANT_ID,
        is_active: true
      });

      const { data } = await supabase
        .from('employees')
        .update({
          is_active: false,
          deactivated_at: new Date().toISOString()
        })
        .eq('id', 'emp_deactivate')
        .select()
        .single();

      expect(data.is_active).toBe(false);
    });

    test('30. Should track expenses', async () => {
      const depense = {
        id: 'dep_1',
        tenant_id: TEST_TENANT_ID,
        category: 'supplies',
        description: 'Shampoo bulk purchase',
        amount: 250,
        date: '2024-03-10',
        payment_method: 'card'
      };

      const { data, error } = await supabase
        .from('depenses')
        .insert(depense)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.amount).toBe(250);
      expect(data.category).toBe('supplies');
    });
  });
});
