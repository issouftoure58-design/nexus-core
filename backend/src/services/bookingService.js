/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║   SERVICE DE RESERVATION UNIFIE                               [LOCKED]        ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   ⛔ FICHIER VERROUILLE - Ne pas modifier sans autorisation                   ║
 * ║                                                                               ║
 * ║   Utilise par : Agent telephone, Chat Halimah, API booking                    ║
 * ║                                                                               ║
 * ║   Fonctionnalites :                                                           ║
 * ║   - Calcul distance (Google Maps)                                             ║
 * ║   - Calcul frais de deplacement (via TRAVEL_FEES)                             ║
 * ║   - Verification disponibilite (anti-chevauchement)                           ║
 * ║   - Verification horaires (via BUSINESS_HOURS)                                ║
 * ║   - Tarifs services                                                           ║
 * ║   - Creation RDV / Envoi SMS                                                  ║
 * ║                                                                               ║
 * ║   *** NEXUS CORE COMPLIANT ***                                                ║
 * ║   - FRAIS_DEPLACEMENT : derives de TRAVEL_FEES                                ║
 * ║   - HORAIRES : derives de BUSINESS_HOURS                                      ║
 * ║                                                                               ║
 * ║   Voir : backend/NEXUS_LOCK.md                                                ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

import { createClient } from '@supabase/supabase-js';
import dateService from './dateService.js';
// *** IMPORT DEPUIS NEXUS CORE - SOURCE UNIQUE DE VÉRITÉ ***
import { TRAVEL_FEES, BUSINESS_HOURS } from '../config/businessRules.js';
// 🔒 FONCTION UNIQUE DE CRÉATION RDV (import différé pour éviter cycle)
let createReservationUnifiedFn = null;
async function getCreateReservationUnified() {
  if (!createReservationUnifiedFn) {
    const nexusCore = await import('../core/unified/nexusCore.js');
    createReservationUnifiedFn = nexusCore.createReservationUnified;
  }
  return createReservationUnifiedFn;
}

// Exporter les fonctions de dates
export const { getTodayInfo, getDateInfo, getJourSemaine, validateDate } = dateService;

// ============================================
// CONFIGURATION
// ============================================

let supabase = null;

function getSupabase() {
  if (!supabase && process.env.SUPABASE_URL) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
  }
  return supabase;
}

// Adresse de base de Fatou
const FATOU_ADDRESS = '8 rue des Monts Rouges, 95130 Franconville, France';

// ============================================
// SERVICES ET TARIFS OFFICIELS FAT'S HAIR-AFRO
// ⚠️ RÈGLES MÉTIER INVIOLABLES
// ============================================

export const SERVICES = {
  // === LOCKS - CRÉATIONS (JOURNÉE ENTIÈRE) ===
  'création crochet locks': {
    nom: 'Création crochet locks',
    prix: 200,
    duree: 480,
    categorie: 'locks',
    blocksFullDay: true,  // JOURNÉE ENTIÈRE
    blocksDays: 1
  },
  'crochet locks': {
    nom: 'Création crochet locks',
    prix: 200,
    duree: 480,
    categorie: 'locks',
    blocksFullDay: true,
    blocksDays: 1
  },
  'création microlocks crochet': {
    nom: 'Création microlocks crochet',
    prix: 300,
    duree: 960,
    categorie: 'locks',
    prixVariable: true,
    blocksFullDay: true,  // 2 JOURS CONSÉCUTIFS
    blocksDays: 2
  },
  'microlocks crochet': {
    nom: 'Création microlocks crochet',
    prix: 300,
    duree: 960,
    categorie: 'locks',
    prixVariable: true,
    blocksFullDay: true,
    blocksDays: 2
  },
  'création microlocks twist': {
    nom: 'Création microlocks twist',
    prix: 150,
    duree: 480,
    categorie: 'locks',
    prixVariable: true,
    blocksFullDay: true,  // JOURNÉE ENTIÈRE
    blocksDays: 1
  },
  'microlocks twist': {
    nom: 'Création microlocks twist',
    prix: 150,
    duree: 480,
    categorie: 'locks',
    prixVariable: true,
    blocksFullDay: true,
    blocksDays: 1
  },
  'microlocks': {
    nom: 'Création microlocks twist',
    prix: 150,
    duree: 480,
    categorie: 'locks',
    prixVariable: true,
    blocksFullDay: true,
    blocksDays: 1
  },

  // === LOCKS - ENTRETIEN (CRÉNEAUX NORMAUX) ===
  'décapage locks': { nom: 'Décapage locks', prix: 35, duree: 60, categorie: 'locks' },
  'décapage': { nom: 'Décapage locks', prix: 35, duree: 60, categorie: 'locks' },
  'decapage locks': { nom: 'Décapage locks', prix: 35, duree: 60, categorie: 'locks' },
  'reprise racines locks': { nom: 'Reprise racines locks', prix: 50, duree: 120, categorie: 'locks' },
  'reprise racines': { nom: 'Reprise racines locks', prix: 50, duree: 120, categorie: 'locks' },
  'entretien locks': { nom: 'Reprise racines locks', prix: 50, duree: 120, categorie: 'locks' },
  'reprise racines micro-locks': { nom: 'Reprise racines micro-locks', prix: 100, duree: 240, categorie: 'locks' },
  'reprise micro-locks': { nom: 'Reprise racines micro-locks', prix: 100, duree: 240, categorie: 'locks' },

  // === SOINS ===
  'soin complet': { nom: 'Soin complet', prix: 50, duree: 60, categorie: 'soins' },
  'soin hydratant': { nom: 'Soin hydratant', prix: 40, duree: 60, categorie: 'soins' },
  'soin': { nom: 'Soin hydratant', prix: 40, duree: 60, categorie: 'soins' },
  'soins': { nom: 'Soin hydratant', prix: 40, duree: 60, categorie: 'soins' },
  'shampoing': { nom: 'Shampoing', prix: 10, duree: 30, categorie: 'soins' },

  // === COIFFURES ===
  'braids': { nom: 'Braids', prix: 60, duree: 300, categorie: 'coiffures', prixVariable: true },
  'tresses': { nom: 'Braids', prix: 60, duree: 300, categorie: 'coiffures', prixVariable: true },
  'nattes collées sans rajout': { nom: 'Nattes collées sans rajout', prix: 20, duree: 60, categorie: 'coiffures', prixVariable: true },
  'nattes sans rajout': { nom: 'Nattes collées sans rajout', prix: 20, duree: 60, categorie: 'coiffures', prixVariable: true },
  'nattes collées avec rajout': { nom: 'Nattes collées avec rajout', prix: 40, duree: 120, categorie: 'coiffures', prixVariable: true },
  'nattes avec rajout': { nom: 'Nattes collées avec rajout', prix: 40, duree: 120, categorie: 'coiffures', prixVariable: true },
  'nattes collées': { nom: 'Nattes collées avec rajout', prix: 40, duree: 120, categorie: 'coiffures', prixVariable: true },
  'nattes collees': { nom: 'Nattes collées avec rajout', prix: 40, duree: 120, categorie: 'coiffures', prixVariable: true },
  'nattes': { nom: 'Nattes collées sans rajout', prix: 20, duree: 60, categorie: 'coiffures', prixVariable: true },

  // === COULEUR & BRUSHING ===
  'teinture sans ammoniaque': { nom: 'Teinture sans ammoniaque', prix: 40, duree: 40, categorie: 'couleur' },
  'teinture': { nom: 'Teinture sans ammoniaque', prix: 40, duree: 40, categorie: 'couleur' },
  'coloration': { nom: 'Teinture sans ammoniaque', prix: 40, duree: 40, categorie: 'couleur' },
  'décoloration': { nom: 'Décoloration', prix: 20, duree: 10, categorie: 'couleur' },
  'decoloration': { nom: 'Décoloration', prix: 20, duree: 10, categorie: 'couleur' },
  'brushing cheveux afro': { nom: 'Brushing cheveux afro', prix: 20, duree: 60, categorie: 'couleur' },
  'brushing afro': { nom: 'Brushing cheveux afro', prix: 20, duree: 60, categorie: 'couleur' },
  'brushing': { nom: 'Brushing cheveux afro', prix: 20, duree: 60, categorie: 'couleur' }
};

// ⚠️ MAPPING SPÉCIAL : "locks" seul = DEMANDER PRÉCISION
// Ne pas mapper directement vers un service
export const SERVICES_AMBIGUS = {
  'locks': {
    message: "Pour les locks, vous souhaitez :\n• Une création de locks (200€, journée entière)\n• Une reprise de racines (50€, 2h)\n• Un décapage (35€, 1h) ?",
    options: ['création crochet locks', 'reprise racines locks', 'décapage locks']
  }
};

// ============================================
// BARÈME FRAIS DE DÉPLACEMENT
// *** VALEURS IMPORTÉES DEPUIS businessRules.js ***
// ============================================

export const FRAIS_DEPLACEMENT = {
  FORFAIT_BASE: TRAVEL_FEES.BASE_FEE,
  DISTANCE_FORFAIT: TRAVEL_FEES.BASE_DISTANCE_KM,
  TARIF_KM_EXTRA: TRAVEL_FEES.PER_KM_BEYOND,
  // Fonction de calcul officielle
  calculate: TRAVEL_FEES.calculate
};

