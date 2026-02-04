import type { Express } from "express";
import type { Server } from "http";
// import { storage } from "./storage"; // Désactivé temporairement pour tester l'API Claude
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import { supabase } from "./supabase";
import { getDistanceFromSalon } from "./google-maps-service";
import { calculerFraisDepl, calculerBlocReservation } from "./tarification";
// @ts-ignore - JS module without types
import adminAuthRouter, { authenticateAdmin, requireSuperAdmin } from "../backend/src/routes/adminAuth.js";
// @ts-ignore - JS module without types
import adminStatsRouter from "../backend/src/routes/adminStats.js";
// @ts-ignore - JS module without types
import adminServicesRouter from "../backend/src/routes/adminServices.js";
// @ts-ignore - JS module without types
import adminDisponibilitesRouter from "../backend/src/routes/adminDisponibilites.js";
// @ts-ignore - JS module without types
import adminClientsRouter from "../backend/src/routes/adminClients.js";
// @ts-ignore - JS module without types
import adminReservationsRouter from "../backend/src/routes/adminReservations.js";
// @ts-ignore - JS module without types
import adminOrdersRouter from "../backend/src/routes/adminOrders.js";
// @ts-ignore - JS module without types
import adminParametresRouter from "../backend/src/routes/adminParametres.js";
// @ts-ignore - JS module without types
import adminAgentsRouter from "../backend/src/routes/adminAgents.js";
// @ts-ignore - JS module without types
import reviewsRouter from "../backend/src/routes/reviews.js";
// @ts-ignore - JS module without types
import halimahProRouter from "../backend/src/routes/halimahPro.js";
// @ts-ignore - JS module without types
import googleAuthRouter from "../backend/src/routes/googleAuth.js";
// @ts-ignore - JS module without types
import contentCreatorRouter from "../backend/src/routes/contentCreator.js";
// @ts-ignore - JS module without types
import twilioWebhooksRouter from "../backend/src/routes/twilioWebhooks.js";
// @ts-ignore - JS module without types
import clientAuthRouter from "../backend/src/routes/clientAuth.js";
// @ts-ignore - JS module without types
import clientDashboardRouter from "../backend/src/routes/clientDashboard.js";
// @ts-ignore - JS module without types
import ordersRouter from "../backend/src/routes/orders.js";
// @ts-ignore - JS module without types
import paymentRouter from "../backend/src/routes/payment.js";
// @ts-ignore - JS module without types
import placesRouter from "../backend/src/routes/places.js";
// @ts-ignore - JS module without types
import voiceRouter from "../backend/src/routes/voice.js";
// @ts-ignore - JS module without types
import optimizationRouter from "../backend/src/routes/optimization.js";
// @ts-ignore - JS module without types
import sentinelRoutes from "../backend/src/routes/sentinelRoutes.js";
// @ts-ignore - JS module without types
import sentinelAction from "../sentinel/core/sentinelAction.js";
// @ts-ignore - JS module without types
import bookingService from "../backend/src/services/bookingService.js";
// @ts-ignore - JS module without types
import * as halimahAI from "../backend/src/core/halimahAI.js";
// 🔒 NEXUS CORE UNIFIÉ - Source unique de vérité (supprimé l'ancien doublon)
// @ts-ignore - JS module without types
import nexusCore, { processMessage as nexusProcessMessage, processMessageStreaming as nexusProcessMessageStreaming, clearConversation as nexusClearConversation, SALON_INFO as NEXUS_SALON_INFO, CONVERSATION_STATES, createConversationContext } from "../backend/src/core/unified/nexusCore.js";
// @ts-ignore - JS module without types
import { identifyTenant, getTenantConfig, listTenants } from "../backend/src/config/tenants/index.js";
import { getTenantId } from "./tenant-context";
// @ts-ignore - JS module without types
import { tenantRouter, requireFeature, protectFrozen } from "../platform/middleware/tenantRouter.js";

// Prompt centralisé pour Halimah
const { getHalimahPrompt, SERVICES_LIST, SALON_INFO } = bookingService;

// Contextes de conversation nexusCore (par session)
const conversationContexts = new Map<string, any>();

// Nettoyer les contextes expirés (toutes les 30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, ctx] of conversationContexts) {
    const createdAt = new Date(ctx.createdAt).getTime();
    if (now - createdAt > 30 * 60 * 1000) { // 30 minutes
      conversationContexts.delete(sessionId);
    }
  }
}, 30 * 60 * 1000);

// Flag pour utiliser nexusCore sur WhatsApp
const USE_NEXUS_WHATSAPP = process.env.USE_NEXUS_WHATSAPP === 'true';

// Flag pour utiliser Full AI sur WhatsApp (prioritaire sur nexusCore)
const USE_FULLAI_WHATSAPP = process.env.USE_FULLAI_WHATSAPP !== 'false'; // Activé par défaut

// Contextes nexusCore pour WhatsApp (par numéro de téléphone)
const whatsappNexusContexts = new Map<string, any>();

// Mot de passe admin (à définir dans les variables d'environnement en production)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "halimah2024";

// Secret JWT (même que dans adminAuth.js)
const JWT_SECRET = process.env.JWT_SECRET || "halimah-pro-secret-2026";

// Sessions admin simples (en mémoire)
const adminSessions = new Set<string>();

function generateSessionToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // CORS est configuré dans index.ts

  // ============= SENTINEL RATE LIMITING =============
  const { rateLimitMiddleware, inputValidationMiddleware } = await import("../backend/src/sentinel/security/index.js");
  app.use("/api", rateLimitMiddleware);
  app.use("/api", inputValidationMiddleware);

  // ============= CONTEXTE NEXUS / TENANT =============
  // Endpoint public : detecte si on est en contexte NEXUS ou tenant
  app.get("/api/context", (req: any, res: any) => {
    const tenantId = getTenantId();
    res.json({
      mode: tenantId ? 'tenant' : 'nexus',
      tenantId: tenantId,
    });
  });

  // ============= NEXUS TENANT ROUTER =============
  app.use("/api", tenantRouter);

  // ============= AUTHENTIFICATION ADMIN =============

  // POST /api/admin/login - Connexion admin
  app.post("/api/admin/login", (req, res) => {
    // 🔒 Empêcher le cache (fix Chrome/Service Worker)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: "Mot de passe requis",
      });
    }

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        error: "Mot de passe incorrect",
      });
    }

    // Générer un JWT compatible avec Halimah Pro
    const token = jwt.sign(
      { id: "admin-legacy", email: "admin@fatshairafro.fr", role: "super_admin" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    adminSessions.add(token);

    res.json({
      success: true,
      token,
    });
  });

  // POST /api/admin/logout - Déconnexion admin
  app.post("/api/admin/logout", (req, res) => {
    // 🔒 Empêcher le cache (fix Chrome/Service Worker)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      adminSessions.delete(token);
    }
    res.json({ success: true });
  });

  // GET /api/admin/verify - Vérifier si le token est valide
  app.get("/api/admin/verify", (req, res) => {
    // 🔒 Empêcher le cache (fix Chrome/Service Worker)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminSessions.has(token)) {
      return res.status(401).json({
        success: false,
        error: "Non authentifié",
      });
    }
    res.json({ success: true });
  });

  // Middleware pour protéger les routes admin
  const requireAdmin = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !adminSessions.has(token)) {
      return res.status(401).json({
        success: false,
        error: "Authentification requise",
      });
    }
    next();
  };

  // GET /api/admin/rdv/aujourd'hui - RDV du jour (protégé)
  app.get("/api/admin/rdv/aujourdhui", requireAdmin, async (req, res) => {
    try {
      const { getRendezVousByDateWithClients } = await import("./db-functions");
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const rdvs = await getRendezVousByDateWithClients(today);
      res.json({
        success: true,
        data: rdvs,
        count: rdvs.length,
        date: today,
      });
    } catch (error: any) {
      console.error("Erreur récupération RDV du jour:", error);
      res.status(500).json({
        success: false,
        error: "Erreur lors de la récupération des rendez-vous",
      });
    }
  });

  // ============= STATISTIQUES (endpoints publics) =============

  // GET /api/stats/dashboard - Statistiques globales du dashboard
  app.get("/api/stats/dashboard", async (req, res) => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const firstDayOfMonth = new Date(currentYear, currentMonth, 1).toISOString().split("T")[0];
      const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];

      // Semaine actuelle
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Lundi
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      // Semaine dernière
      const startOfLastWeek = new Date(startOfWeek);
      startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
      const endOfLastWeek = new Date(startOfLastWeek);
      endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);

      // Récupérer tous les RDV du mois (sans jointure clients - non nécessaire pour les stats)
      const { data: monthlyRdvs, error: rdvError } = await supabase
        .from("reservations")
        .select("*")
        .gte("date", firstDayOfMonth)
        .lte("date", lastDayOfMonth);

      if (rdvError) throw new Error(rdvError.message);

      // Compter par statut
      const statusCounts: Record<string, number> = {
        demande: 0,
        confirme: 0,
        termine: 0,
        annule: 0,
      };

      let caPrevu = 0;
      const serviceCounts: Record<string, number> = {};

      (monthlyRdvs || []).forEach((rdv: any) => {
        statusCounts[rdv.statut] = (statusCounts[rdv.statut] || 0) + 1;

        // Compter par service
        const serviceName = rdv.service_nom || "Autre";
        serviceCounts[serviceName] = (serviceCounts[serviceName] || 0) + 1;

        // Calculer CA prévu (seulement RDV non annulés)
        if (rdv.statut !== "annule") {
          caPrevu += (rdv.prix_total || 0) / 100; // Prix en centimes -> euros
        }
      });

      // Top 5 services
      const topServices = Object.entries(serviceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Taux d'occupation (estimation basée sur les heures ouvertes)
      // Environ 9h-18h = 9 créneaux par jour, 6 jours par semaine
      const totalSlots = 54 * 4; // 54 créneaux/semaine * 4 semaines
      const bookedSlots = statusCounts.confirme + statusCounts.termine + statusCounts.demande;
      const occupationRate = Math.round((bookedSlots / totalSlots) * 100);

      // Tendance semaine actuelle vs précédente
      const thisWeekRdvs = (monthlyRdvs || []).filter((rdv: any) => {
        const date = new Date(rdv.date);
        return date >= startOfWeek && date <= endOfWeek && rdv.statut !== "annule";
      }).length;

      const lastWeekRdvs = (monthlyRdvs || []).filter((rdv: any) => {
        const date = new Date(rdv.date);
        return date >= startOfLastWeek && date <= endOfLastWeek && rdv.statut !== "annule";
      }).length;

      const weekTrend = lastWeekRdvs > 0
        ? Math.round(((thisWeekRdvs - lastWeekRdvs) / lastWeekRdvs) * 100)
        : 0;

      res.json({
        success: true,
        data: {
          caPrevu,
          totalRdv: (monthlyRdvs || []).length,
          rdvParStatut: statusCounts,
          tauxOccupation: occupationRate,
          topServices,
          tendanceSemaine: {
            semaineActuelle: thisWeekRdvs,
            semaineDerniere: lastWeekRdvs,
            evolution: weekTrend,
          },
          periode: {
            debut: firstDayOfMonth,
            fin: lastDayOfMonth,
            mois: now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
          },
        },
      });
    } catch (error: any) {
      console.error("Erreur stats dashboard:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/stats/revenue - Chiffre d'affaires détaillé
  app.get("/api/stats/revenue", async (req, res) => {
    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const firstDayOfMonth = new Date(currentYear, currentMonth, 1).toISOString().split("T")[0];
      const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).toISOString().split("T")[0];

      // Récupérer les RDV du mois
      const { data: rdvs, error: rdvError } = await supabase
        .from("reservations")
        .select("*")
        .gte("date", firstDayOfMonth)
        .lte("date", lastDayOfMonth)
        .neq("statut", "annule");

      if (rdvError) throw new Error(rdvError.message);

      // Récupérer les services
      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("*");

      if (servicesError) throw new Error(servicesError.message);

      const serviceMap = new Map((services || []).map((s: any) => [s.nom.toLowerCase(), s]));

      // CA par jour
      const caParJour: Record<string, { prevu: number; realise: number }> = {};
      const caParService: Record<string, { prevu: number; realise: number; count: number }> = {};

      (rdvs || []).forEach((rdv: any) => {
        const service = serviceMap.get((rdv.service_nom || "").toLowerCase());
        const prix = service ? service.prix / 100 : 0;
        const isRealise = rdv.statut === "termine";

        // Par jour
        if (!caParJour[rdv.date]) {
          caParJour[rdv.date] = { prevu: 0, realise: 0 };
        }
        caParJour[rdv.date].prevu += prix;
        if (isRealise) {
          caParJour[rdv.date].realise += prix;
        }

        // Par service
        const serviceName = rdv.service_nom || "Autre";
        if (!caParService[serviceName]) {
          caParService[serviceName] = { prevu: 0, realise: 0, count: 0 };
        }
        caParService[serviceName].prevu += prix;
        caParService[serviceName].count += 1;
        if (isRealise) {
          caParService[serviceName].realise += prix;
        }
      });

      // Totaux
      const totalPrevu = Object.values(caParJour).reduce((sum, d) => sum + d.prevu, 0);
      const totalRealise = Object.values(caParJour).reduce((sum, d) => sum + d.realise, 0);

      res.json({
        success: true,
        data: {
          caParJour: Object.entries(caParJour)
            .map(([date, values]) => ({ date, ...values }))
            .sort((a, b) => a.date.localeCompare(b.date)),
          caParService: Object.entries(caParService)
            .map(([service, values]) => ({ service, ...values }))
            .sort((a, b) => b.prevu - a.prevu),
          totaux: {
            prevu: totalPrevu,
            realise: totalRealise,
            tauxRealisation: totalPrevu > 0 ? Math.round((totalRealise / totalPrevu) * 100) : 0,
          },
          periode: {
            debut: firstDayOfMonth,
            fin: lastDayOfMonth,
          },
        },
      });
    } catch (error: any) {
      console.error("Erreur stats revenue:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/stats/occupation - Taux d'occupation
  app.get("/api/stats/occupation", async (req, res) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(now.getDate() - 30);

      const { data: rdvs, error } = await supabase
        .from("reservations")
        .select("date, heure, statut")
        .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
        .neq("statut", "annule");

      if (error) throw new Error(error.message);

      // Par jour de la semaine (0 = Dimanche, 1 = Lundi, etc.)
      const joursSemaine = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
      const parJour: Record<string, number> = {};
      joursSemaine.forEach((j) => (parJour[j] = 0));

      // Par tranche horaire
      const parHeure: Record<string, number> = {};

      (rdvs || []).forEach((rdv: any) => {
        const date = new Date(rdv.date);
        const dayName = joursSemaine[date.getDay()];
        parJour[dayName] = (parJour[dayName] || 0) + 1;

        const hour = parseInt(rdv.heure.split(":")[0]);
        const tranche = `${hour}h-${hour + 1}h`;
        parHeure[tranche] = (parHeure[tranche] || 0) + 1;
      });

      // Trier par heure
      const parHeureTriee = Object.entries(parHeure)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
        .map(([tranche, count]) => ({ tranche, count }));

      // Créneaux les plus demandés
      const creneauxPopulaires = parHeureTriee
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      res.json({
        success: true,
        data: {
          parJour: joursSemaine.slice(1).concat(["Dimanche"]).map((jour) => ({
            jour,
            count: parJour[jour] || 0,
          })),
          parHeure: parHeureTriee,
          creneauxPopulaires,
          totalRdv: (rdvs || []).length,
          periode: "30 derniers jours",
        },
      });
    } catch (error: any) {
      console.error("Erreur stats occupation:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/stats/services - Analyse des services
  app.get("/api/stats/services", async (req, res) => {
    try {
      // Récupérer les services
      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("*");

      if (servicesError) throw new Error(servicesError.message);

      // Récupérer tous les RDV (non annulés)
      const { data: rdvs, error: rdvError } = await supabase
        .from("reservations")
        .select("service_nom, statut")
        .neq("statut", "annule");

      if (rdvError) throw new Error(rdvError.message);

      const serviceMap = new Map((services || []).map((s: any) => [s.nom.toLowerCase(), s]));

      // Compter les réservations par service
      const serviceStats: Record<string, { count: number; ca: number; duree: number }> = {};

      (rdvs || []).forEach((rdv: any) => {
        const serviceName = rdv.service_nom || "Autre";
        const service = serviceMap.get(serviceName.toLowerCase());

        if (!serviceStats[serviceName]) {
          serviceStats[serviceName] = { count: 0, ca: 0, duree: 0 };
        }

        serviceStats[serviceName].count += 1;
        if (service) {
          serviceStats[serviceName].ca += service.prix / 100;
          serviceStats[serviceName].duree = service.duree;
        }
      });

      const result = Object.entries(serviceStats)
        .map(([name, stats]) => ({
          name,
          count: stats.count,
          ca: stats.ca,
          duree: stats.duree,
          caMoyen: stats.count > 0 ? Math.round(stats.ca / stats.count) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      res.json({
        success: true,
        data: {
          services: result,
          total: {
            reservations: result.reduce((sum, s) => sum + s.count, 0),
            ca: result.reduce((sum, s) => sum + s.ca, 0),
          },
        },
      });
    } catch (error: any) {
      console.error("Erreur stats services:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============= 🔒 ENDPOINT CHAT - NEXUS CORE UNIFIÉ =============

  app.post("/api/chat", async (req, res) => {
    const { message, sessionId, isFirstMessage = false } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    try {
      // Générer ou utiliser le sessionId
      const conversationId = sessionId || `web_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      console.log(`[CHAT-WEB] 🔒 NEXUS Core - Session: ${conversationId}`);

      // Utiliser NEXUS Core unifié
      const result = await nexusProcessMessage(message, 'web', {
        conversationId,
        isFirstMessage
      });

      console.log(`[CHAT-WEB] ✅ Réponse en ${result.duration}ms`);

      // Gérer le premier message (ajouter salutation si nécessaire)
      let response = result.response;
      if (isFirstMessage) {
        const currentHour = new Date().getHours();
        const salutation = currentHour >= 18 ? "Bonsoir" : "Bonjour";
        const startsWithGreeting = /^(Bonjour|Bonsoir)/i.test(response.trim());

        if (!startsWithGreeting) {
          response = `${salutation} ! ✨ Je suis Halimah, l'assistante de Fatou.\nComment puis-je vous aider ?\n\n${response}`;
        }
      }

      res.json({
        response,
        sessionId: conversationId,
        duration: result.duration
      });

    } catch (error: any) {
      console.error("[CHAT-WEB] ❌ Erreur:", error);
      res.status(500).json({
        message: error.message || "Erreur du service de chat"
      });
    }
  });

  // ============= 🚀 ENDPOINT CHAT STREAMING (SSE) =============
  // Utilise Server-Sent Events pour envoyer la réponse progressivement

  app.post("/api/chat/stream", async (req, res) => {
    const { message, sessionId, isFirstMessage = false } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    // Configurer les headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const conversationId = sessionId || `web_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const tenantId = identifyTenant(req);
      console.log(`[CHAT-STREAM] 🚀 NEXUS Core Streaming - Session: ${conversationId} | Tenant: ${tenantId}`);

      // Gérer le premier message (salutation tenant-aware)
      if (isFirstMessage) {
        const currentHour = new Date().getHours();
        const salutation = currentHour >= 18 ? "Bonsoir" : "Bonjour";
        const _tc = getTenantConfig(tenantId);
        const assistantName = _tc.assistantName || 'Halimah';
        const geranteName = _tc.gerante || 'Fatou';
        const greeting = `${salutation} ! ✨ Je suis ${assistantName}, l'assistante de ${geranteName}.\nComment puis-je vous aider ?\n\n`;

        // Envoyer la salutation immédiatement
        res.write(`data: ${JSON.stringify({ type: 'text', content: greeting })}\n\n`);
      }

      // Utiliser le générateur de streaming
      // @ts-ignore
      for await (const chunk of nexusProcessMessageStreaming(message, 'web', { conversationId, isFirstMessage, tenantId })) {
        if (chunk.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ type: 'text', content: chunk.content })}\n\n`);
        } else if (chunk.type === 'tool_processing') {
          res.write(`data: ${JSON.stringify({ type: 'status', content: chunk.content })}\n\n`);
        } else if (chunk.type === 'done') {
          res.write(`data: ${JSON.stringify({
            type: 'done',
            sessionId: chunk.conversationId,
            duration: chunk.duration,
            quickReplies: chunk.quickReplies || null
          })}\n\n`);
        } else if (chunk.type === 'error') {
          res.write(`data: ${JSON.stringify({ type: 'error', content: chunk.content })}\n\n`);
        }
      }

      console.log(`[CHAT-STREAM] ✅ Stream terminé`);
      res.end();

    } catch (error: any) {
      console.error("[CHAT-STREAM] ❌ Erreur:", error);
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'Erreur technique' })}\n\n`);
      res.end();
    }
  });

  // ============= ENDPOINT CHAT NEXUS (nouveau) =============
  // Utilise nexusCore.processMessage comme source unique de logique
  app.post("/api/chat/nexus", async (req, res) => {
    const { message, sessionId, canal = 'chat' } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    // Générer ou récupérer le sessionId
    const sid = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      // Récupérer ou créer le contexte de conversation
      let context = conversationContexts.get(sid);
      if (!context) {
        context = nexusCore.createConversationContext(canal);
        conversationContexts.set(sid, context);
      }

      // Traiter le message avec nexusCore (async)
      const result = await nexusCore.processMessage(message, context, canal);

      // Si action de création de réservation
      if (result.action === 'CREATE_BOOKING' && result.bookingData) {
        try {
          // Utiliser bookingService pour créer le RDV
          const { createAppointment } = bookingService;

          // Extraire le jour de la semaine depuis dateFormatee (ex: "Samedi 24/1/2026" -> "samedi")
          const dateFormatee = result.context.data.dateFormatee || '';
          const jourMatch = dateFormatee.match(/^(\w+)/);
          const jour = jourMatch ? jourMatch[1].toLowerCase() : result.bookingData.date;

          const booking = await createAppointment({
            clientPrenom: result.bookingData.prenom,
            clientPhone: result.bookingData.telephone,
            service: result.bookingData.service,
            jour: jour,  // "samedi" au lieu de "2026-01-24"
            heure: result.bookingData.heure,
            clientAddress: result.bookingData.lieu === 'domicile' ? result.bookingData.adresse : null,
            source: 'chat-nexus',
            notes: `Lieu: ${result.bookingData.lieu === 'domicile' ? result.bookingData.adresse : 'Chez Fatou'} - Frais déplacement: ${result.bookingData.fraisDeplacement}€`
          });

          console.log('[NEXUS CHAT] Réservation créée:', booking);

          // Si le booking a échoué, informer le client
          if (!booking.success) {
            result.response = `Désolé, ce créneau n'est plus disponible. 😔\n\n${booking.error || 'Erreur lors de la réservation.'}\n\nVoulez-vous choisir un autre créneau ?`;
            result.context.state = 'attente_date';
          }
        } catch (bookingError) {
          console.error('[NEXUS CHAT] Erreur création RDV:', bookingError);
          result.response = `Désolé, une erreur s'est produite lors de la réservation. Pouvez-vous réessayer ?`;
          result.context.state = 'attente_date';
        }
      }

      // Mettre à jour le contexte dans le store
      conversationContexts.set(sid, result.context);

      res.json({
        response: result.response,
        sessionId: sid,
        state: result.context.state,
        data: result.context.data
      });

    } catch (error: any) {
      console.error("[NEXUS CHAT] Error:", error);
      res.status(500).json({ message: error.message || "Erreur du moteur de conversation" });
    }
  });

  // ========================================
  // HALIMAH AI - Full AI + Outils Déterministes
  // ========================================
  app.post("/api/chat/ai", async (req, res) => {
    const { message, sessionId, canal = 'chat' } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    const sid = sessionId || `ai_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    try {
      const result = await halimahAI.chat(sid, message, canal);
      res.json(result);
    } catch (error: any) {
      console.error("[HALIMAH AI] Error:", error);
      res.status(500).json({
        success: false,
        response: "Erreur technique, veuillez réessayer.",
        error: error.message
      });
    }
  });

  // Test endpoint pour Supabase
  app.get("/api/test-db", async (req, res) => {
    try {
      // Test simple : lire les tables
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .limit(5);

      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("*")
        .limit(5);

      const { data: rdv, error: rdvError } = await supabase
        .from("reservations")
        .select("*")
        .limit(5);

      res.json({
        success: true,
        clients: { data: clients, error: clientsError },
        services: { data: services, error: servicesError },
        rendezvous: { data: rdv, error: rdvError },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============= TEST SMS =============

  // GET /api/test-sms - Tester l'envoi de SMS
  app.get("/api/test-sms", async (req, res) => {
    const { telephone } = req.query;

    if (!telephone || typeof telephone !== "string") {
      return res.status(400).json({
        success: false,
        error: "Paramètre ?telephone=XXXXXXXXXX requis",
      });
    }

    // Fonction de normalisation (dupliquée pour le test)
    function normalizePhoneNumber(tel: string): string {
      let clean = tel.replace(/[\s\-\.]/g, "");
      if (clean.startsWith("0")) {
        clean = "+33" + clean.substring(1);
      }
      if (!clean.startsWith("+")) {
        clean = "+33" + clean;
      }
      return clean;
    }

    const original = telephone;
    const normalized = normalizePhoneNumber(telephone);

    console.log("[TEST-SMS] === TEST ENVOI SMS ===");
    console.log("[TEST-SMS] Numéro original:", original);
    console.log("[TEST-SMS] Numéro normalisé:", normalized);
    console.log("[TEST-SMS] Format E.164 valide:", /^\+33[0-9]{9}$/.test(normalized));

    // Vérifier config Twilio
    const twilioConfigured = !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    );

    console.log("[TEST-SMS] Twilio configuré:", twilioConfigured);
    console.log("[TEST-SMS] TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID ? "✓ défini" : "✗ manquant");
    console.log("[TEST-SMS] TWILIO_AUTH_TOKEN:", process.env.TWILIO_AUTH_TOKEN ? "✓ défini" : "✗ manquant");
    console.log("[TEST-SMS] TWILIO_PHONE_NUMBER:", process.env.TWILIO_PHONE_NUMBER || "✗ manquant");

    if (!twilioConfigured) {
      return res.json({
        success: false,
        original,
        normalized,
        formatValid: /^\+33[0-9]{9}$/.test(normalized),
        twilioConfigured: false,
        error: "Variables Twilio non configurées",
        missingVars: {
          TWILIO_ACCOUNT_SID: !process.env.TWILIO_ACCOUNT_SID,
          TWILIO_AUTH_TOKEN: !process.env.TWILIO_AUTH_TOKEN,
          TWILIO_PHONE_NUMBER: !process.env.TWILIO_PHONE_NUMBER,
        },
      });
    }

    // Essayer d'envoyer un SMS de test
    try {
      const twilio = (await import("twilio")).default;
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      console.log("[TEST-SMS] Envoi du SMS de test...");

      const result = await client.messages.create({
        body: "🧪 Test SMS Fat's Hair-Afro - Si vous recevez ce message, les SMS fonctionnent !",
        from: process.env.TWILIO_PHONE_NUMBER,
        to: normalized,
      });

      console.log("[TEST-SMS] SUCCESS! SID:", result.sid);
      console.log("[TEST-SMS] Status:", result.status);

      res.json({
        success: true,
        original,
        normalized,
        formatValid: true,
        twilioConfigured: true,
        messageSid: result.sid,
        messageStatus: result.status,
      });
    } catch (error: any) {
      console.error("[TEST-SMS] === ERREUR ===");
      console.error("[TEST-SMS] Message:", error.message);
      console.error("[TEST-SMS] Code:", error.code);
      console.error("[TEST-SMS] Status:", error.status);
      console.error("[TEST-SMS] More info:", error.moreInfo);

      res.json({
        success: false,
        original,
        normalized,
        formatValid: /^\+33[0-9]{9}$/.test(normalized),
        twilioConfigured: true,
        error: {
          message: error.message,
          code: error.code,
          status: error.status,
          moreInfo: error.moreInfo,
        },
      });
    }
  });

  // ============= 📊 SENTINEL - USAGE API =============

  app.get("/api/sentinel/usage/:tenantId", authenticateAdmin, requireSuperAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const { getTenantUsage, checkQuota } = await import("../backend/src/sentinel/monitors/tenantCostTracker.js");
      // @ts-ignore
      const { checkQuota: checkQ } = await import("../backend/src/sentinel/monitors/quotas.js");

      const { tenantId } = req.params;
      const usage = getTenantUsage(tenantId);
      const quota = checkQ(usage, 'starter'); // TODO: récupérer le plan du tenant

      res.json({
        tenantId,
        usage: {
          calls: usage.calls,
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          cost: Math.round(usage.cost * 10000) / 10000,
        },
        quota,
        recentCalls: usage.history.slice(-10),
      });
    } catch (error: any) {
      console.error("[SENTINEL] Error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  app.get("/api/sentinel/usage", authenticateAdmin, requireSuperAdmin, async (req, res) => {
    try {
      // @ts-ignore
      const { getAllTenantUsage } = await import("../backend/src/sentinel/monitors/tenantCostTracker.js");

      const allUsage = getAllTenantUsage();
      const summary: Record<string, any> = {};

      for (const [tenantId, data] of Object.entries(allUsage) as any) {
        summary[tenantId] = {
          calls: data.calls,
          tokensIn: data.tokensIn,
          tokensOut: data.tokensOut,
          cost: Math.round(data.cost * 10000) / 10000,
        };
      }

      res.json({ tenants: summary, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("[SENTINEL] Error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // GET /api/sentinel/dashboard - Données complètes pour le dashboard
  app.get("/api/sentinel/dashboard", authenticateAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { getAllTenantUsage } = await import("../backend/src/sentinel/monitors/tenantCostTracker.js");
      const { checkQuota, getPlan } = await import("../backend/src/sentinel/monitors/quotas.js");
      const { getTenantConfig } = await import("../backend/src/config/tenants/index.js");
      const { getNotificationServicesStatus } = await import("../backend/src/services/notificationService.js");
      const { loadRecentAlerts } = await import("../backend/src/sentinel/persistence.js");

      const allUsage = getAllTenantUsage();
      const knownTenants = listTenants();

      let totalCalls = 0;
      let totalCost = 0;
      let tenantsAtRisk = 0;
      const tenants: any[] = [];

      for (const tid of knownTenants) {
        const tc = getTenantConfig(tid);
        const planId = tc.plan || "starter";
        const plan = getPlan(planId);
        const usage = allUsage[tid] || { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0, history: [] };
        const quota = checkQuota(usage, planId);

        const status = quota.usage.percentage >= 100 ? "critical" : quota.usage.percentage >= 80 ? "warning" : "ok";
        if (status !== "ok") tenantsAtRisk++;

        totalCalls += usage.calls;
        totalCost += usage.cost;

        const lastCall = usage.history && usage.history.length > 0 ? usage.history[usage.history.length - 1].timestamp : null;

        tenants.push({
          id: tid,
          name: tc.name || tid,
          plan: planId,
          usage: {
            calls: usage.calls,
            tokensIn: usage.tokensIn,
            tokensOut: usage.tokensOut,
            cost: Math.round(usage.cost * 10000) / 10000,
          },
          quota: {
            limit: plan.limits.costPerMonth,
            percentage: quota.usage.percentage,
            status,
          },
          lastActivity: lastCall,
        });
      }

      const notifStatus = getNotificationServicesStatus();

      res.json({
        timestamp: new Date().toISOString(),
        summary: {
          totalTenants: knownTenants.length,
          totalCalls,
          totalCost: Math.round(totalCost * 10000) / 10000,
          tenantsAtRisk,
        },
        tenants,
        alerts: {
          recent: await loadRecentAlerts(10),
          active: tenantsAtRisk,
        },
        services: {
          email: { enabled: notifStatus.email.configured },
          sms: { enabled: notifStatus.whatsapp.configured },
          slack: { enabled: !!process.env.SENTINEL_SLACK_WEBHOOK },
        },
      });
    } catch (error: any) {
      console.error("[SENTINEL] Dashboard error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // POST /api/sentinel/test-alert - Test manuel d'alerte
  app.post("/api/sentinel/test-alert", authenticateAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { checkAndAlert, sendSlackAlert } = await import("../backend/src/sentinel/alerts.js");
      const { tenantId = "fatshairafro", level = "warning" } = req.body || {};

      if (level === "slack") {
        // Test direct Slack
        const result = await sendSlackAlert(`🧪 *TEST* - Alerte de test pour tenant *${tenantId}*`);
        return res.json({ test: true, channel: "slack", result });
      }

      // Simuler un usage à 85% ou 105%
      const percentage = level === "critical" ? 105 : 85;
      const fakeUsage = { percentage, cost: level === "critical" ? 21 : 17, limit: 20 };
      const alerts = await checkAndAlert(tenantId, fakeUsage, "Starter");

      res.json({ test: true, tenantId, level, alerts });
    } catch (error: any) {
      console.error("[SENTINEL] Test alert error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // ============= NEXUS OPERATOR API =============

  // GET /api/nexus/dashboard - Dashboard agrégé opérateur (données persistées Supabase)
  app.get("/api/nexus/dashboard", authenticateAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { checkQuota } = await import("../backend/src/sentinel/monitors/quotas.js");
      const { getTenantConfig } = await import("../backend/src/config/tenants/index.js");
      const { loadRecentAlerts, loadAllUsage } = await import("../backend/src/sentinel/persistence.js");
      const costTrackerModule = await import("../backend/src/services/costTracker.js");
      const costTracker = costTrackerModule.default;

      // Lire depuis Supabase (persisté) au lieu de la mémoire
      const allUsage = await loadAllUsage();
      const knownTenants = listTenants();

      let totalCalls = 0;
      let totalCost = 0;
      let tenantsAtRisk = 0;

      for (const tid of knownTenants) {
        const tc = getTenantConfig(tid);
        const planId = tc.plan || "starter";
        const usage = allUsage[tid] || { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
        const quota = checkQuota(usage, planId);
        const status = quota.usage.percentage >= 100 ? "critical" : quota.usage.percentage >= 80 ? "warning" : "ok";
        if (status !== "ok") tenantsAtRisk++;
        totalCalls += usage.calls;
        totalCost += usage.cost;
      }

      // Coûts réels Twilio + ElevenLabs
      const [twilioData, elevenLabsData, todayCosts] = await Promise.all([
        costTracker.getTwilioCosts(),
        costTracker.getElevenLabsCosts(),
        costTracker.getTodayFullCosts(),
      ]);

      const recentAlerts = await loadRecentAlerts(10);

      // Période affichée
      const now = new Date();
      const monthNames = ["janvier","fevrier","mars","avril","mai","juin","juillet","aout","septembre","octobre","novembre","decembre"];
      const periodLabel = `depuis le 1er ${monthNames[now.getMonth()]} ${now.getFullYear()}`;

      const anthropicCost = Math.round(totalCost * 10000) / 10000;
      const grandTotal = parseFloat((anthropicCost + twilioData.total + elevenLabsData.total).toFixed(4));

      res.json({
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || "development",
        periodLabel,
        summary: {
          totalTenants: knownTenants.length,
          totalCalls,
          totalCost: grandTotal,
          tenantsAtRisk,
        },
        costBreakdown: {
          anthropic: anthropicCost,
          twilio: twilioData.total,
          elevenlabs: elevenLabsData.total,
        },
        todayCosts,
        twilioDetails: twilioData,
        elevenLabsDetails: elevenLabsData,
        alerts: {
          recent: recentAlerts,
          active: tenantsAtRisk,
        },
      });
    } catch (error: any) {
      console.error("[NEXUS] Dashboard error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // GET /api/nexus/tenants - Liste des tenants (sans données confidentielles)
  app.get("/api/nexus/tenants", authenticateAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { getAllTenantUsage } = await import("../backend/src/sentinel/monitors/tenantCostTracker.js");
      const { checkQuota, getPlan } = await import("../backend/src/sentinel/monitors/quotas.js");
      const { getTenantConfig } = await import("../backend/src/config/tenants/index.js");

      const allUsage = getAllTenantUsage();
      const knownTenants = listTenants();
      const tenants: any[] = [];

      for (const tid of knownTenants) {
        const tc = getTenantConfig(tid);
        const planId = tc.plan || "starter";
        const plan = getPlan(planId);
        const usage = allUsage[tid] || { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0, history: [] };
        const quota = checkQuota(usage, planId);
        const status = quota.usage.percentage >= 100 ? "critical" : quota.usage.percentage >= 80 ? "warning" : "ok";
        const lastCall = usage.history && usage.history.length > 0 ? usage.history[usage.history.length - 1].timestamp : null;

        tenants.push({
          id: tid,
          name: tc.name || tid,
          plan: planId,
          status: "active",
          usage: {
            calls: usage.calls,
            cost: Math.round(usage.cost * 10000) / 10000,
          },
          quota: {
            percentage: quota.usage.percentage,
            status,
          },
          lastActivity: lastCall,
        });
      }

      res.json({ tenants, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("[NEXUS] Tenants error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // POST /api/nexus/tenants/refresh-cache - Forcer refresh du cache tenant
  app.post("/api/nexus/tenants/refresh-cache", authenticateAdmin, requireSuperAdmin, async (_req: any, res: any) => {
    try {
      const { loadAllTenants } = await import("../backend/src/config/tenants/tenantCache.js");
      const success = await loadAllTenants();
      res.json({ success, timestamp: new Date().toISOString(), tenants: listTenants() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/nexus/tenants/:tenantId/create-account - Créer un compte provisoire
  app.post("/api/nexus/tenants/:tenantId/create-account", authenticateAdmin, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { createProvisionalAccount } = await import("../backend/src/sentinel/security/accountService.js");
      const { email, role } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email requis" });
      }

      const result = await createProvisionalAccount(email, req.params.tenantId, role || "admin");

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({
        success: true,
        credentials: result.credentials,
      });
    } catch (error: any) {
      console.error("[NEXUS] Create account error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // GET /api/nexus/sentinel/dashboard - Proxy vers SENTINEL existant
  app.get("/api/nexus/sentinel/dashboard", authenticateAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { getAllTenantUsage } = await import("../backend/src/sentinel/monitors/tenantCostTracker.js");
      const { checkQuota, getPlan } = await import("../backend/src/sentinel/monitors/quotas.js");
      const { getTenantConfig } = await import("../backend/src/config/tenants/index.js");
      const { getNotificationServicesStatus } = await import("../backend/src/services/notificationService.js");
      const { loadRecentAlerts } = await import("../backend/src/sentinel/persistence.js");

      const allUsage = getAllTenantUsage();
      const knownTenants = listTenants();

      let totalCalls = 0;
      let totalCost = 0;
      let tenantsAtRisk = 0;
      const tenants: any[] = [];

      for (const tid of knownTenants) {
        const tc = getTenantConfig(tid);
        const planId = tc.plan || "starter";
        const plan = getPlan(planId);
        const usage = allUsage[tid] || { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0, history: [] };
        const quota = checkQuota(usage, planId);
        const status = quota.usage.percentage >= 100 ? "critical" : quota.usage.percentage >= 80 ? "warning" : "ok";
        if (status !== "ok") tenantsAtRisk++;
        totalCalls += usage.calls;
        totalCost += usage.cost;
        const lastCall = usage.history && usage.history.length > 0 ? usage.history[usage.history.length - 1].timestamp : null;

        tenants.push({
          id: tid,
          name: tc.name || tid,
          plan: planId,
          usage: { calls: usage.calls, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, cost: Math.round(usage.cost * 10000) / 10000 },
          quota: { limit: plan.limits.costPerMonth, percentage: quota.usage.percentage, status },
          lastActivity: lastCall,
        });
      }

      const notifStatus = getNotificationServicesStatus();

      res.json({
        timestamp: new Date().toISOString(),
        summary: { totalTenants: knownTenants.length, totalCalls, totalCost: Math.round(totalCost * 10000) / 10000, tenantsAtRisk },
        tenants,
        alerts: { recent: await loadRecentAlerts(10), active: tenantsAtRisk },
        services: {
          email: { enabled: notifStatus.email.configured },
          sms: { enabled: notifStatus.whatsapp.configured },
          slack: { enabled: !!process.env.SENTINEL_SLACK_WEBHOOK },
        },
      });
    } catch (error: any) {
      console.error("[NEXUS] Sentinel dashboard error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // GET /api/nexus/sentinel/security/stats - Stats securite completes
  app.get("/api/nexus/sentinel/security/stats", authenticateAdmin, requireSuperAdmin, async (_req, res) => {
    try {
      const { getRateLimitStats, LIMITS } = await import("../backend/src/sentinel/security/index.js");
      const { getSecurityStats } = await import("../backend/src/sentinel/security/securityLogger.js");
      const rateLimit = getRateLimitStats();
      const security = await getSecurityStats(24);
      res.json({ rateLimit, limits: LIMITS, security, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("[NEXUS] Security stats error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // GET /api/nexus/sentinel/security/logs - Logs securite recents
  app.get("/api/nexus/sentinel/security/logs", authenticateAdmin, requireSuperAdmin, async (req, res) => {
    try {
      const { getRecentLogs } = await import("../backend/src/sentinel/security/securityLogger.js");
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const filters: any = {};
      if (req.query.severity) filters.severity = req.query.severity;
      if (req.query.type) filters.eventType = req.query.type;
      if (req.query.ip) filters.ip = req.query.ip;
      const logs = await getRecentLogs(limit, filters);
      res.json({ logs, count: logs.length, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("[NEXUS] Security logs error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // GET /api/csrf-token - Obtenir un token CSRF
  app.get("/api/csrf-token", async (req, res) => {
    try {
      const { getCsrfTokenHandler } = await import("../backend/src/sentinel/security/csrfProtection.js");
      getCsrfTokenHandler(req, res);
    } catch (error: any) {
      console.error("[NEXUS] CSRF token error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // ============= BACKUP =============

  // GET /api/nexus/sentinel/backups - Liste des backups
  app.get("/api/nexus/sentinel/backups", authenticateAdmin, requireSuperAdmin, async (_req: any, res: any) => {
    try {
      const { listBackups } = await import("../backend/src/sentinel/backup/backupService.js");
      const backups = await listBackups();
      res.json({ backups });
    } catch (error: any) {
      console.error("[NEXUS] List backups error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // POST /api/nexus/sentinel/backups - Créer un backup manuel
  app.post("/api/nexus/sentinel/backups", authenticateAdmin, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { createBackup } = await import("../backend/src/sentinel/backup/backupService.js");
      const tenantId = req.body?.tenantId || null;
      const result = await createBackup(tenantId);
      res.json(result);
    } catch (error: any) {
      console.error("[NEXUS] Create backup error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // POST /api/nexus/sentinel/backups/:name/restore - Restaurer un backup
  app.post("/api/nexus/sentinel/backups/:name/restore", authenticateAdmin, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { restoreBackup } = await import("../backend/src/sentinel/backup/backupService.js");
      const dryRun = req.query.dryRun !== "false";
      const tables = req.body?.tables || null;
      const result = await restoreBackup(req.params.name, { dryRun, tables });
      res.json(result);
    } catch (error: any) {
      console.error("[NEXUS] Restore backup error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Démarrer le scheduler de backup si activé
  if (process.env.BACKUP_ENABLED === "true") {
    import("../backend/src/sentinel/backup/backupService.js").then(({ startBackupScheduler }) => {
      startBackupScheduler(24);
    }).catch((err) => {
      console.error("[BACKUP] Failed to start scheduler:", err.message);
    });
  }

  // ============= UPTIME MONITORING =============

  // GET /api/nexus/sentinel/status - Status détaillé (super_admin)
  app.get("/api/nexus/sentinel/status", authenticateAdmin, requireSuperAdmin, async (_req: any, res: any) => {
    try {
      const { getStatus } = await import("../backend/src/sentinel/monitoring/uptimeMonitor.js");
      res.json(getStatus());
    } catch (error: any) {
      console.error("[NEXUS] Status error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // POST /api/nexus/sentinel/check - Forcer un health check (super_admin)
  app.post("/api/nexus/sentinel/check", authenticateAdmin, requireSuperAdmin, async (_req: any, res: any) => {
    try {
      const { checkAllServices } = await import("../backend/src/sentinel/monitoring/uptimeMonitor.js");
      const result = await checkAllServices();
      res.json(result);
    } catch (error: any) {
      console.error("[NEXUS] Check error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // Démarrer le monitoring uptime (toutes les 60 secondes)
  import("../backend/src/sentinel/monitoring/uptimeMonitor.js").then(({ startMonitoring }) => {
    startMonitoring(60);
  }).catch((err) => {
    console.error("[SENTINEL] Failed to start monitoring:", err.message);
  });

  // ============= NOTIFICATIONS SCHEDULED =============

  app.get("/api/notifications/scheduled", async (req, res) => {
    try {
      const { getNotificationServicesStatus } = await import("../backend/src/services/notificationService.js");
      const { isAvisJobEnabled } = await import("../backend/src/jobs/scheduler.js");

      const status = getNotificationServicesStatus();
      const avisEnabled = isAvisJobEnabled();

      res.json({
        services: status,
        jobs: {
          remerciementsJ1: { enabled: true, schedule: "10h00", description: "Remerciement J+1 après prestation" },
          rappelsJ1: { enabled: true, schedule: "18h00", description: "Rappel J-1 avant RDV" },
          demandesAvisJ2: { enabled: avisEnabled, schedule: "14h00", description: "Demande d'avis J+2" },
        },
        tenantAware: true,
      });
    } catch (error: any) {
      console.error("[NOTIFICATIONS] Error:", error);
      res.status(500).json({ error: "Erreur interne" });
    }
  });

  // ============= ENDPOINTS RENDEZ-VOUS =============

  // GET /api/rendez-vous - Liste tous les rendez-vous
  app.get("/api/rendez-vous", async (req, res) => {
    try {
      const { getAllRendezVousWithClients, getRendezVousByDate } = await import(
        "./db-functions"
      );

      const { date } = req.query;

      // Si une date est spécifiée, filtrer par date
      if (date && typeof date === "string") {
        const rdvs = await getRendezVousByDate(date);
        return res.json({
          success: true,
          data: rdvs,
          count: rdvs.length,
        });
      }

      // Sinon, retourner tous les RDV avec infos client
      const rdvs = await getAllRendezVousWithClients();
      res.json({
        success: true,
        data: rdvs,
        count: rdvs.length,
      });
    } catch (error: any) {
      console.error("Erreur récupération RDV:", error);
      res.status(500).json({
        success: false,
        error: "Erreur lors de la récupération des rendez-vous",
      });
    }
  });

  // GET /api/rendez-vous/:id - Récupère un rendez-vous spécifique
  app.get("/api/rendez-vous/:id", async (req, res) => {
    try {
      const { getRendezVousWithClient } = await import("./db-functions");

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: "ID invalide",
        });
      }

      const rdv = await getRendezVousWithClient(id);
      if (!rdv) {
        return res.status(404).json({
          success: false,
          error: "Rendez-vous non trouvé",
        });
      }

      res.json({
        success: true,
        data: rdv,
      });
    } catch (error: any) {
      console.error("Erreur récupération RDV:", error);
      res.status(500).json({
        success: false,
        error: "Erreur lors de la récupération du rendez-vous",
      });
    }
  });

  // DELETE /api/rendez-vous/:id - Supprime un rendez-vous
  app.delete("/api/rendez-vous/:id", async (req, res) => {
    try {
      const { deleteRendezVous, getRendezVousById } = await import(
        "./db-functions"
      );

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: "ID invalide",
        });
      }

      // Vérifier que le RDV existe
      const existing = await getRendezVousById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: "Rendez-vous non trouvé",
        });
      }

      const deleted = await deleteRendezVous(id);
      if (!deleted) {
        return res.status(500).json({
          success: false,
          error: "Erreur lors de la suppression",
        });
      }

      res.json({
        success: true,
        message: "Rendez-vous supprimé avec succès",
      });
    } catch (error: any) {
      console.error("Erreur suppression RDV:", error);
      res.status(500).json({
        success: false,
        error: "Erreur lors de la suppression du rendez-vous",
      });
    }
  });

  // PATCH /api/rendez-vous/:id/statut - Met à jour le statut d'un RDV
  app.patch("/api/rendez-vous/:id/statut", async (req, res) => {
    try {
      const { updateRendezVousStatus, getRendezVousById } = await import(
        "./db-functions"
      );

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: "ID invalide",
        });
      }

      const { statut } = req.body;
      const statutsValides = ["demande", "confirme", "termine", "annule"];
      if (!statut || !statutsValides.includes(statut)) {
        return res.status(400).json({
          success: false,
          error: `Statut invalide. Valeurs acceptées: ${statutsValides.join(", ")}`,
        });
      }

      // Vérifier que le RDV existe
      const existing = await getRendezVousById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: "Rendez-vous non trouvé",
        });
      }

      const updated = await updateRendezVousStatus(id, statut);
      res.json({
        success: true,
        message: "Statut mis à jour",
        data: updated,
      });
    } catch (error: any) {
      console.error("Erreur mise à jour statut:", error);
      res.status(500).json({
        success: false,
        error: "Erreur lors de la mise à jour du statut",
      });
    }
  });

  // POST /api/rendez-vous - Crée un nouveau rendez-vous
  // 🔒 UNIFIÉ : Utilise createReservationUnified (NEXUS CORE)
  // Applique: règles métier, SMS, frais déplacement, multi-jours, cache
  app.post("/api/rendez-vous", async (req, res) => {
    try {
      const { nom, prenom, telephone, email, service, date, heure, notes, lieu, adresse } =
        req.body;

      // Validation basique
      if (!nom || !telephone || !date || !heure || !service) {
        return res.status(400).json({
          success: false,
          error: "Informations manquantes (nom, telephone, date, heure, service requis)",
        });
      }

      // Import dynamique de createReservationUnified (évite dépendances circulaires)
      const { createReservationUnified } = await import(
        "../backend/src/core/unified/nexusCore.js"
      );

      // Mapper vers le format attendu par createReservationUnified
      const data = {
        service_name: service,
        date,
        heure,
        client_nom: `${prenom || ''} ${nom}`.trim() || nom,
        client_prenom: prenom || undefined,
        client_telephone: telephone,
        client_email: email || undefined,
        lieu: lieu || (adresse ? 'domicile' : 'chez_fatou'),
        adresse: adresse || undefined,
        notes: notes || undefined,
      };

      // Appeler createReservationUnified (source unique de vérité)
      const result = await createReservationUnified(data, 'api', { sendSMS: true });

      if (!result.success) {
        // Gérer les différents cas d'erreur
        if (result.needsClarification) {
          return res.status(400).json({
            success: false,
            error: result.message,
            options: result.options,
          });
        }
        if (result.errors) {
          return res.status(409).json({
            success: false,
            error: result.errors.join(', '),
          });
        }
        return res.status(400).json({
          success: false,
          error: result.error || "Erreur lors de la création",
        });
      }

      res.json({
        success: true,
        message: "Rendez-vous créé avec succès",
        data: {
          reservationId: result.reservationId,
          recap: result.recap,
        },
      });
    } catch (error: any) {
      console.error("Erreur création RDV:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============= ENDPOINTS CLIENTS =============

  // GET /api/clients - Liste tous les clients avec statistiques RDV
  app.get("/api/clients", async (req, res) => {
    try {
      // Récupérer tous les clients
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (clientsError) {
        throw new Error(clientsError.message);
      }

      // Récupérer tous les RDV pour calculer les stats
      const { data: allRdvs, error: rdvError } = await supabase
        .from("reservations")
        .select("client_id, date, statut")
        .neq("statut", "annule");

      if (rdvError) {
        throw new Error(rdvError.message);
      }

      // Calculer les stats pour chaque client
      const clientsWithStats = (clients || []).map((client: any) => {
        const clientRdvs = (allRdvs || []).filter(
          (rdv: any) => rdv.client_id === client.id
        );

        const rdvCount = clientRdvs.length;

        // Trouver la date du dernier RDV
        const sortedRdvs = clientRdvs
          .map((rdv: any) => rdv.date)
          .sort((a: string, b: string) => b.localeCompare(a));
        const lastRdvDate = sortedRdvs[0] || null;

        // Calculer le statut d'activité
        let activityStatus = "inactive"; // gris
        if (lastRdvDate) {
          const lastDate = new Date(lastRdvDate);
          const today = new Date();
          const diffDays = Math.floor(
            (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (diffDays <= 30) {
            activityStatus = "active"; // vert
          } else if (diffDays <= 90) {
            activityStatus = "moderate"; // orange
          }
        }

        return {
          id: client.id,
          nom: client.nom,
          prenom: client.prenom,
          telephone: client.telephone,
          email: client.email,
          createdAt: client.created_at,
          rdvCount,
          lastRdvDate,
          activityStatus,
        };
      });

      res.json({
        success: true,
        data: clientsWithStats,
        count: clientsWithStats.length,
      });
    } catch (error: any) {
      console.error("Erreur récupération clients:", error);
      res.status(500).json({
        success: false,
        error: "Erreur lors de la récupération des clients",
      });
    }
  });

  // GET /api/clients/:id - Récupère un client spécifique
  app.get("/api/clients/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: "ID invalide",
        });
      }

      const { data: client, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (!client) {
        return res.status(404).json({
          success: false,
          error: "Client non trouvé",
        });
      }

      res.json({
        success: true,
        data: client,
      });
    } catch (error: any) {
      console.error("Erreur récupération client:", error);
      res.status(500).json({
        success: false,
        error: "Erreur lors de la récupération du client",
      });
    }
  });

  // GET /api/clients/:id/historique - Historique des RDV d'un client
  app.get("/api/clients/:id/historique", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: "ID invalide",
        });
      }

      // Vérifier que le client existe
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (clientError) {
        throw new Error(clientError.message);
      }

      if (!client) {
        return res.status(404).json({
          success: false,
          error: "Client non trouvé",
        });
      }

      // Récupérer tous les RDV du client
      const { data: rdvs, error: rdvError } = await supabase
        .from("reservations")
        .select("*")
        .eq("client_id", id)
        .order("date", { ascending: false })
        .order("heure", { ascending: false });

      if (rdvError) {
        throw new Error(rdvError.message);
      }

      // Formater les RDV
      const formattedRdvs = (rdvs || []).map((rdv: any) => ({
        id: rdv.id,
        date: rdv.date,
        heure: rdv.heure,
        serviceNom: rdv.service_nom,
        statut: rdv.statut,
        notes: rdv.notes,
        createdAt: rdv.created_at,
      }));

      res.json({
        success: true,
        client: {
          id: client.id,
          nom: client.nom,
          prenom: client.prenom,
          telephone: client.telephone,
          email: client.email,
        },
        historique: formattedRdvs,
        count: formattedRdvs.length,
      });
    } catch (error: any) {
      console.error("Erreur récupération historique:", error);
      res.status(500).json({
        success: false,
        error: "Erreur lors de la récupération de l'historique",
      });
    }
  });

  // ============= TEST RAPPELS =============

  // GET /api/test-reminders - Tester l'envoi des rappels manuellement
  app.get("/api/test-reminders", requireAdmin, async (req, res) => {
    try {
      const { testReminderJob } = await import("./scheduled-jobs");
      const result = await testReminderJob();
      res.json(result);
    } catch (error: any) {
      console.error("Erreur test rappels:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============= WEBHOOK WHATSAPP (Twilio) =============

  // Sessions WhatsApp en mémoire (numéro -> historique messages)
  const whatsappSessions = new Map<string, { messages: any[]; lastActivity: number }>();

  // Nettoyer les sessions inactives (plus de 30 minutes)
  const cleanupSessions = () => {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes
    for (const [phone, session] of whatsappSessions.entries()) {
      if (now - session.lastActivity > timeout) {
        whatsappSessions.delete(phone);
      }
    }
  };

  /**
   * Génère une réponse d'erreur intelligente basée sur le contexte de la conversation
   * @param messageBody - Le dernier message de l'utilisateur
   * @param conversationHistory - L'historique des messages de la session
   * @param error - L'erreur qui s'est produite
   * @returns Un message d'erreur contextuel et naturel
   */
  function getSmartErrorResponse(
    messageBody: string,
    conversationHistory: any[] = [],
    error: any
  ): string {
    const lowerMessage = messageBody?.toLowerCase() || "";
    const lastMessages = conversationHistory.slice(-4); // Derniers 4 messages
    const conversationText = lastMessages
      .map((m: any) => m.content)
      .join(" ")
      .toLowerCase();

    // Contexte 1 : Premier message (erreur API ou technique)
    if (conversationHistory.length === 0 || lastMessages.length === 0) {
      return `Bonjour ! ✨ Je suis Halimah, l'assistante de Fatou.

Je rencontre un petit souci technique. Pouvez-vous réessayer dans quelques instants ?

En attendant, vous pouvez aussi contacter Fatou directement au 07 82 23 50 20.`;
    }

    // Contexte 2 : Discussion sur services/tarifs
    if (
      lowerMessage.includes("prix") ||
      lowerMessage.includes("tarif") ||
      lowerMessage.includes("coût") ||
      lowerMessage.includes("combien") ||
      conversationText.includes("service") ||
      conversationText.includes("tresses") ||
      conversationText.includes("locks")
    ) {
      return `Désolée, je n'ai pas bien compris votre demande sur les tarifs.

Les services de Fatou :
• Braids : à partir de 60€
• Locks (création) : 200€
• Locks (entretien) : 50€
• Soins : 40-50€

Si vous voulez qu'elle vienne chez vous, il y a des frais de déplacement en plus.

Quel service vous intéresse ? ✨`;
    }

    // Contexte 3 : Discussion sur date/horaires/disponibilité
    if (
      lowerMessage.match(/\d{1,2}h|\d{1,2}:\d{2}/) ||
      lowerMessage.includes("disponib") ||
      lowerMessage.includes("rdv") ||
      lowerMessage.includes("rendez-vous") ||
      lowerMessage.includes("date") ||
      conversationText.includes("quand") ||
      conversationText.includes("horaire")
    ) {
      return `Désolée, je n'ai pas pu vérifier les disponibilités.

Fatou est disponible :
• Lun-Mer-Sam : 9h-18h
• Jeudi : 9h-13h
• Vendredi : 13h-18h

Quel jour vous arrangerait ? 📅`;
    }

    // Contexte 4 : Discussion sur adresse/déplacement
    if (
      lowerMessage.includes("adresse") ||
      lowerMessage.includes("rue") ||
      lowerMessage.match(/\d{5}/) || // Code postal
      lowerMessage.includes("déplacement") ||
      lowerMessage.includes("venir") ||
      conversationText.includes("domicile") ||
      conversationText.includes("chez")
    ) {
      return `Désolée, je n'ai pas pu traiter votre adresse.

Fatou travaille à Franconville et peut aussi se déplacer chez vous.

Vous préférez :
• Venir chez Fatou (8 rue des Monts Rouges, Franconville)
• Qu'elle vienne chez vous (frais de déplacement selon distance)

Qu'est-ce qui vous arrange ? ✨`;
    }

    // Contexte 5 : Recherche de RDV existant / Annulation
    if (
      lowerMessage.includes("annul") ||
      lowerMessage.includes("modif") ||
      lowerMessage.includes("déplac") ||
      lowerMessage.includes("mon rendez-vous") ||
      lowerMessage.includes("ma réservation")
    ) {
      return `Désolée, je n'arrive pas à retrouver votre rendez-vous pour le moment.

Pouvez-vous me donner :
• Votre nom complet
• La date de votre RDV

Ou appelez Fatou directement au 07 82 23 50 20. 📞`;
    }

    // Contexte 6 : Erreur API (détectée dans l'error)
    if (error?.message?.includes("API") || error?.message?.includes("fetch")) {
      return `Désolée, j'ai un souci de connexion en ce moment. 😔

Vous pouvez :
• Réessayer dans 1-2 minutes
• Contacter Fatou directement : 07 82 23 50 20

Elle se fera un plaisir de vous aider !`;
    }

    // Réponse générique (dernier recours)
    return `Désolée, je n'ai pas bien compris.

Pouvez-vous reformuler votre demande ?

Vous cherchez à :
• Prendre rendez-vous
• Connaître les tarifs
• Avoir des infos sur les services

Ou appelez Fatou : 07 82 23 50 20 ✨`;
  }

  // POST /api/whatsapp - Webhook Twilio pour WhatsApp
  app.post("/api/whatsapp", async (req, res) => {
    // Déclarer les variables en dehors du try pour les avoir dans le catch
    let messageBody: string | undefined;
    let fromNumber: string | undefined;
    let toNumber: string | undefined;

    try {
      // ============= DEBUG: LOG COMPLET DU WEBHOOK ENTRANT =============
      console.log("\n");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[WHATSAPP IN] 📥 WEBHOOK ENTRANT");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[WHATSAPP IN] Headers:", JSON.stringify(req.headers, null, 2));
      console.log("[WHATSAPP IN] Body complet:", JSON.stringify(req.body, null, 2));
      console.log("[WHATSAPP IN] Timestamp:", new Date().toISOString());

      // Nettoyer les vieilles sessions
      cleanupSessions();

      // Extraire les données Twilio (x-www-form-urlencoded)
      ({ Body: messageBody, From: fromNumber, To: toNumber } = req.body);

      console.log("[WHATSAPP IN] 📝 Message extrait:", messageBody);
      console.log("[WHATSAPP IN] 📞 De:", fromNumber);
      console.log("[WHATSAPP IN] 📞 Vers:", toNumber);

      if (!messageBody || !fromNumber) {
        console.log("[WHATSAPP IN] ❌ ERREUR: Message ou numéro manquant");
        return res.status(400).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Désolé, je n'ai pas compris votre message.</Message>
</Response>`);
      }

      // Extraire le numéro de téléphone (format: whatsapp:+33612345678)
      const phoneNumber = fromNumber.replace("whatsapp:", "");
      console.log("[WHATSAPP IN] 🔢 Numéro normalisé:", phoneNumber);

      // ============= 🔒 NEXUS CORE UNIFIÉ (prioritaire) =============
      if (USE_FULLAI_WHATSAPP) {
        console.log("[WHATSAPP-NEXUS] 🔒 Utilisation de NEXUS Core Unifié");

        // Commandes de reset
        const msgLower = messageBody.toLowerCase().trim();
        if (['annuler', 'stop', 'reset', 'recommencer', 'nouveau'].includes(msgLower)) {
          nexusClearConversation(`whatsapp_${phoneNumber}`);
          return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Conversation réinitialisée ! Comment puis-je vous aider ? 😊</Message>
</Response>`);
        }

        try {
          // Utiliser NEXUS Core unifié
          const conversationId = `whatsapp_${phoneNumber}`;
          console.log("[WHATSAPP-NEXUS] 🚀 Appel nexusProcessMessage...");
          console.log("[WHATSAPP-NEXUS] 🔑 ANTHROPIC_API_KEY présente:", !!process.env.ANTHROPIC_API_KEY);

          const result = await nexusProcessMessage(messageBody, 'whatsapp', {
            conversationId,
            phone: phoneNumber
          });

          console.log("[WHATSAPP-NEXUS] ✅ Réponse en", result.duration, "ms");
          console.log("[WHATSAPP-NEXUS] 📤 Success:", result.success);
          if (!result.success) {
            console.error("[WHATSAPP-NEXUS] ⚠️ Erreur dans result:", result.error);
          }
          console.log("[WHATSAPP-NEXUS] 📝 Réponse:", result.response?.substring(0, 100) + (result.response?.length > 100 ? '...' : ''));

          // Répondre en TwiML
          return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(result.response)}</Message>
</Response>`);
        } catch (nexusError: any) {
          console.error("[WHATSAPP-NEXUS] ❌ ERREUR DÉTAILLÉE:");
          console.error("[WHATSAPP-NEXUS] ❌ Type:", nexusError.constructor?.name);
          console.error("[WHATSAPP-NEXUS] ❌ Message:", nexusError.message);
          console.error("[WHATSAPP-NEXUS] ❌ Stack:", nexusError.stack?.substring(0, 500));
          return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Désolée, j'ai rencontré un problème technique. Réessayez dans quelques instants. 🙏</Message>
</Response>`);
        }
      }
      // ============= FIN NEXUS CORE UNIFIÉ =============

      // ============= NEXUS CORE HANDLER =============
      if (USE_NEXUS_WHATSAPP) {
        console.log("[WHATSAPP-NEXUS] 🚀 Utilisation de nexusCore");

        // Commandes de reset
        const msgLower = messageBody.toLowerCase().trim();
        if (['annuler', 'stop', 'reset', 'recommencer'].includes(msgLower)) {
          whatsappNexusContexts.delete(phoneNumber);
          return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Conversation réinitialisée ! Envoyez "Bonjour" pour recommencer. 😊</Message>
</Response>`);
        }

        // Récupérer ou créer le contexte nexusCore
        let ctx = whatsappNexusContexts.get(phoneNumber);
        if (!ctx) {
          ctx = nexusCore.createConversationContext('whatsapp');
          ctx.data.telephone = phoneNumber;
          whatsappNexusContexts.set(phoneNumber, ctx);
        }

        // Traiter le message via nexusCore (async)
        const result = await nexusCore.processMessage(messageBody, ctx, 'whatsapp');
        console.log("[WHATSAPP-NEXUS] État:", result.context.state);

        // Si action de création de réservation
        if (result.action === 'CREATE_BOOKING' && result.bookingData) {
          try {
            const dateFormatee = result.context.data.dateFormatee || '';
            const jourMatch = dateFormatee.match(/^(\w+)/);
            const jour = jourMatch ? jourMatch[1].toLowerCase() : null;

            const booking = await bookingService.createAppointment({
              clientPrenom: result.bookingData.prenom,
              clientPhone: result.bookingData.telephone,
              service: result.bookingData.service,
              jour: jour,
              heure: result.bookingData.heure,
              clientAddress: result.bookingData.lieu === 'domicile' ? result.bookingData.adresse : null,
              source: 'whatsapp-nexus',
              notes: `WhatsApp - ${result.bookingData.lieu === 'domicile' ? result.bookingData.adresse : 'Chez Fatou'}`
            });

            console.log("[WHATSAPP-NEXUS] Booking:", booking.success ? '✅' : '❌', booking.error || '');

            if (!booking.success) {
              result.response = `Désolé, ce créneau n'est plus disponible. 😔\n${booking.error}\n\nVoulez-vous choisir un autre jour ?`;
              result.context.state = nexusCore.CONVERSATION_STATES.ATTENTE_DATE;
            }
          } catch (bookingErr: any) {
            console.error("[WHATSAPP-NEXUS] Erreur booking:", bookingErr);
          }
        }

        // Mettre à jour le contexte
        whatsappNexusContexts.set(phoneNumber, result.context);

        // Répondre en TwiML
        return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(result.response)}</Message>
</Response>`);
      }
      // ============= FIN NEXUS CORE HANDLER =============

      // Récupérer ou créer la session
      let session = whatsappSessions.get(phoneNumber);
      const isFirstMessage = !session;

      console.log("[WHATSAPP IN] 🎯 Session existante?", !!session);
      console.log("[WHATSAPP IN] 🆕 Premier message?", isFirstMessage);

      if (session) {
        console.log("[WHATSAPP IN] 📚 Historique session:", session.messages.length, "messages");
      }

      if (!session) {
        console.log("[WHATSAPP IN] ✨ CRÉATION NOUVELLE SESSION");
        session = { messages: [], lastActivity: Date.now() };
        whatsappSessions.set(phoneNumber, session);
      }
      session.lastActivity = Date.now();

      // Appeler Halimah (même logique que /api/chat)
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not set");
      }

      const { AI_TOOLS, handleToolCall } = await import("./ai-tools");

      // Date et contexte
      const today = new Date();
      const dateOptions: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const todayFormatted = today.toLocaleDateString('fr-FR', dateOptions);
      const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const salutation = today.getHours() >= 18 ? "Bonsoir" : "Bonjour";

      const firstMessageInstruction = isFirstMessage
        ? `\n⚠️ PREMIER MESSAGE WhatsApp - Commence par: "${salutation} ! ✨ Je suis Halimah, l'assistante de Fatou.\nComment puis-je vous aider ?"\n`
        : "";

      const systemPrompt = `Tu es Halimah, assistante de Fatou. Tu réponds via WhatsApp.
Tu es comme une vendeuse naturelle : écoute, confirme, propose au bon moment.

CONTEXTE :
- Fatou est coiffeuse afro À DOMICILE (pas de salon physique)
- Elle se déplace chez ses clientes dans tout le Val d'Oise et Île-de-France
- Frais de déplacement : 0-5km gratuit, 5-10km = 5€, 10-15km = 10€, etc.
- Option : la cliente peut aussi venir chez Fatou à Franconville (gratuit)

DATE : ${todayFormatted} (${todayISO})
HORAIRES : Lun-Mer-Sam 9h-18h, Jeu 9h-13h, Ven 13h-18h, Dim FERMÉ
${firstMessageInstruction}

SERVICES (vrais tarifs Fatou) :
- Création crochet locks : 200€
- Microlocks twist : à partir de 150€
- Reprise racines locks : 50€
- Braids : à partir de 60€
- Nattes collées : 20-40€
- Soin complet : 50€
- Soin hydratant : 40€
- Brushing : 20€
- Shampoing : 10€

FLOW VENDEUSE NATURELLE :

1. SERVICE CHOISI → Demande QUAND (pas où)
   "Super ! Quand souhaitez-vous venir ?"

2. DATE/HEURE DONNÉE → check_availability
   DISPO : "Parfait ! Le [date] à [heure] c'est bon.
           Je peux aussi me déplacer chez vous si vous préférez ?"
   PAS DISPO : "C'est pris. Je peux proposer..." (get_available_slots)

3. RÉPONSE DÉPLACEMENT :
   A) "Chez moi" → "Quelle est votre adresse ?" → calculate_trip_cost → total
   B) "Je viens" → "RDV au 8 rue des Monts Rouges, Franconville. Total : [prix]€"

VARIANTES :
- "Vous vous déplacez ?" → "Oui avec frais. Vous préférez venir ou que je vienne ?"
- Adresse donnée direct → calculate_trip_cost → total → "Quelle date ?"
- Prix demandé → "[Service] c'est [prix]€ chez Fatou à Franconville. Déplacement en plus si je viens."

OUTILS : list_services, check_availability, get_available_slots, create_appointment, find_appointment, cancel_appointment, search_client_by_name, get_date_info, calculate_trip_cost

DÉTECTION DE SALUTATIONS :
- Salutations acceptées : bonjour, bonsoir, salut, hello, coucou, hey
- Peu importe l'heure (client peut dire "bonsoir" le matin)
- Peu importe la casse (BONJOUR, bonjour, BonJour)
- Tolère les fautes de frappe (bonojur, bonswar, slt)

Comportement selon le message :
1. Message AVEC salutation (ex: "Bonjour", "Salut", "Hey") :
   → Réponds avec "${salutation} ! ✨ Comment puis-je vous aider ?"
   → Si le client dit "Bonsoir" à 10h, tu réponds quand même "Bonjour !" (heure correcte)

2. Message SANS salutation (ex: "Je veux des tresses", "Disponible demain ?") :
   → PAS GRAVE ! C'est un client pressé ou qui continue la conversation
   → Réponds directement et normalement : "Avec plaisir ! Quand souhaitez-vous venir ?"
   → N'exige JAMAIS une salutation, reste naturelle

Exemples :
• "Je veux des tresses" → "Avec plaisir ! Quand souhaitez-vous venir ?"
• "Bonsoir" (à 10h) → "Bonjour ! ✨ Comment puis-je vous aider ?"
• "Salut" → "Bonjour ! ✨ Comment puis-je vous aider ?"
• "Vous faites les locks ?" → "Oui bien sûr ! Quand souhaitez-vous venir ?"

RÈGLES D'OR :
1. Demander QUAND en premier (pas où)
2. Proposer déplacement APRÈS dispo confirmée
3. Frais calculés UNIQUEMENT si client veut déplacement

TON WhatsApp :
- Messages TRÈS courts (2-3 phrases)
- VOUVOIEMENT obligatoire
- Un emoji max (✨)
- Naturel, pas de listes à puces

RECONNAISSANCE : Nom mentionné → search_client_by_name → "${salutation} [Prénom] !"`;


      const callClaude = async (msgs: any[]) => {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 500, // Plus court pour WhatsApp
            system: systemPrompt,
            tools: AI_TOOLS,
            messages: msgs,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
        }

        return response.json();
      };

      // Construire les messages pour l'API
      let apiMessages = [...session.messages, { role: "user", content: messageBody }];

      console.log("[WHATSAPP IN] 🤖 APPEL CLAUDE API");
      console.log("[WHATSAPP IN] Premier message?", isFirstMessage);
      console.log("[WHATSAPP IN] Instruction premier message incluse?", firstMessageInstruction !== "");
      console.log("[WHATSAPP IN] Messages envoyés à Claude:", JSON.stringify(apiMessages, null, 2));
      console.log("[WHATSAPP IN] System prompt (100 premiers chars):", systemPrompt.substring(0, 100) + "...");

      let data = await callClaude(apiMessages);

      console.log("[WHATSAPP IN] 📩 RÉPONSE CLAUDE REÇUE");
      console.log("[WHATSAPP IN] Stop reason:", data.stop_reason);
      console.log("[WHATSAPP IN] Content blocks:", data.content.length);

      // Boucle pour gérer les tool calls
      while (data.stop_reason === "tool_use") {
        const toolUseBlocks = data.content.filter((block: any) => block.type === "tool_use");
        apiMessages.push({ role: "assistant", content: data.content });

        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          console.log(`[WhatsApp] Tool call: ${toolUse.name}`, toolUse.input);
          // Injecter created_via: "whatsapp" pour les créations de RDV via WhatsApp
          const toolInput = toolUse.name === "create_appointment"
            ? { ...toolUse.input, created_via: "whatsapp" }
            : toolUse.input;
          const result = await handleToolCall(toolUse.name, toolInput);
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        apiMessages.push({ role: "user", content: toolResults });
        data = await callClaude(apiMessages);
      }

      // Extraire la réponse texte
      const textBlocks = data.content.filter((block: any) => block.type === "text");
      let assistantMessage = textBlocks.map((block: any) => block.text).join("\n");

      console.log("[WHATSAPP IN] 💬 MESSAGE EXTRAIT DE CLAUDE:");
      console.log("[WHATSAPP IN]", assistantMessage);
      console.log("[WHATSAPP IN] Commence par salutation?", /^(Bonjour|Bonsoir)/i.test(assistantMessage.trim()));

      // Préfixer avec salutation si premier message
      if (isFirstMessage && !/^(Bonjour|Bonsoir)/i.test(assistantMessage.trim())) {
        console.log("[WHATSAPP IN] ⚠️  FALLBACK: Ajout salutation car premier message sans salut");
        assistantMessage = `${salutation} ! ✨ Je suis Halimah, l'assistante de Fatou.\nComment puis-je vous aider ?\n\n${assistantMessage}`;
      }

      console.log("[WHATSAPP IN] 📤 MESSAGE FINAL À ENVOYER:");
      console.log("[WHATSAPP IN]", assistantMessage);

      // Mettre à jour l'historique de la session
      session.messages.push({ role: "user", content: messageBody });
      session.messages.push({ role: "assistant", content: assistantMessage });

      // Limiter l'historique à 20 messages pour éviter les dépassements
      if (session.messages.length > 20) {
        session.messages = session.messages.slice(-20);
      }

      console.log("[WHATSAPP IN] 📊 SESSION MISE À JOUR:", session.messages.length, "messages au total");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[WHATSAPP IN] ✅ ENVOI RÉPONSE TWILIO\n");

      // Répondre en TwiML
      res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(assistantMessage)}</Message>
