#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║                                                                   ║
 * ║   SCRIPT DE VERIFICATION DES REGLES METIER                        ║
 * ║                                                                   ║
 * ║   Ce script verifie que les regles metier sont correctement       ║
 * ║   configurees AVANT le demarrage du serveur.                      ║
 * ║                                                                   ║
 * ║   Usage: npm run verify                                           ║
 * ║                                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import {
  SERVICES,
  TRAVEL_FEES,
  BUSINESS_HOURS,
  BOOKING_RULES,
  AMBIGUOUS_TERMS,
} from '../backend/src/config/businessRules.js';

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   VERIFICATION DES REGLES METIER - Fat's Hair-Afro                ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝${colors.reset}
`);

let hasErrors = false;

// ══════════════════════════════════════════════════════════════════════
// VERIFICATION 1: SERVICES
// ══════════════════════════════════════════════════════════════════════

console.log(`${colors.bold}${colors.blue}1. VERIFICATION DES SERVICES${colors.reset}\n`);

const requiredServices = [
  { id: 'creation_crochet_locks', name: 'Création crochet locks', price: 200 },
  { id: 'creation_microlocks_crochet', name: 'Création microlocks crochet', price: 300 },
  { id: 'creation_microlocks_twist', name: 'Création microlocks twist', price: 150 },
  { id: 'reprise_racines_locks', name: 'Reprise racines locks', price: 50 },
  { id: 'reprise_racines_microlocks', name: 'Reprise racines micro-locks', price: 100 },
  { id: 'decapage_locks', name: 'Décapage de locks', price: 35 },
  { id: 'soin_complet', name: 'Soin complet', price: 50 },
  { id: 'soin_hydratant', name: 'Soin hydratant', price: 40 },
  { id: 'shampoing', name: 'Shampoing', price: 10 },
  { id: 'braids', name: 'Braids', price: 60 },
  { id: 'nattes_collees_sans_rajout', name: 'Nattes collées sans rajout', price: 20 },
  { id: 'nattes_collees_avec_rajout', name: 'Nattes collées avec rajout', price: 40 },
  { id: 'teinture_sans_ammoniaque', name: 'Teinture sans ammoniaque', price: 40 },
  { id: 'decoloration', name: 'Décoloration', price: 20 },
  { id: 'brushing_afro', name: 'Brushing cheveux afro', price: 20 },
];

const serviceList = Object.values(SERVICES);
console.log(`   Services configurés: ${serviceList.length}`);

for (const required of requiredServices) {
  const found = serviceList.find(s => s.id === required.id);
  if (!found) {
    console.log(`   ${colors.red}✗ MANQUANT: ${required.name}${colors.reset}`);
    hasErrors = true;
  } else if (found.price !== required.price) {
    console.log(`   ${colors.red}✗ PRIX INCORRECT: ${required.name} (attendu: ${required.price}€, trouvé: ${found.price}€)${colors.reset}`);
    hasErrors = true;
  } else {
    console.log(`   ${colors.green}✓${colors.reset} ${required.name}: ${required.price}€`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// VERIFICATION 2: SERVICES JOURNEE ENTIERE
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}2. VERIFICATION SERVICES JOURNEE ENTIERE${colors.reset}\n`);

const fullDayServices = [
  { id: 'creation_crochet_locks', days: 1 },
  { id: 'creation_microlocks_crochet', days: 2 },
  { id: 'creation_microlocks_twist', days: 1 },
];

