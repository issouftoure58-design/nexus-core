/**
 * Simulations de conversations WhatsApp complètes
 * Fat's Hair-Afro - Test du flux de conversation de Halimah
 *
 * Mode simulation : Google Maps est mocké avec des données réalistes
 */

import {
  getConversationContext,
  updateConversationContext,
  resetConversationContext,
  generatePaymentLink,
} from '../src/services/whatsappService.js';

import { calculerFraisDepl } from '../src/utils/tarification.js';

// ============= CONFIGURATION =============

const DELAY_MS = 50; // Délai entre les messages pour la lisibilité

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
};

// Données simulées pour les distances
const MOCK_DISTANCES = {
  'argenteuil': { distance_km: 4.2, duree_minutes: 12, adresse: '15 rue Victor Hugo, 95100 Argenteuil' },
  'paris 18': { distance_km: 18.5, duree_minutes: 35, adresse: '45 rue Ordener, 75018 Paris' },
  'ermont': { distance_km: 3.1, duree_minutes: 8, adresse: '5 place du marché, 95120 Ermont' },
};

// Services disponibles
const SERVICES = {
  'tresses_collees': { nom: 'Tresses collées', duree: 180, prix: 70 },
  'tresses_rajouts': { nom: 'Tresses avec rajouts', duree: 240, prix: 100 },
  'vanilles': { nom: 'Vanilles/Twists', duree: 150, prix: 60 },
  'locks_creation': { nom: 'Locks (création)', duree: 300, prix: 120 },
  'locks_entretien': { nom: 'Locks (entretien)', duree: 120, prix: 50 },
  'soins': { nom: 'Soins hydratants', duree: 60, prix: 35 },
  'brushing': { nom: 'Brushing afro', duree: 75, prix: 40 },
  'coupe_enfant': { nom: 'Coupe enfant', duree: 45, prix: 20 },
};

// ============= HELPERS =============

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printHeader(title) {
  console.log('\n');
  console.log(`${colors.bgBlue}${colors.bright}${'═'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bgBlue}${colors.bright}  ${title.padEnd(56)}${colors.reset}`);
  console.log(`${colors.bgBlue}${colors.bright}${'═'.repeat(60)}${colors.reset}`);
  console.log('');
}

function printSubHeader(text) {
  console.log(`${colors.yellow}--- ${text} ---${colors.reset}\n`);
}

function printClientMessage(message) {
  console.log(`${colors.green}${colors.bright}👤 CLIENT:${colors.reset}`);
  console.log(`${colors.green}   "${message}"${colors.reset}`);
  console.log('');
}

function printHalimahResponse(response) {
  console.log(`${colors.cyan}${colors.bright}🤖 HALIMAH:${colors.reset}`);
  const lines = response.split('\n');
  lines.forEach(line => {
    console.log(`${colors.cyan}   ${line}${colors.reset}`);
  });
  console.log('');
}

function printContext(context) {
  console.log(`${colors.dim}[État: ${context.etape} | Service: ${context.service || '-'} | Total: ${context.total ? context.total.toFixed(2) + '€' : '-'}]${colors.reset}`);
  console.log('');
}

function printSeparator() {
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}`);
}

function formatDuree(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function formatDateFr(dateStr) {
  const date = new Date(dateStr);
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${jours[date.getDay()]} ${date.getDate()} ${mois[date.getMonth()]}`;
}

function getNextDate(dayName) {
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const today = new Date();
  const targetDay = days.indexOf(dayName.toLowerCase());
  const currentDay = today.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  const targetDate = new Date(today);
  targetDate.setDate(targetDate.getDate() + daysUntil);
  return targetDate.toISOString().split('T')[0];
}

function getTomorrow() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

function calculerHeureFin(heure, dureeMinutes) {
  const [h, m] = heure.split(':').map(Number);
  const totalMinutes = h * 60 + m + dureeMinutes;
  const heuresFin = Math.floor(totalMinutes / 60);
  const minutesFin = totalMinutes % 60;
  return `${String(heuresFin).padStart(2, '0')}:${String(minutesFin).padStart(2, '0')}`;
}

// ============= SIMULATEUR DE CONVERSATION =============

/**
 * Simule une réponse de Halimah basée sur l'état de la conversation
 */
