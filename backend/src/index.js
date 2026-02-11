/**
 * Backend API - Fat's Hair-Afro
 * Point d'entrée principal
 */

// ⚠️ IMPORTANT: Charger .env EN PREMIER avant tout autre import
import './config/env.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Import des middlewares sécurité
import { apiLimiter, paymentLimiter } from './middleware/rateLimiter.js';

// Import Sentry monitoring
import { initSentry, sentryErrorHandler } from './config/sentry.js';

// Import des routes
import paymentRoutes from './routes/payment.js';
import whatsappRoutes from './routes/whatsapp.js';
import adminAuthRoutes from './routes/adminAuth.js';
import adminChatRoutes from './routes/adminChatRoutes.js';
import adminModulesRoutes from './routes/adminModules.js';
import relancesRoutes from './routes/relances.js';
import queueRoutes from './routes/queueRoutes.js';
import socialRoutes from './routes/social.js';
import crmRoutes from './routes/crm.js';
import marketingRoutes from './routes/marketing.js';
import comptabiliteRoutes from './routes/comptabilite.js';
import commercialRoutes from './routes/commercial.js';
import depensesRoutes from './routes/depenses.js';
import facturesRoutes from './routes/factures.js';
import stockRoutes from './routes/stock.js';
import seoRoutes from './routes/seo.js';
import rhRoutes from './routes/rh.js';
import apiPublicRoutes from './routes/api-public.js';
import brandingRoutes from './routes/branding.js';
import sentinelRoutes from './routes/sentinel.js';

// Import du middleware tenant resolution
import { resolveTenantByDomain } from './middleware/resolveTenant.js';

// Import du scheduler
import { startScheduler } from './jobs/scheduler.js';

// Import du worker de notifications (Bull queue)
import { startNotificationWorker } from './queues/notificationWorker.js';

// Création de l'application Express
const app = express();

// ============= SENTRY (avant tout middleware) =============
initSentry(app);

// ============= MIDDLEWARES =============

// Helmet - Sécurité headers HTTP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      connectSrc: ["'self'", "https://api.stripe.com", "wss:", "https:"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Headers sécurité supplémentaires
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// CORS
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: corsOrigin === '*' ? true : corsOrigin.split(',').map(o => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key', 'X-Tenant-ID'],
}));

// Rate limiting global API
app.use('/api/', apiLimiter);

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

// Routes de paiement (avec rate limiting strict)
app.use('/api/payment', paymentLimiter, paymentRoutes);

// Routes WhatsApp (Webhook Twilio)
app.use('/api/whatsapp', whatsappRoutes);

// Routes Admin Auth (login, logout, etc.)
app.use('/api/admin/auth', adminAuthRoutes);

// Routes Admin Chat (streaming)
app.use('/api/admin/chat', adminChatRoutes);

// Routes Admin Modules (activation/désactivation)
app.use('/api/admin/modules', adminModulesRoutes);

// Routes Relances factures
app.use('/api/relances', relancesRoutes);

// Routes Queue notifications (stats)
app.use('/api/queue', queueRoutes);

// Routes Social (génération posts IA)
app.use('/api/social', socialRoutes);

// Routes CRM (segmentation clients)
app.use('/api/crm', crmRoutes);

// Routes Marketing (workflows automation)
app.use('/api/marketing', marketingRoutes);

// Routes Comptabilité (transactions, rapports P&L)
app.use('/api/comptabilite', comptabiliteRoutes);

// Routes Commercial (clients inactifs, scoring, campagnes relance)
app.use('/api/commercial', commercialRoutes);

// Routes Dépenses (charges, TVA, compte résultat)
app.use('/api/depenses', depensesRoutes);

// Routes Factures (génération, envoi, gestion)
app.use('/api/factures', facturesRoutes);

// Routes Stock (produits, mouvements, inventaires)
app.use('/api/stock', stockRoutes);

// Routes SEO & Visibilité (articles, mots-clés, Google My Business)
app.use('/api/seo', seoRoutes);

// Routes RH Multi-employés (employés, planning, congés, heures)
app.use('/api/rh', rhRoutes);

// Routes API REST Publique v1 (pour intégrations tierces)
app.use('/api/v1', apiPublicRoutes);

// Routes Branding & White-Label
app.use('/api/branding', brandingRoutes);

// Routes SENTINEL Analytics (Business plan)
app.use('/api/sentinel', sentinelRoutes);

// Route 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvée',
    path: req.path,
  });
});

