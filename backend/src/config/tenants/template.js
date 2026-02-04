/**
 * TEMPLATE NOUVEAU TENANT - NEXUS
 *
 * Pour créer un nouveau tenant :
 * 1. Copier ce fichier vers [tenant-id].js
 * 2. Remplir TOUTES les sections marquées "À CONFIGURER"
 * 3. Ajouter l'import dans index.js
 * 4. Tester avec le header X-Tenant-ID
 * 5. Valider : node scripts/validate-tenant.mjs [tenant-id]
 */

const tenant = {
  // ===== IDENTIFICATION =====
  id: '',                            // À CONFIGURER: slug unique (ex: 'monbusiness')
  name: '',                          // À CONFIGURER: nom commercial affiché
  domain: '',                        // À CONFIGURER: domaine principal (ex: 'monbusiness.fr')
  plan: 'starter',                   // starter | pro | business

  // ===== ASSISTANT IA =====
  assistantName: 'Nexus',            // À CONFIGURER: prénom de l'assistant (ex: 'Halimah')
  gerante: '',                       // À CONFIGURER: prénom du/de la gérant(e)

  // ===== CONTACT =====
  telephone: '',                     // À CONFIGURER: téléphone principal
  telephoneTwilio: '',               // À CONFIGURER: numéro Twilio (si activé)

  // ===== ADRESSE =====
  adresse: '',                       // À CONFIGURER: adresse complète (ex: '8 rue X, 95130 Ville')
  ville: '',                         // À CONFIGURER: ville principale

  // ===== ACTIVITÉ =====
  concept: '',                       // À CONFIGURER: description courte (ex: 'Coiffure afro à domicile')
  secteur: '',                       // À CONFIGURER: secteur d'activité
  peutRecevoirChezElle: false,       // Reçoit sur place ?

  // ===== SERVICES =====
  // Clé = identifiant MAJUSCULE, valeur = objet service
  services: {
    // EXEMPLE_SERVICE: {
    //   id: 'exemple_service',       // slug unique
    //   name: 'Nom du service',      // nom affiché
    //   category: 'categorie',       // catégorie (pour regroupement)
    //   price: 50,                   // prix en euros
    //   priceInCents: 5000,          // prix en centimes
    //   priceIsMinimum: false,       // true = "à partir de"
    //   durationMinutes: 60,         // durée en minutes
    //   blocksFullDay: false,        // bloque la journée entière ?
    //   blocksDays: 1,               // nombre de jours bloqués
    // },
  },

  // ===== FRAIS DE DÉPLACEMENT =====
  travelFees: {
    BASE_DISTANCE_KM: 0,             // À CONFIGURER: distance incluse (km)
    BASE_FEE: 0,                     // À CONFIGURER: frais de base (€)
    BASE_FEE_CENTS: 0,               // Idem en centimes
    PER_KM_BEYOND: 0,                // À CONFIGURER: €/km au-delà
    PER_KM_BEYOND_CENTS: 0,          // Idem en centimes
  },

  // ===== HORAIRES =====
  // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
  // null = fermé, { open: 'HH:MM', close: 'HH:MM' } = ouvert
  businessHours: {
    0: null,                          // Dimanche
    1: { open: '09:00', close: '18:00' },  // Lundi - À CONFIGURER
    2: { open: '09:00', close: '18:00' },  // Mardi - À CONFIGURER
    3: { open: '09:00', close: '18:00' },  // Mercredi - À CONFIGURER
    4: { open: '09:00', close: '18:00' },  // Jeudi - À CONFIGURER
    5: { open: '09:00', close: '18:00' },  // Vendredi - À CONFIGURER
    6: null,                          // Samedi - À CONFIGURER
  },
  daysOpen: [1, 2, 3, 4, 5],         // À CONFIGURER: jours ouverts (0-6)

  // ===== RÈGLES DE RÉSERVATION =====
  bookingRules: {
    MIN_ADVANCE_HOURS: 24,            // Heures minimum avant RDV
    MAX_ADVANCE_DAYS: 60,             // Jours maximum à l'avance
    DEPOSIT_PERCENT: 30,              // % acompte
    FREE_CANCELLATION_HOURS: 48,      // Heures pour annulation gratuite
    FULL_DAY_START_HOUR: 9,           // Heure début journée complète
    FULL_DAY_START_TIME: '09:00',     // Idem format string
  },

  // ===== OPTIONS DE SERVICE =====
  serviceOptions: {
    DOMICILE_ENABLED: false,          // Service à domicile ?
    DOMICILE_DISABLED_MESSAGE: '',    // Message si domicile désactivé
  },

  // ===== STATUTS BLOQUANTS =====
  blockingStatuts: ['demande', 'confirme', 'en_attente', 'en_attente_paiement'],

  // ===== TERMES AMBIGUS =====
  // Quand le client dit un mot vague, proposer les options
  ambiguousTerms: {
    // 'mot_vague': {
    //   message: "Vous souhaitez :\n- Option A\n- Option B ?",
    //   options: ['option a', 'option b'],
    //   services: ['SERVICE_A', 'SERVICE_B'],
    // },
  },

  // ===== PERSONNALITÉ DE L'ASSISTANT =====
  personality: {
    tutoiement: false,                // false = vouvoiement
    ton: 'chaleureux',                // 'formel' | 'chaleureux' | 'decontracte'
    emojis: 'moderation',             // 'oui' | 'non' | 'moderation'
    description: '',                  // À CONFIGURER: description du ton
  },

  // ===== NOTIFICATIONS =====
  notifications: {
    sms: false,                       // SMS activé ?
    email: false,                     // Email activé ?
    reminder24h: true,                // Rappel 24h avant
    reminder2h: false,                // Rappel 2h avant
  },

  // ===== PAIEMENT =====
  payment: {
    methods: ['sur_place'],           // sur_place | carte | virement
    stripeEnabled: false,
    stripeAccountId: null,            // À CONFIGURER si Stripe activé
  },

  // ===== MESSAGES PERSONNALISÉS =====
  messages: {
    welcome: '',                      // À CONFIGURER: message d'accueil
    closed: '',                       // Message quand fermé
    noAvailability: '',               // Message quand pas de dispo
  },

  // ===== HORAIRES FORMATÉS (pour le prompt IA) =====
  horairesTexte: '',                  // À CONFIGURER: texte lisible des horaires

  // ===== META =====
  meta: {
    createdAt: null,                  // Date création (remplir à l'onboarding)
    updatedAt: null,                  // Date mise à jour
    status: 'draft',                  // draft | active | suspended
  },
};

export default tenant;