// ============================================
// HORAIRES DE FATOU
// *** DÉRIVÉS DE BUSINESS_HOURS (businessRules.js) ***
// ============================================

const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function formatHoraireBooking(schedule) {
  if (!schedule) return { ouvert: false, debut: 0, fin: 0, description: 'Fermé' };
  const debut = parseInt(schedule.open.split(':')[0]);
  const fin = parseInt(schedule.close.split(':')[0]);
  return {
    ouvert: true,
    debut,
    fin,
    description: `${debut}h - ${fin}h`
  };
}

export const HORAIRES = Object.fromEntries(
  JOURS_SEMAINE.map((jour, index) => [jour, formatHoraireBooking(BUSINESS_HOURS.SCHEDULE[index])])
);

// ============================================
// INFORMATIONS DU SERVICE (à domicile)
// ============================================

export const SALON_INFO = {
  nom: "Fat's Hair-Afro",
  description: "Coiffure afro à domicile - Fatou se déplace chez vous (ou vous recevez chez elle sur demande)",
  gerante: "Fatou",
  adresseFatou: "Franconville (sur demande)",  // Pas d'adresse fixe publique
  telephone: "09 39 24 02 69",
  whatsapp: "07 82 23 50 20",
  zone: "Franconville et Île-de-France"
};

// ============================================
// LISTE DES SERVICES (format affichage)
// ⚠️ AVEC RÈGLES DE RÉSERVATION
// ============================================

export const SERVICES_LIST = [
  // === LOCKS - CRÉATIONS (JOURNÉE ENTIÈRE) ===
  {
    nom: 'Création crochet locks',
    prix: 200,
    duree: 480,
    dureeTexte: 'Journée entière (8h)',
    prixTexte: '200€',
    categorie: 'locks',
    blocksFullDay: true,
    blocksDays: 1,
    regle: 'JOURNÉE ENTIÈRE - RDV à 9h uniquement'
  },
  {
    nom: 'Création microlocks crochet',
    prix: 300,
    duree: 960,
    dureeTexte: '2 jours consécutifs',
    prixTexte: 'À partir de 300€',
    categorie: 'locks',
    blocksFullDay: true,
    blocksDays: 2,
    regle: '2 JOURS CONSÉCUTIFS - RDV à 9h les deux jours'
  },
  {
    nom: 'Création microlocks twist',
    prix: 150,
    duree: 480,
    dureeTexte: 'Journée entière (8h)',
    prixTexte: 'À partir de 150€',
    categorie: 'locks',
    blocksFullDay: true,
    blocksDays: 1,
    regle: 'JOURNÉE ENTIÈRE - RDV à 9h uniquement'
  },
  // === LOCKS - ENTRETIEN (CRÉNEAUX NORMAUX) ===
  {
    nom: 'Décapage locks',
    prix: 35,
    duree: 60,
    dureeTexte: '1h',
    prixTexte: '35€',
    categorie: 'locks'
  },
  {
    nom: 'Reprise racines locks',
    prix: 50,
    duree: 120,
    dureeTexte: '2h',
    prixTexte: '50€',
    categorie: 'locks'
  },
  {
    nom: 'Reprise racines micro-locks',
    prix: 100,
    duree: 240,
    dureeTexte: '4h',
    prixTexte: '100€',
    categorie: 'locks'
  },
  // === SOINS ===
  {
    nom: 'Soin complet',
    prix: 50,
    duree: 60,
    dureeTexte: '1h',
    prixTexte: '50€',
    categorie: 'soins'
  },
  {
    nom: 'Soin hydratant',
    prix: 40,
    duree: 60,
    dureeTexte: '1h',
    prixTexte: '40€',
    categorie: 'soins'
  },
  {
    nom: 'Shampoing',
    prix: 10,
    duree: 30,
    dureeTexte: '30min',
    prixTexte: '10€',
    categorie: 'soins'
  },
  // === TRESSES ===
  {
    nom: 'Braids',
    prix: 60,
    duree: 300,
    dureeTexte: 'À partir de 5h',
    prixTexte: 'À partir de 60€',
    categorie: 'tresses',
    prixVariable: true
  },
  {
    nom: 'Nattes collées sans rajout',
    prix: 20,
    duree: 60,
    dureeTexte: 'À partir de 1h',
    prixTexte: 'À partir de 20€',
    categorie: 'tresses',
    prixVariable: true
  },
  {
    nom: 'Nattes collées avec rajout',
    prix: 40,
    duree: 120,
    dureeTexte: 'À partir de 2h',
    prixTexte: 'À partir de 40€',
    categorie: 'tresses',
    prixVariable: true
  },
  // === COLORATION & BRUSHING ===
  {
    nom: 'Teinture sans ammoniaque',
    prix: 40,
    duree: 40,
    dureeTexte: '40min',
    prixTexte: '40€',
    categorie: 'coloration'
  },
  {
    nom: 'Décoloration',
    prix: 20,
    duree: 10,
    dureeTexte: '10min+',
    prixTexte: '20€',
    categorie: 'coloration'
  },
  {
    nom: 'Brushing cheveux afro',
    prix: 20,
    duree: 60,
    dureeTexte: '1h',
    prixTexte: '20€',
    categorie: 'coloration'
  }
];

// ============================================
// FRAIS DE DÉPLACEMENT (format affichage)
// *** VALEURS TIRÉES DE TRAVEL_FEES (businessRules.js) ***
// ============================================

export const DEPLACEMENT = {
  baseKm: TRAVEL_FEES.BASE_DISTANCE_KM,
  baseFrais: TRAVEL_FEES.BASE_FEE,
  tarifKm: TRAVEL_FEES.PER_KM_BEYOND,
  description: `${TRAVEL_FEES.BASE_FEE}€ forfait (0-${TRAVEL_FEES.BASE_DISTANCE_KM}km), puis +${TRAVEL_FEES.PER_KM_BEYOND}€/km au-delà`,
  // Exemples générés dynamiquement
  exemples: [
    { distance: 5, frais: TRAVEL_FEES.calculate(5), detail: `5km → ${TRAVEL_FEES.calculate(5)}€ (forfait)` },
    { distance: 12, frais: TRAVEL_FEES.calculate(12), detail: `12km → ${TRAVEL_FEES.BASE_FEE}€ + 4×${TRAVEL_FEES.PER_KM_BEYOND}€ = ${TRAVEL_FEES.calculate(12)}€` },
    { distance: 20, frais: TRAVEL_FEES.calculate(20), detail: `20km → ${TRAVEL_FEES.BASE_FEE}€ + 12×${TRAVEL_FEES.PER_KM_BEYOND}€ = ${TRAVEL_FEES.calculate(20)}€` }
  ],
  calculate: TRAVEL_FEES.calculate
};

// ============================================
// CALCUL DU CRÉNEAU RÉEL (DURÉE + TRAJET + MARGE)
// ============================================

const MARGE_SECURITE_MINUTES = 10; // 10 min entre chaque RDV

/**
 * Convertir minutes en format heure (ex: 830 → "13:50")
 */
function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Convertir heure en minutes (ex: "14:30" → 870, ou 14 → 840)
 */
function timeToMinutes(time) {
  if (typeof time === 'number') return time * 60;

  const parts = String(time).replace('h', ':').split(':');
  const hours = parseInt(parts[0]) || 0;
  const mins = parseInt(parts[1]) || 0;
  return hours * 60 + mins;
}

/**
 * Calculer le créneau réellement bloqué pour un RDV
 * @param {number} heureRdv - Heure du RDV (ex: 14)
 * @param {number} dureeMinutes - Durée de la prestation en minutes
 * @param {number} tempsTrajetMinutes - Temps de trajet en minutes (aller simple)
 * @returns {Object} { heureDebutReelle, heureFinReelle, dureeBloqueeMinutes }
 */
