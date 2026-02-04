/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║                                                                   ║
 * ║   VALIDATEUR CENTRAL DE RESERVATION                               ║
 * ║                                                                   ║
 * ║   Ce fichier est le GARDIEN des regles metier.                    ║
 * ║   AUCUNE reservation ne peut etre creee sans passer par ici.      ║
 * ║                                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import {
  SERVICES,
  TRAVEL_FEES,
  BUSINESS_HOURS,
  BOOKING_RULES,
  AMBIGUOUS_TERMS,
  validateBooking,
  findServiceByName,
  checkAmbiguousTerm,
} from '../config/businessRules.js';

/**
 * Ajoute des jours a une date
 */
function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T12:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Verifie si une date est un dimanche
 */
function isSunday(dateStr) {
  return new Date(dateStr + 'T12:00:00').getDay() === 0;
}

/**
 * Obtient le prochain jour ouvrable (saute le dimanche)
 * @param {string} dateStr - Date au format YYYY-MM-DD
 * @returns {string} Date du prochain jour ouvrable
 */
function getNextBusinessDay(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  date.setDate(date.getDate() + 1);

  // Si c'est dimanche (jour 0), passer au lundi
  if (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }

  return date.toISOString().split('T')[0];
}

/**
 * Obtient N jours ouvrables consécutifs à partir d'une date
 * @param {string} startDate - Date de départ (YYYY-MM-DD)
 * @param {number} count - Nombre de jours ouvrables nécessaires
 * @returns {string[]} Tableau des dates ouvrables consécutives
 */
function getConsecutiveBusinessDays(startDate, count) {
  const dates = [startDate];
  let currentDate = startDate;

  while (dates.length < count) {
    currentDate = getNextBusinessDay(currentDate);
    dates.push(currentDate);
  }

  return dates;
}

/**
 * Vérifie si une date de départ permet d'avoir N jours ouvrables consécutifs libres
 * @param {string} startDate - Date de départ
 * @param {number} daysNeeded - Nombre de jours nécessaires
 * @param {Array} existingBookings - Réservations existantes
 * @returns {{ valid: boolean, dates: string[], blockedDate?: string, reason?: string }}
 */
function checkConsecutiveBusinessDaysAvailable(startDate, daysNeeded, existingBookings = []) {
  // Vérifier que la date de départ n'est pas un dimanche
  if (isSunday(startDate)) {
    return {
      valid: false,
      dates: [],
      reason: `Le ${startDate} est un dimanche (fermé).`
    };
  }

  // Obtenir les jours ouvrables consécutifs
  const businessDays = getConsecutiveBusinessDays(startDate, daysNeeded);

  // Vérifier que chaque jour est libre
  for (const date of businessDays) {
    const bookingsOnDate = existingBookings.filter(b =>
      b.date === date && b.statut !== 'annule'
    );

    if (bookingsOnDate.length > 0) {
      return {
        valid: false,
        dates: businessDays,
        blockedDate: date,
        reason: `Le ${date} est déjà occupé.`
      };
    }
  }

  return {
    valid: true,
    dates: businessDays
  };
}

/**
 * Valide une reservation AVANT creation
 * @param {Object} bookingData - Donnees de la reservation
 * @param {Array} existingBookings - Reservations existantes pour conflit
 * @returns {{ valid: boolean, errors: string[], warnings: string[], service: Object }}
 */
