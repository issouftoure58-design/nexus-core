/**
 * Service WhatsApp avec intégration IA Halimah
 * Fat's Hair-Afro - Coiffure à domicile en Île-de-France
 *
 * MIGRÉ VERS NEXUS CORE - Janvier 2026
 * Utilise nexusCore.processMessage() comme source unique de logique
 */

import { createClient } from '@supabase/supabase-js';
import { getDistanceFromSalon } from './googleMapsService.js';
import { checkDisponibilite, getCreneauxDisponibles } from './dispoService.js';
import { calculerFraisDepl, calculerBlocReservation } from '../utils/tarification.js';
import bookingService from './bookingService.js';
import { BLOCKING_STATUTS } from '../config/businessRules.js';
// NEXUS CORE UNIFIÉ - Source unique de logique métier
import nexusCore from '../core/unified/nexusCore.js';

// Client Supabase pour opérations DB WhatsApp
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

/**
 * Récupère les RDV existants pour une date donnée depuis la DB
 * Utilisé pour la détection de conflits/chevauchements
 */
async function getRdvExistantsByDate(date) {
  const db = getSupabase();
  if (!db) return [];

  try {
    const { data: bookings, error } = await db
      .from('reservations')
      .select('id, date, heure, duree_minutes, service_nom, statut, duree_trajet_minutes')
      .eq('date', date)
      .in('statut', BLOCKING_STATUTS);

    if (error) {
      console.error('[WhatsApp] Erreur récupération RDV existants:', error);
      return [];
    }

    return (bookings || []).map(b => ({
      id: b.id,
      heure: b.heure,
      duree_minutes: b.duree_minutes || 60,
      temps_trajet_minutes: b.duree_trajet_minutes || 0,
      service_nom: b.service_nom,
      client_nom: 'Client',
    }));
  } catch (err) {
    console.error('[WhatsApp] Exception récupération RDV:', err.message);
    return [];
  }
}

const {
  SERVICES,
  SERVICES_LIST,
  HORAIRES,
  SALON_INFO,
  DEPLACEMENT,
  getHalimahPrompt,
  createAppointment,
  parseJourToDate
} = bookingService;

// Store des contextes nexusCore par numéro de téléphone
const nexusContexts = new Map();

// ============= CONFIGURATION =============

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://fatshairafro.fr';
const PAYMENT_TIMEOUT_MINUTES = 30;
const PAYMENT_REMINDER_MINUTES = 15;

// Adresse de départ de Fatou
const ADRESSE_DEPART = '8 rue des Monts Rouges, 95130 Franconville';

// Limites de distance
const DISTANCE_MAX_KM = 50;        // Distance maximale acceptée
const DISTANCE_WARNING_KM = 35;   // Seuil d'avertissement (frais élevés)

// ============= TYPES D'ERREURS (pour logging/monitoring) =============

const ERROR_TYPES = {
  GOOGLE_MAPS_API_KEY_MISSING: 'GOOGLE_MAPS_API_KEY_MISSING',
  GOOGLE_MAPS_API_ERROR: 'GOOGLE_MAPS_API_ERROR',
  GOOGLE_MAPS_NO_RESULTS: 'GOOGLE_MAPS_NO_RESULTS',
  GOOGLE_MAPS_ZERO_RESULTS: 'GOOGLE_MAPS_ZERO_RESULTS',
  ADDRESS_INVALID: 'ADDRESS_INVALID',
  ADDRESS_TOO_FAR: 'ADDRESS_TOO_FAR',
  ADDRESS_PARSE_ERROR: 'ADDRESS_PARSE_ERROR',
  NO_SLOTS_AVAILABLE: 'NO_SLOTS_AVAILABLE',
  SLOT_CONFLICT: 'SLOT_CONFLICT',
  PAYMENT_TIMEOUT: 'PAYMENT_TIMEOUT',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  RDV_CREATION_ERROR: 'RDV_CREATION_ERROR',
  TWILIO_SEND_ERROR: 'TWILIO_SEND_ERROR',
  TWILIO_INVALID_NUMBER: 'TWILIO_INVALID_NUMBER',
  TWILIO_WHATSAPP_UNAVAILABLE: 'TWILIO_WHATSAPP_UNAVAILABLE',
  TWILIO_QUOTA_EXCEEDED: 'TWILIO_QUOTA_EXCEEDED',
  TWILIO_NOT_CONFIGURED: 'TWILIO_NOT_CONFIGURED',
  PHONE_FORMAT_INVALID: 'PHONE_FORMAT_INVALID',
  DATABASE_ERROR: 'DATABASE_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

// ============= LOGGER POUR MONITORING =============

/**
 * Log structuré pour le monitoring
 * @param {string} level - 'INFO' | 'WARN' | 'ERROR'
 * @param {string} errorType - Type d'erreur (ERROR_TYPES)
 * @param {string} message - Message descriptif
 * @param {Object} data - Données additionnelles
 */
function logEvent(level, errorType, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    errorType,
    message,
    service: 'WhatsAppService',
    ...data,
  };

  const prefix = {
    INFO: '\x1b[36m[INFO]\x1b[0m',
    WARN: '\x1b[33m[WARN]\x1b[0m',
    ERROR: '\x1b[31m[ERROR]\x1b[0m',
  }[level] || '[LOG]';

  console.log(`${prefix} [WhatsApp] ${message}`, JSON.stringify(logEntry, null, 2));

  // TODO: Envoyer vers un service de monitoring (Sentry, DataDog, etc.)
  // if (level === 'ERROR') {
  //   sendToMonitoring(logEntry);
  // }
}

/**
 * Détermine le type d'erreur Google Maps à partir du message
 */
function classifyGoogleMapsError(error) {
  const errorMsg = error.message?.toLowerCase() || '';

  if (errorMsg.includes('api_key') || errorMsg.includes('api key')) {
    return ERROR_TYPES.GOOGLE_MAPS_API_KEY_MISSING;
  }
  if (errorMsg.includes('zero_results') || errorMsg.includes('no results')) {
    return ERROR_TYPES.GOOGLE_MAPS_ZERO_RESULTS;
  }
  if (errorMsg.includes('request_denied') || errorMsg.includes('invalid request')) {
    return ERROR_TYPES.GOOGLE_MAPS_API_ERROR;
  }
  if (errorMsg.includes('over_query_limit') || errorMsg.includes('quota')) {
    return ERROR_TYPES.GOOGLE_MAPS_API_ERROR;
  }

  return ERROR_TYPES.GOOGLE_MAPS_API_ERROR;
}

// ============= ESTIMATION DE DISTANCE (FALLBACK) =============

/**
 * Estimation grossière de la distance basée sur le code postal
 * Utilisé en fallback si Google Maps échoue
 */
const DISTANCE_ESTIMATIONS = {
  // Val d'Oise (95) - proche
  '95130': 0,    // Franconville (point de départ)
  '95100': 5,    // Argenteuil
  '95120': 3,    // Ermont
  '95110': 4,    // Sannois
  '95200': 6,    // Sarcelles
  '95150': 5,    // Taverny
  '95300': 8,    // Pontoise
  '95000': 7,    // Cergy
  // Paris
  '75001': 20, '75002': 20, '75003': 19, '75004': 19, '75005': 21,
  '75006': 21, '75007': 22, '75008': 18, '75009': 17, '75010': 17,
  '75011': 18, '75012': 20, '75013': 22, '75014': 23, '75015': 23,
  '75016': 20, '75017': 15, '75018': 14, '75019': 15, '75020': 18,
  // Hauts-de-Seine (92)
  '92000': 18, // Nanterre
  '92100': 20, // Boulogne
  '92200': 16, // Neuilly
  '92300': 18, // Levallois
  '92400': 21, // Courbevoie
  // Seine-Saint-Denis (93)
  '93100': 15, // Montreuil
  '93200': 10, // Saint-Denis
  '93300': 12, // Aubervilliers
  '93400': 12, // Saint-Ouen
  // Val-de-Marne (94)
  '94000': 25, // Créteil
  '94200': 22, // Ivry
  '94300': 24, // Vincennes
  // Yvelines (78)
  '78000': 30, // Versailles
  '78100': 25, // Saint-Germain
  // Essonne (91)
  '91000': 35, // Évry
  '91100': 30, // Corbeil
  // Seine-et-Marne (77)
  '77000': 50, // Melun
};

/**
 * Extrait le code postal d'une adresse
 */
function extractCodePostal(adresse) {
  const match = adresse.match(/\b(75|77|78|91|92|93|94|95)\d{3}\b/);
  return match ? match[0] : null;
}

/**
 * Estime la distance à partir du code postal (fallback)
 */
function estimerDistanceParCodePostal(adresse) {
  const codePostal = extractCodePostal(adresse);

  if (!codePostal) {
    return null;
  }

  // Chercher une correspondance exacte
  if (DISTANCE_ESTIMATIONS[codePostal]) {
    return {
      distance_km: DISTANCE_ESTIMATIONS[codePostal],
      estimation: true,
      code_postal: codePostal,
    };
  }

  // Estimation par département
  const dept = codePostal.substring(0, 2);
  const estimations = {
    '95': 10,  // Val d'Oise
    '75': 18,  // Paris
    '92': 18,  // Hauts-de-Seine
    '93': 12,  // Seine-Saint-Denis
    '94': 22,  // Val-de-Marne
    '78': 28,  // Yvelines
    '91': 32,  // Essonne
    '77': 45,  // Seine-et-Marne
  };

  if (estimations[dept]) {
    return {
      distance_km: estimations[dept],
      estimation: true,
      code_postal: codePostal,
      departement: dept,
    };
  }

  return null;
}

// Map pour stocker les timeouts de paiement en attente
const paymentTimeouts = new Map();

// Map pour stocker le contexte de conversation par client
const conversationContexts = new Map();

// ============= PROMPT SYSTÈME HALIMAH =============

/**
 * Prompt système pour l'IA Halimah - CENTRALISÉ depuis bookingService.js
 * Utilise les vrais tarifs Fatou et la même personnalité sur tous les canaux
 */
export const HALIMAH_SYSTEM_PROMPT = getHalimahPrompt('whatsapp', true);

// ============= OUTILS POUR L'IA =============