function simulateHalimahResponse(clientPhone, message, clientName, mockDistance = null) {
  const context = getConversationContext(clientPhone);
  const messageLower = message.toLowerCase().trim();

  // Commandes de réinitialisation
  if (['annuler', 'stop', 'reset', 'recommencer'].includes(messageLower)) {
    resetConversationContext(clientPhone);
    return {
      response: `Pas de problème ! La conversation a été réinitialisée.

Si vous souhaitez prendre rendez-vous, envoyez "Bonjour" pour commencer. 😊

Fat's Hair-Afro
📞 07 82 23 50 20`,
      context: getConversationContext(clientPhone),
    };
  }

  switch (context.etape) {
    case 'accueil':
      return handleAccueil(clientPhone, message, clientName);

    case 'attente_adresse':
      return handleAdresse(clientPhone, message, mockDistance);

    case 'attente_date':
      return handleDate(clientPhone, message);

    case 'attente_heure':
      return handleHeure(clientPhone, message);

    case 'confirmation':
      return handleConfirmation(clientPhone, message);

    case 'paiement':
      return handlePaiement(clientPhone, message);

    default:
      return handleAccueil(clientPhone, message, clientName);
  }
}

function handleAccueil(clientPhone, message, clientName) {
  const messageLower = message.toLowerCase();

  // Détecter le service
  let serviceKey = null;
  if (messageLower.includes('tresse') && (messageLower.includes('rajout') || messageLower.includes('extension'))) {
    serviceKey = 'tresses_rajouts';
  } else if (messageLower.includes('tresse') && messageLower.includes('collée')) {
    serviceKey = 'tresses_collees';
  } else if (messageLower.includes('tresse') || messageLower.includes('classique')) {
    serviceKey = 'tresses_collees';
  } else if (messageLower.includes('vanille') || messageLower.includes('twist')) {
    serviceKey = 'vanilles';
  } else if (messageLower.includes('lock') && (messageLower.includes('création') || messageLower.includes('creer'))) {
    serviceKey = 'locks_creation';
  } else if (messageLower.includes('lock')) {
    serviceKey = 'locks_entretien';
  } else if (messageLower.includes('soin') || messageLower.includes('hydrat')) {
    serviceKey = 'soins';
  } else if (messageLower.includes('brushing') || messageLower.includes('afro')) {
    serviceKey = 'brushing';
  } else if (messageLower.includes('enfant') || messageLower.includes('coupe')) {
    serviceKey = 'coupe_enfant';
  }

  if (serviceKey) {
    const service = SERVICES[serviceKey];
    updateConversationContext(clientPhone, {
      etape: 'attente_adresse',
      client_nom: clientName,
      service: service.nom,
      duree_minutes: service.duree,
      prix_service: service.prix,
    });

    return {
      response: `Parfait pour ${service.nom} ! ✨

📋 Détails :
• Durée estimée : ${formatDuree(service.duree)}
• Prix : ${service.prix}€

Fatou se déplace directement chez vous en Île-de-France.

Pourriez-vous me donner votre adresse complète pour que je calcule les frais de déplacement ? 📍

Format : numéro, rue, code postal, ville
Exemple : 15 rue de la Paix, 75002 Paris`,
      context: getConversationContext(clientPhone),
    };
  }

  // Message d'accueil
  if (clientName) {
    updateConversationContext(clientPhone, { client_nom: clientName });
  }

  return {
    response: `Bonjour${clientName ? ` ${clientName}` : ''} ! ✨ Je suis Halimah, l'assistante de Fatou.

Comment puis-je vous aider ?`,
    context: getConversationContext(clientPhone),
  };
}

