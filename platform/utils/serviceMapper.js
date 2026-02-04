/**
 * Mapping noms services variants → noms DB exacts
 * Utilisé par tous les canaux (téléphone, chat, WhatsApp, etc.)
 */

const SERVICE_MAPPING = {
  // Tresses
  'nattes cornrow': 'Nattes collées cornrow',
  'nattes collees cornrow': 'Nattes collées cornrow',
  'nattes collées cornrow': 'Nattes collées cornrow',
  'cornrow': 'Nattes collées cornrow',
  'cornrows': 'Nattes collées cornrow',

  'nattes stitch braid': 'Nattes collées stitch braid',
  'nattes collees stitch braid': 'Nattes collées stitch braid',
  'nattes collées stitch braid': 'Nattes collées stitch braid',
  'stitch braid': 'Nattes collées stitch braid',
  'stitch braids': 'Nattes collées stitch braid',

  'braids simples': 'Box Braids',
  'braids simple': 'Box Braids',
  'braid simple': 'Box Braids',

  'box braids': 'Box Braids',
  'box braid': 'Box Braids',

  'chignon': 'Chignon',

  'crochet braids naturelles': 'Crochet Braids Naturelles',
  'crochet braids': 'Crochet Braids Naturelles',
  'crochet braid': 'Crochet Braids Naturelles',

  'fulani braids': 'Fulani Braids',
  'fulani': 'Fulani Braids',

  'bohemian fulani': 'Bohemian Fulani',
  'bohemian': 'Bohemian Fulani',

  'senegalese twists': 'Senegalese Twists',
  'senegalese twist': 'Senegalese Twists',
  'twists senegalais': 'Senegalese Twists',
  'twists sénégalais': 'Senegalese Twists',

  'passion twist': 'Passion Twist',
  'passion twists': 'Passion Twist',

  'boho braids': 'Boho Braids',
  'boho braid': 'Boho Braids',

  // Locks
  'depart locks vanille': 'Départ Locks Vanille',
  'départ locks vanille': 'Départ Locks Vanille',
  'locks vanille': 'Départ Locks Vanille',

  'reparation locks': 'Réparation Locks',
  'réparation locks': 'Réparation Locks',
  'reparation lock': 'Réparation Locks',
  'réparation lock': 'Réparation Locks',

  'creation crochet locks': 'Création crochet locks',
  'création crochet locks': 'Création crochet locks',
  'crochet locks': 'Création crochet locks',

  'creation microlocks crochet': 'Création microlocks crochet',
  'création microlocks crochet': 'Création microlocks crochet',
  'microlocks crochet': 'Création microlocks crochet',

  'creation microlocks twist': 'Création microlocks twist',
  'création microlocks twist': 'Création microlocks twist',
  'microlocks twist': 'Création microlocks twist',

  'reprise racines locks': 'Reprise racines locks',
  'reprise locks': 'Reprise racines locks',

  'reprise racines microlocks': 'Reprise racines microlocks',
  'reprise microlocks': 'Reprise racines microlocks',

  'decapage locks': 'Décapage locks',
  'décapage locks': 'Décapage locks',
  'decapage': 'Décapage locks',
  'décapage': 'Décapage locks',

  // Soins
  'soin complet': 'Soin complet',
  'soin hydratant': 'Soin hydratant',
  'hydratation': 'Soin hydratant',
  'shampoing': 'Shampoing',
  'shampooing': 'Shampoing',
  'brushing afro': 'Brushing afro',
  'brushing': 'Brushing afro',

  // Coloration
  'teinture sans ammoniaque': 'Teinture sans ammoniaque',
  'teinture': 'Teinture sans ammoniaque',
  'coloration': 'Teinture sans ammoniaque',
  'decoloration': 'Décoloration',
  'décoloration': 'Décoloration',
};

/**
 * Normaliser nom service → nom DB exact
 * @param {string} input - Nom reçu (potentiellement approximatif)
 * @returns {string} Nom exact DB ou input original si pas trouvé
 */
export function normalizeServiceName(input) {
  if (!input) return input;

  const clean = input.toLowerCase().trim();

  // Direct match
  if (SERVICE_MAPPING[clean]) {
    console.log(`[SERVICE MAPPER] "${input}" → "${SERVICE_MAPPING[clean]}"`);
    return SERVICE_MAPPING[clean];
  }

  // Match sans accents
  const noAccents = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (SERVICE_MAPPING[noAccents]) {
    console.log(`[SERVICE MAPPER] "${input}" → "${SERVICE_MAPPING[noAccents]}"`);
    return SERVICE_MAPPING[noAccents];
  }

  // Pas trouvé
  console.log(`[SERVICE MAPPER] ⚠️ Non mappé: "${input}" (passé tel quel)`);
  return input;
}

export default { normalizeServiceName };