/**
 * Outils disponibles pour Halimah (tool use)
 */
export const HALIMAH_TOOLS = [
  {
    name: 'calculer_distance',
    description: "Calcule la distance et le temps de trajet entre le point de départ (Franconville) et l'adresse du client",
    input_schema: {
      type: 'object',
      properties: {
        adresse_client: {
          type: 'string',
          description: "L'adresse complète du client (numéro, rue, code postal, ville)",
        },
      },
      required: ['adresse_client'],
    },
  },
  {
    name: 'calculer_frais_deplacement',
    description: 'Calcule les frais de déplacement en fonction de la distance',
    input_schema: {
      type: 'object',
      properties: {
        distance_km: {
          type: 'number',
          description: 'La distance en kilomètres',
        },
      },
      required: ['distance_km'],
    },
  },
  {
    name: 'verifier_disponibilite',
    description: "Vérifie si un créneau horaire est disponible pour un service, en tenant compte du temps de trajet",
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'La date au format YYYY-MM-DD',
        },
        heure: {
          type: 'string',
          description: "L'heure au format HH:MM",
        },
        duree_service_minutes: {
          type: 'number',
          description: 'La durée du service en minutes',
        },
        adresse_client: {
          type: 'string',
          description: "L'adresse du client pour calculer le temps de trajet",
        },
      },
      required: ['date', 'heure', 'duree_service_minutes', 'adresse_client'],
    },
  },
  {
    name: 'obtenir_creneaux_disponibles',
    description: 'Retourne la liste des créneaux disponibles pour une date donnée',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'La date au format YYYY-MM-DD',
        },
        duree_service_minutes: {
          type: 'number',
          description: 'La durée du service en minutes',
        },
        adresse_client: {
          type: 'string',
          description: "L'adresse du client pour calculer le temps de trajet",
        },
      },
      required: ['date', 'duree_service_minutes', 'adresse_client'],
    },
  },
  {
    name: 'generer_lien_paiement',
    description: 'Génère un lien de paiement sécurisé pour la réservation',
    input_schema: {
      type: 'object',
      properties: {
        client_telephone: {
          type: 'string',
          description: 'Numéro de téléphone du client',
        },
        client_nom: {
          type: 'string',
          description: 'Nom du client',
        },
        client_prenom: {
          type: 'string',
          description: 'Prénom du client',
        },
        date: {
          type: 'string',
          description: 'Date du RDV (YYYY-MM-DD)',
        },
        heure: {
          type: 'string',
          description: 'Heure du RDV (HH:MM)',
        },
        service: {
          type: 'string',
          description: 'Nom du service',
        },
        duree_minutes: {
          type: 'number',
          description: 'Durée en minutes',
        },
        prix_service: {
          type: 'number',
          description: 'Prix du service en euros',
        },
        adresse_client: {
          type: 'string',
          description: 'Adresse complète du client',
        },
        frais_deplacement: {
          type: 'number',
          description: 'Frais de déplacement en euros',
        },
      },
      required: ['client_telephone', 'date', 'heure', 'service', 'duree_minutes', 'prix_service', 'adresse_client', 'frais_deplacement'],
    },
  },
];

// ============= EXÉCUTION DES OUTILS =============

/**
 * Exécute un outil demandé par l'IA
 * @param {string} toolName - Nom de l'outil
 * @param {Object} toolInput - Paramètres de l'outil
 * @returns {Promise<Object>} Résultat de l'outil
 */
