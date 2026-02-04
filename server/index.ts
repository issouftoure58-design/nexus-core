import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { createServer } from "http";

// ============= DÉMARRAGE ULTRA-RAPIDE =============
// Ces imports sont SYNCHRONES et n'ont pas de dépendances env
// Les imports avec dépendances (supabase, routes) sont DYNAMIQUES
console.log("[BOOT] Starting server (minimal imports)...");

const app = express();

// Configuration CORS — whitelist des origines autorisees
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5000")
  .split(",").map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === "development") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Tenant-ID"],
}));
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

// Route health check IMMÉDIATE (avant tout le reste)
app.get("/health", async (_req, res) => {
  try {
    const checks: Record<string, string> = {
      server: "ok",
    };

    // Orchestrator
    try {
      const { orchestrator } = await import("../platform/core/orchestrator.js");
      checks.orchestrator = orchestrator.initialized ? "ok" : "not_initialized";
    } catch { checks.orchestrator = "unavailable"; }

    // Sentinel
    try {
      const { sentinel } = await import("../sentinel/core/sentinel.js");
      checks.sentinel = sentinel.running ? "ok" : "stopped";
    } catch { checks.sentinel = "unavailable"; }

    const hasError = Object.values(checks).includes("error");

    res.status(hasError ? 503 : 200).json({
      status: hasError ? "unhealthy" : "healthy",
      checks,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(200).json({ status: "healthy", uptime: process.uptime() });
  }
});

// Health check API (pour Render et monitoring, enrichi par SENTINEL)
app.get("/api/health", async (_req, res) => {
  try {
    const { getSimpleHealth } = await import("../backend/src/sentinel/monitoring/uptimeMonitor.js");
    const health = getSimpleHealth();
    res.json({
      ...health,
      environment: process.env.NODE_ENV || "development",
      version: "1.0.0",
    });
  } catch (_) {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      version: "1.0.0",
      uptime: process.uptime(),
    });
  }
});

// Route de status pour debug
const BUILD_TIME = new Date().toISOString();
app.get("/api/status", (_req, res) => {
  res.json({
    status: "running",
    timestamp: new Date().toISOString(),
    buildTime: BUILD_TIME,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      RENDER: process.env.RENDER,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    },
  });
});

// Route de debug pour vérifier les chemins (temporaire)
app.get("/api/debug-paths", async (_req, res) => {
  const fs = await import("fs");
  const path = await import("path");

  const cwd = process.cwd();
  const distPath = path.join(cwd, "dist", "public");
  const distExists = fs.existsSync(distPath);
  const distServerPath = path.join(cwd, "dist", "server");
  const distServerExists = fs.existsSync(distServerPath);
  const distDir = path.join(cwd, "dist");
  const distDirExists = fs.existsSync(distDir);

  // Check additional locations
  const clientDistPublic = path.join(cwd, "client", "dist", "public");
  const clientDist = path.join(cwd, "client", "dist");
  const clientDistPublicExists = fs.existsSync(clientDistPublic);
  const clientDistExists = fs.existsSync(clientDist);

  let distPublicContents: string[] = [];
  if (distExists) {
    try {
      distPublicContents = fs.readdirSync(distPath);
    } catch (e: any) {
      distPublicContents = [`Error: ${e.message}`];
    }
  }

  let distContents: string[] = [];
  if (distDirExists) {
    try {
      distContents = fs.readdirSync(distDir);
    } catch (e: any) {
      distContents = [`Error: ${e.message}`];
    }
  }

  let clientDistContents: string[] = [];
  if (clientDistExists) {
    try {
      clientDistContents = fs.readdirSync(clientDist);
    } catch (e: any) {
      clientDistContents = [`Error: ${e.message}`];
    }
  }

  let clientDistPublicContents: string[] = [];
  if (clientDistPublicExists) {
    try {
      clientDistPublicContents = fs.readdirSync(clientDistPublic);
    } catch (e: any) {
      clientDistPublicContents = [`Error: ${e.message}`];
    }
  }

  let rootContents: string[] = [];
  try {
    rootContents = fs.readdirSync(cwd);
  } catch (e: any) {
    rootContents = [`Error: ${e.message}`];
  }

  // Check client folder contents
  let clientContents: string[] = [];
  try {
    clientContents = fs.readdirSync(path.join(cwd, "client"));
  } catch (e: any) {
    clientContents = [`Error: ${e.message}`];
  }

  res.json({
    cwd,
    distPath,
    distExists,
    distServerPath,
    distServerExists,
    distContents,
    distPublicContents,
    clientDistPublic,
    clientDistPublicExists,
    clientDistPublicContents,
    clientDist,
    clientDistExists,
    clientDistContents,
    clientContents,
    rootContents,
    __dirname: typeof __dirname !== "undefined" ? __dirname : "not available",
  });
});

