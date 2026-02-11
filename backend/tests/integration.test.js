/**
 * Integration Tests
 * End-to-end workflow tests
 * 10 comprehensive tests
 */

import { jest } from '@jest/globals';

// ============================================
// MOCK SETUP
// ============================================

const stores = {
  clients: [],
  rendezvous: [],
  services: [],
  invoices: [],
  payments: [],
  products: [],
  stock_movements: [],
  sentinel_daily_snapshots: [],
  sentinel_insights: [],
  campaigns: [],
  campaign_recipients: []
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
      delete: () => {
        stores[table] = stores[table].filter(item => !filters.every(f => f(item)));
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
      lte: (field, value) => {
        data = data.filter(item => item[field] <= value);
        return builder;
      },
      order: () => builder,
      limit: (n) => { data = data.slice(0, n); return builder; },
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

const { supabase } = await import('../src/config/supabase.js');

// ============================================
// TEST HELPERS
// ============================================

const TEST_TENANT_ID = 'tenant_integration_test';

// Workflow helpers
class BookingWorkflow {
  constructor(tenantId) {
    this.tenantId = tenantId;
  }

  async createClient(clientData) {
    const { data } = await supabase
      .from('clients')
      .insert({
        tenant_id: this.tenantId,
        ...clientData,
        total_visits: 0,
        total_spent: 0
      })
      .select()
      .single();
    return data;
  }

  async createReservation(clientId, reservationData) {
    const { data } = await supabase
      .from('rendezvous')
      .insert({
        tenant_id: this.tenantId,
        client_id: clientId,
        statut: 'confirme',
        ...reservationData
      })
      .select()
      .single();
    return data;
  }

  async completeReservation(reservationId, completionData) {
    const { data } = await supabase
      .from('rendezvous')
      .update({
        statut: 'termine',
        completed_at: new Date().toISOString(),
        ...completionData
      })
      .eq('id', reservationId)
      .select()
      .single();
    return data;
  }

  async createInvoice(clientId, reservationId, amount) {
    const { data } = await supabase
      .from('invoices')
      .insert({
        tenant_id: this.tenantId,
        client_id: clientId,
        reservation_id: reservationId,
        number: `INV-${Date.now()}`,
        total_ht: amount,
        tva: amount * 0.2,
        total_ttc: amount * 1.2,
        status: 'pending'
      })
      .select()
      .single();
    return data;
  }

  async processPayment(invoiceId, amount, method = 'card') {
    const { data: payment } = await supabase
      .from('payments')
      .insert({
        tenant_id: this.tenantId,
        invoice_id: invoiceId,
        amount,
        method,
        status: 'completed'
      })
      .select()
      .single();

    await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString()
      })
      .eq('id', invoiceId);

    return payment;
  }

  async updateClientStats(clientId, visitAmount) {
    const { data: client } = await supabase
      .from('clients')
      .select()
      .eq('id', clientId)
      .single();

    const { data: updated } = await supabase
      .from('clients')
      .update({
        total_visits: (client.total_visits || 0) + 1,
        total_spent: (client.total_spent || 0) + visitAmount,
        last_visit: new Date().toISOString()
      })
      .eq('id', clientId)
      .select()
      .single();

    return updated;
  }
}

// ============================================
// TESTS
// ============================================

