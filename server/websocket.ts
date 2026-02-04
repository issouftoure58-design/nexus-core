import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import os from "os";

interface SentinelMessage {
  type: "log" | "metric" | "alert" | "command_result" | "welcome" | "heartbeat";
  timestamp: string;
  data: any;
}

// Compteurs internes
let requestCount = 0;
let totalRequests = 0;
let lastMinuteRequests = 0;
let errorCount = 0;
let lastCpuValues: number[] = [];
let lastMemValues: number[] = [];
let lastReqValues: number[] = [];
const logBuffer: SentinelMessage[] = [];
const MAX_LOG_BUFFER = 500;
const clients = new Set<WebSocket>();
const startedAt = Date.now();

// Middleware Express pour compter les requêtes et logger en live
export function sentinelRequestCounter(req: any, res: any, next: any) {
  requestCount++;
  totalRequests++;
  const start = Date.now();

  // Intercepter la fin de la réponse pour avoir le status code
  const originalEnd = res.end;
  res.end = function (...args: any[]) {
    const duration = Date.now() - start;
    const status = res.statusCode;

    if (status >= 400) errorCount++;

    // Log chaque requête API
    if (req.path.startsWith("/api/")) {
      const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
      sentinelLog(level, "API", `${req.method} ${req.path} → ${status} (${duration}ms)`, {
        method: req.method,
        path: req.path,
        status,
        duration,
        ip: req.ip,
      });
    }

    originalEnd.apply(res, args);
  };

  next();
}

export function sentinelLog(
  level: "info" | "warn" | "error" | "success",
  source: string,
  message: string,
  details?: any
) {
  const msg: SentinelMessage = {
    type: level === "error" ? "alert" : "log",
    timestamp: new Date().toISOString(),
    data: { level, source, message, details },
  };
  logBuffer.push(msg);
  if (logBuffer.length > MAX_LOG_BUFFER) logBuffer.shift();
  broadcast(msg);
}

function broadcast(msg: SentinelMessage) {
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function getCpuUsage(): number {
  const cpus = os.cpus();
  const avg =
    cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return acc + (1 - cpu.times.idle / total);
    }, 0) / cpus.length;
  return Math.round(avg * 100);
}

function getFullMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpu = getCpuUsage();
  const memPercent = Math.round((usedMem / totalMem) * 100);

  // Historique pour sparklines (garder 60 points = 60 secondes)
  lastCpuValues.push(cpu);
  lastMemValues.push(memPercent);
  lastReqValues.push(requestCount);
  if (lastCpuValues.length > 60) lastCpuValues.shift();
  if (lastMemValues.length > 60) lastMemValues.shift();
  if (lastReqValues.length > 60) lastReqValues.shift();

  const nodeMemory = process.memoryUsage();

  const isDev = process.env.NODE_ENV !== "production";

  return {
    cpu,
    cpuHistory: [...lastCpuValues],
    memory: {
      used: Math.round(usedMem / 1024 / 1024),
      total: Math.round(totalMem / 1024 / 1024),
      percent: memPercent,
      history: [...lastMemValues],
      node: {
        rss: Math.round(nodeMemory.rss / 1024 / 1024),
        heapUsed: Math.round(nodeMemory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(nodeMemory.heapTotal / 1024 / 1024),
      },
      // Label clair pour l'UI
      systemLabel: isDev ? "RAM de votre ordinateur" : "RAM du serveur",
      nodeLabel: "Memoire utilisee par l'application NEXUS",
    },
    requests: {
      total: totalRequests,
      perMinute: lastMinuteRequests,
      current: requestCount,
      history: [...lastReqValues],
      errors: errorCount,
      // Clarification
      note: "Compteur depuis le dernier demarrage du serveur, pas depuis le debut du mois",
    },
    uptime: Math.round(process.uptime()),
    connections: clients.size,
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
    env: process.env.NODE_ENV || "development",
  };
}