export function calculateRealSlot(heureRdv, dureeMinutes, tempsTrajetMinutes = 0) {
  // Heure de début réelle = heure RDV - temps trajet aller
  const heureDebutMinutes = (heureRdv * 60) - tempsTrajetMinutes;

  // Heure de fin réelle = heure RDV + durée + temps trajet retour + marge
  const heureFinMinutes = (heureRdv * 60) + dureeMinutes + tempsTrajetMinutes + MARGE_SECURITE_MINUTES;

  // Durée totale bloquée
  const dureeBloqueeMinutes = heureFinMinutes - heureDebutMinutes;

  return {
    heureDebutReelle: minutesToTime(heureDebutMinutes),
    heureFinReelle: minutesToTime(heureFinMinutes),
    heureDebutMinutes,
    heureFinMinutes,
    dureeBloqueeMinutes
  };
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Convertir un jour (lundi, mardi...) en date réelle
 */
export function parseJourToDate(jour) {
  if (!jour) return null;

  const joursMap = {
    'dimanche': 0, 'lundi': 1, 'mardi': 2, 'mercredi': 3,
    'jeudi': 4, 'vendredi': 5, 'samedi': 6
  };

  const jourLower = jour.toLowerCase().trim();
  const aujourdhui = new Date();

  // Si c'est "aujourd'hui" ou "demain"
  if (jourLower.includes('aujourd')) {
    return aujourdhui.toISOString().split('T')[0];
  }
  if (jourLower.includes('demain')) {
    const demain = new Date(aujourdhui);
    demain.setDate(demain.getDate() + 1);
    return demain.toISOString().split('T')[0];
  }

  // Trouver le jour de la semaine
  let targetDay = null;
  for (const [nomJour, numJour] of Object.entries(joursMap)) {
    if (jourLower.includes(nomJour)) {
      targetDay = numJour;
      break;
    }
  }

  if (targetDay === null) {
    // Si c'est déjà une date (2025-01-20)
    if (/^\d{4}-\d{2}-\d{2}$/.test(jourLower)) {
      return jourLower;
    }
    return aujourdhui.toISOString().split('T')[0];
  }

  // Calculer le prochain jour correspondant
  const jourActuel = aujourdhui.getDay();
  let daysToAdd = targetDay - jourActuel;
  if (daysToAdd <= 0) daysToAdd += 7;

  const targetDate = new Date(aujourdhui);
  targetDate.setDate(aujourdhui.getDate() + daysToAdd);

  return targetDate.toISOString().split('T')[0];
}

/**
 * Formater une date en texte lisible
 */
export function formatDateToText(dateStr) {
  if (!dateStr) return 'Date non définie';

  const date = new Date(dateStr + 'T12:00:00');
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  return date.toLocaleDateString('fr-FR', options);
}

/**
 * Obtenir le nom du jour à partir d'une date
 */
export function getJourFromDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr + 'T12:00:00');
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return jours[date.getDay()];
}

// ============================================
// CALCUL DISTANCE (GOOGLE MAPS)
// ============================================

/**
 * Calculer la distance entre Fatou et l'adresse client
 * @param {string} clientAddress - Adresse complète du client
 * @returns {Object} { distance, distanceText, duree, dureeText, error }
 */
export async function calculateDistance(clientAddress) {
  console.log('[BOOKING] Calcul distance vers:', clientAddress);

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn('[BOOKING] ⚠️ GOOGLE_MAPS_API_KEY manquante');
    return {
      distance: null,
      distanceText: 'Non calculée',
      duree: null,
      dureeText: 'Non calculée',
      error: 'Clé Google Maps non configurée'
    };
  }

  if (!clientAddress || clientAddress.length < 5) {
    return {
      distance: null,
      error: 'Adresse invalide'
    };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?` +
      `origins=${encodeURIComponent(FATOU_ADDRESS)}` +
      `&destinations=${encodeURIComponent(clientAddress)}` +
      `&mode=driving&language=fr&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('[BOOKING] Erreur Google Maps:', data.status, data.error_message);
      return { distance: null, error: `Erreur Google: ${data.status}` };
    }

    const element = data.rows[0]?.elements[0];

    if (!element || element.status !== 'OK') {
      console.warn('[BOOKING] Adresse non trouvée:', clientAddress);
      return { distance: null, error: 'Adresse non trouvée' };
    }

    const distanceKm = element.distance.value / 1000;
    const dureeMinutes = Math.round(element.duration.value / 60);

    console.log(`[BOOKING] ✅ Distance: ${distanceKm.toFixed(1)}km, ${dureeMinutes}min`);

    return {
      distance: Math.round(distanceKm * 10) / 10,
      distanceText: element.distance.text,
      duree: dureeMinutes,
      dureeText: element.duration.text,
      error: null
    };

  } catch (error) {
    console.error('[BOOKING] Erreur calcul distance:', error.message);
    return { distance: null, error: error.message };
  }
}

// ============================================
// CALCUL FRAIS DE DÉPLACEMENT
// ⚠️ FORMULE OFFICIELLE : 10€ forfait 0-8km, +1,10€/km au-delà
// ============================================

/**
 * Calculer les frais de déplacement selon la distance
 * FORMULE : 10€ forfait (0-8km), puis +1,10€/km au-delà
 *
 * Exemples :
 * - 5km → 10€
 * - 12km → 10€ + (12-8)×1,10€ = 10€ + 4,40€ = 14,40€
 * - 20km → 10€ + (20-8)×1,10€ = 10€ + 13,20€ = 23,20€
 *
 * @param {number} distanceKm - Distance en kilomètres
 * @returns {Object} { frais, description, detail }
 */
export function calculateTravelFee(distanceKm) {
  if (!distanceKm || distanceKm <= 0) {
    return {
      frais: FRAIS_DEPLACEMENT.FORFAIT_BASE,
      description: 'Forfait minimum',
      detail: `${FRAIS_DEPLACEMENT.FORFAIT_BASE}€ (forfait)`
    };
  }

  const { FORFAIT_BASE, DISTANCE_FORFAIT, TARIF_KM_EXTRA } = FRAIS_DEPLACEMENT;

  if (distanceKm <= DISTANCE_FORFAIT) {
    // Dans le forfait (0-8km)
    console.log(`[BOOKING] Frais déplacement: ${FORFAIT_BASE}€ pour ${distanceKm}km (forfait)`);
    return {
      frais: FORFAIT_BASE,
      description: `Forfait 0-${DISTANCE_FORFAIT}km`,
      detail: `${distanceKm}km → ${FORFAIT_BASE}€ (forfait)`
    };
  }

  // Au-delà du forfait : 10€ + (distance - 8) × 1,10€
  const kmExtra = distanceKm - DISTANCE_FORFAIT;
  const fraisExtra = kmExtra * TARIF_KM_EXTRA;
  const fraisTotal = Math.round((FORFAIT_BASE + fraisExtra) * 100) / 100; // Arrondi à 2 décimales

  console.log(`[BOOKING] Frais déplacement: ${fraisTotal}€ pour ${distanceKm}km (${FORFAIT_BASE}€ + ${kmExtra}×${TARIF_KM_EXTRA}€)`);

  return {
    frais: fraisTotal,
    description: `${FORFAIT_BASE}€ + ${kmExtra}km × ${TARIF_KM_EXTRA}€`,
    detail: `${distanceKm}km → ${FORFAIT_BASE}€ + ${kmExtra}×${TARIF_KM_EXTRA}€ = ${fraisTotal}€`
  };
}

// ============================================
// OBTENIR TARIF SERVICE
// ⚠️ RETOURNE AUSSI LES RÈGLES DE BLOCAGE
// ============================================

/**
 * Vérifier si un terme de service est ambigu (nécessite précision)
 * @param {string} serviceName - Nom du service
 * @returns {Object|null} - Message de clarification ou null
 */
export function checkServiceAmbiguity(serviceName) {
  if (!serviceName) return null;

  const serviceKey = serviceName.toLowerCase().trim();

  // Vérifier si c'est un terme ambigu
  if (SERVICES_AMBIGUS[serviceKey]) {
    return SERVICES_AMBIGUS[serviceKey];
  }

  return null;
}

/**
 * Obtenir les informations complètes d'un service
 * @param {string} serviceName - Nom du service
 * @returns {Object|null} { nom, prix, duree, blocksFullDay, blocksDays, prixVariable } ou null
 */
export function getServiceInfo(serviceName) {
  if (!serviceName) return null;

  const serviceKey = serviceName.toLowerCase().trim();

  // Vérifier si c'est un terme ambigu (comme "locks" seul)
  const ambiguity = checkServiceAmbiguity(serviceKey);
  if (ambiguity) {
    console.log(`[BOOKING] Service ambigu "${serviceName}": demande de précision`);
    return {
      ambigu: true,
      message: ambiguity.message,
      options: ambiguity.options
    };
  }

  // Correspondance exacte
  if (SERVICES[serviceKey]) {
    const service = SERVICES[serviceKey];
    return {
      nom: service.nom,
      prix: service.prix,
      duree: service.duree,
      categorie: service.categorie,
      prixVariable: service.prixVariable || false,
      blocksFullDay: service.blocksFullDay || false,
      blocksDays: service.blocksDays || 1
    };
  }

  // Correspondance partielle
  for (const [key, value] of Object.entries(SERVICES)) {
    if (serviceKey.includes(key) || key.includes(serviceKey)) {
      return {
        nom: value.nom,
        prix: value.prix,
        duree: value.duree,
        categorie: value.categorie,
        prixVariable: value.prixVariable || false,
        blocksFullDay: value.blocksFullDay || false,
        blocksDays: value.blocksDays || 1
      };
    }
  }

  console.warn('[BOOKING] Service non reconnu:', serviceName);
  return null;
}

// ============================================
// VÉRIFICATION DISPONIBILITÉ STRICTE
// ⚠️ RÈGLES MÉTIER INVIOLABLES
// ============================================

/**
 * Ajouter N jours à une date ISO
 */
