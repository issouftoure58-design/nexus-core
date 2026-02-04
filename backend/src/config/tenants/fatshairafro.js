/**
 * Configuration tenant : Fat's Hair-Afro
 * Extraite de businessRules.js et nexusCore.js (SALON_INFO)
 *
 * Ce fichier contient TOUTE la config métier spécifique à ce tenant.
 * businessRules.js reste intact comme backup.
 */

const tenant = {
  // === IDENTITÉ ===
  id: 'fatshairafro',
  name: "Fat's Hair-Afro",
  domain: 'fatshairafro.fr',
  assistantName: 'Halimah',
  gerante: 'Fatou',
  adresse: '8 rue des Monts Rouges, 95130 Franconville',
  telephone: '07 82 23 50 20',
  telephoneTwilio: '09 39 24 02 69',
  concept: 'Coiffure afro à domicile ou chez Fatou',
  peutRecevoirChezElle: true,
  secteur: 'Coiffure afro',
  ville: 'Franconville',

  // === BRANDING ===
  branding: {
    logoUrl: '/logo/logo-icon.svg',
    faviconUrl: '/favicon-32x32.png',
    primaryColor: '#f59e0b',
    accentColor: '#ea580c',
  },

  // === SERVICES ===
  services: {
    // LOCKS
    CREATION_CROCHET_LOCKS: {
      id: 'creation_crochet_locks',
      name: 'Création crochet locks',
      category: 'locks',
      price: 200,
      priceInCents: 20000,
      priceIsMinimum: false,
      durationMinutes: 480,
      blocksFullDay: true,
      blocksDays: 1,
    },
    CREATION_MICROLOCKS_CROCHET: {
      id: 'creation_microlocks_crochet',
      name: 'Création microlocks crochet',
      category: 'locks',
      price: 300,
      priceInCents: 30000,
      priceIsMinimum: true,
      durationMinutes: 960,
      blocksFullDay: true,
      blocksDays: 2,
    },
    CREATION_MICROLOCKS_TWIST: {
      id: 'creation_microlocks_twist',
      name: 'Création microlocks twist',
      category: 'locks',
      price: 150,
      priceInCents: 15000,
      priceIsMinimum: true,
      durationMinutes: 480,
      blocksFullDay: true,
      blocksDays: 1,
    },
    REPRISE_RACINES_LOCKS: {
      id: 'reprise_racines_locks',
      name: 'Reprise racines locks',
      category: 'locks',
      price: 50,
      priceInCents: 5000,
      priceIsMinimum: false,
      durationMinutes: 120,
      blocksFullDay: false,
      blocksDays: 1,
    },
    REPRISE_RACINES_MICROLOCKS: {
      id: 'reprise_racines_microlocks',
      name: 'Reprise racines micro-locks',
      category: 'locks',
      price: 100,
      priceInCents: 10000,
      priceIsMinimum: false,
      durationMinutes: 240,
      blocksFullDay: false,
      blocksDays: 1,
    },
    DECAPAGE_LOCKS: {
      id: 'decapage_locks',
      name: 'Décapage locks',
      category: 'locks',
      price: 35,
      priceInCents: 3500,
      priceIsMinimum: false,
      durationMinutes: 60,
      blocksFullDay: false,
      blocksDays: 1,
    },

    // SOINS
    SOIN_COMPLET: {
      id: 'soin_complet',
      name: 'Soin complet',
      category: 'soins',
      price: 50,
      priceInCents: 5000,
      priceIsMinimum: false,
      durationMinutes: 60,
      blocksFullDay: false,
      blocksDays: 1,
    },
    SOIN_HYDRATANT: {
      id: 'soin_hydratant',
      name: 'Soin hydratant',
      category: 'soins',
      price: 40,
      priceInCents: 4000,
      priceIsMinimum: false,
      durationMinutes: 60,
      blocksFullDay: false,
      blocksDays: 1,
    },
    SHAMPOING: {
      id: 'shampoing',
      name: 'Shampoing',
      category: 'soins',
      price: 10,
      priceInCents: 1000,
      priceIsMinimum: false,
      durationMinutes: 30,
      blocksFullDay: false,
      blocksDays: 1,
    },

    // TRESSES & BRAIDS
    NATTES_COLLEES_CORNROW: {
      id: 'nattes_collees_cornrow',
      name: 'Nattes collées cornrow',
      category: 'tresses',
      price: 20,
      priceInCents: 2000,
      priceIsMinimum: true,
      durationMinutes: 60,
      blocksFullDay: false,
      blocksDays: 1,
    },
    NATTES_COLLEES_STITCH_BRAID: {
      id: 'nattes_collees_stitch_braid',
      name: 'Nattes collées stitch braid',
      category: 'tresses',
      price: 50,
      priceInCents: 5000,
      priceIsMinimum: false,
      durationMinutes: 120,
      blocksFullDay: false,
      blocksDays: 1,
    },
    BOX_BRAIDS: {
      id: 'box_braids',
      name: 'Box Braids',
      category: 'tresses',
      price: 50,
      priceInCents: 5000,
      priceIsMinimum: true,
      durationMinutes: 300,
      blocksFullDay: false,
      blocksDays: 1,
    },
    BRAIDS_SIMPLES: {
      id: 'braids_simples',
      name: 'Braids simples',
      category: 'tresses',
      price: 40,
      priceInCents: 4000,
      priceIsMinimum: false,
      durationMinutes: 120,
      blocksFullDay: false,
      blocksDays: 1,
    },
    CHIGNON: {
      id: 'chignon',
      name: 'Chignon',
      category: 'tresses',
      price: 50,
      priceInCents: 5000,
      priceIsMinimum: false,
      durationMinutes: 60,
      blocksFullDay: false,
      blocksDays: 1,
    },
    CROCHET_BRAIDS_NATURELLES: {
      id: 'crochet_braids_naturelles',
      name: 'Crochet Braids Naturelles',
      category: 'tresses',
      price: 60,
      priceInCents: 6000,
      priceIsMinimum: true,
      durationMinutes: 180,
      blocksFullDay: false,
      blocksDays: 1,
    },
    FULANI_BRAIDS: {
      id: 'fulani_braids',
      name: 'Fulani Braids',
      category: 'tresses',
      price: 70,
      priceInCents: 7000,
      priceIsMinimum: true,
      durationMinutes: 300,
      blocksFullDay: false,
      blocksDays: 1,
    },
    BOHEMIAN_FULANI: {
      id: 'bohemian_fulani',
      name: 'Bohemian Fulani',
      category: 'tresses',
      price: 60,
      priceInCents: 6000,
      priceIsMinimum: false,
      durationMinutes: 300,
      blocksFullDay: false,
      blocksDays: 1,
    },
    SENEGALESE_TWISTS: {
      id: 'senegalese_twists',
      name: 'Senegalese Twists',
      category: 'tresses',
      price: 80,
      priceInCents: 8000,
      priceIsMinimum: false,
      durationMinutes: 300,
      blocksFullDay: false,
      blocksDays: 1,
    },
    PASSION_TWIST: {
      id: 'passion_twist',
      name: 'Passion Twist',
      category: 'tresses',
      price: 80,
      priceInCents: 8000,
      priceIsMinimum: false,
      durationMinutes: 300,
      blocksFullDay: false,
      blocksDays: 1,
    },
    BOHO_BRAIDS: {
      id: 'boho_braids',
      name: 'Boho Braids',
      category: 'tresses',
      price: 70,
      priceInCents: 7000,
      priceIsMinimum: true,
      durationMinutes: 300,
      blocksFullDay: false,
      blocksDays: 1,
    },
    DEPART_LOCKS_VANILLE: {
      id: 'depart_locks_vanille',
      name: 'Départ Locks Vanille',
      category: 'tresses',
      price: 80,
      priceInCents: 8000,
      priceIsMinimum: true,
      durationMinutes: 240,
      blocksFullDay: false,
      blocksDays: 1,
    },
    REPARATION_LOCKS: {
      id: 'reparation_locks',
      name: 'Réparation Locks',
      category: 'tresses',
      price: 10,
      priceInCents: 1000,
      priceIsMinimum: false,
      pricePerUnit: true,
      unitName: 'lock',
      durationMinutes: 30,
      durationPerUnit: true,
      blocksFullDay: false,
      blocksDays: 1,
      specialInstructions: "Demander combien de locks à réparer. Prix = nombre × 10€. Durée = nombre × 30min. Note: Prix sous réserve du nombre exact.",
    },

    // COLORATION & BRUSHING
    TEINTURE_SANS_AMMONIAQUE: {
      id: 'teinture_sans_ammoniaque',
      name: 'Teinture sans ammoniaque',
      category: 'coloration',
      price: 40,
      priceInCents: 4000,
      priceIsMinimum: false,
      durationMinutes: 40,
      blocksFullDay: false,
      blocksDays: 1,
    },
    DECOLORATION: {
      id: 'decoloration',
      name: 'Décoloration',
      category: 'coloration',
      price: 20,
      priceInCents: 2000,
      priceIsMinimum: false,
      durationMinutes: 10,
      blocksFullDay: false,
      blocksDays: 1,
    },
    BRUSHING_AFRO: {
      id: 'brushing_afro',
      name: 'Brushing cheveux afro',
      category: 'coloration',
      price: 20,
      priceInCents: 2000,
      priceIsMinimum: false,
      durationMinutes: 60,
      blocksFullDay: false,
      blocksDays: 1,
    },
  },

  // === FRAIS DE DÉPLACEMENT ===
  travelFees: {
    BASE_DISTANCE_KM: 8,
    BASE_FEE: 10,
    BASE_FEE_CENTS: 1000,
    PER_KM_BEYOND: 1.10,
    PER_KM_BEYOND_CENTS: 110,
  },

  // === HORAIRES ===
  businessHours: {
    // 0 = Dimanche
    0: null,
    1: { open: '09:00', close: '18:00' }, // Lundi
    2: { open: '09:00', close: '18:00' }, // Mardi
    3: { open: '09:00', close: '18:00' }, // Mercredi
    4: { open: '09:00', close: '13:00' }, // Jeudi (demi-journée)
    5: { open: '13:00', close: '18:00' }, // Vendredi (après-midi)
    6: { open: '09:00', close: '18:00' }, // Samedi
  },
  daysOpen: [1, 2, 3, 4, 5, 6],

  // === RÈGLES DE RÉSERVATION ===
  bookingRules: {
    MIN_ADVANCE_HOURS: 24,
    MAX_ADVANCE_DAYS: 60,
    DEPOSIT_PERCENT: 30,
    FREE_CANCELLATION_HOURS: 48,
    FULL_DAY_START_HOUR: 9,
    FULL_DAY_START_TIME: '09:00',
  },

  // === OPTIONS DE SERVICE ===
  serviceOptions: {
    DOMICILE_ENABLED: false,
    DOMICILE_DISABLED_MESSAGE: "Actuellement, je ne me déplace pas à domicile. Les prestations se font uniquement chez moi à Franconville. Souhaitez-vous réserver chez moi ?",
  },

  // === STATUTS BLOQUANTS ===
  blockingStatuts: ['demande', 'confirme', 'en_attente', 'en_attente_paiement'],

  // === TERMES AMBIGUS ===
  ambiguousTerms: {
    'locks': {
      message: "Pour les locks, vous souhaitez :\n- Une création de locks (200€, journée entière)\n- Une reprise de racines (50€, 2h)\n- Un décapage (35€, 1h) ?",
      options: ['création crochet locks', 'reprise racines locks', 'décapage locks'],
      services: ['CREATION_CROCHET_LOCKS', 'REPRISE_RACINES_LOCKS', 'DECAPAGE_LOCKS'],
    },
    'microlocks': {
      message: "Pour les microlocks, vous souhaitez :\n- Une création au crochet (300€+, 2 jours)\n- Une création twist (150€+, journée)\n- Une reprise de racines (100€, 4h) ?",
      options: ['création microlocks crochet', 'création microlocks twist', 'reprise racines microlocks'],
      services: ['CREATION_MICROLOCKS_CROCHET', 'CREATION_MICROLOCKS_TWIST', 'REPRISE_RACINES_MICROLOCKS'],
    },
    'tresses': {
      message: "Pour les tresses, vous souhaitez :\n- Des braids (60€+)\n- Des nattes collées sans rajout (20€+)\n- Des nattes collées avec rajout (40€+) ?",
      options: ['braids', 'nattes collées sans rajout', 'nattes collées avec rajout'],
      services: ['BRAIDS', 'NATTES_COLLEES_SANS_RAJOUT', 'NATTES_COLLEES_AVEC_RAJOUT'],
    },
  },

  // === PERSONNALITÉ DE L'ASSISTANT ===
  personality: {
    tutoiement: false, // Vouvoiement
    ton: 'chaleureux',
    emojis: 'moderation',
    description: 'Chaleureuse, professionnelle, efficace',
  },

  // === HORAIRES FORMATÉS (pour le prompt) ===
  horairesTexte: `• Lundi : 9h - 18h
• Mardi : 9h - 18h
• Mercredi : 9h - 18h
• Jeudi : 9h - 13h (demi-journée)
• Vendredi : 13h - 18h (après-midi)
• Samedi : 9h - 18h
• Dimanche : Fatou ne travaille pas`,

  // === PROTECTION PRODUCTION ===
  frozen: true,
  lastStableDate: '2026-01-31',
  nexusVersion: '1.0.0',

  // === FEATURES ACTIVES (validées en prod) ===
  features: {
    reservations: true,
    reservations_web: true,
    reservations_telephone: true,
    reservations_chat: true,
    reservations_whatsapp: true,
    reservations_admin: true,
    services_variables: true,
    services_domicile: true,
    sms_confirmation: true,
    sms_rappel_j1: true,
    sms_remerciement: true,
    assistant_telephone: true,
    assistant_chat: true,
    dashboard_admin: true,
    dashboard_stats: true,
    accounting: false,
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
    maxReservationsPerDay: 20,
    maxSmsPerMonth: 500,
    maxAiCallsPerDay: 100,
  },
};

export default tenant;