export async function validateBeforeCreate(bookingData, existingBookings = [], resolvedService = null) {
  const errors = [];
  const warnings = [];

  // 1. Verifier si le terme est ambigu
  const ambiguity = checkAmbiguousTerm(bookingData.serviceName || bookingData.service);
  if (ambiguity) {
    return {
      valid: false,
      needsClarification: true,
      message: ambiguity.message,
      options: ambiguity.options,
      errors: [`Terme ambigu: "${ambiguity.term}". Veuillez preciser.`],
      warnings
    };
  }

  // 2. Trouver le service (utiliser resolvedService si déjà résolu, ex: service BDD)
  const service = resolvedService ||
                  findServiceByName(bookingData.serviceName || bookingData.service) ||
                  Object.values(SERVICES).find(s => s.id === bookingData.serviceId);

  if (!service) {
    errors.push(`Service inconnu: ${bookingData.serviceId || bookingData.serviceName || bookingData.service}`);
    return { valid: false, errors, warnings, service: null };
  }

  // 3. Validation de base (horaires, jour)
  const baseValidation = validateBooking(bookingData, service);
  errors.push(...baseValidation.errors);

  // 4. Verifier si le service bloque la journee entiere
  if (service.blocksFullDay) {
    const sameDayBookings = existingBookings.filter(b =>
      b.date === bookingData.date && b.statut !== 'annule'
    );

    if (sameDayBookings.length > 0) {
      errors.push(`Ce service nécessite la journée entière. Le ${bookingData.date} a déjà ${sameDayBookings.length} RDV.`);
    }

    // Verifier les jours suivants si necessaire (ex: microlocks crochet = 2 jours)
    if (service.blocksDays > 1) {
      const consecutiveCheck = checkConsecutiveBusinessDaysAvailable(
        bookingData.date,
        service.blocksDays,
        existingBookings
      );

      if (!consecutiveCheck.valid) {
        errors.push(`Ce service nécessite ${service.blocksDays} jours ouvrables consécutifs. ${consecutiveCheck.reason}`);
      } else {
        // Stocker les dates pour référence (utile pour la création du RDV)
        bookingData.consecutiveDates = consecutiveCheck.dates;
      }
    }
  }

  // 5. Verifier les chevauchements pour les services normaux
  if (!service.blocksFullDay && bookingData.heure) {
    const [startH, startM] = bookingData.heure.split(':').map(Number);
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = startMinutes + service.durationMinutes;

    const conflicts = existingBookings.filter(b => {
      if (b.date !== bookingData.date || b.statut === 'annule') return false;

      // Calculer l'heure de fin du RDV existant
      const [bH, bM] = (b.heure || '00:00').split(':').map(Number);
      const bStart = bH * 60 + (bM || 0);
      const bDuration = b.duree_minutes || b.durationMinutes || 60;
      const bEnd = bStart + bDuration;

      // Verifier chevauchement
      return (startMinutes < bEnd && endMinutes > bStart);
    });

    if (conflicts.length > 0) {
      const conflict = conflicts[0];
      errors.push(`Conflit avec un RDV existant (${conflict.service_nom || conflict.service} à ${conflict.heure})`);
    }
  }

  // 6. Verifier que le service journee entiere a le bon creneau
  if (service.blocksFullDay) {
    const requestedHour = bookingData.heure?.split(':')[0];
    if (requestedHour && parseInt(requestedHour) !== BOOKING_RULES.FULL_DAY_START_HOUR) {
      warnings.push(`Les ${service.name} commencent à ${BOOKING_RULES.FULL_DAY_START_TIME}. Créneau ajusté automatiquement.`);
      bookingData.heure = BOOKING_RULES.FULL_DAY_START_TIME;
    }
  }

  // 7. Verifier le prix minimum
  if (bookingData.price !== undefined && bookingData.price < service.price) {
    errors.push(`Prix invalide. Minimum: ${service.price}€`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    service,
    blocksFullDay: service.blocksFullDay,
    blocksDays: service.blocksDays || 1
  };
}

/**
 * Calcule le prix total d'une reservation
 * @param {Object} service - Le service
 * @param {number} distanceKm - Distance en km (0 si au salon)
 * @returns {{ servicePrice, travelFee, total, deposit }}
 */
export function calculateTotalPrice(service, distanceKm = 0) {
  const servicePrice = service.price;
  const travelFee = distanceKm > 0 ? TRAVEL_FEES.calculate(distanceKm) : 0;
  const total = servicePrice + travelFee;
  const deposit = Math.ceil(total * BOOKING_RULES.DEPOSIT_PERCENT / 100);

  return {
    servicePrice,
    servicePriceCents: service.priceInCents,
    travelFee,
    travelFeeCents: distanceKm > 0 ? TRAVEL_FEES.calculateCents(distanceKm) : 0,
    total,
    totalCents: (service.priceInCents || servicePrice * 100) + (distanceKm > 0 ? TRAVEL_FEES.calculateCents(distanceKm) : 0),
    deposit,
    depositCents: Math.ceil((service.priceInCents + (distanceKm > 0 ? TRAVEL_FEES.calculateCents(distanceKm) : 0)) * BOOKING_RULES.DEPOSIT_PERCENT / 100),
    priceIsMinimum: service.priceIsMinimum || false,
  };
}

/**
 * Obtient les creneaux disponibles pour un service a une date
 * @param {string} date - Date au format YYYY-MM-DD
 * @param {Object} service - Le service
 * @param {Array} existingBookings - Reservations existantes
 * @returns {{ available: boolean, slots: string[], message: string }}
 */
export function getAvailableSlots(date, service, existingBookings = []) {
  const dayOfWeek = new Date(date + 'T12:00:00').getDay();

  // Verifier si ouvert
  if (!BUSINESS_HOURS.isOpen(dayOfWeek)) {
    return {
      available: false,
      slots: [],
      message: 'Fermé ce jour-là (dimanche)'
    };
  }

  const hours = BUSINESS_HOURS.getHours(dayOfWeek);
  const [openH] = hours.open.split(':').map(Number);
  const [closeH] = hours.close.split(':').map(Number);

  // Service journee entiere = un seul creneau a 9h
  if (service.blocksFullDay) {
    const hasBookings = existingBookings.some(b =>
      b.date === date && b.statut !== 'annule'
    );

    if (hasBookings) {
      return {
        available: false,
        slots: [],
        blocksFullDay: true,
        message: `Journée déjà occupée. Ce service nécessite la journée entière.`
      };
    }

    // Verifier les jours suivants pour services multi-jours
    if (service.blocksDays > 1) {
      const consecutiveCheck = checkConsecutiveBusinessDaysAvailable(
        date,
        service.blocksDays,
        existingBookings
      );

      if (!consecutiveCheck.valid) {
        return {
          available: false,
          slots: [],
          blocksFullDay: true,
          blocksDays: service.blocksDays,
          message: `Ce service nécessite ${service.blocksDays} jours ouvrables consécutifs. ${consecutiveCheck.reason}`
        };
      }

      // Formater les dates pour l'affichage (ex: "samedi 24/1 et lundi 26/1")
      const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      const datesFormatted = consecutiveCheck.dates.map(d => {
        const dateObj = new Date(d);
        return `${jours[dateObj.getDay()]} ${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
      }).join(' et ');

      return {
        available: true,
        slots: [BOOKING_RULES.FULL_DAY_START_TIME],
        dates: consecutiveCheck.dates,
        blocksFullDay: true,
        blocksDays: service.blocksDays,
        message: `Disponible ! ${service.name} sur ${service.blocksDays} jours: ${datesFormatted}`
      };
    }

    return {
      available: true,
      slots: [BOOKING_RULES.FULL_DAY_START_TIME],
      blocksFullDay: true,
      message: `Disponible ! Créneau unique: ${BOOKING_RULES.FULL_DAY_START_TIME} (journée entière)`
    };
  }

  // Service normal - calculer les creneaux disponibles
  const slots = [];
  const durationMinutes = service.durationMinutes;

  for (let hour = openH; hour < closeH; hour++) {
    const slotStart = hour * 60;
    const slotEnd = slotStart + durationMinutes;

    // Verifier que le service peut se terminer avant la fermeture
    if (slotEnd > closeH * 60) continue;

    // Verifier les conflits
    const hasConflict = existingBookings.some(b => {
      if (b.date !== date || b.statut === 'annule') return false;
      const [bH, bM] = (b.heure || '00:00').split(':').map(Number);
      const bStart = bH * 60 + (bM || 0);
      const bDuration = b.duree_minutes || b.durationMinutes || 60;
      const bEnd = bStart + bDuration;
      return (slotStart < bEnd && slotEnd > bStart);
    });

    if (!hasConflict) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
  }

  return {
    available: slots.length > 0,
    slots,
    message: slots.length > 0
      ? `${slots.length} créneaux disponibles`
      : 'Aucun créneau disponible ce jour-là'
  };
}

// Export nomme pour les fonctions utilitaires (multi-jours)
export {
  getNextBusinessDay,
  getConsecutiveBusinessDays,
  checkConsecutiveBusinessDaysAvailable,
};

// Export par defaut
export default {
  validateBeforeCreate,
  calculateTotalPrice,
  getAvailableSlots,
  // Fonctions utilitaires multi-jours
  getNextBusinessDay,
  getConsecutiveBusinessDays,
  checkConsecutiveBusinessDaysAvailable,
  // Constantes
  SERVICES,
  TRAVEL_FEES,
  BUSINESS_HOURS,
  BOOKING_RULES,
  AMBIGUOUS_TERMS,
};
