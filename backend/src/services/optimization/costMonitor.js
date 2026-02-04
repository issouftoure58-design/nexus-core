/**
 * Service de monitoring des coûts NEXUS
 *
 * Centralise le suivi des coûts pour tous les services externes :
 * - Anthropic Claude (chat, outils)
 * - ElevenLabs (TTS)
 * - Twilio (SMS, appels, WhatsApp)
 * - OpenAI DALL-E (images)
 * - Tavily (recherche web)
 *
 * @module costMonitor
 */

import fs from 'fs';
import path from 'path';

// Utiliser process.cwd() pour compatibilité ESM/CJS
const PROJECT_ROOT = process.cwd();

// === CONFIGURATION DES PRIX ===

export const PRICING = {
  claude: {
    // Prix par million de tokens
    sonnet: { input: 3.00, output: 15.00 },
    haiku: { input: 0.25, output: 1.25 },
    opus: { input: 15.00, output: 75.00 }
  },
  elevenlabs: {
    // Prix par caractère
    turbo: 0.00015,
    multilingual: 0.00030
  },
  twilio: {
    // Prix unitaires
    sms_out_fr: 0.0725,
    sms_in_fr: 0.0075,
    call_out_fr: 0.015, // par minute
    call_in_fr: 0.0085, // par minute
    whatsapp_session: 0.005,
    whatsapp_template: 0.08,
    number_fr_monthly: 1.15
  },
  dalle: {
    // Prix par image
    standard_1024: 0.040,
    standard_1792: 0.080,
    hd_1024: 0.080,
    hd_1792: 0.120
  },
  tavily: {
    // Prix par recherche (estimation plan Basic)
    search: 0.003
  }
};

// === BUDGETS PAR DÉFAUT ===

const DEFAULT_BUDGETS = {
  claude: parseFloat(process.env.BUDGET_CLAUDE) || 150,
  elevenlabs: parseFloat(process.env.BUDGET_ELEVENLABS) || 20,
  twilio: parseFloat(process.env.BUDGET_TWILIO) || 80,
  dalle: parseFloat(process.env.BUDGET_DALLE) || 5,
  tavily: parseFloat(process.env.BUDGET_TAVILY) || 0,
  total: parseFloat(process.env.BUDGET_TOTAL) || 300
};

// === SEUILS D'ALERTE ===

const ALERT_THRESHOLDS = {
  info: parseInt(process.env.ALERT_THRESHOLD_INFO) || 50,
  warning: parseInt(process.env.ALERT_THRESHOLD_WARNING) || 75,
  critical: parseInt(process.env.ALERT_THRESHOLD_CRITICAL) || 90
};

// === CHEMINS DES FICHIERS ===

const COSTS_DIR = path.join(PROJECT_ROOT, 'data', 'costs');
const DAILY_DIR = path.join(COSTS_DIR, 'daily');
const MONTHLY_DIR = path.join(COSTS_DIR, 'monthly');

// === STATISTIQUES EN MÉMOIRE ===

let sessionStats = {
  startTime: Date.now(),
  services: {
    claude: { calls: 0, tokens: { input: 0, output: 0 }, cost: 0 },
    elevenlabs: { calls: 0, characters: 0, cost: 0, cacheHits: 0 },
    twilio: { sms: 0, calls: 0, minutes: 0, whatsapp: 0, cost: 0 },
    dalle: { images: 0, cost: 0 },
    tavily: { searches: 0, cost: 0 }
  }
};

// === FONCTIONS UTILITAIRES ===

function ensureDirectories() {
  [COSTS_DIR, DAILY_DIR, MONTHLY_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function getTodayFilename() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(DAILY_DIR, `${today}.json`);
}

function getMonthFilename(date = new Date()) {
  const month = date.toISOString().slice(0, 7); // YYYY-MM
  return path.join(MONTHLY_DIR, `${month}.json`);
}

function loadDailyData(date = new Date()) {
  const dateStr = date instanceof Date
    ? date.toISOString().split('T')[0]
    : date;
  const filepath = path.join(DAILY_DIR, `${dateStr}.json`);

  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  }

  return {
    date: dateStr,
    services: {
      claude: { calls: 0, tokens: { input: 0, output: 0 }, cost: 0, details: [] },
      elevenlabs: { calls: 0, characters: 0, cost: 0, cacheHits: 0, details: [] },
      twilio: { sms: 0, calls: 0, minutes: 0, whatsapp: 0, cost: 0, details: [] },
      dalle: { images: 0, cost: 0, details: [] },
      tavily: { searches: 0, cost: 0, details: [] }
    },
    totalCost: 0,
    lastUpdated: null
  };
}

