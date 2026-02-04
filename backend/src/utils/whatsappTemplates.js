/**
 * Templates de messages WhatsApp pour Fat's Hair-Afro
 * Messages concis, chaleureux et professionnels
 */

/**
 * Formate une date en français (ex: "samedi 24 janvier")
 */
function formatDateFr(dateStr) {
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  const date = new Date(dateStr + 'T12:00:00');
  return `${jours[date.getDay()]} ${date.getDate()} ${mois[date.getMonth()]}`;
}

/**
 * Formate la durée en texte (ex: "2h30" ou "1h")
 */
function formatDuree(minutes) {
  const heures = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${heures}h`;
  }
  return `${heures}h${mins.toString().padStart(2, '0')}`;
}

/**
 * Récupère le prénom ou nom du client
 */
function getPrenom(rdv) {
  return rdv.client_prenom || rdv.client_nom?.split(' ')[0] || 'Client';
}

/**
 * Message de confirmation de réservation
 * Envoyé après paiement de l'acompte
 *
 * @param {Object} rdv - Données du rendez-vous
 * @param {number} acompte - Montant de l'acompte payé
 * @returns {string} Message formaté
 */
export function confirmationReservation(rdv, acompte = 10) {
  const dateFr = formatDateFr(rdv.date);
  const duree = formatDuree(rdv.duree_minutes);
  const total = rdv.total || (rdv.prix_service + (rdv.frais_deplacement || 0));
  const reste = total - acompte;

  let message = `✅ Réservation confirmée !

📅 ${dateFr} à ${rdv.heure}
📍 ${rdv.adresse_client || rdv.adresse_formatee}
💇‍♀️ ${rdv.service_nom} (${duree})
💰 Total : ${total}€

Acompte réglé : ${acompte}€`;

  if (reste > 0) {
    message += `
Reste à payer : ${reste}€ (espèces/virement/PayPal)`;
  }

  message += `

À bientôt ! ✨
Fatou`;

  return message;
}

/**
 * Rappel J-1 (la veille du RDV)
 *
 * @param {Object} rdv - Données du rendez-vous
 * @param {number} acompte - Montant de l'acompte déjà payé
 * @returns {string} Message formaté
 */
export function rappelJ1(rdv, acompte = 10) {
  const prenom = getPrenom(rdv);
  const dateFr = formatDateFr(rdv.date);
  const duree = formatDuree(rdv.duree_minutes);
  const total = rdv.total || (rdv.prix_service + (rdv.frais_deplacement || 0));
  const reste = total - acompte;

  return `Bonjour ${prenom} ! 👋

Petit rappel pour demain :
📅 ${dateFr} à ${rdv.heure}
📍 ${rdv.adresse_client || rdv.adresse_formatee}
💰 Reste : ${reste}€

N'oubliez pas :
• Cheveux propres et démêlés si possible
• Prévoir environ ${duree}

Si besoin d'annuler, prévenez-moi vite !

À demain ! ✨
Fatou`;
}

/**
 * Message d'annulation
 *
 * @param {Object} rdv - Données du rendez-vous
 * @param {number} montantRembourse - Montant remboursé (0 si acompte retenu)
 * @returns {string} Message formaté
 */
export function annulation(rdv, montantRembourse = 0) {
  const prenom = getPrenom(rdv);
  const dateFr = formatDateFr(rdv.date);

  let message = `Bonjour ${prenom},

Votre RDV du ${dateFr} à ${rdv.heure} a été annulé.
`;

  if (montantRembourse > 0) {
    message += `
Remboursement : ${montantRembourse}€
Vous serez remboursé(e) sous 3-5 jours.`;
  } else {
    message += `
Acompte retenu : 10€
(Annulation > 24h après réservation)`;
  }

  message += `

N'hésitez pas à reprendre RDV ! 😊
Fatou`;

  return message;
}

/**
 * Message de modification de RDV
 *
 * @param {Object} ancienRdv - Ancien rendez-vous
 * @param {Object} nouveauRdv - Nouveau rendez-vous
 * @returns {string} Message formaté
 */
export function modificationRdv(ancienRdv, nouveauRdv) {
  const prenom = getPrenom(nouveauRdv);
  const ancienneDateFr = formatDateFr(ancienRdv.date);
  const nouvelleDateFr = formatDateFr(nouveauRdv.date);
  const total = nouveauRdv.total || (nouveauRdv.prix_service + (nouveauRdv.frais_deplacement || 0));

  return `Bonjour ${prenom} ! 📅

Votre RDV a été modifié :

❌ Ancien : ${ancienneDateFr} à ${ancienRdv.heure}
✅ Nouveau : ${nouvelleDateFr} à ${nouveauRdv.heure}

📍 ${nouveauRdv.adresse_client || nouveauRdv.adresse_formatee}
💰 Total : ${total}€

À bientôt ! ✨
Fatou`;
}

/**
 * Message de remerciement après prestation
 * Envoyé quelques heures après le RDV
 *
 * @param {Object} rdv - Données du rendez-vous
 * @returns {string} Message formaté
 */
export function remerciement(rdv) {
  const prenom = getPrenom(rdv);

  return `Bonjour ${prenom} ! 💜

Merci d'avoir fait confiance à Fat's Hair-Afro !

J'espère que vous êtes ravie de votre coiffure. ✨

N'hésitez pas à :
• Reprendre RDV 📅
• Partager une photo 📸
• Recommander à vos proches 💕

À bientôt !
Fatou`;
}

/**
 * Demande d'avis après prestation
 * Envoyé 1-2 jours après le RDV
 *
 * @param {Object} rdv - Données du rendez-vous
 * @param {string} lienAvis - URL du formulaire d'avis (optionnel)
 * @returns {string} Message formaté
 */
export function demandeAvis(rdv, lienAvis = 'https://fatshairafro.fr/avis') {
  const prenom = getPrenom(rdv);

  return `Bonjour ${prenom} ! 🌟

Comment s'est passé votre RDV ?

Votre avis compte beaucoup !
Notez votre expérience :

${lienAvis}

Merci ! 💜
Fatou`;
}

/**
 * Message de rappel de paiement
 * Envoyé si le paiement n'est pas effectué dans les temps
 *
 * @param {Object} rdv - Données du rendez-vous
 * @param {string} paymentUrl - URL de paiement
 * @param {number} minutesRestantes - Minutes avant expiration
 * @returns {string} Message formaté
 */
export function rappelPaiement(rdv, paymentUrl, minutesRestantes = 15) {
  const dateFr = formatDateFr(rdv.date);
  const total = rdv.total || (rdv.prix_service + (rdv.frais_deplacement || 0));

  return `⏰ Rappel : votre RDV n'est pas encore confirmé !

📅 ${dateFr} à ${rdv.heure}
💰 Total : ${total}€

👉 ${paymentUrl}

⚠️ Lien expire dans ${minutesRestantes} min

Fatou`;
}

/**
 * Message d'expiration du lien de paiement
 *
 * @param {Object} rdv - Données du rendez-vous
 * @returns {string} Message formaté
 */
export function expirationPaiement(rdv) {
  const dateFr = formatDateFr(rdv.date);

  return `⏰ Votre lien de paiement a expiré.

Le créneau ${dateFr} à ${rdv.heure} n'est plus réservé.

Pour reprendre RDV, envoyez "Bonjour" ! 😊
Fatou`;
}

// Export par défaut
export default {
  confirmationReservation,
  rappelJ1,
  annulation,
  modificationRdv,
  remerciement,
  demandeAvis,
  rappelPaiement,
  expirationPaiement,
  // Utilitaires
  formatDateFr,
  formatDuree,
};
