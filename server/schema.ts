import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  real,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Table des clients
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  nom: text("nom").notNull(),
  prenom: text("prenom"),
  telephone: text("telephone").notNull().unique(),
  email: text("email").unique(),
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
  createdAt: timestamp("created_at").defaultNow().notNull(),

  // Authentification
  passwordHash: text("password_hash"),
  emailVerified: boolean("email_verified").default(false),
  verificationToken: text("verification_token"),
  verificationTokenExpiry: timestamp("verification_token_expiry"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  lastLoginAt: timestamp("last_login_at"),

  // Fidélité
  loyaltyPoints: integer("loyalty_points").default(0),
  totalSpent: integer("total_spent").default(0), // en centimes, pour tracking
});

// Table des services - TARIFS OFFICIELS FAT'S HAIR-AFRO
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  nom: text("nom").notNull(),
  description: text("description"),
  duree: integer("duree").notNull(), // en minutes
  prix: integer("prix"), // en centimes (ex: 5000 = 50€)
  category: text("category").default("autre"), // locks, soins, tresses, coloration
  priceIsMinimum: boolean("price_is_minimum").default(false), // TRUE si "à partir de"
  blocksFullDay: boolean("blocks_full_day").default(false), // TRUE si journée entière
  blocksDays: integer("blocks_days").default(1), // nombre de jours (2 pour microlocks crochet)
  active: boolean("active").default(true),
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
});

// Table des frais de déplacement
export const travelFees = pgTable("travel_fees", {
  id: serial("id").primaryKey(),
  minDistanceKm: integer("min_distance_km").notNull(),
  maxDistanceKm: integer("max_distance_km"), // NULL = pas de limite
  baseFee: integer("base_fee").notNull(), // en centimes
  perKmFee: integer("per_km_fee").default(0), // en centimes
  description: text("description"),
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Table des commandes (panier validé)
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id),

  // Statut
  statut: text("statut").default("en_attente").notNull(), // en_attente, paye, confirme, annule

  // Totaux (centimes)
  sousTotal: integer("sous_total").notNull(),
  fraisDeplacement: integer("frais_deplacement").default(0),
  total: integer("total").notNull(),

  // Paiement
  paiementMethode: text("paiement_methode"), // stripe, paypal, sur_place
  paiementStatut: text("paiement_statut").default("en_attente"), // en_attente, paye, echoue, rembourse
  paiementId: text("paiement_id"), // Stripe PaymentIntent ID ou PayPal Order ID
  paiementDate: timestamp("paiement_date"),

  // Lieu
  lieu: text("lieu").notNull(), // domicile, chez_fatou
  adresseClient: text("adresse_client"),
  distanceKm: real("distance_km"),
  dureeTrajetMinutes: integer("duree_trajet_minutes"),

  // Date/Heure
  dateRdv: text("date_rdv").notNull(), // YYYY-MM-DD
  heureDebut: text("heure_debut").notNull(), // HH:MM

  // Client (snapshot au moment de la commande)
  clientNom: text("client_nom").notNull(),
  clientPrenom: text("client_prenom"),
  clientTelephone: text("client_telephone").notNull(),
  clientEmail: text("client_email"),

  notes: text("notes"),
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Table des articles de commande
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .references(() => orders.id)
    .notNull(),

  serviceNom: text("service_nom").notNull(),
  serviceDescription: text("service_description"),
  dureeMinutes: integer("duree_minutes").notNull(),
  prix: integer("prix").notNull(), // en centimes

  // Lien vers la réservation créée après paiement
  reservationId: integer("reservation_id"),

  // Position dans la commande (pour l'ordre des services)
  ordre: integer("ordre").default(0),

  tenantId: text("tenant_id").notNull().default("fatshairafro"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Table des réservations (anciennement rendezvous)
export const reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .references(() => clients.id)
    .notNull(),
  serviceId: integer("service_id").references(() => services.id),
  serviceNom: text("service_nom").notNull(), // Pour les cas où le service n'est pas dans la table
  date: text("date").notNull(), // Format: YYYY-MM-DD
  heure: text("heure").notNull(), // Format: HH:MM
  statut: text("statut").notNull().default("demande"), // demande, confirme, termine, annule
  notes: text("notes"),
  adresseClient: text("adresse_client"), // Adresse du client pour le service à domicile

  // Lien vers la commande (si créé via panier)
  orderId: integer("order_id").references(() => orders.id),

  // Informations tarification (service à domicile)
  dureeMinutes: integer("duree_minutes"), // Durée du service en minutes
  prixService: integer("prix_service"), // Prix du service en centimes
  distanceKm: real("distance_km"), // Distance en km depuis Franconville
  dureeTrajetMinutes: integer("duree_trajet_minutes"), // Temps de trajet en minutes
  fraisDeplacement: integer("frais_deplacement"), // Frais de déplacement en centimes
  prixTotal: integer("prix_total"), // Prix total (service + frais) en centimes

  // Métadonnées
  telephone: text("telephone"), // Numéro du client (copie pour référence directe)
  createdVia: text("created_via").default("web"), // Source: 'web', 'whatsapp', 'admin'

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  // Notification tracking - WhatsApp
  whatsappConfirmationSent: boolean("whatsapp_confirmation_sent").default(false),
  whatsappConfirmationDate: timestamp("whatsapp_confirmation_date"),
  whatsappRappelSent: boolean("whatsapp_rappel_sent").default(false),
  whatsappRappelDate: timestamp("whatsapp_rappel_date"),

  // Notification tracking - Post-RDV
  remerciementEnvoye: boolean("remerciement_envoye").default(false),
  remerciementDate: timestamp("remerciement_date"),
  demandeAvisEnvoyee: boolean("demande_avis_envoyee").default(false),
  demandeAvisDate: timestamp("demande_avis_date"),
  avisToken: text("avis_token"),

  // Notification tracking - Email
  emailConfirmationSent: boolean("email_confirmation_sent").default(false),
  emailRappelSent: boolean("email_rappel_sent").default(false),

  // Points de fidélité accordés pour ce RDV
  loyaltyPointsEarned: integer("loyalty_points_earned").default(0),
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
});