function addDaysToDate(dateISO, days) {
  const date = new Date(dateISO + 'T12:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Formater une date pour l'affichage
 */
function formatDateFr(dateISO) {
  const date = new Date(dateISO + 'T12:00:00');
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${jours[date.getDay()]} ${date.getDate()} ${mois[date.getMonth()]}`;
}

/**
 * Vérification STRICTE de disponibilité avec règles métier
 * ⚠️ GÈRE : journée entière, 2 jours consécutifs, chevauchements
 *
 * @param {string} dateISO - Date au format YYYY-MM-DD
 * @param {string} serviceNom - Nom du service
 * @param {Array} existingBookings - RDV existants ce jour (optionnel, sera récupéré si non fourni)
 * @returns {Object} { available, slots, message, blocksFullDay, blocksDays }
 */
export async function checkStrictAvailability(dateISO, serviceNom, existingBookings = null) {
  console.log(`[BOOKING] === VÉRIFICATION STRICTE: ${serviceNom} le ${dateISO} ===`);

  // 1. Obtenir les infos du service
  const service = getServiceInfo(serviceNom);

  if (!service) {
    return {
      available: false,
      slots: [],
      message: `Service "${serviceNom}" non reconnu.`
    };
  }

  // Si le service est ambigu, demander précision
  if (service.ambigu) {
    return {
      available: false,
      slots: [],
      needsClarification: true,
      message: service.message,
      options: service.options
    };
  }

  // 2. Récupérer les RDV existants si non fournis
  if (!existingBookings) {
    const db = getSupabase();
    if (db) {
      const { data } = await db
        .from('reservations')
        .select('id, heure, service_nom, duree_minutes')
        .eq('date', dateISO)
        .in('statut', ['demande', 'confirme']);
      existingBookings = data || [];
    } else {
      existingBookings = [];
    }
  }

  console.log(`[BOOKING] Service: ${service.nom}, blocksFullDay: ${service.blocksFullDay}, blocksDays: ${service.blocksDays}`);
  console.log(`[BOOKING] ${existingBookings.length} RDV existants ce jour`);

  // 3. Si le service BLOQUE LA JOURNÉE ENTIÈRE
  if (service.blocksFullDay) {
    // Vérifier si la journée est déjà prise
    if (existingBookings.length > 0) {
      return {
        available: false,
        slots: [],
        blocksFullDay: true,
        blocksDays: service.blocksDays,
        message: `❌ Le ${formatDateFr(dateISO)} est déjà occupé. La ${service.nom} nécessite la journée entière (${service.duree / 60}h). Veuillez choisir un autre jour.`
      };
    }

    // 4. Si microlocks crochet (2 jours), vérifier le lendemain
    if (service.blocksDays === 2) {
      const nextDay = addDaysToDate(dateISO, 1);

      // Vérifier que le lendemain n'est pas un dimanche
      const nextDayObj = new Date(nextDay);
      if (nextDayObj.getDay() === 0) {
        return {
          available: false,
          slots: [],
          blocksFullDay: true,
          blocksDays: 2,
          message: `❌ Les microlocks crochet nécessitent 2 jours consécutifs. Le ${formatDateFr(dateISO)} + lendemain tombe sur un dimanche (fermé). Choisissez un autre jour.`
        };
      }

      // Récupérer les RDV du lendemain
      const db = getSupabase();
      let nextDayBookings = [];
      if (db) {
        const { data } = await db
          .from('reservations')
          .select('id, heure, service_nom')
          .eq('date', nextDay)
          .in('statut', ['demande', 'confirme']);
        nextDayBookings = data || [];
      }

      if (nextDayBookings.length > 0) {
        return {
          available: false,
          slots: [],
          blocksFullDay: true,
          blocksDays: 2,
          message: `❌ Les microlocks crochet nécessitent 2 jours consécutifs. Le lendemain (${formatDateFr(nextDay)}) est déjà pris. Veuillez choisir d'autres dates.`
        };
      }

      // Les 2 jours sont libres !
      const prixTexte = service.prixVariable ? `à partir de ${service.prix}€` : `${service.prix}€`;
      return {
        available: true,
        slots: ["09:00"],
        blocksFullDay: true,
        blocksDays: 2,
        dates: [dateISO, nextDay],
        message: `✅ Disponible ! Les microlocks crochet prennent 2 jours consécutifs.\n📅 ${formatDateFr(dateISO)} et ${formatDateFr(nextDay)}, RDV à 9h les deux jours.\n💰 ${prixTexte}`
      };
    }

    // Service journée entière (1 jour)
    const prixTexte = service.prixVariable ? `à partir de ${service.prix}€` : `${service.prix}€`;
    return {
      available: true,
      slots: ["09:00"],
      blocksFullDay: true,
      blocksDays: 1,
      message: `✅ Disponible ! La ${service.nom} prend la journée entière (${service.duree / 60}h).\n📅 ${formatDateFr(dateISO)} à 9h.\n💰 ${prixTexte}`
    };
  }

  // 5. SERVICE NORMAL : calculer les créneaux disponibles
  const jourSemaine = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const dayOfWeek = new Date(dateISO + 'T12:00:00').getDay();
  const jourNom = jourSemaine[dayOfWeek];
  const horaire = HORAIRES[jourNom];

  if (!horaire || !horaire.ouvert) {
    return {
      available: false,
      slots: [],
      message: `❌ Fatou ne travaille pas le ${jourNom}. Veuillez choisir un autre jour.`
    };
  }

  const OUVERTURE_MINUTES = horaire.debut * 60;
  const FERMETURE_MINUTES = horaire.fin * 60;

  // Convertir les RDV existants en plages occupées
  const plagesOccupees = existingBookings.map(rdv => {
    const heureNum = parseInt(String(rdv.heure).replace(/[^0-9]/g, ''));
    const dureeRdv = rdv.duree_minutes || getServiceInfo(rdv.service_nom)?.duree || 120;
    return {
      debut: heureNum * 60,
      fin: heureNum * 60 + dureeRdv
    };
  }).sort((a, b) => a.debut - b.debut);

  // Trouver les créneaux disponibles
  const slotsDisponibles = [];
  const dureeService = service.duree;

  for (let heureMinutes = OUVERTURE_MINUTES; heureMinutes < FERMETURE_MINUTES; heureMinutes += 60) {
    const finService = heureMinutes + dureeService;

    // Vérifier que le service peut finir avant la fermeture
    if (finService > FERMETURE_MINUTES) continue;

    // Vérifier les chevauchements
    let conflit = false;
    for (const plage of plagesOccupees) {
      if (heureMinutes < plage.fin && finService > plage.debut) {
        conflit = true;
        break;
      }
    }

    if (!conflit) {
      const heureStr = `${Math.floor(heureMinutes / 60).toString().padStart(2, '0')}:00`;
      slotsDisponibles.push(heureStr);
    }
  }

  const prixTexte = service.prixVariable ? `à partir de ${service.prix}€` : `${service.prix}€`;

  if (slotsDisponibles.length === 0) {
    return {
      available: false,
      slots: [],
      message: `❌ Aucun créneau disponible le ${formatDateFr(dateISO)} pour ${service.nom} (${service.duree / 60}h). Essayez un autre jour.`
    };
  }

  return {
    available: true,
    slots: slotsDisponibles,
    message: `✅ ${slotsDisponibles.length} créneaux disponibles le ${formatDateFr(dateISO)} pour ${service.nom}.\n⏱️ Durée : ${service.duree >= 60 ? (service.duree / 60) + 'h' : service.duree + 'min'}\n💰 ${prixTexte}`
  };
}

// ============================================
// VÉRIFICATION HORAIRES
// ============================================

/**
 * Vérifier si un créneau est dans les horaires de Fatou
 * @param {string} jour - Jour de la semaine (lundi, mardi...)
 * @param {string|number} heure - Heure (14, "14h", "14:00")
 * @returns {Object} { ok, message }
 */
export function checkHoraires(jour, heure) {
  if (!jour) {
    return { ok: false, message: 'Jour non spécifié' };
  }

  const jourLower = jour.toLowerCase().trim();

  // Trouver le jour dans HORAIRES
  let horaire = null;
  let jourTrouve = null;
  for (const [nomJour, h] of Object.entries(HORAIRES)) {
    if (jourLower.includes(nomJour)) {
      horaire = h;
      jourTrouve = nomJour;
      break;
    }
  }

  if (!horaire) {
    return { ok: false, message: 'Jour non reconnu' };
  }

  if (!horaire.ouvert) {
    return {
      ok: false,
      message: 'Fatou ne travaille pas le dimanche. Quel autre jour vous conviendrait ?'
    };
  }

  // Extraire l'heure numérique
  let heureNum = parseInt(String(heure).replace(/[^0-9]/g, ''));

  if (isNaN(heureNum) || heureNum < 0 || heureNum > 23) {
    return { ok: false, message: 'Heure non valide' };
  }

  if (heureNum < horaire.debut) {
    return {
      ok: false,
      message: `Le ${jourTrouve}, Fatou commence à ${horaire.debut}h. Vous préférez ${horaire.debut}h ou plus tard ?`
    };
  }

  if (heureNum >= horaire.fin) {
    return {
      ok: false,
      message: `Le ${jourTrouve}, Fatou termine à ${horaire.fin}h. Vous préférez une heure plus tôt ?`
    };
  }

  return { ok: true, message: 'Créneau valide' };
}

// ============================================
// VÉRIFICATION HORAIRES AVEC DURÉE COMPLÈTE
// ============================================