export async function executeHalimahTool(toolName, toolInput) {
  console.log(`[Halimah] Exécution outil: ${toolName}`, toolInput);

  try {
    switch (toolName) {
      case 'calculer_distance': {
        const result = await getDistanceFromSalon(toolInput.adresse_client);
        return {
          success: true,
          distance_km: result.distance_km,
          duree_minutes: result.duree_minutes,
          distance_text: result.distance_text,
          duree_text: result.duree_text,
          adresse_formatee: result.destination,
        };
      }

      case 'calculer_frais_deplacement': {
        const frais = calculerFraisDepl(toolInput.distance_km);
        return {
          success: true,
          distance_km: toolInput.distance_km,
          frais_euros: frais,
          detail: toolInput.distance_km <= 8
            ? 'Tarif forfaitaire 0-8 km'
            : `10€ + ${(toolInput.distance_km - 8).toFixed(1)} km × 1,10€`,
        };
      }

      case 'verifier_disponibilite': {
        // Récupérer les RDV existants depuis la DB
        const rdvExistants = await getRdvExistantsByDate(toolInput.date);

        const result = await checkDisponibilite(
          toolInput.date,
          toolInput.heure,
          toolInput.duree_service_minutes,
          toolInput.adresse_client,
          rdvExistants
        );

        return {
          success: true,
          disponible: result.disponible,
          raison: result.raison || null,
          bloc_reservation: result.bloc_reservation || null,
        };
      }

      case 'obtenir_creneaux_disponibles': {
        // Récupérer les RDV existants depuis la DB
        const rdvExistants = await getRdvExistantsByDate(toolInput.date);

        // Horaires par défaut
        const horaires = getHorairesJour(toolInput.date);

        if (!horaires) {
          return {
            success: false,
            error: 'Jour fermé (dimanche)',
            creneaux: [],
          };
        }

        const creneaux = await getCreneauxDisponibles(
          toolInput.date,
          toolInput.duree_service_minutes,
          toolInput.adresse_client,
          rdvExistants,
          horaires,
          30 // Intervalle de 30 min
        );

        return {
          success: true,
          date: toolInput.date,
          creneaux: creneaux,
          nombre_creneaux: creneaux.length,
        };
      }

      case 'generer_lien_paiement': {
        const result = await handleCreneauConfirmation({
          clientPhone: toolInput.client_telephone,
          clientNom: toolInput.client_nom || '',
          clientPrenom: toolInput.client_prenom || '',
          date: toolInput.date,
          heure: toolInput.heure,
          service: toolInput.service,
          dureeMinutes: toolInput.duree_minutes,
          prixService: toolInput.prix_service,
          adresseClient: toolInput.adresse_client,
          fraisDeplacement: toolInput.frais_deplacement,
        });

        return {
          success: true,
          rdv_id: result.rdv_id,
          payment_url: result.payment_url,
          expires_at: result.expires_at,
          message: `Lien de paiement généré. Expire dans ${PAYMENT_TIMEOUT_MINUTES} minutes.`,
        };
      }

      default:
        return {
          success: false,
          error: `Outil inconnu: ${toolName}`,
        };
    }
  } catch (error) {
    console.error(`[Halimah] Erreur outil ${toolName}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Retourne les horaires d'ouverture pour un jour donné
 */
function getHorairesJour(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  const jour = date.getDay(); // 0 = dimanche, 1 = lundi, etc.

  const horaires = {
    0: null, // Dimanche - fermé
    1: { debut: '09:00', fin: '18:00' }, // Lundi
    2: { debut: '09:00', fin: '18:00' }, // Mardi
    3: { debut: '09:00', fin: '18:00' }, // Mercredi
    4: { debut: '09:00', fin: '13:00' }, // Jeudi (matin uniquement)
    5: { debut: '13:00', fin: '18:00' }, // Vendredi (apres-midi uniquement)
    6: { debut: '09:00', fin: '18:00' }, // Samedi
  };

  return horaires[jour];
}

/**
 * Trouve les prochaines dates avec des créneaux disponibles
 * @param {string} startDate - Date de départ (YYYY-MM-DD)
 * @param {number} duree_minutes - Durée du service
 * @param {string} adresse_client - Adresse du client
 * @param {number} maxDays - Nombre maximum de jours à chercher (défaut: 14)
 * @param {number} maxResults - Nombre de dates à retourner (défaut: 3)
 * @returns {Promise<Array>} Liste des prochaines dates avec créneaux
 */
async function findNextAvailableDates(startDate, duree_minutes, adresse_client, maxDays = 14, maxResults = 3) {
  const results = [];
  const currentDate = new Date(startDate);

  // Avancer d'un jour pour commencer
  currentDate.setDate(currentDate.getDate() + 1);

  for (let i = 0; i < maxDays && results.length < maxResults; i++) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const horaires = getHorairesJour(dateStr);

    // Skip si jour fermé
    if (!horaires) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    try {
      // Récupérer les RDV existants pour cette date depuis la DB
      const rdvExistants = await getRdvExistantsByDate(dateStr);

      const creneaux = await getCreneauxDisponibles(
        dateStr,
        duree_minutes,
        adresse_client,
        rdvExistants,
        horaires,
        30
      );

      if (creneaux.length > 0) {
        results.push({
          date: dateStr,
          dateFr: formatDateFr(dateStr),
          creneauxCount: creneaux.length,
          premierCreneau: creneaux[0].heure,
          dernierCreneau: creneaux[creneaux.length - 1].heure,
        });
      }
    } catch (error) {
      // Ignorer les erreurs et passer au jour suivant
      console.error(`[WhatsApp] Erreur recherche créneaux ${dateStr}:`, error.message);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return results;
}

// ============= GESTION DU CONTEXTE DE CONVERSATION =============

/**
 * Récupère ou crée le contexte de conversation d'un client
 */
export function getConversationContext(clientPhone) {
  if (!conversationContexts.has(clientPhone)) {
    conversationContexts.set(clientPhone, {
      // État de la conversation
      etape: 'accueil', // accueil, service_choisi, attente_adresse, adresse_recue, attente_date, date_recue, confirmation, paiement

      // Infos client
      client_nom: null,
      client_prenom: null,

      // Service choisi
      service: null,
      duree_minutes: null,
      prix_service: null,

      // Adresse et déplacement
      adresse_client: null,
      adresse_formatee: null,
      distance_km: null,
      duree_trajet_minutes: null,
      frais_deplacement: null,

      // Total
      total: null,

      // RDV
      date: null,
      heure: null,
      heure_fin: null,
      rdv_id: null,

      // Timestamps
      created_at: new Date(),
      updated_at: new Date(),
    });
  }
  return conversationContexts.get(clientPhone);
}

/**
 * Met à jour le contexte de conversation
 */
export function updateConversationContext(clientPhone, updates) {
  const context = getConversationContext(clientPhone);
  Object.assign(context, updates, { updated_at: new Date() });
  conversationContexts.set(clientPhone, context);
  return context;
}

/**
 * Réinitialise le contexte de conversation
 */
export function resetConversationContext(clientPhone) {
  conversationContexts.delete(clientPhone);
}

// ============= TRAITEMENT DES MESSAGES ENTRANTS =============

/**
 * Liste des services disponibles - CENTRALISÉE depuis bookingService.js
 * Utilise les vrais tarifs Fatou
 */
const SERVICES_DISPONIBLES = Object.entries(SERVICES).reduce((acc, [nom, data]) => {
  const key = nom.toLowerCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  acc[key] = {
    nom: data.nom || nom,
    duree: data.duree,
    prix: data.prix,
    prixVariable: data.prixVariable || false
  };
  return acc;
}, {});

/**
 * Traite un message entrant WhatsApp et gère le flux de conversation
 *
 * @param {string} clientPhone - Numéro de téléphone du client
 * @param {string} message - Message reçu du client
 * @param {string} clientName - Nom du client (optionnel, fourni par WhatsApp)
 * @returns {Promise<Object>} Réponse à envoyer au client
 */
export async function handleIncomingMessage(clientPhone, message, clientName = null) {
  console.log(`[WhatsApp] Message reçu de ${clientPhone}: ${message}`);

  // Récupérer ou créer le contexte de conversation
  const context = getConversationContext(clientPhone);
  const messageLower = message.toLowerCase().trim();

  // Si le client envoie "annuler" ou "stop", réinitialiser la conversation
  if (['annuler', 'stop', 'reset', 'recommencer'].includes(messageLower)) {
    resetConversationContext(clientPhone);
    return {
      success: true,
      response: `Pas de problème ! La conversation a été réinitialisée.

Si vous souhaitez prendre rendez-vous, envoyez "Bonjour" pour commencer. 😊

Fat's Hair-Afro
📞 07 82 23 50 20`,
    };
  }

  try {
    let response;

    switch (context.etape) {
      case 'accueil':
        response = await handleEtapeAccueil(clientPhone, message, clientName, context);
        break;

      case 'service_choisi':
      case 'attente_adresse':
        response = await handleEtapeAdresse(clientPhone, message, context);
        break;

      case 'adresse_recue':
      case 'attente_date':
        response = await handleEtapeDate(clientPhone, message, context);
        break;

      case 'date_recue':
      case 'attente_heure':
        response = await handleEtapeHeure(clientPhone, message, context);
        break;

      case 'confirmation':
        response = await handleEtapeConfirmation(clientPhone, message, context);
        break;

      case 'paiement':
        response = await handleEtapePaiement(clientPhone, message, context);
        break;

      default:
        response = await handleEtapeAccueil(clientPhone, message, clientName, context);
    }

    // Envoyer la réponse via WhatsApp
    if (response.response) {
      await sendWhatsAppMessage(clientPhone, response.response);
    }

    return response;

  } catch (error) {
    console.error('[WhatsApp] Erreur handleIncomingMessage:', error);

    const errorResponse = `Oups, petit souci technique ! 😅
Réessayez ou appelez le 09 39 24 02 69`;

    await sendWhatsAppMessage(clientPhone, errorResponse);

    return {
      success: false,
      error: error.message,
      response: errorResponse,
    };
  }
}

// ============= NOUVEAU HANDLER NEXUS CORE =============

/**
 * Traite un message entrant WhatsApp via NEXUS CORE
 * Nouvelle implémentation utilisant la logique centralisée
 *
 * @param {string} clientPhone - Numéro de téléphone du client
 * @param {string} message - Message reçu du client
 * @param {string} clientName - Nom du client (optionnel, fourni par WhatsApp)
 * @returns {Promise<Object>} Réponse à envoyer au client
 */
export async function handleIncomingMessageNexus(clientPhone, message, clientName = null) {
  console.log(`[WhatsApp-Nexus] Message reçu de ${clientPhone}: ${message}`);

  const messageLower = message.toLowerCase().trim();

  // Si le client envoie "annuler" ou "stop", réinitialiser la conversation
  if (['annuler', 'stop', 'reset', 'recommencer'].includes(messageLower)) {
    nexusContexts.delete(clientPhone);
    return {
      success: true,
      response: `Pas de problème ! La conversation a été réinitialisée.

Si vous souhaitez prendre rendez-vous, envoyez "Bonjour" pour commencer. 😊

Fat's Hair-Afro
📞 07 82 23 50 20`,
    };
  }

  try {
    // Récupérer ou créer le contexte nexusCore
    let context = nexusContexts.get(clientPhone);
    if (!context) {
      context = nexusCore.createConversationContext('whatsapp');
      // Si on a le nom du client, le stocker
      if (clientName) {
        context.data.prenom = clientName;
      }
      nexusContexts.set(clientPhone, context);
    }

    // Stocker le téléphone dans le contexte (on l'a déjà via WhatsApp)
    if (!context.data.telephone) {
      context.data.telephone = clientPhone.replace('whatsapp:', '');
    }

    // Traiter le message via nexusCore
    const result = nexusCore.processMessage(message, context, 'whatsapp');

    // Si action de création de réservation
    if (result.action === 'CREATE_BOOKING' && result.bookingData) {
      try {
        // Extraire le jour de la semaine depuis dateFormatee
        const dateFormatee = result.context.data.dateFormatee || '';
        const jourMatch = dateFormatee.match(/^(\w+)/);
        const jour = jourMatch ? jourMatch[1].toLowerCase() : null;

        // Calculer les frais de déplacement si domicile
        let fraisDeplacement = 0;
        if (result.bookingData.lieu === 'domicile' && result.bookingData.adresse) {
          try {
            const distanceResult = await getDistanceFromSalon(result.bookingData.adresse);
            if (distanceResult && distanceResult.distance) {
              const fraisResult = calculerFraisDepl(distanceResult.distance);
              fraisDeplacement = fraisResult.frais || 0;
            }
          } catch (distErr) {
            console.warn('[WhatsApp-Nexus] Erreur calcul distance:', distErr.message);
          }
        }

        const booking = await createAppointment({
          clientPrenom: result.bookingData.prenom,
          clientPhone: result.bookingData.telephone,
          service: result.bookingData.service,
          jour: jour,
          heure: result.bookingData.heure,
          clientAddress: result.bookingData.lieu === 'domicile' ? result.bookingData.adresse : null,
          source: 'whatsapp-nexus',
          notes: `WhatsApp - Lieu: ${result.bookingData.lieu === 'domicile' ? result.bookingData.adresse : 'Chez Fatou'}`
        });

        console.log('[WhatsApp-Nexus] Réservation créée:', booking);

        // Si le booking a échoué, informer le client
        if (!booking.success) {
          result.response = `Désolé, ce créneau n'est plus disponible. 😔

${booking.error || 'Erreur lors de la réservation.'}

Voulez-vous choisir un autre créneau ?`;
          result.context.state = nexusCore.CONVERSATION_STATES.ATTENTE_DATE;
        } else {
          // Ajouter le prix total dans la réponse
          const prixTotal = result.bookingData.prixService + fraisDeplacement;
          result.response += `\n\n💰 Total : ${prixTotal}€${fraisDeplacement > 0 ? ` (dont ${fraisDeplacement}€ de déplacement)` : ''}`;
        }
      } catch (bookingError) {
        console.error('[WhatsApp-Nexus] Erreur création RDV:', bookingError);
        result.response = `Désolé, une erreur s'est produite. Pouvez-vous réessayer ?`;
        result.context.state = nexusCore.CONVERSATION_STATES.ATTENTE_DATE;
      }
    }

    // Mettre à jour le contexte
    nexusContexts.set(clientPhone, result.context);

    // Envoyer la réponse via WhatsApp
    await sendWhatsAppMessage(clientPhone, result.response);

    return {
      success: true,
      response: result.response,
      state: result.context.state,
      data: result.context.data
    };

  } catch (error) {
    console.error('[WhatsApp-Nexus] Erreur:', error);

    const errorResponse = `Oups, petit souci technique ! 😅
Réessayez ou appelez le 07 82 23 50 20`;

    await sendWhatsAppMessage(clientPhone, errorResponse);

    return {
      success: false,
      error: error.message,
      response: errorResponse,
    };
  }
}

/**
 * Étape 1 : Accueil - Présentation et choix du service
 */
async function handleEtapeAccueil(clientPhone, message, clientName, context) {
  const messageLower = message.toLowerCase();

  // Détecter si le client mentionne un service
  const serviceDetecte = detecterService(messageLower);

  if (serviceDetecte) {
    // Le client a mentionné un service, passer à l'étape suivante
    const serviceInfo = SERVICES_DISPONIBLES[serviceDetecte];

    updateConversationContext(clientPhone, {
      etape: 'attente_adresse',
      client_nom: clientName,
      service: serviceInfo.nom,
      duree_minutes: serviceInfo.duree,
      prix_service: serviceInfo.prix,
    });

    return {
      success: true,
      response: `${serviceInfo.nom} ✨ ${serviceInfo.prix}€ (${formatDuree(serviceInfo.duree)})

Quelle est votre adresse ? 📍
Ex: 15 rue de la Paix, 75002 Paris`,
    };
  }

  // Message d'accueil standard
  if (clientName) {
    updateConversationContext(clientPhone, { client_nom: clientName });
  }

  return {
    success: true,
    response: `Bonjour${clientName ? ` ${clientName}` : ''} ! ✨ Je suis Halimah, l'assistante de Fatou.

Comment puis-je vous aider ?`,
  };
}

/**
 * Étape 2 : Réception et traitement de l'adresse client
 * Gestion robuste des erreurs Google Maps avec fallback
 */