async function handleCommand(command: string, ws: WebSocket) {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  const send = (data: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "command_result",
          timestamp: new Date().toISOString(),
          data,
        })
      );
    }
  };

  switch (cmd) {
    case "status": {
      const m = getFullMetrics();
      send({
        command: "status",
        result: [
          `  PID: ${m.pid} | Node ${m.nodeVersion} | ${m.platform}`,
          `  CPU: ${m.cpu}% | RAM: ${m.memory.node.rss}MB (heap ${m.memory.node.heapUsed}/${m.memory.node.heapTotal}MB)`,
          `  Uptime: ${formatUptime(m.uptime)}`,
          `  Requêtes: ${m.requests.total} total | ${m.requests.perMinute}/min | ${m.requests.errors} erreurs`,
          `  WebSocket: ${m.connections} client(s) connecté(s)`,
          `  ENV: ${process.env.NODE_ENV || "development"}`,
        ],
      });
      break;
    }

    case "tenants": {
      try {
        const { supabase } = await import("./supabase.js");
        const { data } = await supabase.from("tenants").select("id, name, plan, active");
        send({ command: "tenants", result: data || [] });
      } catch {
        send({ command: "tenants", result: "Erreur: impossible de charger les tenants" });
      }
      break;
    }

    case "rdv": {
      try {
        const { supabase } = await import("./supabase.js");
        const today = new Date().toISOString().split("T")[0];
        const { data } = await supabase
          .from("reservations")
          .select("id, service_nom, date, heure, statut")
          .gte("date", today)
          .order("date")
          .limit(10);
        send({ command: "rdv", result: data || [] });
      } catch {
        send({ command: "rdv", result: "Erreur: impossible de charger les RDV" });
      }
      break;
    }

    case "logs": {
      const count = parseInt(parts[1] || "20");
      send({ command: "logs", result: logBuffer.slice(-count) });
      break;
    }

    case "clear":
      send({ command: "clear", result: "clear" });
      break;

    case "health": {
      const checks = [
        { name: "Server", status: "ok" },
        { name: "WebSocket", status: clients.size > 0 ? "ok" : "warn" },
        { name: "Memory", status: getCpuUsage() < 90 ? "ok" : "critical" },
      ];
      try {
        const { supabase } = await import("./supabase.js");
        const { error } = await supabase.from("services").select("id").limit(1);
        checks.push({ name: "Database", status: error ? "critical" : "ok" });
      } catch {
        checks.push({ name: "Database", status: "critical" });
      }
      send({
        command: "health",
        result: checks.map(
          (c) =>
            `  ${c.status === "ok" ? "●" : c.status === "warn" ? "●" : "●"} ${c.name}: ${c.status.toUpperCase()}`
        ),
      });
      break;
    }

    case "help":
      send({
        command: "help",
        result: [
          "  status    Métriques système (CPU, RAM, PID, uptime)",
          "  health    Vérification santé services",
          "  tenants   Liste des tenants actifs",
          "  rdv       Prochains RDV (10 max)",
          "  logs [n]  Derniers n logs (défaut: 20)",
          "  clear     Vider la console",
          "  help      Cette aide",
        ],
      });
      break;

    default:
      send({
        command: cmd,
        result: `Commande inconnue: '${cmd}'. Tapez 'help'.`,
      });
  }
}

// ─── SENTINEL INTELLIGENCE : Analyse et recommandations ───
interface Insight {
  id: string;
  severity: "info" | "warn" | "critical" | "ok";
  title: string;
  message: string;
  recommendation: string;
  metric: string;
  value: number;
  threshold: number;
}

let lastInsights: Insight[] = [];
let insightCooldowns: Record<string, number> = {};