/**
 * Vérifier si un RDV peut FINIR avant la fermeture
 * Prend en compte : durée de la prestation + temps de trajet aller/retour + marge
 * @param {string} jour - Jour de la semaine
 * @param {number} heureRdv - Heure du RDV
 * @param {number} dureeMinutes - Durée de la prestation
 * @param {number} tempsTrajetMinutes - Temps de trajet (aller simple)
 * @returns {Object} { ok, message, heureFinReelle }
 */
export function checkHorairesComplet(jour, heureRdv, dureeMinutes, tempsTrajetMinutes = 0) {
  if (!jour) {
    return { ok: false, message: 'Jour non spécifié' };
  }

  const jourLower = jour.toLowerCase().trim();

  // Trouver les horaires du jour
  let horaire = null;
  let jourTrouve = null;
  for (const [nomJour, h] of Object.entries(HORAIRES)) {
    if (jourLower.includes(nomJour)) {
      horaire = { ...h };
      jourTrouve = nomJour;
      break;
    }
  }

  if (!horaire) {
    return { ok: false, message: 'Jour non reconnu' };
  }

  if (!horaire.ouvert) {
    return {
      ok: false,
      message: 'Fatou ne travaille pas le dimanche. Quel autre jour vous conviendrait ?'
    };
  }

  const heureNum = parseInt(String(heureRdv).replace(/[^0-9]/g, ''));

  // Calculer le créneau réel
  const slot = calculateRealSlot(heureNum, dureeMinutes, tempsTrajetMinutes);

  console.log(`[BOOKING] Vérification horaires complète:`);
  console.log(`[BOOKING]   Jour: ${jourTrouve}, Heure RDV: ${heureNum}h`);
  console.log(`[BOOKING]   Durée: ${dureeMinutes}min, Trajet: ${tempsTrajetMinutes}min`);
  console.log(`[BOOKING]   Créneau réel: ${slot.heureDebutReelle} → ${slot.heureFinReelle}`);

  // Vérifier que Fatou peut PARTIR à temps (heure début réelle >= ouverture)
  const ouvertureMinutes = horaire.debut * 60;
  if (slot.heureDebutMinutes < ouvertureMinutes) {
    const heureMinPossible = Math.ceil((ouvertureMinutes + tempsTrajetMinutes) / 60);
    return {
      ok: false,
      message: `Le ${jourTrouve}, Fatou commence à ${horaire.debut}h. Avec le trajet, le plus tôt possible serait ${heureMinPossible}h.`
    };
  }

  // Vérifier que Fatou peut RENTRER avant la fermeture (heure fin réelle <= fermeture)
  const fermetureMinutes = horaire.fin * 60;
  if (slot.heureFinMinutes > fermetureMinutes) {
    // Calculer l'heure max possible pour ce RDV
    const heureMaxPossible = Math.floor((fermetureMinutes - dureeMinutes - tempsTrajetMinutes - MARGE_SECURITE_MINUTES) / 60);

    const dureeHeures = Math.round(dureeMinutes / 60 * 10) / 10;
    return {
      ok: false,
      message: `Le ${jourTrouve}, Fatou termine à ${horaire.fin}h. Avec la durée de ${dureeHeures}h et le trajet, il faudrait commencer au plus tard à ${heureMaxPossible}h.`
    };
  }

  return {
    ok: true,
    message: 'Créneau valide',
    slot
  };
}

// ============================================
// VÉRIFICATION DISPONIBILITÉ (ANTI-CHEVAUCHEMENT)
// ============================================

/**
 * Vérifier si un créneau est disponible (pas de chevauchement)
 * @param {string} dateRdv - Date au format YYYY-MM-DD
 * @param {string|number} heureRdv - Heure de début
 * @param {number} dureeMinutes - Durée du service en minutes
 * @returns {Object} { available, conflits, suggestion }
 */
export async function checkAvailability(dateRdv, heureRdv, dureeMinutes = 120) {
  console.log(`[BOOKING] Vérification disponibilité: ${dateRdv} ${heureRdv}h (${dureeMinutes}min)`);

  if (!dateRdv) {
    return { available: true, conflits: [], message: 'Date non spécifiée' };
  }

  const db = getSupabase();
  if (!db) {
    console.warn('[BOOKING] Supabase non configuré');
    return { available: true, conflits: [], message: 'Base de données non configurée' };
  }

  try {
    // Récupérer les RDV du jour (table reservations)
    const { data: rdvsJour, error } = await db
      .from('reservations')
      .select('id, heure, service_nom, notes')
      .eq('date', dateRdv)
      .in('statut', ['demande', 'confirme']);

    if (error) {
      console.error('[BOOKING] Erreur requête disponibilité:', error);
      return { available: true, conflits: [], message: 'Erreur vérification' };
    }

    if (!rdvsJour || rdvsJour.length === 0) {
      console.log('[BOOKING] ✅ Aucun RDV ce jour, créneau libre');
      return { available: true, conflits: [], message: 'Créneau disponible' };
    }

    console.log(`[BOOKING] ${rdvsJour.length} RDV trouvés ce jour`);

    // Extraire l'heure demandée
    const heureDemandeNum = parseInt(String(heureRdv).replace(/[^0-9]/g, ''));
    const finDemande = heureDemandeNum + Math.ceil(dureeMinutes / 60);

    // Vérifier les chevauchements
    const conflits = [];

    for (const rdv of rdvsJour) {
      const heureRdvNum = parseInt(String(rdv.heure).replace(/[^0-9]/g, ''));

      // Estimer la durée du RDV existant (2h par défaut)
      const serviceInfo = getServiceInfo(rdv.service_nom);
      const dureeExistant = serviceInfo ? Math.ceil(serviceInfo.duree / 60) : 2;
      const finExistant = heureRdvNum + dureeExistant;

      // Vérifier chevauchement
      // Chevauchement si : debut1 < fin2 ET debut2 < fin1
      if (heureDemandeNum < finExistant && heureRdvNum < finDemande) {
        console.log(`[BOOKING] ❌ Conflit avec RDV ${rdv.id}: ${heureRdvNum}h-${finExistant}h`);
        conflits.push({
          id: rdv.id,
          heure: rdv.heure,
          service: rdv.service_nom,
          fin: `${finExistant}h`
        });
      }
    }

    if (conflits.length > 0) {
      // Trouver une suggestion d'heure alternative
      const suggestion = findNextAvailableSlot(rdvsJour, heureDemandeNum, dureeMinutes);

      return {
        available: false,
        conflits,
        message: `Ce créneau est déjà pris. ${suggestion}`,
        suggestion
      };
    }

    console.log('[BOOKING] ✅ Créneau disponible');
    return { available: true, conflits: [], message: 'Créneau disponible' };

  } catch (error) {
    console.error('[BOOKING] Erreur checkAvailability:', error);
    return { available: true, conflits: [], message: 'Erreur vérification' };
  }
}

/**
 * Trouver le prochain créneau disponible
 */
function findNextAvailableSlot(rdvsJour, heureVoulue, dureeMinutes) {
  // Créer une liste des heures occupées
  const heuresOccupees = rdvsJour.map(rdv => {
    const h = parseInt(String(rdv.heure).replace(/[^0-9]/g, ''));
    const serviceInfo = getServiceInfo(rdv.service_nom);
    const duree = serviceInfo ? Math.ceil(serviceInfo.duree / 60) : 2;
    return { debut: h, fin: h + duree };
  }).sort((a, b) => a.debut - b.debut);

  // Chercher un créneau libre après l'heure voulue
  for (let h = heureVoulue; h <= 18; h++) {
    let libre = true;
    const finProposee = h + Math.ceil(dureeMinutes / 60);

    for (const occ of heuresOccupees) {
      if (h < occ.fin && occ.debut < finProposee) {
        libre = false;
        break;
      }
    }

    if (libre) {
      return `${h}h serait disponible.`;
    }
  }

  return 'Aucun créneau disponible ce jour.';
}

// ============================================
// VÉRIFICATION DISPONIBILITÉ AVEC CRÉNEAUX RÉELS
// ============================================

/**
 * Vérifier si un créneau est disponible (pas de chevauchement RÉEL)
 * Prend en compte la durée + trajet + marge de TOUS les RDV
 *
 * @param {string} dateRdv - Date au format YYYY-MM-DD
 * @param {number} heureRdv - Heure de début du RDV
 * @param {number} dureeMinutes - Durée de la prestation
 * @param {number} tempsTrajetMinutes - Temps de trajet (aller simple)
 * @returns {Object} { available, conflits, suggestion }
 */
