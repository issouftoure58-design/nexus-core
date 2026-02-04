/**
 * Backend API - Fat's Hair-Afro
 * Point d'entrée principal
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Import des routes
import paymentRoutes from './routes/payment.js';
import whatsappRoutes from './routes/whatsapp.js';

// Import du scheduler
import { startScheduler } from './jobs/scheduler.js';

// Création de l'application Express
const app = express();

// ============= MIDDLEWARES =============

// CORS
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(o => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// JSON body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger des requêtes
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`${new Date().toISOString()} | ${req.method} ${req.path} | ${res.statusCode} | ${duration}ms`);
    }
  });
  next();
});

// ============= ROUTES =============

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes de paiement
app.use('/api/payment', paymentRoutes);

// Routes WhatsApp (Webhook Twilio)
app.use('/api/whatsapp', whatsappRoutes);

// Route 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvée',
    path: req.path,
  });
});

// Gestion des erreurs globale
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Erreur serveur interne',
  });
});

// ============= DÉMARRAGE SERVEUR =============

const PORT = process.env.BACKEND_PORT || process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`🚀 Backend API démarré sur le port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`💳 Payment API: http://localhost:${PORT}/api/payment`);
  console.log(`📱 WhatsApp API: http://localhost:${PORT}/api/whatsapp`);
  console.log('='.repeat(50));
  console.log('');
  console.log('Endpoints disponibles:');
  console.log('');
  console.log('💳 Payment:');
  console.log('  POST /api/payment/create-intent');
  console.log('  POST /api/payment/create-paypal-order');
  console.log('  POST /api/payment/confirm-stripe');
  console.log('  POST /api/payment/capture-paypal');
  console.log('  POST /api/payment/refund');
  console.log('  GET  /api/payment/status/:rdv_id');
  console.log('');
  console.log('📱 WhatsApp:');
  console.log('  POST /api/whatsapp/webhook      - Webhook Twilio');
  console.log('  POST /api/whatsapp/status       - Status delivery');
  console.log('  POST /api/whatsapp/test         - Test simulation');
  console.log('  GET  /api/whatsapp/health       - Health check');
  console.log('');

  // Démarrer le scheduler de jobs
  startScheduler();
});

export default app;