async function handleEtapeAdresse(clientPhone, message, context) {
  const messageLower = message.toLowerCase();

  // Vérifier si c'est un changement de service
  const serviceDetecte = detecterService(messageLower);
  if (serviceDetecte) {
    const serviceInfo = SERVICES_DISPONIBLES[serviceDetecte];
    updateConversationContext(clientPhone, {
      service: serviceInfo.nom,
      duree_minutes: serviceInfo.duree,
      prix_service: serviceInfo.prix,
    });

    logEvent('INFO', 'SERVICE_CHANGED', 'Client a changé de service', {
      clientPhone,
      newService: serviceInfo.nom,
    });

    return {
      success: true,
      response: `${serviceInfo.nom} ✨ ${serviceInfo.prix}€
Votre adresse ? 📍`,
    };
  }

  // Vérifier si le client répond "oui" pour une adresse lointaine
  if (context.adresse_lointaine_proposee && ['oui', 'ok', 'd\'accord', 'yes'].some(mot => messageLower.includes(mot))) {
    // Le client accepte malgré la distance
    logEvent('INFO', 'DISTANCE_WARNING_ACCEPTED', 'Client accepte adresse lointaine', {
      clientPhone,
      distance_km: context.distance_km,
    });

    updateConversationContext(clientPhone, {
      etape: 'attente_date',
      adresse_lointaine_proposee: false,
    });

    return {
      success: true,
      response: `Parfait ! 👍 Quelle date ?
📅 Lun-Mer-Sam 9h-18h | Jeu 9h-13h | Ven 13h-18h`,
    };
  }

  // Vérifier si le client refuse pour une adresse lointaine
  if (context.adresse_lointaine_proposee && ['non', 'no', 'annuler'].some(mot => messageLower.includes(mot))) {
    logEvent('INFO', 'DISTANCE_WARNING_REFUSED', 'Client refuse adresse lointaine', {
      clientPhone,
      distance_km: context.distance_km,
    });

    updateConversationContext(clientPhone, {
      adresse_lointaine_proposee: false,
      adresse_client: null,
      distance_km: null,
    });

    return {
      success: true,
      response: `OK ! Une autre adresse en IdF ?
Ou "annuler" pour arrêter`,
    };
  }

  // Traiter l'adresse
  const adresse = message.trim();

  // Validation basique de l'adresse
  if (adresse.length < 10 || !adresse.match(/\d/)) {
    logEvent('WARN', ERROR_TYPES.ADDRESS_INVALID, 'Adresse invalide (format)', {
      clientPhone,
      adresse: adresse.substring(0, 50),
    });

    return {
      success: true,
      response: `Adresse non trouvée 📍
Ex: 15 rue de la Paix, 75002 Paris`,
    };
  }

  try {
    // Appeler Google Maps pour calculer la distance
    const distanceResult = await getDistanceFromSalon(adresse);

    logEvent('INFO', 'DISTANCE_CALCULATED', 'Distance calculée avec succès', {
      clientPhone,
      distance_km: distanceResult.distance_km,
      duree_minutes: distanceResult.duree_minutes,
      adresse_formatee: distanceResult.destination,
    });

    // CAS 1 : Adresse trop éloignée (> 50 km)
    if (distanceResult.distance_km > DISTANCE_MAX_KM) {
      const fraisEstimes = calculerFraisDepl(distanceResult.distance_km);

      logEvent('WARN', ERROR_TYPES.ADDRESS_TOO_FAR, 'Adresse hors zone', {
        clientPhone,
        distance_km: distanceResult.distance_km,
        frais_estimes: fraisEstimes,
      });

      return {
        success: true,
        response: `${distanceResult.distance_km.toFixed(0)} km, c'est hors zone 😔
Déplacement : ${fraisEstimes.toFixed(0)}€
📞 Appelez le 09 39 24 02 69 pour voir`,
      };
    }

    // CAS 2 : Adresse éloignée mais acceptable (35-50 km) - avertissement
    if (distanceResult.distance_km > DISTANCE_WARNING_KM) {
      const fraisDeplacement = calculerFraisDepl(distanceResult.distance_km);
      const total = context.prix_service + fraisDeplacement;

      logEvent('INFO', 'DISTANCE_WARNING', 'Adresse éloignée - avertissement', {
        clientPhone,
        distance_km: distanceResult.distance_km,
        frais_deplacement: fraisDeplacement,
      });

      // Sauvegarder le contexte mais demander confirmation
      updateConversationContext(clientPhone, {
        adresse_client: adresse,
        adresse_formatee: distanceResult.destination,
        distance_km: distanceResult.distance_km,
        duree_trajet_minutes: distanceResult.duree_minutes,
        frais_deplacement: fraisDeplacement,
        total: total,
        adresse_lointaine_proposee: true,
      });

      return {
        success: true,
        response: `📍 ${distanceResult.distance_km.toFixed(0)} km = ${fraisDeplacement.toFixed(0)}€ de déplacement
💰 Total : ${total.toFixed(0)}€

C'est un peu loin, on continue ? (oui/non)`,
      };
    }

    // CAS 3 : Distance normale - continuer
    const fraisDeplacement = calculerFraisDepl(distanceResult.distance_km);
    const total = context.prix_service + fraisDeplacement;

    // Mettre à jour le contexte
    updateConversationContext(clientPhone, {
      etape: 'attente_date',
      adresse_client: adresse,
      adresse_formatee: distanceResult.destination,
      distance_km: distanceResult.distance_km,
      duree_trajet_minutes: distanceResult.duree_minutes,
      frais_deplacement: fraisDeplacement,
      total: total,
      adresse_lointaine_proposee: false,
    });

    // Construire le message de récapitulatif
    const response = `${context.service} ${context.prix_service}€ + déplacement ${fraisDeplacement.toFixed(0)}€
💰 Total : ${total.toFixed(0)}€

Quelle date ? 📅 Lun-Mer-Sam 9h-18h | Jeu 9h-13h | Ven 13h-18h`;

    return {
      success: true,
      response: response,
    };

  } catch (error) {
    // Classifier l'erreur pour le monitoring
    const errorType = classifyGoogleMapsError(error);

    logEvent('ERROR', errorType, 'Erreur calcul distance Google Maps', {
      clientPhone,
      adresse: adresse.substring(0, 100),
      errorMessage: error.message,
      errorStack: error.stack?.substring(0, 500),
    });

    // CAS 4 : Erreur API Google Maps - essayer le fallback par code postal
    const estimation = estimerDistanceParCodePostal(adresse);

    if (estimation) {
      logEvent('INFO', 'DISTANCE_ESTIMATION_FALLBACK', 'Estimation par code postal utilisée', {
        clientPhone,
        code_postal: estimation.code_postal,
        distance_estimee: estimation.distance_km,
      });

      const fraisDeplacement = calculerFraisDepl(estimation.distance_km);
      const total = context.prix_service + fraisDeplacement;

      // Mettre à jour le contexte avec l'estimation
      updateConversationContext(clientPhone, {
        etape: 'attente_date',
        adresse_client: adresse,
        adresse_formatee: adresse,
        distance_km: estimation.distance_km,
        duree_trajet_minutes: Math.round(estimation.distance_km * 2.5), // Estimation 2.5 min/km
        frais_deplacement: fraisDeplacement,
        total: total,
        distance_estimee: true,
      });

      return {
        success: true,
        response: `${context.service} ${context.prix_service}€ + déplacement ~${fraisDeplacement.toFixed(0)}€
💰 Total estimé : ${total.toFixed(0)}€

Quelle date ? 📅 Lun-Mer-Sam 9h-18h | Jeu 9h-13h | Ven 13h-18h`,
      };
    }

    // Aucune estimation possible - demander plus d'infos
    return {
      success: true,
      response: `Souci technique 🔧
Donnez-moi votre ville + code postal
Ex: Argenteuil 95100`,
    };
  }
}

/**
 * Étape 3 : Réception de la date souhaitée
 * Avec gestion des créneaux indisponibles et suggestions d'alternatives
 */
async function handleEtapeDate(clientPhone, message, context) {
  const messageLower = message.toLowerCase();

  // Essayer de parser la date
  const dateResult = parseDate(message);

  if (!dateResult.valid) {
    logEvent('INFO', 'DATE_PARSE_FAILED', 'Date non reconnue', {
      clientPhone,
      input: message.substring(0, 50),
    });

    return {
      success: true,
      response: `Date non comprise 📅
Ex: "samedi", "25/01", "demain"`,
    };
  }

  // Vérifier si c'est un dimanche
  const dateObj = new Date(dateResult.date);
  if (dateObj.getDay() === 0) {
    logEvent('INFO', 'DATE_SUNDAY', 'Client a choisi un dimanche', {
      clientPhone,
      date: dateResult.date,
    });

    return {
      success: true,
      response: `Fermé le dimanche 😊
Autre jour ? Lun-Mer-Sam 9h-18h | Jeu 9h-13h | Ven 13h-18h`,
    };
  }

  // Obtenir les créneaux disponibles
  try {
    const horaires = getHorairesJour(dateResult.date);

    if (!horaires) {
      logEvent('INFO', 'DATE_CLOSED', 'Jour fermé demandé', {
        clientPhone,
        date: dateResult.date,
        dayOfWeek: dateObj.getDay(),
      });

      return {
        success: true,
        response: `Ce jour n'est pas dispo 📅
Lun-Mer-Sam 9h-18h | Jeu 9h-13h | Ven 13h-18h`,
      };
    }

    // Récupérer les RDV existants depuis la DB
    const rdvExistants = await getRdvExistantsByDate(dateResult.date);

    const creneaux = await getCreneauxDisponibles(
      dateResult.date,
      context.duree_minutes,
      context.adresse_client,
      rdvExistants,
      horaires,
      30
    );

    // CAS : Aucun créneau disponible - proposer des alternatives
    if (creneaux.length === 0) {
      logEvent('WARN', ERROR_TYPES.NO_SLOTS_AVAILABLE, 'Aucun créneau disponible', {
        clientPhone,
        date: dateResult.date,
        service: context.service,
        duree_minutes: context.duree_minutes,
      });

      // Chercher les prochaines dates disponibles
      try {
        const alternatives = await findNextAvailableDates(
          dateResult.date,
          context.duree_minutes,
          context.adresse_client,
          14, // Chercher sur 14 jours
          3   // Retourner 3 dates max
        );

        if (alternatives.length > 0) {
          const alternativesText = alternatives
            .map(alt => `• ${alt.dateFr} (${alt.premierCreneau}-${alt.dernierCreneau})`)
            .join('\n');

          logEvent('INFO', 'ALTERNATIVES_FOUND', 'Dates alternatives trouvées', {
            clientPhone,
            alternativesCount: alternatives.length,
          });

          return {
            success: true,
            response: `Complet le ${formatDateFr(dateResult.date)} 😔
Prochaines dispos :
${alternativesText}`,
          };
        }
      } catch (altError) {
        logEvent('ERROR', 'ALTERNATIVES_SEARCH_ERROR', 'Erreur recherche alternatives', {
          clientPhone,
          error: altError.message,
        });
      }

      // Pas d'alternatives trouvées
      return {
        success: true,
        response: `Complet en ce moment 😔
📞 Appelez le 09 39 24 02 69`,
      };
    }

    // Créneaux disponibles - continuer le flux normal
    logEvent('INFO', 'SLOTS_AVAILABLE', 'Créneaux disponibles trouvés', {
      clientPhone,
      date: dateResult.date,
      slotsCount: creneaux.length,
    });

    // Mettre à jour le contexte
    updateConversationContext(clientPhone, {
      etape: 'attente_heure',
      date: dateResult.date,
    });

    // Afficher les créneaux disponibles (max 6)
    const creneauxAffichage = creneaux.slice(0, 6);
    const creneauxText = creneauxAffichage
      .map(c => `• ${c.heure}`)
      .join('\n');

    return {
      success: true,
      response: `${formatDateFr(dateResult.date)} ✅
${creneauxText}
${creneaux.length > 6 ? `(+${creneaux.length - 6} autres)\n` : ''}
Quelle heure ? ⏰`,
    };

  } catch (error) {
    logEvent('ERROR', ERROR_TYPES.DATABASE_ERROR, 'Erreur récupération créneaux', {
      clientPhone,
      date: dateResult.date,
      error: error.message,
      stack: error.stack?.substring(0, 500),
    });

    return {
      success: true,
      response: `Erreur technique 🔧 Réessayez !`,
    };
  }
}

