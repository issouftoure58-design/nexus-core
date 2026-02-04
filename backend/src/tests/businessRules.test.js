/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║                                                                   ║
 * ║   TESTS AUTOMATIQUES DES REGLES METIER                            ║
 * ║                                                                   ║
 * ║   Ces tests DOIVENT passer avant chaque deploiement.              ║
 * ║   Si un test echoue, c'est qu'une regle metier a ete cassee.      ║
 * ║                                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import {
  SERVICES,
  TRAVEL_FEES,
  BUSINESS_HOURS,
  BOOKING_RULES,
  AMBIGUOUS_TERMS,
  validateBooking,
  findServiceByName,
  checkAmbiguousTerm,
} from '../config/businessRules.js';

import {
  validateBeforeCreate,
  calculateTotalPrice,
  getAvailableSlots,
} from '../services/bookingValidator.js';

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function test(description, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
    console.log(`${colors.green}✓${colors.reset} ${description}`);
  } catch (error) {
    testsFailed++;
    console.log(`${colors.red}✗${colors.reset} ${description}`);
    console.log(`  ${colors.red}→ ${error.message}${colors.reset}`);
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Attendu: ${expected}, Reçu: ${actual}`);
  }
}

function assertTrue(condition, message = '') {
  if (!condition) {
    throw new Error(message || 'La condition devrait être vraie');
  }
}

function assertFalse(condition, message = '') {
  if (condition) {
    throw new Error(message || 'La condition devrait être fausse');
  }
}

// ══════════════════════════════════════════════════════════════════════
// TESTS DES TARIFS
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS DES TARIFS ═══${colors.reset}\n`);

test('Création crochet locks = 200€', () => {
  assertEqual(SERVICES.CREATION_CROCHET_LOCKS.price, 200);
  assertEqual(SERVICES.CREATION_CROCHET_LOCKS.priceInCents, 20000);
});

test('Création microlocks crochet = 300€ (à partir de)', () => {
  assertEqual(SERVICES.CREATION_MICROLOCKS_CROCHET.price, 300);
  assertTrue(SERVICES.CREATION_MICROLOCKS_CROCHET.priceIsMinimum, 'Devrait être un prix minimum');
});

test('Création microlocks twist = 150€ (à partir de)', () => {
  assertEqual(SERVICES.CREATION_MICROLOCKS_TWIST.price, 150);
  assertTrue(SERVICES.CREATION_MICROLOCKS_TWIST.priceIsMinimum);
});

test('Reprise racines locks = 50€', () => {
  assertEqual(SERVICES.REPRISE_RACINES_LOCKS.price, 50);
  assertFalse(SERVICES.REPRISE_RACINES_LOCKS.priceIsMinimum);
});

test('Reprise racines microlocks = 100€', () => {
  assertEqual(SERVICES.REPRISE_RACINES_MICROLOCKS.price, 100);
});

test('Décapage locks = 35€', () => {
  assertEqual(SERVICES.DECAPAGE_LOCKS.price, 35);
});

test('Soin complet = 50€', () => {
  assertEqual(SERVICES.SOIN_COMPLET.price, 50);
});

test('Soin hydratant = 40€', () => {
  assertEqual(SERVICES.SOIN_HYDRATANT.price, 40);
});

test('Shampoing = 10€', () => {
  assertEqual(SERVICES.SHAMPOING.price, 10);
});

test('Braids = 60€ (à partir de)', () => {
  assertEqual(SERVICES.BRAIDS.price, 60);
  assertTrue(SERVICES.BRAIDS.priceIsMinimum);
});

test('Nattes collées sans rajout = 20€ (à partir de)', () => {
  assertEqual(SERVICES.NATTES_COLLEES_SANS_RAJOUT.price, 20);
  assertTrue(SERVICES.NATTES_COLLEES_SANS_RAJOUT.priceIsMinimum);
});

test('Nattes collées avec rajout = 40€ (à partir de)', () => {
  assertEqual(SERVICES.NATTES_COLLEES_AVEC_RAJOUT.price, 40);
  assertTrue(SERVICES.NATTES_COLLEES_AVEC_RAJOUT.priceIsMinimum);
});

test('Teinture sans ammoniaque = 40€', () => {
  assertEqual(SERVICES.TEINTURE_SANS_AMMONIAQUE.price, 40);
});

test('Décoloration = 20€', () => {
  assertEqual(SERVICES.DECOLORATION.price, 20);
});

test('Brushing afro = 20€', () => {
  assertEqual(SERVICES.BRUSHING_AFRO.price, 20);
});

