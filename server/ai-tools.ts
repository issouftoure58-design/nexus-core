import {
  checkAvailability,
  getServiceDuration,
  createClient,
  findClientByPhone,

  getRendezVousByDate,
  updateRendezVousStatus,
} from "./db-functions";
import { supabase } from "./supabase";
import { sendConfirmationSMS, sendCancellationSMS } from "./sms-service";
import { getDistanceFromSalon } from "./google-maps-service";
import { calculerFraisDepl, calculerPrixTotal } from "./tarification";
// @ts-ignore - JS module without types
import bookingService from "../backend/src/services/bookingService.js";
const {
  SERVICES_LIST,
  SERVICES_AMBIGUS,
  DEPLACEMENT,
  toolGetPrice,
  toolGetDate,
  toolGetAllServices,
  toolCheckAvailability,
  getServiceInfo,
  checkServiceAmbiguity,
  checkStrictAvailability,
  calculateTravelFee
} = bookingService;

// Définition des outils disponibles pour l'IA
export const AI_TOOLS = [
  // ========== OUTILS OBLIGATOIRES - HALIMAH DOIT LES UTILISER ==========
  {
    name: "get_service_price",
    description:
      "⚠️ OBLIGATOIRE : Retourne le prix EXACT d'un service. Tu DOIS utiliser cet outil AVANT de mentionner un prix. Ne devine JAMAIS un prix toi-même.",
    input_schema: {
      type: "object" as const,
      properties: {
        service_name: {
          type: "string",
          description: "Nom du service (ex: 'locks', 'braids', 'soin')",
        },
      },
      required: ["service_name"],
    },
  },
  {
    name: "get_exact_date",
    description:
      "⚠️ OBLIGATOIRE : Retourne la date EXACTE avec jour de la semaine et horaires. Tu DOIS utiliser cet outil pour toute question sur les dates ou disponibilités. Ne devine JAMAIS une date.",
    input_schema: {
      type: "object" as const,
      properties: {
        jour: {
          type: "string",
          description: "Le jour demandé (ex: 'demain', 'samedi', 'lundi prochain', '25 janvier')",
        },
      },
      required: ["jour"],
    },
  },
  {
    name: "get_all_services_prices",
    description:
      "⚠️ OBLIGATOIRE : Liste TOUS les services avec leurs prix EXACTS. Utilise cet outil quand le client demande les tarifs ou la liste des prestations.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  // ========== OUTILS EXISTANTS ==========
  {
    name: "list_services",
    description:
      "Liste tous les services disponibles chez Fatou avec leurs prix et durées. Utilise cet outil quand le client demande les prestations, les tarifs ou ce que Fatou propose.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "check_availability",
    description:
      "Vérifie si un créneau horaire est disponible pour un rendez-vous en tenant compte de la durée du service. Utilise cet outil avant de proposer ou confirmer un créneau au client. IMPORTANT: Toujours préciser le service pour vérifier qu'il n'y a pas de chevauchement avec d'autres RDV.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "La date au format YYYY-MM-DD (ex: 2026-01-20)",
        },
        heure: {
          type: "string",
          description: "L'heure au format HH:MM (ex: 14:00)",
        },
        service: {
          type: "string",
          description: "Le nom du service demandé (ex: Tresses classiques, Locks, etc.) pour calculer la durée",
        },
      },
      required: ["date", "heure", "service"],
    },
  },
  {
    name: "get_available_slots",
    description:
      "Récupère tous les créneaux disponibles pour une date donnée en tenant compte de la durée du service. Utilise cet outil quand le client demande les disponibilités d'un jour. IMPORTANT: Préciser le service pour filtrer les créneaux où le service peut tenir sans chevauchement.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "La date au format YYYY-MM-DD (ex: 2026-01-20)",
        },
        service: {
          type: "string",
          description: "Le nom du service demandé (ex: Tresses classiques, Locks, etc.) pour calculer la durée et filtrer les créneaux",
        },
      },
      required: ["date", "service"],
    },
  },
  {
    name: "create_appointment",
    description:
      "Crée un rendez-vous pour un client à DOMICILE. Utilise cet outil UNIQUEMENT quand tu as collecté TOUTES les informations nécessaires : nom, prénom, téléphone (10 chiffres), adresse du client, service, date et heure. Ne crée jamais de RDV sans avoir vérifié la disponibilité d'abord.",
    input_schema: {
      type: "object" as const,
      properties: {
        nom: {
          type: "string",
          description: "Nom de famille du client",
        },
        prenom: {
          type: "string",
          description: "Prénom du client",
        },
        telephone: {
          type: "string",
          description:
            "Numéro de téléphone à 10 chiffres (ex: 0612345678)",
        },
        email: {
          type: "string",
          description: "Email du client (optionnel)",
        },
        adresse_client: {
          type: "string",
          description: "Adresse complète du client où Fatou se déplacera (ex: 15 rue Victor Hugo, 95100 Argenteuil)",
        },
        service: {
          type: "string",
          description: "Nom du service demandé (ex: Tresses, Locks, etc.)",
        },
        date: {
          type: "string",
          description: "Date du RDV au format YYYY-MM-DD",
        },
        heure: {
          type: "string",
          description: "Heure du RDV au format HH:MM",
        },
        notes: {
          type: "string",
          description: "Notes ou demandes particulières (optionnel)",
        },
        nombre_locks: {
          type: "number",
          description: "Nombre de locks à réparer (obligatoire pour Réparation Locks)",
        },
        duree_minutes: {
          type: "number",
          description: "Durée en minutes si différente du standard. Pour Réparation Locks: nombre_locks × 30",
        },
      },
      required: ["nom", "prenom", "telephone", "adresse_client", "service", "date", "heure"],
    },
  },
  {
    name: "find_appointment",
    description:
      "Recherche un rendez-vous existant par numéro de téléphone OU par nom/prénom. Utilise cet outil quand un client veut annuler, modifier ou vérifier son rendez-vous. Tu peux chercher soit par téléphone, soit par nom.",
    input_schema: {
      type: "object" as const,
      properties: {
        telephone: {
          type: "string",
          description: "Numéro de téléphone du client (10 chiffres) - optionnel si nom fourni",
        },
        nom: {
          type: "string",
          description: "Nom de famille du client - optionnel si téléphone fourni",
        },
        prenom: {
          type: "string",
          description: "Prénom du client - optionnel, aide à préciser la recherche",
        },
        date: {
          type: "string",
          description: "Date du RDV au format YYYY-MM-DD (optionnel)",
        },
      },
      required: [],
    },
  },
  {
    name: "cancel_appointment",
    description:
      "Annule un rendez-vous existant. Le RDV passe au statut 'annule'. Utilise cet outil quand un client demande explicitement d'annuler son rendez-vous. Tu dois d'abord utiliser find_appointment pour trouver le RDV.",
    input_schema: {
      type: "object" as const,
      properties: {
        rdv_id: {
          type: "number",
          description: "L'ID du rendez-vous à annuler (obtenu via find_appointment)",
        },
        raison: {
          type: "string",
          description: "Raison de l'annulation (optionnel)",
        },
      },
      required: ["rdv_id"],
    },
  },
  {
    name: "search_client_by_name",
    description:
      "Recherche un client par son nom et/ou prénom (insensible à la casse). Utilise cet outil DÈS qu'un client mentionne son nom pour vérifier s'il existe déjà dans la base. Si trouvé, utilise ses informations existantes (téléphone) pour ne pas les redemander.",
    input_schema: {
      type: "object" as const,
      properties: {
        nom: {
          type: "string",
          description: "Nom de famille du client (optionnel si prénom fourni)",
        },
        prenom: {
          type: "string",
          description: "Prénom du client (optionnel si nom fourni)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_date_info",
    description:
      "Retourne les informations complètes sur une date : jour de la semaine, si Fatou est disponible, etc. UTILISE CET OUTIL pour connaître le jour exact d'une date. Ne devine JAMAIS le jour de la semaine toi-même.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "La date au format YYYY-MM-DD (ex: 2026-01-20)",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "calculate_trip_cost",
    description:
      "Calcule la distance, le temps de trajet et les frais de déplacement depuis Franconville vers l'adresse du client. UTILISE CET OUTIL dès que le client donne son adresse pour afficher le récapitulatif avec le TOTAL (service + déplacement).",
    input_schema: {
      type: "object" as const,
      properties: {
        adresse_client: {
          type: "string",
          description: "L'adresse complète du client (numéro, rue, code postal, ville). Ex: '15 rue Victor Hugo, 95100 Argenteuil'",
        },
        service: {
          type: "string",
          description: "Le nom du service demandé pour calculer le total (ex: Tresses classiques, Locks, etc.)",
        },
      },
      required: ["adresse_client", "service"],
    },
  },
  {
    name: "send_account_invitation",
    description:
      "Envoie une invitation par SMS au client pour créer son compte fidélité sur le site. Utilise cet outil APRÈS avoir créé un rendez-vous pour inviter le client à créer son compte et accéder à ses avantages (50 points offerts).",
    input_schema: {
      type: "object" as const,
      properties: {
        telephone: {
          type: "string",
          description: "Numéro de téléphone du client (10 chiffres)",
        },
        nom: {
          type: "string",
          description: "Nom du client pour personnaliser le message",
        },
        prenom: {
          type: "string",
          description: "Prénom du client pour personnaliser le message (optionnel)",
        },
      },
      required: ["telephone"],
    },
  },
];

// Parser une date YYYY-MM-DD sans problème de fuseau horaire
function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Noms des jours en français
const JOURS_SEMAINE = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Horaires de disponibilité de Fatou
const HORAIRES: Record<number, { ouverture: string; fermeture: string } | null> = {
  0: null, // Dimanche fermé
  1: { ouverture: "09:00", fermeture: "18:00" }, // Lundi
  2: { ouverture: "09:00", fermeture: "18:00" }, // Mardi
  3: { ouverture: "09:00", fermeture: "18:00" }, // Mercredi
  4: { ouverture: "09:00", fermeture: "13:00" }, // Jeudi
  5: { ouverture: "13:00", fermeture: "18:00" }, // Vendredi
  6: { ouverture: "09:00", fermeture: "18:00" }, // Samedi
};

/**
 * Retourne le jour de la semaine en français pour une date donnée
 * @param dateString - Date au format YYYY-MM-DD
 * @returns Le nom du jour avec majuscule (ex: "Mardi")
 */
function getJourSemaine(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return JOURS_SEMAINE[date.getDay()];
}

/**
 * Parse une date relative en français et retourne la date ISO (YYYY-MM-DD)
 * Supporte: "demain", "samedi", "samedi prochain", "25 janvier", "25/01", etc.
 */
function parseRelativeDate(dateText: string): string | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const text = dateText.toLowerCase().trim();

  // "aujourd'hui"
  if (text === "aujourd'hui" || text === "aujourd hui") {
    return formatDateISO(today);
  }

  // "demain"
  if (text === "demain") {
    const demain = new Date(today);
    demain.setDate(demain.getDate() + 1);
    return formatDateISO(demain);
  }

  // "après-demain"
  if (text === "après-demain" || text === "apres-demain" || text === "après demain" || text === "apres demain") {
    const apresDemain = new Date(today);
    apresDemain.setDate(apresDemain.getDate() + 2);
    return formatDateISO(apresDemain);
  }

  // Jours de la semaine
  const joursMap: Record<string, number> = {
    "dimanche": 0, "lundi": 1, "mardi": 2, "mercredi": 3,
    "jeudi": 4, "vendredi": 5, "samedi": 6
  };

  // "samedi prochain", "lundi prochain", etc.
  const matchProchain = text.match(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*prochain$/);
  if (matchProchain) {
    const jourCible = joursMap[matchProchain[1]];
    const result = getNextDayOfWeek(today, jourCible, true);
    return formatDateISO(result);
  }

  // "samedi", "lundi", etc. (le prochain qui vient)
  const matchJour = text.match(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)$/);
  if (matchJour) {
    const jourCible = joursMap[matchJour[1]];
    const result = getNextDayOfWeek(today, jourCible, false);
    return formatDateISO(result);
  }

  // "25 janvier", "3 février", etc.
  const moisMap: Record<string, number> = {
    "janvier": 0, "février": 1, "fevrier": 1, "mars": 2, "avril": 3,
    "mai": 4, "juin": 5, "juillet": 6, "août": 7, "aout": 7,
    "septembre": 8, "octobre": 9, "novembre": 10, "décembre": 11, "decembre": 11
  };

  const matchDateMois = text.match(/^(\d{1,2})\s*(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)$/);
  if (matchDateMois) {
    const jour = parseInt(matchDateMois[1], 10);
    const mois = moisMap[matchDateMois[2]];
    let annee = now.getFullYear();

    // Si la date est passée cette année, prendre l'année prochaine
    const dateCandidate = new Date(annee, mois, jour);
    if (dateCandidate < today) {
      annee++;
    }

    return formatDateISO(new Date(annee, mois, jour));
  }

  // "25/01" ou "25-01"
  const matchDateSlash = text.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (matchDateSlash) {
    const jour = parseInt(matchDateSlash[1], 10);
    const mois = parseInt(matchDateSlash[2], 10) - 1;
    let annee = now.getFullYear();

    const dateCandidate = new Date(annee, mois, jour);
    if (dateCandidate < today) {
      annee++;
    }

    return formatDateISO(new Date(annee, mois, jour));
  }

  // "dans X jours"
  const matchDansJours = text.match(/^dans\s+(\d+)\s*jours?$/);
  if (matchDansJours) {
    const nbJours = parseInt(matchDansJours[1], 10);
    const result = new Date(today);
    result.setDate(result.getDate() + nbJours);
    return formatDateISO(result);
  }

  // "la semaine prochaine" -> lundi prochain
  if (text === "la semaine prochaine" || text === "semaine prochaine") {
    const result = getNextDayOfWeek(today, 1, true); // Lundi prochain
    return formatDateISO(result);
  }

  return null;
}

