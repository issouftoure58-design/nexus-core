/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║                                                                   ║
 * ║   🔒 NEXUS CORE UNIFIÉ - SERVICE CENTRAL                          ║
 * ║                                                                   ║
 * ║   TOUS les canaux DOIVENT passer par ce service.                 ║
 * ║   C'est la SEULE source de vérité.                               ║
 * ║                                                                   ║
 * ║   Canaux supportés:                                               ║
 * ║   - whatsapp : Messages WhatsApp                                  ║
 * ║   - web      : Chat web public                                    ║
 * ║   - phone    : Appels téléphoniques (Twilio Voice)               ║
 * ║   - sms      : SMS (Twilio)                                       ║
 * ║   - admin    : Halimah Pro (Dashboard admin)                     ║
 * ║                                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// 🔒 IMPORT DE LA SOURCE UNIQUE DE VÉRITÉ
import {
  SERVICES,
  TRAVEL_FEES,
  BUSINESS_HOURS,
  BOOKING_RULES,
  SERVICE_OPTIONS,
  AMBIGUOUS_TERMS,
  BLOCKING_STATUTS,  // 🔒 C3: Statuts bloquants unifiés
  validateBooking,
  findServiceByName,
  checkAmbiguousTerm,
  getServicesByCategory,
  getAllServices,
} from '../../config/businessRules.js';

import {
  validateBeforeCreate,
  calculateTotalPrice,
  getAvailableSlots,
  getConsecutiveBusinessDays,
} from '../../services/bookingValidator.js';

// 📱 SMS de confirmation (mock en dev via MOCK_SMS=true)
import { sendConfirmationSMS as _realSendSMS } from '../../services/bookingService.js';

async function sendConfirmationSMS(phone, details) {
  if (process.env.MOCK_SMS === 'true' || (process.env.NODE_ENV !== 'production' && !process.env.TWILIO_ACCOUNT_SID)) {
    const { envoyerConfirmation } = await import('../../services/notificationService.mock.js');
    return envoyerConfirmation({
      client_telephone: phone,
      service_nom: details.service,
      date: details.date,
      heure: details.heure,
      prix_total: (details.prixTotal || 0) * 100,
    });
  }
  return _realSendSMS(phone, details);
}

// 🔧 TOOLS REGISTRY - Source unique des outils
import { TOOLS_CLIENT } from '../../tools/toolsRegistry.js';

// 🏢 MULTI-TENANT - Loader de configuration par tenant
import { getTenantConfig, identifyTenant } from '../../config/tenants/index.js';

// 📊 SENTINEL - Suivi des coûts par tenant
import { trackTenantCall } from '../../sentinel/monitors/tenantCostTracker.js';

// 📍 Calcul de distance - import statique
import * as googleMapsService from '../../services/googleMapsService.js';
const getDistanceFromSalon = googleMapsService.getDistanceFromSalon || null;

// 💰 OPTIMISATION COÛTS - Réduction 88%
import modelRouter from '../../services/modelRouter.js';
import promptOptimizer from '../../services/promptOptimizer.js';
import responseCache from '../../services/responseCache.js';

// 🫀 NEXUS PULSE - Événements temps réel
import liveEventStream from '../../services/liveEventStream.js';

// ============================================
// CONFIGURATION
// ============================================

// Modèles adaptatifs
const CLAUDE_HAIKU = 'claude-3-haiku-20240307';    // Rapide (~1-2s) - messages simples
const CLAUDE_SONNET = 'claude-sonnet-4-20250514';  // Intelligent (~4-5s) - cas complexes
const MAX_TOKENS = 1024;

// ============================================
// SÉLECTION ADAPTATIVE DU MODÈLE
// ============================================

/**
 * Sélectionne le modèle approprié selon le message et le contexte
 * @param {string} message - Message de l'utilisateur
 * @param {Array} history - Historique de la conversation
 * @returns {{ model: string, reason: string }}
 */
function selectModel(message, history = []) {
  const msgLower = message.toLowerCase().trim();

  // === PATTERNS HAIKU (messages simples) ===

  // Salutations
  const greetings = /^(salut|bonjour|bonsoir|coucou|hello|hey|hi|bsr|bjr)[\s!.,?]*$/i;
  if (greetings.test(msgLower)) {
    return { model: CLAUDE_HAIKU, reason: 'salutation' };
  }

  // Remerciements / Au revoir
  const thanks = /^(merci|thanks|au revoir|bye|à bientôt|a bientot|ciao|bonne journée|bonne soirée)[\s!.,?]*$/i;
  if (thanks.test(msgLower)) {
    return { model: CLAUDE_HAIKU, reason: 'remerciement/au revoir' };
  }

  // Réponses courtes (oui, non, ok, d'accord...)
  const shortResponses = /^(oui|non|ok|okay|d'accord|daccord|parfait|super|cool|bien|génial|entendu|compris|c'est bon|ca marche|ça marche)[\s!.,?]*$/i;
  if (shortResponses.test(msgLower)) {
    return { model: CLAUDE_HAIKU, reason: 'réponse courte' };
  }

  // Questions simples sur les horaires
  const hoursQuestions = /\b(horaire|heure|ouvert|fermé|ouvre|ferme|disponible quand|quand.*ouvert)\b/i;
  if (hoursQuestions.test(msgLower) && !msgLower.includes('réserv') && !msgLower.includes('rdv')) {
    return { model: CLAUDE_HAIKU, reason: 'question horaires' };
  }

  // Questions simples sur l'adresse/lieu
  const locationQuestions = /^.{0,50}\b(où|adresse|lieu|situé|localisation|comment venir|aller chez)\b.{0,50}$/i;
  if (locationQuestions.test(msgLower) && msgLower.length < 80) {
    return { model: CLAUDE_HAIKU, reason: 'question adresse' };
  }

  // Questions sur les services/tarifs (déjà dans le prompt)
  const priceQuestions = /^.{0,30}\b(prix|tarif|coût|combien|services?|proposez|faites)\b.{0,50}$/i;
  if (priceQuestions.test(msgLower) && msgLower.length < 100) {
    // Sauf si c'est une demande de réservation
    if (!msgLower.includes('réserv') && !msgLower.includes('rdv') && !msgLower.includes('rendez')) {
      return { model: CLAUDE_HAIKU, reason: 'question prix/services' };
    }
  }

  // === PATTERNS SONNET (cas complexes) ===

  // Réservations explicites
  const bookingPatterns = /\b(réserv|rdv|rendez-vous|prendre|book|disponib|créneaux?|samedi|dimanche|lundi|mardi|mercredi|jeudi|vendredi|demain|après-demain)\b/i;
  if (bookingPatterns.test(msgLower)) {
    return { model: CLAUDE_SONNET, reason: 'réservation/disponibilité' };
  }

  // Calculs (déplacement, prix total)
  const calculPatterns = /\b(déplacement|domicile|chez moi|venir chez|distance|km|kilomètre|frais|total)\b/i;
  if (calculPatterns.test(msgLower)) {
    return { model: CLAUDE_SONNET, reason: 'calcul déplacement/prix' };
  }

  // Contexte de conversation avancée (historique > 4 messages)
  if (history.length > 4) {
    // Vérifier si on est dans un flow de réservation
    const recentMessages = history.slice(-4).map(m =>
      typeof m.content === 'string' ? m.content : ''
    ).join(' ').toLowerCase();

    if (recentMessages.includes('réserv') || recentMessages.includes('rdv') ||
        recentMessages.includes('disponib') || recentMessages.includes('créneau')) {
      return { model: CLAUDE_SONNET, reason: 'contexte réservation' };
    }
  }

  // Messages longs (probablement complexes)
  if (message.length > 150) {
    return { model: CLAUDE_SONNET, reason: 'message long/complexe' };
  }

  // Par défaut : Haiku pour les messages courts, Sonnet sinon
  if (message.length < 50) {
    return { model: CLAUDE_HAIKU, reason: 'message court (défaut)' };
  }

  return { model: CLAUDE_SONNET, reason: 'défaut' };
}

// 🔒 C5: Cache sécurisé - TTL réduit pour éviter les race conditions
// ⚠️ TODO: Remplacer par Redis en production pour invalidation synchrone
const cache = new Map();
const CACHE_TTL_MS = 30 * 1000; // 🔒 Réduit de 5min à 30sec pour MVP
const CACHE_VERSION = { value: 0 }; // Incrémenté à chaque modification

// Incrémenter la version du cache (invalide toutes les entrées de disponibilité)
function bumpCacheVersion() {
  CACHE_VERSION.value++;
  console.log(`[CACHE] Version bumped to ${CACHE_VERSION.value}`);
}

// Supabase client singleton
let supabaseClient = null;
function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
  }
  return supabaseClient;
}

// Anthropic client singleton
let anthropicClient = null;
function getAnthropic() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropicClient;
}

// ============================================
// INFORMATIONS SALON (seul endroit non-verrouillé)
// ============================================

export const SALON_INFO = Object.freeze({
  nom: "Fat's Hair-Afro",
  concept: "Coiffure afro à domicile ou chez Fatou",
  gerante: "Fatou",
  adresse: "8 rue des Monts Rouges, 95130 Franconville",
  telephone: "07 82 23 50 20",
  telephoneTwilio: "09 39 24 02 69",
  peutRecevoirChezElle: true
});

// ============================================
// CACHE HELPER FUNCTIONS
// ============================================

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  // 🔒 C5: Vérifier expiration ET version
  if (Date.now() > item.expiresAt || item.version !== CACHE_VERSION.value) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlMs = CACHE_TTL_MS) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
    version: CACHE_VERSION.value  // 🔒 Associer à la version courante
  });
}

function invalidateCache(pattern) {
  // 🔒 C5: Invalidation par pattern + bump de version
  let deleted = 0;
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
      deleted++;
    }
  }
  if (deleted > 0) {
    bumpCacheVersion(); // Invalider globalement aussi
  }
}

// ============================================
// OUTILS IA - Importés depuis toolsRegistry.js
// ============================================
// Note: TOOLS_CLIENT est importé depuis '../../tools/toolsRegistry.js'

// ============================================
// IMPLÉMENTATION DES OUTILS
// ============================================