/**
 * Étape 4 : Réception de l'heure choisie
 */
async function handleEtapeHeure(clientPhone, message, context) {
  // Parser l'heure
  const heureResult = parseHeure(message);

  if (!heureResult.valid) {
    return {
      success: true,
      response: `Heure non comprise ⏰
Ex: "9h", "14h30", "10:00"`,
    };
  }

  // Vérifier la disponibilité du créneau
  try {
    // Récupérer les RDV existants pour cette date depuis la DB
    const rdvExistants = await getRdvExistantsByDate(context.date);

    const dispoResult = await checkDisponibilite(
      context.date,
      heureResult.heure,
      context.duree_minutes,
      context.adresse_client,
      rdvExistants
    );

    if (!dispoResult.disponible) {
      return {
        success: true,
        response: `${heureResult.heure} n'est plus dispo 😔
Autre heure ?`,
      };
    }

    // Calculer l'heure de fin
    const heureFin = calculerHeureFin(heureResult.heure, context.duree_minutes);

    // Mettre à jour le contexte
    updateConversationContext(clientPhone, {
      etape: 'confirmation',
      heure: heureResult.heure,
      heure_fin: heureFin,
    });

    // Demander confirmation
    return {
      success: true,
      response: `📅 ${formatDateFr(context.date)} ${heureResult.heure}-${heureFin}
💇‍♀️ ${context.service}
💰 ${context.total.toFixed(0)}€

OK ? (oui/non)`,
    };

  } catch (error) {
    console.error('[WhatsApp] Erreur vérification disponibilité:', error);

    return {
      success: true,
      response: `Erreur 🔧 Réessayez !`,
    };
  }
}

/**
 * Étape 5 : Confirmation et envoi du lien de paiement
 */
async function handleEtapeConfirmation(clientPhone, message, context) {
  const messageLower = message.toLowerCase().trim();

  // Vérifier la réponse
  if (['non', 'no', 'modifier', 'changer'].some(mot => messageLower.includes(mot))) {
    // Demander ce qu'il veut modifier
    return {
      success: true,
      response: `Modifier quoi ?
service / adresse / date / heure / annuler`,
    };
  }

  // Gérer les modifications
  if (messageLower.includes('service')) {
    updateConversationContext(clientPhone, { etape: 'accueil' });
    return handleEtapeAccueil(clientPhone, '', context.client_nom, context);
  }
  if (messageLower.includes('adresse')) {
    updateConversationContext(clientPhone, { etape: 'attente_adresse' });
    return {
      success: true,
      response: `Nouvelle adresse ? 📍`,
    };
  }
  if (messageLower.includes('date')) {
    updateConversationContext(clientPhone, { etape: 'attente_date' });
    return {
      success: true,
      response: `Quelle date ? 📅`,
    };
  }
  if (messageLower.includes('heure')) {
    updateConversationContext(clientPhone, { etape: 'attente_heure' });
    return handleEtapeDate(clientPhone, context.date, context);
  }

  // Confirmation positive
  if (['oui', 'yes', 'ok', 'confirmer', 'parfait', 'd\'accord', 'correct'].some(mot => messageLower.includes(mot))) {
    // Créer le RDV en base de données
    const rdv = await createRdvInDb({
      client_telephone: clientPhone,
      client_nom: context.client_nom || '',
      client_prenom: context.client_prenom || '',
      date: context.date,
      heure: context.heure,
      heure_fin: context.heure_fin,
      service_nom: context.service,
      duree_minutes: context.duree_minutes,
      prix_service: context.prix_service,
      adresse_client: context.adresse_client,
      adresse_formatee: context.adresse_formatee,
      distance_km: context.distance_km,
      duree_trajet_minutes: context.duree_trajet_minutes,
      frais_deplacement: context.frais_deplacement,
      total: context.total,
      statut: 'en_attente_paiement',
    });

    logEvent('INFO', 'RDV_CREATED', 'RDV créé en attente de paiement', {
      rdvId: rdv.id,
      clientPhone,
      clientNom: context.client_nom,
      date: context.date,
      heure: context.heure,
      service: context.service,
      total: context.total,
    });

    // Générer le lien de paiement
    const paymentUrl = generatePaymentLink(
      rdv.id,
      context.service,
      context.adresse_client,
      context.prix_service,
      context.frais_deplacement,
      context.total
    );

    // Mettre à jour le contexte
    updateConversationContext(clientPhone, {
      etape: 'paiement',
      rdv_id: rdv.id,
    });

    // Programmer le timeout d'annulation (30 min)
    const timeoutId = setTimeout(() => {
      cancelRdvForTimeout(rdv.id, clientPhone);
    }, PAYMENT_TIMEOUT_MINUTES * 60 * 1000);

    paymentTimeouts.set(rdv.id, {
      timeoutId,
      clientPhone,
      createdAt: new Date(),
    });

    logEvent('INFO', 'PAYMENT_TIMEOUT_SCHEDULED', 'Timeout paiement programmé', {
      rdvId: rdv.id,
      clientPhone,
      timeoutMinutes: PAYMENT_TIMEOUT_MINUTES,
      reminderMinutes: PAYMENT_REMINDER_MINUTES,
      expiresAt: new Date(Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000).toISOString(),
    });

    // Programmer un rappel à 15 min avant expiration
    setTimeout(() => {
      const timeoutInfo = paymentTimeouts.get(rdv.id);
      if (timeoutInfo) {
        sendPaymentReminder(rdv.id);
      }
    }, PAYMENT_REMINDER_MINUTES * 60 * 1000);

    return {
      success: true,
      response: `✅ RDV réservé !

💰 Total : ${context.total.toFixed(0)}€
Acompte min : 10€

👉 Payer : ${paymentUrl}

⏰ Lien valide 30 min`,
    };
  }

  // Réponse non reconnue
  return {
    success: true,
    response: `Dites "oui" pour confirmer ou "non" pour modifier`,
  };
}

/**
 * Étape 6 : Attente du paiement
 */
async function handleEtapePaiement(clientPhone, message, context) {
  const messageLower = message.toLowerCase().trim();

  // Vérifier si le client annule
  if (['annuler', 'stop', 'cancel'].some(mot => messageLower.includes(mot))) {
    if (context.rdv_id) {
      await cancelPendingRdv(context.rdv_id, 'Annulation par le client');
    }
    resetConversationContext(clientPhone);

    return {
      success: true,
      response: `Annulé ✅ "Bonjour" pour recommencer`,
    };
  }

  // Le client a peut-être des questions
  if (messageLower.includes('question') || messageLower.includes('?')) {
    return {
      success: true,
      response: `💳 CB/PayPal sécurisé
💰 Acompte 10€ min
📞 07 82 23 50 20`,
    };
  }

  // Rappeler le lien de paiement
  const paymentUrl = generatePaymentLink(
    context.rdv_id,
    context.service,
    context.adresse_client,
    context.prix_service,
    context.frais_deplacement,
    context.total
  );

  return {
    success: true,
    response: `En attente de paiement
👉 ${paymentUrl}
💰 ${context.total.toFixed(0)}€`,
  };
}

// ============= FONCTIONS UTILITAIRES CONVERSATION =============

/**
 * Détecte le service mentionné dans le message
 */
function detecterService(message) {
  const msg = message.toLowerCase();

  if (msg.includes('tresse') && (msg.includes('rajout') || msg.includes('extension'))) {
    return 'tresses_rajouts';
  }
  if (msg.includes('tresse') && msg.includes('collée')) {
    return 'tresses_collees';
  }
  if (msg.includes('tresse')) {
    return 'tresses_collees'; // Par défaut
  }
  if (msg.includes('vanille') || msg.includes('twist')) {
    return 'vanilles';
  }
  if (msg.includes('lock') && (msg.includes('création') || msg.includes('creer') || msg.includes('nouveau'))) {
    return 'locks_creation';
  }
  if (msg.includes('lock') && (msg.includes('entretien') || msg.includes('retwist'))) {
    return 'locks_entretien';
  }
  if (msg.includes('lock')) {
    return 'locks_entretien'; // Par défaut
  }
  if (msg.includes('soin') || msg.includes('hydrat')) {
    return 'soins';
  }
  if (msg.includes('brushing') || msg.includes('afro')) {
    return 'brushing';
  }
  if (msg.includes('enfant') || msg.includes('coupe')) {
    return 'coupe_enfant';
  }

  return null;
}