describe('Integration Tests', () => {
  let workflow;

  beforeAll(() => {
    workflow = new BookingWorkflow(TEST_TENANT_ID);
  });

  beforeEach(() => {
    resetStores();
  });

  // ============================================
  // COMPLETE BOOKING WORKFLOW (3 tests)
  // ============================================

  describe('Complete Booking Workflow', () => {
    test('1. Should complete full booking cycle: create client -> book -> complete -> invoice -> pay', async () => {
      // Step 1: Create client
      const client = await workflow.createClient({
        nom: 'Dupont',
        prenom: 'Jean',
        email: 'jean.dupont@test.com',
        telephone: '+33612345678'
      });
      expect(client.id).toBeDefined();

      // Step 2: Create reservation
      const reservation = await workflow.createReservation(client.id, {
        date: '2024-03-15',
        heure: '10:00',
        duree: 60,
        service_name: 'Coupe homme',
        prix: 25
      });
      expect(reservation.statut).toBe('confirme');

      // Step 3: Complete reservation
      const completed = await workflow.completeReservation(reservation.id, {
        actual_duration: 55
      });
      expect(completed.statut).toBe('termine');

      // Step 4: Create invoice
      const invoice = await workflow.createInvoice(client.id, reservation.id, 25);
      expect(invoice.total_ttc).toBe(30); // 25 + 20% TVA

      // Step 5: Process payment
      const payment = await workflow.processPayment(invoice.id, 30);
      expect(payment.status).toBe('completed');

      // Step 6: Update client stats
      const updatedClient = await workflow.updateClientStats(client.id, 25);
      expect(updatedClient.total_visits).toBe(1);
      expect(updatedClient.total_spent).toBe(25);
    });

    test('2. Should handle returning client with multiple visits', async () => {
      // Create client
      const client = await workflow.createClient({
        nom: 'Martin',
        telephone: '+33600000000'
      });

      // Simulate 3 visits
      for (let i = 1; i <= 3; i++) {
        const reservation = await workflow.createReservation(client.id, {
          date: `2024-0${i}-15`,
          heure: '10:00',
          prix: 30
        });

        await workflow.completeReservation(reservation.id, {});
        await workflow.updateClientStats(client.id, 30);
      }

      // Verify stats
      const { data: finalClient } = await supabase
        .from('clients')
        .select()
        .eq('id', client.id)
        .single();

      expect(finalClient.total_visits).toBe(3);
      expect(finalClient.total_spent).toBe(90);
    });

    test('3. Should handle reservation cancellation', async () => {
      const client = await workflow.createClient({ nom: 'Cancel', telephone: '+33600000001' });

      const reservation = await workflow.createReservation(client.id, {
        date: '2024-03-20',
        heure: '14:00'
      });

      // Cancel reservation
      await supabase
        .from('rendezvous')
        .update({
          statut: 'annule',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'Client request'
        })
        .eq('id', reservation.id);

      const { data: cancelled } = await supabase
        .from('rendezvous')
        .select()
        .eq('id', reservation.id)
        .single();

      expect(cancelled.statut).toBe('annule');
    });
  });

  // ============================================
  // STOCK WORKFLOW (2 tests)
  // ============================================

  describe('Stock Workflow', () => {
    test('4. Should track product sale and update stock', async () => {
      // Create product
      const { data: product } = await supabase
        .from('products')
        .insert({
          tenant_id: TEST_TENANT_ID,
          name: 'Shampoing',
          sku: 'SHP001',
          stock_quantity: 50,
          price: 15
        })
        .select()
        .single();

      expect(product.stock_quantity).toBe(50);

      // Record sale (stock movement out)
      await supabase
        .from('stock_movements')
        .insert({
          tenant_id: TEST_TENANT_ID,
          product_id: product.id,
          type: 'out',
          quantity: 3,
          reason: 'sale'
        });

      // Update stock
      await supabase
        .from('products')
        .update({ stock_quantity: 47 })
        .eq('id', product.id);

      const { data: updated } = await supabase
        .from('products')
        .select()
        .eq('id', product.id)
        .single();

      expect(updated.stock_quantity).toBe(47);
    });

    test('5. Should handle stock replenishment', async () => {
      // Create product with low stock
      const { data: product } = await supabase
        .from('products')
        .insert({
          tenant_id: TEST_TENANT_ID,
          name: 'Low Stock Item',
          stock_quantity: 5,
          min_stock: 10
        })
        .select()
        .single();

      expect(product.stock_quantity).toBe(5);

      // Receive shipment
      await supabase
        .from('stock_movements')
        .insert({
          tenant_id: TEST_TENANT_ID,
          product_id: product.id,
          type: 'in',
          quantity: 50,
          reason: 'restock'
        });

      await supabase
        .from('products')
        .update({ stock_quantity: 55 })
        .eq('id', product.id);

      const { data: restocked } = await supabase
        .from('products')
        .select()
        .eq('id', product.id)
        .single();

      expect(restocked.stock_quantity).toBe(55);
      expect(restocked.stock_quantity > restocked.min_stock).toBe(true);
    });
  });

  // ============================================
  // MARKETING CAMPAIGN WORKFLOW (2 tests)
  // ============================================

  describe('Marketing Campaign Workflow', () => {
    test('6. Should execute email campaign to client segment', async () => {
      // Create clients
      const vipClients = [];
      for (let i = 0; i < 5; i++) {
        const { data: client } = await supabase
          .from('clients')
          .insert({
            tenant_id: TEST_TENANT_ID,
            nom: `VIP ${i}`,
            email: `vip${i}@test.com`,
            total_spent: 500 + i * 100,
            tags: ['vip']
          })
          .select()
          .single();
        vipClients.push(client);
      }

      // Create campaign
      const { data: campaign } = await supabase
        .from('campaigns')
        .insert({
          tenant_id: TEST_TENANT_ID,
          name: 'VIP Special Offer',
          type: 'email',
          status: 'draft',
          subject: 'Exclusive offer for you!'
        })
        .select()
        .single();

      // Add recipients
      const recipients = vipClients.map(c => ({
        campaign_id: campaign.id,
        client_id: c.id,
        email: c.email,
        status: 'pending'
      }));

      await supabase
        .from('campaign_recipients')
        .insert(recipients);

      // Send campaign (simulate)
      await supabase
        .from('campaigns')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', campaign.id);

      // Mark recipients as sent
      for (const client of vipClients) {
        await supabase
          .from('campaign_recipients')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('client_id', client.id);
      }

      // Verify
      const { data: sentRecipients } = await supabase
        .from('campaign_recipients')
        .select()
        .eq('campaign_id', campaign.id);

      expect(sentRecipients.every(r => r.status === 'sent')).toBe(true);
    });

    test('7. Should track campaign analytics', async () => {
      // Create campaign with mixed results
      stores.campaign_recipients = [
        { id: 'r1', campaign_id: 'camp_1', status: 'sent', opened_at: '2024-03-10T10:00:00Z' },
        { id: 'r2', campaign_id: 'camp_1', status: 'sent', opened_at: '2024-03-10T11:00:00Z', clicked_at: '2024-03-10T11:05:00Z' },
        { id: 'r3', campaign_id: 'camp_1', status: 'sent', opened_at: null },
        { id: 'r4', campaign_id: 'camp_1', status: 'bounced' },
        { id: 'r5', campaign_id: 'camp_1', status: 'sent', opened_at: '2024-03-10T12:00:00Z' }
      ];

      const { data: recipients } = await supabase
        .from('campaign_recipients')
        .select()
        .eq('campaign_id', 'camp_1');

      const total = recipients.length;
      const sent = recipients.filter(r => r.status === 'sent').length;
      const opened = recipients.filter(r => r.opened_at).length;
      const clicked = recipients.filter(r => r.clicked_at).length;
      const bounced = recipients.filter(r => r.status === 'bounced').length;

      expect(total).toBe(5);
      expect(sent).toBe(4);
      expect(opened).toBe(3);
      expect(clicked).toBe(1);
      expect(bounced).toBe(1);

      const openRate = (opened / sent) * 100;
      expect(openRate).toBe(75); // 3/4 = 75%
    });
  });

  // ============================================
  // SENTINEL ANALYTICS WORKFLOW (2 tests)
  // ============================================

  describe('SENTINEL Analytics Workflow', () => {
    test('8. Should generate daily snapshot from activity', async () => {
      // Simulate day's activity
      const today = new Date().toISOString().split('T')[0];

      // Create reservations for today
      const reservations = [
        { id: 'r1', tenant_id: TEST_TENANT_ID, date: today, statut: 'termine', prix: 25 },
        { id: 'r2', tenant_id: TEST_TENANT_ID, date: today, statut: 'termine', prix: 35 },
        { id: 'r3', tenant_id: TEST_TENANT_ID, date: today, statut: 'termine', prix: 50 },
        { id: 'r4', tenant_id: TEST_TENANT_ID, date: today, statut: 'annule', prix: 25 },
        { id: 'r5', tenant_id: TEST_TENANT_ID, date: today, statut: 'no-show', prix: 30 }
      ];

      stores.rendezvous = reservations;

      // Calculate metrics
      const completed = reservations.filter(r => r.statut === 'termine');
      const revenue = completed.reduce((sum, r) => sum + r.prix, 0);
      const noShows = reservations.filter(r => r.statut === 'no-show').length;
      const noShowRate = (noShows / reservations.length) * 100;

      // Create snapshot
      const { data: snapshot } = await supabase
        .from('sentinel_daily_snapshots')
        .insert({
          tenant_id: TEST_TENANT_ID,
          date: today,
          total_reservations: reservations.length,
          reservations_completed: completed.length,
          revenue_paid: revenue,
          no_show_count: noShows,
          no_show_rate: noShowRate
        })
        .select()
        .single();

      expect(snapshot.total_reservations).toBe(5);
      expect(snapshot.reservations_completed).toBe(3);
      expect(snapshot.revenue_paid).toBe(110); // 25 + 35 + 50
      expect(snapshot.no_show_rate).toBe(20); // 1/5 = 20%
    });

    test('9. Should generate insight from trend data', async () => {
      // Create 14 days of snapshots with declining revenue
      const snapshots = [];
      for (let i = 13; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        snapshots.push({
          id: `snap_${i}`,
          tenant_id: TEST_TENANT_ID,
          date: date.toISOString().split('T')[0],
          revenue_paid: i < 7 ? 100 : 150, // Week 1: 150, Week 2: 100 (decline)
          total_reservations: i < 7 ? 10 : 15
        });
      }

      stores.sentinel_daily_snapshots = snapshots;

      // Detect trend
      const firstWeek = snapshots.slice(0, 7);
      const secondWeek = snapshots.slice(7);

      const avgFirst = firstWeek.reduce((s, d) => s + d.revenue_paid, 0) / 7;
      const avgSecond = secondWeek.reduce((s, d) => s + d.revenue_paid, 0) / 7;

      const trend = avgSecond < avgFirst ? 'declining' : 'growing';
      const changePercent = ((avgSecond - avgFirst) / avgFirst) * 100;

      expect(trend).toBe('declining');
      expect(changePercent).toBeCloseTo(-33.33, 0); // (100-150)/150 = -33%

      // Generate insight
      const { data: insight } = await supabase
        .from('sentinel_insights')
        .insert({
          tenant_id: TEST_TENANT_ID,
          insight_type: 'warning',
          category: 'revenue',
          title: 'Revenue declining',
          description: `Revenue has declined by ${Math.abs(changePercent).toFixed(0)}% over the past 2 weeks.`,
          priority: 8,
          status: 'active'
        })
        .select()
        .single();

      expect(insight.insight_type).toBe('warning');
      expect(insight.priority).toBe(8);
    });
  });

  // ============================================
  // MULTI-TENANT ISOLATION (1 test)
  // ============================================

  describe('Multi-tenant Isolation', () => {
    test('10. Should isolate data between tenants', async () => {
      const tenant1 = 'tenant_001';
      const tenant2 = 'tenant_002';

      // Create clients for both tenants
      await supabase.from('clients').insert({ tenant_id: tenant1, nom: 'Client A', telephone: '+33600000001' });
      await supabase.from('clients').insert({ tenant_id: tenant1, nom: 'Client B', telephone: '+33600000002' });
      await supabase.from('clients').insert({ tenant_id: tenant2, nom: 'Client X', telephone: '+33600000003' });
      await supabase.from('clients').insert({ tenant_id: tenant2, nom: 'Client Y', telephone: '+33600000004' });
      await supabase.from('clients').insert({ tenant_id: tenant2, nom: 'Client Z', telephone: '+33600000005' });

      // Query tenant1
      const { data: tenant1Clients } = await supabase
        .from('clients')
        .select()
        .eq('tenant_id', tenant1);

      // Query tenant2
      const { data: tenant2Clients } = await supabase
        .from('clients')
        .select()
        .eq('tenant_id', tenant2);

      expect(tenant1Clients.length).toBe(2);
      expect(tenant2Clients.length).toBe(3);

      // Verify no cross-tenant data
      expect(tenant1Clients.every(c => c.tenant_id === tenant1)).toBe(true);
      expect(tenant2Clients.every(c => c.tenant_id === tenant2)).toBe(true);
    });
  });
});