// Health check complet pour monitoring détaillé
app.get("/api/health/detailed", async (_req, res) => {
  const startTime = Date.now();
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

  // 1. Vérifier Supabase
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    );
    const dbStart = Date.now();
    const { error } = await supabase.from("services").select("id").limit(1);
    checks.database = {
      status: error ? "error" : "ok",
      latency: Date.now() - dbStart,
      ...(error && { error: error.message }),
    };
  } catch (e: any) {
    checks.database = { status: "error", error: e.message };
  }

  // 2. Vérifier Redis (si configuré)
  if (process.env.REDIS_URL) {
    try {
      const Redis = (await import("ioredis")).default;
      const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
      const redisStart = Date.now();
      await redis.ping();
      checks.redis = { status: "ok", latency: Date.now() - redisStart };
      await redis.quit();
    } catch (e: any) {
      checks.redis = { status: "error", error: e.message };
    }
  } else {
    checks.redis = { status: "not_configured" };
  }

  // 3. Vérifier les variables critiques
  const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
  checks.environment = {
    status: missingVars.length === 0 ? "ok" : "warning",
    ...(missingVars.length > 0 && { error: `Missing: ${missingVars.join(", ")}` }),
  };

  // 4. Déterminer le statut global
  const hasErrors = Object.values(checks).some((c) => c.status === "error");
  const overallStatus = hasErrors ? "unhealthy" : "healthy";

  res.status(hasErrors ? 503 : 200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    region: process.env.RENDER_REGION || "local",
    uptime: process.uptime(),
    responseTime: Date.now() - startTime,
    checks,
  });
});