export async function checkAvailabilityComplete(dateRdv, heureRdv, dureeMinutes = 120, tempsTrajetMinutes = 0) {
  console.log(`[BOOKING] Vérification disponibilité COMPLÈTE:`);
  console.log(`[BOOKING]   Date: ${dateRdv}, Heure: ${heureRdv}h`);
  console.log(`[BOOKING]   Durée: ${dureeMinutes}min, Trajet: ${tempsTrajetMinutes}min`);

  if (!dateRdv) {
    return { available: true, conflits: [], message: 'Date non spécifiée' };
  }

  const db = getSupabase();
  if (!db) {
    console.warn('[BOOKING] Supabase non configuré');
    return { available: true, conflits: [], message: 'Base de données non configurée' };
  }

  // Calculer le créneau réel du nouveau RDV
  const heureNum = parseInt(String(heureRdv).replace(/[^0-9]/g, ''));
  const nouveauSlot = calculateRealSlot(heureNum, dureeMinutes, tempsTrajetMinutes);

  console.log(`[BOOKING]   Créneau réel demandé: ${nouveauSlot.heureDebutReelle} → ${nouveauSlot.heureFinReelle}`);

  try {
    // Récupérer les RDV du jour avec leurs infos complètes
    const { data: rdvsJour, error } = await db
      .from('reservations')
      .select('id, heure, service_nom, notes, distance_km')
      .eq('date', dateRdv)
      .in('statut', ['demande', 'confirme']);

    if (error) {
      console.error('[BOOKING] Erreur requête disponibilité:', error);
      return { available: true, conflits: [], message: 'Erreur vérification' };
    }

    if (!rdvsJour || rdvsJour.length === 0) {
      console.log('[BOOKING] ✅ Aucun RDV ce jour, créneau libre');
      return { available: true, conflits: [], message: 'Créneau disponible', slot: nouveauSlot };
    }

    console.log(`[BOOKING] ${rdvsJour.length} RDV existants ce jour`);

    // Vérifier les chevauchements avec les créneaux RÉELS
    const conflits = [];

    for (const rdv of rdvsJour) {
      // Récupérer les infos du RDV existant
      const heureRdvExistant = parseInt(String(rdv.heure).replace(/[^0-9]/g, ''));

      // Durée du RDV existant
      const serviceInfo = getServiceInfo(rdv.service_nom);
      const dureeExistant = serviceInfo?.duree || 120;

      // Temps de trajet du RDV existant (estimer depuis la distance)
      let trajetExistant = 0;
      if (rdv.distance_km) {
        // Estimation : 2 min par km en moyenne
        trajetExistant = Math.round(rdv.distance_km * 2);
      }

      // Calculer le créneau réel du RDV existant
      const slotExistant = calculateRealSlot(heureRdvExistant, dureeExistant, trajetExistant);

      console.log(`[BOOKING]   RDV existant ${rdv.id}: ${slotExistant.heureDebutReelle} → ${slotExistant.heureFinReelle}`);

      // Vérifier chevauchement
      // Chevauchement si : debut1 < fin2 ET debut2 < fin1
      if (nouveauSlot.heureDebutMinutes < slotExistant.heureFinMinutes &&
          slotExistant.heureDebutMinutes < nouveauSlot.heureFinMinutes) {

        console.log(`[BOOKING] ❌ Conflit avec RDV ${rdv.id}`);
        conflits.push({
          id: rdv.id,
          heure: rdv.heure,
          service: rdv.service_nom,
          slotDebut: slotExistant.heureDebutReelle,
          slotFin: slotExistant.heureFinReelle
        });
      }
    }

    if (conflits.length > 0) {
      // Trouver une suggestion d'heure alternative
      const suggestion = findNextAvailableSlotComplete(rdvsJour, heureNum, dureeMinutes, tempsTrajetMinutes, dateRdv);

      return {
        available: false,
        conflits,
        message: `Ce créneau est déjà pris. ${suggestion}`,
        suggestion
      };
    }

    console.log('[BOOKING] ✅ Créneau disponible');
    return { available: true, conflits: [], message: 'Créneau disponible', slot: nouveauSlot };

  } catch (error) {
    console.error('[BOOKING] Erreur checkAvailabilityComplete:', error);
    return { available: true, conflits: [], message: 'Erreur vérification' };
  }
}

/**
 * Trouver le prochain créneau disponible en tenant compte des créneaux réels
 */
function findNextAvailableSlotComplete(rdvsJour, heureVoulue, dureeMinutes, tempsTrajetMinutes, dateRdv) {
  // Récupérer les horaires du jour
  const date = new Date(dateRdv);
  const jourSemaine = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][date.getDay()];
  const horaire = HORAIRES[jourSemaine];

  if (!horaire || !horaire.ouvert) {
    return 'Ce jour n\'est pas disponible.';
  }

  // Créer une liste des créneaux occupés (avec leurs vrais horaires)
  const creneauxOccupes = rdvsJour.map(rdv => {
    const h = parseInt(String(rdv.heure).replace(/[^0-9]/g, ''));
    const serviceInfo = getServiceInfo(rdv.service_nom);
    const duree = serviceInfo?.duree || 120;
    let trajet = 0;
    if (rdv.distance_km) {
      trajet = Math.round(rdv.distance_km * 2);
    }
    return calculateRealSlot(h, duree, trajet);
  }).sort((a, b) => a.heureDebutMinutes - b.heureDebutMinutes);

  // Chercher un créneau libre après l'heure voulue
  const heureMinPossible = horaire.debut;
  const heureMaxPossible = horaire.fin;

  for (let h = heureVoulue; h <= heureMaxPossible - Math.ceil(dureeMinutes / 60); h++) {
    const testSlot = calculateRealSlot(h, dureeMinutes, tempsTrajetMinutes);

    // Vérifier que le créneau est dans les horaires
    if (testSlot.heureDebutMinutes < horaire.debut * 60) continue;
    if (testSlot.heureFinMinutes > horaire.fin * 60) continue;

    // Vérifier qu'il n'y a pas de chevauchement
    let libre = true;
    for (const occ of creneauxOccupes) {
      if (testSlot.heureDebutMinutes < occ.heureFinMinutes &&
          occ.heureDebutMinutes < testSlot.heureFinMinutes) {
        libre = false;
        break;
      }
    }

    if (libre) {
      return `${h}h serait disponible.`;
    }
  }

  // Chercher aussi avant l'heure voulue
  for (let h = heureMinPossible; h < heureVoulue; h++) {
    const testSlot = calculateRealSlot(h, dureeMinutes, tempsTrajetMinutes);

    if (testSlot.heureDebutMinutes < horaire.debut * 60) continue;
    if (testSlot.heureFinMinutes > horaire.fin * 60) continue;

    let libre = true;
    for (const occ of creneauxOccupes) {
      if (testSlot.heureDebutMinutes < occ.heureFinMinutes &&
          occ.heureDebutMinutes < testSlot.heureFinMinutes) {
        libre = false;
        break;
      }
    }

    if (libre) {
      return `${h}h serait disponible plus tôt.`;
    }
  }

  return 'Aucun créneau disponible ce jour. Un autre jour peut-être ?';
}

// ============================================
// CRÉATION OU RECHERCHE CLIENT
// ============================================

/**
 * Trouver ou créer un client
 * @param {string} clientNom - Nom de famille du client
 * @param {string} clientPhone - Téléphone du client (identifiant unique)
 * @param {string} clientPrenom - Prénom du client (optionnel)
 */
async function findOrCreateClient(clientNom, clientPhone, clientPrenom = null) {
  const db = getSupabase();
  if (!db || !clientPhone) return null;

  try {
    // Chercher le client existant par téléphone
    const { data: existingClient } = await db
      .from('clients')
      .select('id, nom, prenom')
      .eq('telephone', clientPhone)
      .single();

    if (existingClient) {
      console.log(`[BOOKING] Client existant trouvé: ${existingClient.id} (${existingClient.prenom || ''} ${existingClient.nom})`);

      // Mettre à jour le nom/prénom si fournis et différents
      const updates = {};
      if (clientNom && clientNom !== existingClient.nom && clientNom !== 'Client') {
        updates.nom = clientNom;
      }
      if (clientPrenom && clientPrenom !== existingClient.prenom) {
        updates.prenom = clientPrenom;
      }

      if (Object.keys(updates).length > 0) {
        await db.from('clients').update(updates).eq('id', existingClient.id);
        console.log(`[BOOKING] Client mis à jour:`, updates);
      }

      return existingClient.id;
    }

    // Créer un nouveau client avec nom ET prénom
    const clientData = {
      nom: clientNom || 'Client',
      telephone: clientPhone
    };

    // Ajouter le prénom si fourni
    if (clientPrenom) {
      clientData.prenom = clientPrenom;
    }

    const { data: newClient, error } = await db
      .from('clients')
      .insert(clientData)
      .select('id')
      .single();

    if (error) {
      console.error('[BOOKING] Erreur création client:', error);
      return null;
    }

    console.log(`[BOOKING] Nouveau client créé: ${newClient.id} (${clientPrenom || ''} ${clientNom || 'Client'})`);
    return newClient.id;

  } catch (error) {
    console.error('[BOOKING] Exception findOrCreateClient:', error);
    return null;
  }
}

// ============================================
// CRÉATION DE RDV
// ============================================

/**
 * Créer un rendez-vous complet
 * 🔒 REDIRIGE VERS createReservationUnified (NEXUS CORE)
 *
 * @param {Object} bookingData - Données du RDV (ancien format)
 * @returns {Object} { success, rdv, error }
 */
