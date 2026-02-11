/**
 * Jest Test Setup
 * Global mocks and test utilities
 */

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.NODE_ENV = 'test';

// Global test utilities
global.testUtils = {
  // Generate mock tenant ID
  generateTenantId: () => `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

  // Generate mock user
  generateUser: (overrides = {}) => ({
    id: `user_${Date.now()}`,
    tenant_id: global.testUtils.generateTenantId(),
    email: 'test@example.com',
    role: 'admin',
    plan: 'business',
    ...overrides
  }),

  // Generate mock client
  generateClient: (tenantId, overrides = {}) => ({
    id: `client_${Date.now()}`,
    tenant_id: tenantId,
    nom: 'Dupont',
    prenom: 'Jean',
    email: 'jean.dupont@example.com',
    telephone: '+33612345678',
    created_at: new Date().toISOString(),
    ...overrides
  }),

  // Generate mock reservation
  generateReservation: (tenantId, clientId, overrides = {}) => ({
    id: `rdv_${Date.now()}`,
    tenant_id: tenantId,
    client_id: clientId,
    date: '2024-03-15',
    heure: '10:00',
    duree: 60,
    statut: 'confirme',
    service_name: 'Coupe homme',
    created_at: new Date().toISOString(),
    ...overrides
  }),

  // Generate mock API key
  generateApiKey: (tenantId, overrides = {}) => ({
    id: `key_${Date.now()}`,
    tenant_id: tenantId,
    name: 'Test API Key',
    key_prefix: 'nxs_prod_abc',
    scopes: ['read:clients', 'read:reservations'],
    rate_limit_per_hour: 1000,
    is_active: true,
    ...overrides
  }),

  // Generate mock snapshot
  generateSnapshot: (tenantId, date, overrides = {}) => ({
    id: `snap_${Date.now()}`,
    tenant_id: tenantId,
    date,
    total_clients: 100,
    new_clients: 5,
    total_reservations: 25,
    revenue_paid: 1500,
    no_show_rate: 5.5,
    ...overrides
  }),

  // Sleep utility
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// Suppress console logs during tests (optional)
if (process.env.SUPPRESS_LOGS === 'true') {
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  };
}