function saveDailyData(data) {
  ensureDirectories();
  data.lastUpdated = new Date().toISOString();
  data.totalCost = Object.values(data.services).reduce((sum, s) => sum + (s.cost || 0), 0);
  fs.writeFileSync(getTodayFilename(), JSON.stringify(data, null, 2));
}

// === FONCTIONS DE CALCUL DES COÛTS ===

/**
 * Calcule le coût d'une requête Claude
 */
export function calculateClaudeCost(inputTokens, outputTokens, model = 'sonnet') {
  const pricing = PRICING.claude[model] || PRICING.claude.sonnet;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Calcule le coût ElevenLabs
 */
export function calculateElevenLabsCost(characters, model = 'turbo') {
  const pricePerChar = PRICING.elevenlabs[model] || PRICING.elevenlabs.turbo;
  return characters * pricePerChar;
}

/**
 * Calcule le coût Twilio
 */
export function calculateTwilioCost(type, quantity) {
  switch (type) {
    case 'sms_out':
      return quantity * PRICING.twilio.sms_out_fr;
    case 'sms_in':
      return quantity * PRICING.twilio.sms_in_fr;
    case 'call_out':
      return quantity * PRICING.twilio.call_out_fr; // quantity = minutes
    case 'call_in':
      return quantity * PRICING.twilio.call_in_fr;
    case 'whatsapp':
      return quantity * PRICING.twilio.whatsapp_session;
    default:
      return 0;
  }
}

/**
 * Calcule le coût DALL-E
 */
export function calculateDalleCost(resolution = '1024', quality = 'standard') {
  const key = `${quality}_${resolution}`;
  return PRICING.dalle[key] || PRICING.dalle.standard_1024;
}

// === FONCTIONS DE TRACKING ===

/**
 * Enregistre une utilisation de service
 * @param {string} service - claude, elevenlabs, twilio, dalle, tavily
 * @param {string} operation - Type d'opération
 * @param {number} quantity - Quantité (tokens, caractères, minutes...)
 * @param {object} metadata - Données supplémentaires
 */
export function trackUsage(service, operation, quantity, metadata = {}) {
  ensureDirectories();

  const dailyData = loadDailyData();
  const timestamp = new Date().toISOString();
  let cost = 0;

  switch (service) {
    case 'claude':
      const inputTokens = metadata.inputTokens || 0;
      const outputTokens = metadata.outputTokens || quantity;
      const model = metadata.model || 'sonnet';
      cost = calculateClaudeCost(inputTokens, outputTokens, model);

      dailyData.services.claude.calls++;
      dailyData.services.claude.tokens.input += inputTokens;
      dailyData.services.claude.tokens.output += outputTokens;
      dailyData.services.claude.cost += cost;
      dailyData.services.claude.details.push({
        timestamp,
        operation,
        inputTokens,
        outputTokens,
        model,
        cost
      });

      sessionStats.services.claude.calls++;
      sessionStats.services.claude.tokens.input += inputTokens;
      sessionStats.services.claude.tokens.output += outputTokens;
      sessionStats.services.claude.cost += cost;
      break;

    case 'elevenlabs':
      const elevenModel = metadata.model || 'turbo';
      const fromCache = metadata.fromCache || false;

      if (fromCache) {
        dailyData.services.elevenlabs.cacheHits++;
        sessionStats.services.elevenlabs.cacheHits++;
        cost = 0;
      } else {
        cost = calculateElevenLabsCost(quantity, elevenModel);
        dailyData.services.elevenlabs.calls++;
        dailyData.services.elevenlabs.characters += quantity;
        dailyData.services.elevenlabs.cost += cost;

        sessionStats.services.elevenlabs.calls++;
        sessionStats.services.elevenlabs.characters += quantity;
        sessionStats.services.elevenlabs.cost += cost;
      }

      dailyData.services.elevenlabs.details.push({
        timestamp,
        operation,
        characters: quantity,
        model: elevenModel,
        fromCache,
        cost
      });
      break;

    case 'twilio':
      cost = calculateTwilioCost(operation, quantity);

      if (operation.includes('sms')) {
        dailyData.services.twilio.sms++;
        sessionStats.services.twilio.sms++;
      } else if (operation.includes('call')) {
        dailyData.services.twilio.calls++;
        dailyData.services.twilio.minutes += quantity;
        sessionStats.services.twilio.calls++;
        sessionStats.services.twilio.minutes += quantity;
      } else if (operation === 'whatsapp') {
        dailyData.services.twilio.whatsapp++;
        sessionStats.services.twilio.whatsapp++;
      }

      dailyData.services.twilio.cost += cost;
      sessionStats.services.twilio.cost += cost;

      dailyData.services.twilio.details.push({
        timestamp,
        operation,
        quantity,
        cost,
        ...metadata
      });
      break;

    case 'dalle':
      const resolution = metadata.resolution || '1024';
      const quality = metadata.quality || 'standard';
      cost = calculateDalleCost(resolution, quality);

      dailyData.services.dalle.images++;
      dailyData.services.dalle.cost += cost;

      sessionStats.services.dalle.images++;
      sessionStats.services.dalle.cost += cost;

      dailyData.services.dalle.details.push({
        timestamp,
        operation,
        resolution,
        quality,
        cost,
        prompt: metadata.prompt?.substring(0, 100)
      });
      break;

    case 'tavily':
      cost = PRICING.tavily.search;

      dailyData.services.tavily.searches++;
      dailyData.services.tavily.cost += cost;

      sessionStats.services.tavily.searches++;
      sessionStats.services.tavily.cost += cost;

      dailyData.services.tavily.details.push({
        timestamp,
        operation,
        query: metadata.query?.substring(0, 100),
        cost
      });
      break;
  }

  saveDailyData(dailyData);

  // Vérifier les alertes budget
  checkBudgetAlerts();

  return { service, operation, cost, timestamp };
}

// === FONCTIONS DE RÉCUPÉRATION DES COÛTS ===

/**
 * Récupère les coûts du jour
 */
export function getDailyCosts(date = new Date()) {
  const data = loadDailyData(date);
  return {
    date: data.date,
    totalCost: data.totalCost,
    services: Object.fromEntries(
      Object.entries(data.services).map(([key, value]) => [
        key,
        { ...value, details: undefined } // Exclure les détails pour la vue d'ensemble
      ])
    ),
    lastUpdated: data.lastUpdated
  };
}

/**
 * Récupère les coûts du mois
 */
export function getMonthlyCosts(month = new Date()) {
  const monthStr = month instanceof Date
    ? month.toISOString().slice(0, 7)
    : month;

  // Lister tous les fichiers du mois
  ensureDirectories();
  const files = fs.readdirSync(DAILY_DIR)
    .filter(f => f.startsWith(monthStr))
    .sort();

  const aggregated = {
    month: monthStr,
    days: files.length,
    services: {
      claude: { calls: 0, tokens: { input: 0, output: 0 }, cost: 0 },
      elevenlabs: { calls: 0, characters: 0, cost: 0, cacheHits: 0 },
      twilio: { sms: 0, calls: 0, minutes: 0, whatsapp: 0, cost: 0 },
      dalle: { images: 0, cost: 0 },
      tavily: { searches: 0, cost: 0 }
    },
    totalCost: 0,
    dailyBreakdown: []
  };

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, file), 'utf-8'));

    // Agréger les services
    for (const [service, stats] of Object.entries(data.services)) {
      if (aggregated.services[service]) {
        aggregated.services[service].cost += stats.cost || 0;

        if (service === 'claude') {
          aggregated.services[service].calls += stats.calls || 0;
          aggregated.services[service].tokens.input += stats.tokens?.input || 0;
          aggregated.services[service].tokens.output += stats.tokens?.output || 0;
        } else if (service === 'elevenlabs') {
          aggregated.services[service].calls += stats.calls || 0;
          aggregated.services[service].characters += stats.characters || 0;
          aggregated.services[service].cacheHits += stats.cacheHits || 0;
        } else if (service === 'twilio') {
          aggregated.services[service].sms += stats.sms || 0;
          aggregated.services[service].calls += stats.calls || 0;
          aggregated.services[service].minutes += stats.minutes || 0;
          aggregated.services[service].whatsapp += stats.whatsapp || 0;
        } else if (service === 'dalle') {
          aggregated.services[service].images += stats.images || 0;
        } else if (service === 'tavily') {
          aggregated.services[service].searches += stats.searches || 0;
        }
      }
    }

    aggregated.dailyBreakdown.push({
      date: data.date,
      cost: data.totalCost
    });
  }

  aggregated.totalCost = Object.values(aggregated.services)
    .reduce((sum, s) => sum + (s.cost || 0), 0);

  return aggregated;
}