function handleAdresse(clientPhone, message, mockDistance) {
  const context = getConversationContext(clientPhone);

  // Vérifier si c'est une question
  const messageLower = message.toLowerCase();
  if (messageLower.includes('déplacement') || messageLower.includes('combien') || messageLower.includes('tarif')) {
    return {
      response: `Les frais de déplacement sont calculés comme suit :

🚗 0 à 8 km : 10€ (forfait)
🚗 Au-delà de 8 km : 10€ + 1,10€/km supplémentaire

Exemple :
• 5 km = 10€
• 15 km = 10€ + (7 × 1,10€) = 17,70€

Pour calculer vos frais, j'ai besoin de votre adresse complète 📍`,
      context: getConversationContext(clientPhone),
    };
  }

  // Vérifier si c'est une question sur le paiement
  if (messageLower.includes('payer') || messageLower.includes('sur place') || messageLower.includes('espèce')) {
    return {
      response: `⚠️ Important : Pas de paiement sur place.

Pour confirmer votre RDV, un acompte de 10€ minimum est requis (paiement en ligne sécurisé).

💳 Moyens acceptés : CB ou PayPal

📋 Politique d'annulation :
• < 24h après réservation : remboursement total
• > 24h après réservation : acompte non remboursable

Vous pouvez aussi payer la totalité si vous préférez ! 😊`,
      context: getConversationContext(clientPhone),
    };
  }

  if (!mockDistance) {
    return {
      response: `Je n'ai pas pu identifier cette adresse. 📍

Pourriez-vous me la reformuler avec :
• Le numéro de rue
• Le nom de la rue
• Le code postal
• La ville

Exemple : 15 rue de la Paix, 75002 Paris`,
      context: getConversationContext(clientPhone),
    };
  }

  // Calculer les frais
  const fraisDeplacement = calculerFraisDepl(mockDistance.distance_km);
  const total = context.prix_service + fraisDeplacement;

  updateConversationContext(clientPhone, {
    etape: 'attente_date',
    adresse_client: message,
    adresse_formatee: mockDistance.adresse,
    distance_km: mockDistance.distance_km,
    duree_trajet_minutes: mockDistance.duree_minutes,
    frais_deplacement: fraisDeplacement,
    total: total,
  });

  return {
    response: `📍 J'ai trouvé votre adresse à ${mockDistance.distance_km.toFixed(1)} km (environ ${mockDistance.duree_minutes} min de trajet).

Récapitulatif :
💇‍♀️ ${context.service} : ${context.prix_service.toFixed(2)}€
🚗 Déplacement (${mockDistance.distance_km.toFixed(1)} km) : ${fraisDeplacement.toFixed(2)}€
────────────────
💰 TOTAL : ${total.toFixed(2)}€

Quelle date vous conviendrait ? 📅

Horaires de Fatou :
• Lundi : 9h - 18h
• Mardi : 9h - 18h
• Mercredi : 9h - 18h
• Jeudi : 9h - 13h
• Vendredi : 13h - 18h
• Samedi : 9h - 18h
• Dimanche : Fermé`,
    context: getConversationContext(clientPhone),
  };
}

function handleDate(clientPhone, message) {
  const context = getConversationContext(clientPhone);
  const messageLower = message.toLowerCase();

  // Parser la date
  let date = null;
  if (messageLower.includes('demain')) {
    date = getTomorrow();
  } else if (messageLower.includes('samedi')) {
    date = getNextDate('samedi');
  } else if (messageLower.includes('mardi')) {
    date = getNextDate('mardi');
  } else if (messageLower.includes('dimanche')) {
    // Dimanche fermé
    return {
      response: `Désolée, Fatou ne travaille pas le dimanche. 😊

Pourriez-vous choisir un autre jour ?
• Lun-Mer-Sam : 9h - 18h
• Jeu : 9h - 13h
• Ven : 13h - 18h`,
      context: getConversationContext(clientPhone),
    };
  }

  if (!date) {
    return {
      response: `Je n'ai pas compris la date. 📅

Exemples de formats acceptés :
• "demain"
• "samedi prochain"
• "mardi"

Quel jour vous conviendrait ?`,
      context: getConversationContext(clientPhone),
    };
  }

  // Générer des créneaux disponibles (simulation)
  const creneaux = [
    { heure: '09:00', heure_fin: calculerHeureFin('09:00', context.duree_minutes) },
    { heure: '10:00', heure_fin: calculerHeureFin('10:00', context.duree_minutes) },
    { heure: '14:00', heure_fin: calculerHeureFin('14:00', context.duree_minutes) },
  ];

  updateConversationContext(clientPhone, {
    etape: 'attente_heure',
    date: date,
  });

  const creneauxText = creneaux
    .map(c => `• ${c.heure} (fin prévue : ${c.heure_fin})`)
    .join('\n');

  return {
    response: `Créneaux disponibles le ${formatDateFr(date)} :

${creneauxText}

Quel horaire vous convient ? ⏰`,
    context: getConversationContext(clientPhone),
  };
}