/**
 * Parse une date en langage naturel
 */
function parseDate(message) {
  const msg = message.toLowerCase().trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Demain
  if (msg.includes('demain')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { valid: true, date: formatDateISO(tomorrow) };
  }

  // Après-demain
  if (msg.includes('après-demain') || msg.includes('apres demain')) {
    const afterTomorrow = new Date(today);
    afterTomorrow.setDate(afterTomorrow.getDate() + 2);
    return { valid: true, date: formatDateISO(afterTomorrow) };
  }

  // Jours de la semaine
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  for (let i = 0; i < jours.length; i++) {
    if (msg.includes(jours[i])) {
      const targetDay = i;
      const currentDay = today.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7; // Prochain occurrence
      if (msg.includes('prochain')) daysUntil += 7;

      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return { valid: true, date: formatDateISO(targetDate) };
    }
  }

  // Format DD/MM/YYYY ou DD-MM-YYYY
  const dateRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/;
  const match = msg.match(dateRegex);
  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    const year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])) : today.getFullYear();
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      return { valid: true, date: formatDateISO(date) };
    }
  }

  // Format "25 janvier" ou "25 jan"
  const moisNoms = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const moisAbrev = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

  for (let i = 0; i < moisNoms.length; i++) {
    if (msg.includes(moisNoms[i]) || msg.includes(moisAbrev[i])) {
      const dayMatch = msg.match(/(\d{1,2})/);
      if (dayMatch) {
        const day = parseInt(dayMatch[1]);
        let year = today.getFullYear();
        const date = new Date(year, i, day);
        // Si la date est passée, prendre l'année prochaine
        if (date < today) {
          date.setFullYear(year + 1);
        }
        return { valid: true, date: formatDateISO(date) };
      }
    }
  }

  return { valid: false };
}

/**
 * Parse une heure
 */
function parseHeure(message) {
  const msg = message.toLowerCase().trim();

  // Format "9h", "14h30", "9h00"
  const heureRegex1 = /(\d{1,2})\s*h\s*(\d{0,2})?/i;
  const match1 = msg.match(heureRegex1);
  if (match1) {
    const h = parseInt(match1[1]);
    const m = match1[2] ? parseInt(match1[2]) : 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return { valid: true, heure: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
    }
  }

  // Format "09:00", "14:30"
  const heureRegex2 = /(\d{1,2}):(\d{2})/;
  const match2 = msg.match(heureRegex2);
  if (match2) {
    const h = parseInt(match2[1]);
    const m = parseInt(match2[2]);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      return { valid: true, heure: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
    }
  }

  return { valid: false };
}

/**
 * Calcule l'heure de fin d'un service
 */
function calculerHeureFin(heure, dureeMinutes) {
  const [h, m] = heure.split(':').map(Number);
  const totalMinutes = h * 60 + m + dureeMinutes;
  const heuresFin = Math.floor(totalMinutes / 60);
  const minutesFin = totalMinutes % 60;
  return `${String(heuresFin).padStart(2, '0')}:${String(minutesFin).padStart(2, '0')}`;
}

/**
 * Formate une durée en minutes vers "Xh" ou "XhYY"
 */
function formatDuree(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/**
 * Formate une date au format ISO (YYYY-MM-DD)
 */
function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formate une date en français
 */
function formatDateFr(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  return `${jours[date.getDay()]} ${date.getDate()} ${mois[date.getMonth()]}`;
}

// ============= MESSAGES WHATSAPP =============

/**
 * Envoie un message WhatsApp via Twilio
 */
async function sendWhatsAppMessage(to, message) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log('[WhatsApp] Mode simulation - Message:', message);
    return { success: true, simulated: true };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: TWILIO_WHATSAPP_NUMBER,
          To: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Erreur envoi WhatsApp');
    }

    const data = await response.json();
    console.log('[WhatsApp] Message envoyé:', data.sid);
    return { success: true, sid: data.sid };
  } catch (error) {
    console.error('[WhatsApp] Erreur envoi:', error);
    throw error;
  }
}

/**
 * Formate un numéro de téléphone au format WhatsApp
 * Accepte : 0782235020, +33782235020, 33782235020
 * Retourne : whatsapp:+33782235020
 * @param {string} phoneNumber - Numéro à formater
 * @returns {{ valid: boolean, formatted: string|null, error: string|null }}
 */
export function formatPhoneForWhatsApp(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return { valid: false, formatted: null, error: 'Numéro requis' };
  }

  // Nettoyer le numéro (espaces, tirets, points)
  let cleaned = phoneNumber.replace(/[\s\-\.()]/g, '');

  // Retirer le préfixe whatsapp: si présent
  if (cleaned.startsWith('whatsapp:')) {
    cleaned = cleaned.substring(9);
  }

  // Gestion des différents formats
  // Format 0782235020 -> +33782235020
  if (cleaned.match(/^0[67]\d{8}$/)) {
    cleaned = '+33' + cleaned.substring(1);
  }
  // Format 33782235020 -> +33782235020
  else if (cleaned.match(/^33[67]\d{8}$/)) {
    cleaned = '+' + cleaned;
  }
  // Format +33782235020 -> déjà bon
  else if (cleaned.match(/^\+33[67]\d{8}$/)) {
    // OK
  }
  // Format invalide
  else {
    return {
      valid: false,
      formatted: null,
      error: `Format invalide: ${phoneNumber}. Attendu: 06/07xxxxxxxx ou +33 6/7xxxxxxxx`,
    };
  }

  // Validation finale : doit être un numéro français mobile (06 ou 07)
  if (!cleaned.match(/^\+33[67]\d{8}$/)) {
    return {
      valid: false,
      formatted: null,
      error: 'Numéro mobile français requis (06 ou 07)',
    };
  }

  return {
    valid: true,
    formatted: `whatsapp:${cleaned}`,
    error: null,
  };
}

/**
 * Classifie les erreurs Twilio pour le monitoring
 * @param {number} statusCode - Code HTTP de la réponse
 * @param {Object} errorData - Données d'erreur Twilio
 * @returns {string} Type d'erreur pour le monitoring
 */
function classifyTwilioError(statusCode, errorData) {
  const errorCode = errorData?.code;

  // Codes d'erreur Twilio spécifiques
  // https://www.twilio.com/docs/api/errors
  switch (errorCode) {
    case 21211: // Invalid 'To' phone number
    case 21614: // 'To' number is not a valid mobile number
    case 21217: // Phone number is not verified
      return ERROR_TYPES.TWILIO_INVALID_NUMBER;

    case 63016: // WhatsApp: User is not a WhatsApp user
    case 63018: // WhatsApp: User has not opted-in
      return ERROR_TYPES.TWILIO_WHATSAPP_UNAVAILABLE;

    case 20429: // Too many requests
    case 14107: // Message rate limit exceeded
      return ERROR_TYPES.TWILIO_QUOTA_EXCEEDED;

    default:
      if (statusCode === 401 || statusCode === 403) {
        return ERROR_TYPES.TWILIO_NOT_CONFIGURED;
      }
      if (statusCode === 429) {
        return ERROR_TYPES.TWILIO_QUOTA_EXCEEDED;
      }
      return ERROR_TYPES.TWILIO_SEND_ERROR;
  }
}

/**
 * Envoie une notification WhatsApp via Twilio
 *
 * @param {string} phoneNumber - Numéro de téléphone (formats acceptés: 0782235020, +33782235020, 33782235020)
 * @param {string} message - Message à envoyer
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, errorType?: string }>}
 *
 * @example
 * const result = await sendWhatsAppNotification('0782235020', 'Votre RDV est confirmé !');
 * if (result.success) {
 *   console.log('Message envoyé:', result.messageId);
 * } else {
 *   console.error('Erreur:', result.error);
 * }
 */
export async function sendWhatsAppNotification(phoneNumber, message) {
  // 1. Vérifier la configuration Twilio
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    logEvent('WARN', ERROR_TYPES.TWILIO_NOT_CONFIGURED, 'Twilio non configuré - mode simulation', {
      phoneNumber: phoneNumber?.substring(0, 6) + '***',
      messageLength: message?.length,
    });

    return {
      success: true,
      messageId: 'SIMULATED_' + Date.now(),
      simulated: true,
    };
  }

  // 2. Formater et valider le numéro
  const phoneResult = formatPhoneForWhatsApp(phoneNumber);

  if (!phoneResult.valid) {
    logEvent('ERROR', ERROR_TYPES.PHONE_FORMAT_INVALID, 'Numéro de téléphone invalide', {
      phoneNumber: phoneNumber?.substring(0, 6) + '***',
      error: phoneResult.error,
    });

    return {
      success: false,
      error: phoneResult.error,
      errorType: ERROR_TYPES.PHONE_FORMAT_INVALID,
    };
  }

  // 3. Valider le message
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    logEvent('ERROR', ERROR_TYPES.TWILIO_SEND_ERROR, 'Message vide ou invalide', {
      phoneNumber: phoneResult.formatted,
    });

    return {
      success: false,
      error: 'Message requis',
      errorType: ERROR_TYPES.TWILIO_SEND_ERROR,
    };
  }

  // 4. Envoyer via Twilio
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: TWILIO_WHATSAPP_NUMBER,
          To: phoneResult.formatted,
          Body: message.trim(),
        }),
      }
    );

    const data = await response.json();

    // 5. Gérer les erreurs Twilio
    if (!response.ok) {
      const errorType = classifyTwilioError(response.status, data);
      const logLevel = errorType === ERROR_TYPES.TWILIO_QUOTA_EXCEEDED ? 'ERROR' : 'WARN';

      logEvent(logLevel, errorType, 'Erreur envoi WhatsApp', {
        phoneNumber: phoneResult.formatted,
        statusCode: response.status,
        twilioCode: data?.code,
        twilioMessage: data?.message,
        messageLength: message.length,
      });

      // Log critique pour quota dépassé
      if (errorType === ERROR_TYPES.TWILIO_QUOTA_EXCEEDED) {
        console.error('\x1b[41m[CRITICAL]\x1b[0m Quota Twilio dépassé !', {
          timestamp: new Date().toISOString(),
          code: data?.code,
        });
      }

      return {
        success: false,
        error: data?.message || 'Erreur Twilio',
        errorType: errorType,
        twilioCode: data?.code,
      };
    }

    // 6. Succès
    logEvent('INFO', 'WHATSAPP_SENT', 'Message WhatsApp envoyé', {
      phoneNumber: phoneResult.formatted,
      messageId: data.sid,
      messageLength: message.length,
    });

    return {
      success: true,
      messageId: data.sid,
    };

  } catch (error) {
    // Erreur réseau ou autre
    logEvent('ERROR', ERROR_TYPES.TWILIO_SEND_ERROR, 'Erreur réseau envoi WhatsApp', {
      phoneNumber: phoneResult.formatted,
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
      errorType: ERROR_TYPES.TWILIO_SEND_ERROR,
    };
  }
}

