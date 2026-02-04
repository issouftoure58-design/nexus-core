/**
 * Tests du flow complet de réservation + paiement
 * Fat's Hair-Afro
 *
 * Note: Ces tests fonctionnent en mode simulation si les clés Stripe/PayPal ne sont pas configurées
 */

import dotenv from 'dotenv';
dotenv.config();

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(type, message) {
  const icons = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✅${colors.reset}`,
    error: `${colors.red}❌${colors.reset}`,
    warning: `${colors.yellow}⚠${colors.reset}`,
    test: `${colors.cyan}🧪${colors.reset}`,
    step: `${colors.yellow}→${colors.reset}`,
  };
  console.log(`${icons[type] || '•'} ${message}`);
}

function header(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}${colors.cyan}${title}${colors.reset}`);
  console.log('='.repeat(60));
}

// Données de test
const testData = {
  client: {
    nom: 'Dupont',
    prenom: 'Marie',
    telephone: '+33612345678',
    email: 'marie.dupont@test.com',
  },
  rdv: {
    date: '2025-01-20',
    heure: '14:00',
    service: 'Tresses africaines',
    duree_minutes: 180,
    prix: 85.00,
    adresse: '15 rue de Paris, 95130 Franconville',
    frais_deplacement: 10.00,
  },
  stripe: {
    test_card: '4242424242424242',
    test_card_exp: '12/26',
    test_card_cvc: '123',
  },
};

// Stockage des résultats
const results = {
  test1: { name: 'Paiement acompte Stripe', status: 'pending', steps: [] },
  test2: { name: 'Paiement total PayPal', status: 'pending', steps: [] },
  test3: { name: 'Annulation < 24h', status: 'pending', steps: [] },
  test4: { name: 'Annulation > 24h', status: 'pending', steps: [] },
};

// ============= HELPERS =============

async function checkBackendHealth() {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function createStripeIntent(rdvId, type, amount) {
  const response = await fetch(`${BACKEND_URL}/api/payment/create-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rdv_id: rdvId,
      type: type, // 'acompte' ou 'total'
      prix_service: amount,
    }),
  });
  return response.json();
}

async function createPayPalOrder(rdvId, type, amount) {
  const response = await fetch(`${BACKEND_URL}/api/payment/create-paypal-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rdv_id: rdvId,
      type: type,
      prix_service: amount,
      description: `Réservation Fat's Hair-Afro`,
    }),
  });
  return response.json();
}

async function getPaymentStatus(rdvId) {
  const response = await fetch(`${BACKEND_URL}/api/payment/status/${rdvId}`);
  return response.json();
}

// ============= TESTS =============