/**
 * Retourne le prochain jour de la semaine donné
 * @param fromDate - Date de départ
 * @param targetDay - Jour cible (0=dimanche, 6=samedi)
 * @param forceNextWeek - Si true, force la semaine prochaine même si aujourd'hui est le jour
 */
function getNextDayOfWeek(fromDate: Date, targetDay: number, forceNextWeek: boolean): Date {
  const result = new Date(fromDate);
  const currentDay = fromDate.getDay();

  let daysToAdd = targetDay - currentDay;

  if (daysToAdd < 0 || (daysToAdd === 0 && forceNextWeek)) {
    daysToAdd += 7;
  }

  if (daysToAdd === 0) {
    daysToAdd = 7; // Si c'est aujourd'hui, on prend la semaine prochaine
  }

  result.setDate(result.getDate() + daysToAdd);
  return result;
}

/**
 * Formate une date en ISO YYYY-MM-DD
 */
function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Fonction pour obtenir les infos complètes d'une date
function getDateInfoHelper(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  const dayName = JOURS_SEMAINE[dayOfWeek];
  const monthName = MOIS[month - 1];

  // Calculer la différence avec aujourd'hui
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(year, month - 1, day);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate.getTime() - today.getTime();
  const daysFromToday = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // Vérifier si Fatou est disponible ce jour
  const horaires = HORAIRES[dayOfWeek];
  const isOpen = horaires !== null;

  return {
    date: dateStr,
    dayOfWeek,
    dayName,
    day,
    month,
    monthName,
    year,
    isToday: daysFromToday === 0,
    isTomorrow: daysFromToday === 1,
    isPast: daysFromToday < 0,
    daysFromToday,
    isOpen,
    horaires: horaires ? `${horaires.ouverture} - ${horaires.fermeture}` : 'Fermé',
    formatted: `${dayName} ${day} ${monthName} ${year}`,
  };
}

