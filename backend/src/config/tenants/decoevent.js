/**
 * Configuration tenant : Deco Event
 * Structure identique à fatshairafro.js — valeurs à configurer lors de l'onboarding
 */

const tenant = {
  // === IDENTITÉ ===
  id: 'decoevent',
  name: 'Deco Event',
  domain: 'decoevent.fr',
  assistantName: 'Nexus',          // À CONFIGURER
  gerante: '',                     // À CONFIGURER
  adresse: '',                     // À CONFIGURER
  telephone: '',                   // À CONFIGURER
  telephoneTwilio: '',             // À CONFIGURER
  concept: 'Décoration événementielle',  // À CONFIGURER
  peutRecevoirChezElle: false,
  secteur: 'Décoration événementielle',
  ville: '',                       // À CONFIGURER

  // === SERVICES ===
  services: {
    // À CONFIGURER lors de l'onboarding
  },

  // === FRAIS DE DÉPLACEMENT ===
  travelFees: {
    BASE_DISTANCE_KM: 0,          // À CONFIGURER
    BASE_FEE: 0,
    BASE_FEE_CENTS: 0,
    PER_KM_BEYOND: 0,
    PER_KM_BEYOND_CENTS: 0,
  },

  // === HORAIRES ===
  businessHours: {
    0: null,                       // À CONFIGURER
    1: { open: '09:00', close: '18:00' },
    2: { open: '09:00', close: '18:00' },
    3: { open: '09:00', close: '18:00' },
    4: { open: '09:00', close: '18:00' },
    5: { open: '09:00', close: '18:00' },
    6: null,
  },
  daysOpen: [1, 2, 3, 4, 5],

  // === RÈGLES DE RÉSERVATION ===
  bookingRules: {
    MIN_ADVANCE_HOURS: 24,         // À CONFIGURER
    MAX_ADVANCE_DAYS: 60,
    DEPOSIT_PERCENT: 30,
    FREE_CANCELLATION_HOURS: 48,
    FULL_DAY_START_HOUR: 9,
    FULL_DAY_START_TIME: '09:00',
  },

  // === OPTIONS DE SERVICE ===
  serviceOptions: {
    DOMICILE_ENABLED: false,
    DOMICILE_DISABLED_MESSAGE: '',
  },

  // === STATUTS BLOQUANTS ===
  blockingStatuts: ['demande', 'confirme', 'en_attente', 'en_attente_paiement'],

  // === TERMES AMBIGUS ===
  ambiguousTerms: {},

  // === PERSONNALITÉ DE L'ASSISTANT ===
  personality: {
    tutoiement: false,             // À CONFIGURER
    ton: 'chaleureux',
    emojis: 'moderation',
    description: '',               // À CONFIGURER
  },

  // === HORAIRES FORMATÉS (pour le prompt) ===
  horairesTexte: '',               // À CONFIGURER

  // === PROTECTION ===
  frozen: false,
  lastStableDate: null,
  nexusVersion: '1.1.0-beta',

  // === FEATURES ===
  features: {
    reservations: true,
    reservations_web: true,
    reservations_admin: true,
    reservations_telephone: false,
    reservations_chat: false,
    reservations_whatsapp: false,
    services_variables: false,
    services_domicile: false,
    sms_confirmation: false,
    sms_rappel_j1: false,
    sms_remerciement: false,
    assistant_telephone: false,
    assistant_chat: false,
    dashboard_admin: true,
    dashboard_stats: false,
    accounting: true,
    commerce_catalogue: false,
    commerce_stock: false,
    commerce_ventes: false,
    marketing: false,
    seo: false,
    rh: false,
    sentinel_client: false,
  },

  // === LIMITES ===
  limits: {
    maxReservationsPerDay: 50,
    maxSmsPerMonth: 100,
    maxAiCallsPerDay: 50,
  },
};

export default tenant;
