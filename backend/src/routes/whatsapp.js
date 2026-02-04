/**
 * Routes WhatsApp - Webhook Twilio
 * Fat's Hair-Afro
 *
 * MIGRÉ VERS NEXUS CORE - Janvier 2026
 * Variable USE_NEXUS_WHATSAPP=true pour activer le nouveau handler
 */

import express from 'express';
import {
  handleIncomingMessageNexus,
  handlePaymentConfirmed
} from '../services/whatsappService.js';

const router = express.Router();

/**
 * Webhook pour recevoir les messages WhatsApp entrants (Twilio)
 * POST /api/whatsapp/webhook
 *
 * Twilio envoie les messages au format application/x-www-form-urlencoded
 */
router.post('/webhook', async (req, res) => {
  try {
    console.log('[WhatsApp Webhook] Requête reçue:', {
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'x-twilio-signature': req.headers['x-twilio-signature'] ? 'présent' : 'absent',
      },
    });

    // Extraire les données du message Twilio
    const {
      From,           // whatsapp:+33612345678
      To,             // whatsapp:+14155238886 (numéro Twilio)
      Body,           // Contenu du message
      ProfileName,    // Nom du profil WhatsApp
      MessageSid,     // ID unique du message
      NumMedia,       // Nombre de médias attachés
    } = req.body;

    // Validation des données requises
    if (!From || !Body) {
      console.error('[WhatsApp Webhook] Données manquantes:', { From, Body });
      return res.status(400).send('<Response></Response>');
    }

    // Extraire le numéro de téléphone (enlever le préfixe whatsapp:)
    const clientPhone = From.replace('whatsapp:', '');

    console.log('[WhatsApp Webhook] Message reçu:', {
      de: clientPhone,
      nom: ProfileName,
      message: Body.substring(0, 100) + (Body.length > 100 ? '...' : ''),
      messageId: MessageSid,
    });

    // Traiter le message via nexusCore (handler unifié)
    const result = await handleIncomingMessageNexus(clientPhone, Body, ProfileName);

    console.log('[WhatsApp Webhook] Réponse:', {
      handler: 'nexusCore',
      success: result.success,
      state: result.state || result.context?.etape,
      responseLength: result.response?.length,
    });

    // Répondre à Twilio avec TwiML (la réponse est envoyée par le service)
    // On renvoie une réponse vide car on utilise l'API REST pour répondre
    res.type('text/xml');
    res.send('<Response></Response>');

  } catch (error) {
    console.error('[WhatsApp Webhook] Erreur:', error);
    res.type('text/xml');
    res.status(500).send('<Response></Response>');
  }
});

/**
 * Webhook pour les notifications de statut (delivery reports)
 * POST /api/whatsapp/status
 */
router.post('/status', (req, res) => {
  const { MessageSid, MessageStatus, To, ErrorCode, ErrorMessage } = req.body;

  console.log('[WhatsApp Status]', {
    messageId: MessageSid,
    status: MessageStatus,
    to: To,
    error: ErrorCode ? `${ErrorCode}: ${ErrorMessage}` : null,
  });

  res.status(200).send('OK');
});

/**
 * Webhook pour confirmation de paiement (appelé par Stripe/PayPal)
 * POST /api/whatsapp/payment-confirmed
 */
router.post('/payment-confirmed', async (req, res) => {
  try {
    const { rdv_id } = req.body;

    if (!rdv_id) {
      return res.status(400).json({
        success: false,
        error: 'rdv_id requis',
      });
    }

    console.log('[WhatsApp] Confirmation de paiement pour RDV:', rdv_id);

    await handlePaymentConfirmed(rdv_id);

    res.json({
      success: true,
      message: 'Notification de confirmation envoyée',
    });

  } catch (error) {
    console.error('[WhatsApp] Erreur confirmation paiement:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Endpoint de test pour simuler un message entrant
 * POST /api/whatsapp/test
 *
 * Body: { phone: "+33612345678", message: "Bonjour", name: "Test" }
 */
router.post('/test', async (req, res) => {
  try {
    const { phone, message, name } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'phone et message requis',
      });
    }

    console.log('[WhatsApp Test] Simulation message:', { phone, message, name, handler: 'nexusCore' });

    const result = await handleIncomingMessageNexus(phone, message, name);

    res.json({
      success: true,
      handler: 'nexusCore',
      ...result,
    });

  } catch (error) {
    console.error('[WhatsApp Test] Erreur:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Endpoint de santé du webhook
 * GET /api/whatsapp/health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'WhatsApp Webhook',
    timestamp: new Date().toISOString(),
    twilioNumber: process.env.TWILIO_WHATSAPP_NUMBER || 'non configuré',
    configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
  });
});

export default router;