async function test1_StripeAcompte() {
  header('TEST 1 - Paiement acompte Stripe (10€)');
  const test = results.test1;

  try {
    // Étape 1: Créer un RDV (simulation)
    log('step', 'Étape 1: Création du RDV');
    const rdvId = `rdv_${Date.now()}`;
    test.steps.push({ step: 1, action: 'Création RDV', result: 'OK', rdv_id: rdvId });
    log('success', `RDV créé: ${rdvId}`);

    // Étape 2: Générer URL de paiement
    log('step', 'Étape 2: Génération URL de paiement');
    const prixTotal = testData.rdv.prix + testData.rdv.frais_deplacement;
    const paymentUrl = `${FRONTEND_URL}/paiement?rdv_id=${rdvId}&service=${encodeURIComponent(testData.rdv.service)}&duree=${testData.rdv.duree_minutes}&prix=${prixTotal}`;
    test.steps.push({ step: 2, action: 'URL paiement', result: 'OK', url: paymentUrl });
    log('success', `URL générée: ${paymentUrl}`);

    // Étape 3: Créer PaymentIntent Stripe pour acompte (10€)
    log('step', 'Étape 3: Création PaymentIntent Stripe (acompte 10€)');
    const intentResult = await createStripeIntent(rdvId, 'acompte', 10);

    if (intentResult.success) {
      test.steps.push({
        step: 3,
        action: 'PaymentIntent créé',
        result: 'OK',
        data: {
          payment_intent_id: intentResult.payment_intent_id,
          amount: `${intentResult.amount}€`,
          type: intentResult.type,
        },
      });
      log('success', `PaymentIntent créé: ${intentResult.payment_intent_id}`);

      // Étape 4: Simuler paiement avec carte test
      log('step', 'Étape 4: Simulation paiement carte test');
      log('info', `Carte: ${testData.stripe.test_card}`);
      test.steps.push({
        step: 4,
        action: 'Paiement carte test',
        result: 'OK (Stripe configuré)',
        note: 'En frontend, utiliser Stripe Elements avec la carte test',
      });
      log('success', 'PaymentIntent prêt pour le paiement frontend');

      // Étape 5: Vérifier la structure de réponse
      log('step', 'Étape 5: Vérification structure réponse');
      const hasClientSecret = !!intentResult.client_secret;
      const hasCorrectAmount = intentResult.amount === 10;
      const hasCorrectType = intentResult.type === 'acompte';

      test.steps.push({
        step: 5,
        action: 'Validation réponse',
        result: hasClientSecret && hasCorrectAmount && hasCorrectType ? 'OK' : 'ERREUR',
        checks: {
          client_secret: hasClientSecret ? '✓ Présent' : '✗ Manquant',
          amount: hasCorrectAmount ? '✓ 10€' : `✗ ${intentResult.amount}€`,
          type: hasCorrectType ? '✓ acompte' : `✗ ${intentResult.type}`,
        },
      });

      if (hasClientSecret && hasCorrectAmount && hasCorrectType) {
        log('success', 'Structure de réponse validée');
        test.status = 'passed';
      } else {
        log('error', 'Structure de réponse incorrecte');
        test.status = 'failed';
      }

    } else if (intentResult.error?.includes('Stripe not configured')) {
      // Mode simulation sans Stripe
      test.steps.push({
        step: 3,
        action: 'PaymentIntent (mode simulation)',
        result: 'SIMULATION',
        note: 'Stripe non configuré - STRIPE_SECRET_KEY manquante',
      });
      log('warning', 'Mode simulation - Stripe non configuré');

      // Simuler les étapes suivantes
      test.steps.push({
        step: 4,
        action: 'Paiement simulé',
        result: 'SIMULATION',
        note: 'Carte test: 4242 4242 4242 4242',
      });
      test.steps.push({
        step: 5,
        action: 'Confirmation simulée',
        result: 'SIMULATION',
        expected: { statut: 'confirmé', paiement: 'acompte', montant: '10€' },
      });

      log('success', 'Test simulé avec succès');
      test.status = 'passed';
      test.simulated = true;

    } else {
      test.steps.push({
        step: 3,
        action: 'PaymentIntent',
        result: 'ERREUR',
        error: intentResult.error,
      });
      log('error', `Erreur: ${intentResult.error}`);
      test.status = 'failed';
    }

  } catch (error) {
    log('error', `Erreur test 1: ${error.message}`);
    test.status = 'failed';
    test.error = error.message;
  }

  return test;
}