async function executeTool(toolName, toolInput, channel) {
  const startTime = Date.now();
  console.log(`[NEXUS CORE] 🔧 ${channel} → ${toolName}`, JSON.stringify(toolInput).substring(0, 100));

  try {
    let result;

    switch (toolName) {
      case 'parse_date':
        result = parseDate(toolInput.date_text, toolInput.heure);
        break;

      case 'get_services':
        result = getServicesFormatted(toolInput.categorie);
        break;

      case 'get_price':
        result = getPriceForService(toolInput.service_name);
        break;

      case 'check_availability':
        result = await checkAvailabilityUnified(toolInput.date, toolInput.heure, toolInput.service_name);
        break;

      case 'get_available_slots':
        result = await getAvailableSlotsUnified(toolInput.date, toolInput.service_name);
        break;

      case 'calculate_travel_fee':
        // Bloquer si domicile désactivé
        if (!SERVICE_OPTIONS.DOMICILE_ENABLED) {
          result = {
            success: false,
            error: SERVICE_OPTIONS.DOMICILE_DISABLED_MESSAGE,
            domicile_disabled: true
          };
        } else {
          result = calculateTravelFeeUnified(toolInput.distance_km);
        }
        break;

      case 'create_booking':
        result = await createBookingUnified(toolInput, channel);
        break;

      case 'find_appointment':
        result = await findAppointmentByPhone(toolInput.telephone);
        break;

      case 'cancel_appointment':
        result = await cancelAppointmentById(toolInput.appointment_id, toolInput.reason);
        break;

      case 'get_salon_info':
        result = getSalonInfoUnified();
        break;

      case 'get_business_hours':
        result = getBusinessHoursUnified(toolInput.jour);
        break;

      case 'get_upcoming_days':
        result = await getUpcomingDays(toolInput.nb_jours);
        break;

      default:
        result = { success: false, error: `Outil inconnu: ${toolName}` };
    }

    const duration = Date.now() - startTime;
    console.log(`[NEXUS CORE] ✓ ${toolName} (${duration}ms)`);

    return result;

  } catch (error) {
    console.error(`[NEXUS CORE] ✗ ${toolName} erreur:`, error.message);
    return { success: false, error: error.message };
  }
}

// --- GET UPCOMING DAYS ---
// IMPORTANT: Cette fonction retourne les dates EXACTES pour éviter les erreurs de calcul de l'IA
async function getUpcomingDays(nbJours = 14) {
  const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  // Limiter à 60 jours max
  const limit = Math.min(Math.max(nbJours || 14, 1), 60);

  const now = new Date();
  now.setHours(12, 0, 0, 0); // Midi pour éviter les problèmes de timezone

  const today = now.toISOString().split('T')[0];
  const jourActuel = JOURS_FR[now.getDay()];
  const dateActuelleFormatee = `${jourActuel} ${now.getDate()} ${MOIS_FR[now.getMonth()]} ${now.getFullYear()}`;

  // Calculer la date de fin pour la requête
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + limit);
  const endDateISO = endDate.toISOString().split('T')[0];

  // 🔧 Récupérer toutes les réservations de la période en une seule requête
  let allReservations = [];
  const db = getSupabase();
  if (db) {
    const { data } = await db
      .from('reservations')
      .select('date, heure, duree_minutes, statut')
      .gte('date', today)
      .lte('date', endDateISO)
      .in('statut', BLOCKING_STATUTS);
    allReservations = data || [];
  }

  // Indexer les réservations par date
  const resByDate = {};
  for (const r of allReservations) {
    if (!resByDate[r.date]) resByDate[r.date] = [];
    resByDate[r.date].push(r);
  }

  const jours = [];

  for (let i = 0; i < limit; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    date.setHours(12, 0, 0, 0); // Garder midi pour éviter décalage

    const dateISO = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();
    const jourNom = JOURS_FR[dayOfWeek];
    const jourNum = date.getDate();
    const moisNom = MOIS_FR[date.getMonth()];

    // Récupérer les horaires depuis BUSINESS_HOURS
    const hours = BUSINESS_HOURS.getHours(dayOfWeek);
    const estOuvert = hours !== null;

    const jour = {
      date: dateISO,
      jour: jourNom,
      jourNum: jourNum,
      mois: moisNom,
      dateFormatee: `${jourNom} ${jourNum} ${moisNom}`,
      ouvert: estOuvert,
      horaires: estOuvert ? `${hours.open} - ${hours.close}` : 'Fermé (Fatou ne travaille pas)',
      heureOuverture: estOuvert ? hours.open : null,
      heureFermeture: estOuvert ? hours.close : null
    };

    // 🔧 Calculer l'occupation pour les jours ouverts
    if (estOuvert) {
      jour.occupation = calculateOccupation(hours, resByDate[dateISO] || []);
    }

    jours.push(jour);
  }

  return {
    success: true,
    aujourd_hui: today,
    jour_actuel: jourActuel,
    date_actuelle_formatee: dateActuelleFormatee,
    nb_jours: limit,
    jours: jours,
    instruction: "Utilise ces dates EXACTES. Ne calcule JAMAIS les dates toi-même. Utilise occupation.resume pour informer le client sur l'état de chaque jour."
  };
}

// 🔧 Calcul d'occupation d'une journée
function calculateOccupation(hours, reservations) {
  const toMin = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const toHHMM = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h${m > 0 ? (m < 10 ? '0' + m : m) : '00'}`;
  };

  const openMin = toMin(hours.open);
  const closeMin = toMin(hours.close);
  const totalMinutes = closeMin - openMin;

  if (reservations.length === 0) {
    return {
      statut: 'libre',
      pourcentage: 0,
      minutesLibres: totalMinutes,
      plagesLibres: [`${toHHMM(openMin)}-${toHHMM(closeMin)}`],
      resume: `Libre toute la journée (${hours.open} - ${hours.close}).`
    };
  }

  // Construire les plages occupées (clampées aux horaires d'ouverture)
  const occupied = reservations.map(r => {
    const start = toMin(r.heure);
    const end = start + (r.duree_minutes || 60);
    return { start: Math.max(start, openMin), end: Math.min(end, closeMin) };
  }).filter(r => r.start < r.end).sort((a, b) => a.start - b.start);

  // Fusionner les plages qui se chevauchent
  const merged = [];
  for (const slot of occupied) {
    if (merged.length > 0 && slot.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, slot.end);
    } else {
      merged.push({ ...slot });
    }
  }

  // Calculer minutes occupées
  const minutesOccupees = merged.reduce((sum, s) => sum + (s.end - s.start), 0);
  const minutesLibres = totalMinutes - minutesOccupees;
  const pourcentage = Math.round((minutesOccupees / totalMinutes) * 100);

  // Identifier les plages libres
  const plagesLibres = [];
  let cursor = openMin;
  for (const slot of merged) {
    if (cursor < slot.start) {
      plagesLibres.push(`${toHHMM(cursor)}-${toHHMM(slot.start)}`);
    }
    cursor = Math.max(cursor, slot.end);
  }
  if (cursor < closeMin) {
    plagesLibres.push(`${toHHMM(cursor)}-${toHHMM(closeMin)}`);
  }

  // Vérifier s'il existe au moins un créneau d'1h libre
  const hasOneHourSlot = plagesLibres.some(p => {
    const [startStr, endStr] = p.split('-');
    const s = toMin(startStr.replace('h', ':').replace(/(\d+):(\d+)/, '$1:$2'));
    const e = toMin(endStr.replace('h', ':').replace(/(\d+):(\d+)/, '$1:$2'));
    return (e - s) >= 60;
  });

  // Déterminer le statut
  let statut;
  if (pourcentage > 95 || !hasOneHourSlot) {
    statut = 'complet';
  } else if (pourcentage >= 70) {
    statut = 'presque_complet';
  } else if (pourcentage >= 20) {
    statut = 'partiel';
  } else {
    statut = 'libre';
  }

  // Résumé en français
  let resume;
  if (statut === 'complet') {
    resume = 'Complet. Aucun créneau disponible.';
  } else if (statut === 'presque_complet') {
    resume = `Presque complet. Créneaux libres : ${plagesLibres.join(' et ')}.`;
  } else if (statut === 'partiel') {
    resume = `Partiellement occupé. Créneaux libres : ${plagesLibres.join(', ')}.`;
  } else {
    resume = `Libre toute la journée (${hours.open} - ${hours.close}).`;
  }

  return { statut, pourcentage, minutesLibres, plagesLibres, resume };
}

// --- PARSE DATE ---
function parseDate(dateText, heure) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);

  let targetDate = null;
  const text = dateText.toLowerCase().trim();

  const joursMap = {
    'dimanche': 0, 'lundi': 1, 'mardi': 2, 'mercredi': 3,
    'jeudi': 4, 'vendredi': 5, 'samedi': 6
  };

  // Cas simples
  if (text === 'demain') {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (text.includes('après-demain') || text.includes('apres-demain')) {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 2);
  } else if (text === "aujourd'hui" || text === 'aujourdhui') {
    targetDate = new Date(now);
  } else {
    // Chercher un jour de la semaine
    for (const [jour, index] of Object.entries(joursMap)) {
      if (text.includes(jour)) {
        targetDate = new Date(now);
        const currentDay = now.getDay();
        let daysToAdd = index - currentDay;
        if (daysToAdd <= 0) daysToAdd += 7;
        targetDate.setDate(targetDate.getDate() + daysToAdd);
        break;
      }
    }

    // Format "25 janvier" ou "25/01"
    if (!targetDate) {
      const moisMap = {
        'janvier': 0, 'février': 1, 'fevrier': 1, 'mars': 2, 'avril': 3,
        'mai': 4, 'juin': 5, 'juillet': 6, 'août': 7, 'aout': 7,
        'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11, 'decembre': 11
      };

      for (const [moisNom, moisIndex] of Object.entries(moisMap)) {
        const regex = new RegExp(`(\\d{1,2})\\s*${moisNom}`);
        const match = text.match(regex);
        if (match) {
          targetDate = new Date(now.getFullYear(), moisIndex, parseInt(match[1]));
          if (targetDate < now) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
          break;
        }
      }

      // Format "25/01"
      if (!targetDate) {
        const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})/);
        if (slashMatch) {
          targetDate = new Date(now.getFullYear(), parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
          if (targetDate < now) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
        }
      }
    }
  }

  if (!targetDate) {
    return { success: false, error: `Date non reconnue: "${dateText}"` };
  }

  const dateStr = targetDate.toISOString().split('T')[0];
  const jourSemaine = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][targetDate.getDay()];

  return {
    success: true,
    date: dateStr,
    jour: jourSemaine,
    jour_numero: targetDate.getDate(),
    mois: targetDate.getMonth() + 1,
    heure: heure || null,
    dateFormatee: `${jourSemaine} ${targetDate.getDate()}/${targetDate.getMonth() + 1}/${targetDate.getFullYear()}`
  };
}

// --- GET SERVICES ---
function getServicesFormatted(categorie = 'all') {
  const allServices = getAllServices();
  const filtered = categorie === 'all'
    ? allServices
    : allServices.filter(s => s.category === categorie);

  const formatted = filtered.map(s => ({
    id: s.id,
    nom: s.name,
    prix: s.priceIsMinimum ? `À partir de ${s.price}€` : `${s.price}€`,
    prixExact: s.price,
    duree: s.durationMinutes >= 60
      ? `${Math.floor(s.durationMinutes / 60)}h${s.durationMinutes % 60 > 0 ? s.durationMinutes % 60 : ''}`
      : `${s.durationMinutes}min`,
    dureeMinutes: s.durationMinutes,
    categorie: s.category,
    bloqueJournee: s.blocksFullDay || false,
    joursNecessaires: s.blocksDays || 1
  }));

  return { success: true, services: formatted, count: formatted.length };
}

// --- GET PRICE ---
function getPriceForService(serviceName) {
  const service = findServiceByName(serviceName);
  if (!service) {
    return { success: false, error: `Service non trouvé: "${serviceName}"` };
  }

  return {
    success: true,
    service: service.name,
    prix: service.price,
    prixTexte: service.priceIsMinimum ? `À partir de ${service.price}€` : `${service.price}€`,
    dureeMinutes: service.durationMinutes,
    bloqueJournee: service.blocksFullDay || false
  };
}

// --- CHECK AVAILABILITY ---
async function checkAvailabilityUnified(date, heure, serviceName) {
  // Vérifier cache
  const cacheKey = `availability_${date}_${heure}_${serviceName}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const service = findServiceByName(serviceName);
  if (!service) {
    return { success: false, error: `Service non trouvé: "${serviceName}"` };
  }

  // Vérifier ambiguïté
  const ambiguity = checkAmbiguousTerm(serviceName);
  if (ambiguity) {
    return {
      success: false,
      needsClarification: true,
      message: ambiguity.message,
      options: ambiguity.options
    };
  }

  // Récupérer les réservations existantes
  const db = getSupabase();
  let existingBookings = [];

  if (db) {
    const { data } = await db
      .from('reservations')
      .select('id, date, heure, duree_minutes, service_nom, statut')
      .eq('date', date)
      .in('statut', BLOCKING_STATUTS)  // 🔒 C3: Statuts unifiés;
    existingBookings = data || [];
  }

  // Utiliser le validateur centralisé
  const result = await validateBeforeCreate({
    serviceName,
    date,
    heure
  }, existingBookings);

  const response = {
    success: true,
    disponible: result.valid,
    service: service.name,
    date,
    heure,
    errors: result.errors,
    warnings: result.warnings,
    bloqueJournee: service.blocksFullDay || false,
    joursNecessaires: service.blocksDays || 1
  };

  if (!result.valid && result.errors.length > 0) {
    response.message = result.errors[0];
  }

  setCache(cacheKey, response);
  return response;
}