function analyzeMetrics(): Insight[] {
  const m = getFullMetrics();
  const insights: Insight[] = [];
  const now = Date.now();
  const isDev = m.env !== "production";
  const machineLabel = isDev ? "votre ordinateur (Mac)" : "le serveur de production";

  // ── TOUJOURS : Explication du contexte dev/prod ──
  if (isDev) {
    insights.push({
      id: "dev_mode",
      severity: "info",
      title: "Mode developpement",
      message: `Vous etes en mode developpement. Sentinel surveille ${machineLabel}, pas un serveur distant. Les metriques RAM et CPU sont celles de votre Mac. Quand l'application sera deployee en production (ex: Render, Railway, VPS), ces chiffres refleteront le serveur de production.`,
      recommendation: "C'est normal en developpement. Les alertes RAM elevee sont souvent dues aux autres applications ouvertes sur votre Mac (Chrome, VS Code, Figma...). Cela n'affecte PAS vos clients.",
      metric: "env",
      value: 0,
      threshold: 0,
    });
  }

  // ── RAM Machine (Mac en dev, Serveur en prod) ──
  if (m.memory.percent >= 90) {
    insights.push({
      id: "ram_critical",
      severity: isDev ? "warn" : "critical",
      title: isDev ? "RAM de votre Mac elevee" : "RAM Serveur critique",
      message: isDev
        ? `La RAM de votre ordinateur est a ${m.memory.percent}% (${m.memory.used}MB utilises sur ${m.memory.total}MB). C'est la memoire totale de votre Mac, partagee entre TOUTES vos applications (Chrome, VS Code, Slack, etc.). L'application NEXUS n'utilise que ${m.memory.node.rss}MB — donc ce n'est PAS NEXUS qui consomme toute la RAM.`
        : `La RAM du serveur est a ${m.memory.percent}% (${m.memory.used}MB / ${m.memory.total}MB). Le serveur risque de ralentir car il n'a presque plus de memoire disponible.`,
      recommendation: isDev
        ? `Rien d'alarmant pour NEXUS. Pour liberer de la RAM sur votre Mac : fermez les onglets Chrome inutiles, quittez les apps que vous n'utilisez pas. L'application NEXUS elle-meme ne consomme que ${m.memory.node.rss}MB, ce qui est normal.`
        : "Sur le serveur de production : envisagez d'augmenter la RAM (upgrade du plan d'hebergement) ou optimisez les services qui consomment le plus.",
      metric: "memory.percent",
      value: m.memory.percent,
      threshold: 90,
    });
  } else if (m.memory.percent >= 75) {
    insights.push({
      id: "ram_warning",
      severity: isDev ? "info" : "warn",
      title: isDev ? "RAM Mac moderee" : "RAM Serveur elevee",
      message: isDev
        ? `Votre Mac utilise ${m.memory.percent}% de sa RAM. C'est courant avec plusieurs apps ouvertes. NEXUS utilise seulement ${m.memory.node.rss}MB.`
        : `Le serveur utilise ${m.memory.percent}% de sa RAM. Il fonctionne mais avec peu de marge.`,
      recommendation: isDev
        ? "Fonctionnement normal. Si votre Mac ralentit, fermez des applications."
        : "Surveillez l'evolution. Prevoyez un upgrade si ca continue a monter.",
      metric: "memory.percent",
      value: m.memory.percent,
      threshold: 75,
    });
  } else {
    insights.push({
      id: "ram_ok",
      severity: "ok",
      title: isDev ? "RAM Mac OK" : "RAM Serveur OK",
      message: `${isDev ? "Votre Mac" : "Le serveur"} utilise ${m.memory.percent}% de RAM. Tout est confortable.`,
      recommendation: "Aucune action necessaire.",
      metric: "memory.percent",
      value: m.memory.percent,
      threshold: 50,
    });
  }

  // ── Memoire de l'application NEXUS (la seule qui compte vraiment) ──
  const heapPct = Math.round((m.memory.node.heapUsed / m.memory.node.heapTotal) * 100);
  insights.push({
    id: "app_memory",
    severity: heapPct > 85 ? "critical" : heapPct > 70 ? "warn" : "ok",
    title: "Memoire application NEXUS",
    message: `L'application NEXUS utilise ${m.memory.node.rss}MB de memoire au total. Le "heap" (espace de travail JavaScript) est a ${heapPct}% (${m.memory.node.heapUsed}MB sur ${m.memory.node.heapTotal}MB disponibles). ${heapPct > 85 ? "C'est tres eleve — risque de crash." : heapPct > 70 ? "C'est au-dessus de la moyenne." : "C'est un niveau normal."}`,
    recommendation: heapPct > 85
      ? "L'application risque de planter par manque de memoire. Redemarrez le serveur pour liberer la memoire. Si le probleme revient, il y a peut-etre une fuite memoire a investiguer."
      : heapPct > 70
      ? "Surveillez si ca augmente avec le temps. Si oui, un redemarrage periodique peut aider."
      : `${m.memory.node.rss}MB c'est normal pour une application Express avec IA et WebSocket. Pas d'action necessaire.`,
    metric: "heap",
    value: heapPct,
    threshold: 85,
  });

  // ── CPU ──
  insights.push({
    id: "cpu_status",
    severity: m.cpu > 80 ? "critical" : m.cpu > 50 ? "warn" : "ok",
    title: `CPU ${isDev ? "de votre Mac" : "du serveur"}`,
    message: m.cpu > 80
      ? `Le processeur est a ${m.cpu}%. ${isDev ? "Votre Mac travaille beaucoup — probablement a cause de Chrome, VS Code, ou d'autres apps, pas de NEXUS." : "Le serveur est surcharge. Les clients peuvent ressentir des lenteurs."}`
      : m.cpu > 50
      ? `Le processeur est a ${m.cpu}%. ${isDev ? "Charge moderee, votre Mac fonctionne normalement." : "Charge moderee. Le serveur repond correctement."}`
      : `Le processeur est a ${m.cpu}%. ${isDev ? "Votre Mac est tranquille." : "Le serveur est au repos. Bonnes performances."}`,
    recommendation: m.cpu > 80
      ? (isDev ? "Fermez les onglets Chrome ou apps gourmandes. NEXUS n'est pas en cause." : "Identifiez les requetes lourdes. Un upgrade CPU ou un scaling horizontal peut aider.")
      : "Aucune action necessaire.",
    metric: "cpu",
    value: m.cpu,
    threshold: 80,
  });

  // ── Requetes (avec explication claire) ──
  insights.push({
    id: "requests_info",
    severity: m.requests.errors > 10 ? "critical" : m.requests.errors > 0 ? "warn" : "ok",
    title: "Activite API",
    message: `${m.requests.total} requetes traitees depuis le dernier demarrage du serveur (il y a ${formatUptime(m.uptime)}). ${m.requests.perMinute} requetes par minute. ${m.requests.errors} erreurs. IMPORTANT : ce compteur repart a zero a chaque redemarrage du serveur. Ce n'est PAS le total du mois — c'est le total depuis la derniere mise en route.`,
    recommendation: m.requests.errors > 10
      ? "Beaucoup d'erreurs detectees. Allez dans l'onglet Console et tapez 'logs 50' pour voir les details des erreurs."
      : m.requests.errors > 0
      ? `${m.requests.errors} erreur(s) — souvent des erreurs 404 (page non trouvee) causees par des robots qui testent des URLs. Pas d'inquietude si le site fonctionne bien pour les clients.`
      : "Aucune erreur. Tout fonctionne parfaitement.",
    metric: "requests",
    value: m.requests.total,
    threshold: 0,
  });

  // ── Uptime ──
  insights.push({
    id: "uptime_info",
    severity: m.uptime < 120 ? "info" : m.uptime > 86400 ? "ok" : "ok",
    title: "Duree de fonctionnement",
    message: m.uptime < 120
      ? `Le serveur vient de demarrer (il y a ${formatUptime(m.uptime)}). Les graphiques (sparklines) se remplissent progressivement — c'est normal de voir peu de donnees au debut. Attendez 2-3 minutes pour des metriques stables.`
      : `Le serveur tourne depuis ${formatUptime(m.uptime)} sans interruption. ${m.uptime > 86400 ? "Excellente stabilite !" : "Fonctionnement normal."}`,
    recommendation: m.uptime < 120
      ? "Patientez. Les diagnostics seront plus precis dans quelques minutes."
      : m.uptime > 86400
      ? "Le serveur est tres stable. Un redemarrage periodique (ex: 1 fois par semaine) est recommande pour liberer la memoire accumulee."
      : "Tout va bien.",
    metric: "uptime",
    value: m.uptime,
    threshold: 120,
  });

  // Filtrer par cooldown (ne pas envoyer le même insight trop souvent)
  const filtered = insights.filter((i) => {
    const lastSent = insightCooldowns[i.id] || 0;
    const cooldown = i.severity === "critical" ? 30000 : i.severity === "warn" ? 60000 : 120000;
    if (now - lastSent < cooldown) return false;
    insightCooldowns[i.id] = now;
    return true;
  });

  lastInsights = insights; // Garder tous les insights (même non envoyés) pour le state
  return filtered;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export function initWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/sentinel" });

  console.log("[SENTINEL-WS] WebSocket server initialized on /ws/sentinel");

  wss.on("connection", (ws) => {
    clients.add(ws);
    console.log(`[SENTINEL-WS] Client connected (${clients.size} total)`);

    // Welcome + initial metrics
    ws.send(
      JSON.stringify({
        type: "welcome",
        timestamp: new Date().toISOString(),
        data: {
          message: "SENTINEL Live Console — connexion établie",
          metrics: getFullMetrics(),
          recentLogs: logBuffer.slice(-30),
        },
      })
    );

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "command" && typeof msg.command === "string") {
          handleCommand(msg.command, ws);
        }
      } catch {
        // Ignore
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`[SENTINEL-WS] Client disconnected (${clients.size} total)`);
    });
  });

  // Heartbeat every 1s (pour l'ECG et l'animation)
  setInterval(() => {
    if (clients.size > 0) {
      broadcast({
        type: "heartbeat",
        timestamp: new Date().toISOString(),
        data: { alive: true, t: Date.now() },
      });
    }
  }, 1000);

  // Full metrics every 2s
  setInterval(() => {
    if (clients.size > 0) {
      broadcast({
        type: "metric",
        timestamp: new Date().toISOString(),
        data: { ...getFullMetrics(), insights: lastInsights },
      });
    }
  }, 2000);

  // Sentinel Intelligence: analyze every 10s and broadcast new insights
  setInterval(() => {
    if (clients.size > 0) {
      const newInsights = analyzeMetrics();
      for (const insight of newInsights) {
        broadcast({
          type: "alert",
          timestamp: new Date().toISOString(),
          data: {
            level: insight.severity === "critical" ? "error" : insight.severity === "warn" ? "warn" : insight.severity === "ok" ? "success" : "info",
            source: "SENTINEL-AI",
            message: `[${insight.title}] ${insight.message}`,
            details: { recommendation: insight.recommendation, metric: insight.metric, value: insight.value },
          },
        });
      }
    }
  }, 10000);

  // Track requests per minute
  setInterval(() => {
    lastMinuteRequests = requestCount;
    requestCount = 0;
  }, 60000);

  return wss;
}
