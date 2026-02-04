import { describe, test, expect, afterAll } from '@jest/globals';
import { getJourSemaine, getDateInfo, validateDate } from '../src/services/dateService.js';
import { normalizeServiceName } from '../src/utils/serviceMapper.js';

// ════════════════════════════════════════════════
// DATES
// ════════════════════════════════════════════════
describe('Dates (dateService)', () => {
  test('9 février 2026 = Lundi', () => {
    expect(getJourSemaine(9, 2, 2026)).toBe('Lundi');
  });

  test('8 février 2026 = Dimanche', () => {
    expect(getJourSemaine(8, 2, 2026)).toBe('Dimanche');
  });

  test('Date invalide retourne null', () => {
    expect(getJourSemaine(null, null, null)).toBeNull();
  });

  test('getDateInfo("9 février 2026") retourne lundi', () => {
    const info = getDateInfo('9 février 2026');
    expect(info.valide).toBe(true);
    expect(info.jour).toBe('Lundi');
  });

  test('getDateInfo("dimanche prochain") fermé', () => {
    const info = getDateInfo('dimanche prochain');
    expect(info.valide).toBe(true);
    expect(info.estOuvert).toBe(false);
  });

  test('validateDate date passée', () => {
    const r = validateDate('2020-01-01');
    expect(r.valide).toBe(true);
    expect(r.dansLeFutur).toBe(false);
  });

  test('validateDate date future', () => {
    const r = validateDate('2030-06-15');
    expect(r.valide).toBe(true);
    expect(r.dansLeFutur).toBe(true);
  });

  test('validateDate invalide', () => {
    const r = validateDate('not-a-date');
    expect(r.valide).toBe(false);
  });
});

// ════════════════════════════════════════════════
// SERVICES
// ════════════════════════════════════════════════
describe('Services (serviceMapper)', () => {
  test('"nattes cornrow" → "Nattes collées cornrow"', () => {
    expect(normalizeServiceName('nattes cornrow')).toBe('Nattes collées cornrow');
  });

  test('"soin complet" → "Soin complet"', () => {
    expect(normalizeServiceName('soin complet')).toBe('Soin complet');
  });

  test('"box braids" → "Box Braids"', () => {
    expect(normalizeServiceName('box braids')).toBe('Box Braids');
  });

  test('"braids simples" → "Box Braids"', () => {
    expect(normalizeServiceName('braids simples')).toBe('Box Braids');
  });

  test('"réparation locks" → "Réparation Locks"', () => {
    expect(normalizeServiceName('réparation locks')).toBe('Réparation Locks');
  });

  test('"décapage locks" → "Décapage locks"', () => {
    expect(normalizeServiceName('décapage locks')).toBe('Décapage locks');
  });

  test('"decapage" → "Décapage locks"', () => {
    expect(normalizeServiceName('decapage')).toBe('Décapage locks');
  });

  test('Service inconnu retourne tel quel', () => {
    expect(normalizeServiceName('service inexistant xyz')).toBe('service inexistant xyz');
  });
});

// ════════════════════════════════════════════════
// INTEGRATION TESTS (via HTTP API)
// Nécessitent SUPABASE_URL + API_BASE_URL
// ════════════════════════════════════════════════
const API_BASE = process.env.API_BASE_URL || 'https://fatshairafro.fr';
const hasApi = !!(process.env.API_BASE_URL || process.env.SUPABASE_URL);

// Generate unique phone suffix to avoid conflicts between test runs
const rnd = () => String(Math.floor(Math.random() * 90000) + 10000);

(hasApi ? describe : describe.skip)('Réservations (via API)', () => {
  const createdIds = [];

  afterAll(async () => {
    // Cleanup via Supabase REST
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      for (const id of createdIds) {
        await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/reservations?id=eq.${id}`,
          {
            method: 'DELETE',
            headers: {
              'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            }
          }
        );
      }
    }
  });

  test('Création RDV simple via API', async () => {
    const res = await fetch(`${API_BASE}/api/elevenlabs/booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test Auto',
        client_phone: `06000${rnd()}`,
        service: 'Soin complet',
        date: '2026-06-15',
        heure: '10:00'
      })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    if (data.reservationId) createdIds.push(data.reservationId);
  });

  test('RDV dimanche bloqué', async () => {
    const res = await fetch(`${API_BASE}/api/elevenlabs/booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test Dimanche',
        client_phone: '0600000097',
        service: 'Soin complet',
        date: '2026-02-08',
        heure: '10:00'
      })
    });
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  test('Réparation Locks 4 locks = 120min, 40€', async () => {
    const res = await fetch(`${API_BASE}/api/elevenlabs/booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test Locks',
        client_phone: `06000${rnd()}`,
        service: 'Réparation Locks',
        date: '2026-06-16',
        heure: '14:00',
        nombre_locks: '4'
      })
    });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    if (data.reservationId) createdIds.push(data.reservationId);

    // Verify in DB
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && data.reservationId) {
      const dbRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/reservations?id=eq.${data.reservationId}&select=duree_minutes,prix_total`,
        {
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          }
        }
      );
      const [rdv] = await dbRes.json();
      expect(rdv.duree_minutes).toBe(120);
      expect(rdv.prix_total).toBe(4000);
    }
  });
});
