/**
 * AGENT TÉLÉPHONIQUE HALIMAH
 * Utilise le prompt unifié de bookingService
 * VOUVOIEMENT obligatoire
 *
 * MIGRÉ VERS NEXUS CORE - Janvier 2026
 * Variable USE_NEXUS_PHONE=true pour activer le nouveau handler
 */

import Anthropic from '@anthropic-ai/sdk';
import bookingService from './bookingService.js';
// NEXUS CORE UNIFIÉ - Source unique de logique métier
import nexusCore from '../core/unified/nexusCore.js';

// Flag pour utiliser nexusCore
const USE_NEXUS_PHONE = process.env.USE_NEXUS_PHONE === 'true';

// Store des contextes nexusCore pour téléphone (par callSid)
const nexusPhoneContexts = new Map();

const {
  // Constantes
  SERVICES,
  SERVICES_LIST,
  HORAIRES,
  SALON_INFO,
  DEPLACEMENT,
  // Fonctions dates
  getTodayInfo,
  getDateInfo,
  // Fonctions utilitaires
  calculateDistance,
  calculateTravelFee,
  getServiceInfo,
  checkHoraires,
  checkAvailability,
  // Fonctions avec créneaux réels
  calculateRealSlot,
  checkHorairesComplet,
  checkAvailabilityComplete,
  // Prompt unifié
  getHalimahPrompt,
  // Autres
  createAppointment,
  sendConfirmationSMS,
  parseJourToDate,
  formatDateToText
} = bookingService;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const conversations = new Map();

const STATES = {
  ACCUEIL: 'accueil',
  ATTENTE_SERVICE: 'attente_service',
  ATTENTE_JOUR: 'attente_jour',
  ATTENTE_HEURE: 'attente_heure',
  ATTENTE_ADRESSE: 'attente_adresse',
  ATTENTE_CONFIRMATION: 'attente_confirmation',
  ATTENTE_NOM: 'attente_nom',
  ATTENTE_TELEPHONE: 'attente_telephone',
  TERMINE: 'termine'
};

// ============================================
// PERSONNALITÉ HALIMAH (PROMPT UNIFIÉ)
// ============================================

// Utilise le prompt centralisé de bookingService
const PERSONNALITE = getHalimahPrompt('telephone', true);

// ============================================
// FONCTION PRINCIPALE
// ============================================