// Error handler global avec SENTINEL
app.use(async (err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // Capturer avec SENTINEL Action (async, non-bloquant)
  try {
    const { sentinelAction } = await import("../sentinel/core/sentinelAction.js");
    sentinelAction.handleError(err, {
      tenantId: (req as any).tenantId || null,
      userId: (req as any).user?.id || null,
      route: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('user-agent')
    }).catch((e: any) => console.error('[SENTINEL] Error handler failed:', e.message));
  } catch (sentinelErr) {
    // Ignorer les erreurs SENTINEL pour ne pas bloquer la reponse
  }

  res.status(status).json({
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Port configuration
const port = parseInt(process.env.PORT || "5000", 10);

// ============= DÉMARRAGE IMMÉDIAT DU SERVEUR =============
// Bind le port IMMÉDIATEMENT pour éviter timeout Render
console.log(`[BOOT] Binding to port ${port}...`);
httpServer.listen(
  {
    port,
    host: "0.0.0.0",
    reusePort: true,
  },
  () => {
    console.log(`[BOOT] Server listening on port ${port} - READY FOR HEALTH CHECKS`);
    log(`Server ready on port ${port}`);

    // ============= INITIALISATION APRÈS LISTEN =============
    // Tout le reste se fait APRÈS que le serveur écoute
    // Le health check /health fonctionne IMMÉDIATEMENT
    initializeServer();
  },
);

// Fonction d'initialisation asynchrone (appelée APRÈS listen)
async function initializeServer() {
  console.log("[BOOT] Starting initialization...");
  const startTime = Date.now();

  try {
    // ============= NEXUS ORCHESTRATOR =============
    console.log("[BOOT] Initializing NEXUS Orchestrator...");
    try {
      const { orchestrator } = await import("../platform/core/orchestrator.js");
      await orchestrator.initialize();
      console.log("[BOOT] ✅ Orchestrator ready");
    } catch (orchError: any) {
      console.error("[BOOT] ❌ Orchestrator init failed:", orchError.message);
      console.warn("[BOOT] ⚠️ Running in degraded mode (no multi-tenant)");
    }

    // ============= SENTINEL MONITORING (Observer) =============
    console.log("[BOOT] Starting Sentinel monitoring...");
    try {
      const { sentinel } = await import("../sentinel/core/sentinel.js");
      await sentinel.start();
      console.log("[BOOT] ✅ Sentinel Observer active");
    } catch (sentinelError: any) {
      console.error("[BOOT] ❌ Sentinel Observer failed:", sentinelError.message);
    }

    // ============= SENTINEL ACTION (Auto-Repair) =============
    console.log("[BOOT] Starting Sentinel Action...");
    try {
      const { sentinelAction } = await import("../sentinel/core/sentinelAction.js");
      sentinelAction.start();
      console.log("[BOOT] ✅ Sentinel Action (auto-repair) active");
    } catch (sentinelActionError: any) {
      console.error("[BOOT] ❌ Sentinel Action failed:", sentinelActionError.message);
    }

    // ============= SENTINEL ANALYZER (Phase 2) =============
    console.log("[BOOT] Starting Sentinel Analyzer...");
    try {
      const { sentinelAnalyzer } = await import("../sentinel/core/sentinelAnalyzer.js");
      sentinelAnalyzer.start();
      console.log("[BOOT] ✅ Sentinel Analyzer (detection) active");
    } catch (sentinelAnalyzerError: any) {
      console.error("[BOOT] ❌ Sentinel Analyzer failed:", sentinelAnalyzerError.message);
    }

    // ============= SENTINEL ALERTER (Phase 3) =============
    console.log("[BOOT] Starting Sentinel Alerter...");
    try {
      const { sentinelAlerter } = await import("../sentinel/core/sentinelAlerter.js");
      sentinelAlerter.start();
      console.log("[BOOT] ✅ Sentinel Alerter (notifications) active");
    } catch (sentinelAlerterError: any) {
      console.error("[BOOT] ❌ Sentinel Alerter failed:", sentinelAlerterError.message);
    }

    // ============= SENTINEL PROTECTOR (Phase 4) =============
    console.log("[BOOT] Starting Sentinel Protector...");
    try {
      const { sentinelProtector } = await import("../sentinel/core/sentinelProtector.js");
      sentinelProtector.start({ enableFirewall: true, enableIPBlocker: true, loadDefaultRules: true });
      console.log("[BOOT] ✅ Sentinel Protector (security) active");
    } catch (sentinelProtectorError: any) {
      console.error("[BOOT] ❌ Sentinel Protector failed:", sentinelProtectorError.message);
    }

    // ============= SENTINEL INTELLIGENCE (Phase 5) =============
    console.log("[BOOT] Starting Sentinel Intelligence...");
    try {
      const { sentinelIntelligence } = await import("../sentinel/core/sentinelIntelligence.js");
      sentinelIntelligence.start({ enableLearning: true, enableTechWatch: true });
      console.log("[BOOT] ✅ Sentinel Intelligence (auto-learning) active");
    } catch (sentinelIntelligenceError: any) {
      console.error("[BOOT] ❌ Sentinel Intelligence failed:", sentinelIntelligenceError.message);
    }

    // ============= NEXUS AUTOPILOT =============
    console.log("[BOOT] Starting NEXUS Autopilot...");
    try {
      const autopilot = (await import("../backend/src/services/autopilot.js")).default;
      // Démarrer le scan automatique toutes les heures
      autopilot.startAutoScan(60 * 60 * 1000);
      console.log("[BOOT] ✅ NEXUS Autopilot (auto-scan hourly) active");
    } catch (autopilotError: any) {
      console.error("[BOOT] ❌ NEXUS Autopilot failed:", autopilotError.message);
    }

    // ============= TENANT CONFIG FROM DB =============
    console.log("[BOOT] Loading tenant configs from database...");
    try {
      const { loadAllTenants, startPeriodicRefresh } = await import(
        "../backend/src/config/tenants/tenantCache.js"
      );
      const dbLoaded = await loadAllTenants();
      if (dbLoaded) {
        startPeriodicRefresh();
        console.log("[BOOT] ✅ Tenant configs loaded from DB + periodic refresh active");
      } else {
        console.warn("[BOOT] ⚠️ Using static tenant configs (DB unavailable)");
      }
    } catch (tenantCacheError: any) {
      console.error("[BOOT] ❌ TenantCache init failed:", tenantCacheError.message);
      console.warn("[BOOT] ⚠️ Using static tenant config files as fallback");
    }

    // ============= TENANT MIDDLEWARE =============
    const { identifyTenant } = await import("../backend/src/config/tenants/index.js");
    const { runWithTenant } = await import("./tenant-context");
    app.use((req: Request, _res: Response, next: NextFunction) => {
      // identifyTenant returns null for NEXUS context (no tenant), or tenant ID string
      const headerTenant = req.headers['x-tenant-id'] as string | undefined;
      const tenantId = (headerTenant && headerTenant.length > 0) ? headerTenant : identifyTenant(req);
      runWithTenant(tenantId, () => next());
    });
    console.log("[BOOT] ✅ Tenant middleware active");

    // ============= IMPORTS DYNAMIQUES =============
    // Ces imports sont faits ICI (après listen) pour éviter de bloquer le démarrage
    console.log("[BOOT] Loading routes module...");
    const { registerRoutes } = await import("./routes");

    console.log("[BOOT] Registering routes...");
    await registerRoutes(httpServer, app);
    console.log("[BOOT] Routes registered in", Date.now() - startTime, "ms");

    // Démarrer les jobs planifiés EN DERNIER
    console.log("[BOOT] Starting scheduled jobs...");
    const { startReminderJob } = await import("./scheduled-jobs");
    startReminderJob();

    // ============= AGENT AUTONOME HALIMAH =============
    // Initialiser le worker et le scheduler si Redis est disponible
    try {
      console.log("[BOOT] Initializing Halimah autonomous agent...");

      // Import dynamique pour éviter de bloquer si Redis n'est pas disponible
      const { initWorker } = await import("../backend/src/workers/halimahWorker.js");
      const { initScheduler } = await import("../backend/src/services/scheduler.js");

      // Initialiser le worker (traite les tâches de la queue) - await car async
      await initWorker();

      // Initialiser le scheduler (planifie les tâches automatiques) - await car async
      await initScheduler();

      console.log("[BOOT] ✅ Halimah autonomous agent ready");
    } catch (agentError: any) {
      console.log("[BOOT] ⚠️ Agent autonome non démarré:", agentError.message);
      console.log("[BOOT]    Redis est peut-être non disponible");
    }

    // ============= SOCIAL MEDIA SCHEDULER =============
    try {
      console.log("[BOOT] Starting social media scheduler...");
      const { startSocialScheduler } = await import("../backend/src/services/socialScheduler.js");
      startSocialScheduler();
      console.log("[BOOT] ✅ Social scheduler active");
    } catch (socialError: any) {
      console.log("[BOOT] ⚠️ Social scheduler non démarré:", socialError.message);
    }

    // ============= SENTINEL LIVE CONSOLE (WebSocket) =============
    try {
      const { initWebSocket, sentinelRequestCounter } = await import("./websocket.js");
      app.use(sentinelRequestCounter);
      initWebSocket(httpServer);
      console.log("[BOOT] ✅ Sentinel WebSocket active");
    } catch (wsError: any) {
      console.log("[BOOT] ⚠️ Sentinel WebSocket non démarré:", wsError.message);
    }

    const totalTime = Date.now() - startTime;
    console.log(`[BOOT] Server fully initialized in ${totalTime}ms`);
    log(`Server fully initialized in ${totalTime}ms`);

  } catch (error) {
    console.error("[BOOT] Error during server initialization:", error);
    // Le serveur continue de tourner même si l'init échoue
    // /health reste accessible
  } finally {
    // ============= API ONLY (pas de frontend) =============
    // nexus-core est un backend pur. Les frontends sont des repos separes.
    console.log("[BOOT] nexus-core is API-only (no frontend serving)");
  }
}