// Générer les créneaux horaires pour une journée
function generateTimeSlots(
  ouverture: string,
  fermeture: string,
  interval: number = 60
): string[] {
  const slots: string[] = [];
  const [startHour, startMin] = ouverture.split(":").map(Number);
  const [endHour, endMin] = fermeture.split(":").map(Number);

  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  while (currentMinutes < endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const mins = currentMinutes % 60;
    slots.push(`${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`);
    currentMinutes += interval;
  }

  return slots;
}

// Services par défaut - VRAIS TARIFS FAT'S HAIR-AFRO (prix en centimes)
// ⚠️ AVEC RÈGLES DE BLOCAGE JOURNÉE ENTIÈRE
// Source: bookingService.js SERVICES_LIST
const DEFAULT_SERVICES = [
  // === LOCKS - CRÉATIONS (JOURNÉE ENTIÈRE) ===
  { nom: "Création crochet locks", description: "Création de locks au crochet - JOURNÉE ENTIÈRE", duree: 480, prix: 20000, blocksFullDay: true, blocksDays: 1 },
  { nom: "Création microlocks crochet", description: "Microlocks au crochet - 2 JOURS CONSÉCUTIFS", duree: 960, prix: 30000, blocksFullDay: true, blocksDays: 2, prixVariable: true },
  { nom: "Création microlocks twist", description: "Microlocks twist - JOURNÉE ENTIÈRE", duree: 480, prix: 15000, blocksFullDay: true, blocksDays: 1, prixVariable: true },
  // === LOCKS - ENTRETIEN ===
  { nom: "Reprise racines locks", description: "Entretien et reprise des racines", duree: 120, prix: 5000 },
  { nom: "Reprise racines micro-locks", description: "Reprise racines micro-locks", duree: 240, prix: 10000 },
  { nom: "Décapage de locks", description: "Nettoyage en profondeur des locks", duree: 60, prix: 3500 },
  // === TRESSES ===
  { nom: "Braids", description: "Tresses avec ou sans rajouts", duree: 300, prix: 6000, prixVariable: true },
  { nom: "Nattes collées sans rajout", description: "Nattes plaquées naturelles", duree: 60, prix: 2000, prixVariable: true },
  { nom: "Nattes collées avec rajout", description: "Nattes plaquées avec extensions", duree: 120, prix: 4000, prixVariable: true },
  // === SOINS ===
  { nom: "Soin complet", description: "Soin profond et hydratation", duree: 60, prix: 5000 },
  { nom: "Soin hydratant", description: "Hydratation cheveux afro", duree: 60, prix: 4000 },
  { nom: "Shampoing", description: "Shampoing et démêlage", duree: 30, prix: 1000 },
  // === COLORATION & BRUSHING ===
  { nom: "Brushing cheveux afro", description: "Brushing adapté aux cheveux crépus", duree: 60, prix: 2000 },
  { nom: "Teinture sans ammoniaque", description: "Coloration douce", duree: 40, prix: 4000 },
  { nom: "Décoloration", description: "Décoloration cheveux", duree: 10, prix: 2000 },
];

