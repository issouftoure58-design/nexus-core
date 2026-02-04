/**
 * Service de gestion des disponibilités avec intégration des temps de trajet
 * Fat's Hair-Afro - Franconville
 */

import { getDistanceFromSalon } from './googleMapsService.js';
import { calculerFraisDepl, calculerBlocReservation } from '../utils/tarification.js';

/**
 * Horaires d'ouverture par jour de la semaine
 * 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
 */
const HORAIRES_PAR_JOUR = {
  0: null, // Dimanche - FERMÉ
  1: { debut: "09:00", fin: "18:00" }, // Lundi
  2: { debut: "09:00", fin: "18:00" }, // Mardi
  3: { debut: "09:00", fin: "18:00" }, // Mercredi
  4: { debut: "09:00", fin: "13:00" }, // Jeudi - UNIQUEMENT matin
  5: { debut: "13:00", fin: "18:00" }, // Vendredi - UNIQUEMENT après-midi
  6: { debut: "09:00", fin: "18:00" }, // Samedi
};

const JOURS_SEMAINE = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/**
 * Obtient les horaires d'ouverture pour une date donnée
 * @param {string} date - Date au format YYYY-MM-DD
 * @returns {Object|null} Horaires { debut, fin } ou null si fermé
 */
export function getHorairesJour(date) {
  const dateObj = new Date(date + 'T12:00:00');
  const jourSemaine = dateObj.getDay();
  return HORAIRES_PAR_JOUR[jourSemaine];
}

/**
 * Valide si un créneau est dans les horaires d'ouverture du jour
 * @param {string} date - Date au format YYYY-MM-DD
 * @param {string} heure - Heure au format HH:MM
 * @param {number} duree_minutes - Durée du service en minutes
 * @returns {Object} { valide: boolean, raison?: string, horaires?: Object }
 */
export function validerHorairesJour(date, heure, duree_minutes = 0) {
  const dateObj = new Date(date + 'T12:00:00');
  const jourSemaine = dateObj.getDay();
  const jourNom = JOURS_SEMAINE[jourSemaine];
  const horaires = HORAIRES_PAR_JOUR[jourSemaine];

  // Dimanche - FERMÉ
  if (horaires === null) {
    return {
      valide: false,
      raison: `Dimanche : FERMÉ. Fatou ne travaille pas le dimanche.`,
      jourSemaine: jourNom,
    };
  }

  const heureMinutes = heureEnMinutes(heure);
  const debutMinutes = heureEnMinutes(horaires.debut);
  const finMinutes = heureEnMinutes(horaires.fin);
  const heureFinService = heureMinutes + duree_minutes;

  // Vérifier si l'heure est avant l'ouverture
  if (heureMinutes < debutMinutes) {
    return {
      valide: false,
      raison: `${jourNom} : ouverture à ${horaires.debut}. Créneau trop tôt.`,
      horaires: horaires,
      jourSemaine: jourNom,
    };
  }

  // Vérifier si l'heure est après la fermeture
  if (heureMinutes >= finMinutes) {
    return {
      valide: false,
      raison: `${jourNom} : fermeture à ${horaires.fin}. Créneau trop tard.`,
      horaires: horaires,
      jourSemaine: jourNom,
    };
  }

  // Vérifier si le service dépasse l'heure de fermeture
  if (duree_minutes > 0 && heureFinService > finMinutes) {
    const heureFinStr = minutesEnHeure(heureFinService);
    return {
      valide: false,
      raison: `${jourNom} : le service se terminerait à ${heureFinStr}, après la fermeture (${horaires.fin}).`,
      horaires: horaires,
      jourSemaine: jourNom,
    };
  }

  // Validations spécifiques par jour
  if (jourSemaine === 4) { // Jeudi
    if (heureMinutes >= heureEnMinutes("13:00")) {
      return {
        valide: false,
        raison: `Jeudi : uniquement 9h-13h. L'après-midi n'est pas disponible.`,
        horaires: horaires,
        jourSemaine: jourNom,
      };
    }
  }

  if (jourSemaine === 5) { // Vendredi
    if (heureMinutes < heureEnMinutes("13:00")) {
      return {
        valide: false,
        raison: `Vendredi : uniquement 13h-18h. Le matin n'est pas disponible.`,
        horaires: horaires,
        jourSemaine: jourNom,
      };
    }
  }

  return {
    valide: true,
    horaires: horaires,
    jourSemaine: jourNom,
  };
}

/**
 * Convertit une heure HH:MM en minutes depuis minuit
 * @param {string} heure - Heure au format HH:MM
 * @returns {number} Minutes depuis minuit
 */