// Sentry error handler (capture les erreurs avant le handler global)
sentryErrorHandler(app);

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
  console.log('💬 Admin Chat (streaming):');
  console.log('  GET  /api/admin/chat/conversations');
  console.log('  POST /api/admin/chat/conversations');
  console.log('  GET  /api/admin/chat/conversations/:id/messages');
  console.log('  POST /api/admin/chat/conversations/:id/messages/stream');
  console.log('');
  console.log('📊 Queue Notifications:');
  console.log('  GET  /api/queue/stats             - Statistiques');
  console.log('  GET  /api/queue/health            - Health check');
  console.log('  POST /api/queue/clean             - Nettoyage (admin)');
  console.log('');
  console.log('📱 Social Media:');
  console.log('  POST /api/social/generate-post    - Génère post IA');
  console.log('  POST /api/social/generate-ideas   - Génère idées');
  console.log('  GET  /api/social/posts            - Liste posts');
  console.log('  POST /api/social/posts            - Sauvegarde post');
  console.log('  DELETE /api/social/posts/:id      - Supprime post');
  console.log('  GET  /api/social/stats            - Statistiques');
  console.log('');
  console.log('👥 CRM Segmentation:');
  console.log('  GET  /api/crm/segments             - Liste segments');
  console.log('  POST /api/crm/segments             - Créer segment');
  console.log('  GET  /api/crm/segments/:id/clients - Clients segment');
  console.log('  GET  /api/crm/tags                 - Liste tags');
  console.log('  POST /api/crm/tags                 - Créer tag');
  console.log('  GET  /api/crm/analytics            - Stats CRM');
  console.log('');
  console.log('⚡ Marketing Automation:');
  console.log('  POST /api/marketing/workflows           - Créer workflow');
  console.log('  GET  /api/marketing/workflows           - Liste workflows');
  console.log('  POST /api/marketing/workflows/:id/toggle - Toggle actif');
  console.log('  POST /api/marketing/workflows/:id/test  - Test manuel');
  console.log('');
  console.log('📊 Campagnes A/B Testing:');
  console.log('  POST /api/marketing/campagnes           - Créer campagne');
  console.log('  GET  /api/marketing/campagnes           - Liste campagnes');
  console.log('  GET  /api/marketing/campagnes/:id       - Détail + analytics');
  console.log('  POST /api/marketing/campagnes/:id/start - Démarrer');
  console.log('  POST /api/marketing/campagnes/:id/stop  - Arrêter');
  console.log('  POST /api/marketing/campagnes/:id/declare-winner');
  console.log('');
  console.log('📈 Tracking & Analytics:');
  console.log('  POST /api/marketing/tracking/event      - Événement');
  console.log('  POST /api/marketing/tracking/create-link - Lien tracké');
  console.log('  GET  /api/marketing/track/:token        - Redirection (public)');
  console.log('  GET  /api/marketing/analytics/overview  - Stats globales');
  console.log('  GET  /api/marketing/analytics/evolution - Évolution');
  console.log('');
  console.log('💰 Comptabilité:');
  console.log('  POST /api/comptabilite/transactions      - Créer transaction');
  console.log('  GET  /api/comptabilite/transactions      - Liste transactions');
  console.log('  GET  /api/comptabilite/categories        - Liste catégories');
  console.log('  GET  /api/comptabilite/rapports/mensuel  - P&L mensuel');
  console.log('  GET  /api/comptabilite/rapports/annuel   - P&L annuel');
  console.log('  GET  /api/comptabilite/dashboard         - Dashboard');
  console.log('');
  console.log('🎯 Commercial:');
  console.log('  GET  /api/commercial/clients/inactifs    - Clients inactifs');
  console.log('  GET  /api/commercial/clients/scoring     - Scoring clients');
  console.log('  GET  /api/commercial/campagnes           - Liste campagnes');
  console.log('  POST /api/commercial/campagnes           - Créer campagne');
  console.log('  GET  /api/commercial/stats               - Stats commerciales');
  console.log('');
  console.log('📝 Dépenses:');
  console.log('  GET  /api/depenses                       - Liste dépenses');
  console.log('  POST /api/depenses                       - Créer dépense');
  console.log('  PUT  /api/depenses/:id                   - Modifier dépense');
  console.log('  DELETE /api/depenses/:id                 - Supprimer dépense');
  console.log('  GET  /api/depenses/resume                - Résumé par catégorie');
  console.log('  GET  /api/depenses/compte-resultat       - Compte de résultat');
  console.log('  GET  /api/depenses/tva                   - Données TVA');
  console.log('');
  console.log('🧾 Factures:');
  console.log('  GET  /api/factures                       - Liste factures');
  console.log('  GET  /api/factures/:id                   - Détail facture');
  console.log('  POST /api/factures/:id/envoyer           - Envoyer facture');
  console.log('  POST /api/factures/envoyer-toutes        - Envoyer toutes');
  console.log('  POST /api/factures/generer-manquantes    - Générer manquantes');
  console.log('  PATCH /api/factures/:id/statut           - Changer statut');
  console.log('');
  console.log('📦 Stock & Inventaire:');
  console.log('  POST /api/stock/produits                 - Créer produit');
  console.log('  GET  /api/stock/produits                 - Liste produits');
  console.log('  POST /api/stock/mouvements               - Créer mouvement');
  console.log('  GET  /api/stock/mouvements               - Historique');
  console.log('  POST /api/stock/inventaires              - Créer inventaire');
  console.log('  POST /api/stock/inventaires/:id/valider  - Valider inventaire');
  console.log('  GET  /api/stock/dashboard                - Dashboard stock');
  console.log('  GET  /api/stock/valorisation             - Valorisation');
  console.log('  GET  /api/stock/alertes                  - Alertes stock');
  console.log('');
  console.log('🔍 SEO & Visibilité:');
  console.log('  POST /api/seo/articles/generer           - Générer article IA');
  console.log('  GET  /api/seo/articles                   - Liste articles');
  console.log('  POST /api/seo/articles                   - Créer article');
  console.log('  POST /api/seo/articles/:id/publier       - Publier article');
  console.log('  GET  /api/seo/mots-cles                  - Mots-clés suivis');
  console.log('  POST /api/seo/mots-cles                  - Ajouter mot-clé');
  console.log('  GET  /api/seo/meta                       - Meta SEO pages');
  console.log('  GET  /api/seo/gmb                        - Fiche GMB');
  console.log('  POST /api/seo/gmb/posts                  - Posts GMB');
  console.log('  GET  /api/seo/dashboard                  - Dashboard SEO');
  console.log('');
  console.log('👥 RH Multi-employés:');
  console.log('  POST /api/rh/employes                    - Créer employé');
  console.log('  GET  /api/rh/employes                    - Liste employés');
  console.log('  PATCH /api/rh/employes/:id               - Modifier employé');
  console.log('  POST /api/rh/planning                    - Créer planning');
  console.log('  GET  /api/rh/planning                    - Planning équipe');
  console.log('  POST /api/rh/conges                      - Demande congé');
  console.log('  PATCH /api/rh/conges/:id/approuver       - Approuver congé');
  console.log('  GET  /api/rh/compteurs/:employeId        - Compteurs congés');
  console.log('  POST /api/rh/heures                      - Pointage');
  console.log('  GET  /api/rh/dashboard                   - Dashboard RH');
  console.log('');
  console.log('🔌 API REST Publique v1:');
  console.log('  POST /api/v1/auth/token                  - Valider API key');
  console.log('  GET  /api/v1/clients                     - Liste clients');
  console.log('  POST /api/v1/clients                     - Créer client');
  console.log('  GET  /api/v1/reservations                - Liste réservations');
  console.log('  POST /api/v1/reservations                - Créer réservation');
  console.log('  GET  /api/v1/services                    - Liste services');
  console.log('  GET  /api/v1/webhooks                    - Liste webhooks');
  console.log('  POST /api/v1/webhooks                    - Créer webhook');
  console.log('  GET  /api/v1/api-keys                    - Liste API keys');
  console.log('  POST /api/v1/api-keys                    - Créer API key');
  console.log('');
  console.log('🎨 Branding & White-Label:');
  console.log('  GET  /api/branding                       - Config branding');
  console.log('  PUT  /api/branding                       - Modifier branding');
  console.log('  GET  /api/branding/themes                - Thèmes disponibles');
  console.log('  POST /api/branding/apply-theme           - Appliquer thème');
  console.log('  POST /api/branding/domain                - Config domaine custom');
  console.log('  POST /api/branding/domain/verify         - Vérifier domaine');
  console.log('  GET  /api/branding/theme.css             - CSS dynamique');
  console.log('  GET  /api/branding/pages                 - Pages custom');
  console.log('  POST /api/branding/pages                 - Créer page');
  console.log('');
  console.log('📊 SENTINEL Analytics (Business):');
  console.log('  GET  /api/sentinel/dashboard             - Dashboard principal');
  console.log('  POST /api/sentinel/refresh               - Rafraîchir données');
  console.log('  GET  /api/sentinel/activity/:period      - Activité détaillée');
  console.log('  GET  /api/sentinel/costs/:period         - Coûts détaillés');
  console.log('  GET  /api/sentinel/insights              - Insights actifs');
  console.log('  POST /api/sentinel/insights/generate     - Générer insights IA');
  console.log('  POST /api/sentinel/insights/ask          - Demander conseil IA');
  console.log('  GET  /api/sentinel/goals                 - Objectifs');
  console.log('  PUT  /api/sentinel/goals                 - Modifier objectifs');
  console.log('');

  // Démarrer le scheduler de jobs
  startScheduler();

  // Démarrer le worker de notifications (Bull queue)
  startNotificationWorker();
});

export default app;
