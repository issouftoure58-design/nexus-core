/**
 * Configuration des environnements pour Halimah
 *
 * Permet de basculer entre Dev, Staging et Production
 * avec des configurations séparées pour chaque environnement
 */

import dotenv from 'dotenv';
import fs from 'fs';

// ============ DÉFINITION DES ENVIRONNEMENTS ============

export const Environments = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production'
};

// Environnement actuel (par défaut: development)
let currentEnvironment = process.env.NODE_ENV || Environments.DEVELOPMENT;

// ============ CONFIGURATIONS PAR ENVIRONNEMENT ============

const environmentConfigs = {

  // ============ DEVELOPMENT ============
  [Environments.DEVELOPMENT]: {
    name: 'Development',
    emoji: '🔧',
    description: 'Environnement de développement - Données fictives, pas de vraies actions',

    // Base de données
    database: {
      url: process.env.DEV_DATABASE_URL || process.env.DATABASE_URL,
      schema: 'dev'
    },

    // Réseaux sociaux
    social: {
      enabled: false,  // Désactivé en dev
      mockResponses: true,
      accounts: {
        instagram: { username: 'test_fatshairafro', mock: true },
        facebook: { pageId: 'test_page', mock: true },
        tiktok: { username: 'test_fatshairafro', mock: true }
      }
    },

    // APIs
    apis: {
      claudeEnabled: true,
      dalleEnabled: false,  // Économiser les crédits
      tavilyEnabled: false,
      mockEnabled: true
    },

    // Paiements
    payments: {
      stripe: { testMode: true, key: process.env.STRIPE_TEST_KEY },
      paypal: { sandbox: true }
    },

    // Notifications
    notifications: {
      whatsapp: false,
      email: false,
      sms: false,
      console: true  // Log dans la console uniquement
    },

    // Limites
    limits: {
      maxPostsPerDay: 100,  // Pas de limite en dev
      maxApiCalls: 1000
    },

    // Debug
    debug: {
      verbose: true,
      logLevel: 'debug',
      saveAllRequests: true
    }
  },

  // ============ STAGING ============
  [Environments.STAGING]: {
    name: 'Staging',
    emoji: '🧪',
    description: 'Environnement de test - Vraies APIs mais comptes de test',

    database: {
      url: process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL,
      schema: 'staging'
    },

    social: {
      enabled: true,
      mockResponses: false,
      accounts: {
        instagram: { username: process.env.STAGING_INSTAGRAM_USER || 'staging_fatshairafro', mock: false },
        facebook: { pageId: process.env.STAGING_FACEBOOK_PAGE, mock: false },
        tiktok: { username: process.env.STAGING_TIKTOK_USER, mock: false }
      }
    },

    apis: {
      claudeEnabled: true,
      dalleEnabled: true,
      tavilyEnabled: true,
      mockEnabled: false
    },

    payments: {
      stripe: { testMode: true, key: process.env.STRIPE_TEST_KEY },
      paypal: { sandbox: true }
    },

    notifications: {
      whatsapp: false,  // Pas de vraies notifs en staging
      email: true,      // Mais emails OK (vers adresses de test)
      sms: false,
      console: true
    },

    limits: {
      maxPostsPerDay: 10,
      maxApiCalls: 500
    },

    debug: {
      verbose: true,
      logLevel: 'info',
      saveAllRequests: true
    }
  },

  // ============ PRODUCTION ============
  [Environments.PRODUCTION]: {
    name: 'Production',
    emoji: '🚀',
    description: 'Environnement de production - Vraies données, vraies actions',

    database: {
      url: process.env.DATABASE_URL,
      schema: 'public'
    },

    social: {
      enabled: true,
      mockResponses: false,
      accounts: {
        instagram: { username: process.env.INSTAGRAM_USERNAME, mock: false },
        facebook: { pageId: process.env.FACEBOOK_PAGE_ID, mock: false },
        tiktok: { username: process.env.TIKTOK_USERNAME, mock: false }
      }
    },

    apis: {
      claudeEnabled: true,
      dalleEnabled: true,
      tavilyEnabled: true,
      mockEnabled: false
    },

    payments: {
      stripe: { testMode: false, key: process.env.STRIPE_LIVE_KEY },
      paypal: { sandbox: false }
    },

    notifications: {
      whatsapp: true,
      email: true,
      sms: true,
      console: false
    },

    limits: {
      maxPostsPerDay: 5,  // Limite raisonnable
      maxApiCalls: 200
    },

    debug: {
      verbose: false,
      logLevel: 'warn',
      saveAllRequests: false
    }
  }
};

// ============ GETTERS ============

/**
 * Récupère l'environnement actuel
 */
export function getCurrentEnvironment() {
  return currentEnvironment;
}

/**
 * Récupère la config de l'environnement actuel
 */
export function getConfig() {
  return environmentConfigs[currentEnvironment];
}

/**
 * Récupère une config spécifique
 */
export function getConfigValue(configPath) {
  const config = getConfig();
  return configPath.split('.').reduce((obj, key) => obj?.[key], config);
}

