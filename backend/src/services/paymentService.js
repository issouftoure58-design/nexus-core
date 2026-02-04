/**
 * Service de paiement - Stripe & PayPal
 * Fat's Hair-Afro - Franconville
 */

import Stripe from 'stripe';

// ============= CONFIGURATION STRIPE =============

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn('[PaymentService] STRIPE_SECRET_KEY non définie');
}

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
}) : null;

// ============= CONFIGURATION PAYPAL =============

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // 'sandbox' ou 'live'

const PAYPAL_API_URL = PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  console.warn('[PaymentService] PAYPAL_CLIENT_ID ou PAYPAL_CLIENT_SECRET non défini');
}

/**
 * Obtient un token d'accès PayPal
 * @returns {Promise<string>} Access token
 */
async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error('PayPal credentials not configured');
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal auth failed: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

// ============= FONCTIONS STRIPE =============

/**
 * Crée un PaymentIntent Stripe
 * @param {number} amount - Montant en centimes (ex: 1000 = 10€)
 * @param {Object} metadata - Métadonnées (client_id, rdv_id, etc.)
 * @returns {Promise<Object>} { client_secret, payment_intent_id }
 */
export async function createStripePaymentIntent(amount, metadata = {}) {
  try {
    if (!stripe) {
      throw new Error('Stripe not configured - STRIPE_SECRET_KEY missing');
    }

    if (!amount || amount < 50) {
      throw new Error('Amount must be at least 50 centimes (0.50€)');
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount), // Assurer un entier
      currency: 'eur',
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
        source: 'halimah-booking',
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log(`[Stripe] PaymentIntent créé: ${paymentIntent.id} - ${amount / 100}€`);

    return {
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    };
  } catch (error) {
    console.error('[Stripe] Erreur création PaymentIntent:', error);
    throw new Error(`Stripe payment creation failed: ${error.message}`);
  }
}

/**
 * Vérifie le statut d'un paiement Stripe
 * @param {string} paymentIntentId - ID du PaymentIntent
 * @returns {Promise<Object>} Statut du paiement
 */
export async function confirmStripePayment(paymentIntentId) {
  try {
    if (!stripe) {
      throw new Error('Stripe not configured');
    }

    if (!paymentIntentId) {
      throw new Error('PaymentIntent ID required');
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    console.log(`[Stripe] PaymentIntent ${paymentIntentId} - Status: ${paymentIntent.status}`);

    return {
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      confirmed: paymentIntent.status === 'succeeded',
      metadata: paymentIntent.metadata,
      created: new Date(paymentIntent.created * 1000).toISOString(),
    };
  } catch (error) {
    console.error('[Stripe] Erreur vérification paiement:', error);
    throw new Error(`Stripe payment verification failed: ${error.message}`);
  }
}

/**
 * Rembourse un paiement Stripe (total ou partiel)
 * @param {string} paymentIntentId - ID du PaymentIntent
 * @param {number|null} amount - Montant en centimes (null = remboursement total)
 * @returns {Promise<Object>} Détails du remboursement
 */
export async function refundStripePayment(paymentIntentId, amount = null) {
  try {
    if (!stripe) {
      throw new Error('Stripe not configured');
    }

    if (!paymentIntentId) {
      throw new Error('PaymentIntent ID required');
    }

    const refundParams = {
      payment_intent: paymentIntentId,
    };

    if (amount) {
      refundParams.amount = Math.round(amount);
    }

    const refund = await stripe.refunds.create(refundParams);

    console.log(`[Stripe] Remboursement créé: ${refund.id} - ${refund.amount / 100}€`);

    return {
      refund_id: refund.id,
      payment_intent_id: paymentIntentId,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
      created: new Date(refund.created * 1000).toISOString(),
    };
  } catch (error) {
    console.error('[Stripe] Erreur remboursement:', error);
    throw new Error(`Stripe refund failed: ${error.message}`);
  }
}

// ============= FONCTIONS PAYPAL =============

/**
 * Crée une commande PayPal
 * @param {number} amount - Montant en euros (ex: 10.00)
 * @param {Object} metadata - Métadonnées
 * @returns {Promise<Object>} { order_id, approval_url }
 */
export async function createPayPalOrder(amount, metadata = {}) {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error('PayPal not configured - credentials missing');
    }

    if (!amount || amount < 1) {
      throw new Error('Amount must be at least 1€');
    }

    const accessToken = await getPayPalAccessToken();

    const orderData = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'EUR',
          value: amount.toFixed(2),
        },
        description: metadata.description || 'Réservation Fat\'s Hair-Afro',
        custom_id: metadata.rdv_id || '',
        soft_descriptor: 'FATS HAIR AFRO',
      }],
      application_context: {
        brand_name: 'Fat\'s Hair-Afro',
        locale: 'fr-FR',
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        return_url: metadata.return_url || process.env.PAYPAL_RETURN_URL || 'https://fatshairafro.fr/paiement/success',
        cancel_url: metadata.cancel_url || process.env.PAYPAL_CANCEL_URL || 'https://fatshairafro.fr/paiement/cancel',
      },
    };

    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`PayPal order creation failed: ${JSON.stringify(error)}`);
    }

    const order = await response.json();

    // Trouver le lien d'approbation
    const approvalLink = order.links?.find(link => link.rel === 'approve');

    console.log(`[PayPal] Order créé: ${order.id} - ${amount}€`);

    return {
      order_id: order.id,
      status: order.status,
      amount: amount,
      currency: 'EUR',
      approval_url: approvalLink?.href || null,
      created: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[PayPal] Erreur création order:', error);
    throw new Error(`PayPal order creation failed: ${error.message}`);
  }
}

