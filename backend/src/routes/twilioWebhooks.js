/**
 * Routes Twilio pour Halimah Voice AI
 * Conversation naturelle au téléphone avec Claude IA
 *
 * Numéro Twilio : +33 9 39 24 02 69
 *
 * 🔒 UTILISE NEXUS CORE UNIFIÉ - Source unique de vérité
 */

import express from 'express';
import twilio from 'twilio';
import {
  getVoiceResponseNexus,
  cleanupConversation as cleanupVoiceService,
  getConversationStats,
  trackConversation
} from '../services/voiceAIService.js';
// 🔒 NEXUS CORE UNIFIÉ - Remplace halimahAI
import {
  processMessage,
  clearConversation,
  SALON_INFO
} from '../core/unified/nexusCore.js';
import voiceService from '../services/voiceService.js';
import { logCallStart, logCallEnd, logSMS, logSMSStatus } from '../modules/twilio/callLogService.js';

const router = express.Router();

// Sessions de conversation pour la voix (CallSid -> état)
const voiceSessions = new Map();

/**
 * 🔒 Handler voix unifié - Utilise NEXUS CORE
 */
async function handleVoice(callSid, message, isFirst) {
  const conversationId = `voice_${callSid}`;

  console.log(`[TWILIO NEXUS] === handleVoice ===`);
  console.log(`[TWILIO NEXUS] CallSid: ${callSid}`);
  console.log(`[TWILIO NEXUS] isFirst: ${isFirst}`);
  console.log(`[TWILIO NEXUS] Message: "${message}"`);
  console.log(`[TWILIO NEXUS] 🔑 ANTHROPIC_API_KEY présente: ${!!process.env.ANTHROPIC_API_KEY}`);

  try {
    // Premier message = accueil
    if (isFirst) {
      // Initialiser la session
      voiceSessions.set(callSid, { startTime: Date.now() });

      // Message d'accueil via NEXUS CORE
      console.log(`[TWILIO NEXUS] 🚀 Appel processMessage('bonjour', 'phone')...`);
      const result = await processMessage('bonjour', 'phone', {
        conversationId,
        phone: callSid
      });
      console.log(`[TWILIO NEXUS] ✅ Réponse reçue: success=${result.success}, durée=${result.duration}ms`);

      return {
        response: result.response,
        shouldEndCall: false,
        shouldTransfer: false
      };
    }

    // Commandes spéciales
    const msgLower = message.toLowerCase().trim();

    // Demande de transfert vers Fatou
    if (msgLower.includes('parler à fatou') || msgLower.includes('parler a fatou') ||
        msgLower.includes('transférer') || msgLower.includes('transferer') ||
        msgLower.includes('fatou directement')) {
      return {
        response: "Je vous transfère vers Fatou. Un instant s'il vous plaît.",
        shouldEndCall: false,
        shouldTransfer: true
      };
    }

    // Fin de conversation
    if (msgLower === 'au revoir' || msgLower === 'merci au revoir' || msgLower === 'bonne journée') {
      // Nettoyer la session
      clearConversation(conversationId);
      voiceSessions.delete(callSid);

      return {
        response: `Merci d'avoir appelé ${SALON_INFO.nom}. À très bientôt !`,
        shouldEndCall: true,
        shouldTransfer: false
      };
    }

    // Message normal - traiter avec NEXUS CORE
    console.log(`[TWILIO NEXUS] 🚀 Appel processMessage('${message.substring(0, 50)}...', 'phone')...`);
    const result = await processMessage(message, 'phone', {
      conversationId,
      phone: callSid
    });
    console.log(`[TWILIO NEXUS] ✅ Réponse reçue: success=${result.success}, durée=${result.duration}ms`);

    // Détecter si la réservation est confirmée (fin de conversation naturelle)
    const isBookingConfirmed = result.response.toLowerCase().includes('confirmé') &&
                               result.response.toLowerCase().includes('rendez-vous');

    return {
      response: result.response,
      shouldEndCall: isBookingConfirmed,
      shouldTransfer: false
    };

  } catch (error) {
    console.error('[TWILIO NEXUS] ❌ ERREUR DÉTAILLÉE:');
    console.error('[TWILIO NEXUS] ❌ Type:', error.constructor?.name);
    console.error('[TWILIO NEXUS] ❌ Message:', error.message);
    console.error('[TWILIO NEXUS] ❌ Stack:', error.stack?.substring(0, 500));
    return {
      response: "Excusez-moi, j'ai un petit problème. Pouvez-vous répéter ?",
      shouldEndCall: false,
      shouldTransfer: false
    };
  }
}

