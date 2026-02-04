import { Client, TravelMode, UnitSystem } from "@googlemaps/google-maps-services-js";

// Point de départ par défaut : adresse de chez Fatou à Franconville
const SALON_ADDRESS = "8 rue des Monts Rouges, 95130 Franconville, France";

// Instance du client Google Maps
const googleMapsClient = new Client({});

// Vérification de la clé API
function getApiKey(): string {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not defined in environment variables");
  }
  return apiKey;
}

// Interface pour le résultat de distance
export interface DistanceResult {
  distance_km: number;
  duree_minutes: number;
  distance_text: string;
  duree_text: string;
  origin: string;
  destination: string;
}

// Interface pour le résultat de géocodage
export interface GeocodeResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
  place_id: string;
}

/**
 * Calcule la distance et la durée entre deux adresses
 * @param addresseDepart - Adresse de départ (défaut: chez Fatou à Franconville)
 * @param addresseArrivee - Adresse d'arrivée
 * @returns Distance en km et durée en minutes
 */
export async function calculateDistance(
  addresseDepart: string = SALON_ADDRESS,
  addresseArrivee: string
): Promise<DistanceResult> {
  try {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[GOOGLE MAPS] 🗺️  CALCUL DE DISTANCE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const apiKey = getApiKey();
    console.log("[GOOGLE MAPS] ✅ Clé API trouvée:", apiKey ? `${apiKey.substring(0, 10)}...` : "MANQUANTE");
    console.log("[GOOGLE MAPS] 📍 Départ:", addresseDepart);
    console.log("[GOOGLE MAPS] 📍 Arrivée:", addresseArrivee);

    console.log("[GOOGLE MAPS] 🔄 Appel Distance Matrix API...");
    const response = await googleMapsClient.distancematrix({
      params: {
        origins: [addresseDepart],
        destinations: [addresseArrivee],
        mode: TravelMode.driving,
        units: UnitSystem.metric,
        language: "fr",
        key: apiKey,
      },
    });

    const data = response.data;
    console.log("[GOOGLE MAPS] 📩 Réponse API reçue");
    console.log("[GOOGLE MAPS] Status:", data.status);

    // Vérifier le statut de la réponse
    if (data.status !== "OK") {
      console.error("[GOOGLE MAPS] ❌ ERREUR STATUS:", data.status);
      console.error("[GOOGLE MAPS] Message d'erreur:", data.error_message || "Aucun message");
      throw new Error(`Google Maps API error: ${data.status}${data.error_message ? ` - ${data.error_message}` : ''}`);
    }

    const element = data.rows[0]?.elements[0];

    if (!element) {
      console.error("[GOOGLE MAPS] ❌ Aucun élément trouvé dans la réponse");
      console.error("[GOOGLE MAPS] Rows:", JSON.stringify(data.rows, null, 2));
      throw new Error("No route found between the two addresses");
    }

    console.log("[GOOGLE MAPS] Element status:", element.status);

    if (element.status !== "OK") {
      console.error("[GOOGLE MAPS] ❌ Status de l'élément non OK:", element.status);
      if (element.status === "ZERO_RESULTS") {
        console.error("[GOOGLE MAPS] Aucun itinéraire trouvé entre les adresses");
      } else if (element.status === "NOT_FOUND") {
        console.error("[GOOGLE MAPS] Une des adresses est introuvable");
      }
      throw new Error(`Route calculation failed: ${element.status}`);
    }

    // Extraire les valeurs
    const distanceMeters = element.distance.value;
    const durationSeconds = element.duration.value;

    console.log("[GOOGLE MAPS] ✅ SUCCÈS");
    console.log("[GOOGLE MAPS] Distance:", distanceMeters, "mètres");
    console.log("[GOOGLE MAPS] Durée:", durationSeconds, "secondes");
    console.log("[GOOGLE MAPS] Distance formatée:", element.distance.text);
    console.log("[GOOGLE MAPS] Durée formatée:", element.duration.text);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    return {
      distance_km: Math.round((distanceMeters / 1000) * 10) / 10, // Arrondi à 1 décimale
      duree_minutes: Math.round(durationSeconds / 60),
      distance_text: element.distance.text,
      duree_text: element.duration.text,
      origin: data.origin_addresses[0],
      destination: data.destination_addresses[0],
    };
  } catch (error) {
    console.error("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("[GOOGLE MAPS] ❌ ERREUR COMPLÈTE");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("[GOOGLE MAPS] Error type:", error instanceof Error ? error.name : typeof error);
    console.error("[GOOGLE MAPS] Error message:", error instanceof Error ? error.message : error);
    console.error("[GOOGLE MAPS] Stack:", error instanceof Error ? error.stack : "N/A");

    // Si c'est une erreur HTTP/réseau
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as any;
      console.error("[GOOGLE MAPS] HTTP Status:", axiosError.response?.status);
      console.error("[GOOGLE MAPS] HTTP Data:", JSON.stringify(axiosError.response?.data, null, 2));
    }

    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (error instanceof Error) {
      throw new Error(`Failed to calculate distance: ${error.message}`);
    }
    throw new Error("Failed to calculate distance: Unknown error");
  }
}

/**
 * Convertit une adresse en coordonnées géographiques
 * @param address - Adresse à géocoder
 * @returns Coordonnées latitude/longitude et adresse formatée
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  try {
    const apiKey = getApiKey();

    const response = await googleMapsClient.geocode({
      params: {
        address: address,
        language: "fr",
        region: "fr",
        key: apiKey,
      },
    });

    const data = response.data;

    // Vérifier le statut de la réponse
    if (data.status !== "OK") {
      if (data.status === "ZERO_RESULTS") {
        throw new Error(`Address not found: ${address}`);
      }
      throw new Error(`Google Maps Geocoding API error: ${data.status}`);
    }

    const result = data.results[0];

    if (!result) {
      throw new Error("No geocoding result found");
    }

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formatted_address: result.formatted_address,
      place_id: result.place_id,
    };
  } catch (error) {
    console.error("Error geocoding address:", error);

    if (error instanceof Error) {
      throw new Error(`Failed to geocode address: ${error.message}`);
    }
    throw new Error("Failed to geocode address: Unknown error");
  }
}

/**
 * Calcule la distance entre chez Fatou et une adresse client
 * @param clientAddress - Adresse du client
 * @returns Distance et durée depuis chez Fatou
 */
export async function getDistanceFromSalon(clientAddress: string): Promise<DistanceResult> {
  return calculateDistance(SALON_ADDRESS, clientAddress);
}

/**
 * Obtient les coordonnées de chez Fatou
 * @returns Coordonnées de chez Fatou
 */
export async function getSalonCoordinates(): Promise<GeocodeResult> {
  return geocodeAddress(SALON_ADDRESS);
}

/**
 * Vérifie si une adresse est valide (peut être géocodée)
 * @param address - Adresse à vérifier
 * @returns true si l'adresse est valide
 */
export async function isValidAddress(address: string): Promise<boolean> {
  try {
    await geocodeAddress(address);
    return true;
  } catch {
    return false;
  }
}

// Export de l'adresse de chez Fatou pour référence
export { SALON_ADDRESS };
