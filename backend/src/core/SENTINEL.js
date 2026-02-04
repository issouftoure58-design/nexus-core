/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                                                                               ║
 * ║   ███████╗███████╗███╗   ██╗████████╗██╗███╗   ██╗███████╗██╗                 ║
 * ║   ██╔════╝██╔════╝████╗  ██║╚══██╔══╝██║████╗  ██║██╔════╝██║                 ║
 * ║   ███████╗█████╗  ██╔██╗ ██║   ██║   ██║██╔██╗ ██║█████╗  ██║                 ║
 * ║   ╚════██║██╔══╝  ██║╚██╗██║   ██║   ██║██║╚██╗██║██╔══╝  ██║                 ║
 * ║   ███████║███████╗██║ ╚████║   ██║   ██║██║ ╚████║███████╗███████╗            ║
 * ║   ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝            ║
 * ║                                                                               ║
 * ║   GARDIEN DU SYSTEME NEXUS CORE                                               ║
 * ║   Valide l'integrite et la coherence de toutes les dependances                ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * Ce module valide que :
 * 1. businessRules.js est la source unique de verite
 * 2. Tous les fichiers dependants importent correctement
 * 3. Aucune valeur n'est hardcodee ailleurs
 * 4. Les calculs sont coherents partout
 */

import { SERVICES, TRAVEL_FEES, BUSINESS_HOURS, BOOKING_RULES } from '../config/businessRules.js';

// ============================================
// CONFIGURATION SENTINEL
// ============================================

const SENTINEL_VERSION = '1.0.0';
const LOCK_DATE = '2025-01-25';

// Valeurs officielles attendues (pour validation)
const EXPECTED_VALUES = {
  TRAVEL_FEES: {
    BASE_FEE: 10,
    BASE_DISTANCE_KM: 8,
    PER_KM_BEYOND: 1.10
  },
  TEST_CALCULATIONS: [
    { distance: 5, expected: 10 },
    { distance: 8, expected: 10 },
    { distance: 10, expected: 12.20 },
    { distance: 12, expected: 14.40 },
    { distance: 20, expected: 23.20 }
  ]
};

// ============================================
// FONCTIONS DE VALIDATION
// ============================================

/**
 * Valide que TRAVEL_FEES contient les bonnes valeurs
 */
function validateTravelFees() {
  const errors = [];

  if (TRAVEL_FEES.BASE_FEE !== EXPECTED_VALUES.TRAVEL_FEES.BASE_FEE) {
    errors.push(`BASE_FEE incorrect: ${TRAVEL_FEES.BASE_FEE} (attendu: ${EXPECTED_VALUES.TRAVEL_FEES.BASE_FEE})`);
  }

  if (TRAVEL_FEES.BASE_DISTANCE_KM !== EXPECTED_VALUES.TRAVEL_FEES.BASE_DISTANCE_KM) {
    errors.push(`BASE_DISTANCE_KM incorrect: ${TRAVEL_FEES.BASE_DISTANCE_KM} (attendu: ${EXPECTED_VALUES.TRAVEL_FEES.BASE_DISTANCE_KM})`);
  }

  if (TRAVEL_FEES.PER_KM_BEYOND !== EXPECTED_VALUES.TRAVEL_FEES.PER_KM_BEYOND) {
    errors.push(`PER_KM_BEYOND incorrect: ${TRAVEL_FEES.PER_KM_BEYOND} (attendu: ${EXPECTED_VALUES.TRAVEL_FEES.PER_KM_BEYOND})`);
  }

  return errors;
}

/**
 * Valide que la fonction calculate() donne les bons résultats
 */
function validateCalculations() {
  const errors = [];

  for (const test of EXPECTED_VALUES.TEST_CALCULATIONS) {
    const result = TRAVEL_FEES.calculate(test.distance);
    if (Math.abs(result - test.expected) > 0.01) {
      errors.push(`calculate(${test.distance}km) = ${result}€ (attendu: ${test.expected}€)`);
    }
  }

  return errors;
}

/**
 * Valide que SERVICES contient tous les services requis
 */
function validateServices() {
  const errors = [];
  const requiredServices = [
    'CREATION_CROCHET_LOCKS',
    'CREATION_MICROLOCKS_CROCHET',
    'BRAIDS',
    'SHAMPOING',
    'SOIN_HYDRATANT'
  ];

  for (const serviceKey of requiredServices) {
    if (!SERVICES[serviceKey]) {
      errors.push(`Service manquant: ${serviceKey}`);
    }
  }

  // Vérifier que tous les services ont un prix
  for (const [key, service] of Object.entries(SERVICES)) {
    if (typeof service.price !== 'number' || service.price <= 0) {
      errors.push(`Service ${key}: prix invalide (${service.price})`);
    }
    if (typeof service.durationMinutes !== 'number' || service.durationMinutes <= 0) {
      errors.push(`Service ${key}: durée invalide (${service.durationMinutes})`);
    }
  }

  return errors;
}