export async function createAppointment(bookingData) {
  console.log('[BOOKING] ========================================');
  console.log('[BOOKING] Création RDV (via NEXUS CORE)...');

  try {
    const {
      clientName,
      clientPrenom,
      clientPhone,
      clientEmail,
      clientAddress,
      service,
      jour,
      heure,
      source = 'site',
      notes,
      callSid,
      nombre_locks,
      duree_minutes
    } = bookingData;

    // Convertir le jour en date ISO si nécessaire
    let dateRdv = jour;
    if (jour && !jour.match(/^\d{4}-\d{2}-\d{2}$/)) {
      dateRdv = parseJourToDate(jour);
      if (!dateRdv) {
        return { success: false, error: 'Date invalide' };
      }
    }

    // Formater l'heure
    let heureFormatted = heure;
    if (heure && !heure.includes(':')) {
      const heureNum = String(heure).replace(/[^0-9]/g, '');
      heureFormatted = heureNum.padStart(2, '0') + ':00';
    }

    // Préparer les notes
    let notesFinales = notes || '';
    if (source === 'telephone' && callSid) {
      notesFinales = `[TELEPHONE] CallSid: ${callSid}${notesFinales ? ' | ' + notesFinales : ''}`;
    }

    // Mapper vers le nouveau format createReservationUnified
    const data = {
      service_name: service,
      date: dateRdv,
      heure: heureFormatted,
      client_nom: clientName,
      client_prenom: clientPrenom || null,
      client_telephone: clientPhone,
      client_email: clientEmail || null,
      lieu: clientAddress ? 'domicile' : 'salon',
      adresse: clientAddress || null,
      notes: notesFinales || null,
      ...(nombre_locks ? { nombre_locks: Number(nombre_locks), duree_minutes: Number(duree_minutes) || Number(nombre_locks) * 30 } : {}),
    };

    // Appeler la fonction unifiée
    const createReservationUnified = await getCreateReservationUnified();
    const result = await createReservationUnified(data, source, { sendSMS: true });

    // Convertir la réponse vers l'ancien format
    if (result.success) {
      console.log('[BOOKING] ✅ RDV créé via NEXUS CORE, ID:', result.reservationId);
      return {
        success: true,
        rdv: { id: result.reservationId },
        summary: {
          service: result.recap.service,
          date: result.recap.date,
          dateISO: result.recap.date,
          heure: result.recap.heure,
          prixService: result.recap.prix,
          fraisDeplacement: result.recap.fraisDeplacement,
          prixTotal: result.recap.prixTotal,
          distance: result.recap.distanceKm
        }
      };
    } else {
      console.error('[BOOKING] ❌ Erreur NEXUS CORE:', result.error || result.errors);
      return {
        success: false,
        error: result.error || (result.errors ? result.errors.join(', ') : 'Erreur inconnue'),
        needsClarification: result.needsClarification,
        options: result.options
      };
    }

  } catch (error) {
    console.error('[BOOKING] ❌ Exception:', error.message);
    return { success: false, error: error.message };
  }
}

// ============================================
// ENVOI SMS DE CONFIRMATION
// ============================================

/**
 * Envoyer un SMS de confirmation
 * @param {string} phoneNumber - Numéro du client
 * @param {Object} bookingDetails - Détails du RDV
 * @returns {boolean} Succès ou échec
 */
export async function sendConfirmationSMS(phoneNumber, bookingDetails) {
  console.log('[BOOKING] Envoi SMS à:', phoneNumber);

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhone) {
    console.warn('[BOOKING] ⚠️ Configuration Twilio manquante, SMS non envoyé');
    return false;
  }

  if (!phoneNumber || phoneNumber.length < 10) {
    console.warn('[BOOKING] ⚠️ Numéro invalide, SMS non envoyé');
    return false;
  }

  try {
    // Formater le numéro
    let formattedPhone = phoneNumber.replace(/\s/g, '').replace(/\./g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+33' + formattedPhone.substring(1);
    }
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+33' + formattedPhone;
    }

    const { service, date, heure, prixTotal, fraisDeplacement, adresse } = bookingDetails;

    const fraisText = fraisDeplacement > 0
      ? `(dont ${fraisDeplacement}€ déplacement)`
      : '(déplacement offert)';

    const message = `Fat's Hair-Afro
Votre RDV est confirmé !

${date} à ${heure}
${service}
${prixTotal}€ ${fraisText}

${adresse ? 'À votre adresse : ' + adresse : ''}

À bientôt !
Fatou - 09 39 24 02 69`;

    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);

    await client.messages.create({
      body: message,
      from: twilioPhone,
      to: formattedPhone
    });

    console.log('[BOOKING] ✅ SMS envoyé');
    return true;

  } catch (error) {
    console.error('[BOOKING] ❌ Erreur envoi SMS:', error.message);
    return false;
  }
}

// ============================================
// PROMPT HALIMAH UNIFIÉ (TOUS CANAUX)
// ============================================

/**
 * Générer le prompt système pour Halimah
 * Version enrichie avec personnalité fluide + outil dates
 * @param {string} canal - 'telephone', 'chat', ou 'whatsapp'
 * @param {boolean} vouvoiement - true pour vouvoiement, false pour tutoiement possible
 */
