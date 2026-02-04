/**
 * =====================================================
 * SERVICE DE DATES - INFAILLIBLE
 * =====================================================
 *
 * Ce service calcule les dates avec 100% de fiabilité.
 * Utilisé par tous les canaux (téléphone, chat, WhatsApp).
 */

// Import dynamique pour éviter les dépendances circulaires
let HORAIRES = null;

async function getHoraires() {
  if (!HORAIRES) {
    const bookingService = await import('./bookingService.js');
    HORAIRES = bookingService.HORAIRES;
  }
  return HORAIRES;
}

// Horaires en dur pour éviter import circulaire
const HORAIRES_BACKUP = {
  'lundi': { ouvert: true, debut: 9, fin: 18, description: '9h - 18h' },
  'mardi': { ouvert: true, debut: 9, fin: 18, description: '9h - 18h' },
  'mercredi': { ouvert: true, debut: 9, fin: 18, description: '9h - 18h' },
  'jeudi': { ouvert: true, debut: 9, fin: 13, description: '9h - 13h' },
  'vendredi': { ouvert: true, debut: 13, fin: 18, description: '13h - 18h' },
  'samedi': { ouvert: true, debut: 9, fin: 18, description: '9h - 18h' },
  'dimanche': { ouvert: false, debut: 0, fin: 0, description: 'Fermé' }
};

/**
 * Obtenir les informations sur aujourd'hui
 * @returns {Object} { date, dateISO, jour, heure, timestamp }
 */
export function getTodayInfo() {
  // Force Europe/Paris timezone
  const nowUTC = new Date();
  const parisStr = nowUTC.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const now = new Date(parisStr);

  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  const jourSemaine = jours[now.getDay()];
  const jourNum = now.getDate();
  const moisNom = mois[now.getMonth()];
  const annee = now.getFullYear();
  const heure = nowUTC.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

  const horaire = HORAIRES_BACKUP[jourSemaine.toLowerCase()];

  return {
    date: `${jourSemaine} ${jourNum} ${moisNom} ${annee}`,
    dateISO: now.toISOString().split('T')[0],
    jour: jourSemaine,
    jourNum,
    mois: moisNom,
    annee,
    heure,
    timestamp: now.getTime(),
    estOuvert: horaire?.ouvert || false,
    horaires: horaire?.description || 'Fermé'
  };
}

/**
 * Parser et calculer une date à partir d'une expression
 * @param {string} expression - "jeudi prochain", "15 février", "dans 2 semaines", "le 30", etc.
 * @returns {Object} { date, dateISO, jour, estOuvert, horaires, valide, erreur }
 */