/**
 * Génère l'URL de paiement (ancienne version)
 */
function generatePaymentUrl(rdvId, service, duree, prix, adresse) {
  const params = new URLSearchParams({
    rdv_id: rdvId,
    service: service,
    duree: duree.toString(),
    prix: prix.toString(),
  });

  if (adresse) {
    params.append('adresse', adresse);
  }

  return `${FRONTEND_URL}/paiement?${params.toString()}`;
}

/**
 * Génère un lien de paiement complet avec tous les détails
 *
 * @param {string} rdv_id - ID du rendez-vous
 * @param {string} service - Nom du service
 * @param {string} adresse_client - Adresse complète du client
 * @param {number} prix_service - Prix du service en euros
 * @param {number} frais_depl - Frais de déplacement en euros
 * @param {number} total - Montant total en euros
 * @returns {string} URL complète de paiement
 *
 * @example
 * generatePaymentLink('rdv_123', 'Tresses africaines', '15 rue de Paris, 75001 Paris', 85, 12.50, 97.50)
 * // => https://fatshairafro.fr/payment?rdv_id=rdv_123&service=Tresses%20africaines&adresse=15%20rue%20de%20Paris%2C%2075001%20Paris&prix=85&frais=12.5&total=97.5
 */
export function generatePaymentLink(rdv_id, service, adresse_client, prix_service, frais_depl, total) {
  // Validation des paramètres requis
  if (!rdv_id) {
    throw new Error('rdv_id est requis');
  }
  if (!service) {
    throw new Error('service est requis');
  }

  // Construire les paramètres URL
  const params = new URLSearchParams();

  // Paramètres obligatoires
  params.append('rdv_id', rdv_id.toString());
  params.append('service', service);

  // Paramètres optionnels (avec valeurs par défaut)
  if (adresse_client) {
    params.append('adresse', adresse_client);
  }

  // Prix et frais (convertir en string avec 2 décimales si nécessaire)
  params.append('prix', (prix_service || 0).toString());
  params.append('frais', (frais_depl || 0).toString());
  params.append('total', (total || 0).toString());

  // Construire l'URL complète
  const baseUrl = FRONTEND_URL || 'https://fatshairafro.fr';
  const paymentUrl = `${baseUrl}/payment?${params.toString()}`;

  console.log(`[WhatsApp] Lien de paiement généré: ${paymentUrl}`);

  return paymentUrl;
}

// ============= FONCTIONS DB (TODO) =============

/**
 * Crée un RDV en DB via bookingService centralisé
 */
async function createRdvInDb(data) {
  console.log('[WhatsApp] Création RDV via bookingService:', JSON.stringify(data, null, 2));

  try {
    // Convertir la date au format jour (lundi, mardi, etc.) si c'est une date ISO
    let jour = data.date;
    if (data.date && data.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const dateObj = new Date(data.date);
      const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      jour = jours[dateObj.getDay()];
    }

    // Extraire l'heure au format simple (ex: "14" ou "14h")
    let heure = data.heure;
    if (heure && heure.includes(':')) {
      heure = heure.split(':')[0];
    }

    // Appeler createAppointment centralisé
    const result = await createAppointment({
      clientName: data.client_nom || null,
      clientPrenom: data.client_prenom || null,
      clientPhone: data.client_telephone,
      clientAddress: data.adresse_client || data.adresse_formatee,
      service: data.service_nom,
      jour: jour,
      heure: heure,
      source: 'whatsapp',
      notes: `WhatsApp - Paiement requis`
    });

    if (result.success) {
      console.log('[WhatsApp] ✅ RDV créé en DB:', result.rdv?.id);
      return {
        id: result.rdv.id,
        ...data,
        statut: result.rdv.statut || 'demande',
        created_at: result.rdv.created_at || new Date().toISOString(),
      };
    } else {
      console.error('[WhatsApp] ❌ Erreur création RDV:', result.error);
      // Fallback: retourner un ID temporaire pour ne pas bloquer le flux
      return {
        id: `temp_${Date.now()}`,
        ...data,
        statut: 'erreur',
        error: result.error,
        created_at: new Date().toISOString(),
      };
    }
  } catch (error) {
    console.error('[WhatsApp] Exception createRdvInDb:', error);
    return {
      id: `temp_${Date.now()}`,
      ...data,
      statut: 'erreur',
      error: error.message,
      created_at: new Date().toISOString(),
    };
  }
}

/**
 * Met à jour le statut d'un RDV
 */
async function updateRdvStatus(rdvId, statut, additionalData = {}) {
  console.log('[WhatsApp] Mise à jour RDV:', rdvId, statut, additionalData);

  const db = getSupabase();
  if (!db) {
    console.error('[WhatsApp] ❌ Supabase non configuré pour updateRdvStatus');
    return { id: rdvId, statut, ...additionalData };
  }

  try {
    // Ignorer les IDs temporaires
    if (String(rdvId).startsWith('temp_')) {
      console.log('[WhatsApp] ID temporaire, pas de mise à jour DB');
      return { id: rdvId, statut, ...additionalData };
    }

    const { data, error } = await db
      .from('reservations')
      .update({ statut, ...additionalData, updated_at: new Date().toISOString() })
      .eq('id', rdvId)
      .select()
      .single();

    if (error) {
      console.error('[WhatsApp] Erreur updateRdvStatus:', error);
      return { id: rdvId, statut, ...additionalData };
    }

    console.log('[WhatsApp] ✅ Statut RDV mis à jour:', data.id, statut);
    return data;
  } catch (error) {
    console.error('[WhatsApp] Exception updateRdvStatus:', error);
    return { id: rdvId, statut, ...additionalData };
  }
}

/**
 * Récupère un RDV par ID
 */