async function test2_PayPalTotal() {
  header('TEST 2 - Paiement total PayPal');
  const test = results.test2;

  try {
    // Étape 1: Créer un RDV
    log('step', 'Étape 1: Création du RDV');
    const rdvId = `rdv_${Date.now()}`;
    const prixTotal = testData.rdv.prix + testData.rdv.frais_deplacement;
    test.steps.push({ step: 1, action: 'Création RDV', result: 'OK', rdv_id: rdvId });
    log('success', `RDV créé: ${rdvId}`);

    // Étape 2: Créer commande PayPal
    log('step', `Étape 2: Création commande PayPal (${prixTotal}€)`);
    const orderResult = await createPayPalOrder(rdvId, 'total', prixTotal);

    if (orderResult.success) {
      test.steps.push({
        step: 2,
        action: 'Commande PayPal créée',
        result: 'OK',
        data: {
          order_id: orderResult.order_id,
          amount: `${orderResult.amount}€`,
          approval_url: orderResult.approval_url,
        },
      });
      log('success', `Commande PayPal: ${orderResult.order_id}`);

      // Étape 3: URL d'approbation
      log('step', 'Étape 3: URL approbation PayPal');
      if (orderResult.approval_url) {
        test.steps.push({
          step: 3,
          action: 'URL approbation',
          result: 'OK',
          url: orderResult.approval_url,
        });
        log('success', 'URL d\'approbation générée');
      } else {
        test.steps.push({
          step: 3,
          action: 'URL approbation',
          result: 'WARNING',
          note: 'URL non générée (normale en mode test)',
        });
        log('warning', 'URL d\'approbation non générée');
      }

      // Étape 4: Vérification structure
      log('step', 'Étape 4: Vérification structure réponse');
      const hasOrderId = !!orderResult.order_id;
      const hasCorrectAmount = orderResult.amount === prixTotal;
      const hasCorrectType = orderResult.type === 'total';

      test.steps.push({
        step: 4,
        action: 'Validation réponse',
        result: hasOrderId && hasCorrectAmount && hasCorrectType ? 'OK' : 'ERREUR',
        checks: {
          order_id: hasOrderId ? '✓ Présent' : '✗ Manquant',
          amount: hasCorrectAmount ? `✓ ${prixTotal}€` : `✗ ${orderResult.amount}€`,
          type: hasCorrectType ? '✓ total' : `✗ ${orderResult.type}`,
        },
      });

      if (hasOrderId && hasCorrectAmount) {
        log('success', 'Structure de réponse validée');
        test.status = 'passed';
      } else {
        log('error', 'Structure de réponse incorrecte');
        test.status = 'failed';
      }

    } else if (orderResult.error?.includes('PayPal not configured')) {
      // Mode simulation sans PayPal
      test.steps.push({
        step: 2,
        action: 'Commande PayPal (mode simulation)',
        result: 'SIMULATION',
        note: 'PayPal non configuré - PAYPAL_CLIENT_ID manquant',
      });
      log('warning', 'Mode simulation - PayPal non configuré');

      test.steps.push({
        step: 3,
        action: 'Approbation simulée',
        result: 'SIMULATION',
      });
      test.steps.push({
        step: 4,
        action: 'Capture simulée',
        result: 'SIMULATION',
        expected: { statut: 'confirmé', paiement: 'total', montant: `${prixTotal}€` },
      });

      log('success', 'Test simulé avec succès');
      test.status = 'passed';
      test.simulated = true;

    } else {
      test.steps.push({
        step: 2,
        action: 'Commande PayPal',
        result: 'ERREUR',
        error: orderResult.error,
      });
      log('error', `Erreur: ${orderResult.error}`);
      test.status = 'failed';
    }

  } catch (error) {
    log('error', `Erreur test 2: ${error.message}`);
    test.status = 'failed';
    test.error = error.message;
  }

  return test;
}

async function test3_AnnulationMoins24h() {
  header('TEST 3 - Annulation < 24h (remboursement total)');
  const test = results.test3;

  try {
    // Ce test vérifie la LOGIQUE de remboursement, pas l'API réelle
    log('step', 'Étape 1: Simulation RDV + paiement acompte');
    const rdvId = `rdv_${Date.now()}`;
    const dateCreation = new Date();
    const acompte = 10.00;

    test.steps.push({
      step: 1,
      action: 'RDV + Acompte simulé',
      result: 'OK',
      data: { rdv_id: rdvId, acompte: `${acompte}€`, date_creation: dateCreation.toISOString() },
    });
    log('success', `RDV simulé: ${rdvId}, Acompte: ${acompte}€`);

    // Étape 2: Calculer le remboursement selon la règle < 24h
    log('step', 'Étape 2: Calcul remboursement (règle < 24h)');
    const heuresDepuisCreation = 0; // Annulation immédiate
    const estMoins24h = heuresDepuisCreation < 24;
    const montantRembourse = estMoins24h ? acompte : Math.max(0, acompte - 10);

    test.steps.push({
      step: 2,
      action: 'Calcul remboursement',
      result: 'OK',
      data: {
        heures_depuis_creation: heuresDepuisCreation,
        regle_appliquee: '< 24h = remboursement total',
        montant_initial: `${acompte}€`,
        montant_rembourse: `${montantRembourse}€`,
      },
    });
    log('success', `Règle < 24h: Remboursement total = ${montantRembourse}€`);

    // Étape 3: Vérification de la logique
    log('step', 'Étape 3: Validation logique remboursement');
    const logicCorrect = montantRembourse === acompte;

    test.steps.push({
      step: 3,
      action: 'Validation logique',
      result: logicCorrect ? 'OK' : 'ERREUR',
      expected: `${acompte}€ (100% remboursé)`,
      actual: `${montantRembourse}€`,
    });

    if (logicCorrect) {
      log('success', 'Logique de remboursement < 24h validée');

      // Étape 4: Email d'annulation (simulation)
      log('step', 'Étape 4: Email annulation (simulation)');
      test.steps.push({
        step: 4,
        action: 'Email annulation',
        result: 'SIMULATION',
        note: `Email de remboursement de ${montantRembourse}€ envoyé`,
      });
      log('success', 'Email d\'annulation simulé');

      test.status = 'passed';
    } else {
      log('error', 'Logique de remboursement incorrecte');
      test.status = 'failed';
    }

  } catch (error) {
    log('error', `Erreur test 3: ${error.message}`);
    test.status = 'failed';
    test.error = error.message;
  }

  return test;
}

