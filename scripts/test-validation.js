/**
 * Script de validation NEXUS - Phase 5
 * Teste que l'architecture unifiée fonctionne correctement
 */

import { TOOLS_CLIENT, TOOLS_ADMIN, TOOLS_STATS } from '../backend/src/tools/toolsRegistry.js';
import { SERVICES, TRAVEL_FEES, BUSINESS_HOURS, BOOKING_RULES } from '../backend/src/config/businessRules.js';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║           TESTS DE VALIDATION NEXUS - Phase 5             ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

let totalTests = 0;
let passedTests = 0;

function test(name, condition) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`   ✅ ${name}`);
    return true;
  } else {
    console.log(`   ❌ ${name}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 1: TOOLS REGISTRY
// ═══════════════════════════════════════════════════════════════
console.log('┌────────────────────────────────────────────────────────────┐');
console.log('│ 1. TOOLS REGISTRY                                         │');
console.log('└────────────────────────────────────────────────────────────┘');

console.log(`   TOOLS_CLIENT: ${TOOLS_CLIENT.length} outils`);
console.log(`   TOOLS_ADMIN: ${TOOLS_ADMIN.length} outils`);

test('TOOLS_CLIENT = 9 outils', TOOLS_CLIENT.length === 9);
test('TOOLS_ADMIN >= 100 outils', TOOLS_ADMIN.length >= 100);
test('TOOLS_ADMIN inclut TOOLS_CLIENT',
  TOOLS_CLIENT.every(tc => TOOLS_ADMIN.some(ta => ta.name === tc.name))
);

// Vérifier les outils essentiels
const essentialClientTools = ['parse_date', 'get_services', 'get_price', 'check_availability', 'create_booking'];
const essentialAdminTools = ['get_stats', 'get_rdv', 'memoriser', 'se_souvenir', 'creer_image'];

test('Outils client essentiels présents',
  essentialClientTools.every(name => TOOLS_CLIENT.some(t => t.name === name))
);
test('Outils admin essentiels présents',
  essentialAdminTools.every(name => TOOLS_ADMIN.some(t => t.name === name))
);

console.log('');

// ═══════════════════════════════════════════════════════════════
// TEST 2: FRAIS DE DÉPLACEMENT
// ═══════════════════════════════════════════════════════════════
console.log('┌────────────────────────────────────────────────────────────┐');
console.log('│ 2. FRAIS DE DÉPLACEMENT                                   │');
console.log('└────────────────────────────────────────────────────────────┘');

console.log(`   Base: ${TRAVEL_FEES.BASE_FEE}€`);
console.log(`   Seuil: ${TRAVEL_FEES.BASE_DISTANCE_KM}km gratuit`);
console.log(`   Prix/km: ${TRAVEL_FEES.PER_KM_BEYOND}€`);

const travelTests = [
  { km: 5, expected: 10, desc: '5km (dans zone gratuite)' },
  { km: 8, expected: 10, desc: '8km (limite zone gratuite)' },
  { km: 10, expected: 12.20, desc: '10km (+2km)' },
  { km: 12, expected: 14.40, desc: '12km (+4km)' },
  { km: 19.5, expected: 22.65, desc: '19.5km (+11.5km)' },
  { km: 20, expected: 23.20, desc: '20km (+12km)' },
  { km: 25, expected: 28.70, desc: '25km (+17km)' }
];

travelTests.forEach(t => {
  const result = TRAVEL_FEES.calculate(t.km);
  const pass = Math.abs(result - t.expected) < 0.01;
  test(`${t.desc} → ${result}€ (attendu: ${t.expected}€)`, pass);
});

console.log('');

// ═══════════════════════════════════════════════════════════════
// TEST 3: SERVICES
// ═══════════════════════════════════════════════════════════════
console.log('┌────────────────────────────────────────────────────────────┐');
console.log('│ 3. SERVICES                                               │');
console.log('└────────────────────────────────────────────────────────────┘');

const serviceKeys = Object.keys(SERVICES);
const totalServices = serviceKeys.length;
console.log(`   Total services: ${totalServices}`);

// Afficher quelques services
const sampleServices = serviceKeys.slice(0, 5);
sampleServices.forEach(key => {
  const service = SERVICES[key];
  console.log(`   - ${service.name}: ${service.price}€ (${service.duration}min)`);
});
if (serviceKeys.length > 5) {
  console.log(`   ... et ${serviceKeys.length - 5} autres services`);
}

test(`Total services >= 10`, totalServices >= 10);
test('Service CREATION_CROCHET_LOCKS existe', serviceKeys.includes('CREATION_CROCHET_LOCKS'));
test('Service SOIN_HYDRATANT existe', serviceKeys.includes('SOIN_HYDRATANT'));
test('Service BRAIDS existe', serviceKeys.includes('BRAIDS'));

// Vérifier un service spécifique
const creationLocks = SERVICES.CREATION_CROCHET_LOCKS;
if (creationLocks) {
  console.log(`   Service test: ${creationLocks.name}`);
  console.log(`   - Prix: ${creationLocks.price}€`);
  test('Prix création locks = 200€', creationLocks.price === 200);
}

console.log('');

// ═══════════════════════════════════════════════════════════════
// TEST 4: HORAIRES
// ═══════════════════════════════════════════════════════════════
console.log('┌────────────────────────────────────────────────────────────┐');
console.log('│ 4. HORAIRES                                               │');
console.log('└────────────────────────────────────────────────────────────┘');

const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
for (let i = 0; i < 7; i++) {
  const horaire = BUSINESS_HOURS.SCHEDULE[i];
  if (horaire) {
    console.log(`   ${jours[i]}: ${horaire.open} - ${horaire.close}`);
  } else {
    console.log(`   ${jours[i]}: Fermé`);
  }
}

const joursOuverts = Object.values(BUSINESS_HOURS.SCHEDULE).filter(s => s !== null).length;
test(`${joursOuverts} jours ouverts`, joursOuverts >= 5);
test('Dimanche fermé', BUSINESS_HOURS.SCHEDULE[0] === null);
test('Lundi ouvert', BUSINESS_HOURS.SCHEDULE[1] !== null);

console.log('');

// ═══════════════════════════════════════════════════════════════
// TEST 5: RÈGLES DE RÉSERVATION
// ═══════════════════════════════════════════════════════════════
console.log('┌────────────────────────────────────────────────────────────┐');
console.log('│ 5. RÈGLES DE RÉSERVATION                                  │');
console.log('└────────────────────────────────────────────────────────────┘');

console.log(`   Délai min réservation: ${BOOKING_RULES.MIN_ADVANCE_HOURS}h`);
console.log(`   Délai max réservation: ${BOOKING_RULES.MAX_ADVANCE_DAYS} jours`);
console.log(`   Annulation gratuite: ${BOOKING_RULES.FREE_CANCELLATION_HOURS}h avant`);
console.log(`   Acompte: ${BOOKING_RULES.DEPOSIT_PERCENT}%`);

test('Délai min réservation = 24h', BOOKING_RULES.MIN_ADVANCE_HOURS === 24);
test('Délai max réservation = 60 jours', BOOKING_RULES.MAX_ADVANCE_DAYS === 60);
test('Annulation gratuite = 48h', BOOKING_RULES.FREE_CANCELLATION_HOURS === 48);

console.log('');

// ═══════════════════════════════════════════════════════════════
// RÉSUMÉ
// ═══════════════════════════════════════════════════════════════
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                      RÉSUMÉ                                ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log(`   Tests passés: ${passedTests}/${totalTests}`);
console.log(`   Taux de réussite: ${Math.round(passedTests/totalTests*100)}%`);
console.log('');

if (passedTests === totalTests) {
  console.log('   🎉 TOUS LES TESTS SONT PASSÉS !');
  console.log('   ✅ L\'architecture NEXUS unifiée est validée.');
  process.exit(0);
} else {
  console.log(`   ⚠️  ${totalTests - passedTests} test(s) échoué(s)`);
  console.log('   Vérifiez les erreurs ci-dessus.');
  process.exit(1);
}
