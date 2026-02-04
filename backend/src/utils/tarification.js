/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║   UTILITAIRES DE TARIFICATION                                 [LOCKED]        ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   ⛔ FICHIER VERROUILLE - Ne pas modifier sans autorisation                   ║
 * ║                                                                               ║
 * ║   Fat's Hair-Afro - Franconville                                              ║
 * ║                                                                               ║
 * ║   *** NEXUS CORE COMPLIANT ***                                                ║
 * ║   - TRAVEL_FEES : importe depuis businessRules.js                             ║
 * ║   - calculerFraisDepl() : utilise TRAVEL_FEES.calculate()                     ║
 * ║   - Aucune valeur hardcodee                                                   ║
 * ║                                                                               ║
 * ║   Voir : backend/NEXUS_LOCK.md                                                ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

// *** IMPORT DEPUIS NEXUS CORE - SOURCE UNIQUE DE VÉRITÉ ***
import { TRAVEL_FEES } from '../config/businessRules.js';

// Constantes de tarification - IMPORTÉES depuis businessRules.js
const FRAIS_BASE = TRAVEL_FEES.BASE_FEE;
const DISTANCE_INCLUSE = TRAVEL_FEES.BASE_DISTANCE_KM;
const TARIF_KM_SUPPLEMENTAIRE = TRAVEL_FEES.PER_KM_BEYOND;
const MARGE_SECURITE_MINUTES = 10; // Marge de sécurité entre les RDV (minutes)

/**
 * Calcule les frais de déplacement en fonction de la distance
 * Utilise TRAVEL_FEES.calculate() depuis businessRules.js
 *
 * @param {number} distance_km - Distance en kilomètres
 * @returns {number} Frais de déplacement en euros
 */
function calculerFraisDepl(distance_km) {
  if (distance_km < 0) {
    throw new Error("La distance ne peut pas être négative");
  }

  // *** UTILISE LA FONCTION OFFICIELLE DE businessRules.js ***
  return TRAVEL_FEES.calculate(distance_km);
}

/**
 * Ajoute des minutes à une heure au format HH:MM
 * @param {string} heure - Heure au format HH:MM
 * @param {number} minutes - Minutes à ajouter (peut être négatif)
 * @returns {string} Nouvelle heure au format HH:MM
 */
function ajouterMinutes(heure, minutes) {
  const [heures, mins] = heure.split(":").map(Number);

  let totalMinutes = heures * 60 + mins + minutes;

  // Gérer les cas limites
  if (totalMinutes < 0) {
    totalMinutes = 0;
  }
  if (totalMinutes >= 24 * 60) {
    totalMinutes = 24 * 60 - 1;
  }

  const nouvellesHeures = Math.floor(totalMinutes / 60);
  const nouvellesMinutes = totalMinutes % 60;

  return `${String(nouvellesHeures).padStart(2, "0")}:${String(nouvellesMinutes).padStart(2, "0")}`;
}

/**
 * Calcule le bloc de réservation (temps total bloqué dans l'agenda)
 * - debut_bloc = heure_rdv - temps_trajet_minutes
 * - fin_bloc = heure_rdv + duree_service_minutes + temps_trajet_minutes + 10 (marge)
 *
 * @param {string} heure_rdv - Heure du rendez-vous (format HH:MM)
 * @param {number} duree_service_minutes - Durée du service en minutes
 * @param {number} temps_trajet_minutes - Temps de trajet aller en minutes
 * @returns {{ debut_bloc: string, fin_bloc: string, duree_totale_minutes: number }}
 */
function calculerBlocReservation(heure_rdv, duree_service_minutes, temps_trajet_minutes) {
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

  // Calcul du début du bloc (départ du salon)
  const debut_bloc = ajouterMinutes(heure_rdv, -temps_trajet_minutes);

  // Calcul de la fin du bloc (retour au salon + marge)
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
  };
}

// Exports ES Modules
export {
  calculerFraisDepl,
  calculerBlocReservation,
  FRAIS_BASE,
  DISTANCE_INCLUSE,
  TARIF_KM_SUPPLEMENTAIRE,
  MARGE_SECURITE_MINUTES,
};
