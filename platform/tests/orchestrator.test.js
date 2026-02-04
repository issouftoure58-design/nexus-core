import { describe, test, expect, beforeAll } from '@jest/globals';
import { orchestrator } from '../core/orchestrator.js';

beforeAll(async () => {
  await orchestrator.initialize();
});

// ════════════════════════════════════════════════
// REGISTRY
// ════════════════════════════════════════════════
describe('Registry', () => {
  test('Registry chargé', () => {
    expect(orchestrator.registry).toBeDefined();
    expect(orchestrator.registry.tenants.length).toBeGreaterThan(0);
  });

  test('Platform info présente', () => {
    expect(orchestrator.registry.platform.name).toBe('NEXUS');
    expect(orchestrator.registry.platform.version).toBe('1.0.0');
  });
});

// ════════════════════════════════════════════════
// TENANT 1 — FAT'S HAIR
// ════════════════════════════════════════════════
describe("Tenant 1 — Fat's Hair", () => {
  test('Tenant 1 chargé', () => {
    const tenant = orchestrator.getTenant(1);
    expect(tenant).toBeDefined();
    expect(tenant.config.name).toBe("Fat's Hair-Afro");
  });

  test('Tenant 1 est frozen', () => {
    expect(orchestrator.isFrozen(1)).toBe(true);
  });

  test('Tenant 1 a feature reservations', () => {
    expect(orchestrator.hasFeature(1, 'reservations')).toBe(true);
    expect(orchestrator.hasFeature(1, 'reservations_telephone')).toBe(true);
    expect(orchestrator.hasFeature(1, 'sms_confirmation')).toBe(true);
    expect(orchestrator.hasFeature(1, 'services_variables')).toBe(true);
  });

  test("Tenant 1 n'a PAS feature accounting", () => {
    expect(orchestrator.hasFeature(1, 'accounting')).toBe(false);
    expect(orchestrator.hasFeature(1, 'marketing')).toBe(false);
    expect(orchestrator.hasFeature(1, 'rh')).toBe(false);
    expect(orchestrator.hasFeature(1, 'seo')).toBe(false);
  });
});

// ════════════════════════════════════════════════
// IDENTIFICATION TENANT
// ════════════════════════════════════════════════
describe('Identification Tenant', () => {
  test('identifyTenant depuis header', () => {
    const req = { headers: { 'x-tenant-id': '1' }, body: {} };
    expect(orchestrator.identifyTenant(req)).toBe(1);
  });

  test('identifyTenant depuis body', () => {
    const req = { headers: {}, body: { tenant_id: 1 } };
    expect(orchestrator.identifyTenant(req)).toBe(1);
  });

  test('identifyTenant depuis domaine', () => {
    const req = { headers: { host: 'fatshairafro.fr' }, body: {} };
    expect(orchestrator.identifyTenant(req)).toBe(1);
  });

  test('identifyTenant défaut = 1', () => {
    const req = { headers: {}, body: {} };
    expect(orchestrator.identifyTenant(req)).toBe(1);
  });
});

// ════════════════════════════════════════════════
// METRICS
// ════════════════════════════════════════════════
describe('Global Metrics', () => {
  test('Metrics globales', () => {
    const metrics = orchestrator.getGlobalMetrics();
    expect(metrics.totalTenants).toBeGreaterThan(0);
    expect(metrics.activeTenants).toBe(1);
    expect(metrics.tenants).toBeDefined();
    expect(Array.isArray(metrics.tenants)).toBe(true);
  });
});