/**
 * Nettoyer session quand l'appel se termine
 */
function cleanupVoiceSession(callSid) {
  const conversationId = `voice_${callSid}`;
  clearConversation(conversationId);
  voiceSessions.delete(callSid);
}
const VoiceResponse = twilio.twiml.VoiceResponse;
const MessagingResponse = twilio.twiml.MessagingResponse;

// Numéros de téléphone
const FATOU_PHONE = process.env.FATOU_PHONE_NUMBER || '+33782235020';
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER || '+33939240269';

// Configuration voix naturelle française (Amazon Polly via Twilio)
const VOICE_CONFIG = {
  voice: 'Polly.Lea', // Voix française féminine naturelle
  language: 'fr-FR'
};

// Hints pour améliorer la reconnaissance vocale Twilio
// Ces mots-clés aident l'IA de transcription à mieux comprendre le contexte
const SPEECH_HINTS = [
  // Services Fatou
  'locks', 'microlocks', 'crochet', 'twist', 'décapage', 'reprise', 'racines',
  'braids', 'tresses', 'nattes', 'collées', 'rajout', 'rajouts',
  'soin', 'soins', 'shampoing', 'brushing', 'hydratant',
  'teinture', 'décoloration', 'coloration',
  // Jours
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
  'demain', 'après-demain', 'semaine prochaine', 'prochain', 'prochaine',
  // Heures
  'matin', 'après-midi', 'midi', 'heure', 'heures',
  // Confirmations
  'oui', 'non', 'parfait', 'ok', "d'accord", 'bien sûr', 'absolument',
  // Réservation
  'rendez-vous', 'réservation', 'disponibilité', 'créneau',
  // Adresses
  'rue', 'avenue', 'boulevard', 'place', 'Franconville', 'Cergy', 'Paris'
].join(', ');

// Alternatives de voix disponibles :
// 'Polly.Lea' - Française, naturelle, féminine (recommandée)
// 'Polly.Celine' - Française, féminine, plus formelle
// 'Polly.Mathieu' - Français, masculin
// 'alice' - Voix standard Twilio (moins naturelle mais gratuite)

// ============================================================
// === HELPER : VOIX ELEVENLABS AVEC FALLBACK POLLY ===
// ============================================================

const BASE_URL = process.env.BASE_URL || 'https://www.fatshairafro.fr';

async function sayWithElevenLabs(twiml, text) {
  if (!voiceService.isConfigured()) {
    twiml.say(VOICE_CONFIG, text);
    return;
  }

  try {
    const result = await voiceService.textToSpeech(text);
    if (!result.success) throw new Error(result.error || 'TTS failed');

    // Calculer le nom de fichier (même logique que le cache)
    const optimized = voiceService.optimizeText(text);
    const hash = voiceService.getTextHash(optimized, voiceService.DEFAULT_VOICE_ID);
    const filename = `${hash}.mp3`;
    const publicUrl = `${BASE_URL}/api/voice/audio/${filename}`;

    console.log(`[VOICE] ElevenLabs → ${publicUrl} (${result.fromCache ? 'cache' : 'API'})`);
    twiml.play(publicUrl);
  } catch (error) {
    console.error('[VOICE] ElevenLabs failed, fallback Polly:', error.message);
    twiml.say(VOICE_CONFIG, text);
  }
}

// ============================================================
// === WEBHOOK APPEL ENTRANT - ACCUEIL HALIMAH IA ===
// ============================================================