// Traitement des appels d'outils
export async function handleToolCall(
  toolName: string,
  toolInput: Record<string, any>
): Promise<string> {
  try {
    switch (toolName) {
      // ========== NOUVEAUX OUTILS OBLIGATOIRES ==========
      case "get_service_price": {
        const { service_name } = toolInput;
        const result = toolGetPrice(service_name);
        return JSON.stringify(result);
      }

      case "get_exact_date": {
        const { jour } = toolInput;
        const result = toolGetDate(jour);
        return JSON.stringify(result);
      }

      case "get_all_services_prices": {
        const result = toolGetAllServices();
        return JSON.stringify(result);
      }

      // ========== OUTILS EXISTANTS ==========
      case "list_services": {
        // Utilise les services CENTRALISÉS depuis bookingService.js (vrais tarifs Fatou)
        const formattedservices = SERVICES_LIST.map((s: any) => ({
          nom: s.nom,
          description: s.description || s.nom,
          duree: s.dureeTexte || `${s.duree} minutes`,
          prix: s.prixTexte || `${s.prix}€`,
        }));

        return JSON.stringify({
          success: true,
          services: formattedservices,
          message: `${formattedservices.length} services disponibles`,
        });
      }

      case "check_availability": {
        const { date, heure, service } = toolInput;

        // Vérifier que la date n'est pas dans le passé
        const rdvDate = new Date(`${date}T${heure}`);
        if (rdvDate < new Date()) {
          return JSON.stringify({
            success: false,
            available: false,
            message: "Cette date est dans le passé",
          });
        }

        // Vérifier le jour de la semaine
        const dayOfWeek = parseDateLocal(date).getDay();
        const horaires = HORAIRES[dayOfWeek];

        if (!horaires) {
          return JSON.stringify({
            success: false,
            available: false,
            message: "Désolé, nous sommes fermés le dimanche. Pouvez-vous choisir un autre jour ?",
          });
        }

        // ⚠️ VÉRIFIER SI SERVICE JOURNÉE ENTIÈRE
        const serviceInfo = getServiceInfo(service);

        // Si c'est un service journée entière et l'heure n'est pas 9h
        if (serviceInfo?.blocksFullDay && heure !== "09:00") {
          const blocksDays = serviceInfo.blocksDays || 1;
          const message = blocksDays === 2
            ? `Les ${serviceInfo.nom} nécessitent 2 JOURS CONSÉCUTIFS. Seul créneau : 9h00 les deux jours.`
            : `La ${serviceInfo.nom} prend la JOURNÉE ENTIÈRE. Seul créneau disponible : 9h00.`;

          return JSON.stringify({
            success: false,
            available: false,
            blocksFullDay: true,
            blocksDays,
            message,
            correctSlot: "09:00"
          });
        }

        // Vérifier si l'heure est dans les horaires d'ouverture
        if (heure < horaires.ouverture || heure >= horaires.fermeture) {
          return JSON.stringify({
            success: false,
            available: false,
            message: `Fatou est disponible de ${horaires.ouverture} à ${horaires.fermeture} ce jour-là`,
          });
        }

        // Obtenir la durée du service demandé (utiliser la vraie durée du service)
        const dureeDemandee = serviceInfo?.duree || getServiceDuration(service || "");

        // ⚠️ Si service journée entière : vérifier qu'il n'y a AUCUN RDV ce jour
        if (serviceInfo?.blocksFullDay) {
          const existingRdvs = await getRendezVousByDate(date);
          const activeRdvs = existingRdvs.filter((r: any) => r.statut !== 'annule');

          if (activeRdvs.length > 0) {
            return JSON.stringify({
              success: false,
              available: false,
              blocksFullDay: true,
              message: `❌ Le ${date} est déjà occupé par un autre RDV. La ${serviceInfo.nom} nécessite la journée entière. Choisissez un autre jour.`,
              existingRdv: {
                heure: activeRdvs[0].heure,
                service: activeRdvs[0].service_nom
              }
            });
          }

          // Pour microlocks crochet (2 jours), vérifier aussi le lendemain
          if (serviceInfo.blocksDays === 2) {
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayISO = nextDay.toISOString().split('T')[0];

            // Vérifier que le lendemain n'est pas un dimanche
            if (nextDay.getDay() === 0) {
              return JSON.stringify({
                success: false,
                available: false,
                blocksFullDay: true,
                blocksDays: 2,
                message: `❌ Les microlocks crochet nécessitent 2 jours consécutifs. Le lendemain du ${date} est un dimanche (fermé). Choisissez un autre jour.`
              });
            }

            const nextDayRdvs = await getRendezVousByDate(nextDayISO);
            const activeNextDayRdvs = nextDayRdvs.filter((r: any) => r.statut !== 'annule');

            if (activeNextDayRdvs.length > 0) {
              return JSON.stringify({
                success: false,
                available: false,
                blocksFullDay: true,
                blocksDays: 2,
                message: `❌ Les microlocks crochet nécessitent 2 jours consécutifs. Le lendemain (${nextDayISO}) est déjà pris. Choisissez d'autres dates.`
              });
            }
          }
        }

        // Vérifier que le RDV ne dépasse pas l'heure de fermeture
        const [h, m] = heure.split(":").map(Number);
        const heureFinMinutes = h * 60 + m + dureeDemandee;
        const [fh, fm] = horaires.fermeture.split(":").map(Number);
        const fermetureMinutes = fh * 60 + fm;

        if (heureFinMinutes > fermetureMinutes) {
          const heureFinStr = `${Math.floor(heureFinMinutes / 60).toString().padStart(2, "0")}:${(heureFinMinutes % 60).toString().padStart(2, "0")}`;
          return JSON.stringify({
            success: false,
            available: false,
            message: `Ce service dure ${dureeDemandee} minutes et se terminerait à ${heureFinStr}, après la fermeture (${horaires.fermeture}). Veuillez choisir un créneau plus tôt.`,
          });
        }

        // Vérifier la disponibilité en base (avec chevauchements)
        const result = await checkAvailability(date, heure, dureeDemandee);

        return JSON.stringify({
          success: true,
          available: result.available,
          date,
          heure,
          service,
          duree: dureeDemandee,
          message: result.message,
          conflictWith: result.conflictWith,
        });
      }

      case "get_available_slots": {
        const { date, service } = toolInput;

        // ⚠️ VÉRIFICATION STRICTE avec règles métier
        // - Journée entière pour créations locks
        // - 2 jours pour microlocks crochet
        // - Terme "locks" seul = demander précision

        // Obtenir les infos complètes de la date
        const dateInfo = getDateInfoHelper(date);
        const horaires = HORAIRES[dateInfo.dayOfWeek];

        if (!horaires) {
          return JSON.stringify({
            success: false,
            slots: [],
            date,
            dayName: dateInfo.dayName,
            formatted: dateInfo.formatted,
            message: `Désolé, nous sommes fermés le ${dateInfo.dayName}. Pouvez-vous choisir un autre jour ?`,
          });
        }

        // Utiliser checkStrictAvailability pour les règles métier
        const strictResult = await checkStrictAvailability(date, service);

        // Si le service nécessite clarification (ex: "locks" seul)
        if (strictResult.needsClarification) {
          return JSON.stringify({
            success: false,
            needsClarification: true,
            slots: [],
            date,
            dayName: dateInfo.dayName,
            formatted: dateInfo.formatted,
            message: strictResult.message,
            options: strictResult.options
          });
        }

        // Si c'est un service journée entière
        if (strictResult.blocksFullDay) {
          return JSON.stringify({
            success: strictResult.available,
            blocksFullDay: true,
            blocksDays: strictResult.blocksDays,
            date,
            dayName: dateInfo.dayName,
            formatted: dateInfo.formatted,
            service,
            slots: strictResult.slots,
            dates: strictResult.dates, // Pour les 2 jours consécutifs
            message: strictResult.message
          });
        }

        // Service normal : filtrer les créneaux passés si c'est aujourd'hui
        const now = new Date();
        const todayYear = now.getFullYear();
        const todayMonth = String(now.getMonth() + 1).padStart(2, "0");
        const todayDay = String(now.getDate()).padStart(2, "0");
        const today = `${todayYear}-${todayMonth}-${todayDay}`;
        const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

        const filteredSlots =
          date === today
            ? strictResult.slots.filter((slot: string) => slot > currentTime)
            : strictResult.slots;

        return JSON.stringify({
          success: strictResult.available && filteredSlots.length > 0,
          date,
          dayName: dateInfo.dayName,
          formatted: dateInfo.formatted,
          service,
          horaires: `${horaires.ouverture} - ${horaires.fermeture}`,
          slots: filteredSlots,
          count: filteredSlots.length,
          message: strictResult.message
        });
      }

      case "create_appointment": {
        const { nom, prenom, telephone, email, adresse_client, service, date, heure, notes, created_via, nombre_locks, duree_minutes } =
          toolInput;

        // === VALIDATION ANTI-PLACEHOLDER ===
        const PLACEHOLDER_VALUES = ['-', '--', 'n/a', 'na', 'inconnu', 'unknown', 'none', 'null', 'undefined', 'x', 'xx', 'xxx', '.', '..', 'test'];
        const isPlaceholder = (val: string) => !val || PLACEHOLDER_VALUES.includes(val.trim().toLowerCase()) || val.trim().length < 2;

        // Valider nom (min 2 caractères, pas un placeholder)
        if (isPlaceholder(nom)) {
          return JSON.stringify({
            success: false,
            message: "Le nom de famille du client est obligatoire. Demandez-le avant de créer le rendez-vous.",
          });
        }

        // Valider prénom (min 2 caractères, pas un placeholder)
        if (isPlaceholder(prenom)) {
          return JSON.stringify({
            success: false,
            message: "Le prénom du client est obligatoire. Demandez-le avant de créer le rendez-vous.",
          });
        }

        // Validation du téléphone
        const cleanPhone = telephone?.replace(/[\s\-\.]/g, "") || "";
        if (isPlaceholder(telephone) || !/^0[1-9][0-9]{8}$/.test(cleanPhone)) {
          return JSON.stringify({
            success: false,
            message:
              "Le numéro de téléphone n'est pas valide. Il doit contenir 10 chiffres (ex: 0612345678). Demandez-le au client.",
          });
        }

        // Valider adresse (pour service à domicile)
        if (isPlaceholder(adresse_client)) {
          return JSON.stringify({
            success: false,
            message: "L'adresse du client est obligatoire pour un service à domicile. Demandez-la avant de créer le rendez-vous.",
          });
        }

        // Valider service
        if (isPlaceholder(service)) {
          return JSON.stringify({
            success: false,
            message: "Le nom du service est obligatoire. Demandez au client quel service il souhaite.",
          });
        }

        try {
          // Utiliser createReservationUnified (même logique que tous les autres canaux)
          const { createReservationUnified } = await import(
            "../backend/src/core/unified/nexusCore.js"
          );

          const result = await createReservationUnified({
            service_name: service,
            date,
            heure,
            client_nom: `${prenom} ${nom}`,
            client_prenom: prenom,
            client_telephone: cleanPhone,
            client_email: email,
            lieu: adresse_client ? 'domicile' : 'chez_fatou',
            adresse: adresse_client,
            notes: notes || `[Via chat web]`,
            ...(nombre_locks ? { nombre_locks: Number(nombre_locks), duree_minutes: Number(duree_minutes) || Number(nombre_locks) * 30 } : {}),
          }, 'web', { sendSMS: true });

          if (!result.success) {
            return JSON.stringify({
              success: false,
              message: result.error || result.message || "Impossible de créer le rendez-vous.",
              options: result.options,
            });
          }

          return JSON.stringify({
            success: true,
            message: "Rendez-vous confirmé avec succès",
            rdv: {
              id: result.reservationId,
              client: `${prenom} ${nom}`,
              telephone: cleanPhone,
              service,
              date,
              heure,
              adresse: adresse_client,
              ...(result.recap || {}),
              statut: "Confirmé",
            },
          });
        } catch (rdvError: any) {
          console.error("[AI-TOOLS] Erreur création RDV:", rdvError);
          return JSON.stringify({
            success: false,
            message: `Erreur lors de la création du rendez-vous: ${rdvError.message}`,
          });
        }
      }

      case "find_appointment": {
        const { telephone, nom, prenom, date } = toolInput;

        // Vérifier qu'on a au moins un critère de recherche
        if (!telephone && !nom && !prenom) {
          return JSON.stringify({
            success: false,
            message: "Veuillez fournir un numéro de téléphone ou un nom pour rechercher le rendez-vous.",
          });
        }

        let clients: any[] = [];

        // Recherche par téléphone si fourni
        if (telephone) {
          const cleanPhone = telephone.replace(/\s/g, "");
          const client = await findClientByPhone(cleanPhone);
          if (client) {
            clients = [client];
          }
        }
        // Sinon recherche par nom/prénom
        else if (nom || prenom) {
          let query = supabase.from("clients").select("*");

          if (nom && prenom) {
            query = query
              .ilike("nom", `%${nom}%`)
              .ilike("prenom", `%${prenom}%`);
          } else if (nom) {
            query = query.or(`nom.ilike.%${nom}%,prenom.ilike.%${nom}%`);
          } else if (prenom) {
            query = query.or(`nom.ilike.%${prenom}%,prenom.ilike.%${prenom}%`);
          }

          const { data, error } = await query.limit(10);
          if (error) {
            throw new Error(`Erreur recherche client: ${error.message}`);
          }
          clients = data || [];
        }

        // Aucun client trouvé
        if (clients.length === 0) {
          return JSON.stringify({
            success: false,
            message: telephone
              ? "Aucun client trouvé avec ce numéro de téléphone."
              : "Aucun client trouvé avec ce nom. Pouvez-vous me donner votre numéro de téléphone ?",
          });
        }

        // Plusieurs clients trouvés avec le même nom
        if (clients.length > 1) {
          const clientsList = clients.map((c: any) => ({
            id: c.id,
            nom: c.nom,
            prenom: c.prenom,
            telephone: c.telephone ? `***${c.telephone.slice(-4)}` : null,
          }));

          return JSON.stringify({
            success: false,
            multipleClients: true,
            count: clients.length,
            clients: clientsList,
            message: `J'ai trouvé ${clients.length} clients avec ce nom. Pouvez-vous me donner votre numéro de téléphone ou la date de votre rendez-vous pour vous identifier ?`,
          });
        }

        // Un seul client trouvé - récupérer ses RDV
        const client = clients[0];

        let query = supabase
          .from("reservations")
          .select("*")
          .eq("client_id", client.id)
          .neq("statut", "annule")
          .order("date", { ascending: true })
          .order("heure", { ascending: true });

        if (date) {
          query = query.eq("date", date);
        }

        const { data: rdvs, error } = await query;

        if (error) {
          throw new Error(`Erreur recherche RDV: ${error.message}`);
        }

        if (!rdvs || rdvs.length === 0) {
          return JSON.stringify({
            success: false,
            client: {
              nom: client.nom,
              prenom: client.prenom,
              telephone: client.telephone,
            },
            message: date
              ? `Aucun rendez-vous trouvé pour ${client.prenom} ${client.nom} à la date du ${date}.`
              : `Aucun rendez-vous actif trouvé pour ${client.prenom} ${client.nom}.`,
          });
        }

        // Ajouter les infos de date à chaque RDV
        const formattedRdvs = rdvs.map((rdv: any) => {
          const dateInfo = getDateInfoHelper(rdv.date);
          return {
            id: rdv.id,
            date: rdv.date,
            dayName: dateInfo.dayName,
            formatted: dateInfo.formatted,
            heure: rdv.heure,
            service: rdv.service_nom,
            statut: rdv.statut,
          };
        });

        return JSON.stringify({
          success: true,
          client: {
            id: client.id,
            nom: client.nom,
            prenom: client.prenom,
            telephone: client.telephone,
          },
          rdvs: formattedRdvs,
          count: formattedRdvs.length,
          message: `${formattedRdvs.length} rendez-vous trouvé(s) pour ${client.prenom} ${client.nom}`,
        });
      }

      case "cancel_appointment": {
        const { rdv_id, raison } = toolInput;

        // Vérifier que le RDV existe
        const { data: rdv, error: rdvError } = await supabase
          .from("reservations")
          .select("*")
          .eq("id", rdv_id)
          .maybeSingle();

        if (rdvError) {
          throw new Error(`Erreur recherche RDV: ${rdvError.message}`);
        }

        if (!rdv) {
          return JSON.stringify({
            success: false,
            message: "Rendez-vous non trouvé.",
          });
        }

        if (rdv.statut === "annule") {
          return JSON.stringify({
            success: false,
            message: "Ce rendez-vous est déjà annulé.",
          });
        }

        // Récupérer le client séparément (avec téléphone pour SMS)
        let clientName = "Client";
        let clientData: { nom: string; prenom: string; telephone: string } | null = null;
        if (rdv.client_id) {
          const { data } = await supabase
            .from("clients")
            .select("nom, prenom, telephone")
            .eq("id", rdv.client_id)
            .maybeSingle();
          if (data) {
            clientData = data;
            clientName = `${data.prenom} ${data.nom}`;
          }
        }

        // Annuler le RDV
        const notesAnnulation = raison
          ? `[ANNULÉ] ${raison}${rdv.notes ? ` | ${rdv.notes}` : ""}`
          : rdv.notes;

        await updateRendezVousStatus(rdv_id, "annule");

        // Mettre à jour les notes si raison fournie
        if (raison) {
          await supabase
            .from("reservations")
            .update({ notes: notesAnnulation })
            .eq("id", rdv_id);
        }

        // Envoyer SMS d'annulation (async, ne bloque pas la réponse)
        if (clientData?.telephone) {
          sendCancellationSMS(
            clientData.telephone,
            clientData.nom,
            clientData.prenom,
            rdv.service_nom,
            rdv.date,
            rdv.heure
          )
            .then((sent) => {
              if (sent) console.log(`[SMS] Annulation envoyée à ${clientData!.telephone}`);
            })
            .catch((err) => console.error("[SMS] Erreur envoi annulation:", err));
        }

        return JSON.stringify({
          success: true,
          message: "Rendez-vous annulé avec succès",
          rdv: {
            id: rdv.id,
            client: clientName,
            service: rdv.service_nom,
            date: rdv.date,
            heure: rdv.heure,
            statut: "Annulé",
          },
        });
      }

      case "search_client_by_name": {
        const { nom, prenom } = toolInput;

        if (!nom && !prenom) {
          return JSON.stringify({
            success: false,
            message: "Veuillez fournir au moins un nom ou un prénom pour la recherche.",
          });
        }

        // Construire la requête de recherche (insensible à la casse)
        let query = supabase.from("clients").select("*");

        if (nom && prenom) {
          // Recherche par nom ET prénom
          query = query
            .ilike("nom", `%${nom}%`)
            .ilike("prenom", `%${prenom}%`);
        } else if (nom) {
          // Recherche par nom seulement (peut être nom ou prénom)
          query = query.or(`nom.ilike.%${nom}%,prenom.ilike.%${nom}%`);
        } else if (prenom) {
          // Recherche par prénom seulement (peut être nom ou prénom)
          query = query.or(`nom.ilike.%${prenom}%,prenom.ilike.%${prenom}%`);
        }

        const { data: clients, error } = await query.limit(10);

        if (error) {
          throw new Error(`Erreur recherche client: ${error.message}`);
        }

        if (!clients || clients.length === 0) {
          return JSON.stringify({
            success: false,
            found: false,
            message: `Aucun client trouvé avec ce nom. C'est peut-être un nouveau client !`,
            searchTerms: { nom, prenom },
          });
        }

        // Récupérer le dernier RDV de chaque client trouvé
        const clientsWithHistory = await Promise.all(
          clients.map(async (client: any) => {
            const { data: lastRdv } = await supabase
              .from("reservations")
              .select("date, heure, service_nom, statut")
              .eq("client_id", client.id)
              .order("date", { ascending: false })
              .order("heure", { ascending: false })
              .limit(1)
              .maybeSingle();

            return {
              id: client.id,
              nom: client.nom,
              prenom: client.prenom,
              telephone: client.telephone,
              email: client.email,
              dernierRdv: lastRdv
                ? {
                    date: lastRdv.date,
                    heure: lastRdv.heure,
                    service: lastRdv.service_nom,
                    statut: lastRdv.statut,
                  }
                : null,
            };
          })
        );

        return JSON.stringify({
          success: true,
          found: true,
          count: clientsWithHistory.length,
          clients: clientsWithHistory,
          message:
            clientsWithHistory.length === 1
              ? `Client trouvé : ${clientsWithHistory[0].prenom} ${clientsWithHistory[0].nom}`
              : `${clientsWithHistory.length} clients trouvés avec ce nom`,
        });
      }

      case "get_date_info": {
        let { date } = toolInput;

        // Si la date est en format relatif, la convertir
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const parsedDate = parseRelativeDate(date);
          if (!parsedDate) {
            return JSON.stringify({
              success: false,
              message: `Je n'ai pas compris la date "${date}". Pouvez-vous préciser (ex: "samedi", "demain", "25 janvier") ?`,
            });
          }
          date = parsedDate;
        }

        if (!date) {
          return JSON.stringify({
            success: false,
            message: "Veuillez préciser une date.",
          });
        }

        const dateInfo = getDateInfoHelper(date);

        return JSON.stringify({
          success: true,
          ...dateInfo,
          message: dateInfo.isOpen
            ? `Le ${dateInfo.formatted} est un ${dateInfo.dayName}, nous sommes ouverts de ${dateInfo.horaires}.`
            : `Le ${dateInfo.formatted} est un ${dateInfo.dayName}, nous sommes fermés ce jour-là.`,
        });
      }

      case "calculate_trip_cost": {
        const { adresse_client, service } = toolInput;

        if (!adresse_client) {
          return JSON.stringify({
            success: false,
            message: "Adresse du client requise pour calculer les frais de déplacement.",
          });
        }

        try {
          // Calculer la distance depuis Franconville
          const distanceResult = await getDistanceFromSalon(adresse_client);

          // ⚠️ CALCUL FRAIS OFFICIELS : 10€ forfait (0-8km), +1,10€/km au-delà
          const fraisResult = calculateTravelFee(distanceResult.distance_km);

          // Récupérer le prix du service via getServiceInfo
          const serviceInfo = getServiceInfo(service);
          let prixService = 0;
          let prixTexte = "";

          if (serviceInfo && !serviceInfo.ambigu) {
            prixService = serviceInfo.prix;
            prixTexte = serviceInfo.prixVariable ? `à partir de ${prixService}€` : `${prixService}€`;
          } else {
            // Fallback : chercher dans la base
            const { data: services } = await supabase
              .from("services")
              .select("prix, nom, price_is_minimum")
              .ilike("nom", `%${service}%`)
              .limit(1);

            if (services && services.length > 0) {
              prixService = services[0].prix / 100;
              prixTexte = services[0].price_is_minimum ? `à partir de ${prixService}€` : `${prixService}€`;
            } else {
              prixService = 50; // Valeur par défaut
              prixTexte = `${prixService}€`;
            }
          }

          const total = Math.round((prixService + fraisResult.frais) * 100) / 100;

          return JSON.stringify({
            success: true,
            adresse_client: distanceResult.destination,
            distance_km: distanceResult.distance_km,
            distance_text: distanceResult.distance_text,
            duree_trajet_minutes: distanceResult.duree_minutes,
            duree_trajet_text: distanceResult.duree_text,
            service: service,
            prix_service: prixService,
            prix_service_texte: prixTexte,
            frais_deplacement: fraisResult.frais,
            frais_detail: fraisResult.detail,
            total: total,
            message: `📍 Distance : ${distanceResult.distance_text} (${distanceResult.duree_text} de trajet)\n\n💇‍♀️ ${service} : ${prixTexte}\n🚗 Déplacement : ${fraisResult.detail}\n────────────────\n💰 TOTAL : ${total}€`,
          });
        } catch (error: any) {
          console.error("Erreur calcul trajet:", error);
          return JSON.stringify({
            success: false,
            message: `Je n'arrive pas à calculer la distance exactement pour le moment.

Deux options :
1. Vous me rappelez dans 5 min et je réessaye
2. Ou confirmez le RDV chez vous, je calculerai les frais exacts et vous préviendrai avant de venir

📋 Barème frais de déplacement :
• 0-8 km : 10€ forfait
• Au-delà : 10€ + 1,10€/km supplémentaire

Que préférez-vous ?`,
          });
        }
      }

      case "send_account_invitation": {
        const { telephone, nom, prenom } = toolInput;

        if (!telephone) {
          return JSON.stringify({
            success: false,
            message: "Le numéro de téléphone est requis pour envoyer l'invitation.",
          });
        }

        const cleanPhone = telephone.replace(/\s/g, "");

        try {
          // Vérifier si le client existe et n'a pas déjà de compte
          const { data: client } = await supabase
            .from("clients")
            .select("id, nom, prenom, telephone, email, password_hash")
            .eq("telephone", cleanPhone)
            .single();

          if (!client) {
            return JSON.stringify({
              success: false,
              message: "Client non trouvé avec ce numéro de téléphone.",
            });
          }

          // Si le client a déjà un compte
          if (client.password_hash) {
            return JSON.stringify({
              success: true,
              hasAccount: true,
              message: "Ce client a déjà un compte fidélité ! Il peut se connecter sur le site avec son email pour voir ses points et rendez-vous.",
            });
          }

          // Envoyer l'invitation via l'API
          const response = await fetch("http://localhost:5000/api/client/auth/send-invitation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: client.id,
              telephone: cleanPhone,
            }),
          });

          const result = await response.json();

          if (result.success) {
            return JSON.stringify({
              success: true,
              message: `J'ai envoyé une invitation par SMS à ${prenom || nom || "votre client"} pour créer son compte fidélité. En s'inscrivant avec le même numéro de téléphone, ses réservations seront automatiquement liées et il recevra 50 points de bienvenue !`,
              sentTo: result.sentTo,
            });
          } else {
            throw new Error(result.error || "Erreur envoi invitation");
          }
        } catch (error: any) {
          console.error("[AI-TOOLS] Erreur send_account_invitation:", error);
          return JSON.stringify({
            success: false,
            message: "Je n'ai pas pu envoyer l'invitation pour le moment. Vous pouvez suggérer au client de se rendre sur fatshairafro.fr pour créer son compte.",
          });
        }
      }

      default:
        return JSON.stringify({
          success: false,
          message: `Outil inconnu: ${toolName}`,
        });
    }
  } catch (error: any) {
    console.error(`Erreur outil ${toolName}:`, error);
    return JSON.stringify({
      success: false,
      message: `Erreur lors de l'exécution: ${error.message}`,
    });
  }
}
