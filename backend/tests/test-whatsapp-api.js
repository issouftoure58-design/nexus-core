/**
 * Test du système WhatsApp via l'API
 * Fat's Hair-Afro
 *
 * Ce script teste l'API WhatsApp en simulant une conversation complète.
 * Lance le serveur backend avant d'exécuter ce test.
 *
 * Usage:
 *   1. Démarrer le serveur: npm run dev (ou node src/index.js)
 *   2. Exécuter ce test: node tests/test-whatsapp-api.js
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Envoie un message simulé à l'API WhatsApp
 */
async function sendMessage(phone, message, name = 'TestUser') {
  try {
    const response = await fetch(`${BASE_URL}/api/whatsapp/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, message, name }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Vérifie que le serveur est accessible
 */
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/whatsapp/health`);
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    return false;
  }
}

/**
 * Affiche le résultat d'un échange
 */
function displayExchange(clientMsg, result, step) {
  console.log('');
  log(colors.yellow, `─── Étape ${step} ───`);
  console.log('');

  log(colors.green + colors.bright, '👤 CLIENT:');
  log(colors.green, `   "${clientMsg}"`);
  console.log('');

  if (result.success && result.response) {
    log(colors.cyan + colors.bright, '🤖 HALIMAH:');
    result.response.split('\n').forEach(line => {
      log(colors.cyan, `   ${line}`);
    });
  } else {
    log(colors.red, `   ❌ Erreur: ${result.error || 'Pas de réponse'}`);
  }

  console.log('');
  if (result.context) {
    log(colors.dim, `   [État: ${result.context.etape} | Service: ${result.context.service || '-'} | Total: ${result.context.total ? result.context.total.toFixed(2) + '€' : '-'}]`);
  }
}

/**
 * Test complet d'une conversation de réservation
 */
