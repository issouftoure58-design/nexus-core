import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { orchestrator } from '../../platform/core/orchestrator.js';
import { sentinel } from '../core/sentinel.js';
import { AnomalyDetector } from '../analyzers/anomaly.js';

beforeAll(async () => {
  await orchestrator.initialize();
  await sentinel.start();
  // Attendre première collecte
  await new Promise((resolve) => setTimeout(resolve, 500));
});

afterAll(() => {
  sentinel.stop();
});

describe('Sentinel Core', () => {
  test('Sentinel démarre', () => {
    expect(sentinel.running).toBe(true);
  });

  test('Collecte métriques', () => {
    const metrics = sentinel.getCurrentMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.global).toBeDefined();
    expect(metrics.global.system).toBeDefined();
    expect(metrics.global.orchestrator).toBeDefined();
    expect(metrics.global.performance).toBeDefined();
  });

  test('Santé système', () => {
    const health = sentinel.getHealth();
    expect(health.status).toBeDefined();
    expect(['healthy', 'warning', 'critical', 'unknown']).toContain(health.status);
    expect(health.message).toBeDefined();
  });

  test('Historique disponible', () => {
    const history = sentinel.getHistory();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
  });

  test('Métriques système valides', () => {
    const metrics = sentinel.getCurrentMetrics();
    const sys = metrics.global.system;
    expect(sys.cpuUsage).toBeGreaterThanOrEqual(0);
    expect(sys.cpuUsage).toBeLessThanOrEqual(100);
    expect(sys.memoryUsage.total).toBeGreaterThan(0);
    expect(sys.memoryUsage.percentage).toBeGreaterThanOrEqual(0);
    expect(sys.uptime).toBeGreaterThan(0);
  });

  test('Métriques orchestrator cohérentes', () => {
    const metrics = sentinel.getCurrentMetrics();
    const orch = metrics.global.orchestrator;
    expect(orch.totalTenants).toBeGreaterThan(0);
    expect(orch.activeTenants).toBeGreaterThanOrEqual(0);
    expect(orch.errorRate).toBeGreaterThanOrEqual(0);
  });

  test('Métriques tenants collectées', () => {
    const metrics = sentinel.getCurrentMetrics();
    expect(Array.isArray(metrics.tenants)).toBe(true);
    expect(metrics.tenants.length).toBeGreaterThan(0);
    expect(metrics.tenants[0].tenantId).toBeDefined();
    expect(metrics.tenants[0].name).toBeDefined();
  });
});

describe('Anomaly Detector', () => {
  test('Pas anomalie si tout normal', () => {
    const detector = new AnomalyDetector();

    const anomalies = detector.detect({
      global: {
        orchestrator: { errorRate: 0 },
        system: { cpuUsage: 30, memoryUsage: { percentage: 50 } },
        performance: { avgResponseTime: 100 },
      },
      tenants: [],
      history: [],
    });

    expect(anomalies.length).toBe(0);
  });

  test('Détecte erreur rate élevé', () => {
    const detector = new AnomalyDetector();

    const anomalies = detector.detect({
      global: {
        orchestrator: { errorRate: 0.2 },
        system: { cpuUsage: 30, memoryUsage: { percentage: 50 } },
        performance: { avgResponseTime: 100 },
      },
      tenants: [],
      history: [],
    });

    expect(anomalies.length).toBe(1);
    expect(anomalies[0].type).toBe('high_error_rate');
    expect(anomalies[0].severity).toBe('critical');
  });

  test('Détecte CPU élevé', () => {
    const detector = new AnomalyDetector();

    const anomalies = detector.detect({
      global: {
        orchestrator: { errorRate: 0 },
        system: { cpuUsage: 95, memoryUsage: { percentage: 50 } },
        performance: { avgResponseTime: 100 },
      },
      tenants: [],
      history: [],
    });

    expect(anomalies.length).toBe(1);
    expect(anomalies[0].type).toBe('high_cpu');
  });
});