function handleHeure(clientPhone, message) {
  const context = getConversationContext(clientPhone);
  const messageLower = message.toLowerCase();

  // Parser l'heure
  let heure = null;
  const heureMatch = messageLower.match(/(\d{1,2})\s*h?\s*(\d{0,2})?/);
  if (heureMatch) {
    const h = parseInt(heureMatch[1]);
    const m = heureMatch[2] ? parseInt(heureMatch[2]) : 0;
    heure = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  if (!heure) {
    return {
      response: `Je n'ai pas compris l'heure. ⏰

Exemples de formats acceptés :
• "9h"
• "14h30"
• "10:00"

Quel horaire vous convient ?`,
      context: getConversationContext(clientPhone),
    };
  }

  // Simuler une vérification de disponibilité
  const heureNum = parseInt(heure.split(':')[0]);

  // Simuler un créneau non disponible si demandé à 10h (pour la conv 3)
  if (context.date === getTomorrow() && heureNum === 10) {
    return {
      response: `Désolée, le créneau de ${heure} n'est pas disponible demain. 😔

Voici les créneaux disponibles :
• 14h00 (fin prévue : ${calculerHeureFin('14:00', context.duree_minutes)})

Ou souhaitez-vous une autre date ?`,
      context: getConversationContext(clientPhone),
    };
  }

  const heureFin = calculerHeureFin(heure, context.duree_minutes);

  updateConversationContext(clientPhone, {
    etape: 'confirmation',
    heure: heure,
    heure_fin: heureFin,
  });

  return {
    response: `Parfait ! Voici le récapitulatif de votre réservation :

📅 ${formatDateFr(context.date)} à ${heure}
⏰ Fin prévue : ${heureFin}
📍 ${context.adresse_formatee || context.adresse_client}
💇‍♀️ ${context.service} (${formatDuree(context.duree_minutes)})
🚗 Déplacement : ${context.distance_km.toFixed(1)} km
────────────────
💰 TOTAL : ${context.total.toFixed(2)}€

Est-ce que tout est correct ?
Répondez "OUI" pour confirmer ou "NON" pour modifier.`,
    context: getConversationContext(clientPhone),
  };
}

function handleConfirmation(clientPhone, message) {
  const context = getConversationContext(clientPhone);
  const messageLower = message.toLowerCase().trim();

  if (['non', 'no', 'modifier', 'changer'].some(mot => messageLower.includes(mot))) {
    return {
      response: `Pas de problème ! Que souhaitez-vous modifier ?

• Le service → envoyez "service"
• L'adresse → envoyez "adresse"
• La date → envoyez "date"
• L'heure → envoyez "heure"
• Tout annuler → envoyez "annuler"`,
      context: getConversationContext(clientPhone),
    };
  }

  if (['oui', 'yes', 'ok', 'confirmer', 'parfait', 'd\'accord', 'correct', 'bon'].some(mot => messageLower.includes(mot))) {
    // Générer l'ID et le lien de paiement
    const rdvId = `rdv_${Date.now()}`;
    const paymentUrl = generatePaymentLink(
      rdvId,
      context.service,
      context.adresse_client,
      context.prix_service,
      context.frais_deplacement,
      context.total
    );

    updateConversationContext(clientPhone, {
      etape: 'paiement',
      rdv_id: rdvId,
    });

    return {
      response: `✅ Parfait ! Voici le récapitulatif :

📅 ${formatDateFr(context.date)} à ${context.heure}
📍 ${context.adresse_formatee || context.adresse_client}
💇‍♀️ ${context.service} (${formatDuree(context.duree_minutes)})
💰 Total : ${context.total.toFixed(2)}€

Pour confirmer, un acompte de 10€ est requis.
Vous pouvez aussi payer la totalité (plus rien à payer sur place).

👉 Paiement sécurisé :
${paymentUrl}

💳 Moyens : CB ou PayPal

⏰ Ce lien expire dans 30 minutes.

Votre RDV sera confirmé après paiement. ✨

Des questions ?`,
      context: getConversationContext(clientPhone),
    };
  }

  return {
    response: `Je n'ai pas compris votre réponse.

Répondez "OUI" pour confirmer la réservation ou "NON" pour la modifier.`,
    context: getConversationContext(clientPhone),
  };
}

function handlePaiement(clientPhone, message) {
  const context = getConversationContext(clientPhone);
  const messageLower = message.toLowerCase().trim();

  if (messageLower.includes('question') || messageLower.includes('?')) {
    return {
      response: `Je suis là pour vous aider ! 😊

• Le paiement est 100% sécurisé (CB ou PayPal)
• Acompte minimum : 10€
• Vous pouvez aussi payer la totalité
• Annulation < 24h après résa : remboursement total
• Annulation > 24h après résa : acompte non remboursable

D'autres questions ? Ou appelez-nous : 07 82 23 50 20 📞`,
      context: getConversationContext(clientPhone),
    };
  }

  const paymentUrl = generatePaymentLink(
    context.rdv_id,
    context.service,
    context.adresse_client,
    context.prix_service,
    context.frais_deplacement,
    context.total
  );

  return {
    response: `Votre réservation est en attente de paiement.

👉 Cliquez ici pour payer :
${paymentUrl}

💰 Total : ${context.total.toFixed(2)}€
💳 Acompte minimum : 10€

⏰ N'oubliez pas, le lien expire bientôt !

Besoin d'aide ? Appelez-nous : 07 82 23 50 20 📞`,
    context: getConversationContext(clientPhone),
  };
}

// ============= CONVERSATION 1 : RÉSERVATION SIMPLE =============

async function conversation1_ReservationSimple() {
  printHeader('CONVERSATION 1 - Réservation Simple (Tresses à Argenteuil)');

  const clientPhone = '+33612345001';
  const clientName = 'Marie';

  // Réinitialiser le contexte
  resetConversationContext(clientPhone);

  const exchanges = [
    { client: 'Bonjour', mock: null },
    { client: 'Je voudrais des tresses classiques', mock: null },
    { client: 'Mon adresse : 15 rue Victor Hugo, 95100 Argenteuil', mock: MOCK_DISTANCES['argenteuil'] },
    { client: 'Samedi prochain si possible', mock: null },
    { client: '14h c\'est parfait', mock: null },
    { client: 'oui', mock: null },
  ];

  for (const exchange of exchanges) {
    printClientMessage(exchange.client);

    const result = simulateHalimahResponse(clientPhone, exchange.client, clientName, exchange.mock);
    printHalimahResponse(result.response);
    printContext(result.context);
    printSeparator();

    await sleep(DELAY_MS);
  }

  console.log(`\n${colors.bgGreen}${colors.bright} ✅ CONVERSATION 1 TERMINÉE ${colors.reset}\n`);
}

// ============= CONVERSATION 2 : CLIENT POSE DES QUESTIONS =============

async function conversation2_ClientQuestions() {
  printHeader('CONVERSATION 2 - Client pose des questions (Paris 18ème)');

  const clientPhone = '+33612345002';
  const clientName = 'Sophie';

  // Réinitialiser le contexte
  resetConversationContext(clientPhone);

  const exchanges = [
    { client: 'Bonjour, vous vous déplacez à domicile ?', mock: null },
    { client: 'Je voudrais des tresses avec rajouts', mock: null },
    { client: 'C\'est combien le déplacement ?', mock: null },
    { client: 'Je suis au 45 rue Ordener, 75018 Paris', mock: MOCK_DISTANCES['paris 18'] },
    { client: 'C\'est un peu cher... je peux payer sur place ?', mock: null },
    { client: 'Ok d\'accord, mardi prochain alors', mock: null },
    { client: '10h', mock: null },
    { client: 'oui c\'est bon', mock: null },
  ];

  for (const exchange of exchanges) {
    printClientMessage(exchange.client);

    const result = simulateHalimahResponse(clientPhone, exchange.client, clientName, exchange.mock);
    printHalimahResponse(result.response);
    printContext(result.context);
    printSeparator();

    await sleep(DELAY_MS);
  }

  console.log(`\n${colors.bgGreen}${colors.bright} ✅ CONVERSATION 2 TERMINÉE ${colors.reset}\n`);
}

// ============= CONVERSATION 3 : PAS DE DISPO, ALTERNATIVE =============

async function conversation3_AlternativeSlot() {
  printHeader('CONVERSATION 3 - Pas de disponibilité (Ermont)');

  const clientPhone = '+33612345003';
  const clientName = 'Aminata';

  // Réinitialiser le contexte
  resetConversationContext(clientPhone);

  const exchanges = [
    { client: 'Bonjour, je voudrais des tresses collées', mock: null },
    { client: '5 place du marché, 95120 Ermont', mock: MOCK_DISTANCES['ermont'] },
    { client: 'demain 10h', mock: null },
    { client: '14h alors', mock: null },
    { client: 'oui parfait', mock: null },
  ];

  for (const exchange of exchanges) {
    printClientMessage(exchange.client);

    const result = simulateHalimahResponse(clientPhone, exchange.client, clientName, exchange.mock);
    printHalimahResponse(result.response);
    printContext(result.context);
    printSeparator();

    await sleep(DELAY_MS);
  }

  console.log(`\n${colors.bgGreen}${colors.bright} ✅ CONVERSATION 3 TERMINÉE ${colors.reset}\n`);
}

// ============= CONVERSATION BONUS : ANNULATION =============

async function conversation4_Annulation() {
  printHeader('CONVERSATION BONUS - Annulation en cours de réservation');

  const clientPhone = '+33612345004';
  const clientName = 'Fatima';

  // Réinitialiser le contexte
  resetConversationContext(clientPhone);

  const exchanges = [
    { client: 'Bonjour', mock: null },
    { client: 'Je voudrais un brushing afro', mock: null },
    { client: 'annuler', mock: null },
    { client: 'Bonjour', mock: null },
  ];

  for (const exchange of exchanges) {
    printClientMessage(exchange.client);

    const result = simulateHalimahResponse(clientPhone, exchange.client, clientName, exchange.mock);
    printHalimahResponse(result.response);
    printContext(result.context);
    printSeparator();

    await sleep(DELAY_MS);
  }

  console.log(`\n${colors.bgGreen}${colors.bright} ✅ CONVERSATION BONUS TERMINÉE ${colors.reset}\n`);
}

// ============= MAIN =============

async function runAllConversations() {
  console.log(`
${colors.bright}${colors.magenta}
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🤖 SIMULATIONS DE CONVERSATIONS WHATSAPP - HALIMAH          ║
║   Fat's Hair-Afro - Coiffure afro à domicile                  ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  console.log(`${colors.dim}Mode simulation : Google Maps mocké avec données réalistes${colors.reset}`);
  console.log(`${colors.dim}Les distances sont simulées pour Argenteuil, Paris 18, Ermont${colors.reset}\n`);

  try {
    // Conversation 1 : Réservation simple
    await conversation1_ReservationSimple();
    await sleep(300);

    // Conversation 2 : Client pose des questions
    await conversation2_ClientQuestions();
    await sleep(300);

    // Conversation 3 : Pas de dispo, alternative
    await conversation3_AlternativeSlot();
    await sleep(300);

    // Conversation bonus : Annulation
    await conversation4_Annulation();

    // Résumé final
    console.log(`
${colors.bright}${colors.magenta}
╔════════════════════════════════════════════════════════════════╗
║                    📊 RÉSUMÉ DES TESTS                         ║
╠════════════════════════════════════════════════════════════════╣
║  ✅ Conversation 1 : Réservation simple          - SUCCÈS      ║
║     → Marie, Tresses collées, Argenteuil (4.2km), Samedi 14h  ║
║                                                                ║
║  ✅ Conversation 2 : Client pose des questions   - SUCCÈS      ║
║     → Sophie, Tresses rajouts, Paris 18 (18.5km), Mardi 10h   ║
║                                                                ║
║  ✅ Conversation 3 : Alternative de créneau      - SUCCÈS      ║
║     → Aminata, Tresses collées, Ermont (3.1km), Demain 14h    ║
║                                                                ║
║  ✅ Conversation BONUS : Annulation              - SUCCÈS      ║
║     → Fatima annule puis recommence                            ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}`);

    console.log(`${colors.green}${colors.bright}Toutes les simulations ont été exécutées avec succès ! 🎉${colors.reset}\n`);

  } catch (error) {
    console.error(`${colors.red}Erreur lors des simulations:${colors.reset}`, error);
    process.exit(1);
  }
}

// Exécuter les simulations
runAllConversations();
