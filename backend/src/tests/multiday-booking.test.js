/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║                                                                   ║
 * ║   TESTS - Réservations multi-jours (microlocks crochet)           ║
 * ║                                                                   ║
 * ║   Ce fichier teste la logique des jours ouvrables consécutifs.    ║
 * ║   Le dimanche est toujours sauté (fermé).                         ║
 * ║                                                                   ║
 * ║   Exécuter: node backend/src/tests/multiday-booking.test.js       ║
 * ║                                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import {
  getNextBusinessDay,
  getConsecutiveBusinessDays,
  checkConsecutiveBusinessDaysAvailable,
} from '../services/bookingValidator.js';

// ============================================
// HELPERS
// ============================================

const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function getJourSemaine(dateStr) {
  return jours[new Date(dateStr).getDay()];
}

let passCount = 0;
let failCount = 0;

function test(name, condition, expected, actual) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passCount++;
  } else {
    console.log(`  ❌ ${name}`);
    console.log(`     Attendu: ${expected}`);
    console.log(`     Reçu:    ${actual}`);
    failCount++;
  }
}

// ============================================
// TESTS
// ============================================

console.log('');
console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║         TESTS - Réservations multi-jours                          ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝');
console.log('');

// Afficher le calendrier de référence (Janvier 2026)
console.log('📅 Calendrier de référence (Janvier 2026):');
console.log('   Vendredi 23 → Samedi 24 → Dimanche 25 (fermé) → Lundi 26 → Mardi 27');
console.log('');

// ============================================
// TEST 1: getNextBusinessDay
// ============================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 1: getNextBusinessDay()');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 1a. Vendredi → Samedi (jour normal)
const test1a = getNextBusinessDay("2026-01-23");
test(
  'Vendredi 23 → Samedi 24',
  test1a === "2026-01-24",
  "2026-01-24",
  test1a
);

// 1b. Samedi → Lundi (saute dimanche)
const test1b = getNextBusinessDay("2026-01-24");
test(
  'Samedi 24 → Lundi 26 (saute dimanche)',
  test1b === "2026-01-26",
  "2026-01-26",
  test1b
);

// 1c. Dimanche → Lundi
const test1c = getNextBusinessDay("2026-01-25");
test(
  'Dimanche 25 → Lundi 26',
  test1c === "2026-01-26",
  "2026-01-26",
  test1c
);

// 1d. Lundi → Mardi (jour normal)
const test1d = getNextBusinessDay("2026-01-26");
test(
  'Lundi 26 → Mardi 27',
  test1d === "2026-01-27",
  "2026-01-27",
  test1d
);

console.log('');

// ============================================
// TEST 2: getConsecutiveBusinessDays
// ============================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 2: getConsecutiveBusinessDays()');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// 2a. 2 jours depuis samedi (doit sauter dimanche)
const test2a = getConsecutiveBusinessDays("2026-01-24", 2);
const expected2a = '["2026-01-24","2026-01-26"]';
test(
  '2 jours depuis Samedi 24 → [Samedi 24, Lundi 26]',
  JSON.stringify(test2a) === expected2a,
  expected2a,
  JSON.stringify(test2a)
);

// 2b. 3 jours depuis vendredi
const test2b = getConsecutiveBusinessDays("2026-01-23", 3);
const expected2b = '["2026-01-23","2026-01-24","2026-01-26"]';
test(
  '3 jours depuis Vendredi 23 → [Ven 23, Sam 24, Lun 26]',
  JSON.stringify(test2b) === expected2b,
  expected2b,
  JSON.stringify(test2b)
);

// 2c. 2 jours depuis lundi (pas de dimanche à sauter)
const test2c = getConsecutiveBusinessDays("2026-01-26", 2);
const expected2c = '["2026-01-26","2026-01-27"]';
test(
  '2 jours depuis Lundi 26 → [Lundi 26, Mardi 27]',
  JSON.stringify(test2c) === expected2c,
  expected2c,
  JSON.stringify(test2c)
);

// 2d. 1 jour seulement (cas service 1 jour)
const test2d = getConsecutiveBusinessDays("2026-01-24", 1);
const expected2d = '["2026-01-24"]';
test(
  '1 jour depuis Samedi 24 → [Samedi 24]',
  JSON.stringify(test2d) === expected2d,
  expected2d,
  JSON.stringify(test2d)
);

console.log('');

// ============================================
// TEST 3: checkConsecutiveBusinessDaysAvailable
// ============================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TEST 3: checkConsecutiveBusinessDaysAvailable()');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Mock des réservations existantes
const mockBookings = [
  { date: '2026-01-27', statut: 'confirme', service_nom: 'Soin' },
];

// 3a. Jours libres (pas de conflit)
const test3a = checkConsecutiveBusinessDaysAvailable("2026-01-24", 2, []);
test(
  '2 jours depuis Samedi 24 (libres) → valid=true',
  test3a.valid === true && test3a.dates.length === 2,
  'valid=true, dates=["2026-01-24","2026-01-26"]',
  `valid=${test3a.valid}, dates=${JSON.stringify(test3a.dates)}`
);

// 3b. Jour 2 occupé
const test3b = checkConsecutiveBusinessDaysAvailable("2026-01-26", 2, mockBookings);
test(
  '2 jours depuis Lundi 26 (Mardi 27 occupé) → valid=false',
  test3b.valid === false && test3b.blockedDate === '2026-01-27',
  'valid=false, blockedDate=2026-01-27',
  `valid=${test3b.valid}, blockedDate=${test3b.blockedDate}`
);

// 3c. Dimanche comme date de départ
const test3c = checkConsecutiveBusinessDaysAvailable("2026-01-25", 2, []);
test(
  'Dimanche 25 comme départ → valid=false (fermé)',
  test3c.valid === false && test3c.reason.includes('dimanche'),
  'valid=false, reason contient "dimanche"',
  `valid=${test3c.valid}, reason=${test3c.reason}`
);

// 3d. Service 1 jour (doit toujours fonctionner)
const test3d = checkConsecutiveBusinessDaysAvailable("2026-01-24", 1, []);
test(
  '1 jour depuis Samedi 24 → valid=true (compatibilité)',
  test3d.valid === true && test3d.dates.length === 1,
  'valid=true, dates=["2026-01-24"]',
  `valid=${test3d.valid}, dates=${JSON.stringify(test3d.dates)}`
);

console.log('');

// ============================================
// RÉSUMÉ
// ============================================

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('RÉSUMÉ');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Tests passés: ${passCount}`);
console.log(`  Tests échoués: ${failCount}`);
console.log('');

if (failCount === 0) {
  console.log('✅ TOUS LES TESTS PASSENT !');
  console.log('');
  console.log('→ Les réservations multi-jours (microlocks crochet) fonctionnent.');
  console.log('→ Le dimanche est correctement sauté.');
  console.log('→ Les réservations 1 jour ne sont pas impactées.');
  process.exit(0);
} else {
  console.log('❌ CERTAINS TESTS ÉCHOUENT !');
  console.log('');
  console.log('→ Vérifier la logique dans bookingValidator.js');
  process.exit(1);
}