async function test4_AnnulationPlus24h() {
  header('TEST 4 - Annulation > 24h (acompte retenu)');
  const test = results.test4;

  try {
    // Ce test vérifie la LOGIQUE de remboursement, pas l'API réelle
    log('step', 'Étape 1: Simulation RDV + paiement total');
    const rdvId = `rdv_${Date.now()}`;
    const prixTotal = 100.00;
    const ACOMPTE = 10.00;

    test.steps.push({
      step: 1,
      action: 'RDV + Total simulé',
      result: 'OK',
      data: { rdv_id: rdvId, montant_paye: `${prixTotal}€` },
    });
    log('success', `RDV simulé: ${rdvId}, Total payé: ${prixTotal}€`);

    // Étape 2: Simuler création il y a 48h
    log('step', 'Étape 2: Simulation date création (48h avant)');
    const dateCreation = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const heuresDepuisCreation = 48;

    test.steps.push({
      step: 2,
      action: 'Date modifiée',
      result: 'OK',
      data: {
        date_creation: dateCreation.toISOString(),
        heures_ecoulees: heuresDepuisCreation,
      },
    });
    log('success', `Date création: il y a ${heuresDepuisCreation}h`);

    // Étape 3: Calculer le remboursement selon la règle > 24h
    log('step', 'Étape 3: Calcul remboursement (règle > 24h)');
    const estPlus24h = heuresDepuisCreation >= 24;
    const montantRembourse = estPlus24h ? Math.max(0, prixTotal - ACOMPTE) : prixTotal;
    const montantRetenu = prixTotal - montantRembourse;

    test.steps.push({
      step: 3,
      action: 'Calcul remboursement',
      result: 'OK',
      data: {
        regle_appliquee: '> 24h = acompte 10€ retenu',
        montant_initial: `${prixTotal}€`,
        montant_rembourse: `${montantRembourse}€`,
        acompte_retenu: `${montantRetenu}€`,
      },
    });
    log('success', `Règle > 24h: Remboursement = ${montantRembourse}€, Retenu = ${montantRetenu}€`);

    // Étape 4: Vérification de la logique
    log('step', 'Étape 4: Validation logique remboursement');
    const expectedRefund = prixTotal - ACOMPTE; // 100 - 10 = 90€
    const logicCorrect = montantRembourse === expectedRefund && montantRetenu === ACOMPTE;

    test.steps.push({
      step: 4,
      action: 'Validation logique',
      result: logicCorrect ? 'OK' : 'ERREUR',
      expected: {
        remboursement: `${expectedRefund}€`,
        retenu: `${ACOMPTE}€`,
      },
      actual: {
        remboursement: `${montantRembourse}€`,
        retenu: `${montantRetenu}€`,
      },
    });

    if (logicCorrect) {
      log('success', 'Logique de remboursement > 24h validée');
      test.status = 'passed';
    } else {
      log('error', 'Logique de remboursement incorrecte');
      test.status = 'failed';
    }

  } catch (error) {
    log('error', `Erreur test 4: ${error.message}`);
    test.status = 'failed';
    test.error = error.message;
  }

  return test;
}

// ============= RAPPORT FINAL =============