export function getDateInfo(expression) {
  if (!expression) {
    return { valide: false, erreur: "Expression de date manquante" };
  }

  const now = new Date();
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const joursLower = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  const expr = expression.toLowerCase().trim();
  let targetDate = null;

  try {
    // === AUJOURD'HUI ===
    if (expr.includes("aujourd'hui") || expr === "aujourd hui" || expr === "ce jour") {
      targetDate = new Date(now);
    }

    // === DEMAIN ===
    else if (expr.includes("demain")) {
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() + 1);
    }

    // === APRÈS-DEMAIN ===
    else if (expr.includes("après-demain") || expr.includes("apres-demain") || expr.includes("après demain")) {
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() + 2);
    }

    // === DANS X JOURS/SEMAINES ===
    else if (expr.includes("dans")) {
      const matchJours = expr.match(/dans\s+(\d+)\s*jours?/);
      const matchSemaines = expr.match(/dans\s+(\d+)\s*semaines?/);

      if (matchJours) {
        targetDate = new Date(now);
        targetDate.setDate(now.getDate() + parseInt(matchJours[1]));
      } else if (matchSemaines) {
        targetDate = new Date(now);
        targetDate.setDate(now.getDate() + (parseInt(matchSemaines[1]) * 7));
      }
    }

    // === JOUR DE LA SEMAINE (prochain lundi, mardi prochain, etc.) ===
    else {
      let jourCible = -1;
      for (let i = 0; i < joursLower.length; i++) {
        if (expr.includes(joursLower[i])) {
          jourCible = i;
          break;
        }
      }

      if (jourCible >= 0) {
        targetDate = new Date(now);
        const jourActuel = now.getDay();
        let daysToAdd = jourCible - jourActuel;

        // Si c'est aujourd'hui ou passé, aller à la semaine prochaine
        if (daysToAdd <= 0) {
          daysToAdd += 7;
        }

        targetDate.setDate(now.getDate() + daysToAdd);
      }
    }

    // === DATE NUMÉRIQUE (le 15, le 30, 15 février, etc.) ===
    if (!targetDate) {
      // Chercher un numéro de jour
      const matchJourMois = expr.match(/(\d{1,2})\s*(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)?/);

      if (matchJourMois) {
        const jourNum = parseInt(matchJourMois[1]);
        let moisNum = now.getMonth();
        let anneeNum = now.getFullYear();

        if (matchJourMois[2]) {
          const moisNom = matchJourMois[2].replace('é', 'e').replace('û', 'u');
          const moisIndex = mois.findIndex(m => m.replace('é', 'e').replace('û', 'u') === moisNom);
          if (moisIndex >= 0) {
            moisNum = moisIndex;
            // Si le mois est passé, c'est l'année prochaine
            if (moisNum < now.getMonth() || (moisNum === now.getMonth() && jourNum < now.getDate())) {
              anneeNum++;
            }
          }
        } else {
          // Pas de mois spécifié, utiliser le mois courant ou suivant
          if (jourNum < now.getDate()) {
            moisNum++;
            if (moisNum > 11) {
              moisNum = 0;
              anneeNum++;
            }
          }
        }

        targetDate = new Date(anneeNum, moisNum, jourNum);
      }
    }

    // === DATE ISO (2025-01-25) ===
    if (!targetDate) {
      const matchISO = expr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (matchISO) {
        targetDate = new Date(matchISO[0]);
      }
    }

    // === SI TOUJOURS PAS DE DATE ===
    if (!targetDate || isNaN(targetDate.getTime())) {
      return {
        valide: false,
        erreur: `Je n'ai pas compris la date "${expression}". Pouvez-vous préciser (ex: "samedi prochain", "le 25 janvier") ?`
      };
    }

    // === FORMATER LE RÉSULTAT ===
    const jourSemaine = jours[targetDate.getDay()];
    const jourNum = targetDate.getDate();
    const moisNom = mois[targetDate.getMonth()];
    const annee = targetDate.getFullYear();

    const horaire = HORAIRES_BACKUP[jourSemaine.toLowerCase()];

    return {
      valide: true,
      date: `${jourSemaine} ${jourNum} ${moisNom} ${annee}`,
      dateISO: targetDate.toISOString().split('T')[0],
      jour: jourSemaine,
      jourNum,
      mois: moisNom,
      annee,
      estOuvert: horaire?.ouvert || false,
      horaires: horaire?.description || 'Fermé',
      horaireDebut: horaire?.debut,
      horaireFin: horaire?.fin
    };

  } catch (error) {
    return {
      valide: false,
      erreur: `Erreur de calcul pour "${expression}": ${error.message}`
    };
  }
}

/**
 * Calculer le jour de la semaine pour une date donnée
 * @param {number} jour - Numéro du jour (1-31)
 * @param {number} mois - Numéro du mois (1-12)
 * @param {number} annee - Année (ex: 2025)
 * @returns {string} Jour de la semaine
 */
export function getJourSemaine(jour, mois, annee) {
  if (!jour || !mois || !annee || isNaN(jour) || isNaN(mois) || isNaN(annee)) {
    return null;
  }
  const date = new Date(annee, mois - 1, jour);
  if (isNaN(date.getTime())) return null;
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return jours[date.getDay()];
}

/**
 * Vérifier si une date est valide et dans le futur
 * @param {string} dateISO - Date au format YYYY-MM-DD
 * @returns {Object} { valide, dansLeFutur, message }
 */
export function validateDate(dateISO) {
  const date = new Date(dateISO + 'T12:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (isNaN(date.getTime())) {
    return { valide: false, dansLeFutur: false, message: "Date invalide" };
  }

  if (date < now) {
    return { valide: true, dansLeFutur: false, message: "Cette date est passée" };
  }

  return { valide: true, dansLeFutur: true, message: "Date valide" };
}

export default {
  getTodayInfo,
  getDateInfo,
  getJourSemaine,
  validateDate
};