export async function getVoiceResponse(callSid, userMessage, isFirstMessage = false) {
  console.log('[HALIMAH TEL] ========================================');
  console.log('[HALIMAH TEL] CallSid:', callSid);
  console.log('[HALIMAH TEL] Message:', userMessage?.substring(0, 50));

  try {
    let conv = conversations.get(callSid);
    if (!conv) {
      conv = createNewConversation(callSid);
      conversations.set(callSid, conv);
    }

    // === ACCUEIL ===
    if (isFirstMessage || conv.state === STATES.ACCUEIL) {
      conv.state = STATES.ATTENTE_SERVICE;
      conversations.set(callSid, conv);

      // Bonjour/Bonsoir selon l'heure (bonsoir à partir de 18h)
      const heure = new Date().getHours();
      const salutation = heure >= 18 ? 'bonsoir' : 'bonjour';

      return response(
        `Fat's Hair-Afro ${salutation} ! Qu'est-ce qui vous ferait plaisir ?`,
        false
      );
    }

    const msg = userMessage.toLowerCase().trim();
    conv.history.push({ role: 'user', content: userMessage });

    // === TRANSFERT VERS FATOU ===
    if (wantsToTalkToFatou(msg)) {
      if (!conv.data.prenom) {
        conv.wantsTransfer = true;
        return saveAndRespond(conv, "Bien sûr ! C'est de la part de qui ?", false);
      }
      return {
        response: `Je vous passe Fatou, ${conv.data.prenom}. Ne quittez pas !`,
        shouldEndCall: false,
        shouldTransfer: true,
        clientName: conv.data.prenom
      };
    }

    if (conv.wantsTransfer) {
      const prenom = extractPrenom(userMessage);
      if (prenom) {
        conv.data.prenom = prenom;
        return {
          response: `Merci ${prenom} ! Je vous passe Fatou. Ne quittez pas !`,
          shouldEndCall: false,
          shouldTransfer: true,
          clientName: prenom
        };
      }
    }

    // === EXTRACTION DES INFOS ===
    extractAllInfo(conv, msg, userMessage);

    // === PROGRESSION AUTOMATIQUE ===
    if (conv.data.service && conv.state === STATES.ATTENTE_SERVICE) {
      conv.state = STATES.ATTENTE_JOUR;
    }

    if (conv.data.jour && conv.state === STATES.ATTENTE_JOUR) {
      if (conv.data.jour.toLowerCase() === 'dimanche') {
        conv.data.jour = null;
        return saveAndRespond(conv,
          "Fatou ne travaille pas le dimanche. Quel autre jour vous conviendrait ?",
          false
        );
      }
      conv.state = STATES.ATTENTE_HEURE;
    }

    if (conv.data.heure && conv.state === STATES.ATTENTE_HEURE) {
      const horaireCheck = checkHoraires(conv.data.jour, conv.data.heure);
      if (!horaireCheck.ok) {
        conv.data.heure = null;
        return saveAndRespond(conv, horaireCheck.message, false);
      }
      conv.state = STATES.ATTENTE_ADRESSE;
    }

    // === MACHINE À ÉTATS ===
    switch (conv.state) {

      case STATES.ATTENTE_SERVICE:
        return saveAndRespond(conv,
          "Qu'est-ce qui vous ferait plaisir ? Tresses, nattes, locks, soins... ?",
          false
        );

      case STATES.ATTENTE_JOUR:
        return saveAndRespond(conv,
          `${conv.data.service.nom}, excellent choix ! Quel jour vous arrangerait ?`,
          false
        );

      case STATES.ATTENTE_HEURE:
        return saveAndRespond(conv,
          `${conv.data.jour}, parfait ! À quelle heure ?`,
          false
        );

      case STATES.ATTENTE_ADRESSE:
        if (conv.data.adresse) {
          const distResult = await calculateDistance(conv.data.adresse);

          if (distResult.distance) {
            conv.data.distance = distResult.distance;
            conv.data.tempsTrajet = distResult.duree || 0; // Temps de trajet en minutes
            const fraisResult = calculateTravelFee(distResult.distance);
            conv.data.fraisDeplacement = fraisResult.frais;
            conv.data.prixTotal = conv.data.service.prix + conv.data.fraisDeplacement;

            console.log(`[HALIMAH TEL] Distance: ${conv.data.distance}km, Trajet: ${conv.data.tempsTrajet}min, Frais: ${conv.data.fraisDeplacement}€`);

            // Vérifier que le RDV peut FINIR avant la fermeture (durée + trajet A/R + marge)
            const horaireComplet = checkHorairesComplet(
              conv.data.jour,
              conv.data.heure,
              conv.data.service.duree,
              conv.data.tempsTrajet
            );

            if (!horaireComplet.ok) {
              conv.data.heure = null;
              conv.state = STATES.ATTENTE_HEURE;
              return saveAndRespond(conv, horaireComplet.message, false);
            }

            // Vérifier disponibilité avec créneaux RÉELS (durée + trajet + marge)
            const dateRdv = parseJourToDate(conv.data.jour);
            const dispo = await checkAvailabilityComplete(
              dateRdv,
              conv.data.heure,
              conv.data.service.duree,
              conv.data.tempsTrajet
            );

            if (!dispo.available) {
              conv.data.heure = null;
              conv.state = STATES.ATTENTE_HEURE;
              return saveAndRespond(conv,
                `Ce créneau est déjà pris. ${dispo.suggestion || 'Quelle autre heure vous conviendrait ?'}`,
                false
              );
            }

            conv.state = STATES.ATTENTE_CONFIRMATION;

            const fraisText = conv.data.fraisDeplacement > 0
              ? `, plus ${conv.data.fraisDeplacement} euros de déplacement`
              : ', sans frais de déplacement';

            return saveAndRespond(conv,
              `Récapitulatif : ${conv.data.service.nom} à ${conv.data.service.prix} euros${fraisText}. ` +
              `Total : ${conv.data.prixTotal} euros. ${conv.data.jour} à ${conv.data.heure}h chez vous. Je confirme ?`,
              false
            );
          } else {
            conv.data.adresse = null;
            return saveAndRespond(conv,
              "Je n'ai pas trouvé cette adresse. Pouvez-vous me la redonner avec la ville ?",
              false
            );
          }
        }
        return saveAndRespond(conv,
          "Très bien ! Quelle est votre adresse complète ? Je calcule les frais de déplacement.",
          false
        );

      case STATES.ATTENTE_CONFIRMATION:
        if (isYes(msg)) {
          conv.state = STATES.ATTENTE_NOM;
          return saveAndRespond(conv, "Parfait ! Votre prénom ?", false);
        }
        if (isNo(msg)) {
          conv.state = STATES.ATTENTE_SERVICE;
          conv.data = { service: null, jour: null, heure: null, adresse: null, prenom: null, telephone: null };
          return saveAndRespond(conv,
            "Pas de souci ! Que puis-je faire pour vous ?",
            false
          );
        }
        return saveAndRespond(conv,
          "Je confirme votre rendez-vous ?",
          false
        );

      case STATES.ATTENTE_NOM:
        const prenom = extractPrenom(userMessage);
        if (prenom) {
          conv.data.prenom = prenom;
          conv.state = STATES.ATTENTE_TELEPHONE;
          return saveAndRespond(conv,
            `Merci ${prenom} ! Votre numéro de téléphone pour la confirmation SMS ?`,
            false
          );
        }
        return saveAndRespond(conv, "Quel est votre prénom ?", false);

      case STATES.ATTENTE_TELEPHONE:
        const telephone = extractTelephone(userMessage);
        if (telephone) {
          conv.data.telephone = telephone;

          console.log('[HALIMAH TEL] Création du RDV...');
          console.log('[HALIMAH TEL] Données:', JSON.stringify(conv.data, null, 2));

          const result = await createAppointment({
            clientPrenom: conv.data.prenom,  // Prénom collecté par téléphone
            clientPhone: conv.data.telephone,
            clientAddress: conv.data.adresse,
            service: conv.data.service.nom,
            jour: conv.data.jour,
            heure: conv.data.heure,
            source: 'telephone',
            notes: `Appel téléphonique - ${callSid}`
          });

          if (result.success) {
            console.log('[HALIMAH TEL] ✅ RDV créé:', result.rdv?.id);

            await sendConfirmationSMS(conv.data.telephone, {
              service: conv.data.service.nom,
              date: result.summary?.date || conv.data.jour,
              heure: conv.data.heure,
              prixTotal: result.summary?.prixTotal || conv.data.prixTotal,
              fraisDeplacement: result.summary?.fraisDeplacement || conv.data.fraisDeplacement,
              adresse: conv.data.adresse
            });

            conv.state = STATES.TERMINE;
            conversations.set(callSid, conv);

            return response(
              `C'est confirmé ${conv.data.prenom} ! ${conv.data.service.nom} ${conv.data.jour} à ${conv.data.heure}h ` +
              `pour ${conv.data.prixTotal} euros. Vous allez recevoir un SMS de confirmation. À très bientôt !`,
              true
            );
          } else {
            console.error('[HALIMAH TEL] Erreur création:', result.error);
            conv.state = STATES.TERMINE;

            return response(
              `Merci ${conv.data.prenom} ! Je transmets votre demande à Fatou qui vous rappellera pour confirmer. À bientôt !`,
              true
            );
          }
        }
        return saveAndRespond(conv,
          "Quel est votre numéro de téléphone ?",
          false
        );

      default:
        return await generateAIResponse(conv, msg);
    }

  } catch (error) {
    console.error('[HALIMAH TEL] ❌ ERREUR:', error.message);
    console.error('[HALIMAH TEL] Stack:', error.stack?.substring(0, 300));

    return response(
      "Excusez-moi, petit souci technique ! Vous pouvez rappeler ou envoyer un SMS au 07 82 23 50 20.",
      true
    );
  }
}