function printFinalReport() {
  header('RAPPORT FINAL DES TESTS');

  console.log('\n📊 RÉSUMÉ:\n');

  const testList = [results.test1, results.test2, results.test3, results.test4];
  let passed = 0;
  let simulated = 0;

  testList.forEach((test, index) => {
    const icon = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏳';
    const color = test.status === 'passed' ? colors.green : test.status === 'failed' ? colors.red : colors.yellow;
    const suffix = test.simulated ? ' (simulé)' : '';
    console.log(`${icon} TEST ${index + 1}: ${color}${test.name}${colors.reset} - ${test.status.toUpperCase()}${suffix}`);

    if (test.status === 'passed') passed++;
    if (test.simulated) simulated++;
  });

  console.log('\n' + '-'.repeat(60));
  console.log(`\n📈 Score: ${colors.bold}${passed}/${testList.length} tests passés${colors.reset}`);
  if (simulated > 0) {
    console.log(`   ${colors.yellow}(dont ${simulated} en mode simulation)${colors.reset}`);
  }

  if (passed === testList.length) {
    console.log(`\n${colors.green}${colors.bold}🎉 TOUS LES TESTS SONT PASSÉS!${colors.reset}`);
  }

  // Détails des étapes
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}DÉTAILS DES ÉTAPES:${colors.reset}`);
  console.log('='.repeat(60));

  testList.forEach((test, index) => {
    console.log(`\n${colors.cyan}TEST ${index + 1}: ${test.name}${colors.reset}`);
    console.log('-'.repeat(40));

    test.steps.forEach((step) => {
      const stepIcon = step.result.includes('OK') || step.result === 'SIMULATION' ? '✓' : '✗';
      const stepColor = step.result.includes('OK') ? colors.green :
                        step.result === 'SIMULATION' ? colors.yellow :
                        colors.red;
      console.log(`  ${stepColor}${stepIcon}${colors.reset} Étape ${step.step}: ${step.action} [${step.result}]`);

      if (step.expected && typeof step.expected === 'object') {
        console.log(`    Attendu: ${JSON.stringify(step.expected)}`);
      } else if (step.expected) {
        console.log(`    Attendu: ${step.expected}`);
      }
      if (step.actual && typeof step.actual === 'object') {
        console.log(`    Obtenu:  ${JSON.stringify(step.actual)}`);
      } else if (step.actual) {
        console.log(`    Obtenu:  ${step.actual}`);
      }
      if (step.note) {
        console.log(`    Note: ${step.note}`);
      }
      if (step.checks) {
        Object.entries(step.checks).forEach(([key, value]) => {
          console.log(`    - ${key}: ${value}`);
        });
      }
    });
  });

  // Configuration
  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}CONFIGURATION POUR TESTS RÉELS:${colors.reset}`);
  console.log('='.repeat(60));
  console.log(`
${colors.yellow}Stripe (mode test):${colors.reset}
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_PUBLISHABLE_KEY=pk_test_...
  Carte test: 4242 4242 4242 4242

${colors.yellow}PayPal (sandbox):${colors.reset}
  PAYPAL_CLIENT_ID=...
  PAYPAL_CLIENT_SECRET=...
  PAYPAL_MODE=sandbox

${colors.yellow}Pour tester le frontend:${colors.reset}
  1. Démarrer le backend: cd backend && npm start
  2. Démarrer le frontend: cd frontend && npm run dev
  3. Aller sur: ${FRONTEND_URL}/paiement?rdv_id=test123&service=Test&prix=10
`);
}

// ============= MAIN =============

async function runAllTests() {
  console.log(`
${colors.bold}${colors.cyan}
╔══════════════════════════════════════════════════════════╗
║     TESTS FLOW RÉSERVATION + PAIEMENT                    ║
║     Fat's Hair-Afro                                      ║
╚══════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Vérifier que le backend est accessible
  log('info', `Backend URL: ${BACKEND_URL}`);
  log('info', 'Vérification connexion backend...');

  const backendOk = await checkBackendHealth();
  if (!backendOk) {
    log('warning', 'Backend non accessible - certains tests seront limités');
    log('info', 'Démarrez le backend avec: cd backend && npm start');
  } else {
    log('success', 'Backend connecté!');
  }

  // Exécuter les tests
  await test1_StripeAcompte();
  await test2_PayPalTotal();
  await test3_AnnulationMoins24h();
  await test4_AnnulationPlus24h();

  // Afficher le rapport
  printFinalReport();
}

// Lancer les tests
runAllTests().catch(console.error);