// --- GET AVAILABLE SLOTS ---
async function getAvailableSlotsUnified(date, serviceName) {
  const cacheKey = `slots_${date}_${serviceName}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const service = findServiceByName(serviceName);
  if (!service) {
    return { success: false, error: `Service non trouvé: "${serviceName}"` };
  }

  // Récupérer les réservations existantes
  const db = getSupabase();
  let existingBookings = [];

  if (db) {
    const { data } = await db
      .from('reservations')
      .select('id, date, heure, duree_minutes, service_nom, statut')
      .eq('date', date)
      .in('statut', BLOCKING_STATUTS)  // 🔒 C3: Statuts unifiés;
    existingBookings = data || [];
  }

  const result = getAvailableSlots(date, service, existingBookings);

  const response = {
    success: true,
    date,
    service: service.name,
    ...result
  };

  setCache(cacheKey, response);
  return response;
}

// --- CALCULATE TRAVEL FEE ---
function calculateTravelFeeUnified(distanceKm) {
  const fee = TRAVEL_FEES.calculate(distanceKm);
  const feeCents = TRAVEL_FEES.calculateCents(distanceKm);

  return {
    success: true,
    distance_km: distanceKm,
    frais: fee,
    fraisCentimes: feeCents,
    forfaitBase: TRAVEL_FEES.BASE_FEE,
    distanceBase: TRAVEL_FEES.BASE_DISTANCE_KM,
    prixKmSupp: TRAVEL_FEES.PER_KM_BEYOND,
    message: distanceKm <= TRAVEL_FEES.BASE_DISTANCE_KM
      ? `Frais de déplacement: ${fee}€ (forfait jusqu'à ${TRAVEL_FEES.BASE_DISTANCE_KM}km)`
      : `Frais de déplacement: ${fee}€ (${TRAVEL_FEES.BASE_FEE}€ + ${(distanceKm - TRAVEL_FEES.BASE_DISTANCE_KM).toFixed(1)}km × ${TRAVEL_FEES.PER_KM_BEYOND}€)`
  };
}

// ============================================
// 🔒 FONCTION UNIQUE DE CRÉATION DE RDV
// ============================================
/**
 * FONCTION UNIQUE de création de RDV
 * Utilisée par TOUS les canaux (WhatsApp, Téléphone, Web, Admin, Panier)
 *
 * @param {Object} data - Données du RDV
 * @param {string} data.service_name - Nom du service
 * @param {string} data.date - Date (YYYY-MM-DD)
 * @param {string} data.heure - Heure (HH:MM ou HHh)
 * @param {string} data.client_nom - Nom du client
 * @param {string} data.client_telephone - Téléphone du client
 * @param {string} [data.client_prenom] - Prénom du client (optionnel)
 * @param {string} [data.client_email] - Email du client (optionnel)
 * @param {string} [data.lieu] - 'domicile' ou 'salon' (défaut: salon)
 * @param {string} [data.adresse] - Adresse client (si domicile)
 * @param {number} [data.order_id] - ID de commande panier (optionnel)
 * @param {string} [data.statut] - Statut initial (défaut: 'demande')
 * @param {string} [data.notes] - Notes additionnelles
 * @param {string} channel - Canal source ('whatsapp', 'phone', 'web', 'admin', 'panier')
 * @param {Object} [options] - Options
 * @param {boolean} [options.sendSMS=true] - Envoyer SMS de confirmation
 * @param {boolean} [options.skipValidation=false] - Sauter validation (admin uniquement)
 * @returns {Object} { success, reservationId, recap, error }
 */