function heureEnMinutes(heure) {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convertit des minutes depuis minuit en heure HH:MM
 * @param {number} minutes - Minutes depuis minuit
 * @returns {string} Heure au format HH:MM
 */
function minutesEnHeure(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Vérifie si deux blocs horaires se chevauchent
 * @param {string} debut1 - Début bloc 1 (HH:MM)
 * @param {string} fin1 - Fin bloc 1 (HH:MM)
 * @param {string} debut2 - Début bloc 2 (HH:MM)
 * @param {string} fin2 - Fin bloc 2 (HH:MM)
 * @returns {boolean} true si chevauchement
 */
function blocsSeChevauche(debut1, fin1, debut2, fin2) {
  const d1 = heureEnMinutes(debut1);
  const f1 = heureEnMinutes(fin1);
  const d2 = heureEnMinutes(debut2);
  const f2 = heureEnMinutes(fin2);

  // Chevauchement si : debut1 < fin2 ET fin1 > debut2
  return d1 < f2 && f1 > d2;
}

/**
 * Vérifie la disponibilité d'un créneau en tenant compte des temps de trajet
 *
 * @param {string} date - Date du RDV (YYYY-MM-DD)
 * @param {string} heure - Heure du RDV (HH:MM)
 * @param {number} duree_service_minutes - Durée du service en minutes
 * @param {string} adresse_client - Adresse du client pour le déplacement
 * @param {Array} rdv_existants - Liste des RDV existants pour cette date
 *        Format: [{ heure: "HH:MM", duree_minutes: number, adresse?: string }]
 *
 * @returns {Promise<Object>} Résultat de la vérification
 */
export async function checkDisponibilite(date, heure, duree_service_minutes, adresse_client, rdv_existants = []) {
  try {
    // 0. Valider les horaires du jour AVANT tout calcul
    const validationHoraires = validerHorairesJour(date, heure, duree_service_minutes);
    if (!validationHoraires.valide) {
      return {
        disponible: false,
        date: date,
        heure_rdv: heure,
        raison: validationHoraires.raison,
        jourSemaine: validationHoraires.jourSemaine,
        horaires: validationHoraires.horaires,
        message: validationHoraires.raison,
      };
    }

    // 1. Calculer le temps de trajet depuis le salon
    let trajetInfo = null;
    let temps_trajet_minutes = 0;
    let frais_deplacement = 0;

    if (adresse_client) {
      try {
        const distanceResult = await getDistanceFromSalon(adresse_client);
        temps_trajet_minutes = distanceResult.duree_minutes;

        // calculerFraisDepl retourne directement un nombre (euros)
        frais_deplacement = calculerFraisDepl(distanceResult.distance_km);

        trajetInfo = {
          distance_km: distanceResult.distance_km,
          distance_text: distanceResult.distance_text,
          duree_minutes: distanceResult.duree_minutes,
          duree_text: distanceResult.duree_text,
          frais_deplacement: frais_deplacement,
          adresse_formatee: distanceResult.destination,
        };
      } catch (error) {
        console.error('[DispoService] Erreur calcul trajet:', error.message);
        // Continuer sans infos de trajet (RDV au salon)
      }
    }

    // 2. Calculer le bloc de réservation complet (avec marges)
    const blocReservation = calculerBlocReservation(
      heure,
      duree_service_minutes,
      temps_trajet_minutes
    );

    // 3. Vérifier les chevauchements avec les RDV existants
    const conflits = [];

    for (const rdv of rdv_existants) {
      // Calculer le bloc de chaque RDV existant
      const rdvTempsTrajet = rdv.temps_trajet_minutes || 0;

      const blocExistant = calculerBlocReservation(
        rdv.heure,
        rdv.duree_minutes || 60, // Durée par défaut 60 min
        rdvTempsTrajet
      );

      // Vérifier le chevauchement
      if (blocsSeChevauche(
        blocReservation.debut_bloc,
        blocReservation.fin_bloc,
        blocExistant.debut_bloc,
        blocExistant.fin_bloc
      )) {
        conflits.push({
          rdv_id: rdv.id,
          heure: rdv.heure,
          bloc_debut: blocExistant.debut_bloc,
          bloc_fin: blocExistant.fin_bloc,
          client: rdv.client_nom || 'Client',
          service: rdv.service_nom || 'Service',
        });
      }
    }

    // 4. Déterminer la disponibilité
    const estDisponible = conflits.length === 0;

    // 5. Retourner le résultat complet
    return {
      disponible: estDisponible,
      date: date,
      heure_rdv: heure,
      bloc_reservation: {
        debut: blocReservation.debut_bloc,
        fin: blocReservation.fin_bloc,
        duree_totale_minutes: blocReservation.duree_totale_minutes,
      },
      trajet: trajetInfo,
      frais_deplacement: frais_deplacement,
      conflits: conflits,
      raison: estDisponible
        ? null
        : `Conflit avec ${conflits.length} RDV existant(s)`,
      message: estDisponible
        ? `Créneau disponible de ${blocReservation.debut_bloc} à ${blocReservation.fin_bloc}`
        : `Créneau indisponible - ${conflits.length} conflit(s) détecté(s)`,
    };

  } catch (error) {
    console.error('[DispoService] Erreur checkDisponibilite:', error);
    throw new Error(`Erreur vérification disponibilité: ${error.message}`);
  }
}

/**
 * Trouve les créneaux disponibles pour une date donnée
 *
 * @param {string} date - Date (YYYY-MM-DD)
 * @param {number} duree_service_minutes - Durée du service
 * @param {string} adresse_client - Adresse du client (optionnel)
 * @param {Array} rdv_existants - RDV existants
 * @param {Object} horaires - Horaires d'ouverture { debut: "HH:MM", fin: "HH:MM" }
 * @param {number} intervalle - Intervalle entre créneaux en minutes (défaut: 30)
 *
 * @returns {Promise<Array>} Liste des créneaux disponibles avec heure de fin
 */
export async function getCreneauxDisponibles(
  date,
  duree_service_minutes,
  adresse_client,
  rdv_existants = [],
  horairesParam = null, // Si null, utilise les horaires du jour
  intervalle = 30
) {
  // Obtenir les horaires du jour (priorité sur le paramètre)
  const horairesJour = getHorairesJour(date);

  // Si fermé ce jour-là, retourner liste vide
  if (horairesJour === null) {
    return []; // Dimanche fermé
  }

  // Utiliser les horaires du jour, ou ceux passés en paramètre si spécifiés
  const horaires = horairesParam || horairesJour;

  const creneauxDisponibles = [];

  // Calculer le temps de trajet une seule fois
  let temps_trajet_minutes = 0;
  let trajetInfo = null;

  if (adresse_client) {
    try {
      const distanceResult = await getDistanceFromSalon(adresse_client);
      temps_trajet_minutes = distanceResult.duree_minutes;
      const frais = calculerFraisDepl(distanceResult.distance_km);

      trajetInfo = {
        distance_km: distanceResult.distance_km,
        duree_minutes: distanceResult.duree_minutes,
        frais_deplacement: frais,
      };
    } catch (error) {
      console.error('[DispoService] Erreur calcul trajet:', error.message);
    }
  }

  // Parcourir les créneaux possibles
  const debutMinutes = heureEnMinutes(horaires.debut);
  const finMinutes = heureEnMinutes(horaires.fin);

  for (let minutes = debutMinutes; minutes < finMinutes; minutes += intervalle) {
    const heure = minutesEnHeure(minutes);

    // Calculer le bloc pour ce créneau
    const bloc = calculerBlocReservation(heure, duree_service_minutes, temps_trajet_minutes);

    // Vérifier si le bloc dépasse les horaires
    if (heureEnMinutes(bloc.fin_bloc) > finMinutes) {
      continue; // Créneau trop tard
    }

    // Vérifier les conflits
    let conflit = false;
    for (const rdv of rdv_existants) {
      const rdvTempsTrajet = rdv.temps_trajet_minutes || 0;
      const blocExistant = calculerBlocReservation(
        rdv.heure,
        rdv.duree_minutes || 60,
        rdvTempsTrajet
      );

      if (blocsSeChevauche(bloc.debut_bloc, bloc.fin_bloc, blocExistant.debut_bloc, blocExistant.fin_bloc)) {
        conflit = true;
        break;
      }
    }

    if (!conflit) {
      // Calculer l'heure de fin du service (sans le retour)
      const heureFin = minutesEnHeure(heureEnMinutes(heure) + duree_service_minutes);

      creneauxDisponibles.push({
        heure: heure,
        heure_fin: heureFin,
        bloc_debut: bloc.debut_bloc,
        bloc_fin: bloc.fin_bloc,
        duree_totale: bloc.duree_totale_minutes,
      });
    }
  }

  return creneauxDisponibles;
}

// Export des fonctions utilitaires
export {
  blocsSeChevauche,
  heureEnMinutes,
  minutesEnHeure,
};