for (const required of fullDayServices) {
  const found = serviceList.find(s => s.id === required.id);
  if (!found) {
    console.log(`   ${colors.red}✗ MANQUANT: ${required.id}${colors.reset}`);
    hasErrors = true;
  } else if (!found.blocksFullDay) {
    console.log(`   ${colors.red}✗ ${found.name} devrait bloquer la journée entière${colors.reset}`);
    hasErrors = true;
  } else if (found.blocksDays !== required.days) {
    console.log(`   ${colors.red}✗ ${found.name} devrait bloquer ${required.days} jour(s), pas ${found.blocksDays}${colors.reset}`);
    hasErrors = true;
  } else {
    console.log(`   ${colors.green}✓${colors.reset} ${found.name}: ${required.days} jour(s) bloqué(s)`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// VERIFICATION 3: FRAIS DE DEPLACEMENT
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}3. VERIFICATION FRAIS DE DEPLACEMENT${colors.reset}\n`);

const expectedTravel = {
  BASE_DISTANCE_KM: 8,
  BASE_FEE: 10,
  PER_KM_BEYOND: 1.10,
};

for (const [key, expected] of Object.entries(expectedTravel)) {
  const actual = TRAVEL_FEES[key];
  if (actual !== expected) {
    console.log(`   ${colors.red}✗ ${key}: attendu ${expected}, trouvé ${actual}${colors.reset}`);
    hasErrors = true;
  } else {
    console.log(`   ${colors.green}✓${colors.reset} ${key}: ${actual}`);
  }
}

// Test calcul
const testDistances = [
  { km: 5, expected: 10 },
  { km: 8, expected: 10 },
  { km: 10, expected: 12.20 },
  { km: 15, expected: 17.70 },
];

console.log(`\n   Tests de calcul:`);
for (const test of testDistances) {
  const result = TRAVEL_FEES.calculate(test.km);
  if (result !== test.expected) {
    console.log(`   ${colors.red}✗ ${test.km}km: attendu ${test.expected}€, calculé ${result}€${colors.reset}`);
    hasErrors = true;
  } else {
    console.log(`   ${colors.green}✓${colors.reset} ${test.km}km = ${result}€`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// VERIFICATION 4: HORAIRES
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}4. VERIFICATION HORAIRES${colors.reset}\n`);

const expectedHours = {
  0: null, // Dimanche fermé
  1: { open: '09:00', close: '18:00' }, // Lundi
  2: { open: '09:00', close: '18:00' }, // Mardi
  3: { open: '09:00', close: '18:00' }, // Mercredi
  4: { open: '09:00', close: '13:00' }, // Jeudi
  5: { open: '13:00', close: '18:00' }, // Vendredi
  6: { open: '09:00', close: '18:00' }, // Samedi
};

const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

for (const [day, expected] of Object.entries(expectedHours)) {
  const actual = BUSINESS_HOURS.SCHEDULE[day];
  const dayName = dayNames[day];

  if (expected === null) {
    if (actual !== null) {
      console.log(`   ${colors.red}✗ ${dayName} devrait être fermé${colors.reset}`);
      hasErrors = true;
    } else {
      console.log(`   ${colors.green}✓${colors.reset} ${dayName}: Fermé`);
    }
  } else {
    if (!actual || actual.open !== expected.open || actual.close !== expected.close) {
      console.log(`   ${colors.red}✗ ${dayName}: attendu ${expected.open}-${expected.close}${colors.reset}`);
      hasErrors = true;
    } else {
      console.log(`   ${colors.green}✓${colors.reset} ${dayName}: ${actual.open} - ${actual.close}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// VERIFICATION 5: REGLES RESERVATION
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}5. VERIFICATION REGLES RESERVATION${colors.reset}\n`);

const expectedRules = {
  MIN_ADVANCE_HOURS: 24,
  MAX_ADVANCE_DAYS: 60,
  DEPOSIT_PERCENT: 30,
  FREE_CANCELLATION_HOURS: 48,
  FULL_DAY_START_HOUR: 9,
  FULL_DAY_START_TIME: '09:00',
};

for (const [key, expected] of Object.entries(expectedRules)) {
  const actual = BOOKING_RULES[key];
  if (actual !== expected) {
    console.log(`   ${colors.red}✗ ${key}: attendu ${expected}, trouvé ${actual}${colors.reset}`);
    hasErrors = true;
  } else {
    console.log(`   ${colors.green}✓${colors.reset} ${key}: ${actual}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// VERIFICATION 6: IMMUTABILITE
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}6. VERIFICATION IMMUTABILITE${colors.reset}\n`);

const objectsToCheck = [
  { name: 'SERVICES', obj: SERVICES },
  { name: 'TRAVEL_FEES', obj: TRAVEL_FEES },
  { name: 'BUSINESS_HOURS', obj: BUSINESS_HOURS },
  { name: 'BOOKING_RULES', obj: BOOKING_RULES },
  { name: 'AMBIGUOUS_TERMS', obj: AMBIGUOUS_TERMS },
];

for (const { name, obj } of objectsToCheck) {
  if (!Object.isFrozen(obj)) {
    console.log(`   ${colors.red}✗ ${name} n'est pas gelé (Object.freeze)${colors.reset}`);
    hasErrors = true;
  } else {
    console.log(`   ${colors.green}✓${colors.reset} ${name} est gelé`);
  }
}

// Vérifier que chaque service est aussi gelé
let allServicesFrozen = true;
for (const [key, service] of Object.entries(SERVICES)) {
  if (!Object.isFrozen(service)) {
    console.log(`   ${colors.red}✗ SERVICES.${key} n'est pas gelé${colors.reset}`);
    allServicesFrozen = false;
    hasErrors = true;
  }
}
if (allServicesFrozen) {
  console.log(`   ${colors.green}✓${colors.reset} Tous les services individuels sont gelés`);
}

// ══════════════════════════════════════════════════════════════════════
// RESULTAT FINAL
// ══════════════════════════════════════════════════════════════════════

console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║`);

if (hasErrors) {
  console.log(`${colors.cyan}║${colors.reset}   ${colors.red}${colors.bold}⚠️  VERIFICATION ECHOUEE - REGLES METIER NON CONFORMES${colors.reset}        ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}                                                                   ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}   ${colors.red}Le serveur ne doit PAS demarrer avec ces erreurs.${colors.reset}             ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}   ${colors.red}Corrigez les problemes avant de continuer.${colors.reset}                    ${colors.cyan}║`);
} else {
  console.log(`${colors.cyan}║${colors.reset}   ${colors.green}${colors.bold}✅ VERIFICATION REUSSIE - TOUTES LES REGLES SONT OK${colors.reset}           ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}                                                                   ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}   ${colors.green}Les regles metier sont correctement configurees.${colors.reset}              ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}   ${colors.green}Le serveur peut demarrer en toute securite.${colors.reset}                   ${colors.cyan}║`);
}

console.log(`${colors.cyan}║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝${colors.reset}
`);

process.exit(hasErrors ? 1 : 0);