// ══════════════════════════════════════════════════════════════════════
// TESTS DES DUREES
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS DES DUREES ═══${colors.reset}\n`);

test('Création crochet locks = 8h (480min)', () => {
  assertEqual(SERVICES.CREATION_CROCHET_LOCKS.durationMinutes, 480);
});

test('Création microlocks crochet = 16h (960min)', () => {
  assertEqual(SERVICES.CREATION_MICROLOCKS_CROCHET.durationMinutes, 960);
});

test('Création microlocks twist = 8h (480min)', () => {
  assertEqual(SERVICES.CREATION_MICROLOCKS_TWIST.durationMinutes, 480);
});

test('Reprise racines locks = 2h (120min)', () => {
  assertEqual(SERVICES.REPRISE_RACINES_LOCKS.durationMinutes, 120);
});

test('Reprise racines microlocks = 4h (240min)', () => {
  assertEqual(SERVICES.REPRISE_RACINES_MICROLOCKS.durationMinutes, 240);
});

test('Décapage locks = 1h (60min)', () => {
  assertEqual(SERVICES.DECAPAGE_LOCKS.durationMinutes, 60);
});

test('Shampoing = 30min', () => {
  assertEqual(SERVICES.SHAMPOING.durationMinutes, 30);
});

test('Braids = 5h (300min)', () => {
  assertEqual(SERVICES.BRAIDS.durationMinutes, 300);
});

// ══════════════════════════════════════════════════════════════════════
// TESTS JOURNEE ENTIERE
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS JOURNEE ENTIERE ═══${colors.reset}\n`);

test('Création crochet locks bloque la journée', () => {
  assertTrue(SERVICES.CREATION_CROCHET_LOCKS.blocksFullDay);
  assertEqual(SERVICES.CREATION_CROCHET_LOCKS.blocksDays, 1);
});

test('Création microlocks crochet bloque 2 jours', () => {
  assertTrue(SERVICES.CREATION_MICROLOCKS_CROCHET.blocksFullDay);
  assertEqual(SERVICES.CREATION_MICROLOCKS_CROCHET.blocksDays, 2);
});

test('Création microlocks twist bloque 1 jour', () => {
  assertTrue(SERVICES.CREATION_MICROLOCKS_TWIST.blocksFullDay);
  assertEqual(SERVICES.CREATION_MICROLOCKS_TWIST.blocksDays, 1);
});

test('Reprise racines locks NE bloque PAS la journée', () => {
  assertFalse(SERVICES.REPRISE_RACINES_LOCKS.blocksFullDay);
});

test('Soin complet NE bloque PAS la journée', () => {
  assertFalse(SERVICES.SOIN_COMPLET.blocksFullDay);
});

test('Braids NE bloque PAS la journée', () => {
  assertFalse(SERVICES.BRAIDS.blocksFullDay);
});

// ══════════════════════════════════════════════════════════════════════
// TESTS FRAIS DE DEPLACEMENT
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS FRAIS DE DEPLACEMENT ═══${colors.reset}\n`);

test('Distance base = 8km', () => {
  assertEqual(TRAVEL_FEES.BASE_DISTANCE_KM, 8);
});

test('Forfait base = 10€', () => {
  assertEqual(TRAVEL_FEES.BASE_FEE, 10);
  assertEqual(TRAVEL_FEES.BASE_FEE_CENTS, 1000);
});

test('Prix par km au-delà = 1.10€', () => {
  assertEqual(TRAVEL_FEES.PER_KM_BEYOND, 1.10);
  assertEqual(TRAVEL_FEES.PER_KM_BEYOND_CENTS, 110);
});

test('5km = 10€ (forfait)', () => {
  assertEqual(TRAVEL_FEES.calculate(5), 10);
  assertEqual(TRAVEL_FEES.calculateCents(5), 1000);
});

test('8km = 10€ (limite du forfait)', () => {
  assertEqual(TRAVEL_FEES.calculate(8), 10);
  assertEqual(TRAVEL_FEES.calculateCents(8), 1000);
});

test('10km = 12.20€ (10€ + 2km × 1.10€)', () => {
  assertEqual(TRAVEL_FEES.calculate(10), 12.20);
  assertEqual(TRAVEL_FEES.calculateCents(10), 1220);
});

test('15km = 17.70€ (10€ + 7km × 1.10€)', () => {
  assertEqual(TRAVEL_FEES.calculate(15), 17.70);
  assertEqual(TRAVEL_FEES.calculateCents(15), 1770);
});

// ══════════════════════════════════════════════════════════════════════
// TESTS HORAIRES
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS HORAIRES ═══${colors.reset}\n`);