export function getHalimahPrompt(canal = 'chat', vouvoiement = true) {
  const today = getTodayInfo();

  const tutoiementInstruction = vouvoiement
    ? "Tu VOUVOIES TOUJOURS les clients. Utilise 'vous', 'votre', 'vos'."
    : "Tu peux tutoyer si le client tutoie d'abord, sinon vouvoie.";

  const canalSpecifique = {
    telephone: `
SPECIFICITES TELEPHONE :
- Phrases courtes mais chaleureuses (2-3 phrases max)
- Une seule question a la fois
- Confirme ce que tu as compris avant de passer a la suite
- Marqueurs oraux : "Tres bien", "D'accord", "Je vois"`,

    chat: `
SPECIFICITES CHAT :
- Tu peux etre un peu plus detaillee qu'au telephone
- Paragraphes courts et aeres
- Emojis bienvenus avec moderation (1-2 par message)
- Listes si c'est plus clair`,

    whatsapp: `
SPECIFICITES WHATSAPP :
- Messages courts et dynamiques
- Emojis bienvenus
- Decoupe les infos longues en plusieurs messages
- Reponds rapidement aux questions simples`
  };

  return `
===============================================================
AUJOURD'HUI : ${today.date}
HEURE : ${today.heure}
===============================================================

Tu es Halimah, l'assistante virtuelle de ${SALON_INFO.nom}.

TA PERSONNALITE :

Tu es comme une amie professionnelle - chaleureuse mais respectueuse.

- AUTHENTIQUE : Tu parles comme une vraie personne. "Ah super !" ou "Je comprends totalement !"
- ATTENTIVE : Tu reformules pour montrer que tu as compris.
- RASSURANTE : Tu anticipes les questions et inquietudes.
- EQUILIBREE : Ni trop bavarde, ni trop breve. Le juste milieu.
- PROFESSIONNELLE : ${tutoiementInstruction}

${canalSpecifique[canal] || canalSpecifique.chat}

===============================================================
STYLE CONVERSATIONNEL
===============================================================

1. ECOUTE ACTIVE
   NON : "Quel jour voulez-vous ?"
   OUI : "Des tresses classiques, excellent choix ! Quel jour vous arrangerait ?"

2. REFORMULATION
   NON : "OK. Adresse ?"
   OUI : "Samedi a 14h, c'est note ! Pour les frais de deplacement, quelle est votre adresse ?"

3. EMPATHIE
   NON : "Le creneau est pris."
   OUI : "Ah, ce creneau est deja reserve. Mais 15h est disponible ! Ca vous irait ?"

4. TRANSITIONS DOUCES
   NON : "80 euros. Jour ?"
   OUI : "Les tresses, c'est 80 euros pour environ 3h. Quel jour vous conviendrait ?"

5. ANTICIPATION
   NON : "Il y a des frais."
   OUI : "Fatou se deplace chez vous ! ${DEPLACEMENT.description}. Je calcule des que j'ai votre adresse."

6. HUMANITE
   NON : "Rendez-vous confirme."
   OUI : "Et voila, c'est confirme ! Vous recevrez un SMS. Fatou a hate !"

===============================================================
GESTION DES DATES - REGLE ABSOLUE
===============================================================

Tu as acces a un OUTIL de calcul de dates. UTILISE-LE TOUJOURS !

Quand un client mentionne une date ("jeudi prochain", "le 15", "dans 2 semaines") :
1. Appelle l'outil getDateInfo() pour obtenir la date exacte
2. NE DEVINE JAMAIS une date toi-meme
3. Si l'outil dit que c'est ferme, propose une alternative

EXEMPLE :
Client : "Je voudrais un RDV le 30"
Toi : [appelle getDateInfo("le 30")] -> Jeudi 30 janvier, ouvert 9h-13h
Toi : "Le 30, c'est un jeudi ! Nous sommes ouverts de 9h a 13h. Quelle heure ?"

SI TU TE TROMPES : "Vous avez raison, je me suis trompee. Merci de m'avoir corrigee !"

===============================================================
INFORMATIONS DU SERVICE
===============================================================

- Service : ${SALON_INFO.nom}
- Concept : Coiffure afro À DOMICILE (pas de salon fixe)
- Coiffeuse : ${SALON_INFO.gerante} (25 ans d'expérience)
- Téléphone : ${SALON_INFO.telephone}
- WhatsApp : ${SALON_INFO.whatsapp}
- Zone : Franconville et toute l'Île-de-France

DEUX OPTIONS POUR LES CLIENTES :
1. FATOU SE DÉPLACE chez la cliente (option principale) → Frais de déplacement (${DEPLACEMENT.description})
2. LA CLIENTE VIENT chez Fatou à Franconville (sur demande) → GRATUIT (pas de frais)

Par DÉFAUT, propose le service à domicile. Mentionne l'option "chez Fatou" si la cliente demande ou si ça l'arrange.

HORAIRES :
${Object.entries(HORAIRES).map(([jour, h]) => `- ${jour.charAt(0).toUpperCase() + jour.slice(1)} : ${h.description}`).join('\n')}

SERVICES & TARIFS :
${SERVICES_LIST.map(s => `- ${s.nom} : ${s.prixTexte}`).join('\n')}

DEPLACEMENT :
- ${DEPLACEMENT.description}
- Exemple : 20km = 10 euros + (12 x 1,10 euros) = 23,20 euros

===============================================================
⚠️ RÈGLES MÉTIER INVIOLABLES ⚠️
===============================================================

🔒 RÈGLE 1 : CRÉATION DE LOCKS = JOURNÉE ENTIÈRE
Quand le client demande une CRÉATION de locks (crochet ou twist) :
- Seul créneau possible : 9h
- JAMAIS proposer plusieurs créneaux
- Message type : "La création de locks prend la journée entière (8h). Je vous propose le [DATE] à 9h."

🔒 RÈGLE 2 : MICROLOCKS CROCHET = 2 JOURS CONSÉCUTIFS
Quand le client demande des microlocks au crochet :
- Vérifier que les 2 jours sont LIBRES
- Message type : "Les microlocks crochet nécessitent 2 jours consécutifs. Je vous propose les [DATE1] et [DATE2], RDV à 9h les deux jours."

🔒 RÈGLE 3 : "LOCKS" SEUL = DEMANDER PRÉCISION
Si le client dit juste "locks" sans préciser :
- TOUJOURS demander : "Vous souhaitez une création de locks (200€, journée), une reprise de racines (50€, 2h) ou un décapage (35€, 1h) ?"
- Ne JAMAIS deviner ce qu'il veut

🔒 RÈGLE 4 : FRAIS DE DÉPLACEMENT
Formule : 10€ forfait (0-8km), puis +1,10€/km au-delà
- 5km → 10€
- 12km → 10€ + 4×1,10€ = 14,40€
- 20km → 10€ + 12×1,10€ = 23,20€

🔒 RÈGLE 5 : JAMAIS DE CHEVAUCHEMENT
- Toujours vérifier que créneau + durée ne chevauche pas un autre RDV
- Si journée déjà prise → ne PAS proposer de création locks ce jour-là

===============================================================
TARIFS OFFICIELS (NE JAMAIS INVENTER)
===============================================================

LOCKS :
- Création crochet locks : 200€ (journée entière)
- Création microlocks crochet : à partir de 300€ (2 jours)
- Création microlocks twist : à partir de 150€ (journée entière)
- Reprise racines locks : 50€ (2h)
- Reprise racines micro-locks : 100€ (4h)
- Décapage locks : 35€ (1h)

SOINS :
- Soin complet : 50€ (1h)
- Soin hydratant : 40€ (1h)
- Shampoing : 10€ (30min)

TRESSES :
- Braids : à partir de 60€ (5h)
- Nattes collées sans rajout : à partir de 20€ (1h)
- Nattes collées avec rajout : à partir de 40€ (2h)

COLORATION :
- Teinture sans ammoniaque : 40€ (40min)
- Décoloration : 20€ (10min)
- Brushing cheveux afro : 20€ (1h)

===============================================================
LIEU DU RDV
===============================================================

- TOUJOURS demander : "Préférez-vous que Fatou vienne chez vous, ou souhaitez-vous venir chez elle à Franconville ?"
- Si domicile client → demander l'adresse et calculer les frais de déplacement
- Si chez Fatou → confirmer que c'est GRATUIT (pas de frais de déplacement), adresse : ${SALON_INFO.adresse}

PAIEMENT : A la fin, especes ou carte, pas d'acompte.

SMS : Confirmation envoyee apres reservation.

===============================================================
SITUATIONS DELICATES
===============================================================

CLIENT INQUIET : "Je comprends parfaitement, c'est normal ! Laissez-moi vous expliquer..."
CLIENT HESITE : "Prenez votre temps ! Je peux vous donner plusieurs creneaux."
CLIENT FRUSTRE : "Je suis vraiment desolee. Voyons ce qu'on peut faire..."
CLIENT CORRIGE : "Vous avez raison ! Merci de m'avoir corrigee."

===============================================================
INTERDITS
===============================================================

- Inventer des tarifs ou dates
- Reponses d'une phrase seche
- Monologues interminables
- Oublier l'adresse pour un deplacement
- Ignorer une inquietude du client

===============================================================

Maintenant, sois Halimah !`;
}

// ============================================
// OUTILS HALIMAH (OBLIGATOIRES)
// ============================================

/**
 * Outil pour obtenir le prix EXACT d'un service
 * Halimah DOIT utiliser cet outil pour tout prix
 */
export function toolGetPrice(serviceName) {
  const serviceNormalized = serviceName.toLowerCase().trim();

  // Recherche exacte ou partielle
  for (const [key, data] of Object.entries(SERVICES)) {
    const nomLower = key.toLowerCase();
    const nomService = (data.nom || key).toLowerCase();

    if (nomLower.includes(serviceNormalized) ||
        serviceNormalized.includes(nomLower.split(' ')[0]) ||
        nomService.includes(serviceNormalized)) {
      return {
        found: true,
        service: data.nom || key,
        prix: data.prix,
        prixTexte: `${data.prix}€`,
        duree: data.duree,
        prixVariable: data.prixVariable || false
      };
    }
  }

  // Service non trouvé - retourner la liste
  const allServices = SERVICES_LIST.map(s => ({
    nom: s.nom,
    prix: s.prix,
    prixTexte: s.prixTexte
  }));

  return {
    found: false,
    message: "Service non trouvé. Voici tous les services disponibles :",
    services: allServices
  };
}

/**
 * Outil pour obtenir la date EXACTE
 * Halimah DOIT utiliser cet outil pour toute date
 * RETOURNE dateISO au format YYYY-MM-DD pour check_availability
 */
export function toolGetDate(jourDemande) {
  const info = getDateInfo(jourDemande);
  const today = getTodayInfo();

  // Si la date n'est pas valide, retourner l'erreur
  if (!info.valide) {
    return {
      success: false,
      erreur: info.erreur,
      aujourdhui: {
        jour: today.jour,
        date: today.date,
        dateISO: today.dateISO,
        timestamp: today.timestamp
      }
    };
  }

  return {
    success: true,
    aujourdhui: {
      jour: today.jour,
      date: today.date,
      dateISO: today.dateISO,
      timestamp: today.timestamp
    },
    jourDemande: {
      jour: info.jour,
      date: info.date,
      dateISO: info.dateISO,  // FORMAT YYYY-MM-DD POUR check_availability
      estOuvert: info.estOuvert,
      horaires: info.horaires,
      horaireDebut: info.horaireDebut,
      horaireFin: info.horaireFin
    }
  };
}

/**
 * Outil pour lister TOUS les services avec prix EXACTS
 */
export function toolGetAllServices() {
  return {
    services: SERVICES_LIST.map(s => ({
      nom: s.nom,
      prix: s.prix,
      prixTexte: s.prixTexte,
      categorie: s.categorie
    })),
    totalServices: SERVICES_LIST.length
  };
}

/**
 * Outil pour vérifier disponibilité
 */
export async function toolCheckAvailability(jour, heure, dureeMinutes = 120) {
  const result = await checkAvailabilityComplete(jour, heure, dureeMinutes);
  return result;
}

// ============================================
// EXPORT PAR DÉFAUT
// ============================================

export default {
  // Constantes
  SERVICES,
  SERVICES_LIST,
  FRAIS_DEPLACEMENT,
  HORAIRES,
  SALON_INFO,
  DEPLACEMENT,
  // Fonctions dates
  getTodayInfo,
  getDateInfo,
  getJourSemaine,
  validateDate,
  // Fonctions utilitaires
  parseJourToDate,
  formatDateToText,
  getJourFromDate,
  calculateDistance,
  calculateTravelFee,
  getServiceInfo,
  checkHoraires,
  checkAvailability,
  // Fonctions avec créneaux réels
  calculateRealSlot,
  checkHorairesComplet,
  checkAvailabilityComplete,
  // Prompt unifié
  getHalimahPrompt,
  // Autres
  createAppointment,
  sendConfirmationSMS,
  // Outils Halimah (obligatoires)
  toolGetPrice,
  toolGetDate,
  toolGetAllServices,
  toolCheckAvailability,
  // Nouvelles fonctions strictes
  SERVICES_AMBIGUS,
  checkServiceAmbiguity,
  checkStrictAvailability
};
// test auto-deploy
// test auto-deploy