/**
 * Récupère le détail d'un service sur une période
 */
export function getServiceBreakdown(service, period = 'week') {
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 1;
  const breakdown = [];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const data = loadDailyData(date);

    if (data.services[service]) {
      breakdown.push({
        date: data.date,
        ...data.services[service],
        details: data.services[service].details?.slice(-10) // Derniers 10 détails
      });
    }
  }

  return breakdown.reverse();
}

// === GESTION DU BUDGET ===

/**
 * Vérifie les alertes de budget
 */
export function checkBudgetAlerts() {
  const monthly = getMonthlyCosts();
  const alerts = [];

  // Vérifier chaque service
  for (const [service, budget] of Object.entries(DEFAULT_BUDGETS)) {
    if (service === 'total') continue;

    const spent = monthly.services[service]?.cost || 0;
    const percent = (spent / budget) * 100;

    if (percent >= ALERT_THRESHOLDS.critical) {
      alerts.push({
        level: 'critical',
        service,
        message: `${service}: ${percent.toFixed(1)}% du budget utilisé ($${spent.toFixed(2)}/$${budget})`,
        spent,
        budget,
        percent
      });
    } else if (percent >= ALERT_THRESHOLDS.warning) {
      alerts.push({
        level: 'warning',
        service,
        message: `${service}: ${percent.toFixed(1)}% du budget utilisé`,
        spent,
        budget,
        percent
      });
    } else if (percent >= ALERT_THRESHOLDS.info) {
      alerts.push({
        level: 'info',
        service,
        message: `${service}: ${percent.toFixed(1)}% du budget utilisé`,
        spent,
        budget,
        percent
      });
    }
  }

  // Vérifier le budget total
  const totalSpent = monthly.totalCost;
  const totalPercent = (totalSpent / DEFAULT_BUDGETS.total) * 100;

  if (totalPercent >= ALERT_THRESHOLDS.critical) {
    alerts.unshift({
      level: 'critical',
      service: 'total',
      message: `TOTAL: ${totalPercent.toFixed(1)}% du budget mensuel utilisé ($${totalSpent.toFixed(2)}/$${DEFAULT_BUDGETS.total})`,
      spent: totalSpent,
      budget: DEFAULT_BUDGETS.total,
      percent: totalPercent
    });
  }

  return alerts;
}