test('Dimanche = fermé', () => {
  assertFalse(BUSINESS_HOURS.isOpen(0));
  assertEqual(BUSINESS_HOURS.SCHEDULE[0], null);
});

test('Lundi = 9h-18h', () => {
  assertTrue(BUSINESS_HOURS.isOpen(1));
  assertEqual(BUSINESS_HOURS.SCHEDULE[1].open, '09:00');
  assertEqual(BUSINESS_HOURS.SCHEDULE[1].close, '18:00');
});

test('Jeudi = 9h-13h (demi-journée)', () => {
  assertTrue(BUSINESS_HOURS.isOpen(4));
  assertEqual(BUSINESS_HOURS.SCHEDULE[4].open, '09:00');
  assertEqual(BUSINESS_HOURS.SCHEDULE[4].close, '13:00');
});

test('Vendredi = 13h-18h (après-midi)', () => {
  assertTrue(BUSINESS_HOURS.isOpen(5));
  assertEqual(BUSINESS_HOURS.SCHEDULE[5].open, '13:00');
  assertEqual(BUSINESS_HOURS.SCHEDULE[5].close, '18:00');
});

test('Samedi = 9h-18h', () => {
  assertTrue(BUSINESS_HOURS.isOpen(6));
  assertEqual(BUSINESS_HOURS.SCHEDULE[6].open, '09:00');
  assertEqual(BUSINESS_HOURS.SCHEDULE[6].close, '18:00');
});

// ══════════════════════════════════════════════════════════════════════
// TESTS REGLES DE RESERVATION
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS REGLES RESERVATION ═══${colors.reset}\n`);

test('Délai minimum = 24h', () => {
  assertEqual(BOOKING_RULES.MIN_ADVANCE_HOURS, 24);
});

test('Délai maximum = 60 jours', () => {
  assertEqual(BOOKING_RULES.MAX_ADVANCE_DAYS, 60);
});

test('Acompte = 30%', () => {
  assertEqual(BOOKING_RULES.DEPOSIT_PERCENT, 30);
});

test('Annulation gratuite = 48h', () => {
  assertEqual(BOOKING_RULES.FREE_CANCELLATION_HOURS, 48);
});

test('Heure début journée entière = 9h', () => {
  assertEqual(BOOKING_RULES.FULL_DAY_START_HOUR, 9);
  assertEqual(BOOKING_RULES.FULL_DAY_START_TIME, '09:00');
});

// ══════════════════════════════════════════════════════════════════════
// TESTS TERMES AMBIGUS
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS TERMES AMBIGUS ═══${colors.reset}\n`);

test('"locks" est ambigu', () => {
  const result = checkAmbiguousTerm('locks');
  assertTrue(result !== null, '"locks" devrait être détecté comme ambigu');
  assertEqual(result.options.length, 3);
});

test('"microlocks" est ambigu', () => {
  const result = checkAmbiguousTerm('microlocks');
  assertTrue(result !== null, '"microlocks" devrait être détecté comme ambigu');
  assertEqual(result.options.length, 3);
});

test('"tresses" est ambigu', () => {
  const result = checkAmbiguousTerm('tresses');
  assertTrue(result !== null, '"tresses" devrait être détecté comme ambigu');
  assertEqual(result.options.length, 3);
});

test('"création crochet locks" n\'est PAS ambigu', () => {
  const result = checkAmbiguousTerm('création crochet locks');
  assertEqual(result, null, 'Ce terme spécifique ne devrait pas être ambigu');
});

test('"soin complet" n\'est PAS ambigu', () => {
  const result = checkAmbiguousTerm('soin complet');
  assertEqual(result, null);
});

// ══════════════════════════════════════════════════════════════════════
// TESTS RECHERCHE SERVICE
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS RECHERCHE SERVICE ═══${colors.reset}\n`);

test('Trouver "création crochet locks" (exact)', () => {
  const service = findServiceByName('Création crochet locks');
  assertTrue(service !== null, 'Le service devrait être trouvé');
  assertEqual(service.id, 'creation_crochet_locks');
});

test('Trouver "crochet locks" (partiel)', () => {
  const service = findServiceByName('crochet locks');
  assertTrue(service !== null, 'Le service devrait être trouvé par correspondance partielle');
});

test('Trouver "shampoing" (case insensitive)', () => {
  const service = findServiceByName('SHAMPOING');
  assertTrue(service !== null);
  assertEqual(service.id, 'shampoing');
});

test('Service inexistant retourne null', () => {
  const service = findServiceByName('coupe de cheveux');
  assertEqual(service, null);
});

// ══════════════════════════════════════════════════════════════════════
// TESTS CALCUL DE PRIX
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS CALCUL DE PRIX ═══${colors.reset}\n`);