// ============================================
// NOUVEAU HANDLER NEXUS CORE
// ============================================

/**
 * Handler téléphone utilisant NEXUS CORE
 * Source unique de logique métier
 *
 * @param {string} callSid - ID de l'appel Twilio
 * @param {string} userMessage - Message vocal transcrit
 * @param {boolean} isFirstMessage - Premier message de l'appel
 * @returns {Object} { response, shouldEndCall, shouldTransfer? }
 */
export async function getVoiceResponseNexus(callSid, userMessage, isFirstMessage = false) {
  console.log('[HALIMAH TEL-NEXUS] ========================================');
  console.log('[HALIMAH TEL-NEXUS] CallSid:', callSid);
  console.log('[HALIMAH TEL-NEXUS] Message:', userMessage?.substring(0, 50));

  try {
    // Récupérer ou créer le contexte nexusCore
    let ctx = nexusPhoneContexts.get(callSid);
    if (!ctx) {
      ctx = nexusCore.createConversationContext('phone');
      nexusPhoneContexts.set(callSid, ctx);
    }

    // === ACCUEIL ===
    if (isFirstMessage) {
      // Bonjour/Bonsoir selon l'heure (bonsoir à partir de 18h)
      const heure = new Date().getHours();
      const salutation = heure >= 18 ? 'bonsoir' : 'bonjour';
      return {
        response: `Fat's Hair-Afro ${salutation} ! Qu'est-ce qui vous ferait plaisir ?`,
        shouldEndCall: false
      };
    }

    const msg = userMessage.toLowerCase().trim();

    // === TRANSFERT VERS FATOU ===
    if (wantsToTalkToFatou(msg)) {
      if (!ctx.data.prenom) {
        ctx.wantsTransfer = true;
        nexusPhoneContexts.set(callSid, ctx);
        return {
          response: "Bien sûr ! C'est de la part de qui ?",
          shouldEndCall: false
        };
      }
      return {
        response: `Je vous passe Fatou, ${ctx.data.prenom}. Ne quittez pas !`,
        shouldEndCall: false,
        shouldTransfer: true,
        clientName: ctx.data.prenom
      };
    }

    // Gestion du transfert en attente de prénom
    if (ctx.wantsTransfer) {
      const prenom = extractPrenom(userMessage);
      if (prenom) {
        ctx.data.prenom = prenom;
        ctx.wantsTransfer = false;
        nexusPhoneContexts.set(callSid, ctx);
        return {
          response: `Merci ${prenom} ! Je vous passe Fatou. Ne quittez pas !`,
          shouldEndCall: false,
          shouldTransfer: true,
          clientName: prenom
        };
      }
    }

    // === TRAITER LE MESSAGE VIA NEXUS CORE (async) ===
    const result = await nexusCore.processMessage(userMessage, ctx, 'phone');
    console.log('[HALIMAH TEL-NEXUS] État:', result.context.state);

    // === CRÉATION DE RÉSERVATION ===
    if (result.action === 'CREATE_BOOKING' && result.bookingData) {
      try {
        const dateFormatee = result.context.data.dateFormatee || '';
        const jourMatch = dateFormatee.match(/^(\w+)/);
        const jour = jourMatch ? jourMatch[1].toLowerCase() : null;

        // Calculer les frais de déplacement si domicile
        let fraisDeplacement = 0;
        let prixTotal = result.bookingData.prixService;

        if (result.bookingData.lieu === 'domicile' && result.bookingData.adresse) {
          const distResult = await calculateDistance(result.bookingData.adresse);
          if (distResult && distResult.distance) {
            const fraisResult = calculateTravelFee(distResult.distance);
            fraisDeplacement = fraisResult.frais || 0;
            prixTotal += fraisDeplacement;
          }
        }

        const booking = await createAppointment({
          clientPrenom: result.bookingData.prenom,
          clientPhone: result.bookingData.telephone,
          clientAddress: result.bookingData.lieu === 'domicile' ? result.bookingData.adresse : null,
          service: result.bookingData.service,
          jour: jour,
          heure: result.bookingData.heure,
          source: 'telephone-nexus',
          notes: `Appel téléphonique (nexusCore) - ${callSid}`
        });

        console.log('[HALIMAH TEL-NEXUS] Booking:', booking.success ? '✅' : '❌', booking.error || '');

        if (booking.success) {
          // Envoyer SMS de confirmation
          await sendConfirmationSMS(result.bookingData.telephone, {
            service: result.bookingData.service,
            date: result.context.data.dateFormatee,
            heure: result.bookingData.heure,
            prixTotal: prixTotal,
            fraisDeplacement: fraisDeplacement,
            adresse: result.bookingData.adresse
          });

          nexusPhoneContexts.set(callSid, result.context);

          const fraisText = fraisDeplacement > 0 ? `, dont ${fraisDeplacement} euros de déplacement` : '';
          return {
            response: `C'est confirmé ${result.bookingData.prenom} ! ${result.bookingData.service} ${result.context.data.dateFormatee} à ${result.bookingData.heure} pour ${prixTotal} euros${fraisText}. Vous allez recevoir un SMS de confirmation. À très bientôt !`,
            shouldEndCall: true
          };
        } else {
          // Booking échoué - proposer une autre date
          result.response = `Désolé, ce créneau n'est plus disponible. ${booking.error || ''} Quel autre jour vous conviendrait ?`;
          result.context.state = nexusCore.CONVERSATION_STATES.ATTENTE_DATE;
        }
      } catch (bookingErr) {
        console.error('[HALIMAH TEL-NEXUS] Erreur booking:', bookingErr);
        return {
          response: `Merci ${result.bookingData.prenom} ! Je transmets votre demande à Fatou qui vous rappellera pour confirmer. À bientôt !`,
          shouldEndCall: true
        };
      }
    }

    // Mettre à jour le contexte
    nexusPhoneContexts.set(callSid, result.context);

    // Retourner la réponse
    const shouldEnd = result.context.state === nexusCore.CONVERSATION_STATES.TERMINE;

    return {
      response: result.response,
      shouldEndCall: shouldEnd
    };

  } catch (error) {
    console.error('[HALIMAH TEL-NEXUS] ❌ ERREUR:', error.message);
    console.error('[HALIMAH TEL-NEXUS] Stack:', error.stack?.substring(0, 300));

    return {
      response: "Excusez-moi, petit souci technique ! Vous pouvez rappeler ou envoyer un SMS au 07 82 23 50 20.",
      shouldEndCall: true
    };
  }
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

function createNewConversation(callSid) {
  return {
    callSid,
    state: STATES.ACCUEIL,
    history: [],
    data: {
      service: null,
      jour: null,
      heure: null,
      adresse: null,
      distance: null,
      fraisDeplacement: 0,
      prixTotal: null,
      prenom: null,
      telephone: null
    },
    wantsTransfer: false,
    startTime: Date.now()
  };
}

function response(text, endCall) {
  return {
    response: text,
    shouldEndCall: endCall,
    shouldTransfer: false
  };
}

function saveAndRespond(conv, text, endCall) {
  conv.history.push({ role: 'assistant', content: text });
  conversations.set(conv.callSid, conv);
  return response(text, endCall);
}

function extractAllInfo(conv, msgLower, msgOriginal) {
  if (!conv.data.service) {
    for (const [key, value] of Object.entries(SERVICES)) {
      if (msgLower.includes(key)) {
        conv.data.service = value;
        console.log('[HALIMAH TEL] Service détecté:', value.nom);
        break;
      }
    }
  }

  if (!conv.data.jour) {
    const jours = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    for (const jour of jours) {
      if (msgLower.includes(jour)) {
        conv.data.jour = jour.charAt(0).toUpperCase() + jour.slice(1);
        console.log('[HALIMAH TEL] Jour détecté:', conv.data.jour);
        break;
      }
    }
    if (!conv.data.jour) {
      if (msgLower.includes('demain')) conv.data.jour = 'Demain';
      if (msgLower.includes("aujourd'hui") || msgLower.includes('aujourd hui')) conv.data.jour = "Aujourd'hui";
    }
  }

  if (!conv.data.heure) {
    const heureMatch = msgLower.match(/(\d{1,2})\s*[h:]/i) || msgLower.match(/(\d{1,2})\s*heure/i);
    if (heureMatch) {
      conv.data.heure = heureMatch[1];
      console.log('[HALIMAH TEL] Heure détectée:', conv.data.heure);
    }
  }

  if (!conv.data.adresse && conv.state === STATES.ATTENTE_ADRESSE) {
    if (isAddress(msgOriginal)) {
      conv.data.adresse = msgOriginal;
      console.log('[HALIMAH TEL] Adresse détectée:', conv.data.adresse);
    }
  }
}

function extractPrenom(msg) {
  const cleaned = msg.trim().replace(/^(je m'appelle|c'est|moi c'est|je suis)\s*/i, '');
  const words = cleaned.split(/\s+/);

  for (const word of words) {
    const prenom = word.replace(/[^a-zA-ZÀ-ÿ\-]/g, '');
    if (prenom.length >= 2 && prenom.length <= 20) {
      return prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase();
    }
  }
  return null;
}

function extractTelephone(msg) {
  const cleaned = msg.replace(/[\s.\-]/g, '');
  const match = cleaned.match(/(0[67]\d{8})/);
  return match ? match[1] : null;
}

function isAddress(msg) {
  if (/\d+.*(?:rue|avenue|boulevard|allée|place|chemin|impasse)/i.test(msg)) return true;

  const villes = [
    'paris', 'argenteuil', 'franconville', 'sarcelles', 'pontoise',
    'cergy', 'enghien', 'montmorency', 'ermont', 'eaubonne',
    'saint-denis', 'aubervilliers', 'bobigny', 'montreuil', 'vincennes',
    'nanterre', 'boulogne', 'levallois', 'neuilly', 'courbevoie', 'colombes',
    'sartrouville', 'houilles', 'bezons', 'cormeilles', 'herblay',
    'taverny', 'saint-gratien', 'deuil', 'groslay', 'montmagny'
  ];

  for (const ville of villes) {
    if (msg.toLowerCase().includes(ville)) return true;
  }
  return false;
}

function wantsToTalkToFatou(msg) {
  return (msg.includes('fatou') && (msg.includes('parler') || msg.includes('passer')));
}

function isYes(msg) {
  return /\b(oui|ok|d'accord|parfait|super|confirme|c'est bon|yes|ouais|exactement)\b/i.test(msg);
}

function isNo(msg) {
  return /\b(non|pas|annule|changer|autre|différent)\b/i.test(msg);
}

async function generateAIResponse(conv, msg) {
  try {
    let context = '\n\nCONTEXTE:';
    context += `\nÉtat: ${conv.state}`;
    if (conv.data.service) context += `\nService: ${conv.data.service.nom} (${conv.data.service.prix}€)`;
    if (conv.data.jour) context += `\nJour: ${conv.data.jour}`;
    if (conv.data.heure) context += `\nHeure: ${conv.data.heure}h`;
    if (conv.data.adresse) context += `\nAdresse: ${conv.data.adresse}`;
    if (conv.data.prenom) context += `\nPrénom: ${conv.data.prenom}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 80,
      system: PERSONNALITE + context + '\n\nRÈGLE ABSOLUE: Tu VOUVOIES toujours le client.',
      messages: conv.history.slice(-6)
    });

    let reply = response.content[0].text;
    if (conv.history.length > 2) {
      reply = reply.replace(/^(Bonjour|Salut)[,!.\s]*/i, '').trim();
    }

    return saveAndRespond(conv, reply, false);
  } catch (error) {
    console.error('[HALIMAH TEL] Erreur IA:', error.message);
    return saveAndRespond(conv, "Excusez-moi, pouvez-vous répéter ?", false);
  }
}

// ============================================
// EXPORTS
// ============================================

export function cleanupConversation(callSid) {
  conversations.delete(callSid);
  console.log('[HALIMAH TEL] Conversation nettoyée:', callSid);
}

export function getConversationStats() {
  return {
    activeConversations: conversations.size,
    callSids: Array.from(conversations.keys())
  };
}

export function trackConversation(callSid) {
  if (!conversations.has(callSid)) {
    conversations.set(callSid, createNewConversation(callSid));
  }
}

// Nettoyage périodique des vieilles conversations (plus de 30 min)
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000;

  for (const [callSid, data] of conversations.entries()) {
    if (data.startTime && (now - data.startTime > maxAge)) {
      console.log(`[HALIMAH TEL] Auto-nettoyage conversation expirée: ${callSid}`);
      conversations.delete(callSid);
    }
  }
}, 10 * 60 * 1000);

export default {
  getVoiceResponse,
  getVoiceResponseNexus, // NOUVEAU - utilise nexusCore
  cleanupConversation,
  getConversationStats,
  trackConversation,
  USE_NEXUS_PHONE // Flag pour activer nexusCore
};
