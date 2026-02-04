/**
 * Service de réservation téléphonique complet
 * - Calcul distance Google Maps
 * - Frais de déplacement
 * - Vérification disponibilités
 * - Création RDV
 * - Envoi SMS confirmation
 */

import { createClient } from '@supabase/supabase-js';
import bookingService from './bookingService.js';

const { SERVICES, SALON_INFO, DEPLACEMENT } = bookingService;

// Client Supabase - initialisation paresseuse
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

// Adresse de base de Fatou - CENTRALISÉE
const FATOU_ADDRESS = SALON_INFO.adresse;

// Tarifs des services - CENTRALISÉS depuis bookingService.js
const SERVICES_TARIFS = SERVICES;

// Barème des frais de déplacement - CENTRALISÉ
const FRAIS_DEPLACEMENT = [
  { maxKm: DEPLACEMENT.gratuitJusquaKm, frais: 0 },
  { maxKm: DEPLACEMENT.gratuitJusquaKm + 5, frais: DEPLACEMENT.baseAuDela },
  { maxKm: DEPLACEMENT.gratuitJusquaKm + 10, frais: DEPLACEMENT.baseAuDela + 5 },
  { maxKm: DEPLACEMENT.gratuitJusquaKm + 15, frais: DEPLACEMENT.baseAuDela + 10 },
  { maxKm: DEPLACEMENT.gratuitJusquaKm + 25, frais: DEPLACEMENT.baseAuDela + 15 },
  { maxKm: Infinity, frais: DEPLACEMENT.baseAuDela + 20 }
];

/**
 * Calculer la distance avec Google Maps Distance Matrix API
 */