/**
 * Récupère le statut du budget
 */
export function getBudgetStatus() {
  const monthly = getMonthlyCosts();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  const status = {
    month: monthly.month,
    daysRemaining,
    services: {},
    total: {
      budget: DEFAULT_BUDGETS.total,
      spent: monthly.totalCost,
      remaining: DEFAULT_BUDGETS.total - monthly.totalCost,
      percent: (monthly.totalCost / DEFAULT_BUDGETS.total) * 100,
      projectedEndOfMonth: (monthly.totalCost / dayOfMonth) * daysInMonth
    },
    alerts: checkBudgetAlerts()
  };

  for (const [service, budget] of Object.entries(DEFAULT_BUDGETS)) {
    if (service === 'total') continue;

    const spent = monthly.services[service]?.cost || 0;
    status.services[service] = {
      budget,
      spent,
      remaining: budget - spent,
      percent: (spent / budget) * 100,
      projectedEndOfMonth: (spent / dayOfMonth) * daysInMonth
    };
  }

  return status;
}

// === STATISTIQUES DE SESSION ===

/**
 * Récupère les statistiques de la session en cours
 */
export function getSessionStats() {
  const duration = Date.now() - sessionStats.startTime;
  return {
    ...sessionStats,
    duration,
    durationMinutes: Math.round(duration / 60000)
  };
}

/**
 * Réinitialise les statistiques de session
 */
export function resetSessionStats() {
  sessionStats = {
    startTime: Date.now(),
    services: {
      claude: { calls: 0, tokens: { input: 0, output: 0 }, cost: 0 },
      elevenlabs: { calls: 0, characters: 0, cost: 0, cacheHits: 0 },
      twilio: { sms: 0, calls: 0, minutes: 0, whatsapp: 0, cost: 0 },
      dalle: { images: 0, cost: 0 },
      tavily: { searches: 0, cost: 0 }
    }
  };
}

// === EXPORT PAR DÉFAUT ===

export default {
  PRICING,
  trackUsage,
  getDailyCosts,
  getMonthlyCosts,
  getServiceBreakdown,
  getBudgetStatus,
  checkBudgetAlerts,
  getSessionStats,
  resetSessionStats,
  calculateClaudeCost,
  calculateElevenLabsCost,
  calculateTwilioCost,
  calculateDalleCost
};