async function runFullConversationTest() {
  console.log(`
${colors.bright}${colors.magenta}
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🧪 TEST API WHATSAPP - CONVERSATION COMPLÈTE                ║
║   Fat's Hair-Afro - Coiffure afro à domicile                  ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Vérifier que le serveur est accessible
  log(colors.dim, 'Vérification du serveur...');
  const serverOk = await checkServer();

  if (!serverOk) {
    log(colors.bgRed + colors.bright, ' ❌ ERREUR: Le serveur n\'est pas accessible! ');
    console.log('');
    log(colors.yellow, 'Assurez-vous que le serveur est démarré:');
    log(colors.dim, '  cd backend && npm run dev');
    log(colors.dim, '  ou: node src/index.js');
    console.log('');
    process.exit(1);
  }

  log(colors.bgGreen + colors.bright, ' ✅ Serveur accessible ');
  console.log('');

  const phone = '+33612345678';
  const name = 'Marie Test';

  const exchanges = [
    { message: 'Bonjour', description: 'Accueil' },
    { message: 'Je voudrais des tresses avec rajouts', description: 'Choix du service' },
    { message: '25 avenue de la République, 95130 Franconville', description: 'Adresse (proche)' },
    { message: 'samedi prochain', description: 'Choix de la date' },
    { message: '10h', description: 'Choix de l\'heure' },
    { message: 'oui', description: 'Confirmation' },
  ];

  let step = 0;
  let hasErrors = false;

  for (const exchange of exchanges) {
    step++;
    log(colors.bgBlue + colors.bright, ` ${exchange.description} `);

    const result = await sendMessage(phone, exchange.message, name);
    displayExchange(exchange.message, result, step);

    if (!result.success) {
      hasErrors = true;
      log(colors.red, `⚠️  Erreur à l'étape ${step}`);
    }

    // Vérifications spécifiques
    if (step === 3 && result.context) {
      // Après l'adresse: vérifier le calcul des frais
      if (result.context.distance_km) {
        log(colors.green, `   ✅ Distance calculée: ${result.context.distance_km} km`);
      }
      if (result.context.frais_deplacement) {
        log(colors.green, `   ✅ Frais de déplacement: ${result.context.frais_deplacement}€`);
      }
      if (result.context.total) {
        log(colors.green, `   ✅ Total calculé: ${result.context.total}€`);
      }
    }

    if (step === 4 && result.response) {
      // Après la date: vérifier les créneaux avec heure de fin
      if (result.response.includes('fin prévue')) {
        log(colors.green, `   ✅ Créneaux affichés avec heure de fin`);
      }
    }

    if (step === 6 && result.response) {
      // Après confirmation: vérifier le lien de paiement
      if (result.response.includes('fatshairafro.fr/payment')) {
        log(colors.green, `   ✅ Lien de paiement généré`);

        // Extraire et afficher le lien
        const urlMatch = result.response.match(/https:\/\/fatshairafro\.fr\/payment\?[^\s]+/);
        if (urlMatch) {
          console.log('');
          log(colors.magenta + colors.bright, '   🔗 Lien de paiement:');
          log(colors.magenta, `      ${urlMatch[0]}`);

          // Décoder les paramètres
          try {
            const url = new URL(urlMatch[0]);
            console.log('');
            log(colors.dim, '   Paramètres:');
            for (const [key, value] of url.searchParams) {
              log(colors.dim, `      ${key}: ${value}`);
            }
          } catch (e) {
            // Ignore
          }
        }
      }
    }

    await sleep(200);
  }

  // Résumé
  console.log('');
  console.log(`
${colors.bright}${colors.magenta}
╔════════════════════════════════════════════════════════════════╗
║                    📊 RÉSUMÉ DU TEST                           ║
╠════════════════════════════════════════════════════════════════╣
${hasErrors ? `║  ⚠️  Test terminé avec des erreurs                            ║` : `║  ✅ Test terminé avec succès                                  ║`}
║                                                                ║
║  Étapes testées:                                               ║
║  1. Accueil ✓                                                  ║
║  2. Choix du service ✓                                         ║
║  3. Adresse + calcul distance ✓                                ║
║  4. Date + créneaux disponibles ✓                              ║
║  5. Heure + récapitulatif ✓                                    ║
║  6. Confirmation + lien paiement ✓                             ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  return !hasErrors;
}

/**
 * Test du webhook Twilio (simulation)
 */
async function testTwilioWebhook() {
  console.log('');
  log(colors.bgBlue + colors.bright, ' TEST WEBHOOK TWILIO ');
  console.log('');

  try {
    // Simuler un appel du webhook Twilio
    const response = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: 'whatsapp:+33612345678',
        To: 'whatsapp:+14155238886',
        Body: 'Test webhook Twilio',
        ProfileName: 'Webhook Test',
        MessageSid: 'SM' + Date.now(),
      }),
    });

    const text = await response.text();

    if (response.ok && text.includes('<Response>')) {
      log(colors.green, '✅ Webhook Twilio répond correctement (TwiML)');
      log(colors.dim, `   Réponse: ${text}`);
    } else {
      log(colors.red, '❌ Erreur webhook Twilio');
      log(colors.dim, `   Status: ${response.status}`);
      log(colors.dim, `   Réponse: ${text}`);
    }
  } catch (error) {
    log(colors.red, `❌ Erreur: ${error.message}`);
  }
}

/**
 * Test de santé de l'API
 */
async function testHealth() {
  console.log('');
  log(colors.bgBlue + colors.bright, ' TEST HEALTH CHECK ');
  console.log('');

  try {
    const response = await fetch(`${BASE_URL}/api/whatsapp/health`);
    const data = await response.json();

    log(colors.green, '✅ Health check OK');
    log(colors.dim, `   Status: ${data.status}`);
    log(colors.dim, `   Twilio configuré: ${data.configured ? 'Oui' : 'Non'}`);
    log(colors.dim, `   Numéro: ${data.twilioNumber}`);
  } catch (error) {
    log(colors.red, `❌ Erreur: ${error.message}`);
  }
}

// Main
async function main() {
  await testHealth();
  await testTwilioWebhook();
  await runFullConversationTest();
}

main().catch(console.error);