</Response>`);

    } catch (error: any) {
      // Logger l'erreur complète pour debugging
      console.error("[WHATSAPP ERROR] ===================================");
      console.error("[WHATSAPP ERROR] Message utilisateur:", messageBody);
      console.error("[WHATSAPP ERROR] Numéro:", fromNumber);
      console.error("[WHATSAPP ERROR] Type:", error?.name || "Unknown");
      console.error("[WHATSAPP ERROR] Message:", error?.message || error);
      console.error("[WHATSAPP ERROR] Stack:", error?.stack);
      console.error("[WHATSAPP ERROR] ===================================");

      // Récupérer la session pour avoir l'historique (si elle existe)
      let conversationHistory: any[] = [];
      try {
        const phoneNumber = fromNumber?.replace("whatsapp:", "") || "";
        const session = whatsappSessions.get(phoneNumber);
        conversationHistory = session?.messages || [];
      } catch (sessionError) {
        console.error("[WHATSAPP ERROR] Impossible de récupérer la session:", sessionError);
      }

      // Générer une réponse intelligente basée sur le contexte
      const smartResponse = getSmartErrorResponse(
        messageBody || "",
        conversationHistory,
        error
      );

      // Répondre en TwiML avec le message contextuel
      res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(smartResponse)}</Message>
</Response>`);
    }
  });

  // Fonction pour échapper les caractères XML
  function escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // ============= API GOOGLE MAPS - CALCUL DE TRAJET =============

  // POST /api/maps/calculate-trip - Calcule distance, durée et frais de déplacement
  app.post("/api/maps/calculate-trip", async (req, res) => {
    try {
      const { adresse_client, duree_service_minutes, heure_rdv } = req.body;

      if (!adresse_client) {
        return res.status(400).json({
          success: false,
          error: "L'adresse du client est requise",
        });
      }

      // Calculer la distance depuis chez Fatou
      const distanceResult = await getDistanceFromSalon(adresse_client);

      // Calculer les frais de déplacement
      const fraisDepl = calculerFraisDepl(distanceResult.distance_km);

      // Calculer le bloc de réservation si heure_rdv et durée fournis
      let blocReservation = null;
      if (heure_rdv && duree_service_minutes) {
        blocReservation = calculerBlocReservation(
          heure_rdv,
          duree_service_minutes,
          distanceResult.duree_minutes
        );
      }

      res.json({
        success: true,
        data: {
          distance_km: distanceResult.distance_km,
          distance_text: distanceResult.distance_text,
          duree_minutes: distanceResult.duree_minutes,
          duree_text: distanceResult.duree_text,
          adresse_depart: distanceResult.origin,
          adresse_arrivee: distanceResult.destination,
          frais_deplacement: fraisDepl,
          bloc_reservation: blocReservation,
        },
      });
    } catch (error: any) {
      console.error("[Maps] Erreur calcul trajet:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Erreur lors du calcul du trajet",
      });
    }
  });

  // GET /api/maps/calculate-trip - Version GET pour tests rapides
  app.get("/api/maps/calculate-trip", async (req, res) => {
    try {
      const adresse_client = req.query.adresse as string;

      if (!adresse_client) {
        return res.status(400).json({
          success: false,
          error: "Paramètre 'adresse' requis",
          exemple: "/api/maps/calculate-trip?adresse=15 rue Victor Hugo, 95100 Argenteuil",
        });
      }

      // Calculer la distance depuis chez Fatou
      const distanceResult = await getDistanceFromSalon(adresse_client);

      // Calculer les frais de déplacement
      const fraisDepl = calculerFraisDepl(distanceResult.distance_km);

      res.json({
        success: true,
        data: {
          distance_km: distanceResult.distance_km,
          distance_text: distanceResult.distance_text,
          duree_minutes: distanceResult.duree_minutes,
          duree_text: distanceResult.duree_text,
          adresse_depart: distanceResult.origin,
          adresse_arrivee: distanceResult.destination,
          frais_deplacement: fraisDepl,
        },
      });
    } catch (error: any) {
      console.error("[Maps] Erreur calcul trajet:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Erreur lors du calcul du trajet",
      });
    }
  });

  // ============= HALIMAH PRO - ADMIN AUTH =============
  app.use('/api/admin/auth', adminAuthRouter);

  // ============= HALIMAH PRO - ADMIN STATS =============
  app.use('/api/admin/stats', adminStatsRouter);

  // ============= HALIMAH PRO - ADMIN SERVICES =============
  app.use('/api/admin/services', adminServicesRouter);

  // ============= PUBLIC SERVICES API =============
  app.get('/api/services', async (req, res) => {
    try {
      const { data: services, error } = await supabase
        .from('services')
        .select('*')
        .order('ordre', { ascending: true });

      if (error) throw error;

      // Mapper les champs pour le frontend
      // Note: la table n'a que id, created_at, nom, description, duree, prix, ordre
      const mappedServices = (services || []).map(s => ({
        id: s.id,
        nom: s.nom,
        description: s.description || '',
        duree: s.duree || 0, // minutes
        prix: s.prix || 0, // centimes
        categorie: 'Coiffure', // Valeur par défaut (pas de colonne categorie)
        image: null, // Pas de colonne image
        populaire: false // Pas de colonne populaire
      }));

      res.json({ services: mappedServices });
    } catch (error: any) {
      console.error('[PUBLIC SERVICES] Erreur:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  });
  console.log('[ROUTES] ✅ Public services registered at /api/services');

  // ============= HALIMAH PRO - ADMIN DISPONIBILITES =============
  app.use('/api/admin/disponibilites', adminDisponibilitesRouter);

  // ============= HALIMAH PRO - ADMIN CLIENTS =============
  app.use('/api/admin/clients', adminClientsRouter);

  // ============= HALIMAH PRO - ADMIN RESERVATIONS =============
  app.use('/api/admin/reservations', adminReservationsRouter);

  // ============= HALIMAH PRO - ADMIN ORDERS =============
  app.use('/api/admin/orders', adminOrdersRouter);

  // ============= HALIMAH PRO - ADMIN PARAMETRES =============
  app.use('/api/admin/parametres', adminParametresRouter);

  // ============= RECHERCHE GLOBALE ADMIN =============
  app.get('/api/admin/search', authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const q = req.query.q as string;
      if (!q || q.trim().length < 2) {
        return res.json({ success: true, results: { clients: [], reservations: [], services: [] } });
      }
      const query = q.trim();
      const today = new Date().toISOString().split('T')[0];

      const [clientsRes, reservationsRes, servicesRes] = await Promise.all([
        supabase.from('clients').select('id, nom, prenom, telephone, email').or(`nom.ilike.%${query}%,prenom.ilike.%${query}%,telephone.ilike.%${query}%,email.ilike.%${query}%`).limit(5),
        supabase.from('reservations').select('id, date, heure, service_nom, statut, duree_minutes, clients(nom, prenom, telephone)').or(`service_nom.ilike.%${query}%`).gte('date', today).in('statut', ['confirme', 'demande']).order('date', { ascending: true }).limit(5),
        supabase.from('services').select('id, nom, duree, prix').ilike('nom', `%${query}%`).limit(5),
      ]);

      // Also search reservations by client name
      let clientMatchRdv: any[] = [];
      const { data: matchingClients } = await supabase.from('clients').select('id').or(`nom.ilike.%${query}%,prenom.ilike.%${query}%,telephone.ilike.%${query}%`).limit(5);
      if (matchingClients && matchingClients.length > 0) {
        const clientIds = matchingClients.map((c: any) => c.id);
        const { data } = await supabase.from('reservations').select('id, date, heure, service_nom, statut, duree_minutes, clients(nom, prenom, telephone)').in('client_id', clientIds).gte('date', today).in('statut', ['confirme', 'demande']).order('date', { ascending: true }).limit(5);
        clientMatchRdv = data || [];
      }

      // Merge reservations, dedupe
      const allRdv = [...(reservationsRes.data || []), ...clientMatchRdv];
      const seenIds = new Set<number>();
      const uniqueRdv = allRdv.filter((r: any) => { if (seenIds.has(r.id)) return false; seenIds.add(r.id); return true; }).slice(0, 5);

      res.json({
        success: true,
        query,
        results: {
          clients: clientsRes.data || [],
          reservations: uniqueRdv,
          services: (servicesRes.data || []).map((s: any) => ({ ...s, prix: s.prix / 100 })),
        }
      });
    } catch (error: any) {
      console.error('[SEARCH] Erreur:', error.message);
      res.status(500).json({ success: false, error: 'Erreur de recherche' });
    }
  });

  // ============= AI AGENTS CONFIG =============
  app.use('/api/admin/agents', adminAgentsRouter);
  console.log('[ROUTES] ✅ AI Agents registered at /api/admin/agents');

  // ============= AVIS CLIENTS =============
  app.use('/api/reviews', reviewsRouter);
  console.log('[ROUTES] ✅ Reviews registered at /api/reviews');

  // ============= HALIMAH PRO - CHAT ASSISTANT =============
  app.use('/api/admin/halimah-pro', halimahProRouter);

  // ============= SENTINEL - MONITORING & AUTO-REPAIR =============
  app.use('/api/sentinel', authenticateAdmin, requireSuperAdmin, sentinelRoutes);
  console.log('[ROUTES] ✅ SENTINEL registered at /api/sentinel (super_admin only)');

  // ============= GOOGLE DRIVE AUTH =============
  app.use('/api/google', googleAuthRouter);
  console.log('[ROUTES] ✅ Google Auth registered at /api/google');

  // ============= CONTENT CREATOR =============
  app.use('/api/content', contentCreatorRouter);
  console.log('[ROUTES] ✅ Content Creator registered at /api/content');

  // ============= ELEVENLABS TTS =============
  app.post('/api/tts/elevenlabs', async (req, res) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      // Voix française féminine "Charlotte" (multilingual)
      // Alternatives: "Rachel" (EN), "Bella" (EN), "Charlotte" (multilingual)
      const voiceId = 'XB0fDUnXU5powFXDhCwa'; // Charlotte - douce et naturelle

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.8,         // Plus stable = plus lent et posé
            similarity_boost: 0.5,  // Réduit pour naturel
            style: 0.1,             // Moins expressif = rythme plus régulier
            use_speaker_boost: true
          },
          // Vitesse de lecture (0.25 = très lent, 1.0 = normal, 4.0 = très rapide)
          speed: 0.85
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ELEVENLABS] Error:', response.status, errorText);
        return res.status(response.status).json({ error: 'ElevenLabs API error', details: errorText });
      }

      // Récupérer l'audio et le renvoyer
      const audioBuffer = await response.arrayBuffer();
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength
      });
      res.send(Buffer.from(audioBuffer));

    } catch (error: any) {
      console.error('[ELEVENLABS] Error:', error);
      res.status(500).json({ error: 'TTS generation failed', message: error.message });
    }
  });
  console.log('[ROUTES] ✅ ElevenLabs TTS registered at /api/tts/elevenlabs');

  // ============= ELEVENLABS CONVERSATIONAL AI - WEBHOOK BOOKING =============
  app.post('/api/elevenlabs/booking', async (req: any, res) => {
    console.log('[ELEVENLABS BOOKING] ===== DEBUT =====');
    console.log('[ELEVENLABS BOOKING] Body reçu:', JSON.stringify(req.body));

    try {
      const { client_name, client_phone, service, date, heure, notes, duree_minutes, nombre_locks } = req.body;
      console.log('[ELEVENLABS BOOKING] Données extraites:', JSON.stringify({ client_name, client_phone, service, date, heure, notes, duree_minutes, nombre_locks }));

      if (!client_name || !client_phone || !service || !date || !heure) {
        console.log('[ELEVENLABS BOOKING] ❌ Champs manquants');
        return res.status(400).json({ success: false, error: 'Champs requis: client_name, client_phone, service, date, heure' });
      }

      const nameParts = client_name.trim().split(' ');
      const prenom = nameParts[0] || '';
      const nom = nameParts.slice(1).join(' ') || client_name;
      console.log('[ELEVENLABS BOOKING] Client:', JSON.stringify({ prenom, nom }));

      // Normaliser le nom du service
      console.log('[ELEVENLABS BOOKING] Import modules...');
      const { createReservationUnified } = await import(
        "../backend/src/core/unified/nexusCore.js"
      );
      const { normalizeServiceName } = await import(
        "../backend/src/utils/serviceMapper.js"
      );
      const normalizedService = normalizeServiceName(service);
      console.log(`[ELEVENLABS BOOKING] Service: "${service}" → "${normalizedService}"`);

      // Calculer durée pour services variables (Réparation Locks = 30min/lock)
      let calculatedDuree = duree_minutes ? parseInt(duree_minutes) : undefined;
      let enrichedNotes = notes ? `[Via téléphone IA] ${notes}` : '[Via téléphone IA]';

      if (nombre_locks && parseInt(nombre_locks) > 0) {
        const nb = parseInt(nombre_locks);
        calculatedDuree = nb * 30;
        enrichedNotes = `[Via téléphone IA] ${nb} locks` + (notes ? ` - ${notes}` : '');
        console.log(`[ELEVENLABS BOOKING] 🔧 Réparation Locks: ${nb} locks → ${calculatedDuree}min`);
      }

      const data: any = {
        service_name: normalizedService,
        date,
        heure,
        client_nom: nom,
        client_prenom: prenom,
        client_telephone: client_phone,
        lieu: 'chez_fatou',
        notes: enrichedNotes,
      };
      if (calculatedDuree) data.duree_minutes = calculatedDuree;
      console.log('[ELEVENLABS BOOKING] Data pour createReservationUnified:', JSON.stringify(data));

      const result = await createReservationUnified(data, 'telephone', { sendSMS: true });
      console.log('[ELEVENLABS BOOKING] Résultat:', JSON.stringify(result));

      if (!result.success) {
        const errMsg = result.message || result.error || (result.errors && result.errors.join(', ')) || 'Erreur création RDV';
        console.log('[ELEVENLABS BOOKING] ❌ ÉCHEC:', errMsg);
        return res.status(400).json({ success: false, error: errMsg });
      }

      console.log(`[ELEVENLABS BOOKING] ✅ SUCCESS RDV #${result.reservationId} pour ${client_name}`);
      res.json({ success: true, data: { appointment_id: result.reservationId, message: `Rendez-vous confirmé pour ${client_name} le ${date} à ${heure}` } });

    } catch (error: any) {
      console.log('[ELEVENLABS BOOKING] ⛔ CRASH:', error.message || error);
      console.log('[ELEVENLABS BOOKING] Stack:', error.stack || 'no stack');
      res.status(500).json({ success: false, error: error.message || 'Erreur webhook booking' });
    }

    console.log('[ELEVENLABS BOOKING] ===== FIN =====');
  });
  console.log('[ROUTES] ✅ ElevenLabs Booking webhook registered at /api/elevenlabs/booking');

  // ============= DATES INFO API =============
  app.post('/api/dates/info', (req: any, res) => {
    try {
      const { date } = req.body;
      if (!date) {
        return res.status(400).json({ success: false, error: 'Date requise (format YYYY-MM-DD)' });
      }

      // Parse date with noon to avoid timezone issues
      const d = new Date(date + 'T12:00:00+01:00');
      if (isNaN(d.getTime())) {
        return res.status(400).json({ success: false, error: `Date invalide: ${date}` });
      }

      const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

      const jourNum = d.getDay();
      const jourNom = JOURS[jourNum];
      const jourMois = d.getDate();
      const moisNom = MOIS[d.getMonth()];
      const annee = d.getFullYear();

      // Business hours
      const HORAIRES: Record<string, { ouvert: boolean; debut: string; fin: string }> = {
        dimanche: { ouvert: false, debut: '', fin: '' },
        lundi: { ouvert: true, debut: '09:00', fin: '18:00' },
        mardi: { ouvert: true, debut: '09:00', fin: '18:00' },
        mercredi: { ouvert: true, debut: '09:00', fin: '18:00' },
        jeudi: { ouvert: true, debut: '09:00', fin: '13:00' },
        vendredi: { ouvert: true, debut: '13:00', fin: '18:00' },
        samedi: { ouvert: true, debut: '09:00', fin: '18:00' },
      };

      const horaire = HORAIRES[jourNom];

      res.json({
        success: true,
        date,
        jour_numero: jourNum,
        jour_nom: jourNom,
        texte_long: `${jourNom} ${jourMois} ${moisNom} ${annee}`,
        est_ouvert: horaire.ouvert,
        horaires: horaire.ouvert ? `${horaire.debut} - ${horaire.fin}` : 'Fermé',
        horaire_debut: horaire.debut,
        horaire_fin: horaire.fin,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
  console.log('[ROUTES] ✅ Dates info API registered at /api/dates/info');

  // ============= TWILIO WEBHOOKS - APPELS & SMS =============
  app.use('/api/twilio', twilioWebhooksRouter);
  console.log('[ROUTES] ✅ Twilio webhooks registered at /api/twilio');

  // ============= CLIENT AUTH =============
  app.use('/api/client/auth', clientAuthRouter);
  console.log('[ROUTES] ✅ Client auth registered at /api/client/auth');

  // ============= CLIENT DASHBOARD =============
  app.use('/api/client', clientDashboardRouter);
  console.log('[ROUTES] ✅ Client dashboard registered at /api/client');

  // ============= ORDERS & CHECKOUT =============
  app.use('/api/orders', ordersRouter);
  console.log('[ROUTES] ✅ Orders registered at /api/orders');
  console.log('[ROUTES] ✅ Admin orders registered at /api/admin/orders');

  // ============= PAYMENT (STRIPE & PAYPAL) =============
  app.use('/api/payment', paymentRouter);
  console.log('[ROUTES] ✅ Payment registered at /api/payment');

  // ============= PLACES (AUTOCOMPLETE ADRESSE) =============
  app.use('/api/places', placesRouter);
  console.log('[ROUTES] ✅ Places registered at /api/places');

  // ============= VOICE (TEXT-TO-SPEECH ELEVENLABS) =============
  app.use('/api/voice', voiceRouter);
  console.log('[ROUTES] ✅ Voice registered at /api/voice');

  // ============= OPTIMIZATION (COST MONITORING & CACHE) =============
  app.use('/api/optimization', optimizationRouter);
  console.log('[ROUTES] ✅ Optimization registered at /api/optimization');

  // ============= COMMERCE - CATALOGUE PRODUITS =============
  const commerce = await import("../backend/src/modules/commerce/index.js");

  // --- Catégories ---
  app.get('/api/admin/categories', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const includeInactive = req.query.includeInactive === 'true';
    const result = await commerce.getCategories(tenantId, includeInactive);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/categories', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await commerce.createCategory(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });

  app.put('/api/admin/categories/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await commerce.updateCategory(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.delete('/api/admin/categories/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await commerce.deleteCategory(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // --- Produits ---
  app.get('/api/admin/products', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const options = {
      categoryId: req.query.categoryId,
      includeInactive: req.query.includeInactive === 'true',
      search: req.query.search,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset) : undefined,
    };
    const result = await commerce.getProducts(tenantId, options);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/products/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await commerce.getProductById(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });

  app.post('/api/admin/products', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await commerce.createProduct(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });

  app.put('/api/admin/products/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await commerce.updateProduct(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.delete('/api/admin/products/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await commerce.deleteProduct(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  console.log('[ROUTES] ✅ Commerce (catalogue produits) registered at /api/admin/categories & /api/admin/products');

  // ============= COMMERCE - STOCK & ALERTES =============
  const stock = await import("../backend/src/modules/commerce/stockService.js");

  // Stock d'un produit
  app.get('/api/admin/products/:id/stock', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await stock.getProductStock(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Mouvement de stock
  app.post('/api/admin/products/:id/stock/movement', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await stock.addStockMovement(tenantId, req.params.id, {
      type: req.body.type,
      quantity: req.body.quantity,
      reason: req.body.reason,
      referenceId: req.body.referenceId,
      createdBy: req.admin?.id,
    });
    res.status(result.success ? 200 : 400).json(result);
  });

  // Réapprovisionner (raccourci)
  app.post('/api/admin/products/:id/stock/restock', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await stock.restockProduct(tenantId, req.params.id, req.body.quantity, req.body.reason);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Ajuster stock (inventaire)
  app.post('/api/admin/products/:id/stock/adjust', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await stock.adjustStock(tenantId, req.params.id, req.body.newQuantity, req.body.reason);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Historique mouvements
  app.get('/api/admin/stock/movements', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await stock.getStockMovements(tenantId, {
      productId: req.query.productId,
      type: req.query.type,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset) : undefined,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.status(result.success ? 200 : 500).json(result);
  });

  // Alertes stock bas
  app.get('/api/admin/stock/alerts', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await stock.getLowStockProducts(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Produits en rupture
  app.get('/api/admin/stock/out-of-stock', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await stock.getOutOfStockProducts(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Stats stock globales
  app.get('/api/admin/stock/stats', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await stock.getStockStats(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Commerce (stock & alertes) registered at /api/admin/stock/*');

  // ============= COMMERCE - CONSEILS IA STOCK =============
  const advisorSvc = await import("../backend/src/modules/commerce/stockAdvisorService.js");

  // GET /api/admin/stock/analysis - Analyse complète du stock
  app.get('/api/admin/stock/analysis', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await advisorSvc.analyzeStock(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  // GET /api/admin/stock/ai-report - Rapport IA généré par Claude
  app.get('/api/admin/stock/ai-report', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const tenantName = req.query.name || 'Commerce';
    const result = await advisorSvc.generateAIReport(tenantId, tenantName);
    res.status(result.success ? 200 : 500).json(result);
  });

  // GET /api/admin/stock/promo-suggestions - Suggestions de promotions
  app.get('/api/admin/stock/promo-suggestions', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await advisorSvc.suggestPromotions(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Commerce (conseils IA stock) registered at /api/admin/stock/analysis|ai-report|promo-suggestions');

  // ============= COMMERCE - VENTES & STATS =============
  const sales = await import("../backend/src/modules/commerce/salesService.js");

  // Créer une vente
  app.post('/api/admin/sales', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await sales.createSale(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });

  // Lister les ventes
  app.get('/api/admin/sales', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await sales.getSales(tenantId, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset) : undefined,
    });
    res.status(result.success ? 200 : 500).json(result);
  });

  // Détail d'une vente
  app.get('/api/admin/sales/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await sales.getSaleById(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });

  // Stats globales par période
  app.get('/api/admin/stats/sales', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await sales.getSalesStats(tenantId, req.query.period || 'month');
    res.status(result.success ? 200 : 500).json(result);
  });

  // Top produits
  app.get('/api/admin/stats/top-products', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const result = await sales.getTopProducts(tenantId, req.query.period || 'month', limit);
    res.status(result.success ? 200 : 500).json(result);
  });

  // CA par jour (graphique)
  app.get('/api/admin/stats/daily-revenue', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const days = req.query.days ? parseInt(req.query.days) : 30;
    const result = await sales.getDailyRevenue(tenantId, days);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Comparaison période précédente
  app.get('/api/admin/stats/comparison', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await sales.getComparison(tenantId, req.query.period || 'month');
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Commerce (ventes & stats) registered at /api/admin/sales & /api/admin/stats/*');

  // ============= COMMERCE - COMMANDES EN LIGNE =============
  const orderSvc = await import("../backend/src/modules/commerce/orderService.js");

  // Client: créer commande (public, tenant par défaut)
  app.post('/api/commerce/orders', async (req: any, res) => {
    const tenantId = req.body.tenantId || 'default';
    const result = await orderSvc.createOrder(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });

  // Client: suivi commande par numéro
  app.get('/api/commerce/orders/:orderNumber/status', async (req: any, res) => {
    const tenantId = (req.query.tenantId as string) || 'default';
    const result = await orderSvc.getOrderByNumber(tenantId, req.params.orderNumber);
    res.status(result.success ? 200 : 404).json(result);
  });

  // Admin: lister commandes
  app.get('/api/admin/commerce/orders', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await orderSvc.getOrders(tenantId, {
      status: req.query.status,
      orderType: req.query.orderType,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset) : undefined,
    });
    res.status(result.success ? 200 : 500).json(result);
  });

  // Admin: détail commande
  app.get('/api/admin/commerce/orders/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await orderSvc.getOrderById(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });

  // Admin: changer statut
  app.put('/api/admin/commerce/orders/:id/status', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await orderSvc.updateOrderStatus(tenantId, req.params.id, req.body.status, req.body.adminNotes);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Admin: annuler commande
  app.post('/api/admin/commerce/orders/:id/cancel', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await orderSvc.cancelOrder(tenantId, req.params.id, req.body.reason);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Admin: stats commandes
  app.get('/api/admin/commerce/orders/stats', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await orderSvc.getOrderStats(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Commerce (commandes) registered at /api/commerce/orders & /api/admin/commerce/orders');

  // ============= COMMERCE - CLICK & COLLECT =============
  const pickupSvc = await import("../backend/src/modules/commerce/pickupService.js");

  // Admin: config créneaux
  app.get('/api/admin/pickup/config', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await pickupSvc.getPickupConfig(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/pickup/config', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await pickupSvc.setPickupConfig(tenantId, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.delete('/api/admin/pickup/config/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await pickupSvc.deletePickupConfig(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Admin: exceptions
  app.get('/api/admin/pickup/exceptions', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await pickupSvc.getExceptions(tenantId, req.query.startDate, req.query.endDate);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/pickup/exceptions', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await pickupSvc.setException(tenantId, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.delete('/api/admin/pickup/exceptions/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await pickupSvc.deleteException(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Client: créneaux disponibles (public)
  app.get('/api/pickup/slots', async (req: any, res) => {
    const tenantId = (req.query.tenantId as string) || 'default';
    const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
    const days = req.query.days ? parseInt(req.query.days) : 7;
    const result = await pickupSvc.getAvailableSlots(tenantId, startDate, days);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Commerce (click & collect) registered at /api/admin/pickup/* & /api/pickup/slots');

  // ============= COMMERCE - LIVRAISON =============
  const deliverySvc = await import("../backend/src/modules/commerce/deliveryService.js");

  // Admin: zones de livraison
  app.get('/api/admin/delivery/zones', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await deliverySvc.getDeliveryZones(tenantId, req.query.includeInactive === 'true');
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/delivery/zones', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await deliverySvc.saveDeliveryZone(tenantId, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.delete('/api/admin/delivery/zones/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await deliverySvc.deleteDeliveryZone(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Client: vérifier zone et calculer frais
  app.get('/api/delivery/check', async (req: any, res) => {
    const tenantId = (req.query.tenantId as string) || 'default';
    const postalCode = req.query.postalCode as string;
    const amount = parseFloat(req.query.amount as string) || 0;
    if (!postalCode) return res.status(400).json({ success: false, error: 'Code postal requis' });
    const result = await deliverySvc.calculateDeliveryFee(tenantId, postalCode, amount);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Admin: livraisons en cours
  app.get('/api/admin/delivery/pending', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await deliverySvc.getPendingDeliveries(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Admin: suivi livraison d'une commande
  app.get('/api/admin/commerce/orders/:id/delivery', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await deliverySvc.getDeliveryTracking(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Admin: mettre à jour suivi
  app.put('/api/admin/commerce/orders/:id/delivery', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await deliverySvc.updateDeliveryStatus(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Admin: assigner livreur
  app.post('/api/admin/commerce/orders/:id/delivery/assign', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await deliverySvc.assignDriver(tenantId, req.params.id, req.body.driverName, req.body.driverPhone, req.body.estimatedArrival);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Admin: stats livraison
  app.get('/api/admin/delivery/stats', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const days = req.query.days ? parseInt(req.query.days) : 30;
    const result = await deliverySvc.getDeliveryStats(tenantId, days);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Commerce (livraison) registered at /api/admin/delivery/* & /api/delivery/check');

  // =============================================
  // TWILIO CALL LOGS
  // =============================================
  const callLogSvc = await import("../backend/src/modules/twilio/callLogService.js");

  // GET /api/admin/twilio/logs - Liste des appels/SMS
  app.get('/api/admin/twilio/logs', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const { channel, limit, offset, startDate, endDate } = req.query;
    const result = await callLogSvc.getCallLogs(tenantId, {
      channel, limit: limit ? parseInt(limit) : 50, offset: offset ? parseInt(offset) : 0, startDate, endDate,
    });
    res.status(result.success ? 200 : 500).json(result);
  });

  // GET /api/admin/twilio/logs/:callSid - Détail d'un appel
  app.get('/api/admin/twilio/logs/:callSid', authenticateAdmin, async (req: any, res) => {
    const result = await callLogSvc.getCallLogByCallSid(req.params.callSid);
    res.status(result.success ? 200 : 404).json(result);
  });

  // GET /api/admin/twilio/stats - Stats appels
  app.get('/api/admin/twilio/stats', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const days = req.query.days ? parseInt(req.query.days) : 30;
    const result = await callLogSvc.getCallStats(tenantId, days);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Twilio call logs registered at /api/admin/twilio/*');

  // =============================================
  // RÉSEAUX SOCIAUX
  // =============================================
  const socialSvc = await import("../backend/src/modules/social/socialService.js");

  // --- Comptes sociaux ---
  app.get('/api/admin/social/accounts', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialSvc.getSocialAccounts(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/social/accounts', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialSvc.connectAccount(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });

  app.delete('/api/admin/social/accounts/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialSvc.disconnectAccount(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // --- Posts ---
  app.get('/api/admin/social/posts', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const { status, category, limit, offset } = req.query;
    const result = await socialSvc.getPosts(tenantId, {
      status, category, limit: limit ? parseInt(limit) : 50, offset: offset ? parseInt(offset) : 0,
    });
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/social/posts/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialSvc.getPostById(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });

  app.post('/api/admin/social/posts', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialSvc.createPost(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });

  app.put('/api/admin/social/posts/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialSvc.updatePost(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.delete('/api/admin/social/posts/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialSvc.deletePost(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/admin/social/posts/:id/schedule', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialSvc.schedulePost(tenantId, req.params.id, req.body.scheduledAt);
    res.status(result.success ? 200 : 400).json(result);
  });

  // --- Calendrier ---
  app.get('/api/admin/social/calendar', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ success: false, error: 'start et end requis' });
    const result = await socialSvc.getCalendar(tenantId, start, end);
    res.status(result.success ? 200 : 500).json(result);
  });

  // --- Templates ---
  app.get('/api/admin/social/templates', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const { category, businessType } = req.query;
    const result = await socialSvc.getTemplates(tenantId, { category, businessType });
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/social/templates', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialSvc.createTemplate(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });

  // --- Stats ---
  app.get('/api/admin/social/stats', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const days = req.query.days ? parseInt(req.query.days) : 30;
    const result = await socialSvc.getPostStats(tenantId, days);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Réseaux sociaux registered at /api/admin/social/*');

  // =============================================
  // IA SOCIAL
  // =============================================
  const socialAI = await import("../backend/src/modules/social/socialAIService.js");

  app.post('/api/admin/social/ai/generate-ideas', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialAI.generatePostIdeas(tenantId, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/social/ai/generate-product-post', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialAI.generateProductPost(tenantId, req.body.productId);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/admin/social/ai/generate-promo-post', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialAI.generatePromoPost(tenantId, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/admin/social/ai/suggest-hashtags', authenticateAdmin, async (req: any, res) => {
    const result = await socialAI.suggestHashtags(req.body.content, req.body.businessType);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/social/ai/best-times', authenticateAdmin, async (req: any, res) => {
    const platforms = req.query.platforms ? req.query.platforms.split(',') : [];
    const result = await socialAI.suggestBestTimes(req.query.businessType, platforms);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/social/ai/generate-reply', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await socialAI.generateCommentReply(tenantId, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/social/ai/analyze-sentiment', authenticateAdmin, async (req: any, res) => {
    const result = await socialAI.analyzeSentiment(req.body.text);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ IA Social registered at /api/admin/social/ai/*');

  // ==================== MODULE COMPTA ====================
  const acctSvc = await import("../backend/src/modules/accounting/accountingService.js");
  const requireAccounting = requireFeature('accounting');

  // Config
  app.get('/api/admin/accounting/config', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.getConfig(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.put('/api/admin/accounting/config', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.updateConfig(tenantId, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Categories
  app.get('/api/admin/accounting/categories', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.getCategories(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/accounting/categories', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.createCategory(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  app.put('/api/admin/accounting/categories/:id', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.updateCategory(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.delete('/api/admin/accounting/categories/:id', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.deleteCategory(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Invoices
  app.get('/api/admin/accounting/invoices', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.getInvoices(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/accounting/invoices/:id', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.getInvoiceById(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/accounting/invoices', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.createInvoice(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  app.put('/api/admin/accounting/invoices/:id', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.updateInvoice(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.delete('/api/admin/accounting/invoices/:id', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.deleteInvoice(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/accounting/invoices/:id/send', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.sendInvoice(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/accounting/invoices/:id/mark-paid', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.markInvoicePaid(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/accounting/invoices/:id/cancel', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.cancelInvoice(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Transactions
  app.get('/api/admin/accounting/transactions', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.getTransactions(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/accounting/transactions', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.createTransaction(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  app.put('/api/admin/accounting/transactions/:id', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.updateTransaction(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.delete('/api/admin/accounting/transactions/:id', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.deleteTransaction(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Stats
  app.get('/api/admin/accounting/stats/overview', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.getOverview(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/accounting/stats/revenue', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.getRevenueStats(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/accounting/stats/expenses', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.getExpensesByCategory(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/accounting/stats/cashflow', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.getCashflow(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/accounting/stats/vat', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.getVatReport(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Exports
  app.get('/api/admin/accounting/export/csv', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.exportTransactionsCSV(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/accounting/export/vat-declaration', authenticateAdmin, requireAccounting, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await acctSvc.exportVatDeclaration(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Accounting registered at /api/admin/accounting/*');

  // ==================== MODULE CRM ====================
  const crmSvc = await import("../backend/src/modules/crm/crmService.js");

  // Contacts
  app.get('/api/admin/crm/contacts', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const { status, source, search, tags } = req.query;
    const result = await crmSvc.getContacts(tenantId, { status, source, search, tags: tags ? tags.split(',') : undefined });
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/crm/contacts/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.getContactById(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/contacts', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.createContact(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  app.put('/api/admin/crm/contacts/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.updateContact(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.delete('/api/admin/crm/contacts/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.deleteContact(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/contacts/:id/convert', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.convertToClient(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/contacts/:id/mark-lost', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.markAsLost(tenantId, req.params.id, req.body.reason);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Interactions (nested under contacts)
  app.get('/api/admin/crm/contacts/:id/interactions', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.getContactInteractions(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/contacts/:id/interactions', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.addInteraction(tenantId, req.params.id, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  // Quotes
  app.get('/api/admin/crm/quotes', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.getQuotes(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/crm/quotes/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.getQuoteById(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/quotes', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.createQuote(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  app.put('/api/admin/crm/quotes/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.updateQuote(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.delete('/api/admin/crm/quotes/:id', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.deleteQuote(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/quotes/:id/send', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.sendQuote(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/quotes/:id/accept', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.acceptQuote(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/quotes/:id/reject', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.rejectQuote(tenantId, req.params.id, req.body.reason);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/quotes/:id/convert-to-invoice', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.convertQuoteToInvoice(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Follow-ups
  app.get('/api/admin/crm/follow-ups', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.getFollowUps(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/follow-ups', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.createFollowUp(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  app.post('/api/admin/crm/follow-ups/:id/complete', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.completeFollowUp(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/crm/follow-ups/:id/cancel', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.cancelFollowUp(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Stats
  app.get('/api/admin/crm/stats/overview', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.getCRMStats(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/crm/stats/quotes', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.getQuoteStats(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/crm/stats/pipeline', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.getPipelineStats(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/crm/stats/funnel', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await crmSvc.getConversionFunnel(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ CRM registered at /api/admin/crm/*');

  // ==================== MODULE MARKETING ====================
  const mktSvc = await import("../backend/src/modules/marketing/marketingService.js");
  const requireMarketing = requireFeature('marketing_campaigns');

  // Campaigns
  app.get('/api/admin/marketing/campaigns', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getCampaigns(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/marketing/campaigns/:id', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getCampaignById(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/marketing/campaigns', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.createCampaign(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  app.put('/api/admin/marketing/campaigns/:id', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.updateCampaign(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.delete('/api/admin/marketing/campaigns/:id', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.deleteCampaign(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/marketing/campaigns/:id/schedule', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.scheduleCampaign(tenantId, req.params.id, req.body.scheduled_at);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/marketing/campaigns/:id/send', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.sendCampaign(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/marketing/campaigns/:id/pause', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.pauseCampaign(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/marketing/campaigns/:id/stats', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getCampaignStats(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Segments
  app.get('/api/admin/marketing/segments', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getSegments(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/marketing/segments', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.createSegment(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  app.put('/api/admin/marketing/segments/:id', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.updateSegment(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.delete('/api/admin/marketing/segments/:id', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.deleteSegment(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/marketing/segments/:id/refresh', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.refreshSegmentCount(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Promo Codes (admin)
  app.get('/api/admin/marketing/promo-codes', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getPromoCodes(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/marketing/promo-codes', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.createPromoCode(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  app.put('/api/admin/marketing/promo-codes/:id', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.updatePromoCode(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.delete('/api/admin/marketing/promo-codes/:id', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.deletePromoCode(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/marketing/promo-codes/:id/stats', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getPromoCodeStats(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Promo Codes (public)
  app.post('/api/marketing/promo-codes/validate', async (req: any, res) => {
    const tenantId = req.body.tenant_id || 'default';
    const result = await mktSvc.validatePromoCode(tenantId, req.body.code, parseFloat(req.body.order_amount) || 0);
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/marketing/promo-codes/apply', async (req: any, res) => {
    const tenantId = req.body.tenant_id || 'default';
    const result = await mktSvc.applyPromoCode(tenantId, req.body.code, {
      orderAmount: parseFloat(req.body.order_amount) || 0,
      customerEmail: req.body.customer_email,
      customerName: req.body.customer_name
    });
    res.status(result.success ? 200 : 400).json(result);
  });

  // Referrals (admin)
  app.get('/api/admin/marketing/referrals', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getReferrals(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/marketing/referrals', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.createReferral(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  app.post('/api/admin/marketing/referrals/:id/complete', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.completeReferral(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.post('/api/admin/marketing/referrals/:id/reward', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.rewardReferral(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/marketing/referrals/stats', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getReferralStats(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Public referral
  app.post('/api/marketing/referrals', async (req: any, res) => {
    const tenantId = req.body.tenant_id || 'default';
    const result = await mktSvc.createReferral(tenantId, req.body);
    res.status(result.success ? 201 : 500).json(result);
  });

  // Stats globales
  app.get('/api/admin/marketing/stats/overview', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getMarketingOverview(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/marketing/stats/campaigns', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getCampaignPerformance(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });

  app.get('/api/admin/marketing/stats/promos', authenticateAdmin, requireMarketing, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await mktSvc.getPromoPerformance(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Marketing registered at /api/admin/marketing/*');

  // ==================== MODULE SEO ====================
  const seoSvc = await import("../backend/src/modules/seo/seoService.js");
  const requireSeo = requireFeature('seo');

  // Audits
  app.get('/api/admin/seo/audits', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.getAudits(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.get('/api/admin/seo/audits/:id', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.getAuditById(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });
  app.post('/api/admin/seo/audits', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.createAudit(tenantId, req.body.url);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.post('/api/admin/seo/audits/:id/run', authenticateAdmin, requireSeo, async (req: any, res) => {
    const result = await seoSvc.runAudit(req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.delete('/api/admin/seo/audits/:id', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.deleteAudit(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });

  // Keywords
  app.get('/api/admin/seo/keywords', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.getKeywords(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/seo/keywords', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.addKeyword(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.put('/api/admin/seo/keywords/:id', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.updateKeyword(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.delete('/api/admin/seo/keywords/:id', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.deleteKeyword(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });
  app.post('/api/admin/seo/keywords/:id/check', authenticateAdmin, requireSeo, async (req: any, res) => {
    const result = await seoSvc.checkKeywordPosition(req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.get('/api/admin/seo/keywords/:id/history', authenticateAdmin, requireSeo, async (req: any, res) => {
    const days = parseInt(req.query.days as string) || 30;
    const result = await seoSvc.getKeywordHistory(req.params.id, days);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Competitors
  app.get('/api/admin/seo/competitors', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.getCompetitors(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/seo/competitors', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.addCompetitor(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.delete('/api/admin/seo/competitors/:id', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.deleteCompetitor(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });
  app.get('/api/admin/seo/competitors/:id/compare', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.compareWithCompetitor(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Recommendations
  app.get('/api/admin/seo/recommendations', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const auditId = req.query.audit_id || null;
    const result = await seoSvc.getRecommendations(tenantId, auditId);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/seo/recommendations/generate-meta', authenticateAdmin, requireSeo, async (req: any, res) => {
    const result = await seoSvc.generateMetaDescription(req.body.content);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/seo/recommendations/generate-title', authenticateAdmin, requireSeo, async (req: any, res) => {
    const result = await seoSvc.generateTitle(req.body.content, req.body.keyword);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/seo/recommendations/generate-alts', authenticateAdmin, requireSeo, async (req: any, res) => {
    const result = await seoSvc.generateAltTexts(req.body.images);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/seo/recommendations/:id/apply', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.applyRecommendation(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Tools
  app.get('/api/admin/seo/tools/sitemap', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.generateSitemap(tenantId, req.query.base_url as string);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.get('/api/admin/seo/tools/schema', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.generateSchemaOrg(tenantId, req.query.type as string);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.get('/api/admin/seo/tools/robots', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.generateRobotsTxt(tenantId);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Stats
  app.get('/api/admin/seo/stats/overview', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.getSEOOverview(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.get('/api/admin/seo/stats/trends', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const days = parseInt(req.query.days as string) || 30;
    const result = await seoSvc.getKeywordsTrends(tenantId, days);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.get('/api/admin/seo/stats/competitor-gap', authenticateAdmin, requireSeo, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await seoSvc.getCompetitorGap(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ SEO registered at /api/admin/seo/*');

  // ==================== MODULE RH ====================
  const hrSvc = await import("../backend/src/modules/hr/hrService.js");
  const requireHr = requireFeature('rh_employees');

  // Employés
  app.get('/api/admin/hr/employees', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getEmployees(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.get('/api/admin/hr/employees/:id', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getEmployeeById(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });
  app.post('/api/admin/hr/employees', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.createEmployee(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.put('/api/admin/hr/employees/:id', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.updateEmployee(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.delete('/api/admin/hr/employees/:id', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.deleteEmployee(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });
  app.post('/api/admin/hr/employees/:id/terminate', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.terminateEmployee(tenantId, req.params.id, req.body.reason);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Documents
  app.get('/api/admin/hr/employees/:id/documents', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getEmployeeDocuments(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/hr/employees/:id/documents', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.uploadDocument(tenantId, req.params.id, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.delete('/api/admin/hr/documents/:id', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.deleteDocument(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });

  // Planning / Shifts
  app.get('/api/admin/hr/shifts', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getShifts(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/hr/shifts', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.createShift(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.put('/api/admin/hr/shifts/:id', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.updateShift(tenantId, req.params.id, req.body);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.delete('/api/admin/hr/shifts/:id', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.deleteShift(tenantId, req.params.id);
    res.status(result.success ? 200 : 404).json(result);
  });
  app.get('/api/admin/hr/schedule/weekly', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getWeeklySchedule(tenantId, req.query.start_date as string);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Pointages
  app.post('/api/admin/hr/timeclock/clock-in', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.clockIn(tenantId, req.body.employee_id);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.post('/api/admin/hr/timeclock/:id/clock-out', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.clockOut(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/hr/timeclock/:id/break-start', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.startBreak(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/hr/timeclock/:id/break-end', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.endBreak(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.get('/api/admin/hr/timeclock', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getTimeclockRecords(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/hr/timeclock/:id/approve', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.approveTimeclock(tenantId, req.params.id, req.body.approver_id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Congés
  app.get('/api/admin/hr/leaves', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getLeaves(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/hr/leaves', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.requestLeave(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.post('/api/admin/hr/leaves/:id/approve', authenticateAdmin, requireHr, async (req: any, res) => {
    const result = await hrSvc.approveLeave(req.admin?.tenant_id || 'default', req.params.id, req.body.reviewer_id);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/hr/leaves/:id/reject', authenticateAdmin, requireHr, async (req: any, res) => {
    const result = await hrSvc.rejectLeave(req.admin?.tenant_id || 'default', req.params.id, req.body.reviewer_id, req.body.notes);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/hr/leaves/:id/cancel', authenticateAdmin, requireHr, async (req: any, res) => {
    const result = await hrSvc.cancelLeave(req.admin?.tenant_id || 'default', req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.get('/api/admin/hr/employees/:id/leave-balance', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const result = await hrSvc.getLeaveBalance(tenantId, req.params.id, year);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.put('/api/admin/hr/employees/:id/leave-balance', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.updateLeaveBalance(tenantId, req.params.id, req.body.year, req.body.type, req.body.days);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Paie
  app.get('/api/admin/hr/payslips', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getPayslips(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/hr/payslips/generate', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.generatePayslip(tenantId, req.body.employee_id, req.body.month, req.body.year);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.post('/api/admin/hr/payslips/:id/send', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.sendPayslip(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/hr/payslips/:id/mark-paid', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.markPayslipPaid(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Onboarding
  app.get('/api/admin/hr/employees/:id/onboarding', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getOnboardingTasks(tenantId, req.params.id);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/hr/employees/:id/onboarding', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const hasTask = req.body.task;
    const result = hasTask
      ? await hrSvc.createOnboardingTask(tenantId, req.params.id, req.body)
      : await hrSvc.initializeOnboarding(tenantId, req.params.id);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.post('/api/admin/hr/onboarding/:id/complete', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.completeOnboardingTask(tenantId, req.params.id, req.body.completer_id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Stats RH
  app.get('/api/admin/hr/stats/overview', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getHROverview(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.get('/api/admin/hr/stats/absenteeism', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await hrSvc.getAbsenteeismRate(tenantId, req.query.start_date as string, req.query.end_date as string);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.get('/api/admin/hr/stats/turnover', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const result = await hrSvc.getTurnoverRate(tenantId, year);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.get('/api/admin/hr/stats/payroll-summary', authenticateAdmin, requireHr, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const month = req.query.month ? parseInt(req.query.month as string) : undefined;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const result = await hrSvc.getPayrollSummary(tenantId, month, year);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ RH registered at /api/admin/hr/*');

  // ==================== MODULE SENTINEL INTELLIGENCE ====================
  const siSvc = await import("../backend/src/modules/sentinel-intelligence/sentinelIntelligenceService.js");

  // Auto-start intelligence analysis (capture metriques + anomalies toutes les 2h)
  try {
    siSvc.startAutoAnalysis(['default'], 2 * 60 * 60 * 1000);
    console.log('[ROUTES] ✅ Sentinel Intelligence auto-analysis started');
  } catch (e: any) {
    console.error('[ROUTES] ❌ Failed to start auto-analysis:', e.message);
  }

  // Métriques
  app.post('/api/admin/sentinel-intelligence/metrics/capture', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.captureMetrics(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.get('/api/admin/sentinel-intelligence/metrics', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.getMetrics(tenantId, req.query.start_date as string, req.query.end_date as string);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Dashboard
  app.get('/api/admin/sentinel-intelligence/dashboard', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.getDashboard(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.get('/api/admin/sentinel-intelligence/health-score', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.getHealthScore(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.get('/api/admin/sentinel-intelligence/trends/:metric', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const days = parseInt(req.query.days as string) || 30;
    const result = await siSvc.getKPITrends(tenantId, req.params.metric, days);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.get('/api/admin/sentinel-intelligence/comparison', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.getComparison(tenantId, req.query.period as string);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Alertes
  app.get('/api/admin/sentinel-intelligence/alerts', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.getAlerts(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/sentinel-intelligence/alerts', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.createAlert(tenantId, req.body);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.post('/api/admin/sentinel-intelligence/alerts/:id/dismiss', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.dismissAlert(tenantId, req.params.id, req.body.user_id);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/sentinel-intelligence/alerts/:id/resolve', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.resolveAlert(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/sentinel-intelligence/alerts/check', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.checkAlertConditions(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Prédictions
  app.get('/api/admin/sentinel-intelligence/predictions', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.getPredictions(tenantId, req.query.target_date as string);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/sentinel-intelligence/predictions/generate', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.generatePredictions(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.get('/api/admin/sentinel-intelligence/predictions/accuracy', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.getPredictionAccuracy(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  // Rapports
  app.get('/api/admin/sentinel-intelligence/reports', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.getReports(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/sentinel-intelligence/reports/generate', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.generateReport(tenantId, req.body.type || 'weekly', req.body.start_date, req.body.end_date);
    res.status(result.success ? 201 : 400).json(result);
  });
  app.post('/api/admin/sentinel-intelligence/reports/:id/send', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.sendReport(tenantId, req.params.id, req.body.email);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Anomalies
  app.get('/api/admin/sentinel-intelligence/anomalies', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.getAnomalies(tenantId, req.query);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/sentinel-intelligence/anomalies/detect', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.detectAnomalies(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.post('/api/admin/sentinel-intelligence/anomalies/:id/investigate', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.investigateAnomaly(tenantId, req.params.id, req.body.notes);
    res.status(result.success ? 200 : 400).json(result);
  });
  app.post('/api/admin/sentinel-intelligence/anomalies/:id/resolve', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.resolveAnomaly(tenantId, req.params.id);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Insights
  app.get('/api/admin/sentinel-intelligence/insights', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.generateInsights(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });
  app.get('/api/admin/sentinel-intelligence/recommendations', authenticateAdmin, async (req: any, res) => {
    const tenantId = req.admin?.tenant_id || 'default';
    const result = await siSvc.getActionableRecommendations(tenantId);
    res.status(result.success ? 200 : 500).json(result);
  });

  console.log('[ROUTES] ✅ Sentinel Intelligence registered at /api/admin/sentinel-intelligence/*');

  // ==================== ADMIN ORCHESTRATOR ====================
  app.get('/api/admin/orchestrator/status', authenticateAdmin, async (_req: any, res) => {
    try {
      const { orchestrator } = await import("../platform/core/orchestrator.js");
      if (!orchestrator.initialized) {
        return res.json({ status: 'not_initialized', tenants: 0 });
      }
      const metrics = orchestrator.getGlobalMetrics();
      res.json({ status: 'running', ...metrics });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/admin/orchestrator/tenant/:id', authenticateAdmin, async (req: any, res) => {
    try {
      const { orchestrator } = await import("../platform/core/orchestrator.js");
      const tenant = orchestrator.getTenant(parseInt(req.params.id));
      res.json({ success: true, tenant: { id: tenant.id, config: tenant.config, features: tenant.features, metrics: tenant.metrics } });
    } catch (e: any) {
      res.status(404).json({ success: false, error: e.message });
    }
  });

  console.log('[ROUTES] ✅ Orchestrator admin registered at /api/admin/orchestrator/*');

  // ==================== SENTINEL ADMIN ROUTES ====================
  app.get('/api/admin/sentinel/status', authenticateAdmin, async (_req: any, res) => {
    try {
      const { sentinel } = await import("../sentinel/core/sentinel.js");
      res.json({
        success: true,
        sentinel: {
          running: sentinel.running,
          health: sentinel.getHealth(),
          metrics: sentinel.getCurrentMetrics(),
        },
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/admin/sentinel/history', authenticateAdmin, async (req: any, res) => {
    try {
      const { sentinel } = await import("../sentinel/core/sentinel.js");
      const duration = parseInt(req.query.duration as string) || 3600000;
      res.json({ success: true, history: sentinel.getHistory(duration) });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/admin/sentinel/health', authenticateAdmin, async (_req: any, res) => {
    try {
      const { sentinel } = await import("../sentinel/core/sentinel.js");
      res.json({ success: true, ...sentinel.getHealth() });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  console.log('[ROUTES] ✅ Sentinel admin registered at /api/admin/sentinel/*');

  // ==================== DASHBOARD STATS ====================
  app.get('/api/admin/stats/dashboard', authenticateAdmin, async (req: any, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];

      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      const monthAgoStr = monthAgo.toISOString().split('T')[0];

      const [todayRes, weekRes, monthRes] = await Promise.all([
        supabase.from('reservations').select('id, prix_total, service_nom').eq('date', today),
        supabase.from('reservations').select('id, prix_total, service_nom').gte('date', weekAgoStr),
        supabase.from('reservations').select('id, prix_total, service_nom').gte('date', monthAgoStr),
      ]);

      const sum = (arr: any[]) => (arr || []).reduce((s: number, r: any) => s + (r.prix_total || 0), 0);

      const serviceCount: Record<string, number> = {};
      (monthRes.data || []).forEach((r: any) => {
        if (r.service_nom) serviceCount[r.service_nom] = (serviceCount[r.service_nom] || 0) + 1;
      });
      const topServices = Object.entries(serviceCount)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 5)
        .map(([service, count]) => ({ service, count }));

      res.json({
        success: true,
        stats: {
          today: { reservations: todayRes.data?.length || 0, revenus: sum(todayRes.data || []) },
          week: { reservations: weekRes.data?.length || 0, revenus: sum(weekRes.data || []) },
          month: { reservations: monthRes.data?.length || 0, revenus: sum(monthRes.data || []) },
          topServices,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log('[ROUTES] ✅ Dashboard stats registered at /api/admin/stats/dashboard');

  // ==================== ANALYTICS ====================

  // Helper: compute analytics data for a date range
  async function computeAnalytics(startStr: string, endStr: string) {
    const [apptRes, clientRes] = await Promise.all([
      supabase.from('reservations').select('id, date, heure, statut, prix_total, service_nom, duree_minutes, client_id').gte('date', startStr),
      supabase.from('clients').select('id, created_at'),
    ]);

    const appointments = apptRes.data || [];
    const clients = clientRes.data || [];
    const startDate = new Date(startStr);

    const confirmed = appointments.filter((a: any) => a.statut === 'confirme');
    const pending = appointments.filter((a: any) => a.statut === 'demande');
    const cancelled = appointments.filter((a: any) => a.statut === 'annule');
    const completed = appointments.filter((a: any) => a.statut === 'termine');
    const billable = [...confirmed, ...completed];
    const totalRevenue = billable.reduce((s: number, a: any) => s + (a.prix_total || 0), 0);

    // Revenue par jour
    const revenueByDay: Record<string, number> = {};
    const rdvByDay: Record<string, number> = {};
    billable.forEach((a: any) => {
      revenueByDay[a.date] = (revenueByDay[a.date] || 0) + (a.prix_total || 0);
      rdvByDay[a.date] = (rdvByDay[a.date] || 0) + 1;
    });
    const revenueTimeline = Object.entries(revenueByDay)
      .map(([date, revenue]) => ({ date, revenue, rdv: rdvByDay[date] || 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // RDV par service
    const serviceCount: Record<string, number> = {};
    const serviceRevenue: Record<string, number> = {};
    appointments.forEach((a: any) => {
      const svc = a.service_nom || 'Non spécifié';
      serviceCount[svc] = (serviceCount[svc] || 0) + 1;
      if (a.statut === 'confirme' || a.statut === 'termine') serviceRevenue[svc] = (serviceRevenue[svc] || 0) + (a.prix_total || 0);
    });
    const topServices = Object.entries(serviceCount)
      .map(([service, count]) => ({ service, count, revenue: serviceRevenue[service] || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Heures de pointe
    const hourCount: Record<string, number> = {};
    appointments.forEach((a: any) => {
      if (a.heure) {
        const h = a.heure.split(':')[0];
        hourCount[h + 'h'] = (hourCount[h + 'h'] || 0) + 1;
      }
    });
    const peakHours = Object.entries(hourCount)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // Nouveaux clients
    const newClients = clients.filter((c: any) => new Date(c.created_at) >= startDate).length;

    // Jours de la semaine
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const dayCount: Record<string, number> = {};
    appointments.forEach((a: any) => {
      const d = new Date(a.date);
      const day = dayNames[d.getDay()];
      dayCount[day] = (dayCount[day] || 0) + 1;
    });
    const rdvByDayOfWeek = dayNames.map(day => ({ day, count: dayCount[day] || 0 }));

    return {
      period: { start: startStr, end: endStr },
      summary: {
        total_appointments: appointments.length,
        confirmed: confirmed.length,
        pending: pending.length,
        cancelled: cancelled.length,
        completed: completed.length,
        total_revenue: totalRevenue,
        average_per_appointment: billable.length > 0 ? Math.round(totalRevenue / billable.length) : 0,
        new_clients: newClients,
        total_clients: clients.length,
      },
      charts: {
        revenue_timeline: revenueTimeline,
        appointments_by_status: [
          { status: 'Confirmés', count: confirmed.length, color: '#10b981' },
          { status: 'Terminés', count: completed.length, color: '#3b82f6' },
          { status: 'En attente', count: pending.length, color: '#f59e0b' },
          { status: 'Annulés', count: cancelled.length, color: '#ef4444' },
        ],
        top_services: topServices,
        peak_hours: peakHours,
        rdv_by_day_of_week: rdvByDayOfWeek,
      },
    };
  }

  // Helper: parse period string to start date
  function periodToStartDate(period: string): Date {
    const d = new Date();
    switch (period) {
      case '7d': d.setDate(d.getDate() - 7); break;
      case '30d': d.setDate(d.getDate() - 30); break;
      case '90d': d.setDate(d.getDate() - 90); break;
      case '1y': d.setFullYear(d.getFullYear() - 1); break;
    }
    return d;
  }

  // Helper: generate insights
  function generateInsights(data: any, comparison: any) {
    const insights: Array<{ type: string; icon: string; title: string; message: string }> = [];

    // Meilleur jour
    const bestDay = data.charts.rdv_by_day_of_week.reduce((max: any, d: any) => d.count > max.count ? d : max, { day: '', count: 0 });
    if (bestDay.count > 0) {
      insights.push({ type: 'info', icon: '📅', title: 'Jour le plus chargé', message: `${bestDay.day} avec ${bestDay.count} RDV` });
    }

    // Service star
    if (data.charts.top_services.length > 0 && data.summary.total_appointments > 0) {
      const top = data.charts.top_services[0];
      const pct = Math.round((top.count / data.summary.total_appointments) * 100);
      insights.push({ type: 'success', icon: '⭐', title: 'Service star', message: `${top.service} représente ${pct}% des RDV` });
    }

    // Taux annulation
    if (data.summary.total_appointments > 0) {
      const cancelRate = Math.round((data.summary.cancelled / data.summary.total_appointments) * 100);
      if (cancelRate > 15) {
        insights.push({ type: 'warning', icon: '⚠️', title: "Taux d'annulation élevé", message: `${cancelRate}% d'annulations. Pensez aux rappels automatiques.` });
      } else if (cancelRate <= 5) {
        insights.push({ type: 'success', icon: '✅', title: 'Excellent taux de confirmation', message: `Seulement ${cancelRate}% d'annulations` });
      }
    }

    // Heure de pointe
    if (data.charts.peak_hours.length > 0) {
      const peakHour = data.charts.peak_hours.reduce((max: any, h: any) => h.count > max.count ? h : max, { hour: '', count: 0 });
      insights.push({ type: 'info', icon: '⏰', title: 'Heure de pointe', message: `${peakHour.hour} est le créneau le plus demandé (${peakHour.count} RDV)` });
    }

    // Croissance CA
    if (comparison && comparison.changes.revenue.value !== 0) {
      const growth = comparison.changes.revenue.value;
      if (growth > 20) {
        insights.push({ type: 'success', icon: '🚀', title: 'Excellente croissance !', message: `+${growth}% de CA vs période précédente` });
      } else if (growth < -10) {
        insights.push({ type: 'warning', icon: '📉', title: "Baisse d'activité", message: `${growth}% de CA vs période précédente` });
      } else if (growth > 0) {
        insights.push({ type: 'success', icon: '📈', title: 'CA en hausse', message: `+${growth}% vs période précédente` });
      }
    }

    // CA moyen par RDV
    if (data.summary.average_per_appointment > 0) {
      const avg = Math.round(data.summary.average_per_appointment / 100);
      insights.push({ type: 'info', icon: '💰', title: 'Panier moyen', message: `${avg}€ par rendez-vous en moyenne` });
    }

    return insights;
  }

  // === BRANDING TENANT ===
  app.get('/api/admin/branding', authenticateAdmin, async (req: any, res) => {
    try {
      const tenantId = identifyTenant(req) || 'fatshairafro';
      const tc = getTenantConfig(tenantId);
      const branding = tc.branding || {};
      res.json({
        success: true,
        branding: {
          businessName: tc.name || 'NEXUS',
          assistantName: tc.assistantName || 'Halimah',
          logoUrl: branding.logoUrl || '/logo/logo-icon.svg',
          faviconUrl: branding.faviconUrl || '/favicon-32x32.png',
          primaryColor: branding.primaryColor || '#f59e0b',
          accentColor: branding.accentColor || '#ea580c',
        },
      });
    } catch (error) {
      console.error('Branding error:', error);
      res.status(500).json({ success: false, error: 'Erreur branding' });
    }
  });

  app.get('/api/admin/analytics', authenticateAdmin, async (req: any, res) => {
    try {
      const period = (req.query.period as string) || '30d';
      const startDate = periodToStartDate(period);
      const endDate = new Date();
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const data = await computeAnalytics(startStr, endStr);

      // Comparaison période précédente
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const prevEnd = new Date(startDate);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - daysDiff);

      const prevStartStr = prevStart.toISOString().split('T')[0];
      const prevEndStr = prevEnd.toISOString().split('T')[0];

      // Query période précédente (simple - juste les réservations)
      const { data: prevAppts } = await supabase
        .from('reservations')
        .select('id, statut, prix_total')
        .gte('date', prevStartStr)
        .lte('date', prevEndStr);

      const prevAppointments = prevAppts || [];
      const prevBillable = prevAppointments.filter((a: any) => a.statut === 'confirme' || a.statut === 'termine');
      const prevRevenue = prevBillable.reduce((s: number, a: any) => s + (a.prix_total || 0), 0);
      const prevConfirmed = prevBillable.length;

      const revenueChange = prevRevenue > 0
        ? parseFloat(((data.summary.total_revenue - prevRevenue) / prevRevenue * 100).toFixed(1))
        : (data.summary.total_revenue > 0 ? 100 : 0);
      const appointmentsChange = prevConfirmed > 0
        ? parseFloat(((data.summary.confirmed + data.summary.completed - prevConfirmed) / prevConfirmed * 100).toFixed(1))
        : (data.summary.confirmed > 0 ? 100 : 0);

      const comparison = {
        previous_period: { start: prevStartStr, end: prevEndStr, appointments: prevAppointments.length, revenue: prevRevenue },
        changes: {
          revenue: { value: revenueChange, direction: revenueChange > 0 ? 'up' : revenueChange < 0 ? 'down' : 'stable' },
          appointments: { value: appointmentsChange, direction: appointmentsChange > 0 ? 'up' : appointmentsChange < 0 ? 'down' : 'stable' },
        },
      };

      const insights = generateInsights(data, comparison);

      res.json({ success: true, ...data, comparison, insights });
    } catch (error: any) {
      console.error('Analytics error:', error);
      res.status(500).json({ error: 'Erreur analytics' });
    }
  });

  // ==================== EXPORT EXCEL ====================
  app.get('/api/admin/analytics/export/excel', authenticateAdmin, async (req: any, res) => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const period = (req.query.period as string) || '30d';
      const startDate = periodToStartDate(period);
      const endDate = new Date();
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const data = await computeAnalytics(startStr, endStr);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'NEXUS - Fat\'s Hair-Afro';
      workbook.created = new Date();

      // Sheet 1 - Résumé
      const summarySheet = workbook.addWorksheet('Résumé');
      summarySheet.columns = [
        { header: 'Métrique', key: 'metric', width: 30 },
        { header: 'Valeur', key: 'value', width: 25 },
      ];
      summarySheet.addRows([
        { metric: 'Période', value: `${startStr} → ${endStr}` },
        { metric: 'Total Rendez-vous', value: data.summary.total_appointments },
        { metric: 'RDV Confirmés', value: data.summary.confirmed },
        { metric: 'RDV Terminés', value: data.summary.completed },
        { metric: 'RDV En attente', value: data.summary.pending },
        { metric: 'RDV Annulés', value: data.summary.cancelled },
        { metric: "Chiffre d'affaires", value: `${Math.round(data.summary.total_revenue / 100)}€` },
        { metric: 'Moyenne par RDV', value: `${Math.round(data.summary.average_per_appointment / 100)}€` },
        { metric: 'Nouveaux clients', value: data.summary.new_clients },
        { metric: 'Total clients', value: data.summary.total_clients },
      ]);
      summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };

      // Sheet 2 - CA par jour
      const revenueSheet = workbook.addWorksheet('CA par jour');
      revenueSheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'CA (€)', key: 'revenue', width: 15 },
        { header: 'Nb RDV', key: 'rdv', width: 10 },
      ];
      data.charts.revenue_timeline.forEach((item: any) => {
        revenueSheet.addRow({ date: item.date, revenue: Math.round(item.revenue / 100), rdv: item.rdv });
      });
      revenueSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      revenueSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };

      // Sheet 3 - Services
      const servicesSheet = workbook.addWorksheet('Top Services');
      servicesSheet.columns = [
        { header: 'Service', key: 'service', width: 35 },
        { header: 'Nb RDV', key: 'count', width: 12 },
        { header: 'CA (€)', key: 'revenue', width: 15 },
      ];
      data.charts.top_services.forEach((item: any) => {
        servicesSheet.addRow({ service: item.service, count: item.count, revenue: Math.round(item.revenue / 100) });
      });
      servicesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      servicesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } };

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${period}-${Date.now()}.xlsx`);
      res.send(buffer);
    } catch (error: any) {
      console.error('Export Excel error:', error);
      res.status(500).json({ error: "Erreur export Excel" });
    }
  });

  // ==================== EXPORT PDF ====================
  app.get('/api/admin/analytics/export/pdf', authenticateAdmin, async (req: any, res) => {
    try {
      const PDFDocument = (await import('pdfkit')).default;
      const period = (req.query.period as string) || '30d';
      const startDate = periodToStartDate(period);
      const endDate = new Date();
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const data = await computeAnalytics(startStr, endStr);
      const s = data.summary;

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${period}-${Date.now()}.pdf`);
      doc.pipe(res);

      // Header
      doc.fontSize(22).fillColor('#F59E0B').text("Fat's Hair-Afro", { align: 'center' });
      doc.fontSize(14).fillColor('#78716C').text('Rapport Analytics', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#A8A29E').text(`Période : ${startStr} → ${endStr}`, { align: 'center' });
      doc.moveDown(1.5);

      // Ligne séparatrice
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#E7E5E4').stroke();
      doc.moveDown(1);

      // Résumé
      doc.fontSize(16).fillColor('#1C1917').text('Résumé');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#44403C');
      doc.text(`Chiffre d'affaires : ${Math.round(s.total_revenue / 100)}€`);
      doc.text(`Moyenne par RDV : ${Math.round(s.average_per_appointment / 100)}€`);
      doc.moveDown(0.5);
      doc.text(`Total RDV : ${s.total_appointments}`);
      doc.text(`   • Confirmés : ${s.confirmed}`);
      doc.text(`   • Terminés : ${s.completed}`);
      doc.text(`   • En attente : ${s.pending}`);
      doc.text(`   • Annulés : ${s.cancelled}`);
      doc.moveDown(0.5);
      doc.text(`Nouveaux clients : ${s.new_clients}`);
      doc.text(`Total clients : ${s.total_clients}`);
      doc.moveDown(1.5);

      // Top Services
      doc.fontSize(16).fillColor('#1C1917').text('Top Services');
      doc.moveDown(0.5);
      data.charts.top_services.forEach((svc: any, i: number) => {
        doc.fontSize(11).fillColor('#44403C')
          .text(`${i + 1}. ${svc.service} — ${svc.count} RDV — ${Math.round(svc.revenue / 100)}€`);
      });
      doc.moveDown(1.5);

      // CA par jour (tableau)
      if (data.charts.revenue_timeline.length > 0) {
        doc.fontSize(16).fillColor('#1C1917').text('CA par jour');
        doc.moveDown(0.5);
        data.charts.revenue_timeline.forEach((item: any) => {
          doc.fontSize(10).fillColor('#44403C')
            .text(`${item.date}   ${Math.round(item.revenue / 100)}€   (${item.rdv} RDV)`);
        });
        doc.moveDown(1.5);
      }

      // Heures de pointe
      doc.fontSize(16).fillColor('#1C1917').text('Heures de pointe');
      doc.moveDown(0.5);
      data.charts.peak_hours.forEach((h: any) => {
        const bar = '█'.repeat(Math.min(h.count, 20));
        doc.fontSize(10).fillColor('#44403C').text(`${h.hour}  ${bar}  ${h.count} RDV`);
      });

      // Footer
      doc.fontSize(9).fillColor('#A8A29E')
        .text(`Généré le ${new Date().toLocaleDateString('fr-FR')} par NEXUS — Fat's Hair-Afro`, 50, doc.page.height - 50, { align: 'center' });

      doc.end();
    } catch (error: any) {
      console.error('Export PDF error:', error);
      res.status(500).json({ error: "Erreur export PDF" });
    }
  });

  // ==================== LOGS HALIMAH ====================
  app.get('/api/admin/halimah/logs', authenticateAdmin, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // Get conversation-type memories (logs of interactions)
      const { data: memories, error } = await supabase
        .from('halimah_memory')
        .select('*')
        .eq('category', 'conversation')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        // Table might not exist or no conversation logs
        return res.json({ success: true, logs: [], total: 0, message: 'Aucun log disponible' });
      }

      // Also get recent client interactions from reservations
      const { data: recentRdv } = await supabase
        .from('reservations')
        .select('id, date, heure, service_nom, statut, created_at, notes, telephone, client_id, clients(nom, prenom, telephone)')
        .order('created_at', { ascending: false })
        .limit(limit);

      res.json({
        success: true,
        memories: memories || [],
        recent_bookings: (recentRdv || []).map((r: any) => ({
          id: r.id,
          date: r.date,
          heure: r.heure,
          service: r.service_nom,
          client: r.clients ? `${r.clients.prenom || ''} ${r.clients.nom || ''}`.trim() : 'Inconnu',
          telephone: r.clients?.telephone || r.telephone || '',
          statut: r.statut,
          created_at: r.created_at,
          notes: r.notes,
        })),
        total: (memories || []).length,
      });
    } catch (error: any) {
      console.error('Logs error:', error);
      res.status(500).json({ error: 'Erreur logs' });
    }
  });

  console.log('[ROUTES] ✅ Analytics & Logs registered');

  // ==================== ICAL EXPORT ====================
  app.get('/api/admin/reservations/export/ical', authenticateAdmin, async (req: any, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: reservations } = await supabase
        .from('reservations')
        .select('id, date, heure, service_nom, duree_minutes, telephone')
        .eq('statut', 'confirme')
        .gte('date', today)
        .order('date', { ascending: true });

      let ical = 'BEGIN:VCALENDAR\r\n';
      ical += 'VERSION:2.0\r\n';
      ical += "PRODID:-//NEXUS//Fat's Hair//FR\r\n";
      ical += 'CALSCALE:GREGORIAN\r\n';

      (reservations || []).forEach((rdv: any) => {
        const dateClean = (rdv.date || '').replace(/-/g, '');
        const heureClean = (rdv.heure || '10:00').replace(':', '');
        const dtStart = `${dateClean}T${heureClean}00`;

        const endDate = new Date(`${rdv.date}T${rdv.heure || '10:00'}`);
        endDate.setMinutes(endDate.getMinutes() + (rdv.duree_minutes || 60));
        const dtEnd = endDate.toISOString().replace(/[-:]/g, '').split('.')[0];

        const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        ical += 'BEGIN:VEVENT\r\n';
        ical += `UID:${rdv.id}@nexus.app\r\n`;
        ical += `DTSTAMP:${now}\r\n`;
        ical += `DTSTART:${dtStart}\r\n`;
        ical += `DTEND:${dtEnd}\r\n`;
        ical += `SUMMARY:${rdv.service_nom || 'RDV'}\r\n`;
        ical += `DESCRIPTION:Client: ${rdv.telephone || 'N/A'}\r\n`;
        ical += 'END:VEVENT\r\n';
      });

      ical += 'END:VCALENDAR\r\n';

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="reservations.ics"');
      res.send(ical);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log('[ROUTES] ✅ iCal export registered at /api/admin/reservations/export/ical');

  // ==================== MEDIA GENERATION ====================

  app.post('/api/admin/media/generate/image',
    authenticateAdmin,
    requireFeature('marketing_social'),
    async (req: any, res) => {
      const { prompt, quality = 'standard' } = req.body;
      const tenantId = req.tenantId || 1;

      try {
        const { generateImage, generateImageHD } = await import('../backend/src/services/replicateService.js');

        const result = quality === 'hd'
          ? await generateImageHD(prompt)
          : await generateImage(prompt);

        await supabase.from('media_generations').insert({
          tenant_id: tenantId,
          type: 'image',
          model: result.model,
          prompt,
          output_url: result.url,
          cost_credits: quality === 'hd' ? 0.15 : 0.05,
          created_at: new Date().toISOString()
        });

        await supabase.rpc('increment_media_usage', {
          p_tenant_id: tenantId,
          p_type: 'image',
          p_cost: quality === 'hd' ? 0.15 : 0.05
        });

        res.json({ success: true, ...result });

      } catch (error: any) {
        console.error('[MEDIA] Erreur génération:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post('/api/admin/media/generate/social-post',
    authenticateAdmin,
    requireFeature('marketing_social'),
    async (req: any, res) => {
      const { platform, theme, text, style } = req.body;
      const tenantId = req.tenantId || 1;

      try {
        const { generateSocialPost } = await import('../backend/src/services/replicateService.js');

        const result = await generateSocialPost({
          platform,
          theme,
          text,
          style,
          businessType: 'salon_coiffure'
        });

        await supabase.from('media_generations').insert({
          tenant_id: tenantId,
          type: 'image',
          model: 'flux-schnell',
          prompt: `Social post ${platform} ${theme}`,
          output_url: result.image,
          platform,
          theme,
          cost_credits: 0.10,
          metadata: { caption: result.caption },
          created_at: new Date().toISOString()
        });

        await supabase.rpc('increment_media_usage', {
          p_tenant_id: tenantId,
          p_type: 'image',
          p_cost: 0.10
        });

        res.json({ success: true, ...result });

      } catch (error: any) {
        console.error('[MEDIA] Erreur génération post:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post('/api/admin/media/remove-background',
    authenticateAdmin,
    requireFeature('marketing_social'),
    async (req: any, res) => {
      const { imageUrl } = req.body;
      const tenantId = req.tenantId || 1;

      try {
        const { removeBackground } = await import('../backend/src/services/replicateService.js');
        const result = await removeBackground(imageUrl);

        await supabase.from('media_generations').insert({
          tenant_id: tenantId,
          type: 'background_removal',
          model: 'rembg',
          input_url: imageUrl,
          output_url: result.url,
          cost_credits: 0.05,
          created_at: new Date().toISOString()
        });

        await supabase.rpc('increment_media_usage', {
          p_tenant_id: tenantId,
          p_type: 'image',
          p_cost: 0.05
        });

        res.json({ success: true, ...result });

      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post('/api/admin/media/upscale',
    authenticateAdmin,
    requireFeature('marketing_social'),
    async (req: any, res) => {
      const { imageUrl, scale = 2 } = req.body;
      const tenantId = req.tenantId || 1;

      try {
        const { upscaleImage } = await import('../backend/src/services/replicateService.js');
        const result = await upscaleImage(imageUrl, scale);

        await supabase.from('media_generations').insert({
          tenant_id: tenantId,
          type: 'upscale',
          model: 'real-esrgan',
          input_url: imageUrl,
          output_url: result.url,
          cost_credits: 0.08,
          metadata: { scale },
          created_at: new Date().toISOString()
        });

        await supabase.rpc('increment_media_usage', {
          p_tenant_id: tenantId,
          p_type: 'image',
          p_cost: 0.08
        });

        res.json({ success: true, ...result });

      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.post('/api/admin/media/generate/video',
    authenticateAdmin,
    requireFeature('marketing_social'),
    async (req: any, res) => {
      const { imageUrl, motion = 'medium' } = req.body;
      const tenantId = req.tenantId || 1;

      try {
        const { generateVideo } = await import('../backend/src/services/replicateService.js');
        const result = await generateVideo(imageUrl, motion);

        await supabase.from('media_generations').insert({
          tenant_id: tenantId,
          type: 'video',
          model: 'stable-video-diffusion',
          input_url: imageUrl,
          output_url: result.url,
          cost_credits: 0.50,
          metadata: { motion, fps: 6 },
          created_at: new Date().toISOString()
        });

        await supabase.rpc('increment_media_usage', {
          p_tenant_id: tenantId,
          p_type: 'video',
          p_cost: 0.50
        });

        res.json({ success: true, ...result });

      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get('/api/admin/media/usage',
    authenticateAdmin,
    requireFeature('marketing_social'),
    async (req: any, res) => {
      const tenantId = req.tenantId || 1;
      const { month } = req.query;

      try {
        const targetMonth = (month as string) || new Date().toISOString().slice(0, 7);

        const { data } = await supabase
          .from('media_usage')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('month', targetMonth)
          .single();

        res.json({
          success: true,
          usage: data || { images_generated: 0, videos_generated: 0, total_cost_credits: 0 }
        });

      } catch (_error: any) {
        res.json({
          success: true,
          usage: { images_generated: 0, videos_generated: 0, total_cost_credits: 0 }
        });
      }
    }
  );

  app.get('/api/admin/media/history',
    authenticateAdmin,
    requireFeature('marketing_social'),
    async (req: any, res) => {
      const tenantId = req.tenantId || 1;
      const { limit = '50' } = req.query;

      try {
        const { data } = await supabase
          .from('media_generations')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(parseInt(limit as string));

        res.json({ success: true, history: data || [] });

      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  console.log('[ROUTES] ✅ Media generation routes registered (8 routes)');

  // ==================== SOCIAL MEDIA OAUTH ====================

  app.get('/auth/facebook',
    requireFeature('marketing_social'),
    async (_req, res) => {
      try {
        const { getAuthUrl } = await import('../backend/src/services/facebookService.js');
        res.redirect(getAuthUrl());
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get('/auth/facebook/callback',
    async (req: any, res) => {
      const { code } = req.query;
      const tenantId = req.tenantId || 1;

      try {
        const { exchangeCodeForToken, getLongLivedToken } = await import('../backend/src/services/facebookService.js');

        const shortToken = await exchangeCodeForToken(code as string);
        const longToken = await getLongLivedToken(shortToken);

        await supabase.from('social_accounts').insert({
          tenant_id: tenantId,
          platform: 'facebook',
          access_token: longToken,
          token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          created_at: new Date().toISOString()
        });

        res.redirect('/admin/social?connected=facebook');

      } catch (error: any) {
        console.error('[OAUTH] Erreur Facebook:', error);
        res.redirect('/admin/social?error=facebook');
      }
    }
  );

  app.post('/api/admin/social/publish',
    authenticateAdmin,
    requireFeature('marketing_social'),
    async (req: any, res) => {
      const { platform, message, imageUrl, caption } = req.body;
      const tenantId = req.tenantId || 1;

      try {
        const { data: account } = await supabase
          .from('social_accounts')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('platform', platform)
          .eq('status', 'active')
          .single();

        if (!account) {
          return res.status(400).json({ success: false, error: `${platform} non connecté` });
        }

        let result;

        if (platform === 'facebook') {
          const { publishToFacebook } = await import('../backend/src/services/facebookService.js');
          result = await publishToFacebook(account.page_id, account.access_token, { message, imageUrl });
        } else if (platform === 'instagram') {
          const { publishToInstagram } = await import('../backend/src/services/facebookService.js');
          result = await publishToInstagram(account.ig_account_id, account.access_token, { caption, imageUrl });
        } else {
          return res.status(400).json({ success: false, error: `Plateforme ${platform} non supportée` });
        }

        await supabase.from('social_posts').insert({
          tenant_id: tenantId,
          platform,
          content: message || caption,
          image_url: imageUrl,
          post_id: result.postId,
          status: 'published',
          published_at: new Date().toISOString()
        });

        res.json({ success: true, ...result });

      } catch (error: any) {
        console.error('[SOCIAL] Erreur publication:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get('/api/admin/social/accounts',
    authenticateAdmin,
    requireFeature('marketing_social'),
    async (req: any, res) => {
      const tenantId = req.tenantId || 1;

      try {
        const { data } = await supabase
          .from('social_accounts')
          .select('id, tenant_id, platform, page_id, ig_account_id, status, token_expires_at, created_at')
          .eq('tenant_id', tenantId);

        res.json({ success: true, accounts: data || [] });

      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  );

  console.log('[ROUTES] ✅ Social media OAuth routes registered');

  console.log('[ROUTES] === All routes registered successfully ===');

  // Initialiser SENTINEL persistence (async, non-bloquant)
  import("../backend/src/sentinel/monitors/tenantCostTracker.js")
    .then(({ initTenantUsageFromDB }) => initTenantUsageFromDB())
    .catch(err => console.error('[SENTINEL] Init persistence failed:', err.message));

  return httpServer;
}