async function getRdvById(rdvId) {
  console.log('[WhatsApp] Récupération RDV:', rdvId);

  const db = getSupabase();
  if (!db) {
    console.error('[WhatsApp] ❌ Supabase non configuré pour getRdvById');
    return null;
  }

  try {
    // Ignorer les IDs temporaires
    if (String(rdvId).startsWith('temp_')) {
      console.log('[WhatsApp] ID temporaire, pas de recherche DB');
      return null;
    }

    const { data, error } = await db
      .from('reservations')
      .select('*')
      .eq('id', rdvId)
      .single();

    if (error) {
      console.error('[WhatsApp] Erreur getRdvById:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[WhatsApp] Exception getRdvById:', error);
    return null;
  }
}

// ============= FONCTIONS PRINCIPALES =============

/**
 * Annule un RDV pour timeout de paiement
 * Appelé automatiquement après 30 minutes sans paiement
 */
async function cancelRdvForTimeout(rdvId, clientPhone) {
  try {
    const timeoutInfo = paymentTimeouts.get(rdvId);
    const elapsedMinutes = timeoutInfo
      ? Math.round((Date.now() - timeoutInfo.createdAt.getTime()) / (1000 * 60))
      : PAYMENT_TIMEOUT_MINUTES;

    logEvent('WARN', ERROR_TYPES.PAYMENT_TIMEOUT, 'Timeout paiement - Annulation automatique', {
      rdvId,
      clientPhone,
      timeoutMinutes: PAYMENT_TIMEOUT_MINUTES,
      elapsedMinutes,
    });

    await updateRdvStatus(rdvId, 'annule', {
      annulation_raison: `Timeout paiement (${elapsedMinutes} min)`,
      annulation_date: new Date().toISOString(),
      annulation_type: 'auto_timeout',
    });

    const message = `⏰ Lien expiré
"Bonjour" pour recommencer`;

    await sendWhatsAppMessage(clientPhone, message);
    paymentTimeouts.delete(rdvId);

    // Réinitialiser le contexte pour permettre une nouvelle réservation
    updateConversationContext(clientPhone, {
      etape: 'accueil',
      rdv_id: null,
    });

    logEvent('INFO', 'RDV_CANCELLED_TIMEOUT', 'RDV annulé pour timeout paiement', {
      rdvId,
      clientPhone,
    });

  } catch (error) {
    logEvent('ERROR', ERROR_TYPES.UNKNOWN_ERROR, 'Erreur annulation timeout', {
      rdvId,
      clientPhone,
      error: error.message,
      stack: error.stack?.substring(0, 500),
    });
  }
}

/**
 * Traite la confirmation d'un créneau par le client
 * Crée le RDV et envoie le lien de paiement
 */
export async function handleCreneauConfirmation({
  clientPhone,
  clientNom,
  clientPrenom,
  date,
  heure,
  service,
  dureeMinutes,
  prixService,
  adresseClient,
  fraisDeplacement,
}) {
  try {
    console.log('[WhatsApp] Confirmation créneau reçue:', {
      client: `${clientPrenom} ${clientNom}`,
      date,
      heure,
      service,
      adresse: adresseClient,
    });

    // 1. Créer le RDV en DB
    const rdv = await createRdvInDb({
      client_telephone: clientPhone,
      client_nom: clientNom,
      client_prenom: clientPrenom,
      date,
      heure,
      service_nom: service,
      duree_minutes: dureeMinutes,
      prix_service: prixService,
      adresse_client: adresseClient,
      frais_deplacement: fraisDeplacement || 0,
      statut: 'en_attente_paiement',
    });

    // 2. Générer l'URL de paiement
    const prixTotal = prixService + (fraisDeplacement || 0);
    const paymentUrl = generatePaymentUrl(rdv.id, service, dureeMinutes, prixTotal, adresseClient);

    // 3. Composer le message WhatsApp
    const message = `✅ RDV réservé !
📅 ${formatDate(date)} ${heure}
💰 ${prixTotal.toFixed(0)}€

👉 ${paymentUrl}
⏰ 30 min pour payer`;

    // 4. Envoyer le message
    await sendWhatsAppMessage(clientPhone, message);

    // 5. Programmer le timeout
    const timeoutId = setTimeout(() => {
      cancelRdvForTimeout(rdv.id, clientPhone);
    }, PAYMENT_TIMEOUT_MINUTES * 60 * 1000);

    paymentTimeouts.set(rdv.id, {
      timeoutId,
      clientPhone,
      createdAt: new Date(),
    });

    console.log(`[WhatsApp] Lien de paiement envoyé pour RDV ${rdv.id}`);

    return {
      success: true,
      rdv_id: rdv.id,
      payment_url: paymentUrl,
      expires_at: new Date(Date.now() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000).toISOString(),
    };

  } catch (error) {
    console.error('[WhatsApp] Erreur handleCreneauConfirmation:', error);
    throw error;
  }
}

/**
 * Appelée quand un paiement est confirmé
 */
export async function handlePaymentConfirmed(rdvId) {
  try {
    console.log(`[WhatsApp] Paiement confirmé pour RDV ${rdvId}`);

    // 1. Annuler le timeout
    const timeoutInfo = paymentTimeouts.get(rdvId);
    if (timeoutInfo) {
      clearTimeout(timeoutInfo.timeoutId);
      paymentTimeouts.delete(rdvId);
    }

    // 2. Récupérer les infos du RDV
    const rdv = await getRdvById(rdvId);

    // 3. Mettre à jour le statut
    await updateRdvStatus(rdvId, 'confirme', {
      paiement_date: new Date().toISOString(),
    });

    // 4. Envoyer confirmation
    const clientPhone = rdv?.client_telephone || timeoutInfo?.clientPhone;

    if (clientPhone) {
      const message = `🎉 RDV confirmé !
📅 ${rdv?.date ? formatDate(rdv.date) : ''} ${rdv?.heure || ''}
À bientôt ! 💖`;

      await sendWhatsAppMessage(clientPhone, message);

      // Réinitialiser le contexte de conversation
      resetConversationContext(clientPhone);
    }

    return { success: true };

  } catch (error) {
    console.error('[WhatsApp] Erreur handlePaymentConfirmed:', error);
    throw error;
  }
}

/**
 * Envoie un rappel de paiement (à 15 min avant expiration)
 */
export async function sendPaymentReminder(rdvId) {
  try {
    const timeoutInfo = paymentTimeouts.get(rdvId);
    if (!timeoutInfo) {
      logEvent('WARN', 'REMINDER_SKIP', 'Rappel ignoré - RDV déjà traité', { rdvId });
      return;
    }

    const elapsedMinutes = Math.round((Date.now() - timeoutInfo.createdAt.getTime()) / (1000 * 60));
    const remainingMinutes = PAYMENT_TIMEOUT_MINUTES - elapsedMinutes;

    logEvent('INFO', 'PAYMENT_REMINDER_SENT', 'Rappel de paiement envoyé', {
      rdvId,
      clientPhone: timeoutInfo.clientPhone,
      elapsedMinutes,
      remainingMinutes,
    });

    const message = `⏰ Plus que ${remainingMinutes} min pour payer !`;

    await sendWhatsAppMessage(timeoutInfo.clientPhone, message);

  } catch (error) {
    logEvent('ERROR', ERROR_TYPES.TWILIO_SEND_ERROR, 'Erreur envoi rappel paiement', {
      rdvId,
      error: error.message,
    });
  }
}

/**
 * Annule manuellement un RDV en attente
 */
export async function cancelPendingRdv(rdvId, raison, clientPhone = null) {
  try {
    const timeoutInfo = paymentTimeouts.get(rdvId);
    if (timeoutInfo) {
      clearTimeout(timeoutInfo.timeoutId);
      paymentTimeouts.delete(rdvId);
      clientPhone = clientPhone || timeoutInfo.clientPhone;
    }

    await updateRdvStatus(rdvId, 'annule', {
      annulation_raison: raison || 'Annulation manuelle',
      annulation_date: new Date().toISOString(),
      annulation_type: 'manual',
    });

    logEvent('INFO', 'RDV_CANCELLED_MANUAL', 'RDV annulé manuellement', {
      rdvId,
      raison,
      clientPhone,
    });

    // Réinitialiser le contexte client si disponible
    if (clientPhone) {
      updateConversationContext(clientPhone, {
        etape: 'accueil',
        rdv_id: null,
      });
    }

    return { success: true };

  } catch (error) {
    logEvent('ERROR', ERROR_TYPES.UNKNOWN_ERROR, 'Erreur annulation manuelle', {
      rdvId,
      raison,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Récupère les RDV en attente de paiement
 */
export function getPendingPayments() {
  const pending = [];

  for (const [rdvId, info] of paymentTimeouts.entries()) {
    const elapsedMinutes = (Date.now() - info.createdAt.getTime()) / (1000 * 60);
    const remainingMinutes = Math.max(0, PAYMENT_TIMEOUT_MINUTES - elapsedMinutes);

    pending.push({
      rdv_id: rdvId,
      client_phone: info.clientPhone,
      created_at: info.createdAt.toISOString(),
      remaining_minutes: Math.round(remainingMinutes),
      expires_at: new Date(info.createdAt.getTime() + PAYMENT_TIMEOUT_MINUTES * 60 * 1000).toISOString(),
    });
  }

  return pending;
}

/**
 * Nettoie les timeouts expirés
 */
export function cleanupExpiredTimeouts() {
  console.log('[WhatsApp] Nettoyage des timeouts expirés...');
  paymentTimeouts.clear();
}

// ============= HELPERS =============

/**
 * Formate une date en français
 */
function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  return `${jours[date.getDay()]} ${date.getDate()} ${mois[date.getMonth()]} ${date.getFullYear()}`;
}

// ============= TEMPLATES DE MESSAGES =============

export const MESSAGE_TEMPLATES = {
  ACCUEIL: `Bonjour ! ✨ Je suis Halimah, l'assistante de Fatou.

Comment puis-je vous aider ?`,

  DEMANDE_ADRESSE: (service) => `Parfait pour ${service} ! ✨

Fatou se déplace directement chez vous. Pourriez-vous me donner votre adresse complète pour que je calcule les frais de déplacement ?

Format : numéro, rue, code postal, ville 📍`,

  RECAP_FRAIS: (service, prixService, distanceKm, fraisDeplacement, total) => `Merci ! J'ai trouvé votre adresse à ${distanceKm.toFixed(1)} km de notre point de départ.

Voici le récapitulatif :
💇 ${service} : ${prixService.toFixed(2)}€
🚗 Déplacement (${distanceKm.toFixed(1)} km) : ${fraisDeplacement.toFixed(2)}€

💰 TOTAL : ${total.toFixed(2)}€

Quelle date vous conviendrait ? 📅`,

  CRENEAUX_DISPONIBLES: (date, creneaux) => `Voici les créneaux disponibles pour le ${formatDate(date)} :

${creneaux.map(c => `⏰ ${c.heure} (fin prévue vers ${c.heure_fin})`).join('\n')}

Lequel préférez-vous ?`,

  AUCUN_CRENEAU: (date) => `Malheureusement, il n'y a plus de créneaux disponibles pour le ${formatDate(date)}.

Souhaitez-vous une autre date ? 📅`,

  ADRESSE_INVALIDE: `Je n'ai pas pu trouver cette adresse. 📍

Pourriez-vous me la reformuler avec :
• Le numéro de rue
• Le nom de la rue
• Le code postal
• La ville

Exemple : 15 rue de la Paix, 75002 Paris`,

  ZONE_TROP_LOIN: (distanceKm) => `Je suis désolée, cette adresse se trouve à ${distanceKm.toFixed(0)} km, ce qui est en dehors de notre zone de déplacement habituelle (Île-de-France).

Souhaitez-vous que je vérifie si un déplacement exceptionnel est possible ? Je peux demander à Fatou. 🤔`,

  PAYMENT_CONFIRMED: (date, heure, service, adresse) => `🎉 Votre RDV est confirmé !

📅 ${formatDate(date)} à ${heure}
💇 ${service}
📍 ${adresse}

Fatou viendra directement chez vous ! 🏠

À très bientôt,
Fat's Hair-Afro 💖
📞 07 82 23 50 20`,

  PAYMENT_TIMEOUT: `⏰ Votre demande de RDV a expiré.

Le délai de 30 minutes pour effectuer le paiement est dépassé.

Si vous souhaitez toujours prendre rendez-vous, n'hésitez pas à nous recontacter ! 😊

Fat's Hair-Afro
📞 07 82 23 50 20`,

  PAYMENT_REMINDER: `⏰ Rappel : votre lien de paiement expire dans 15 minutes !

N'oubliez pas de finaliser votre réservation pour confirmer votre RDV.

Si vous avez des questions, appelez-nous au 07 82 23 50 20 📞`,
};

// ============= EXPORT =============

export default {
  // Prompt et outils IA
  HALIMAH_SYSTEM_PROMPT,
  HALIMAH_TOOLS,
  executeHalimahTool,
  // Contexte de conversation
  getConversationContext,
  updateConversationContext,
  resetConversationContext,
  // Traitement des messages entrants
  handleIncomingMessage,
  handleIncomingMessageNexus, // NOUVEAU - utilise nexusCore
  // Fonctions principales
  handleCreneauConfirmation,
  handlePaymentConfirmed,
  sendPaymentReminder,
  cancelPendingRdv,
  getPendingPayments,
  cleanupExpiredTimeouts,
  sendWhatsAppMessage,
  // Notifications WhatsApp
  sendWhatsAppNotification,
  formatPhoneForWhatsApp,
  // Paiement
  generatePaymentLink,
  // Templates
  MESSAGE_TEMPLATES,
  // Config
  ADRESSE_DEPART,
  ERROR_TYPES,
};