export async function calculateDistance(clientAddress) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error('[DISTANCE] ❌ Google Maps API Key manquante');
    return { distance: null, duree: null, error: 'Configuration manquante' };
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(FATOU_ADDRESS)}&destinations=${encodeURIComponent(clientAddress)}&mode=driving&language=fr&key=${apiKey}`;

    console.log('[DISTANCE] Appel Google Maps pour:', clientAddress);

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
      const element = data.rows[0].elements[0];
      const distanceKm = element.distance.value / 1000;
      const dureeMinutes = Math.round(element.duration.value / 60);

      console.log(`[DISTANCE] ✅ ${clientAddress} → ${distanceKm.toFixed(1)}km, ${dureeMinutes}min`);

      return {
        distance: distanceKm,
        distanceText: element.distance.text,
        duree: dureeMinutes,
        dureeText: element.duration.text,
        error: null
      };
    } else {
      console.error('[DISTANCE] ❌ Erreur Google Maps:', data.status, data.error_message);
      return { distance: null, duree: null, error: 'Adresse non trouvée' };
    }
  } catch (error) {
    console.error('[DISTANCE] ❌ Erreur:', error.message);
    return { distance: null, duree: null, error: error.message };
  }
}

/**
 * Calculer les frais de déplacement selon la distance
 */
export function calculateTravelFee(distanceKm) {
  if (!distanceKm) return 0;

  for (const tier of FRAIS_DEPLACEMENT) {
    if (distanceKm <= tier.maxKm) {
      console.log(`[FRAIS] ${distanceKm.toFixed(1)}km → ${tier.frais}€`);
      return tier.frais;
    }
  }
  return 25; // Maximum
}

/**
 * Obtenir le tarif d'un service
 */
export function getServicePrice(serviceName) {
  if (!serviceName) return null;

  const serviceKey = serviceName.toLowerCase().trim();

  // Chercher correspondance exacte ou partielle
  for (const [key, value] of Object.entries(SERVICES_TARIFS)) {
    if (serviceKey.includes(key) || key.includes(serviceKey)) {
      return value;
    }
  }

  return null;
}

/**
 * Convertir "samedi", "demain", "lundi prochain" en date ISO
 */
export function parseJourToDate(jour) {
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const aujourdhui = new Date();
  const jourSemaine = aujourdhui.getDay();

  const jourLower = jour.toLowerCase();

  // Aujourd'hui
  if (jourLower.includes('aujourd')) {
    return aujourdhui.toISOString().split('T')[0];
  }

  // Demain
  if (jourLower.includes('demain')) {
    const demain = new Date(aujourdhui);
    demain.setDate(aujourdhui.getDate() + 1);
    return demain.toISOString().split('T')[0];
  }

  // Jour de la semaine
  const targetDay = jours.indexOf(jourLower);
  if (targetDay === -1) {
    // Si pas trouvé, retourner null
    return null;
  }

  // Calculer le nombre de jours jusqu'au prochain jour demandé
  let daysToAdd = targetDay - jourSemaine;
  if (daysToAdd <= 0) daysToAdd += 7; // Si c'est passé, prendre la semaine prochaine

  const targetDate = new Date(aujourdhui);
  targetDate.setDate(aujourdhui.getDate() + daysToAdd);

  return targetDate.toISOString().split('T')[0];
}

/**
 * Vérifier si le jour/heure est dans les horaires de Fatou
 */
export function checkHoraires(jour, heure) {
  const horaires = {
    'lundi': { debut: 9, fin: 18 },
    'mardi': { debut: 9, fin: 18 },
    'mercredi': { debut: 9, fin: 18 },
    'jeudi': { debut: 9, fin: 13 },
    'vendredi': { debut: 13, fin: 18 },
    'samedi': { debut: 9, fin: 18 },
    'dimanche': null // Fermé
  };

  const jourLower = jour.toLowerCase();
  const heureNum = parseInt(heure);

  const horaire = horaires[jourLower];

  if (!horaire) {
    return { ok: false, message: 'Fatou ne travaille pas le dimanche' };
  }

  if (heureNum < horaire.debut || heureNum >= horaire.fin) {
    return {
      ok: false,
      message: `Le ${jour}, Fatou travaille de ${horaire.debut}h à ${horaire.fin}h`
    };
  }

  return { ok: true };
}

/**
 * Vérifier disponibilité d'un créneau
 */
export async function checkAvailability(jour, heure) {
  try {
    const db = getSupabase();
    if (!db) return { available: true, conflits: [] };

    // Convertir le jour en date réelle
    const dateRdv = parseJourToDate(jour);
    if (!dateRdv) return { available: true, conflits: [] };

    // Chercher dans la table rendezvous
    const { data, error } = await db
      .from('reservations')
      .select('id, heure')
      .eq('date', dateRdv)
      .in('statut', ['demande', 'confirme']);

    if (error) {
      console.error('[DISPO] Erreur:', error);
      return { available: true, conflits: [] };
    }

    // Vérifier s'il y a un conflit avec l'heure demandée
    const heureNum = parseInt(heure);
    const conflits = data.filter(rdv => {
      const rdvHeure = parseInt(rdv.heure);
      // Conflit si même heure (à 2h près pour tenir compte de la durée)
      return Math.abs(rdvHeure - heureNum) < 2;
    });

    console.log(`[DISPO] ${dateRdv} ${heure}h: ${conflits.length === 0 ? 'disponible' : 'OCCUPÉ'}`);

    return {
      available: conflits.length === 0,
      conflits: conflits
    };
  } catch (error) {
    console.error('[DISPO] Erreur:', error);
    return { available: true, conflits: [] };
  }
}

/**
 * Créer un RDV complet en base de données
 */
export async function createFullAppointment(bookingData) {
  try {
    const db = getSupabase();
    if (!db) {
      console.error('[RDV] ❌ Supabase non configuré');
      return { success: false, error: 'Base de données non configurée' };
    }

    const {
      clientName,
      clientPhone,
      clientAddress,
      service,
      jour,
      heure,
      distance,
      fraisDeplacement,
      prixService,
      prixTotal,
      callSid
    } = bookingData;

    console.log('[RDV] Création RDV complet:', { clientName, service, jour, heure, prixTotal });

    // Convertir le jour en date
    const dateRdv = parseJourToDate(jour);
    if (!dateRdv) {
      return { success: false, error: 'Date invalide' };
    }

    // Créer ou trouver le client
    let clientId = null;

    if (clientPhone) {
      const { data: existingClient } = await db
        .from('clients')
        .select('id')
        .eq('telephone', clientPhone)
        .single();

      if (existingClient) {
        clientId = existingClient.id;
        console.log(`[RDV] Client existant: ${clientId}`);
      } else {
        const { data: newClient, error: insertError } = await db
          .from('clients')
          .insert({
            nom: clientName,
            telephone: clientPhone
          })
          .select('id')
          .single();

        if (newClient) {
          clientId = newClient.id;
          console.log(`[RDV] Nouveau client: ${clientId}`);
        }
      }
    }

    // Vérifier que le client a été créé
    if (!clientId) {
      console.error('[RDV] ❌ Impossible de créer/trouver le client');
      return { success: false, error: 'Client non créé' };
    }

    // Créer le RDV dans la table rendezvous avec tous les champs
    const rdvData = {
      client_id: clientId,
      service_nom: service,
      date: dateRdv,
      heure: heure + 'h',
      statut: 'demande',
      adresse_client: clientAddress || null,
      prix_service: prixService ? Math.round(prixService * 100) : null, // Convertir en centimes
      distance_km: distance || null,
      frais_deplacement: fraisDeplacement ? Math.round(fraisDeplacement * 100) : 0, // Convertir en centimes
      prix_total: prixTotal ? Math.round(prixTotal * 100) : null, // Convertir en centimes
      telephone: clientPhone || null,
      created_via: 'telephone',
      notes: `[TELEPHONE] CallSid: ${callSid}`
    };

    console.log('[RDV] Données à insérer:', rdvData);

    const { data: rdv, error: rdvError } = await db
      .from('reservations')
      .insert(rdvData)
      .select()
      .single();

    if (rdvError) {
      console.error('[RDV] ❌ Erreur création:', rdvError);
      console.error('[RDV] ❌ Détails:', JSON.stringify(rdvError, null, 2));
      return { success: false, error: rdvError.message };
    }

    console.log('[RDV] ✅ Créé avec succès - ID:', rdv.id);

    return { success: true, rdv: rdv };

  } catch (error) {
    console.error('[RDV] ❌ Erreur:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Envoyer SMS de confirmation via Twilio
 */
export async function sendConfirmationSMS(phoneNumber, bookingDetails) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhone) {
    console.error('[SMS] ❌ Configuration Twilio manquante');
    return false;
  }

  // Formater le numéro
  let formattedPhone = phoneNumber;
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '+33' + formattedPhone.substring(1);
  }

  try {
    const twilio = await import('twilio');
    const client = twilio.default(accountSid, authToken);

    const fraisText = bookingDetails.fraisDeplacement > 0
      ? `(dont ${bookingDetails.fraisDeplacement}€ déplacement)`
      : '(déplacement offert)';

    const message = `Fat's Hair-Afro
Votre RDV est confirmé !

${bookingDetails.jour} à ${bookingDetails.heure}h
${bookingDetails.service}
${bookingDetails.prixTotal}€ ${fraisText}

${bookingDetails.adresse ? 'À votre adresse : ' + bookingDetails.adresse : ''}

À bientôt !
Fatou - 09 39 24 02 69`;

    await client.messages.create({
      body: message,
      from: twilioPhone,
      to: formattedPhone
    });

    console.log('[SMS] ✅ Confirmation envoyée à', formattedPhone);
    return true;

  } catch (error) {
    console.error('[SMS] ❌ Erreur:', error.message);
    return false;
  }
}

export default {
  calculateDistance,
  calculateTravelFee,
  getServicePrice,
  parseJourToDate,
  checkHoraires,
  checkAvailability,
  createFullAppointment,
  sendConfirmationSMS
};