// Table des transactions de fidélité
export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .references(() => clients.id)
    .notNull(),
  type: text("type").notNull(), // 'earn', 'redeem', 'bonus', 'expire'
  points: integer("points").notNull(), // positif pour gain, négatif pour utilisation
  description: text("description"), // "RDV du 15/01/2026 - Braids" ou "Récompense: Shampoing gratuit"
  reservationId: integer("reservation_id").references(() => reservations.id),
  rewardId: integer("reward_id"), // référence vers loyaltyRewards
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Table des récompenses fidélité disponibles
export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: serial("id").primaryKey(),
  nom: text("nom").notNull(), // "Shampoing gratuit"
  description: text("description"),
  pointsRequired: integer("points_required").notNull(), // 500 points
  serviceId: integer("service_id").references(() => services.id), // Si lié à un service
  reductionAmount: integer("reduction_amount"), // Montant en centimes si réduction
  isActive: boolean("is_active").default(true),
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Table des sessions client (pour refresh tokens)
export const clientSessions = pgTable("client_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .references(() => clients.id)
    .notNull(),
  refreshToken: text("refresh_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Schémas de validation
export const insertClientSchema = createInsertSchema(clients);
export const insertServiceSchema = createInsertSchema(services);
export const insertReservationSchema = createInsertSchema(reservations);
export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactions);
export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewards);
export const insertClientSessionSchema = createInsertSchema(clientSessions);
export const insertOrderSchema = createInsertSchema(orders);
export const insertOrderItemSchema = createInsertSchema(orderItems);

// Alias pour compatibilité
export const insertRendezVousSchema = insertReservationSchema;
export const rendezvous = reservations;

// Types TypeScript
export type Client = typeof clients.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type ClientSession = typeof clientSessions.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;
export type InsertService = typeof services.$inferInsert;
export type InsertReservation = typeof reservations.$inferInsert;
export type InsertLoyaltyTransaction = typeof loyaltyTransactions.$inferInsert;
export type InsertLoyaltyReward = typeof loyaltyRewards.$inferInsert;
export type InsertClientSession = typeof clientSessions.$inferInsert;
export type InsertOrder = typeof orders.$inferInsert;
export type InsertOrderItem = typeof orderItems.$inferInsert;

// Alias pour compatibilité
export type RendezVous = Reservation;
export type InsertRendezVous = InsertReservation;

// ============================================================
// === HALIMAH PRO - MÉMOIRE ET AGENT ===
// ============================================================

// Table de mémoire des conversations Halimah Pro
export const halimahMemory = pgTable("halimah_memory", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(), // Pour regrouper les conversations
  role: text("role").notNull(), // 'user' ou 'assistant'
  content: text("content").notNull(),
  attachments: text("attachments"), // JSON stringifié
  toolCalls: text("tool_calls"), // JSON stringifié des outils utilisés
  metadata: text("metadata"), // JSON stringifié (contexte additionnel)
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Table des faits mémorisés par Halimah
export const halimahFacts = pgTable("halimah_facts", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // 'preference', 'decision', 'info', 'reminder'
  fact: text("fact").notNull(), // Le fait mémorisé
  sourceMessageId: integer("source_message_id").references(() => halimahMemory.id),
  confidence: real("confidence").default(1.0), // 0-1
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // Nullable, pour les rappels temporaires
  isActive: boolean("is_active").default(true),
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
});

// Table des tâches autonomes Halimah
export const halimahTasks = pgTable("halimah_tasks", {
  id: serial("id").primaryKey(),
  parentTaskId: integer("parent_task_id"), // Pour les sous-tâches
  description: text("description").notNull(),
  status: text("status").default("pending").notNull(), // pending, running, completed, failed, cancelled
  steps: text("steps"), // JSON stringifié des étapes planifiées
  currentStep: integer("current_step").default(0),
  result: text("result"), // JSON stringifié du résultat
  error: text("error"),
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Schémas de validation Halimah
export const insertHalimahMemorySchema = createInsertSchema(halimahMemory);
export const insertHalimahFactSchema = createInsertSchema(halimahFacts);
export const insertHalimahTaskSchema = createInsertSchema(halimahTasks);

// Table des avis clients
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id),
  reservationId: integer("reservation_id").references(() => reservations.id),
  clientPrenom: text("client_prenom").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  status: text("status").notNull().default("pending"),
  tenantId: text("tenant_id").notNull().default("fatshairafro"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
});

export const insertReviewSchema = createInsertSchema(reviews);
export type Review = typeof reviews.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;

// Types TypeScript Halimah
export type HalimahMemory = typeof halimahMemory.$inferSelect;
export type HalimahFact = typeof halimahFacts.$inferSelect;
export type HalimahTask = typeof halimahTasks.$inferSelect;
export type InsertHalimahMemory = typeof halimahMemory.$inferInsert;
export type InsertHalimahFact = typeof halimahFacts.$inferInsert;
export type InsertHalimahTask = typeof halimahTasks.$inferInsert;