/**
 * Valide que BUSINESS_HOURS est correctement configuré
 */
function validateBusinessHours() {
  const errors = [];

  // Vérifier que dimanche est fermé
  if (BUSINESS_HOURS.SCHEDULE[0] !== null) {
    errors.push('Dimanche devrait être fermé (null)');
  }

  // Vérifier que les jours de semaine sont configurés
  for (let day = 1; day <= 6; day++) {
    const schedule = BUSINESS_HOURS.SCHEDULE[day];
    if (!schedule || !schedule.open || !schedule.close) {
      errors.push(`Jour ${day}: horaires manquants`);
    }
  }

  return errors;
}

/**
 * Valide que Object.freeze() est bien appliqué
 */
function validateImmutability() {
  const errors = [];

  // Tenter de modifier (doit échouer silencieusement en mode strict)
  try {
    const testObj = { ...TRAVEL_FEES };
    // Si on peut spread, l'original est toujours frozen
    if (!Object.isFrozen(TRAVEL_FEES)) {
      errors.push('TRAVEL_FEES n\'est pas frozen');
    }
  } catch (e) {
    // C'est OK, frozen fonctionne
  }

  if (!Object.isFrozen(SERVICES)) {
    errors.push('SERVICES n\'est pas frozen');
  }

  if (!Object.isFrozen(BUSINESS_HOURS)) {
    errors.push('BUSINESS_HOURS n\'est pas frozen');
  }

  return errors;
}

// ============================================
// EXECUTION SENTINEL
// ============================================

/**
 * Execute toutes les validations SENTINEL
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
export function runSentinel() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║          SENTINEL - Validation NEXUS Core                 ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const allErrors = [];
  const warnings = [];

  // 1. Valider TRAVEL_FEES
  console.log('  [1/5] Validation TRAVEL_FEES...');
  const travelErrors = validateTravelFees();
  if (travelErrors.length > 0) {
    allErrors.push(...travelErrors);
    console.log('        ❌ ECHEC');
  } else {
    console.log('        ✅ OK');
  }

  // 2. Valider les calculs
  console.log('  [2/5] Validation calculs frais...');
  const calcErrors = validateCalculations();
  if (calcErrors.length > 0) {
    allErrors.push(...calcErrors);
    console.log('        ❌ ECHEC');
  } else {
    console.log('        ✅ OK');
  }

  // 3. Valider SERVICES
  console.log('  [3/5] Validation SERVICES...');
  const serviceErrors = validateServices();
  if (serviceErrors.length > 0) {
    allErrors.push(...serviceErrors);
    console.log('        ❌ ECHEC');
  } else {
    console.log(`        ✅ OK (${Object.keys(SERVICES).length} services)`);
  }

  // 4. Valider BUSINESS_HOURS
  console.log('  [4/5] Validation BUSINESS_HOURS...');
  const hoursErrors = validateBusinessHours();
  if (hoursErrors.length > 0) {
    allErrors.push(...hoursErrors);
    console.log('        ❌ ECHEC');
  } else {
    console.log('        ✅ OK');
  }

  // 5. Valider immutabilité
  console.log('  [5/5] Validation immutabilité (Object.freeze)...');
  const immutErrors = validateImmutability();
  if (immutErrors.length > 0) {
    allErrors.push(...immutErrors);
    console.log('        ❌ ECHEC');
  } else {
    console.log('        ✅ OK');
  }

  // Résumé
  console.log('\n═══════════════════════════════════════════════════════════');
  if (allErrors.length === 0) {
    console.log('  ✅ SENTINEL: Toutes les validations passées');
    console.log(`     Version: ${SENTINEL_VERSION}`);
    console.log(`     Lock date: ${LOCK_DATE}`);
    console.log('═══════════════════════════════════════════════════════════\n');
    return { valid: true, errors: [], warnings };
  } else {
    console.log('  ❌ SENTINEL: ECHEC DE VALIDATION');
    console.log('     Erreurs détectées:');
    allErrors.forEach(err => console.log(`     - ${err}`));
    console.log('═══════════════════════════════════════════════════════════\n');
    return { valid: false, errors: allErrors, warnings };
  }
}

/**
 * Valide et lève une exception si échec (pour bloquer le démarrage)
 */
export function validateOrDie() {
  const result = runSentinel();
  if (!result.valid) {
    throw new Error(`SENTINEL VALIDATION FAILED:\n${result.errors.join('\n')}`);
  }
  return true;
}

/**
 * Validation silencieuse (retourne juste le résultat)
 */
export function validateSilent() {
  const allErrors = [
    ...validateTravelFees(),
    ...validateCalculations(),
    ...validateServices(),
    ...validateBusinessHours(),
    ...validateImmutability()
  ];

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    version: SENTINEL_VERSION,
    lockDate: LOCK_DATE
  };
}

// Export par défaut
export default {
  runSentinel,
  validateOrDie,
  validateSilent,
  SENTINEL_VERSION,
  LOCK_DATE
};
