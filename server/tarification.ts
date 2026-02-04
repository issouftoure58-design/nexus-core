/**
 * Service de tarification pour les déplacements et réservations
 * Fat's Hair-Afro - Franconville
 */

// Constantes de tarification
const FRAIS_BASE = 10; // Frais de base en euros
const DISTANCE_INCLUSE = 8; // Distance incluse dans les frais de base (km)
const TARIF_KM_SUPPLEMENTAIRE = 1.10; // Prix par km au-delà de la distance incluse
const MARGE_SECURITE_MINUTES = 10; // Marge de sécurité entre les RDV (minutes)

/**
 * Interface pour le résultat des frais de déplacement
 */
export interface FraisDeplacementResult {
  frais_total: number;
  distance_km: number;
  frais_base: number;
  km_supplementaires: number;
  frais_supplementaires: number;
  detail: string;
}

/**
 * Interface pour le bloc de réservation
 */
export interface BlocReservationResult {
  debut_bloc: string; // Format HH:MM
  fin_bloc: string; // Format HH:MM
  duree_totale_minutes: number;
  heure_rdv: string;
  duree_service_minutes: number;
  temps_trajet_minutes: number;
}

/**
 * Calcule les frais de déplacement en fonction de la distance
 * - Si distance ≤ 8km : 10€
 * - Si distance > 8km : 10€ + ((distance - 8) × 1.10€)
 *
 * @param distance_km - Distance en kilomètres
 * @returns Frais de déplacement détaillés
 */
export function calculerFraisDepl(distance_km: number): FraisDeplacementResult {
  // Validation
  if (distance_km < 0) {
    throw new Error("La distance ne peut pas être négative");
  }

  let frais_total: number;
  let km_supplementaires = 0;
  let frais_supplementaires = 0;
  let detail: string;

  if (distance_km <= DISTANCE_INCLUSE) {
    // Distance incluse dans les frais de base
    frais_total = FRAIS_BASE;
    detail = `Frais de base (jusqu'à ${DISTANCE_INCLUSE}km inclus)`;
  } else {
    // Calcul des frais supplémentaires
    km_supplementaires = distance_km - DISTANCE_INCLUSE;
    frais_supplementaires = km_supplementaires * TARIF_KM_SUPPLEMENTAIRE;
    frais_total = FRAIS_BASE + frais_supplementaires;
    detail = `${FRAIS_BASE}€ (base) + ${km_supplementaires.toFixed(1)}km × ${TARIF_KM_SUPPLEMENTAIRE}€`;
  }

  // Arrondir à 2 décimales
  frais_total = Math.round(frais_total * 100) / 100;
  frais_supplementaires = Math.round(frais_supplementaires * 100) / 100;

  return {
    frais_total,
    distance_km,
    frais_base: FRAIS_BASE,
    km_supplementaires: Math.round(km_supplementaires * 10) / 10,
    frais_supplementaires,
    detail,
  };
}

/**
 * Ajoute des minutes à une heure au format HH:MM
 * @param heure - Heure au format HH:MM
 * @param minutes - Minutes à ajouter (peut être négatif)
 * @returns Nouvelle heure au format HH:MM
 */
function ajouterMinutes(heure: string, minutes: number): string {
  const [heures, mins] = heure.split(":").map(Number);

  let totalMinutes = heures * 60 + mins + minutes;

  // Gérer les cas où on dépasse minuit ou on passe en négatif
  if (totalMinutes < 0) {
    totalMinutes = 0; // Minimum 00:00
  }
  if (totalMinutes >= 24 * 60) {
    totalMinutes = 24 * 60 - 1; // Maximum 23:59
  }

  const nouvellesHeures = Math.floor(totalMinutes / 60);
  const nouvellesMinutes = totalMinutes % 60;

  return `${String(nouvellesHeures).padStart(2, "0")}:${String(nouvellesMinutes).padStart(2, "0")}`;
}

/**
 * Calcule le bloc de réservation (temps total bloqué dans l'agenda)
 * - debut_bloc = heure_rdv - temps_trajet_minutes
 * - fin_bloc = heure_rdv + duree_service_minutes + temps_trajet_minutes + marge
 *
 * @param heure_rdv - Heure du rendez-vous (format HH:MM)
 * @param duree_service_minutes - Durée du service en minutes
 * @param temps_trajet_minutes - Temps de trajet aller en minutes
 * @returns Bloc de réservation avec début, fin et durée totale
 */
export function calculerBlocReservation(
  heure_rdv: string,
  duree_service_minutes: number,
  temps_trajet_minutes: number
): BlocReservationResult {
  // Validation
  if (!heure_rdv || !/^\d{2}:\d{2}$/.test(heure_rdv)) {
    throw new Error("L'heure du RDV doit être au format HH:MM");
  }
  if (duree_service_minutes < 0) {
    throw new Error("La durée du service ne peut pas être négative");
  }
  if (temps_trajet_minutes < 0) {
    throw new Error("Le temps de trajet ne peut pas être négatif");
  }

  // Calcul du début du bloc (départ de chez Fatou)
  const debut_bloc = ajouterMinutes(heure_rdv, -temps_trajet_minutes);

  // Calcul de la fin du bloc (retour chez Fatou + marge)
  const fin_bloc = ajouterMinutes(
    heure_rdv,
    duree_service_minutes + temps_trajet_minutes + MARGE_SECURITE_MINUTES
  );

  // Durée totale = trajet aller + service + trajet retour + marge
  const duree_totale_minutes =
    temps_trajet_minutes + duree_service_minutes + temps_trajet_minutes + MARGE_SECURITE_MINUTES;

  return {
    debut_bloc,
    fin_bloc,
    duree_totale_minutes,
    heure_rdv,
    duree_service_minutes,
    temps_trajet_minutes,
  };
}

/**
 * Calcule le prix total d'une prestation à domicile
 * @param prix_service - Prix du service en euros
 * @param distance_km - Distance en kilomètres
 * @returns Prix total avec détail
 */
export function calculerPrixTotal(
  prix_service: number,
  distance_km: number
): { prix_total: number; prix_service: number; frais_deplacement: FraisDeplacementResult } {
  const frais_deplacement = calculerFraisDepl(distance_km);
  const prix_total = Math.round((prix_service + frais_deplacement.frais_total) * 100) / 100;

  return {
    prix_total,
    prix_service,
    frais_deplacement,
  };
}

/**
 * Vérifie si un créneau est disponible (pas de chevauchement avec un bloc existant)
 * @param nouveau_bloc - Nouveau bloc à vérifier
 * @param blocs_existants - Liste des blocs déjà réservés
 * @returns true si le créneau est disponible
 */
export function verifierDisponibilite(
  nouveau_bloc: BlocReservationResult,
  blocs_existants: BlocReservationResult[]
): boolean {
  for (const bloc of blocs_existants) {
    // Vérifier le chevauchement
    // Chevauchement si : nouveau.debut < existant.fin ET nouveau.fin > existant.debut
    if (nouveau_bloc.debut_bloc < bloc.fin_bloc && nouveau_bloc.fin_bloc > bloc.debut_bloc) {
      return false; // Chevauchement détecté
    }
  }
  return true; // Pas de chevauchement
}

// Export des constantes pour référence externe
export const TARIFICATION_CONFIG = {
  FRAIS_BASE,
  DISTANCE_INCLUSE,
  TARIF_KM_SUPPLEMENTAIRE,
  MARGE_SECURITE_MINUTES,
};