test('Prix soin complet sans déplacement', () => {
  const result = calculateTotalPrice(SERVICES.SOIN_COMPLET, 0);
  assertEqual(result.servicePrice, 50);
  assertEqual(result.travelFee, 0);
  assertEqual(result.total, 50);
  assertEqual(result.deposit, 15); // 30% de 50
});

test('Prix soin complet avec déplacement 5km', () => {
  const result = calculateTotalPrice(SERVICES.SOIN_COMPLET, 5);
  assertEqual(result.servicePrice, 50);
  assertEqual(result.travelFee, 10); // forfait
  assertEqual(result.total, 60);
  assertEqual(result.deposit, 18); // 30% de 60
});

test('Prix création locks avec déplacement 15km', () => {
  const result = calculateTotalPrice(SERVICES.CREATION_CROCHET_LOCKS, 15);
  assertEqual(result.servicePrice, 200);
  assertEqual(result.travelFee, 17.70);
  assertEqual(result.total, 217.70);
});

// ══════════════════════════════════════════════════════════════════════
// TESTS VALIDATION RESERVATION
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS VALIDATION RESERVATION ═══${colors.reset}\n`);

test('Rejet RDV le dimanche', async () => {
  const result = await validateBeforeCreate({
    serviceName: 'soin complet',
    date: '2026-01-25', // C'est un dimanche
    heure: '10:00'
  }, []);
  assertFalse(result.valid);
  assertTrue(result.errors.some(e => e.includes('dimanche')));
});

test('Terme ambigu nécessite clarification', async () => {
  const result = await validateBeforeCreate({
    serviceName: 'locks',
    date: '2026-01-26',
    heure: '10:00'
  }, []);
  assertFalse(result.valid);
  assertTrue(result.needsClarification === true);
});

test('Création locks doit commencer à 9h', async () => {
  const result = await validateBeforeCreate({
    serviceName: 'création crochet locks',
    date: '2026-01-26', // Lundi
    heure: '14:00'
  }, []);
  // La validation ajuste automatiquement l'heure mais ajoute un warning
  assertTrue(result.warnings.length > 0 || result.errors.some(e => e.includes('9')));
});

// ══════════════════════════════════════════════════════════════════════
// TESTS IMMUTABILITE
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}═══ TESTS IMMUTABILITE ═══${colors.reset}\n`);

test('SERVICES est gelé (Object.freeze)', () => {
  assertTrue(Object.isFrozen(SERVICES), 'SERVICES devrait être gelé');
});

test('Chaque service est gelé', () => {
  for (const [key, service] of Object.entries(SERVICES)) {
    assertTrue(Object.isFrozen(service), `SERVICES.${key} devrait être gelé`);
  }
});

test('TRAVEL_FEES est gelé', () => {
  assertTrue(Object.isFrozen(TRAVEL_FEES));
});

test('BUSINESS_HOURS est gelé', () => {
  assertTrue(Object.isFrozen(BUSINESS_HOURS));
});

test('BOOKING_RULES est gelé', () => {
  assertTrue(Object.isFrozen(BOOKING_RULES));
});

test('Modification de prix est bloquée', () => {
  const oldPrice = SERVICES.SOIN_COMPLET.price;
  let errorThrown = false;
  try {
    SERVICES.SOIN_COMPLET.price = 999; // Tentative de modification
  } catch (e) {
    errorThrown = true;
  }
  // En mode strict, Object.freeze lance une erreur
  // En mode non-strict, la modification échoue silencieusement
  assertEqual(SERVICES.SOIN_COMPLET.price, oldPrice, 'Le prix ne devrait pas changer');
});

// ══════════════════════════════════════════════════════════════════════
// RESULTAT FINAL
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(60)}`);
console.log(`${colors.bold}RESULTAT DES TESTS${colors.reset}`);
console.log(`${'═'.repeat(60)}`);
console.log(`Total:  ${testsRun}`);
console.log(`${colors.green}Réussis: ${testsPassed}${colors.reset}`);
console.log(`${colors.red}Échoués: ${testsFailed}${colors.reset}`);
console.log(`${'═'.repeat(60)}\n`);

if (testsFailed > 0) {
  console.log(`${colors.red}${colors.bold}⚠️  DES REGLES METIER ONT ETE CASSEES !${colors.reset}`);
  console.log(`${colors.red}Ne pas déployer avant d'avoir corrigé les problèmes.${colors.reset}\n`);
  process.exit(1);
} else {
  console.log(`${colors.green}${colors.bold}✅ Toutes les règles métier sont respectées.${colors.reset}\n`);
  process.exit(0);
}
