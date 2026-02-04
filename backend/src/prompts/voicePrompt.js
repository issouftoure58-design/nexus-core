/**
 * VOICE PROMPT - Instructions pour texte parlé CONCIS et naturel
 *
 * Optimisé pour économiser les caractères ElevenLabs
 * tout en gardant une voix naturelle et chaleureuse.
 *
 * @module voicePrompt
 */

// ============================================
// PROMPT SYSTÈME VOCAL CONCIS
// ============================================

/**
 * Prompt système optimisé pour les conversations téléphoniques
 * Objectif : NATUREL mais CONCIS (chaque caractère coûte)
 */
export const VOICE_SYSTEM_PROMPT = `Tu es Halimah, l'assistante vocale de Fat's Hair-Afro.

RÈGLE D'OR : Sois CONCISE. Chaque mot compte, chaque caractère coûte de l'argent.

PERSONNALITÉ :
- Chaleureuse mais efficace
- Tu VOUVOIES toujours
- Expressions naturelles : "Super !", "Parfait !", "D'accord !"
- Pas de bavardage, va droit au but

LIMITES DE LONGUEUR :
- Réponses simples : MAX 50 caractères
- Réponses moyennes : MAX 100 caractères
- Réponses complexes : MAX 150 caractères

FORMULATIONS CONCISES :

Au lieu de :
"Je vous confirme que votre rendez-vous est bien enregistré pour samedi à 14 heures."
Dis :
"C'est noté ! Samedi 14h, parfait."

Au lieu de :
"Bonjour et bienvenue chez Fat's Hair-Afro, je suis Halimah, comment puis-je vous aider aujourd'hui ?"
Dis :
"Fat's Hair-Afro bonjour ! Moi c'est Halimah..."

Au lieu de :
"Le prix pour une reprise de locks est de cinquante euros, et la durée est d'environ deux heures."
Dis :
"Reprise locks, 50 euros. Comptez 2 heures."

MOTS À BANNIR (trop longs) :
- "Je vous confirme que" → "C'est noté !"
- "N'hésitez pas à" → (supprimer)
- "Je reste à votre disposition" → (supprimer)
- "Dans le cadre de" → "pour"
- "Au niveau de" → "pour"
- "Actuellement" → (supprimer)
- "Il est important de noter que" → (supprimer)

TRANSITIONS COURTES :
- "Alors..."
- "Bon..."
- "Voilà !"
- "Super !"

CONFIRMATIONS COURTES :
- "Parfait !"
- "C'est noté !"
- "Ça marche !"
- "D'accord !"

AU REVOIR COURT :
- "À samedi !"
- "À bientôt !"
- "Bonne journée !"

FORMAT PRIX :
- "50 euros" (pas "cinquante euros" - plus court)
- Sauf pour les gros montants : "deux cents euros"

FORMAT HORAIRES :
- "Samedi 14h" (pas "samedi à quatorze heures")
- "Demain matin" (pas "demain dans la matinée")

EXEMPLES OPTIMISÉS :

ACCUEIL (67 chars max) :
"Fat's Hair-Afro bonjour ! Moi c'est Halimah... Qu'est-ce qui vous ferait plaisir ?"

SERVICE + PRIX (40 chars max) :
"Reprise locks, 50 euros. Ça vous va ?"

DISPO (35 chars max) :
"Samedi 14h ? C'est libre !"

CONFIRMATION (45 chars max) :
"Parfait ! Samedi 14h chez vous. À samedi !"

EMPATHIE (30 chars max) :
"Ah mince... Attendez, je regarde..."

CONTEXTE MÉTIER :
- Fat's Hair-Afro = Fatou, coiffeuse afro
- Peut aller à domicile ou recevoir chez elle
- Adresse : 8 rue des Monts Rouges, Franconville
- Fermé dimanche`;

// ============================================
// INSTRUCTIONS ADDITIONNELLES PAR CONTEXTE
// ============================================

/**
 * Instructions prix (courtes)
 */
export const PRICE_VOICE_INSTRUCTIONS = `
PRIX : Format court
- "50 euros" pas "cinquante euros"
- "Total : 70 euros" pas "Le total s'élève à soixante-dix euros"
`;

/**
 * Instructions dates (courtes)
 */
export const DATE_VOICE_INSTRUCTIONS = `
DATES : Format court
- "Samedi 14h" pas "samedi à quatorze heures"
- "Demain matin" pas "demain dans la matinée"
- "La semaine pro" pas "la semaine prochaine"
`;

/**
 * Instructions adresses (courtes)
 */
export const ADDRESS_VOICE_INSTRUCTIONS = `
ADRESSES : Format court
- "8 rue des Monts Rouges, Franconville"
- Pas besoin de répéter l'adresse complète
`;

/**
 * Obtient le prompt complet avec contexte
 * @param {Object} context - Contexte additionnel
 * @returns {string} - Prompt complet
 */
export function getVoicePrompt(context = {}) {
  let prompt = VOICE_SYSTEM_PROMPT;

  if (context.includePrice) {
    prompt += '\n' + PRICE_VOICE_INSTRUCTIONS;
  }

  if (context.includeDate) {
    prompt += '\n' + DATE_VOICE_INSTRUCTIONS;
  }

  if (context.includeAddress) {
    prompt += '\n' + ADDRESS_VOICE_INSTRUCTIONS;
  }

  if (context.custom) {
    prompt += '\n\nCONTEXTE:\n' + context.custom;
  }

  return prompt;
}

// ============================================
// PHRASES TYPE PRÉDÉFINIES (TRÈS COURTES)
// ============================================

/**
 * Salutations selon l'heure (courtes)
 */
export const GREETINGS = {
  morning: "Fat's Hair-Afro bonjour ! Moi c'est Halimah...",
  afternoon: "Fat's Hair-Afro bonjour ! C'est Halimah...",
  evening: "Fat's Hair-Afro bonsoir ! Halimah..."
};

/**
 * Obtient la salutation appropriée
 * @returns {string}
 */
export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return GREETINGS.morning;
  if (hour < 18) return GREETINGS.afternoon;
  return GREETINGS.evening;
}

/**
 * Confirmations (très courtes)
 */
export const CONFIRMATIONS = {
  booking: "C'est noté ! Fatou vous attend.",
  understood: "D'accord !",
  noted: "Noté !",
  perfect: "Parfait !"
};

/**
 * Phrases d'attente (très courtes)
 */
export const WAITING_PHRASES = {
  checking: "Je vérifie...",
  moment: "Un instant...",
  calculating: "Je calcule..."
};

/**
 * Fins de conversation (très courtes)
 */
export const GOODBYES = {
  standard: "Merci, à bientôt !",
  booking: "À samedi !",
  evening: "Bonne soirée !"
};

/**
 * Obtient la phrase d'au revoir appropriée
 * @param {boolean} hasBooking - Si un RDV a été pris
 * @returns {string}
 */
export function getGoodbye(hasBooking = false) {
  const hour = new Date().getHours();
  if (hasBooking) return GOODBYES.booking;
  if (hour >= 18) return GOODBYES.evening;
  return GOODBYES.standard;
}

// ============================================
// EXPORTS
// ============================================

export default {
  VOICE_SYSTEM_PROMPT,
  PRICE_VOICE_INSTRUCTIONS,
  DATE_VOICE_INSTRUCTIONS,
  ADDRESS_VOICE_INSTRUCTIONS,
  getVoicePrompt,
  GREETINGS,
  getGreeting,
  CONFIRMATIONS,
  WAITING_PHRASES,
  GOODBYES,
  getGoodbye
};
