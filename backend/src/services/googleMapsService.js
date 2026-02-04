/**
 * Service Google Maps pour le calcul des distances et géocodage
 * Fat's Hair-Afro - Franconville
 */

import { Client } from '@googlemaps/google-maps-services-js';

// Point de départ par défaut : adresse du salon
const SALON_ADDRESS = "8 rue des Monts Rouges, 95130 Franconville, France";

// Instance du client Google Maps
const googleMapsClient = new Client({});

/**
 * Récupère la clé API Google Maps
 * @returns {string} Clé API
 * @throws {Error} Si la clé n'est pas définie
 */
function getApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not defined in environment variables");
  }
  return apiKey;
}

/**
 * Calcule la distance et la durée entre deux adresses
 * @param {string} addresseDepart - Adresse de départ (défaut: salon)
 * @param {string} addresseArrivee - Adresse d'arrivée
 * @returns {Promise<Object>} Distance et durée
 */
async function calculateDistance(addresseDepart = SALON_ADDRESS, addresseArrivee) {
  try {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[GOOGLE MAPS BACKEND] 🗺️  CALCUL DE DISTANCE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const apiKey = getApiKey();
    console.log("[GOOGLE MAPS BACKEND] ✅ Clé API trouvée:", apiKey ? `${apiKey.substring(0, 10)}...` : "MANQUANTE");
    console.log("[GOOGLE MAPS BACKEND] 📍 Départ:", addresseDepart);
    console.log("[GOOGLE MAPS BACKEND] 📍 Arrivée:", addresseArrivee);

    console.log("[GOOGLE MAPS BACKEND] 🔄 Appel Distance Matrix API...");
    const response = await googleMapsClient.distancematrix({
      params: {
        origins: [addresseDepart],
        destinations: [addresseArrivee],
        mode: 'driving',
        units: 'metric',
        language: 'fr',
        key: apiKey,
      },
    });

    const data = response.data;
    console.log("[GOOGLE MAPS BACKEND] 📩 Réponse API reçue");
    console.log("[GOOGLE MAPS BACKEND] Status:", data.status);

    if (data.status !== 'OK') {
      console.error("[GOOGLE MAPS BACKEND] ❌ ERREUR STATUS:", data.status);
      console.error("[GOOGLE MAPS BACKEND] Message d'erreur:", data.error_message || "Aucun message");
      throw new Error(`Google Maps API error: ${data.status}${data.error_message ? ` - ${data.error_message}` : ''}`);
    }

    const element = data.rows[0]?.elements[0];

    if (!element) {
      console.error("[GOOGLE MAPS BACKEND] ❌ Aucun élément trouvé dans la réponse");
      console.error("[GOOGLE MAPS BACKEND] Rows:", JSON.stringify(data.rows, null, 2));
      throw new Error('No route found between the two addresses');
    }

    console.log("[GOOGLE MAPS BACKEND] Element status:", element.status);

    if (element.status !== 'OK') {
      console.error("[GOOGLE MAPS BACKEND] ❌ Status de l'élément non OK:", element.status);
      if (element.status === 'ZERO_RESULTS') {
        console.error("[GOOGLE MAPS BACKEND] Aucun itinéraire trouvé entre les adresses");
      } else if (element.status === 'NOT_FOUND') {
        console.error("[GOOGLE MAPS BACKEND] Une des adresses est introuvable");
      }
      throw new Error(`Route calculation failed: ${element.status}`);
    }

    const distanceMeters = element.distance.value;
    const durationSeconds = element.duration.value;

    console.log("[GOOGLE MAPS BACKEND] ✅ SUCCÈS");
    console.log("[GOOGLE MAPS BACKEND] Distance:", distanceMeters, "mètres");
    console.log("[GOOGLE MAPS BACKEND] Durée:", durationSeconds, "secondes");
    console.log("[GOOGLE MAPS BACKEND] Distance formatée:", element.distance.text);
    console.log("[GOOGLE MAPS BACKEND] Durée formatée:", element.duration.text);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    return {
      distance_km: Math.round((distanceMeters / 1000) * 10) / 10,
      duree_minutes: Math.round(durationSeconds / 60),
      distance_text: element.distance.text,
      duree_text: element.duration.text,
      origin: data.origin_addresses[0],
      destination: data.destination_addresses[0],
    };
  } catch (error) {
    console.error("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("[GOOGLE MAPS BACKEND] ❌ ERREUR COMPLÈTE");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("[GOOGLE MAPS BACKEND] Error type:", error?.name || typeof error);
    console.error("[GOOGLE MAPS BACKEND] Error message:", error?.message || error);
    console.error("[GOOGLE MAPS BACKEND] Stack:", error?.stack || "N/A");

    // Si c'est une erreur HTTP/réseau
    if (error && typeof error === 'object' && 'response' in error) {
      console.error("[GOOGLE MAPS BACKEND] HTTP Status:", error.response?.status);
      console.error("[GOOGLE MAPS BACKEND] HTTP Data:", JSON.stringify(error.response?.data, null, 2));
    }

    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    throw new Error(`Failed to calculate distance: ${error.message}`);
  }
}

/**
 * Convertit une adresse en coordonnées géographiques
 * @param {string} address - Adresse à géocoder
 * @returns {Promise<Object>} Coordonnées et infos
 */
async function geocodeAddress(address) {
  try {
    const apiKey = getApiKey();

    const response = await googleMapsClient.geocode({
      params: {
        address: address,
        language: 'fr',
        region: 'fr',
        key: apiKey,
      },
    });

    const data = response.data;

    if (data.status !== 'OK') {
      if (data.status === 'ZERO_RESULTS') {
        throw new Error(`Address not found: ${address}`);
      }
      throw new Error(`Google Maps Geocoding API error: ${data.status}`);
    }

    const result = data.results[0];

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formatted_address: result.formatted_address,
      place_id: result.place_id,
    };
  } catch (error) {
    console.error('Error geocoding address:', error);
    throw new Error(`Failed to geocode address: ${error.message}`);
  }
}

/**
 * Calcule la distance entre le salon et une adresse client
 * @param {string} clientAddress - Adresse du client
 * @returns {Promise<Object>} Distance et durée depuis le salon
 */
async function getDistanceFromSalon(clientAddress) {
  return calculateDistance(SALON_ADDRESS, clientAddress);
}

/**
 * Obtient les coordonnées du salon
 * @returns {Promise<Object>} Coordonnées du salon
 */
async function getSalonCoordinates() {
  return geocodeAddress(SALON_ADDRESS);
}

/**
 * Vérifie si une adresse est valide
 * @param {string} address - Adresse à vérifier
 * @returns {Promise<boolean>} true si valide
 */
async function isValidAddress(address) {
  try {
    await geocodeAddress(address);
    return true;
  } catch {
    return false;
  }
}

export {
  calculateDistance,
  geocodeAddress,
  getDistanceFromSalon,
  getSalonCoordinates,
  isValidAddress,
  SALON_ADDRESS,
};
