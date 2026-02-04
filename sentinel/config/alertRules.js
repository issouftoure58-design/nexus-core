/**
 * SENTINEL Alert Rules
 * Regles d'alerting pour les notifications
 */

const alertRules = {
  // Regles par severite
  severity: {
    CRITICAL: {
      email: true,
      sms: true,
      slack: true,
      dashboard: true,
      description: 'Urgence - Action immediate requise'
    },
    HIGH: {
      email: true,
      sms: false,
      slack: true,
      dashboard: true,
      description: 'Important - Attention requise sous 1h'
    },
    MEDIUM: {
      email: true,
      sms: false,
      slack: false,
      dashboard: true,
      description: 'Modere - Verifier sous 24h'
    },
    LOW: {
      email: false,
      sms: false,
      slack: false,
      dashboard: true,
      description: 'Info - Pour information'
    }
  },

  // Regles par type d'evenement
  events: {
    // Anomalies
    HIGH_ERROR_RATE: {
      severity: 'HIGH',
      cooldown: 30 * 60 * 1000, // 30 minutes
      threshold: 3, // 3x baseline
      message: 'Taux d\'erreurs anormalement eleve detecte'
    },
    HIGH_TOKEN_USAGE: {
      severity: 'MEDIUM',
      cooldown: 60 * 60 * 1000, // 1 heure
      threshold: 2, // 2x baseline
      message: 'Usage tokens au-dessus de la normale'
    },
    HIGH_RESPONSE_TIME: {
      severity: 'MEDIUM',
      cooldown: 30 * 60 * 1000,
      threshold: 3,
      message: 'Temps de reponse degrade'
    },
    PROBLEMATIC_TENANT: {
      severity: 'HIGH',
      cooldown: 15 * 60 * 1000, // 15 minutes
      message: 'Tenant generant des erreurs excessives'
    },

    // Patterns suspects
    SQL_INJECTION_ATTEMPT: {
      severity: 'CRITICAL',
      cooldown: 5 * 60 * 1000, // 5 minutes
      message: 'Tentative d\'injection SQL detectee'
    },
    XSS_ATTEMPT: {
      severity: 'CRITICAL',
      cooldown: 5 * 60 * 1000,
      message: 'Tentative XSS detectee'
    },
    BRUTE_FORCE_AUTH: {
      severity: 'CRITICAL',
      cooldown: 10 * 60 * 1000,
      message: 'Tentative de brute force detectee'
    },
    API_ABUSE: {
      severity: 'HIGH',
      cooldown: 30 * 60 * 1000,
      message: 'Abus API detecte'
    },
    PATH_TRAVERSAL_ATTEMPT: {
      severity: 'CRITICAL',
      cooldown: 5 * 60 * 1000,
      message: 'Tentative de path traversal detectee'
    },

    // Sante systeme
    SERVICE_UNHEALTHY: {
      severity: 'CRITICAL',
      cooldown: 10 * 60 * 1000,
      message: 'Service critique en panne'
    },
    DATABASE_CONNECTION_LOST: {
      severity: 'CRITICAL',
      cooldown: 5 * 60 * 1000,
      message: 'Connexion base de donnees perdue'
    },
    MEMORY_EXHAUSTION: {
      severity: 'HIGH',
      cooldown: 15 * 60 * 1000,
      message: 'Memoire critique'
    },

    // Auto-reparation
    AUTO_REPAIR_SUCCESS: {
      severity: 'LOW',
      cooldown: 60 * 60 * 1000,
      message: 'Auto-reparation reussie'
    },
    AUTO_REPAIR_FAILED: {
      severity: 'HIGH',
      cooldown: 15 * 60 * 1000,
      message: 'Echec auto-reparation'
    },

    // Tests
    TEST_ALERT: {
      severity: 'LOW',
      cooldown: 60 * 1000,
      message: 'Test notification'
    },
    WEEKLY_REPORT: {
      severity: 'LOW',
      cooldown: 0,
      message: 'Rapport hebdomadaire'
    }
  },

  // Seuils de notification
  thresholds: {
    // Ne pas envoyer d'alerte si moins de X occurrences
    minOccurrences: {
      CRITICAL: 1,
      HIGH: 2,
      MEDIUM: 3,
      LOW: 5
    },

    // Max alertes par heure
    maxAlertsPerHour: {
      email: 10,
      sms: 5,
      slack: 20
    }
  },

  // Destinataires par defaut (super_admin)
  recipients: {
    email: process.env.ADMIN_EMAIL || 'admin@nexus.com',
    sms: process.env.ADMIN_PHONE || null,
    slack: process.env.SLACK_WEBHOOK_URL || null
  },

  // Templates de messages
  templates: {
    email: {
      subject: '[SENTINEL] {severity} - {event}',
      body: `
SENTINEL Alert

Severity: {severity}
Event: {event}
Time: {timestamp}

Details:
{details}

Action: {suggestedAction}

---
NEXUS Platform Monitoring
      `.trim()
    },
    sms: {
      body: 'SENTINEL {severity}: {event} - {timestamp}'
    },
    slack: {
      username: 'SENTINEL',
      icon_emoji: ':shield:',
      color: {
        CRITICAL: '#FF0000',
        HIGH: '#FF6600',
        MEDIUM: '#FFCC00',
        LOW: '#00FF00'
      }
    }
  }
};

export { alertRules };
export default alertRules;