/**
 * Vérifie si on est en production
 */
export function isProduction() {
  return currentEnvironment === Environments.PRODUCTION;
}

/**
 * Vérifie si on est en développement
 */
export function isDevelopment() {
  return currentEnvironment === Environments.DEVELOPMENT;
}

/**
 * Vérifie si on est en staging
 */
export function isStaging() {
  return currentEnvironment === Environments.STAGING;
}

// ============ SETTERS ============

/**
 * Change l'environnement actuel
 */
export function setEnvironment(env) {
  if (!Object.values(Environments).includes(env)) {
    console.error(`[ENV] ❌ Environnement invalide: ${env}`);
    return false;
  }

  const oldEnv = currentEnvironment;
  currentEnvironment = env;

  const config = getConfig();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`${config.emoji} Environnement changé: ${oldEnv} → ${env}`);
  console.log(`   ${config.description}`);
  console.log(`${'='.repeat(50)}\n`);

  // Recharger les configurations si nécessaire
  reloadEnvironmentConfig(env);

  return true;
}

/**
 * Recharge les configs pour un environnement
 */
function reloadEnvironmentConfig(env) {
  // Charger le fichier .env spécifique si existe
  const envFile = `.env.${env}`;
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
    console.log(`[ENV] 📄 Fichier ${envFile} chargé`);
  }
}

// ============ HELPERS ============

/**
 * Vérifie si une fonctionnalité est activée
 */
export function isFeatureEnabled(feature) {
  const config = getConfig();

  switch (feature) {
    case 'social':
      return config.social.enabled;
    case 'dalle':
      return config.apis.dalleEnabled;
    case 'tavily':
      return config.apis.tavilyEnabled;
    case 'whatsapp':
      return config.notifications.whatsapp;
    case 'email':
      return config.notifications.email;
    case 'sms':
      return config.notifications.sms;
    case 'payments':
      return !config.payments.stripe.testMode;
    case 'mock':
      return config.apis.mockEnabled;
    default:
      return true;
  }
}

/**
 * Récupère les infos de l'environnement pour affichage
 */
export function getEnvironmentInfo() {
  const config = getConfig();

  return {
    current: currentEnvironment,
    name: config.name,
    emoji: config.emoji,
    description: config.description,
    features: {
      socialMedia: config.social.enabled,
      realPublishing: config.social.enabled && !config.social.mockResponses,
      dalle: config.apis.dalleEnabled,
      tavily: config.apis.tavilyEnabled,
      whatsapp: config.notifications.whatsapp,
      email: config.notifications.email,
      livePayments: !config.payments.stripe.testMode,
      mockEnabled: config.apis.mockEnabled
    },
    limits: config.limits,
    debug: config.debug
  };
}

/**
 * Liste tous les environnements disponibles
 */
export function listEnvironments() {
  return Object.entries(environmentConfigs).map(([key, config]) => ({
    id: key,
    name: config.name,
    emoji: config.emoji,
    description: config.description,
    isCurrent: key === currentEnvironment
  }));
}

// ============ PROTECTION ============

/**
 * Vérifie si une action est autorisée dans l'environnement actuel
 */
export function canPerformAction(action) {
  const config = getConfig();

  const restrictedActions = {
    'publish_real': config.social.enabled && !config.social.mockResponses,
    'send_whatsapp': config.notifications.whatsapp,
    'send_email': config.notifications.email,
    'send_sms': config.notifications.sms,
    'charge_payment': !config.payments.stripe.testMode,
    'delete_data': !isProduction(),  // Jamais de delete en prod via Halimah
    'modify_production_db': isProduction(),
    'generate_image': config.apis.dalleEnabled,
    'web_search': config.apis.tavilyEnabled
  };

  return restrictedActions[action] ?? true;
}

/**
 * Wrapper de sécurité pour actions sensibles
 */
export function requireEnvironment(requiredEnv, action) {
  if (currentEnvironment !== requiredEnv) {
    throw new Error(
      `Action "${action}" requiert l'environnement ${requiredEnv}, ` +
      `mais l'environnement actuel est ${currentEnvironment}`
    );
  }
  return true;
}

/**
 * Confirme avant action en production
 */
export function confirmProductionAction(action) {
  if (!isProduction()) return true;

  console.warn(`[ENV] ⚠️  ACTION PRODUCTION: ${action}`);
  console.warn(`[ENV]    Environnement: ${currentEnvironment}`);
  console.warn(`[ENV]    Cette action affectera les vraies données !`);

  // En mode non-interactif, on bloque
  // L'approbation doit venir de Halimah Pro via un outil dédié
  return false;
}

export default {
  Environments,
  getCurrentEnvironment,
  getConfig,
  getConfigValue,
  setEnvironment,
  isProduction,
  isDevelopment,
  isStaging,
  isFeatureEnabled,
  getEnvironmentInfo,
  listEnvironments,
  canPerformAction,
  requireEnvironment,
  confirmProductionAction
};