/**
 * Capture un paiement PayPal après validation client
 * @param {string} orderId - ID de la commande PayPal
 * @returns {Promise<Object>} Détails de la capture
 */
export async function capturePayPalOrder(orderId) {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error('PayPal not configured');
    }

    if (!orderId) {
      throw new Error('Order ID required');
    }

    const accessToken = await getPayPalAccessToken();

    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`PayPal capture failed: ${JSON.stringify(error)}`);
    }

    const capture = await response.json();

    // Extraire les détails de la capture
    const captureDetails = capture.purchase_units?.[0]?.payments?.captures?.[0];

    console.log(`[PayPal] Order capturé: ${orderId} - Status: ${capture.status}`);

    return {
      order_id: capture.id,
      status: capture.status,
      capture_id: captureDetails?.id || null,
      amount: captureDetails?.amount?.value || null,
      currency: captureDetails?.amount?.currency_code || 'EUR',
      payer_email: capture.payer?.email_address || null,
      payer_name: capture.payer?.name?.given_name || null,
      captured: capture.status === 'COMPLETED',
      created: captureDetails?.create_time || new Date().toISOString(),
    };
  } catch (error) {
    console.error('[PayPal] Erreur capture:', error);
    throw new Error(`PayPal capture failed: ${error.message}`);
  }
}

/**
 * Rembourse un paiement PayPal
 * @param {string} captureId - ID de la capture PayPal
 * @param {number|null} amount - Montant en euros (null = remboursement total)
 * @returns {Promise<Object>} Détails du remboursement
 */
export async function refundPayPalPayment(captureId, amount = null) {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error('PayPal not configured');
    }

    if (!captureId) {
      throw new Error('Capture ID required');
    }

    const accessToken = await getPayPalAccessToken();

    const refundData = {};
    if (amount) {
      refundData.amount = {
        currency_code: 'EUR',
        value: amount.toFixed(2),
      };
    }

    const response = await fetch(`${PAYPAL_API_URL}/v2/payments/captures/${captureId}/refund`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(refundData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`PayPal refund failed: ${JSON.stringify(error)}`);
    }

    const refund = await response.json();

    console.log(`[PayPal] Remboursement créé: ${refund.id} - ${refund.amount?.value}€`);

    return {
      refund_id: refund.id,
      capture_id: captureId,
      status: refund.status,
      amount: refund.amount?.value || null,
      currency: refund.amount?.currency_code || 'EUR',
      created: refund.create_time || new Date().toISOString(),
    };
  } catch (error) {
    console.error('[PayPal] Erreur remboursement:', error);
    throw new Error(`PayPal refund failed: ${error.message}`);
  }
}

// ============= FONCTIONS UTILITAIRES =============

/**
 * Vérifie si les services de paiement sont configurés
 * @returns {Object} État de configuration
 */
export function getPaymentServicesStatus() {
  return {
    stripe: {
      configured: !!stripeSecretKey,
      mode: stripeSecretKey?.startsWith('sk_live_') ? 'live' : 'test',
    },
    paypal: {
      configured: !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET),
      mode: PAYPAL_MODE,
    },
  };
}

/**
 * Convertit euros en centimes pour Stripe
 * @param {number} euros - Montant en euros
 * @returns {number} Montant en centimes
 */
export function eurosToCents(euros) {
  return Math.round(euros * 100);
}

/**
 * Convertit centimes en euros
 * @param {number} cents - Montant en centimes
 * @returns {number} Montant en euros
 */
export function centsToEuros(cents) {
  return cents / 100;
}

// Export par défaut
export default {
  // Stripe
  createStripePaymentIntent,
  confirmStripePayment,
  refundStripePayment,
  // PayPal
  createPayPalOrder,
  capturePayPalOrder,
  refundPayPalPayment,
  // Utils
  getPaymentServicesStatus,
  eurosToCents,
  centsToEuros,
};