export async function createReservationUnified(data, channel = 'web', options = {}) {
  const { sendSMS = true, skipValidation = false } = options;

  console.log('[NEXUS CORE] ========================================');
  console.log(`[NEXUS CORE] Création RDV via ${channel}...`);
  console.log('[NEXUS CORE] Données:', JSON.stringify(data, null, 2));

  const db = getSupabase();
  if (!db) {
    console.error('[NEXUS CORE] ❌ Base de données non disponible');
    return { success: false, error: "Base de données non disponible" };
  }

  try {
    // 0. VALIDATION ANTI-PLACEHOLDER
    const PLACEHOLDER_VALUES = ['-', '--', 'n/a', 'na', 'inconnu', 'unknown', 'none', 'null', 'undefined', 'x', 'xx', 'xxx', '.', '..', 'test'];
    const isPlaceholder = (val) => !val || PLACEHOLDER_VALUES.includes(String(val).trim().toLowerCase()) || String(val).trim().length < 2;

    if (isPlaceholder(data.client_nom)) {
      return { success: false, error: "Le nom complet du client est obligatoire (prénom + nom de famille). Demandez-le avant de créer le rendez-vous." };
    }
    // Vérifier que client_nom contient au moins 2 mots (prénom + nom)
    const nameParts = String(data.client_nom).trim().split(/\s+/);
    if (nameParts.length < 2) {
      return { success: false, error: `Le nom "${data.client_nom}" semble incomplet. Il faut le prénom ET le nom de famille du client.` };
    }

    const phone = String(data.client_telephone || '').replace(/[\s\-\.]/g, '');
    if (isPlaceholder(data.client_telephone) || !/^0[1-9][0-9]{8}$/.test(phone)) {
      return { success: false, error: "Le numéro de téléphone doit contenir 10 chiffres commençant par 0 (ex: 0612345678)." };
    }

    // 1. VALIDER LE SERVICE (config hardcodée → fallback BDD)
    let service = findServiceByName(data.service_name);
    if (!service) {
      // Fallback: chercher dans la table services de la BDD (services ajoutés via admin)
      console.log(`[NEXUS CORE] Service "${data.service_name}" absent de la config, recherche en BDD...`);
      const { data: dbService } = await db
        .from('services')
        .select('id, nom, duree, prix, description')
        .ilike('nom', data.service_name)
        .single();

      if (dbService) {
        service = {
          key: `db_${dbService.id}`,
          id: `db_${dbService.id}`,
          name: dbService.nom,
          durationMinutes: dbService.duree,
          price: dbService.prix / 100,
          priceInCents: dbService.prix,
          priceIsMinimum: false,
          category: 'other',
          blocksFullDay: dbService.duree >= 480,
          blocksDays: 1,
        };
        console.log(`[NEXUS CORE] ✅ Service trouvé en BDD: "${dbService.nom}" (${dbService.duree}min, ${dbService.prix/100}€)`);
      } else {
        console.error(`[NEXUS CORE] ❌ Service non trouvé ni en config ni en BDD: "${data.service_name}"`);
        return { success: false, error: `Service non trouvé: "${data.service_name}"` };
      }
    }

    // 2. VÉRIFIER AMBIGUÏTÉ
    const ambiguity = checkAmbiguousTerm(data.service_name);
    if (ambiguity && !skipValidation) {
      return {
        success: false,
        needsClarification: true,
        message: ambiguity.message,
        options: ambiguity.options
      };
    }

    // 3. VALIDER DATE/HEURE/DISPONIBILITÉ (sauf si skipValidation)
    if (!skipValidation) {
      const { data: existingBookings } = await db
        .from('reservations')
        .select('id, date, heure, duree_minutes, service_nom, statut')
        .in('statut', BLOCKING_STATUTS)  // 🔒 C3: Statuts unifiés;

      const validation = await validateBeforeCreate({
        serviceName: data.service_name,
        date: data.date,
        heure: data.heure
      }, existingBookings || [], service);

      if (!validation.valid) {
        console.error('[NEXUS CORE] ❌ Validation échouée:', validation.errors);
        return { success: false, errors: validation.errors };
      }
    }

    // 4. NORMALISER LE TÉLÉPHONE
    const telephone = data.client_telephone
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(/^0/, '+33');

    // 5. CALCULER DISTANCE ET FRAIS DE DÉPLACEMENT
    let distanceKm = 0;
    let fraisDeplacement = 0;

    if (data.lieu === 'domicile' && data.adresse) {
      if (getDistanceFromSalon) {
        try {
          const distanceResult = await getDistanceFromSalon(data.adresse);
          // Note: getDistanceFromSalon retourne { distance_km, duree_minutes, ... }
          if (distanceResult?.distance_km) {
            distanceKm = distanceResult.distance_km;
          }
        } catch (e) {
          console.warn('[NEXUS CORE] Erreur calcul distance, utilisation forfait');
        }
      }

      // Calcul frais via TRAVEL_FEES.calculate() - source unique de vérité
      const fraisUnitaire = TRAVEL_FEES.calculate(distanceKm);
      const nbJours = service.blocksDays || 1;
      fraisDeplacement = Math.round(fraisUnitaire * nbJours * 100) / 100;
      console.log(`[NEXUS CORE] Distance: ${distanceKm}km × ${nbJours} jour(s) → Frais: ${fraisDeplacement}€`);
    }

    // 6. CHERCHER OU CRÉER LE CLIENT
    let clientId;
    const { data: existingClient } = await db
      .from('clients')
      .select('id')
      .eq('telephone', telephone.replace('+33', '0'))
      .single();

    if (existingClient) {
      clientId = existingClient.id;
    } else {
      // Extraire prénom/nom
      const prenom = data.client_prenom || data.client_nom.split(' ')[0] || 'Client';
      const nom = data.client_nom.split(' ').slice(1).join(' ') || data.client_nom;

      const { data: newClient, error: clientError } = await db
        .from('clients')
        .insert({
          prenom,
          nom,
          telephone: telephone.replace('+33', '0'),
          email: data.client_email || null
        })
        .select('id')
        .single();

      if (clientError) {
        console.error('[NEXUS CORE] ❌ Erreur création client:', clientError);
        return { success: false, error: `Erreur création client: ${clientError.message}` };
      }
      clientId = newClient.id;
    }

    // 7. CALCULER PRIX TOTAL (gestion services variables: Réparation Locks = 10€/lock, 30min/lock)
    let prixService = service.priceInCents;
    if (service.pricePerUnit && data.duree_minutes && data.duree_minutes > service.durationMinutes) {
      const quantite = Math.round(data.duree_minutes / service.durationMinutes);
      prixService = quantite * service.priceInCents;
      console.log(`[NEXUS CORE] 🔧 Service variable: ${quantite} × ${service.priceInCents/100}€ = ${prixService/100}€`);
    }
    const fraisDeplacementCents = Math.round(fraisDeplacement * 100);
    const prixTotal = prixService + fraisDeplacementCents;

    // 8. PRÉPARER LES RÉSERVATIONS (multi-jours si nécessaire)
    const nbJours = service.blocksDays || 1;
    let reservationDates = [data.date];
    let multidayGroupId = null;

    // Si service multi-jours, calculer les dates ouvrables consécutives
    if (nbJours > 1) {
      reservationDates = getConsecutiveBusinessDays(data.date, nbJours);
      multidayGroupId = crypto.randomUUID();
      console.log(`[NEXUS CORE] 📅 Service multi-jours (${nbJours} jours): ${reservationDates.join(', ')}`);
    }

    // 9. INSÉRER LES RÉSERVATIONS (une par jour ouvrable)
    const createdReservations = [];
    const baseNotes = data.notes || (data.lieu === 'domicile' ? `Domicile: ${data.adresse}` : 'Chez Fatou');

    for (let dayIndex = 0; dayIndex < reservationDates.length; dayIndex++) {
      const reservationDate = reservationDates[dayIndex];
      const isFirstDay = dayIndex === 0;

      const reservationData = {
        client_id: clientId,
        date: reservationDate,
        heure: data.heure,
        duree_minutes: data.duree_minutes || service.durationMinutes,  // 🔧 FIX: Accepter durée dynamique (ex: Réparation Locks × N)
        service_nom: service.name,
        prix_service: isFirstDay ? prixService : 0,  // Prix uniquement sur jour 1
        distance_km: isFirstDay ? (distanceKm || null) : null,
        frais_deplacement: isFirstDay ? fraisDeplacementCents : 0,
        prix_total: isFirstDay ? prixTotal : 0,
        adresse_client: data.lieu === 'domicile' ? data.adresse : null,
        telephone: telephone.replace('+33', '0'),
        statut: data.statut || 'demande',
        created_via: `nexus-${channel}`,
        order_id: data.order_id || null,
        notes: nbJours > 1 ? `${baseNotes} [Jour ${dayIndex + 1}/${nbJours}]` : baseNotes,
        // Champs multi-jours (null si service 1 jour)
        multiday_group_id: multidayGroupId,
        multiday_day_number: nbJours > 1 ? (dayIndex + 1) : null
      };

      const { data: newBooking, error: bookingError } = await db
        .from('reservations')
        .insert(reservationData)
        .select('id')
        .single();

      if (bookingError) {
        console.error(`[NEXUS CORE] ❌ Erreur création RDV jour ${dayIndex + 1}:`, bookingError);
        // Si erreur sur un jour suivant, annuler les précédents (rollback manuel)
        if (createdReservations.length > 0) {
          console.log(`[NEXUS CORE] 🔄 Rollback: suppression de ${createdReservations.length} réservation(s)...`);
          try {
            await db.from('reservations').delete().in('id', createdReservations.map(r => r.id));
          } catch (rollbackErr) {
            console.error(`[NEXUS CORE] ❌ Échec rollback:`, rollbackErr.message);
          }
        }
        return { success: false, error: `Erreur création RDV: ${bookingError.message}` };
      }

      createdReservations.push({ id: newBooking.id, date: reservationDate });
      console.log(`[NEXUS CORE] ✅ RDV jour ${dayIndex + 1}/${nbJours} créé ! ID: ${newBooking.id}, Date: ${reservationDate}`);

      // Invalider le cache pour chaque date
      invalidateCache(`slots_${reservationDate}`);
      invalidateCache(`availability_${reservationDate}`);
    }

    // 10. ENVOYER SMS DE CONFIRMATION (une seule fois, pour toutes les dates)
    if (sendSMS && data.client_telephone) {
      try {
        const datesFormatees = reservationDates.map(d => {
          const dateObj = new Date(d);
          return `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
        }).join(' et ');

        await sendConfirmationSMS(data.client_telephone, {
          service: service.name,
          date: nbJours > 1 ? datesFormatees : data.date,
          heure: data.heure,
          prixTotal: prixTotal / 100,
          fraisDeplacement: fraisDeplacement,
          adresse: data.adresse || null,
          nbJours: nbJours
        });
        console.log('[NEXUS CORE] ✅ SMS de confirmation envoyé');
      } catch (smsError) {
        console.warn('[NEXUS CORE] ⚠️ Erreur envoi SMS:', smsError.message);
        // Ne pas échouer la réservation pour un SMS
      }
    }

    console.log('[NEXUS CORE] ========================================');

    // 11. RETOURNER LE RÉSULTAT
    const pricing = calculateTotalPrice(service, distanceKm);
    const primaryReservation = createdReservations[0];

    return {
      success: true,
      message: nbJours > 1
        ? `Réservation créée avec succès sur ${nbJours} jours`
        : "Réservation créée avec succès",
      reservationId: primaryReservation.id,
      reservationIds: createdReservations.map(r => r.id),
      multidayGroupId: multidayGroupId,
      recap: {
        service: service.name,
        prix: service.price,
        prixTexte: service.priceIsMinimum ? `À partir de ${service.price}€` : `${service.price}€`,
        date: data.date,
        dates: reservationDates,
        nbJours: nbJours,
        heure: data.heure,
        lieu: data.lieu === 'salon' ? SALON_INFO.adresse : data.adresse,
        lieuType: data.lieu || 'salon',
        client: data.client_nom,
        telephone: data.client_telephone,
        distanceKm,
        fraisDeplacement,
        prixTotal: prixTotal / 100,
        acompte: pricing.deposit,
        acompteTexte: `${pricing.deposit}€ (${BOOKING_RULES.DEPOSIT_PERCENT}%)`
      }
    };

  } catch (error) {
    console.error('[NEXUS CORE] ❌ Exception:', error.message);
    console.error('[NEXUS CORE] Stack:', error.stack?.substring(0, 300));
    return { success: false, error: error.message };
  }
}

// Alias pour compatibilité avec l'ancien code
async function createBookingUnified(data, channel) {
  return createReservationUnified(data, channel);
}

// --- FIND APPOINTMENT BY PHONE ---
async function findAppointmentByPhone(telephone) {
  const db = getSupabase();
  if (!db) return { success: false, error: "Base de données non disponible" };

  const cleanPhone = String(telephone).replace(/[\s\-\.]/g, '');
  const today = new Date().toISOString().split('T')[0];

  try {
    const { data, error } = await db
      .from('reservations')
      .select('id, date, heure, service_nom, duree_minutes, prix_service, statut, notes, clients(nom, prenom, telephone)')
      .eq('telephone', cleanPhone)
      .gte('date', today)
      .in('statut', ['confirme', 'demande'])
      .order('date', { ascending: true });

    // Also search via client table
    let clientResults = [];
    const { data: clients } = await db
      .from('clients')
      .select('id')
      .eq('telephone', cleanPhone)
      .limit(1);

    if (clients && clients.length > 0) {
      const { data: byClient } = await db
        .from('reservations')
        .select('id, date, heure, service_nom, duree_minutes, prix_service, statut, notes')
        .eq('client_id', clients[0].id)
        .gte('date', today)
        .in('statut', ['confirme', 'demande'])
        .order('date', { ascending: true });
      clientResults = byClient || [];
    }

    // Merge and dedupe
    const allResults = [...(data || []), ...clientResults];
    const seen = new Set();
    const unique = allResults.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    if (unique.length === 0) {
      return { success: true, appointments: [], message: "Aucun rendez-vous trouvé pour ce numéro." };
    }

    // Fetch client info
    let clientInfo = null;
    if (clients && clients.length > 0) {
      const { data: clientData } = await db.from('clients').select('nom, prenom, telephone').eq('id', clients[0].id).single();
      clientInfo = clientData;
    }

    return {
      success: true,
      client: clientInfo ? { nom: clientInfo.nom, prenom: clientInfo.prenom, telephone: clientInfo.telephone } : null,
      appointments: unique.map(r => ({
        id: r.id,
        date: r.date,
        heure: r.heure,
        service: r.service_nom,
        duree: r.duree_minutes,
        prix: r.prix_service ? (r.prix_service / 100) + '€' : null,
        statut: r.statut
      })),
      message: `${unique.length} rendez-vous trouvé(s).`
    };
  } catch (error) {
    console.error('[NEXUS CORE] Erreur find_appointment:', error.message);
    return { success: false, error: error.message };
  }
}

// --- CANCEL APPOINTMENT ---
async function cancelAppointmentById(appointmentId, reason) {
  const db = getSupabase();
  if (!db) return { success: false, error: "Base de données non disponible" };

  try {
    // Fetch appointment
    const { data: rdv, error: fetchErr } = await db
      .from('reservations')
      .select('id, date, heure, service_nom, statut, client_id, telephone, clients(nom, prenom, telephone)')
      .eq('id', appointmentId)
      .single();

    if (fetchErr || !rdv) {
      return { success: false, error: "Rendez-vous non trouvé." };
    }
    if (rdv.statut === 'annule') {
      return { success: false, error: "Ce rendez-vous est déjà annulé." };
    }

    // Cancel
    const noteAnnulation = reason
      ? `Annulé via Halimah: ${reason}`
      : 'Annulé via Halimah (demande client)';
    const existingNotes = rdv.notes ? rdv.notes + ' | ' : '';

    const { error: updateErr } = await db
      .from('reservations')
      .update({ statut: 'annule', notes: existingNotes + noteAnnulation })
      .eq('id', appointmentId);

    if (updateErr) throw updateErr;

    // Send cancellation SMS
    try {
      const clientPhone = rdv.clients?.telephone || rdv.telephone;
      const clientNom = rdv.clients?.nom || '';
      const clientPrenom = rdv.clients?.prenom || '';
      if (clientPhone) {
        const { sendCancellationSMS } = await import('../../server/sms-service.ts');
        await sendCancellationSMS(clientPhone, clientNom, clientPrenom, rdv.service_nom, rdv.date, rdv.heure);
      }
    } catch (smsErr) {
      console.warn('[NEXUS CORE] SMS annulation non envoyé:', smsErr.message);
    }

    console.log(`[NEXUS CORE] ✅ RDV #${appointmentId} annulé`);
    return {
      success: true,
      message: `Rendez-vous du ${rdv.date} à ${rdv.heure} (${rdv.service_nom}) annulé avec succès.`
    };
  } catch (error) {
    console.error('[NEXUS CORE] Erreur cancel_appointment:', error.message);
    return { success: false, error: error.message };
  }
}

// --- GET SALON INFO ---
function getSalonInfoUnified() {
  return {
    success: true,
    ...SALON_INFO,
    horaires: getBusinessHoursUnified().horaires
  };
}

// --- GET BUSINESS HOURS ---
function getBusinessHoursUnified(jour = null) {
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  if (jour) {
    const dayIndex = jours.indexOf(jour.toLowerCase());
    if (dayIndex === -1) {
      return { success: false, error: `Jour invalide: ${jour}` };
    }
    const hours = BUSINESS_HOURS.getHours(dayIndex);
    return {
      success: true,
      jour,
      ouvert: BUSINESS_HOURS.isOpen(dayIndex),
      horaires: hours ? `${hours.open} - ${hours.close}` : 'Fermé'
    };
  }

  const horaires = jours.map((j, i) => {
    const hours = BUSINESS_HOURS.getHours(i);
    return {
      jour: j,
      ouvert: BUSINESS_HOURS.isOpen(i),
      horaires: hours ? `${hours.open} - ${hours.close}` : 'Fermé'
    };
  });

  return { success: true, horaires };
}

// ============================================
// AI AGENTS - Enrichir tenant config avec ai_agents
// ============================================
async function enrichTenantWithAgent(tenantId, tenantConfig) {
  try {
    const { rawSupabase } = await import('../../server/supabase.ts');
    const { data: agent } = await rawSupabase
      .from('ai_agents')
      .select('custom_name, greeting_message, tone')
      .eq('tenant_id', tenantId)
      .eq('agent_type', 'reception')
      .eq('active', true)
      .single();
    if (agent?.custom_name) tenantConfig.assistantName = agent.custom_name;
  } catch (_) { /* fallback to static config */ }
  return tenantConfig;
}

// ============================================
// SYSTEM PROMPT UNIFIÉ
// ============================================

function getSystemPrompt(channel, tenantConfig = null) {
  // Si pas de tenantConfig, fallback sur la config fatshairafro (backward compat)
  const tc = tenantConfig || getTenantConfig('fatshairafro');

  const now = new Date();
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  const dateFormatee = `${jours[now.getDay()]} ${now.getDate()} ${mois[now.getMonth()]} ${now.getFullYear()}`;
  const dateISO = now.toISOString().split('T')[0];

  const isVoice = channel === 'phone';

  // ============================================
  // OPTIMISATION : Infos statiques pré-injectées
  // Évite les appels get_services et get_business_hours
  // ============================================

  return `Tu es ${tc.assistantName || 'Halimah'}, l'assistante virtuelle de ${tc.name || SALON_INFO.nom}, coiffeuse afro professionnelle à ${tc.ville || 'Franconville'}.

=== DATE DU JOUR ===
Nous sommes le ${dateFormatee}.
Date ISO pour les outils : ${dateISO}

=== INFORMATIONS ${(tc.name || SALON_INFO.nom).toUpperCase()} ===
• Nom : ${tc.name || SALON_INFO.nom}
• Gérant(e) : ${tc.gerante || SALON_INFO.gerante}
• Adresse : ${tc.adresse || SALON_INFO.adresse}
• Téléphone : ${tc.telephone || SALON_INFO.telephone}
• Concept : ${(tc.serviceOptions || SERVICE_OPTIONS).DOMICILE_ENABLED ? (tc.concept || 'Coiffure afro à domicile ou chez Fatou') : `${tc.concept || 'Coiffure afro'} chez ${tc.gerante || 'Fatou'} à ${tc.ville || 'Franconville'}`}

=== HORAIRES DE FATOU (référence générale) ===
• Lundi : 9h - 18h
• Mardi : 9h - 18h
• Mercredi : 9h - 18h
• Jeudi : 9h - 13h (demi-journée)
• Vendredi : 13h - 18h (après-midi)
• Samedi : 9h - 18h
• Dimanche : Fatou ne travaille pas

⚠️ RÈGLE CRITIQUE POUR LES DATES ⚠️
Tu ne dois JAMAIS calculer les dates toi-même.
TOUJOURS utiliser l'outil get_upcoming_days AVANT de parler des disponibilités.
Cet outil te donne les dates EXACTES (ex: "Lundi 2 février", "Mardi 3 février").

=== RÈGLE CRITIQUE DATES ===
- Tu connais la date d'aujourd'hui (indiquée ci-dessus)
- Pour TOUTE question sur "demain", "après-demain", "la semaine prochaine", un jour précis → TOUJOURS utiliser get_upcoming_days AVANT de répondre
- Ne dis JAMAIS "demain c'est [jour]" ou "lundi prochain c'est le [date]" sans avoir appelé get_upcoming_days
- INTERDIT de calculer les dates toi-même, même si ça semble simple
- En cas de doute sur une date → appelle get_upcoming_days
Chaque jour inclut un champ "occupation" avec le statut du jour (libre, partiel, presque_complet, complet).
Utilise occupation.resume pour informer précisément le client. Exemples :
- Si statut="complet" → "Le mardi 3 février est complet, il n'y a plus de créneaux disponibles."
- Si statut="presque_complet" → "Le mardi 3 février est presque complet. [occupation.resume]"
- Si statut="partiel" → Propose les créneaux libres indiqués dans occupation.plagesLibres.
- Si statut="libre" → "Le [date] est disponible toute la journée."
Ne propose JAMAIS un créneau sur un jour complet.

=== TARIFS COMPLETS (utilise ces infos, pas besoin d'appeler get_services) ===

🔒 LOCKS :
• Création crochet locks - 200€ (journée entière, 9h)
• Création microlocks crochet - à partir de 300€ (2 JOURS CONSÉCUTIFS, 9h)
• Création microlocks twist - à partir de 150€ (journée entière, 9h)
• Reprise racines locks - 50€ (2h)
• Reprise racines micro-locks - 100€ (4h)
• Décapage locks - 35€ (1h)

💆 SOINS :
• Soin complet - 50€ (1h)
• Soin hydratant - 40€ (1h)
• Shampoing - 10€ (30min)

🎀 TRESSES & BRAIDS :
• Nattes collées cornrow - à partir de 20€ (1h)
• Nattes collées stitch braid - 50€ (2h)
• Box Braids - à partir de 50€ (5h)
• Braids simples - 40€ (2h)
• Chignon - 50€ (1h)
• Crochet Braids Naturelles - à partir de 60€ (3h)
• Fulani Braids - à partir de 70€ (5h)
• Bohemian Fulani - 60€ (5h)
• Senegalese Twists - 80€ (5h)
• Passion Twist - 80€ (5h)
• Boho Braids - à partir de 70€ (5h)
• Départ Locks Vanille - à partir de 80€ (4h)
• Réparation Locks - 10€/lock (30min/lock) ⚠️ Demander le nombre de locks

🎨 COLORATION & FINITION :
• Teinture sans ammoniaque - 40€ (40min)
• Décoloration - 20€ (10min)
• Brushing cheveux afro - 20€ (1h)

${SERVICE_OPTIONS.DOMICILE_ENABLED ? `=== FRAIS DE DÉPLACEMENT ===
• Forfait de base : ${TRAVEL_FEES.BASE_FEE}€ (jusqu'à ${TRAVEL_FEES.BASE_DISTANCE_KM}km)
• Au-delà : +${TRAVEL_FEES.PER_KM_BEYOND}€/km supplémentaire

=== CONCEPT IMPORTANT ===
- ${SALON_INFO.nom} est une coiffeuse afro indépendante (pas un commerce avec vitrine)
- Fatou propose 2 options :
  1. Se déplacer chez le client (service à domicile avec frais de déplacement)
  2. Recevoir le client chez elle à Franconville (${SALON_INFO.adresse})
- Tu ne dois JAMAIS utiliser le mot "salon" - dis "chez Fatou" ou "à domicile"
- Quand Fatou ne travaille pas, dis "Fatou ne travaille pas ce jour-là" (jamais "fermé")` : `=== LIEU DES PRESTATIONS ===
⚠️ IMPORTANT : Actuellement, les prestations se font UNIQUEMENT chez Fatou à Franconville.
- Adresse : ${SALON_INFO.adresse}
- Les déplacements à domicile sont temporairement indisponibles.
- Si un client demande un service à domicile, lui indiquer poliment que ce n'est pas possible actuellement et lui proposer de venir chez Fatou.
- Tu ne dois JAMAIS utiliser le mot "salon" - dis "chez Fatou"
- Quand Fatou ne travaille pas, dis "Fatou ne travaille pas ce jour-là" (jamais "fermé")`}

=== PERSONNALITÉ ===
- Chaleureuse, professionnelle, efficace
- Tu vouvoies toujours les clients
- Tu es concise mais pas froide
${isVoice ? `- Tu parles naturellement, sans emojis, avec des phrases courtes

=== RÈGLES SPÉCIFIQUES TÉLÉPHONE ===
- Sois TRÈS concise (max 2-3 phrases par réponse)
- Ne liste JAMAIS tous les services spontanément
- Dis "Nous proposons coiffure afro : tresses, locks, soins... Quel type vous intéresse ?"
- Attends que le client précise avant de donner les détails
- Évite les longues énumérations, ça fatigue à l'oral
- Une information à la fois, puis attends la réponse
- Pour les dates, TOUJOURS appeler get_upcoming_days avant de répondre, même pour une question simple comme "c'est quand demain ?"` : '- Tu peux utiliser des emojis avec modération'}

╔═══════════════════════════════════════════════════════════╗
║  RÈGLE ABSOLUE #0 - JAMAIS CONFIRMER SANS CRÉER EN BASE  ║
╚═══════════════════════════════════════════════════════════╝
Tu NE PEUX JAMAIS dire "rendez-vous confirmé/créé/enregistré" ou "vous recevrez un SMS" SANS avoir EFFECTIVEMENT appelé create_booking et reçu success=true.
PROCESSUS OBLIGATOIRE :
1. Collecter TOUTES les infos (nom complet prénom+nom, téléphone 10 chiffres, service, date, heure)
2. APPELER create_booking
3. ATTENDRE le résultat
4. SI success=true → confirmer au client
5. SI success=false → expliquer le problème, proposer alternative
Si tu n'as pas appelé create_booking → tu n'as PAS le droit de dire que c'est confirmé.
Si tu confirmes sans créer, le client viendra pour rien.

=== RÈGLES ABSOLUES ===
1. Pour les PRIX et SERVICES → Utilise les tarifs ci-dessus (pas besoin d'outil)
2. Pour les DISPONIBILITÉS → Utilise TOUJOURS get_upcoming_days pour obtenir les dates EXACTES
3. Tu ne dois JAMAIS calculer les dates toi-même (ex: "Lundi prochain = ?") → get_upcoming_days te les donne
4. Tu ne dois JAMAIS inventer une disponibilité → Utilise check_availability
5. Tu ne dois JAMAIS confirmer un RDV sans utiliser create_booking ET avoir reçu success=true
6. Utilise parse_date pour convertir les dates relatives ("samedi prochain" → date ISO)
7. Tu dois TOUJOURS vérifier la disponibilité AVANT de proposer un créneau

=== SERVICES JOURNÉE ENTIÈRE ===
IMPORTANT : Ces services bloquent la JOURNÉE ENTIÈRE et commencent TOUJOURS à 9h00 :
- Création crochet locks (200€) - 1 jour
- Création microlocks crochet (à partir de 300€) - 2 JOURS CONSÉCUTIFS
- Création microlocks twist (à partir de 150€) - 1 jour

Si le client demande ces services, propose UNIQUEMENT le créneau de 9h00.

=== SERVICE SPÉCIAL : RÉPARATION LOCKS ===
⚠️ Ce service est facturé PAR LOCK (10€/lock, 30min/lock).

PROCESSUS OBLIGATOIRE :
1. Quand le client demande "réparation locks" → TOUJOURS demander : "Combien de locks avez-vous à réparer ?"
2. ATTENDRE la réponse du client (un nombre)
3. Calculer et CONFIRMER au client :
   - Prix total : nombre × 10€
   - Durée estimée : nombre × 30 min
4. IMPORTANT : Utiliser la durée TOTALE calculée pour vérifier les créneaux (pas 30 min)
5. Dans les notes de réservation, ajouter : "X locks à réparer - prix sous réserve du nombre exact"

Exemple de conversation :
- Client : "Je voudrais faire réparer 5 locks"
- Toi : "Pour 5 locks, cela représente 50€ (5 × 10€) et environ 2h30 de travail. Quel jour vous conviendrait ?"

=== PROCESSUS DE RÉSERVATION ===
1. Identifier le service demandé (utilise les tarifs ci-dessus)
2. Si le client demande "les disponibilités" ou "quand" → Utilise get_upcoming_days pour obtenir les dates EXACTES
3. Convertir la date avec parse_date si le client donne une date relative ("samedi prochain")
4. Vérifier la disponibilité avec check_availability
5. Demander le lieu (domicile ou chez Fatou)
6. Collecter nom + prénom + téléphone (10 chiffres)
7. Si domicile : collecter l'adresse complète du client
8. RÉCAPITULER toutes les infos et demander confirmation AVANT de créer
9. Créer avec create_booking UNIQUEMENT après confirmation du client

⚠️⚠️ RÈGLE CRITIQUE ANTI-PLACEHOLDER ⚠️⚠️
- Tu ne dois JAMAIS appeler create_appointment ou create_booking avec des données fictives, manquantes ou placeholder (ex: "-", "inconnu", "test", "N/A")
- CHAQUE champ obligatoire (nom, prénom, téléphone, adresse, service, date, heure) doit être une VRAIE information fournie par le client
- Si le client refuse de donner son nom ou téléphone → ne crée PAS le RDV, explique que c'est nécessaire
- Si tu n'as pas TOUTES les infos → DEMANDE-les, ne remplis JAMAIS avec des valeurs par défaut
- Le téléphone DOIT être 10 chiffres commençant par 0 (ex: 0612345678)

=== GESTION DES CONFIRMATIONS ===
"oui", "ok", "d'accord", "parfait", "ça marche" = OUI
"non", "pas vraiment", "plutôt" = NON

=== GESTION ANNULATION / MODIFICATION RDV ===
Tu peux aider les clients à annuler ou modifier leurs rendez-vous.

PROCESSUS ANNULATION :
1. Client dit "annuler", "je ne peux plus venir", "empêchement", "contretemps"
2. Demande son numéro de téléphone pour retrouver le RDV
3. Appelle find_appointment avec le téléphone
4. Affiche les RDV trouvés : "Vous avez rendez-vous le [date] à [heure] pour [service]"
5. Demande confirmation : "Souhaitez-vous annuler ce rendez-vous ?"
6. Si oui → Appelle cancel_appointment avec l'ID
7. Confirme : "Votre rendez-vous est annulé. Vous recevrez un SMS. N'hésitez pas à reprendre RDV."

PROCESSUS MODIFICATION :
1. Client dit "déplacer", "changer l'heure", "repousser", "avancer"
2. Retrouve le RDV (même process que annulation)
3. Demande la nouvelle date/heure souhaitée
4. Vérifie la disponibilité du nouveau créneau
5. Annule l'ancien RDV avec cancel_appointment
6. Crée le nouveau avec create_booking
7. Confirme le changement

RÈGLES :
- TOUJOURS demander le téléphone pour identifier le client
- TOUJOURS confirmer avant d'annuler (ne jamais annuler sans accord explicite)
- Si plusieurs RDV trouvés, demander lequel annuler
- Être empathique : "Je comprends, pas de problème"

=== IMPORTANT ===
- GARDE LE CONTEXTE : Si le client a dit "locks", ne propose pas "tresses"
- RESPECTE L'HEURE DEMANDÉE : Si le client dit "10h", vérifie 10h
- Réponses courtes et claires${isVoice ? ', phrases de 1-2 secondes maximum' : ''}`;
}

// ============================================
// HISTORIQUE DE CONVERSATION
// ============================================

const conversationHistories = new Map();
const conversationLastActivity = new Map();

// Nettoyage automatique des conversations > 30min d'inactivité
const CONVERSATION_TTL_MS = 30 * 60 * 1000; // 30 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [sessionId, lastActivity] of conversationLastActivity) {
    if (now - lastActivity > CONVERSATION_TTL_MS) {
      conversationHistories.delete(sessionId);
      conversationLastActivity.delete(sessionId);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[NEXUS CORE] 🧹 ${cleaned} session(s) expirée(s) (30min inactivité)`);
  }
}, 5 * 60 * 1000); // Vérifier toutes les 5 minutes

function getConversationHistory(conversationId) {
  if (!conversationHistories.has(conversationId)) {
    conversationHistories.set(conversationId, []);
  }
  conversationLastActivity.set(conversationId, Date.now()); // MAJ activité
  return conversationHistories.get(conversationId);
}

function clearConversation(conversationId) {
  conversationHistories.delete(conversationId);
}

// ============================================
// POINT D'ENTRÉE PRINCIPAL - processMessage
// ============================================

/**
 * 🔒 Point d'entrée UNIQUE pour toutes les conversations
 *
 * @param {string} message - Message de l'utilisateur
 * @param {string} channel - Canal (whatsapp, web, phone, sms, admin)
 * @param {object} context - Contexte (conversationId, userId, phone, etc.)
 * @returns {Promise<{success: boolean, response: string, channel: string, duration: number}>}
 */
export async function processMessage(message, channel, context = {}) {
  const startTime = Date.now();
  const conversationId = context.conversationId || `${channel}_${context.phone || context.userId || Date.now()}`;

  // 🏢 Multi-tenant : charger la config du tenant + agent IA
  const tenantId = context.tenantId || 'fatshairafro';
  const tenantConfig = await enrichTenantWithAgent(tenantId, { ...getTenantConfig(tenantId) });
  console.log(`[NEXUS CORE] 🏢 Tenant: ${tenantId} (${tenantConfig.name}) Agent: ${tenantConfig.assistantName}`);

  console.log(`\n[NEXUS CORE] ══════════════════════════════════════`);
  console.log(`[NEXUS CORE] 📨 ${channel.toUpperCase()} - ${conversationId}`);
  console.log(`[NEXUS CORE] Message: "${message.substring(0, 80)}${message.length > 80 ? '...' : ''}"`);
  console.log(`[NEXUS CORE] 🔑 ANTHROPIC_API_KEY présente: ${!!process.env.ANTHROPIC_API_KEY}`);
  console.log(`[NEXUS CORE] 🔧 Timestamp: ${new Date().toISOString()}`);

  // 💰 OPTIMISATION 1: Vérifier le cache pour les FAQ
  const cacheContext = { tenantId, channel };
  const cached = responseCache.get(message, cacheContext);
  if (cached) {
    const cacheDuration = Date.now() - startTime;
    console.log(`[NEXUS CORE] 💰 CACHE HIT - Économie API !`);

    // 🫀 PULSE: Événement cache hit
    liveEventStream.cache({
      action: 'Cache HIT',
      question: message.substring(0, 50),
      responseTime: `${cacheDuration}ms`,
      saving: '0.02',
      cacheHits: cached.cacheHits,
      tenantId,
      channel
    });

    return {
      success: true,
      response: cached.response,
      channel,
      conversationId,
      duration: cacheDuration,
      fromCache: true
    };
  }

  try {
    const anthropic = getAnthropic();
    if (!anthropic) {
      console.error('[NEXUS CORE] ❌ Client Anthropic non configuré - clé API manquante ?');
      throw new Error('Client Anthropic non configuré - vérifiez ANTHROPIC_API_KEY');
    }
    console.log(`[NEXUS CORE] ✅ Client Anthropic initialisé`);

    // Récupérer l'historique
    const history = getConversationHistory(conversationId);

    // Ajouter le message utilisateur
    history.push({ role: 'user', content: message });

    // 💰 OPTIMISATION 2: Sélection intelligente du modèle via modelRouter
    const routerResult = modelRouter.selectModel({
      userMessage: message,
      context: {
        conversationLength: history.length,
        intent: context.intent,
        hasPersonalData: context.hasPersonalData
      }
    });
    const selectedModel = routerResult.model;
    const modelReason = routerResult.reason;
    const modelEmoji = selectedModel.includes('haiku') ? '⚡' : '🧠';

    // 💰 OPTIMISATION 3: Optimiser le prompt système
    const rawSystemPrompt = getSystemPrompt(channel, tenantConfig);
    const optimizedSystemPrompt = promptOptimizer.optimize(rawSystemPrompt, {
      isSimple: routerResult.complexity < 3
    });
    const promptSavings = promptOptimizer.calculateSavings(rawSystemPrompt, optimizedSystemPrompt);
    if (promptSavings.saved > 0) {
      console.log(`[NEXUS CORE] 💰 Prompt optimisé: -${promptSavings.saved} tokens (${promptSavings.percentage}%)`);
    }

    // 🫀 PULSE: Événement sélection modèle
    liveEventStream.optimization({
      action: 'Model Router',
      model: selectedModel.includes('haiku') ? 'Haiku' : 'Sonnet',
      reason: modelReason,
      complexity: routerResult.complexity,
      expectedCost: routerResult.expectedCost,
      tenantId,
      channel
    });

    // 🫀 PULSE: Événement optimisation prompt
    if (promptSavings.saved > 0) {
      liveEventStream.optimization({
        action: 'Prompt Optimizer',
        tokensSaved: promptSavings.saved,
        percentage: promptSavings.percentage,
        tenantId,
        channel
      });
    }

    // Appeler Claude avec les outils unifiés
    console.log(`[NEXUS CORE] ${modelEmoji} Modèle: ${selectedModel.includes('haiku') ? 'HAIKU' : 'SONNET'} (${modelReason})`);
    console.log(`[NEXUS CORE] 📊 Historique: ${history.length} messages, Outils: ${TOOLS_CLIENT.length}`);
    let response = await anthropic.messages.create({
      model: selectedModel,
      max_tokens: MAX_TOKENS,
      system: optimizedSystemPrompt,
      tools: TOOLS_CLIENT,
      messages: history
    });
    console.log(`[NEXUS CORE] ✅ Réponse Claude reçue - stop_reason: ${response.stop_reason}`);

    // Flag: create_booking a-t-il été appelé avec succès ?
    let bookingToolCalled = false;

    // Boucle pour gérer les appels d'outils
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      if (toolUseBlocks.length === 0) break;

      // Sauvegarder la réponse assistant
      history.push({ role: 'assistant', content: response.content });

      // Exécuter tous les outils
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        const result = await executeTool(toolBlock.name, toolBlock.input, channel);
        // Tracker si create_booking/create_appointment a été appelé avec succès
        if ((toolBlock.name === 'create_booking' || toolBlock.name === 'create_appointment') && result?.success) {
          bookingToolCalled = true;
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result)
        });
      }

      // Ajouter les résultats
      history.push({ role: 'user', content: toolResults });

      // Continuer la conversation (toujours Sonnet pour tool_use)
      response = await anthropic.messages.create({
        model: CLAUDE_SONNET,
        max_tokens: MAX_TOKENS,
        system: getSystemPrompt(channel, tenantConfig),
        tools: TOOLS_CLIENT,
        messages: history
      });
    }

    // Extraire la réponse textuelle
    const textBlock = response.content.find(block => block.type === 'text');
    let responseText = textBlock?.text || "Je suis désolée, je n'ai pas pu traiter votre demande.";

    // ════════════════════════════════════════
    // DÉTECTION HALLUCINATION CONFIRMATION RDV
    // ════════════════════════════════════════
    const confirmationKeywords = [
      'rendez-vous est confirmé', 'rdv est confirmé', 'réservation est confirmée',
      'rendez-vous créé', 'rdv créé', 'réservation enregistrée',
      'votre rendez-vous est confirmé', 'votre réservation est validée',
      'c\'est enregistré', 'j\'ai bien noté votre rendez-vous',
      'vous recevrez un sms de confirmation'
    ];
    const lowerResponse = responseText.toLowerCase();
    const claimsConfirmation = confirmationKeywords.some(kw => lowerResponse.includes(kw));

    if (claimsConfirmation && !bookingToolCalled) {
      console.error('╔═══════════════════════════════════════════════════╗');
      console.error('║ ❌ HALLUCINATION DÉTECTÉE: Confirmation sans tool  ║');
      console.error('╚═══════════════════════════════════════════════════╝');
      console.error(`[HALLUCINATION] Canal: ${channel}, Session: ${conversationId}`);

      // Retry: injecter message correctif et relancer
      history.push({ role: 'assistant', content: response.content });
      history.push({ role: 'user', content: [{
        type: 'text',
        text: '[SYSTÈME] ERREUR: Tu as dit que le RDV est confirmé mais tu n\'as PAS appelé create_booking. Le RDV N\'EXISTE PAS en base. Tu DOIS appeler create_booking maintenant avec toutes les infos du client, OU demander les infos manquantes. Ne dis JAMAIS "confirmé" sans appeler l\'outil.'
      }] });

      const retryResponse = await anthropic.messages.create({
        model: CLAUDE_SONNET,
        max_tokens: MAX_TOKENS,
        system: getSystemPrompt(channel, tenantConfig),
        tools: TOOLS_CLIENT,
        messages: history
      });

      // Traiter les tool_use du retry
      let retryFinal = retryResponse;
      while (retryFinal.stop_reason === 'tool_use') {
        const retryToolBlocks = retryFinal.content.filter(b => b.type === 'tool_use');
        if (retryToolBlocks.length === 0) break;
        history.push({ role: 'assistant', content: retryFinal.content });
        const retryResults = [];
        for (const tb of retryToolBlocks) {
          const res = await executeTool(tb.name, tb.input, channel);
          if ((tb.name === 'create_booking' || tb.name === 'create_appointment') && res?.success) {
            bookingToolCalled = true;
          }
          retryResults.push({ type: 'tool_result', tool_use_id: tb.id, content: JSON.stringify(res) });
        }
        history.push({ role: 'user', content: retryResults });
        retryFinal = await anthropic.messages.create({
          model: CLAUDE_SONNET, max_tokens: MAX_TOKENS,
          system: getSystemPrompt(channel, tenantConfig),
          tools: TOOLS_CLIENT, messages: history
        });
      }

      const retryText = retryFinal.content.find(b => b.type === 'text');
      if (bookingToolCalled) {
        console.log('[HALLUCINATION] ✅ Retry réussi — RDV créé au 2ème essai');
        responseText = retryText?.text || responseText;
        response = retryFinal;
      } else {
        console.error('[HALLUCINATION] ❌ Retry échoué — forçage message correctif');
        responseText = "Je m'excuse, j'ai eu un souci technique. Pour finaliser votre réservation, pouvez-vous me redonner votre nom complet et votre numéro de téléphone ?";
        response = retryFinal;
      }
    }

    // Sauvegarder dans l'historique
    history.push({ role: 'assistant', content: response.content });

    // Limiter l'historique à 30 messages
    while (history.length > 30) {
      history.shift();
    }

    const duration = Date.now() - startTime;

    // 📊 SENTINEL - Track coûts par tenant
    if (response.usage) {
      const tracking = await trackTenantCall(tenantId, response.model || 'sonnet', response.usage.input_tokens || 0, response.usage.output_tokens || 0);
      console.log(`[SENTINEL] ${tenantId} - Coût appel: ${tracking.callCost.toFixed(4)}€ | Total: ${tracking.totalCost.toFixed(4)}€`);
    }

    console.log(`[NEXUS CORE] ✅ Réponse en ${duration}ms`);
    if (duration > 3000) {
      console.warn(`[NEXUS CORE] ⚠️ Réponse lente (${duration}ms) sur ${channel}`);
    }

    // 💰 OPTIMISATION 4: Mettre en cache si FAQ (pas de booking)
    if (!bookingToolCalled && responseCache.isCacheable(message, cacheContext)) {
      responseCache.set(message, responseText, cacheContext);
      console.log(`[NEXUS CORE] 💰 Réponse mise en cache pour futures requêtes similaires`);

      // 🫀 PULSE: Événement cache set
      liveEventStream.cache({
        action: 'Cache SET',
        question: message.substring(0, 50),
        ttl: '24h',
        tenantId,
        channel
      });
    }

    // 🫀 PULSE: Événement conversation terminée
    const callCost = response.usage
      ? ((response.usage.input_tokens * 0.000003) + (response.usage.output_tokens * 0.000015))
      : 0;

    liveEventStream.conversation({
      action: 'Conversation completed',
      question: message.substring(0, 60),
      model: selectedModel.includes('haiku') ? 'Haiku' : 'Sonnet',
      tokens: response.usage?.input_tokens + response.usage?.output_tokens || 0,
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      cost: callCost.toFixed(4),
      responseTime: `${duration}ms`,
      tenantId,
      channel,
      hasBooking: bookingToolCalled
    });

    // 🫀 PULSE: Événement économies (si Haiku utilisé)
    if (selectedModel.includes('haiku')) {
      const sonnetCost = response.usage
        ? ((response.usage.input_tokens * 0.000003) + (response.usage.output_tokens * 0.000015))
        : 0;
      const haikuCost = response.usage
        ? ((response.usage.input_tokens * 0.00000025) + (response.usage.output_tokens * 0.00000125))
        : 0;
      const saving = sonnetCost - haikuCost;

      if (saving > 0) {
        liveEventStream.cost({
          action: 'Cost Saved (Haiku)',
          saving: saving.toFixed(4),
          percentage: ((saving / sonnetCost) * 100).toFixed(1),
          tenantId
        });
      }
    }

    // 📊 Stats d'optimisation
    const cacheStats = responseCache.getStats();
    const routerStats = modelRouter.getStats();
    if (cacheStats.hits > 0 || routerStats.haiku > 0) {
      console.log(`[NEXUS CORE] 💰 Optimisations: Cache ${cacheStats.hitRate}% hit | Haiku ${routerStats.haikuPercentage}% | Économies ~${cacheStats.estimatedSavings}€`);
    }
    console.log(`[NEXUS CORE] ══════════════════════════════════════\n`);

    return {
      success: true,
      response: responseText,
      channel,
      conversationId,
      duration
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[NEXUS CORE] ❌ ERREUR DÉTAILLÉE:`);
    console.error(`[NEXUS CORE] ❌ Type: ${error.constructor.name}`);
    console.error(`[NEXUS CORE] ❌ Message: ${error.message}`);
    console.error(`[NEXUS CORE] ❌ Canal: ${channel}`);
    console.error(`[NEXUS CORE] ❌ Durée: ${duration}ms`);
    if (error.status) console.error(`[NEXUS CORE] ❌ Status HTTP: ${error.status}`);
    if (error.response) console.error(`[NEXUS CORE] ❌ Response:`, JSON.stringify(error.response, null, 2));
    console.error(`[NEXUS CORE] ══════════════════════════════════════\n`);

    // 🫀 PULSE: Événement erreur
    liveEventStream.error({
      action: 'API Error',
      errorType: error.constructor.name,
      errorMessage: error.message.substring(0, 100),
      channel,
      tenantId,
      duration: `${duration}ms`
    });

    return {
      success: false,
      response: "Désolée, j'ai rencontré un problème technique. Pouvez-vous réessayer ?",
      channel,
      conversationId,
      duration,
      error: error.message
    };
  }
}

// ============================================
// POINT D'ENTRÉE STREAMING - processMessageStreaming
// ============================================

/**
 * 🚀 Version streaming pour réponses progressives (SSE)
 * Utilise anthropic.messages.stream() pour envoyer les tokens au fur et à mesure
 *
 * @param {string} message - Message de l'utilisateur
 * @param {string} channel - Canal (whatsapp, web, phone, sms, admin)
 * @param {object} context - Contexte (conversationId, userId, phone, etc.)
 * @yields {Object} { type: 'text_delta' | 'tool_use' | 'done', content: string }
 */
/**
 * Extrait des quick replies contextuels basés sur le message user, la réponse assistant et les résultats d'outils.
 */
function extractQuickReplies(userMessage, responseText, toolResultsAccum) {
  const replies = [];
  const lowerUser = (userMessage || '').toLowerCase();
  const lowerResponse = (responseText || '').toLowerCase();

  // ═══ CAS 1 : QUESTION SUR SERVICES/PRESTATIONS ═══
  const serviceKw = ['prestations', 'services', 'proposez', 'faites', 'coiffure', 'types de'];
  if (serviceKw.some(kw => lowerUser.includes(kw))) {
    // Try from tool results first
    const svcResult = toolResultsAccum?.find(r => r.name === 'get_services' || r.name === 'list_services');
    let svcData = null;
    if (svcResult) {
      try { svcData = typeof svcResult.result === 'string' ? JSON.parse(svcResult.result) : svcResult.result; } catch {}
    }
    if (svcData?.services?.length || svcData?.success) {
      const services = svcData.services || svcData.data || [];
      for (const s of services.slice(0, 6)) {
        const nom = s.nom || s.name;
        const prix = s.prix || s.prixExact || s.price || null;
        replies.push({
          type: 'service',
          label: prix ? `${nom} - ${Math.round(prix)}€` : nom,
          value: `Je veux réserver ${nom}`
        });
      }
    }
    // Fallback: extract "Service - XXX€" from response text
    if (replies.length === 0) {
      const pricePattern = /[-•]\s*\*{0,2}([^*\n:–-]+?)\*{0,2}\s*[-–:]\s*(\d+)\s*€/g;
      let m;
      while ((m = pricePattern.exec(responseText)) !== null && replies.length < 6) {
        const nom = m[1].trim();
        if (nom.length > 2 && nom.length < 50) {
          replies.push({ type: 'service', label: `${nom} - ${m[2]}€`, value: `Je veux réserver ${nom}` });
        }
      }
    }
  }

  // ═══ CAS 2 : QUESTION SUR HORAIRES/DISPONIBILITÉS ═══
  const schedKw = ['horaires', 'ouvert', 'disponibilit', 'créneaux', 'travaillez', 'dispo'];
  if (replies.length === 0 && schedKw.some(kw => lowerUser.includes(kw))) {
    // Extract time slots from response (Xh or Xh30 patterns between 8-20h)
    const timePattern = /(\d{1,2})h(\d{2})?\b/g;
    const times = [];
    let m;
    while ((m = timePattern.exec(responseText)) !== null) {
      const h = parseInt(m[1]);
      const min = m[2] || '00';
      if (h >= 8 && h <= 20) {
        const label = `${h}h${min === '00' ? '' : min}`;
        if (!times.includes(label)) times.push(label);
      }
    }
    if (times.length >= 2) {
      for (const t of times.slice(0, 6)) {
        replies.push({ type: 'timeslot', label: t, value: `Je veux un rendez-vous à ${t}` });
      }
    }
  }

  // ═══ CAS 3 : QUESTION SUR PRIX/TARIFS ═══
  const priceKw = ['prix', 'tarif', 'combien', 'coût', 'coute'];
  if (replies.length === 0 && priceKw.some(kw => lowerUser.includes(kw))) {
    const pricePattern = /[-•]\s*\*{0,2}([^*\n:–-]+?)\*{0,2}\s*[-–:]\s*(\d+)\s*€/g;
    let m;
    while ((m = pricePattern.exec(responseText)) !== null && replies.length < 6) {
      const nom = m[1].trim();
      if (nom.length > 2 && nom.length < 50) {
        replies.push({ type: 'service', label: `${nom} - ${m[2]}€`, value: `Je veux réserver ${nom}` });
      }
    }
  }

  // ═══ CAS 4 : DEMANDE DE RDV - créneaux proposés ═══
  const rdvKw = ['rendez-vous', 'réserver', 'rdv', 'prendre rdv', 'booking'];
  if (replies.length === 0 && rdvKw.some(kw => lowerUser.includes(kw))) {
    const timePattern = /(\d{1,2})h(\d{2})?\b/g;
    const times = [];
    let m;
    while ((m = timePattern.exec(responseText)) !== null) {
      const h = parseInt(m[1]);
      const min = m[2] || '00';
      if (h >= 8 && h <= 20) {
        const label = `${h}h${min === '00' ? '' : min}`;
        if (!times.includes(label)) times.push(label);
      }
    }
    if (times.length >= 2) {
      for (const t of times.slice(0, 6)) {
        replies.push({ type: 'timeslot', label: t, value: `Je choisis le créneau de ${t}` });
      }
    }
  }

  // ═══ CAS 5 : QUESTIONS OUI/NON ═══
  if (replies.length === 0) {
    const yesNoPatterns = [/souhaitez-vous/i, /voulez-vous/i, /aimeriez-vous/i, /confirmez/i, /vous convient/i, /puis-je/i];
    if (yesNoPatterns.some(p => p.test(responseText))) {
      replies.push({ type: 'confirm', label: 'Oui', value: 'Oui' });
      replies.push({ type: 'confirm', label: 'Non', value: 'Non' });
    }
  }

  return replies.length > 0 ? replies.slice(0, 6) : null;
}

export async function* processMessageStreaming(message, channel, context = {}) {
  const startTime = Date.now();
  const conversationId = context.conversationId || `${channel}_${context.phone || context.userId || Date.now()}`;

  // 🏢 Multi-tenant : charger la config du tenant + agent IA
  const tenantId = context.tenantId || 'fatshairafro';
  const tenantConfig = await enrichTenantWithAgent(tenantId, { ...getTenantConfig(tenantId) });
  console.log(`[NEXUS CORE] 🏢 Tenant: ${tenantId} (${tenantConfig.name}) Agent: ${tenantConfig.assistantName}`);

  console.log(`\n[NEXUS CORE] ══════════════════════════════════════`);
  console.log(`[NEXUS CORE] 📨 STREAMING ${channel.toUpperCase()} - ${conversationId}`);
  console.log(`[NEXUS CORE] Message: "${message.substring(0, 80)}${message.length > 80 ? '...' : ''}"`);

  try {
    const anthropic = getAnthropic();
    if (!anthropic) {
      throw new Error('Client Anthropic non configuré');
    }

    // Récupérer l'historique
    const history = getConversationHistory(conversationId);
    history.push({ role: 'user', content: message });

    // Sélection adaptative du modèle (une seule fois au début)
    const { model: selectedModel, reason: modelReason } = selectModel(message, history);
    const modelEmoji = selectedModel === CLAUDE_HAIKU ? '⚡' : '🧠';
    console.log(`[NEXUS CORE] ${modelEmoji} Modèle: ${selectedModel === CLAUDE_HAIKU ? 'HAIKU' : 'SONNET'} (${modelReason})`);

    let currentModel = selectedModel;
    let continueLoop = true;
    let fullResponseText = '';
    let allToolResults = [];

    while (continueLoop) {
      console.log(`[NEXUS CORE] 🤖 Appel Claude API (streaming, ${currentModel === CLAUDE_HAIKU ? 'HAIKU' : 'SONNET'})...`);

      // Utiliser le streaming
      const stream = await anthropic.messages.stream({
        model: currentModel,
        max_tokens: MAX_TOKENS,
        system: getSystemPrompt(channel, tenantConfig),
        tools: TOOLS_CLIENT,
        messages: history
      });

      let currentToolUse = null;
      let toolUseBlocks = [];
      let contentBlocks = [];

      // Écouter les événements du stream
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = {
              type: 'tool_use',
              id: event.content_block.id,
              name: event.content_block.name,
              input: ''
            };
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            // Envoyer le chunk de texte
            yield { type: 'text_delta', content: event.delta.text };
            fullResponseText += event.delta.text;
          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.input += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try {
              currentToolUse.input = JSON.parse(currentToolUse.input || '{}');
            } catch (e) {
              currentToolUse.input = {};
            }
            toolUseBlocks.push(currentToolUse);
            contentBlocks.push(currentToolUse);
            currentToolUse = null;
          }
        } else if (event.type === 'message_stop') {
          // Message terminé
        }
      }

      // Récupérer le message final pour l'historique
      const finalMessage = await stream.finalMessage();
      history.push({ role: 'assistant', content: finalMessage.content });

      // 📊 SENTINEL - Track coûts par tenant
      if (finalMessage.usage) {
        const tracking = await trackTenantCall(tenantId, finalMessage.model || currentModel || 'sonnet', finalMessage.usage.input_tokens || 0, finalMessage.usage.output_tokens || 0);
        console.log(`[SENTINEL] ${tenantId} - Coût appel: ${tracking.callCost.toFixed(4)}€ | Total: ${tracking.totalCost.toFixed(4)}€`);
      }

      // Si tool_use, exécuter les outils et continuer
      if (finalMessage.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
        yield { type: 'tool_processing', content: `Traitement de ${toolUseBlocks.length} outil(s)...` };

        const toolResults = [];
        for (const toolBlock of toolUseBlocks) {
          const result = await executeTool(toolBlock.name, toolBlock.input, channel);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id,
            content: JSON.stringify(result)
          });
          // Accumulate for quick replies extraction
          allToolResults.push({ name: toolBlock.name, result });
        }

        history.push({ role: 'user', content: toolResults });
        // Si tool_use, passer à Sonnet pour la suite
        currentModel = CLAUDE_SONNET;
        // Continuer la boucle pour la réponse suivante
      } else {
        continueLoop = false;
      }
    }

    // Limiter l'historique
    while (history.length > 30) {
      history.shift();
    }

    const duration = Date.now() - startTime;
    console.log(`[NEXUS CORE] ✅ Streaming terminé en ${duration}ms`);
    console.log(`[NEXUS CORE] ══════════════════════════════════════\n`);

    // Extract contextual quick replies
    const quickReplies = extractQuickReplies(message, fullResponseText, allToolResults);

    yield {
      type: 'done',
      content: fullResponseText,
      conversationId,
      duration,
      quickReplies
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[NEXUS CORE] ❌ Erreur streaming:`, error.message);

    yield {
      type: 'error',
      content: "Désolée, j'ai rencontré un problème technique.",
      error: error.message,
      duration
    };
  }
}

// ============================================
// FONCTIONS EXPOSÉES POUR LES AUTRES MODULES
// ============================================

export {
  // Re-export depuis businessRules.js
  SERVICES,
  TRAVEL_FEES,
  BUSINESS_HOURS,
  BOOKING_RULES,
  findServiceByName,
  getAllServices,
  getServicesByCategory,

  // Note: createReservationUnified déjà exporté via "export async function"

  // Fonctions utilitaires
  clearConversation,
  getConversationHistory,

  // Cache management
  invalidateCache,

  // Tools execution (pour tests)
  executeTool
};

// ============================================
// EXPORTS POUR COMPATIBILITÉ (avec ancien nexusCore)
// ============================================

// États de conversation - compatibilité avec l'ancien système basé machine d'états
// Note: Le nouveau nexusCore utilise Claude avec tools, ces états servent
// uniquement pour les services qui vérifient l'état explicitement
export const CONVERSATION_STATES = Object.freeze({
  ACCUEIL: 'accueil',
  ATTENTE_SERVICE: 'attente_service',
  CLARIFICATION_SERVICE: 'clarification_service',
  ATTENTE_DATE: 'attente_date',
  ATTENTE_HEURE: 'attente_heure',
  CONFIRMATION_CRENEAU: 'confirmation_creneau',
  ATTENTE_LIEU: 'attente_lieu',
  ATTENTE_ADRESSE: 'attente_adresse',
  ATTENTE_NOM: 'attente_nom',
  ATTENTE_TELEPHONE: 'attente_telephone',
  CONFIRMATION: 'confirmation',
  TERMINE: 'termine'
});

// Factory pour créer un contexte de conversation - compatibilité
export function createConversationContext(canal = 'chat') {
  return {
    state: CONVERSATION_STATES.ACCUEIL,
    canal,
    services: [],
    date: null,
    heure: null,
    lieu: null,
    adresseClient: null,
    nomClient: null,
    telephone: null,
    messageHistory: []
  };
}

// Pour les modules qui importaient depuis l'ancien nexusCore
export const HORAIRES = BUSINESS_HOURS;
export const DEPLACEMENT = TRAVEL_FEES;

export default {
  processMessage,
  processMessageStreaming,  // 🚀 Version streaming SSE
  SERVICES,
  TRAVEL_FEES,
  BUSINESS_HOURS,
  BOOKING_RULES,
  SERVICE_OPTIONS,  // 🚦 Flag domicile activé/désactivé
  SALON_INFO,
  clearConversation,
  findServiceByName,
  getAllServices,
  getServicesByCategory,
  invalidateCache,
  // 🔒 Fonction unique de création RDV
  createReservationUnified,
  // Compatibilité avec ancien nexusCore
  CONVERSATION_STATES,
  createConversationContext
};
