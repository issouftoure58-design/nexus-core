/**
 * SENTINEL - Configuration des seuils d'alerte
 */

export const THRESHOLDS = {
  // Seuils de couts
  daily: {
    warning: 30,      // 30 EUR -> alerte jaune
    critical: 50,     // 50 EUR -> alerte rouge
    shutdown: 100     // 100 EUR -> mode degrade
  },
  monthly: {
    warning: 500,
    critical: 800,
    shutdown: 1000
  },

  // Seuils memoire (en pourcentage)
  memory: {
    warning: 75,
    critical: 90
  },

  // Seuils latence DB (en ms)
  dbLatency: {
    warning: 1000,
    critical: 2000
  },

  // Seuils rate limiting
  rateLimit: {
    perMinute: 20,
    perHour: 200,
    perDay: 1000
  },

  // Seuils erreurs
  errors: {
    perHour: {
      warning: 10,
      critical: 50
    },
    perDay: {
      warning: 100,
      critical: 500
    }
  }
};

export const ALERT_PHONE = '0760537694';

export default THRESHOLDS;
