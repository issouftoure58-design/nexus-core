import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getTenantConfig,
  isFrozen,
  hasFeature,
  canModify,
  identifyTenant,
  listTenants,
} from '../src/config/tenants/index.js';

// ════════════════════════════════════════════════
// FAT'S HAIR (tenant fatshairafro) — FROZEN PROD
// ════════════════════════════════════════════════
describe("Fat's Hair (fatshairafro) — Production", () => {
  test('Config existe et a un nom', () => {
    const config = getTenantConfig('fatshairafro');
    expect(config.name).toBe("Fat's Hair-Afro");
    expect(config.id).toBe('fatshairafro');
  });

  test('Est en mode frozen', () => {
    expect(isFrozen('fatshairafro')).toBe(true);
  });

  test('Features réservation activées', () => {
    expect(hasFeature('fatshairafro', 'reservations')).toBe(true);
    expect(hasFeature('fatshairafro', 'reservations_web')).toBe(true);
    expect(hasFeature('fatshairafro', 'reservations_telephone')).toBe(true);
    expect(hasFeature('fatshairafro', 'reservations_chat')).toBe(true);
    expect(hasFeature('fatshairafro', 'reservations_whatsapp')).toBe(true);
    expect(hasFeature('fatshairafro', 'reservations_admin')).toBe(true);
  });

  test('Features SMS activées', () => {
    expect(hasFeature('fatshairafro', 'sms_confirmation')).toBe(true);
    expect(hasFeature('fatshairafro', 'sms_rappel_j1')).toBe(true);
  });

  test('Services variables activés (Réparation Locks)', () => {
    expect(hasFeature('fatshairafro', 'services_variables')).toBe(true);
  });

  test('Nouveaux modules désactivés', () => {
    expect(hasFeature('fatshairafro', 'accounting')).toBe(false);
    expect(hasFeature('fatshairafro', 'commerce_catalogue')).toBe(false);
    expect(hasFeature('fatshairafro', 'commerce_stock')).toBe(false);
    expect(hasFeature('fatshairafro', 'marketing')).toBe(false);
    expect(hasFeature('fatshairafro', 'seo')).toBe(false);
    expect(hasFeature('fatshairafro', 'rh')).toBe(false);
  });

  test('Refuse modifications (frozen)', () => {
    expect(canModify('fatshairafro', 'test')).toBe(false);
  });

  test('Limites définies', () => {
    const config = getTenantConfig('fatshairafro');
    expect(config.limits.maxReservationsPerDay).toBe(20);
    expect(config.limits.maxSmsPerMonth).toBe(500);
    expect(config.limits.maxAiCallsPerDay).toBe(100);
  });
});

// ════════════════════════════════════════════════
// DECO EVENT (tenant decoevent) — DEV/TEST
// ════════════════════════════════════════════════
describe('Deco Event (decoevent) — Dev/Test', () => {
  test('Config existe', () => {
    const config = getTenantConfig('decoevent');
    expect(config.name).toBe('Deco Event');
    expect(config.id).toBe('decoevent');
  });

  test("N'est PAS frozen", () => {
    expect(isFrozen('decoevent')).toBe(false);
  });

  test('Peut recevoir nouveaux modules', () => {
    expect(hasFeature('decoevent', 'accounting')).toBe(true);
  });

  test('Accepte modifications', () => {
    expect(canModify('decoevent', 'test')).toBe(true);
  });

  test("N'a pas les features téléphone/SMS", () => {
    expect(hasFeature('decoevent', 'reservations_telephone')).toBe(false);
    expect(hasFeature('decoevent', 'sms_confirmation')).toBe(false);
    expect(hasFeature('decoevent', 'assistant_telephone')).toBe(false);
  });
});

// ════════════════════════════════════════════════
// IDENTIFICATION TENANT
// ════════════════════════════════════════════════
describe('Identification Tenant', () => {
  test('Header X-Tenant-ID', () => {
    const req = { headers: { 'x-tenant-id': 'decoevent', host: 'localhost:3000' } };
    expect(identifyTenant(req)).toBe('decoevent');
  });

  test('Domaine fatshairafro', () => {
    const req = { headers: { host: 'fatshairafro.fr' } };
    expect(identifyTenant(req)).toBe('fatshairafro');
  });

  test('Domaine decoevent', () => {
    const req = { headers: { host: 'decoevent.fr' } };
    expect(identifyTenant(req)).toBe('decoevent');
  });

  test('Défaut = fatshairafro', () => {
    const req = { headers: { host: 'localhost:3000' } };
    expect(identifyTenant(req)).toBe('fatshairafro');
  });

  test('listTenants contient les 2 tenants', () => {
    const tenants = listTenants();
    expect(tenants).toContain('fatshairafro');
    expect(tenants).toContain('decoevent');
  });
});

// ════════════════════════════════════════════════
// ISOLATION — Feature inexistante
// ════════════════════════════════════════════════
describe('Isolation — Edge cases', () => {
  test('Feature inexistante retourne false', () => {
    expect(hasFeature('fatshairafro', 'module_inexistant')).toBe(false);
    expect(hasFeature('decoevent', 'module_inexistant')).toBe(false);
  });

  test('Tenant inconnu retourne template (pas de crash)', () => {
    const config = getTenantConfig('inconnu');
    expect(config).toBeDefined();
  });
});