// Accepte GET et POST (Twilio peut envoyer l'un ou l'autre selon la config)
router.all('/voice', async (req, res) => {
  // Twilio envoie les params en query (GET) ou body (POST)
  const params = req.method === 'GET' ? req.query : req.body;
  const { From, To, CallSid, CallerCity, CallerCountry } = params;

  console.log(`[TWILIO VOICE] Appel reçu - Method: ${req.method} - From: ${From}`);
  console.log(`[HALIMAH VOICE] === NOUVEL APPEL ===`);
  console.log(`[HALIMAH VOICE] De: ${From} vers ${To}`);
  console.log(`[HALIMAH VOICE] CallSid: ${CallSid}`);
  if (CallerCity) console.log(`[HALIMAH VOICE] Localisation: ${CallerCity}, ${CallerCountry}`);

  // Tracker la conversation
  trackConversation(CallSid);

  // Persister en base
  logCallStart('fatshairafro', { CallSid, From, To, CallerCity, CallerCountry }).catch(() => {});

  const twiml = new VoiceResponse();

  try {
    // Message d'accueil avec Halimah IA
    const { response } = await handleVoice(CallSid, '', true);

    // Dire le message d'accueil
    await sayWithElevenLabs(twiml, response);

    // Écouter la réponse du client (reconnaissance vocale)
    twiml.gather({
      input: 'speech',
      language: 'fr-FR',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
      hints: SPEECH_HINTS,
      action: '/api/twilio/voice/conversation',
      method: 'POST',
      timeout: 3
    });

    // Si pas de réponse après le timeout
    await sayWithElevenLabs(twiml, "Vous êtes toujours là ? Je vous écoute.");

    // Deuxième tentative d'écoute
    twiml.gather({
      input: 'speech',
      language: 'fr-FR',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
      hints: SPEECH_HINTS,
      action: '/api/twilio/voice/conversation',
      method: 'POST',
      timeout: 3
    });

    // Si toujours pas de réponse
    await sayWithElevenLabs(twiml, "Je n'entends rien. N'hésitez pas à rappeler ou à nous contacter par WhatsApp. Au revoir !");

  } catch (error) {
    console.error('[HALIMAH VOICE] Erreur accueil:', error);
    twiml.say(VOICE_CONFIG, "Excusez-moi, j'ai un petit problème technique. Veuillez rappeler dans quelques instants. Au revoir !");
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ============================================================
// === CONVERSATION IA - BOUCLE PRINCIPALE ===
// ============================================================

router.post('/voice/conversation', async (req, res) => {
  const { CallSid, SpeechResult, Confidence } = req.body;

  console.log(`[HALIMAH VOICE] === CONVERSATION ===`);
  console.log(`[HALIMAH VOICE] CallSid: ${CallSid}`);
  console.log(`[HALIMAH VOICE] Client a dit: "${SpeechResult}"`);
  console.log(`[HALIMAH VOICE] Confiance reconnaissance: ${Confidence}`);

  const twiml = new VoiceResponse();

  // Vérifier si on a bien compris
  if (!SpeechResult || SpeechResult.trim() === '') {
    console.log('[HALIMAH VOICE] Pas de speech détecté');

    await sayWithElevenLabs(twiml, "Excusez-moi, je n'ai pas bien entendu. Pouvez-vous répéter ?");

    twiml.gather({
      input: 'speech',
      language: 'fr-FR',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
      hints: SPEECH_HINTS,
      action: '/api/twilio/voice/conversation',
      method: 'POST',
      timeout: 3
    });

    // Après timeout sans réponse
    await sayWithElevenLabs(twiml, "Je n'entends plus rien. Si vous avez des questions, n'hésitez pas à rappeler. Au revoir !");
    // Note: Ne pas appeler cleanupConversation ici - sera fait par /voice/status

    res.type('text/xml');
    return res.send(twiml.toString());
  }

  try {
    // Obtenir la réponse de Halimah IA (nexusCore ou legacy)
    const { response, shouldEndCall, shouldTransfer, clientName } = await handleVoice(CallSid, SpeechResult, false);

    console.log(`[HALIMAH VOICE] Halimah répond: "${response}"`);
    console.log(`[HALIMAH VOICE] Fin: ${shouldEndCall}, Transfert: ${shouldTransfer}`);

    // Dire la réponse
    await sayWithElevenLabs(twiml, response);

    // === TRANSFERT VERS FATOU ===
    if (shouldTransfer) {
      console.log(`[HALIMAH VOICE] Transfert vers Fatou pour ${clientName}`);

      // Appeler Fatou
      const dial = twiml.dial({
        timeout: 20,
        callerId: TWILIO_PHONE,
        action: '/api/twilio/voice/transfer-result',
        method: 'POST'
      });
      dial.number(FATOU_PHONE);

      // Si Fatou ne répond pas (après le dial)
      await sayWithElevenLabs(twiml,
        `Désolée ${clientName || ''}, Fatou n'est pas disponible pour le moment. ` +
        `Puis-je prendre un message ou préférez-vous rappeler plus tard ?`
      );

      twiml.gather({
        input: 'speech',
        language: 'fr-FR',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        hints: SPEECH_HINTS,
        action: '/api/twilio/voice/conversation',
        method: 'POST',
        timeout: 8
      });

    } else if (shouldEndCall) {
      // Terminer l'appel proprement
      console.log(`[HALIMAH VOICE] Fin de conversation pour ${CallSid}`);
      cleanupVoiceService(CallSid);
      cleanupVoiceSession(CallSid);
      twiml.hangup();
    } else {
      // Continuer la conversation - écouter la suite
      twiml.gather({
        input: 'speech',
        language: 'fr-FR',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        hints: SPEECH_HINTS,
        action: '/api/twilio/voice/conversation',
        method: 'POST',
        timeout: 8
      });

      // Timeout - relancer
      await sayWithElevenLabs(twiml, "Vous êtes toujours là ?");

      twiml.gather({
        input: 'speech',
        language: 'fr-FR',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        action: '/api/twilio/voice/conversation',
        method: 'POST',
        timeout: 3
      });

      // Fin après double timeout
      await sayWithElevenLabs(twiml, `Je n'entends plus rien. Merci d'avoir appelé ${SALON_INFO.nom}. À bientôt !`);
      // Note: Ne pas appeler cleanupConversation ici - sera fait par /voice/status
    }

  } catch (error) {
    console.error('[HALIMAH VOICE] Erreur conversation:', error);
    await sayWithElevenLabs(twiml, "Excusez-moi, j'ai eu un petit souci. Pouvez-vous rappeler ou envoyer un SMS au 09 39 24 02 69 ? Au revoir !");
    // Note: Ne pas appeler cleanupConversation ici - sera fait par /voice/status
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ============================================================
// === WEBHOOK STATUT D'APPEL ===
// ============================================================

router.post('/voice/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration, From, To } = req.body;

  console.log(`[HALIMAH VOICE] === STATUT APPEL ===`);
  console.log(`[HALIMAH VOICE] CallSid: ${CallSid}`);
  console.log(`[HALIMAH VOICE] Statut: ${CallStatus}`);
  if (CallDuration) console.log(`[HALIMAH VOICE] Durée: ${CallDuration}s`);

  // Persister fin d'appel
  logCallEnd({ CallSid, CallStatus, CallDuration }).catch(() => {});

  // Nettoyer la conversation quand l'appel se termine
  if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
    cleanupVoiceService(CallSid);
    cleanupVoiceSession(CallSid);
  }

  res.sendStatus(200);
});

// ============================================================
// === TRANSFERT VERS FATOU ===
// ============================================================

router.post('/voice/transfer', async (req, res) => {
  const { CallSid, From } = req.body;

  console.log(`[HALIMAH VOICE] Transfert vers Fatou pour ${CallSid}`);

  const twiml = new VoiceResponse();

  await sayWithElevenLabs(twiml, "Je vous transfère vers Fatou. Veuillez patienter.");

  twiml.dial({
    timeout: 30,
    callerId: TWILIO_PHONE,
    action: '/api/twilio/voice/transfer-status',
    method: 'POST'
  }, FATOU_PHONE);

  res.type('text/xml');
  res.send(twiml.toString());
});

router.post('/voice/transfer-status', async (req, res) => {
  const { DialCallStatus, CallSid } = req.body;

  console.log(`[HALIMAH VOICE] Statut transfert: ${DialCallStatus}`);

  const twiml = new VoiceResponse();

  if (DialCallStatus !== 'completed') {
    await sayWithElevenLabs(twiml, "Fatou n'est pas disponible pour le moment. Vous pouvez laisser un message vocal après le bip, ou envoyer un SMS au 09 39 24 02 69.");

    twiml.record({
      maxLength: 120,
      playBeep: true,
      action: '/api/twilio/voice/recording',
      method: 'POST',
      transcribe: true,
      transcribeCallback: '/api/twilio/voice/transcription'
    });
  }

  await sayWithElevenLabs(twiml, `Merci d'avoir appelé ${SALON_INFO.nom}. À bientôt !`);
  // Note: Ne pas appeler cleanupConversation ici - sera fait par /voice/status

  res.type('text/xml');
  res.send(twiml.toString());
});

// === RÉSULTAT DU TRANSFERT (appelé après le Dial) ===
router.post('/voice/transfer-result', async (req, res) => {
  const { CallSid, DialCallStatus, DialCallDuration } = req.body;

  console.log(`[HALIMAH VOICE] === RÉSULTAT TRANSFERT ===`);
  console.log(`[HALIMAH VOICE] Status: ${DialCallStatus}, Durée: ${DialCallDuration}s`);

  const twiml = new VoiceResponse();

  if (DialCallStatus === 'completed') {
    // Fatou a pris l'appel et la conversation est terminée
    console.log(`[HALIMAH VOICE] Transfert réussi pour ${CallSid}`);
    await sayWithElevenLabs(twiml, `Merci d'avoir appelé ${SALON_INFO.nom}. À bientôt !`);
    cleanupVoiceService(CallSid);
    cleanupVoiceSession(CallSid);
  } else {
    // Fatou n'a pas répondu ou a refusé
    console.log(`[HALIMAH VOICE] Transfert échoué: ${DialCallStatus}`);
    await sayWithElevenLabs(twiml,
      "Fatou n'est pas disponible actuellement. Souhaitez-vous laisser un message ou que je prenne votre rendez-vous ?"
    );

    twiml.gather({
      input: 'speech',
      language: 'fr-FR',
      speechTimeout: 'auto',
      speechModel: 'phone_call',
      hints: SPEECH_HINTS,
      action: '/api/twilio/voice/conversation',
      method: 'POST',
      timeout: 8
    });

    // Timeout
    await sayWithElevenLabs(twiml, "Je n'entends rien. Merci d'avoir appelé. Au revoir !");
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// ============================================================
// === ENREGISTREMENT VOCAL ===
// ============================================================

router.post('/voice/recording', async (req, res) => {
  const { RecordingUrl, RecordingSid, From, CallSid } = req.body;

  console.log(`[HALIMAH VOICE] === ENREGISTREMENT ===`);
  console.log(`[HALIMAH VOICE] De: ${From}`);
  console.log(`[HALIMAH VOICE] URL: ${RecordingUrl}`);
  console.log(`[HALIMAH VOICE] RecordingSid: ${RecordingSid}`);

  // TODO: Sauvegarder l'enregistrement en base et notifier Fatou

  const twiml = new VoiceResponse();
  await sayWithElevenLabs(twiml, "Votre message a bien été enregistré. Fatou vous rappellera dès que possible. Merci et à bientôt !");

  res.type('text/xml');
  res.send(twiml.toString());
});

router.post('/voice/transcription', async (req, res) => {
  const { TranscriptionText, RecordingSid, From } = req.body;

  console.log(`[HALIMAH VOICE] === TRANSCRIPTION ===`);
  console.log(`[HALIMAH VOICE] De: ${From}`);
  console.log(`[HALIMAH VOICE] Texte: ${TranscriptionText}`);

  // TODO: Envoyer la transcription à Fatou par SMS ou email

  res.sendStatus(200);
});

// ============================================================
// === WEBHOOK SMS AVEC IA ===
// ============================================================

router.post('/sms', async (req, res) => {
  const { From, Body, MessageSid } = req.body;

  console.log(`[HALIMAH SMS] === NOUVEAU SMS ===`);
  console.log(`[HALIMAH SMS] De: ${From}`);
  console.log(`[HALIMAH SMS] Message: ${Body}`);

  // Persister SMS en base
  logSMS('fatshairafro', { MessageSid, From, Body }).catch(() => {});

  const twiml = new MessagingResponse();

  try {
    // Utiliser NEXUS CORE pour répondre aux SMS
    const conversationId = `sms_${MessageSid}`;
    trackConversation(conversationId);

    const result = await processMessage(Body, 'sms', {
      conversationId,
      phone: From
    });

    console.log(`[HALIMAH SMS] Réponse: ${result.response}`);

    twiml.message(result.response);

    // Nettoyer - chaque SMS est indépendant
    clearConversation(conversationId);

  } catch (error) {
    console.error('[HALIMAH SMS] Erreur:', error);
    twiml.message(`Merci pour votre message ! ${SALON_INFO.nom} vous répond bientôt. WhatsApp: ${SALON_INFO.telephoneTwilio}`);
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

router.post('/sms/status', (req, res) => {
  const { MessageSid, MessageStatus, To, ErrorCode } = req.body;

  console.log(`[HALIMAH SMS] Statut ${MessageSid}: ${MessageStatus}`);
  if (ErrorCode) console.error(`[HALIMAH SMS] Erreur: ${ErrorCode}`);

  logSMSStatus({ MessageSid, MessageStatus }).catch(() => {});

  res.sendStatus(200);
});

// ============================================================
// === ROUTES DE TEST ET DEBUG ===
// ============================================================

// GET /voice supprimé - router.all('/voice') gère GET et POST

router.get('/sms', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SMS webhook ready with AI',
    timestamp: new Date().toISOString()
  });
});

router.get('/status', (req, res) => {
  const stats = getConversationStats();

  res.json({
    status: 'ok',
    service: 'Halimah Voice AI',
    twilio_phone: TWILIO_PHONE,
    fatou_phone: FATOU_PHONE,
    voice: VOICE_CONFIG.voice,
    features: [
      'conversation_ia',
      'speech_to_text',
      'natural_voice',
      'call_transfer',
      'voicemail',
      'sms_ai'
    ],
    activeConversations: stats.activeConversations,
    timestamp: new Date().toISOString()
  });
});

// Debug - voir les conversations actives
router.get('/debug/conversations', (req, res) => {
  const stats = getConversationStats();
  res.json(stats);
});

export default router;
