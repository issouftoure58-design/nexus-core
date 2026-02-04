import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { authenticateAdmin } from './adminAuth.js';
// 🔧 TOOLS REGISTRY - Source unique des outils
import { TOOLS_ADMIN } from '../tools/toolsRegistry.js';
import {
  getStats, getRdv, updateRdv, sendMessage, getClientInfo, searchClients,
  // SEO
  seoAnalyze, seoKeywords, seoMetaGenerate,
  // Marketing
  marketingCampaign, marketingPromo, marketingEmail, marketingSms,
  // Stratégie
  strategieAnalyze, strategiePricing, strategieObjectifs, strategieRapport,
  // Commercial
  commercialDevis, commercialVentes, commercialRelances, commercialPerformance,
  // Comptabilité
  comptableFacturation, comptableDepenses, comptableTresorerie, comptableFiscal, comptableRapport,
  // RH
  rhPlanning, rhTempsTravail, rhConges, rhObjectifs, rhFormation, rhBienEtre
} from '../services/halimahProService.js';
// Réseaux sociaux
import {
  publishToSocialMedia,
  schedulePost,
  getScheduledPosts,
  cancelScheduledPost,
  generateSocialContent,
  getAvailablePlatforms,
  getPlatformStatus
} from '../services/socialMediaService.js';
// Création de contenu
import { generateImage } from '../tools/halimahPro/generateImage.js';
import { generateCaption } from '../tools/halimahPro/generateCaption.js';
// Mémoire persistante (ancien système - gardé pour compatibilité)
import {
  saveMessage,
  loadHistory,
  extractAndSaveFacts
} from '../services/memoryService.js';
// Mémoire évolutive (nouveau système)
import {
  remember as memoryRemember,
  recall as memoryRecall,
  recallAll as memoryRecallAll,
  search as memorySearch,
  learnFromFeedback,
  learnClientPreference,
  learnAdminPreference,
  learnBusinessFact,
  recordLearning,
  createInsight,
  getPendingInsights,
  markInsightActioned,
  forget as memoryForget,
  forgetByKey,
  buildMemoryContext,
  formatMemoryContextForPrompt,
  getMemoryStats
} from '../services/halimahMemory.js';
// Système de fichiers
import {
  listFiles,
  readFile,
  writeFile,
  appendFile,
  deleteFile,
  createDirectory,
  searchFiles,
  copyFile,
  moveFile,
  getWorkspaceStats
} from '../services/fileSystemService.js';
// Google Drive
import {
  isConfigured as gdriveIsConfigured,
  isConnected as gdriveIsConnected,
  getStatus as gdriveGetStatus,
  listFiles as gdriveListFiles,
  searchFiles as gdriveSearchFiles,
  readFile as gdriveReadFile,
  createFile as gdriveCreateFile,
  updateFile as gdriveUpdateFile,
  deleteFile as gdriveDeleteFile,
  createFolder as gdriveCreateFolder,
  downloadFile as gdriveDownloadFile,
  uploadFile as gdriveUploadFile
} from '../services/googleDriveService.js';
// Agent autonome
import {
  createTask,
  getTask,
  cancelTask,
  getPendingTasks,
  analyzeAndPlan,
  formatPlanForDisplay,
  executeTask,
  confirmAndContinue,
  getTaskStats,
  getTaskHistory,
  TASK_STATUS
} from '../services/agentService.js';
// Recherche Web (Tavily)
import {
  rechercheWeb,
  rechercheActualites,
  rechercheEntreprise,
  rechercheTendances
} from '../tools/halimahPro/rechercheWeb.js';
// Queue de tâches et scheduler (Agent autonome 2.0)
import {
  addTask as queueAddTask,
  getPendingTasks as queueGetPendingTasks,
  cancelTask as queueCancelTask,
  cancelRecurringTask,
  getQueueStats,
  TaskTypes,
  parseTimeExpression,
  parseToCronPattern
} from '../services/taskQueue.js';
import {
  schedulePost as schedulerSchedulePost,
  scheduleReminder as schedulerScheduleReminder,
  scheduleFollowup,
  scheduleContent,
  getScheduledJobs
} from '../services/scheduler.js';
// Computer Use (contrôle navigateur)
import ComputerUse from '../services/computerUseController.js';
// Sandbox (environnement de test)
import SandboxController from '../services/sandboxController.js';
// Gestion des environnements (dev, staging, production)
import EnvironmentManager from '../services/environmentManager.js';
import { Environments } from '../config/environments.js';

// Charger les templates de contenu
let contentTemplates = {};
try {
  const templatesPath = path.join(process.cwd(), 'backend/src/data/contentTemplates.json');
  const templatesData = fs.readFileSync(templatesPath, 'utf-8');
  contentTemplates = JSON.parse(templatesData);
} catch (error) {
  console.warn('[HALIMAH PRO] Templates de contenu non chargés:', error.message);
}

const router = express.Router();

// ══════════════════════════════════════════════════════════════════════════════
// FORCE CONSOLE LOG - Assure que les logs apparaissent sur Render
// ══════════════════════════════════════════════════════════════════════════════
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  originalLog('[HALIMAH-PRO]', new Date().toISOString(), ...args);
};
console.error = (...args) => {
  originalError('[HALIMAH-PRO-ERR]', new Date().toISOString(), ...args);
};
console.warn = (...args) => {
  originalWarn('[HALIMAH-PRO-WARN]', new Date().toISOString(), ...args);
};
// ══════════════════════════════════════════════════════════════════════════════

// Debug: vérifier la clé API au chargement du module (sans exposer la clé)
console.log('🚀 MODULE CHARGE - ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✓ configurée' : '✗ manquante');

// === CONFIGURATION MULTER POUR L'UPLOAD DE FICHIERS ===
const UPLOADS_DIR = path.join(process.cwd(), 'client/public/uploads/halimah-pro');

// Créer le répertoire s'il n'existe pas
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('[HALIMAH PRO] 📁 Répertoire uploads créé:', UPLOADS_DIR);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// Initialisation paresseuse du client Anthropic
let anthropicClient = null;

function getAnthropicClient() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropicClient;
}


// 🔧 TOOLS - Importés depuis toolsRegistry.js (suppression de ~2000 lignes de définitions dupliquées)
const tools = TOOLS_ADMIN;

// Système de prompt pour Halimah Pro
const systemPrompt = `Tu es Halimah Pro, l'assistante IA personnelle de Fatou pour gérer son salon Fat's Hair-Afro à Franconville.

## RÈGLE CRITIQUE - UTILISATION DES OUTILS
Tu as accès à des outils puissants. UTILISE-LES SYSTÉMATIQUEMENT pour :
- Récupérer des données réelles (stats, RDV, clients) → get_stats, get_rdv, get_client_info
- Consulter ta mémoire → se_souvenir, memoriser
- Exécuter des actions → send_message, update_rdv, generate_social_post
- Créer du contenu → social_generate_content, creer_image

⚠️ NE RÉPONDS JAMAIS de mémoire ou par supposition. UTILISE TOUJOURS un outil pour vérifier les informations.
Si on te demande des stats → utilise get_stats
Si on te demande les RDV → utilise get_rdv
Si on te demande de te souvenir → utilise se_souvenir
Si on te demande de mémoriser → utilise memoriser

## Ton rôle
Tu es experte en :
- **Gestion de salon** : RDV, clients, statistiques
- **SEO & Référencement** : optimisation site, mots-clés, Google My Business
- **Marketing digital** : campagnes, promotions, fidélisation, emails, SMS
- **Stratégie business** : analyse, pricing, objectifs, rapports
- **Réseaux sociaux** : publication, programmation, génération de contenu
- **Commercial** : devis, ventes, relances, performance commerciale
- **Comptabilité** : facturation, dépenses, trésorerie, fiscalité
- **RH** : planning, temps de travail, congés, formation, bien-être
- **Création de contenu** : génération d'images IA, légendes optimisées, posts complets
- **Mémoire persistante** : tu te souviens des conversations précédentes et des préférences
- **Gestion de fichiers** : tu peux créer, lire, modifier des fichiers dans ton workspace
- **Recherche web** : tu peux chercher des informations sur internet en temps réel (tendances, actualités, concurrents, inspiration)
- **Agent autonome** : tu peux planifier et exécuter des tâches automatiquement, même en différé ou de manière récurrente
- **Computer Use** : tu peux contrôler un navigateur pour publier directement sur les réseaux sociaux

## Tes capacités

### Gestion quotidienne
- Consulter les statistiques (CA, RDV, clients)
- Gérer les rendez-vous (voir, modifier, annuler)
- Envoyer des messages aux clients (WhatsApp, Email, SMS)
- Créer du contenu pour les réseaux sociaux

### SEO & Référencement
- Analyser le référencement du site
- Proposer des mots-clés optimisés
- Générer des meta descriptions et titres
- Conseiller sur Google My Business

### Marketing
- Créer des campagnes complètes (promo, fidélisation, parrainage)
- Générer des offres promotionnelles
- Rédiger des emails et SMS marketing
- Planifier des actions de fidélisation

### Stratégie Business
- Analyser le business (SWOT, concurrence)
- Optimiser les tarifs
- Définir et suivre des objectifs
- Générer des rapports stratégiques

### Réseaux Sociaux
- Publier directement sur Instagram, Facebook, Twitter/X, LinkedIn, TikTok
- Programmer des posts pour plus tard
- Générer du contenu optimisé pour chaque plateforme
- Voir l'état des plateformes configurées
- Conseiller sur les meilleurs moments pour publier

### Commercial
- Créer et envoyer des devis personnalisés
- Analyser les ventes par service, client ou période
- Gérer les relances (devis en attente, clients inactifs)
- Suivre les indicateurs de performance commerciale
- Faire des prévisions de chiffre d'affaires

### Comptabilité
- Créer et exporter des factures
- Suivre les dépenses par catégorie (produits, transport, etc.)
- Analyser la trésorerie et les flux de caisse
- Calculer la TVA et préparer les déclarations URSSAF
- Générer des rapports financiers (mensuel, trimestriel, annuel)
- Rappeler les échéances fiscales

### RH (Ressources Humaines)
- Gérer et optimiser le planning de travail
- Suivre le temps de travail et la productivité
- Planifier les congés et jours de repos
- Définir et suivre les objectifs personnels
- Rechercher des formations professionnelles
- Conseiller sur l'équilibre travail/vie personnelle
- Alerter sur les risques de surmenage

### Création de Contenu
- Générer des images avec DALL-E 3 (coiffures, promos, citations, etc.)
- Créer des légendes optimisées pour chaque réseau social
- Utiliser des templates prédéfinis (avant/après, promo, citation, star de la semaine, témoignage)
- Adapter le style (africain, moderne, élégant, vibrant) et le format (carré, portrait, paysage)
- Combiner image + légende pour des posts complets prêts à publier

### Mémoire Persistante (NOUVEAU)
- Tu as une mémoire évolutive qui apprend et s'améliore
- Tu mémorises les préférences de Fatou, les infos sur les clients, ce qui marche bien
- Tu notes des insights (observations, tendances, recommandations)
- Tu peux retrouver des informations mémorisées
- Tu utilises ta mémoire pour personnaliser tes réponses

IMPORTANT pour la mémoire évolutive :
- Quand Fatou dit "souviens-toi", "retiens", "mémorise" → utilise l'outil "memoriser"
- Quand on te demande si tu te souviens → utilise "se_souvenir" AVANT de répondre
- Pour les infos sur un client → utilise "tout_savoir_sur_client"
- Quand tu remarques un pattern/tendance → utilise "noter_insight"
- Pour montrer les observations → utilise "voir_insights"
- Pour oublier quelque chose → utilise "oublier"

### Recherche Web (NOUVEAU)
- Tu peux faire des recherches sur internet en temps réel
- Utilise "recherche_web" pour chercher n'importe quelle information
- Utilise "recherche_actualites" pour les news récentes (beauté, coiffure, mode)
- Utilise "recherche_concurrent" pour espionner les concurrents (prix, avis, services)
- Utilise "recherche_tendances" pour les tendances du moment (coiffure afro, locks, tresses)

QUAND utiliser la recherche web :
- Pour connaître les tendances actuelles (coiffure, mode, beauté)
- Pour vérifier les prix des concurrents
- Pour trouver de l'inspiration (idées de posts, de coiffures)
- Pour les actualités du secteur beauté
- Pour répondre à des questions sur l'actualité
- Pour trouver des informations sur des produits capillaires
- Utilise "oublier" quand Fatou demande d'oublier quelque chose
- Mémorise automatiquement les préférences et décisions importantes avec le bon type et catégorie

Types de souvenirs :
- preference : goûts, préférences (ex: "jour_publication_prefere" = "mardi")
- learning : leçon apprise (ex: "posts_qui_marchent" = "les posts courts avec emojis")
- fact : info factuelle (ex: "zone_intervention" = "Île-de-France")
- insight : observation (ex: utilise noter_insight à la place)

Catégories :
- admin : concerne Fatou (préférences, habitudes)
- client : concerne un client spécifique
- business : concerne le salon (tarifs, services, horaires)
- content : concerne la création de contenu

### Agent Autonome - Planification (NOUVEAU)
Tu peux planifier des tâches qui s'exécuteront automatiquement, même en ton absence !

**Planifier des posts réseaux sociaux :**
- "planifier_post" pour programmer un post Instagram/Facebook/TikTok
- Tu peux poster : maintenant, dans X heures, demain à Xh, ou de manière récurrente
- Exemples : "demain 10h", "dans 2 heures", "tous les jours à 18h", "tous les lundis à 9h"

**Planifier des rappels et relances :**
- "planifier_rappel" pour envoyer un rappel de RDV à un client
- "planifier_relance" pour relancer un client inactif après X jours

**Gérer les tâches planifiées :**
- "voir_taches_planifiees" pour voir toutes les tâches en attente
- "annuler_tache" pour annuler une tâche par son ID
- "stats_queue" pour voir les statistiques de la queue

**Tâches automatiques du système :**
- Rapport quotidien à 20h
- Vérification des anniversaires clients à 8h
- Analytics hebdomadaires le lundi à 9h
- Veille concurrentielle le mercredi à 14h

QUAND utiliser l'agent autonome :
- Pour planifier des posts à l'avance (vacances, week-end)
- Pour créer des rappels de RDV automatiques
- Pour mettre en place des posts récurrents (ex: "tous les mardis, un avant/après")
- Pour relancer automatiquement les clients inactifs

### Computer Use - Contrôle Navigateur (NOUVEAU)
Tu peux contrôler un navigateur pour publier DIRECTEMENT sur les réseaux sociaux !

**Étapes pour publier sur Instagram :**
1. "ouvrir_navigateur" pour lancer le navigateur
2. "connecter_instagram" avec les identifiants
3. "publier_instagram_direct" avec l'image et la légende
4. "fermer_navigateur" quand c'est fini

**Commandes disponibles :**
- "ouvrir_navigateur" / "fermer_navigateur" : gérer le navigateur
- "ouvrir_page" : ouvrir une URL et prendre un screenshot
- "prendre_screenshot" : capturer l'écran actuel
- "connecter_instagram" / "publier_instagram_direct" : poster sur Instagram
- "connecter_facebook" / "publier_facebook_direct" : poster sur Facebook
- "connecter_tiktok" / "publier_tiktok_direct" : poster sur TikTok

**Notes importantes :**
- Les sessions sont sauvegardées (pas besoin de se reconnecter à chaque fois)
- TikTok peut nécessiter une vérification manuelle (captcha)
- Utilise avec modération (1-2 posts/jour max pour éviter les blocages)
- Les screenshots sont sauvegardés dans data/screenshots/

### Gestion de Fichiers (NOUVEAU)
- Tu as un workspace personnel où tu peux créer et gérer des fichiers
- Dossiers disponibles : documents/, images/, exports/, imports/, temp/
- Tu peux créer des notes, rapports, listes, etc.
- Les fichiers sont accessibles via /halimah-workspace/

IMPORTANT pour les fichiers :
- Demande confirmation avant de supprimer un fichier
- Utilise des noms de fichiers descriptifs
- Les extensions autorisées : .txt, .md, .json, .csv
- **TOUJOURS inclure l'URL du fichier créé dans ta réponse** en format markdown pour que Fatou puisse le voir/télécharger
  - Pour les fichiers texte : [Télécharger nom-fichier.txt](/halimah-workspace/documents/nom-fichier.txt)
  - Pour les images : ![Description](/halimah-workspace/images/image.png)
  - Exemple : "J'ai créé le fichier [notes.txt](/halimah-workspace/documents/notes.txt)"

### Google Drive (NOUVEAU)
- Tu peux accéder aux fichiers Google Drive de Fatou (si connecté)
- Lire, créer, modifier des fichiers dans le cloud
- Synchroniser entre le workspace local et Google Drive
- Télécharger des fichiers Drive vers le serveur
- Uploader des fichiers du serveur vers Drive

IMPORTANT pour Google Drive :
- Vérifie d'abord si Google Drive est connecté (gdrive_status)
- Si non connecté, invite Fatou à connecter dans Paramètres
- Demande confirmation avant de supprimer des fichiers

### Agent Autonome (NOUVEAU)
- Tu peux planifier et exécuter des tâches complexes en plusieurs étapes
- Utilise agent_plan pour décomposer une demande en sous-tâches
- Les actions sensibles (emails, publications, suppressions) nécessitent confirmation
- Tu peux suivre le statut des tâches en cours
- Tu peux annuler une tâche si nécessaire

IMPORTANT pour l'agent :
- Quand Fatou demande quelque chose de complexe (ex: "prépare le bilan et envoie-le"), utilise agent_plan
- Toujours montrer le plan et demander confirmation avant d'exécuter
- Ne jamais exécuter d'actions sensibles sans confirmation explicite
- Si une étape échoue, informe Fatou et propose des alternatives

### Sandbox - Environnement de Test (NOUVEAU)
Tu as un environnement sandbox pour tester tes actions avant de les exécuter réellement !

**3 modes disponibles :**
- **simulation** : Teste sans rien faire (défaut). Parfait pour voir à quoi ressemblerait un post.
- **validation** : Prépare les posts pour approbation. Fatou valide avant publication.
- **production** : Exécute réellement les actions (publication effective).

**Commandes sandbox :**
- "definir_mode_sandbox" : Changer le mode (simulation, validation, production)
- "voir_mode_sandbox" : Voir le mode actuel
- "simuler_post" : Simuler un post Instagram/Facebook/TikTok
- "analyser_contenu" : Analyser la qualité d'un contenu avec score et suggestions
- "valider_post" : Approuver ou rejeter un post en attente
- "voir_posts_en_attente" : Voir les posts à valider
- "voir_posts_simules" : Lister tous les posts simulés
- "executer_post_approuve" : Publier un post approuvé
- "stats_sandbox" : Statistiques du sandbox
- "nettoyer_sandbox" : Supprimer les anciens fichiers

**Workflow recommandé :**
1. Rester en mode "simulation" par défaut pour tester
2. Utiliser "analyser_contenu" pour avoir un score de qualité
3. Passer en mode "validation" quand le contenu est prêt
4. Simuler le post (il sera mis en attente de validation)
5. Fatou approuve avec "valider_post"
6. Passer en mode "production" et utiliser "executer_post_approuve"

**Analyse de contenu :**
L'outil "analyser_contenu" donne un score sur 100 basé sur :
- Longueur du texte
- Nombre de hashtags (adapté à chaque plateforme)
- Présence de média (image/vidéo)
- Call-to-action (réserve, lien en bio, etc.)
- Emojis
- Mention de prix
- Heure de publication optimale

IMPORTANT pour le sandbox :
- Par défaut, tu es en mode simulation (sécuritaire)
- Toujours informer Fatou du mode actuel avant une action
- Utiliser "analyser_contenu" pour améliorer les posts avant publication
- Le mode production ne doit être activé qu'avec confirmation explicite

### Gestion des Environnements (NOUVEAU)
Tu peux basculer entre 3 environnements pour tester en sécurité :

**Environnements disponibles :**
- **development** 🔧 : Données fictives, pas de vraies actions (défaut au démarrage)
- **staging** 🧪 : Vraies APIs mais comptes de test
- **production** 🚀 : Vraies données, vraies actions (ATTENTION !)

**Commandes environnement :**
- "voir_environnement" : Voir l'environnement actuel et ses configs
- "lister_environnements" : Lister tous les environnements
- "changer_environnement" : Changer d'environnement
- "verifier_action" : Vérifier si une action est autorisée
- "verifier_feature" : Vérifier si une feature est activée
- "obtenir_donnees_env" : Récupérer des données (mock en dev)
- "comparer_environnements" : Comparer deux environnements
- "passer_en_dev" / "passer_en_staging" / "passer_en_production" : Raccourcis

**Comportement par environnement :**
| Feature | Development | Staging | Production |
|---------|-------------|---------|------------|
| Réseaux sociaux | Mock | Activé | Activé |
| DALL-E | Désactivé | Activé | Activé |
| WhatsApp | Désactivé | Désactivé | Activé |
| Paiements | Test | Test | Live |

IMPORTANT pour les environnements :
- Par défaut, tu démarres en mode "development" (sécuritaire)
- En dev, tu utilises des données fictives pour économiser les crédits API
- Le passage en production nécessite la confirmation "JE CONFIRME"
- Toujours vérifier l'environnement avant une action sensible
- Informe Fatou si une action est bloquée par l'environnement actuel

IMPORTANT pour la création de contenu :
- La génération d'images coûte environ 0.04-0.08€ par image (DALL-E 3)
- Tu demandes TOUJOURS confirmation avant de générer une image payante
- Tu proposes plusieurs options de style/format avant de générer
- Tu montres le chemin de l'image générée pour que Fatou puisse la télécharger

IMPORTANT pour les publications réseaux sociaux :
- Tu demandes TOUJOURS confirmation avant de publier
- Tu montres un aperçu du post avant publication
- Tu adaptes le contenu selon la plateforme (hashtags, longueur, ton)
- Tu conseilles sur les meilleurs moments pour publier
- Instagram requiert une image, TikTok requiert une vidéo

## Personnalité
- Professionnelle mais chaleureuse
- Tu tutoies Fatou (c'est ta patronne et amie)
- Tu confirmes TOUJOURS avant d'effectuer une action importante
- Tu donnes des conseils actionnables et concrets
- Tu utilises des emojis avec modération (1-2 par message max)
- Tu es proactive: tu proposes des actions pertinentes

## Workflow pour les actions
Quand Fatou te demande une action importante:
1. Tu expliques ce que tu vas faire
2. Tu demandes sa confirmation ("Je procède ?" ou similaire)
3. Tu attends sa réponse affirmative
4. Tu exécutes et confirmes le résultat

## Informations salon
- Nom: Fat's Hair-Afro
- Adresse: 8 rue des Monts Rouges, 95130 Franconville
- Téléphone: 09 39 24 02 69
- Spécialité: Coiffure afro à domicile (tresses, locks, nattes, soins, brushing)
- 25 ans d'expérience
- Zone: Franconville et Île-de-France
- Horaires:
  * Lundi-Mercredi: 09h-18h
  * Jeudi: 09h-13h
  * Vendredi: 13h-18h
  * Samedi: 09h-18h
  * Dimanche: Fermé

## Exemples de requêtes

### Gestion & Marketing
- "Donne-moi le CA de la semaine"
- "Combien de RDV demain ?"
- "Analyse mon SEO"
- "Propose-moi des mots-clés pour les tresses"
- "Crée une campagne de fidélisation"
- "Fais-moi une promo -20% sur les tresses"

### Réseaux sociaux
- "Crée un post Instagram pour promouvoir les tresses"
- "Publie ce post sur Facebook et Instagram"
- "Programme un post pour demain 10h"
- "Génère un post avant/après pour Instagram"

### Commercial
- "Crée un devis pour Marie Martin"
- "Quels sont mes devis en attente ?"
- "Analyse mes ventes du mois"
- "Quels clients je dois relancer ?"
- "Quelle est ma performance commerciale ?"
- "Fais-moi des prévisions de CA pour le trimestre"

### Comptabilité
- "Crée une facture pour le RDV d'hier"
- "Exporte mes factures du mois"
- "Ajoute une dépense de 50€ en produits"
- "Quel est mon solde de trésorerie ?"
- "Calcule ma TVA du trimestre"
- "Rappelle-moi mes échéances URSSAF"
- "Fais-moi un rapport comptable du mois"

### RH
- "Montre-moi mon planning de la semaine"
- "Combien d'heures j'ai travaillé ce mois ?"
- "Je veux prendre des congés du 15 au 20"
- "Bloque le lundi 12 janvier"
- "Quels sont mes objectifs ?"
- "Trouve-moi une formation en gestion"
- "Est-ce que je travaille trop ?"
- "Donne-moi des conseils pour mieux m'organiser"

### Création de contenu
- "Liste-moi les templates disponibles"
- "Crée-moi une image pour un post locks, style africain"
- "Génère une légende Instagram pour une promo sur les braids à -20%"
- "Crée un post complet 'Star de la semaine' pour les Goddess Locs sur Instagram"
- "Fais-moi une citation inspirante sur la beauté naturelle"
- "Génère une image avant/après pour les tresses"
- "Montre-moi les images que tu as déjà générées"

### Mémoire
- "Souviens-toi que je préfère publier le mardi"
- "Tu te souviens de ce qu'on a décidé pour les tarifs ?"
- "Quelles sont mes préférences ?"
- "Oublie que j'aime les locks rouges"
- "Rappelle-moi mes décisions récentes"
- "Montre-moi les stats de ta mémoire"

### Fichiers
- "Crée un fichier notes.txt avec mes idées pour la semaine"
- "Lis le fichier documents/planning.md"
- "Liste les fichiers dans exports"
- "Cherche 'promo' dans mes fichiers"
- "Supprime le fichier temp/brouillon.txt"
- "Montre-moi les stats du workspace"

### Google Drive
- "Google Drive est-il connecté ?"
- "Liste mes fichiers Google Drive"
- "Cherche 'facture' dans mon Drive"
- "Lis le fichier [ID] de mon Drive"
- "Crée un document 'Notes janvier' sur mon Drive"
- "Télécharge ce fichier Drive vers le serveur"
- "Upload le rapport vers mon Google Drive"

### Agent Autonome
- "Prépare le bilan du mois et envoie-le moi par email"
- "Crée une campagne de relance pour les clients inactifs"
- "Génère un post Instagram et programme-le pour demain"
- "Quelles tâches sont en cours ?"
- "Annule la tâche #5"
- "Montre-moi l'historique des tâches"

Réponds de manière naturelle, en français, comme une vraie assistante professionnelle et amicale.`;

// GET /api/admin/halimah-pro/health - Test de santé
router.get('/health', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  res.json({
    status: 'ok',
    apiKeyConfigured: !!apiKey,
    timestamp: new Date().toISOString()
  });
});

// POST /api/admin/halimah-pro/upload - Upload de fichiers
router.post('/upload', authenticateAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const file = req.file;
    const url = `/uploads/halimah-pro/${file.filename}`;

    console.log(`[HALIMAH PRO] ✅ Fichier uploadé: ${file.originalname} -> ${url}`);

    // Si c'est une image, on peut l'analyser avec Claude Vision
    let analysis = null;
    if (file.mimetype.startsWith('image/')) {
      try {
        const anthropic = getAnthropicClient();
        if (anthropic) {
          const imageData = fs.readFileSync(file.path);
          const base64Image = imageData.toString('base64');
          const mediaType = file.mimetype;

          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64Image
                  }
                },
                {
                  type: 'text',
                  text: 'Décris brièvement cette image en français (2-3 phrases). Si c\'est une photo de coiffure, décris le style.'
                }
              ]
            }]
          });

          analysis = response.content[0]?.text;
        }
      } catch (err) {
        console.error('[HALIMAH PRO] Erreur analyse image:', err.message);
      }
    }

    // Si c'est un PDF ou texte, on peut lire le contenu
    let textContent = null;
    if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv') {
      try {
        textContent = fs.readFileSync(file.path, 'utf-8').substring(0, 5000); // Max 5000 chars
      } catch (err) {
        console.error('[HALIMAH PRO] Erreur lecture fichier texte:', err.message);
      }
    }

    res.json({
      success: true,
      url,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      analysis,
      textContent
    });

  } catch (error) {
    console.error('[HALIMAH PRO] Erreur upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/halimah-pro/chat
router.post('/chat', authenticateAdmin, async (req, res) => {
  console.log('[HALIMAH PRO] ==========================================');
  console.log('[HALIMAH PRO] Nouvelle requete');
  console.log('[HALIMAH PRO] Admin:', req.admin?.email);

  // Vérification précoce de la clé API
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[HALIMAH PRO] ❌ ANTHROPIC_API_KEY MANQUANTE !');
    return res.status(500).json({
      error: 'Configuration incomplète',
      response: 'Désolée Fatou, ma configuration n\'est pas complète. La clé API est manquante.'
    });
  }

  try {
    const { message, conversationHistory = [], attachments = [], sessionId = 'default' } = req.body;
    console.log('[HALIMAH PRO] Message:', message?.substring(0, 100));
    console.log('[HALIMAH PRO] Historique:', conversationHistory.length, 'messages');
    console.log('[HALIMAH PRO] Fichiers attachés:', attachments.length);
    console.log('[HALIMAH PRO] Session:', sessionId);

    if (!message && attachments.length === 0) {
      return res.status(400).json({ error: 'Message ou fichier requis' });
    }

    // Obtenir le client Anthropic
    const anthropic = getAnthropicClient();
    if (!anthropic) {
      throw new Error('Impossible d\'initialiser le client Anthropic');
    }

    // === MÉMOIRE ÉVOLUTIVE: Charger le contexte mémoire ===
    let memoryContext = '';
    try {
      const memoryData = await buildMemoryContext({
        clientId: null, // TODO: extraire clientId du message si pertinent
        topic: message?.substring(0, 100) || null
      });
      memoryContext = formatMemoryContextForPrompt(memoryData);
      if (memoryContext && memoryContext.length > 50) {
        console.log('[HALIMAH PRO] 🧠 Contexte mémoire évolutive chargé');
      }
    } catch (memErr) {
      console.error('[HALIMAH PRO] Erreur chargement mémoire:', memErr.message);
    }

    // === MÉMOIRE: Sauvegarder le message utilisateur ===
    try {
      await saveMessage(sessionId, 'user', message || '[Fichier envoyé]', attachments.length > 0 ? attachments : null);
    } catch (saveErr) {
      console.error('[HALIMAH PRO] Erreur sauvegarde message user:', saveErr.message);
    }

    // Construire le contenu du message utilisateur avec les fichiers
    let userContent = [];

    // Ajouter les images en base64 pour Claude Vision
    for (const att of attachments) {
      if (att.type === 'image' && att.url) {
        try {
          const imagePath = path.join(process.cwd(), 'client/public', att.url);
          if (fs.existsSync(imagePath)) {
            const imageData = fs.readFileSync(imagePath);
            const base64Image = imageData.toString('base64');
            userContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: att.mimeType || 'image/jpeg',
                data: base64Image
              }
            });
          }
        } catch (err) {
          console.error('[HALIMAH PRO] Erreur lecture image:', err.message);
        }
      } else if (att.type === 'document' && att.url) {
        // Pour les documents, on ajoute une mention dans le texte
        try {
          const docPath = path.join(process.cwd(), 'client/public', att.url);
          if (fs.existsSync(docPath) && (att.mimeType === 'text/plain' || att.mimeType === 'text/csv')) {
            const textContent = fs.readFileSync(docPath, 'utf-8').substring(0, 5000);
            userContent.push({
              type: 'text',
              text: `[Contenu du fichier ${att.name}]:\n${textContent}`
            });
          } else {
            userContent.push({
              type: 'text',
              text: `[Fichier joint: ${att.name} (${att.mimeType})]`
            });
          }
        } catch (err) {
          console.error('[HALIMAH PRO] Erreur lecture document:', err.message);
        }
      }
    }

    // Ajouter le message texte
    if (message) {
      userContent.push({ type: 'text', text: message });
    } else if (userContent.length > 0) {
      userContent.push({ type: 'text', text: 'Analyse ce fichier s\'il te plaît.' });
    }

    // Construire l'historique de conversation pour Anthropic
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })),
      {
        role: 'user',
        content: userContent.length > 1 ? userContent : (message || 'Analyse ce fichier.')
      }
    ];

    // Construire le system prompt avec le contexte mémoire
    const fullSystemPrompt = memoryContext
      ? systemPrompt + memoryContext
      : systemPrompt;

    // Appel à l'API Anthropic avec outils - TOUJOURS passer les tools
    console.log('=== HALIMAH PRO DEBUG ===');
    console.log('[DEBUG] Nombre d\'outils:', tools.length);
    console.log('[DEBUG] Premiers outils:', tools.slice(0, 5).map(t => t.name));
    console.log('[DEBUG] System prompt length:', fullSystemPrompt.length, 'chars');
    console.log('[DEBUG] Messages count:', messages.length);

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: fullSystemPrompt,
      messages: messages,
      tools: tools  // TOUJOURS passer les tools (comme halimahAI.js)
    });

    console.log('[DEBUG] stop_reason:', response.stop_reason);
    console.log('[DEBUG] content types:', response.content.map(c => c.type));

    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(c => c.type === 'tool_use');
      console.log('[DEBUG] OUTILS APPELÉS:', toolUses.map(t => t.name));
    } else {
      console.log('[DEBUG] ⚠️ PAS DE TOOL_USE - Claude répond en texte direct');
      const textBlocks = response.content.filter(c => c.type === 'text');
      if (textBlocks.length > 0) {
        console.log('[DEBUG] Début réponse texte:', textBlocks[0].text.substring(0, 200));
      }
    }
    console.log('=========================');

    // Boucle pour gérer les appels d'outils (comme halimahAI.js)
    let toolResults = [];
    let toolLoopCount = 0;
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔄 DÉBUT BOUCLE OUTILS - stop_reason initial:', response.stop_reason);
    console.log('═══════════════════════════════════════════════════════════');

    while (response.stop_reason === 'tool_use') {
      toolLoopCount++;
      console.log(`\n🔄 ═══ BOUCLE OUTIL #${toolLoopCount} ═══`);

      // Trouver TOUS les tool_use blocks dans la réponse
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      if (toolUseBlocks.length === 0) {
        console.log('⚠️ Aucun tool_use block trouvé, sortie de boucle');
        break;
      }

      console.log(`📊 Nombre d'outils à exécuter: ${toolUseBlocks.length}`);
      console.log('📋 Outils:', toolUseBlocks.map(t => t.name).join(', '));

      // Ajouter la réponse de l'assistant au contexte
      messages.push({ role: 'assistant', content: response.content });

      // Exécuter TOUS les outils et collecter les résultats
      const currentToolResults = [];
      for (let i = 0; i < toolUseBlocks.length; i++) {
        const toolUseBlock = toolUseBlocks[i];
        console.log(`\n🔧 OUTIL ${i + 1}/${toolUseBlocks.length}: ${toolUseBlock.name}`);
        console.log('📥 INPUT:', JSON.stringify(toolUseBlock.input, null, 2));

        const startTime = Date.now();
        const toolResult = await executeTool(toolUseBlock.name, toolUseBlock.input);
        const duration = Date.now() - startTime;

        console.log(`📤 RÉSULTAT (${duration}ms):`, JSON.stringify(toolResult).substring(0, 500));
        console.log('✅ Succès:', toolResult?.success !== false && toolResult?.error === undefined);

        currentToolResults.push({
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(toolResult)
        });
        toolResults.push({ tool_use_id: toolUseBlock.id, name: toolUseBlock.name, result: toolResult });
      }

      // Ajouter tous les résultats d'outils
      messages.push({ role: 'user', content: currentToolResults });

      // Continuer la conversation avec Claude
      console.log('\n🤖 Appel Claude API pour suite...');
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: fullSystemPrompt,
        messages: messages,
        tools: tools  // TOUJOURS passer les tools
      });
      console.log('📡 Réponse Claude - stop_reason:', response.stop_reason);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`✅ FIN BOUCLE OUTILS - TOTAL BOUCLES: ${toolLoopCount}`);
    console.log(`🔧 OUTILS EXÉCUTÉS: ${toolResults.length}`);
    if (toolResults.length > 0) {
      console.log('📋 Liste outils:', toolResults.map(t => t.name).join(', '));
    }
    console.log('═══════════════════════════════════════════════════════════');

    // Extraire la réponse textuelle finale
    const finalResponse = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    // ═══ LOG RÉPONSE FINALE ═══
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📝 RÉPONSE FINALE:');
    console.log(finalResponse.substring(0, 500) + (finalResponse.length > 500 ? '...' : ''));
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 RÉSUMÉ EXÉCUTION:');
    console.log(`   - Boucles outils: ${toolLoopCount}`);
    console.log(`   - Outils exécutés: ${toolResults.length}`);
    console.log(`   - Longueur réponse: ${finalResponse.length} caractères`);
    if (toolLoopCount === 0) {
      console.log('⚠️ ATTENTION: AUCUNE BOUCLE OUTIL EXÉCUTÉE - Claude a répondu en texte direct');
    }
    console.log('═══════════════════════════════════════════════════════════\n');

    // === MÉMOIRE: Sauvegarder la réponse de l'assistant ===
    try {
      const toolsUsed = toolResults.length > 0 ? toolResults.map(t => t.tool_use_id) : null;
      await saveMessage(sessionId, 'assistant', finalResponse, null, toolsUsed);

      // Extraire automatiquement les faits importants de cet échange
      try {
        const factsExtracted = await extractAndSaveFacts(message || '', finalResponse);
        if (factsExtracted > 0) {
          console.log(`[HALIMAH PRO] 🧠 ${factsExtracted} fait(s) extrait(s) automatiquement`);
        }
      } catch (extractErr) {
        console.error('[HALIMAH PRO] Erreur extraction faits:', extractErr.message);
      }
    } catch (saveErr) {
      console.error('[HALIMAH PRO] Erreur sauvegarde réponse assistant:', saveErr.message);
    }

    res.json({ response: finalResponse });

  } catch (error) {
    console.error('=== HALIMAH PRO ERREUR COMPLETE ===');
    console.error('[ERREUR] Type:', error?.name);
    console.error('[ERREUR] Message:', error?.message);
    console.error('[ERREUR] Code:', error?.code);
    console.error('[ERREUR] Status:', error?.status);
    console.error('[ERREUR] Headers:', JSON.stringify(error?.headers || {}));
    console.error('[ERREUR] Body:', JSON.stringify(error?.body || error?.error || {}));
    console.error('[ERREUR] Stack:', error?.stack?.substring(0, 800));
    console.error('===================================');

    // Verifier si c'est une erreur d'API Anthropic
    if (error?.status) {
      console.error('[HALIMAH PRO] Status HTTP:', error.status);
    }

    // Message d'erreur plus informatif pour Fatou
    let userMessage = 'Desolee Fatou, j\'ai eu un petit souci technique.';

    if (error?.message?.includes('API key')) {
      userMessage = 'Ma configuration n\'est pas complete. Contacte le support technique.';
    } else if (error?.message?.includes('rate limit') || error?.status === 429) {
      userMessage = 'J\'ai trop de demandes en ce moment. Reessaie dans quelques secondes.';
    } else if (error?.message?.includes('timeout') || error?.message?.includes('ETIMEDOUT')) {
      userMessage = 'La connexion est lente. Reessaie dans un moment.';
    } else if (error?.status === 401 || error?.status === 403) {
      userMessage = 'Il y a un probleme d\'authentification. Reconnecte-toi.';
    }

    res.status(500).json({
      error: 'Erreur serveur',
      message: userMessage,
      technical: error?.message || 'Erreur inconnue'
    });
  }
});

// Fonction pour exécuter les tools
async function executeTool(toolName, toolInput) {
  try {
    switch (toolName) {
      case 'parse_date': {
        // Inline parse_date for admin chat
        const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
        const now = new Date();
        const text = (toolInput.date_text || '').toLowerCase().trim();
        let target = new Date(now);

        if (text === "aujourd'hui" || text === 'aujourdhui' || text === 'today') {
          // keep today
        } else if (text === 'demain' || text === 'tomorrow') {
          target.setDate(target.getDate() + 1);
        } else if (text === 'après-demain' || text === 'apres-demain' || text === 'après demain') {
          target.setDate(target.getDate() + 2);
        } else if (text.startsWith('lundi') || text.startsWith('mardi') || text.startsWith('mercredi') || text.startsWith('jeudi') || text.startsWith('vendredi') || text.startsWith('samedi') || text.startsWith('dimanche')) {
          const jourIdx = JOURS_FR.indexOf(text.split(' ')[0]);
          if (jourIdx >= 0) {
            const diff = (jourIdx - now.getDay() + 7) % 7 || 7;
            target.setDate(target.getDate() + diff);
          }
        } else {
          // Try ISO parse
          const parsed = new Date(text);
          if (!isNaN(parsed.getTime())) target = parsed;
        }
        const dateISO = target.toISOString().split('T')[0];
        const jourNom = JOURS_FR[target.getDay()];
        return { success: true, date: dateISO, jour: jourNom, heure: toolInput.heure || null };
      }

      case 'get_upcoming_days': {
        // Simplified get_upcoming_days for admin chat
        const JOURS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
        const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
        const n = new Date();
        n.setHours(12,0,0,0);
        const limit = Math.min(toolInput.nb_jours || 7, 30);
        const jours = [];
        for (let i = 0; i < limit; i++) {
          const d = new Date(n);
          d.setDate(n.getDate() + i);
          jours.push({
            date: d.toISOString().split('T')[0],
            jour: JOURS[d.getDay()],
            dateFormatee: `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
          });
        }
        return { success: true, aujourd_hui: n.toISOString().split('T')[0], jours };
      }

      case 'get_services':
      case 'get_price':
      case 'check_availability':
      case 'get_available_slots':
      case 'get_salon_info':
      case 'get_business_hours':
      case 'calculate_travel_fee':
      case 'create_booking':
      case 'find_appointment':
      case 'cancel_appointment': {
        // Delegate client tools to nexusCore executeTool
        const { executeTool: nexusExecuteTool } = await import('../core/unified/nexusCore.js');
        return await nexusExecuteTool(toolName, toolInput);
      }

      case 'get_stats':
        return await getStats(toolInput.periode, toolInput.type);

      case 'get_rdv':
        return await getRdv(toolInput.date, toolInput.statut, toolInput.limit);

      case 'update_rdv':
        return await updateRdv(
          toolInput.rdv_id,
          toolInput.action,
          toolInput.nouvelle_date,
          toolInput.nouvelle_heure,
          toolInput.notifier_client
        );

      case 'send_message':
        return await sendMessage(
          toolInput.client_id,
          toolInput.canal,
          toolInput.type,
          toolInput.contenu
        );

      case 'get_client_info':
        return await getClientInfo(toolInput.client_id);

      case 'search_clients':
        return await searchClients(toolInput.query, toolInput.filtre);

      case 'generate_social_post':
        return generateSocialPost(toolInput.plateforme, toolInput.sujet, toolInput.inclure_emojis);

      // === TOOLS SEO ===
      case 'seo_analyze':
        return await seoAnalyze(toolInput.aspect);

      case 'seo_keywords':
        return seoKeywords(toolInput.service, toolInput.localisation);

      case 'seo_meta_generate':
        return seoMetaGenerate(toolInput.page);

      // === TOOLS MARKETING ===
      case 'marketing_campaign':
        return marketingCampaign(toolInput.type, toolInput.objectif, toolInput.budget, toolInput.duree);

      case 'marketing_promo':
        return marketingPromo(toolInput.type_promo, toolInput.service, toolInput.valeur, toolInput.conditions);

      case 'marketing_email':
        return marketingEmail(toolInput.type, toolInput.cible, toolInput.sujet);

      case 'marketing_sms':
        return marketingSms(toolInput.type, toolInput.message);

      // === TOOLS STRATÉGIE ===
      case 'strategie_analyze':
        return await strategieAnalyze(toolInput.aspect);

      case 'strategie_pricing':
        return await strategiePricing(toolInput.action, toolInput.service);

      case 'strategie_objectifs':
        return await strategieObjectifs(toolInput.action, toolInput.periode, toolInput.type_objectif);

      case 'strategie_rapport':
        return await strategieRapport(toolInput.periode, toolInput.format);

      // === TOOLS RÉSEAUX SOCIAUX ===
      case 'social_publish':
        // Vérifier la confirmation avant de publier
        if (!toolInput.confirm) {
          return {
            success: false,
            action: 'apercu',
            message: 'Voici un aperçu du post. Confirme pour publier.',
            apercu: {
              platforms: toolInput.platforms,
              content: toolInput.content,
              image: toolInput.image_url || 'Aucune image',
              note: 'Pour publier, demande confirmation à Fatou puis rappelle ce tool avec confirm=true'
            }
          };
        }
        return await publishToSocialMedia(
          toolInput.platforms,
          toolInput.content,
          toolInput.image_url
        );

      case 'social_schedule':
        return await schedulePost(
          toolInput.platforms,
          toolInput.content,
          toolInput.image_url,
          toolInput.scheduled_time
        );

      case 'social_status':
        if (toolInput.action === 'check_platforms') {
          const status = getPlatformStatus();
          const available = status.filter(p => p.configured);
          const notConfigured = status.filter(p => !p.configured);
          return {
            plateformes: status,
            resume: {
              configurees: available.length,
              non_configurees: notConfigured.length
            },
            message: available.length > 0
              ? `${available.length} plateforme(s) prête(s): ${available.map(p => p.label).join(', ')}`
              : 'Aucune plateforme configurée. Ajoute les clés API dans .env'
          };
        } else if (toolInput.action === 'list_scheduled') {
          return await getScheduledPosts();
        } else if (toolInput.action === 'cancel_scheduled' && toolInput.post_id) {
          return await cancelScheduledPost(toolInput.post_id);
        }
        return { error: 'Action non reconnue' };

      case 'social_generate_content':
        return generateSocialContent(
          toolInput.sujet,
          toolInput.type,
          toolInput.platforms || ['instagram', 'facebook', 'twitter']
        );

      // === TOOLS COMMERCIAL ===
      case 'commercial_devis':
        return commercialDevis(toolInput.action, toolInput.client_id, toolInput.services, toolInput.notes);

      case 'commercial_ventes':
        return await commercialVentes(toolInput.periode, toolInput.type_analyse, toolInput.comparer);

      case 'commercial_relances':
        return await commercialRelances(toolInput.type_relance, toolInput.action);

      case 'commercial_performance':
        return await commercialPerformance(toolInput.indicateurs, toolInput.periode);

      // === TOOLS COMPTABLE ===
      case 'comptable_facturation':
        return await comptableFacturation(toolInput.action, toolInput.periode, toolInput.rdv_id, toolInput.format);

      case 'comptable_depenses':
        return comptableDepenses(toolInput.action, toolInput.categorie, toolInput.montant, toolInput.description, toolInput.periode);

      case 'comptable_tresorerie':
        return await comptableTresorerie(toolInput.action, toolInput.periode);

      case 'comptable_fiscal':
        return comptableFiscal(toolInput.type, toolInput.periode, toolInput.action);

      case 'comptable_rapport':
        return await comptableRapport(toolInput.type_rapport, toolInput.periode, toolInput.format);

      // === TOOLS RH ===
      case 'rh_planning':
        return await rhPlanning(toolInput.action, toolInput.semaine, toolInput.modifications);

      case 'rh_temps_travail':
        return await rhTempsTravail(toolInput.periode, toolInput.type);

      case 'rh_conges':
        return rhConges(toolInput.action, toolInput.date_debut, toolInput.date_fin, toolInput.motif);

      case 'rh_objectifs':
        return rhObjectifs(toolInput.action, toolInput.type_objectif, toolInput.periode);

      case 'rh_formation':
        return rhFormation(toolInput.action, toolInput.domaine);

      case 'rh_bien_etre':
        return await rhBienEtre(toolInput.aspect);

      // === TOOLS CRÉATION DE CONTENU ===
      case 'creer_image':
        return await generateImage({
          prompt: toolInput.prompt,
          style: toolInput.style || 'african',
          format: toolInput.format || 'square',
          outputName: `halimah-${Date.now()}`
        });

      case 'creer_legende':
        return await generateCaption({
          type: toolInput.type,
          platform: toolInput.platform,
          data: {
            service: toolInput.service,
            prix: toolInput.prix,
            prixPromo: toolInput.prixPromo,
            reduction: toolInput.reduction,
            theme: toolInput.theme,
            prenom: toolInput.prenom,
            avis: toolInput.avis
          }
        });

      case 'creer_post_complet':
        {
          const template = contentTemplates.templates?.[toolInput.template];
          if (!template) {
            return {
              success: false,
              error: `Template "${toolInput.template}" non trouvé`,
              availableTemplates: Object.keys(contentTemplates.templates || {})
            };
          }

          // Générer le prompt d'image
          let imagePrompt = template.imagePrompt;
          const data = {
            service: toolInput.service,
            prix: toolInput.prix,
            reduction: toolInput.reduction,
            theme: toolInput.theme
          };
          Object.keys(data).forEach(key => {
            if (data[key]) {
              imagePrompt = imagePrompt.replace(new RegExp(`\\{${key}\\}`, 'g'), data[key]);
            }
          });
          imagePrompt = imagePrompt.replace(/\{[^}]+\}/g, '');

          // Déterminer le format
          const format = (toolInput.platform === 'stories' || toolInput.platform === 'tiktok') ? 'portrait' : 'square';

          // Générer l'image
          const imageResult = await generateImage({
            prompt: imagePrompt,
            style: toolInput.style || 'african',
            format,
            outputName: `${toolInput.template}-${Date.now()}`
          });

          // Générer la légende
          const captionResult = await generateCaption({
            type: toolInput.template,
            platform: toolInput.platform === 'stories' ? 'instagram' : toolInput.platform,
            data
          });

          return {
            success: imageResult.success && captionResult.success,
            image: imageResult,
            caption: captionResult,
            template: toolInput.template,
            platform: toolInput.platform,
            message: imageResult.success && captionResult.success
              ? `Post créé ! Image: ${imageResult.localPath}`
              : 'Erreur partielle lors de la création'
          };
        }

      case 'lister_templates':
        return {
          success: true,
          templates: Object.entries(contentTemplates.templates || {}).map(([key, template]) => ({
            id: key,
            name: template.name,
            description: template.description,
            requiredData: template.requiredData,
            platforms: template.platforms
          })),
          styles: Object.keys(contentTemplates.styles || {}),
          formats: Object.keys(contentTemplates.formats || {})
        };

      case 'lister_images_generees':
        {
          const generatedDir = path.join(process.cwd(), 'client/public/generated');
          if (!fs.existsSync(generatedDir)) {
            return { success: true, images: [], message: 'Aucune image générée' };
          }
          const files = fs.readdirSync(generatedDir)
            .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
            .map(f => ({
              name: f,
              path: `/generated/${f}`,
              createdAt: fs.statSync(path.join(generatedDir, f)).birthtime
            }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 20);
          return { success: true, images: files, count: files.length };
        }

      // === TOOLS MÉMOIRE ÉVOLUTIVE ===
      case 'memoriser':
        {
          const result = await memoryRemember({
            type: toolInput.type,
            category: toolInput.category,
            subjectType: toolInput.clientId ? 'client' : null,
            subjectId: toolInput.clientId || null,
            key: toolInput.key,
            value: toolInput.value,
            confidence: 0.8
          });
          if (result) {
            return {
              success: true,
              message: `J'ai mémorisé : "${toolInput.key}" = "${toolInput.value}"`,
              memory: {
                id: result.id,
                type: result.type,
                category: result.category,
                key: result.key,
                confidence: result.confidence
              }
            };
          }
          return { success: false, error: 'Erreur lors de la mémorisation' };
        }

      case 'se_souvenir':
        {
          // Recherche par mot-clé si query fourni
          if (toolInput.query) {
            const results = await memorySearch(toolInput.query, toolInput.category === 'all' ? null : toolInput.category);
            return {
              success: true,
              message: results.length > 0
                ? `J'ai trouvé ${results.length} souvenir(s) correspondant(s).`
                : 'Je n\'ai rien trouvé dans ma mémoire.',
              memories: results.map(m => ({
                type: m.type,
                category: m.category,
                key: m.key,
                value: m.value,
                confidence: m.confidence
              }))
            };
          }

          // Recherche par clé spécifique
          const memory = await memoryRecall({
            type: toolInput.type || null,
            category: toolInput.category === 'all' ? null : toolInput.category,
            key: toolInput.key || null,
            subjectId: toolInput.clientId || null
          });

          if (memory) {
            return {
              success: true,
              message: `Je me souviens : "${memory.key}" = "${memory.value}"`,
              memory: {
                type: memory.type,
                category: memory.category,
                key: memory.key,
                value: memory.value,
                confidence: memory.confidence
              }
            };
          }

          // Recherche tous les souvenirs de la catégorie
          const allMemories = await memoryRecallAll({
            category: toolInput.category === 'all' ? null : toolInput.category,
            subjectId: toolInput.clientId || null
          });

          return {
            success: true,
            message: allMemories.length > 0
              ? `J'ai ${allMemories.length} souvenir(s) dans cette catégorie.`
              : 'Je n\'ai rien trouvé dans ma mémoire.',
            memories: allMemories.map(m => ({
              type: m.type,
              category: m.category,
              key: m.key,
              value: m.value,
              confidence: m.confidence
            }))
          };
        }

      case 'tout_savoir_sur_client':
        {
          const clientMemories = await memoryRecallAll({
            subjectType: 'client',
            subjectId: toolInput.clientId
          });

          if (clientMemories.length === 0) {
            return {
              success: true,
              message: `Je n'ai pas encore d'informations mémorisées sur ce client.`,
              clientId: toolInput.clientId,
              memories: []
            };
          }

          return {
            success: true,
            message: `J'ai ${clientMemories.length} information(s) sur ce client.`,
            clientId: toolInput.clientId,
            memories: clientMemories.map(m => ({
              type: m.type,
              key: m.key,
              value: m.value,
              confidence: m.confidence,
              createdAt: m.created_at
            }))
          };
        }

      case 'noter_insight':
        {
          const insight = await createInsight({
            insightType: toolInput.type,
            title: toolInput.title,
            description: toolInput.description,
            priority: toolInput.priority || 5
          });

          if (insight) {
            return {
              success: true,
              message: `J'ai noté cette observation : "${toolInput.title}"`,
              insight: {
                id: insight.id,
                type: insight.insight_type,
                title: insight.title,
                priority: insight.priority
              }
            };
          }
          return { success: false, error: 'Erreur lors de la création de l\'insight' };
        }

      case 'voir_insights':
        {
          const insights = await getPendingInsights(10);

          if (insights.length === 0) {
            return {
              success: true,
              message: 'Aucune observation en attente.',
              insights: []
            };
          }

          return {
            success: true,
            message: `J'ai ${insights.length} observation(s) en attente.`,
            insights: insights.map(i => ({
              id: i.id,
              type: i.insight_type,
              title: i.title,
              description: i.description,
              priority: i.priority,
              createdAt: i.created_at
            }))
          };
        }

      case 'oublier':
        {
          const count = await forgetByKey(toolInput.key, toolInput.category || null);
          if (count > 0) {
            return {
              success: true,
              message: `J'ai oublié ${count} souvenir(s) lié(s) à "${toolInput.key}".`,
              forgotten: count
            };
          }
          return {
            success: true,
            message: `Je n'ai rien trouvé à oublier pour "${toolInput.key}".`,
            forgotten: 0
          };
        }

      case 'memory_stats':
        {
          const stats = await getMemoryStats();
          if (!stats) {
            return { success: false, error: 'Erreur lors de la récupération des statistiques' };
          }
          return {
            success: true,
            stats: {
              totalSouvenirs: stats.totalMemories,
              insightsEnAttente: stats.pendingInsights,
              totalFeedbacks: stats.totalFeedbacks,
              parType: stats.byType,
              parCategorie: stats.byCategory,
              confianceMoyenne: stats.avgConfidence
            },
            message: `Ma mémoire contient ${stats.totalMemories} souvenirs (confiance moyenne: ${stats.avgConfidence}), ${stats.pendingInsights} insights en attente.`
          };
        }

      // === TOOLS SYSTÈME DE FICHIERS ===
      case 'file_list':
        return await listFiles(toolInput.directory || '');

      case 'file_read':
        return await readFile(toolInput.filepath);

      case 'file_write':
        return await writeFile(toolInput.filepath, toolInput.content);

      case 'file_append':
        return await appendFile(toolInput.filepath, toolInput.content);

      case 'file_delete':
        return await deleteFile(toolInput.filepath);

      case 'file_search':
        return await searchFiles(toolInput.query, toolInput.directory || '');

      case 'file_copy':
        return await copyFile(toolInput.source, toolInput.destination);

      case 'file_move':
        return await moveFile(toolInput.source, toolInput.destination);

      case 'workspace_stats':
        return await getWorkspaceStats();

      // === TOOLS GOOGLE DRIVE ===
      case 'gdrive_status':
        return await gdriveGetStatus();

      case 'gdrive_list':
        {
          const status = await gdriveGetStatus();
          if (!status.connected) {
            return {
              success: false,
              error: 'Google Drive non connecté',
              message: status.message,
              action: 'Demande à Fatou de connecter Google Drive dans Paramètres > Google Drive'
            };
          }
          return await gdriveListFiles(toolInput.folder_id || 'root', toolInput.query || '');
        }

      case 'gdrive_search':
        {
          const status = await gdriveGetStatus();
          if (!status.connected) {
            return { success: false, error: 'Google Drive non connecté', message: status.message };
          }
          return await gdriveSearchFiles(toolInput.query);
        }

      case 'gdrive_read':
        {
          const status = await gdriveGetStatus();
          if (!status.connected) {
            return { success: false, error: 'Google Drive non connecté', message: status.message };
          }
          return await gdriveReadFile(toolInput.file_id);
        }

      case 'gdrive_create':
        {
          const status = await gdriveGetStatus();
          if (!status.connected) {
            return { success: false, error: 'Google Drive non connecté', message: status.message };
          }
          const mimeType = toolInput.name.endsWith('.json') ? 'application/json'
            : toolInput.name.endsWith('.csv') ? 'text/csv'
            : toolInput.name.endsWith('.md') ? 'text/markdown'
            : 'text/plain';
          return await gdriveCreateFile(toolInput.name, toolInput.content, mimeType, toolInput.folder_id || 'root');
        }

      case 'gdrive_update':
        {
          const status = await gdriveGetStatus();
          if (!status.connected) {
            return { success: false, error: 'Google Drive non connecté', message: status.message };
          }
          return await gdriveUpdateFile(toolInput.file_id, toolInput.content);
        }

      case 'gdrive_delete':
        {
          const status = await gdriveGetStatus();
          if (!status.connected) {
            return { success: false, error: 'Google Drive non connecté', message: status.message };
          }
          return await gdriveDeleteFile(toolInput.file_id);
        }

      case 'gdrive_create_folder':
        {
          const status = await gdriveGetStatus();
          if (!status.connected) {
            return { success: false, error: 'Google Drive non connecté', message: status.message };
          }
          return await gdriveCreateFolder(toolInput.name, toolInput.parent_id || 'root');
        }

      case 'gdrive_download':
        {
          const status = await gdriveGetStatus();
          if (!status.connected) {
            return { success: false, error: 'Google Drive non connecté', message: status.message };
          }
          return await gdriveDownloadFile(toolInput.file_id, toolInput.local_dir || 'halimah-workspace/imports');
        }

      case 'gdrive_upload':
        {
          const status = await gdriveGetStatus();
          if (!status.connected) {
            return { success: false, error: 'Google Drive non connecté', message: status.message };
          }
          return await gdriveUploadFile(toolInput.local_path, toolInput.folder_id || 'root');
        }

      // === TOOLS AGENT AUTONOME ===
      case 'agent_plan':
        {
          const plan = analyzeAndPlan(toolInput.request);

          if (plan.steps.length === 0) {
            return {
              success: false,
              message: 'Je n\'ai pas pu décomposer cette demande en étapes. Peux-tu reformuler ou préciser ce que tu souhaites ?'
            };
          }

          // Créer la tâche en base
          const task = await createTask(plan.description, plan.steps);
          if (!task) {
            return { success: false, error: 'Erreur lors de la création de la tâche' };
          }

          return {
            success: true,
            taskId: task.id,
            plan: formatPlanForDisplay(plan),
            stepsCount: plan.steps.length,
            requiresConfirmation: plan.requiresConfirmation,
            message: `J'ai préparé un plan avec ${plan.steps.length} étape(s). ${plan.requiresConfirmation ? 'Certaines actions nécessiteront ta confirmation.' : ''}\n\nDois-je l'exécuter ?`
          };
        }

      case 'agent_execute':
        {
          // Créer une fonction executeTool locale pour passer à executeTask
          const executeToolWrapper = async (action, params) => {
            return await executeTool(action, params);
          };

          const result = await executeTask(toolInput.task_id, executeToolWrapper);
          return result;
        }

      case 'agent_confirm':
        {
          const executeToolWrapper = async (action, params) => {
            return await executeTool(action, params);
          };

          const result = await confirmAndContinue(toolInput.task_id, executeToolWrapper);
          return result;
        }

      case 'agent_cancel':
        {
          const result = await cancelTask(toolInput.task_id);
          if (result.success) {
            return {
              success: true,
              message: `Tâche #${toolInput.task_id} annulée.`
            };
          }
          return result;
        }

      case 'agent_status':
        {
          if (toolInput.task_id) {
            // Statut d'une tâche spécifique
            const task = await getTask(toolInput.task_id);
            if (!task) {
              return { success: false, error: 'Tâche non trouvée' };
            }
            return {
              success: true,
              task: {
                id: task.id,
                description: task.description,
                status: task.status,
                currentStep: task.current_step,
                totalSteps: task.steps.length,
                createdAt: task.created_at,
                completedAt: task.completed_at,
                error: task.error
              }
            };
          } else {
            // Liste des tâches en cours
            const pending = await getPendingTasks();
            const stats = await getTaskStats();
            return {
              success: true,
              pendingTasks: pending.map(t => ({
                id: t.id,
                description: t.description,
                status: t.status,
                progress: `${t.current_step}/${t.steps.length}`
              })),
              stats,
              message: pending.length > 0
                ? `${pending.length} tâche(s) en cours ou en attente`
                : 'Aucune tâche en cours'
            };
          }
        }

      case 'agent_history':
        {
          const history = await getTaskHistory(toolInput.limit || 10);
          return {
            success: true,
            history,
            count: history.length,
            message: `${history.length} tâche(s) dans l'historique`
          };
        }

      // === TOOLS RECHERCHE WEB ===
      case 'recherche_web':
        return await rechercheWeb(toolInput);

      case 'recherche_actualites':
        return await rechercheActualites(toolInput);

      case 'recherche_concurrent':
        return await rechercheEntreprise(toolInput);

      case 'recherche_tendances':
        return await rechercheTendances(toolInput);

      // === TOOLS AGENT AUTONOME - PLANIFICATION ===
      case 'planifier_post':
        {
          const { platform, template, when, service, customText, imagePrompt } = toolInput;
          console.log(`[TOOL planifier_post] ${platform} - ${template} - ${when}`);

          try {
            const job = await schedulerSchedulePost(
              'default',
              platform,
              template,
              when,
              { service, customText, imagePrompt }
            );

            // Vérifier si c'est récurrent
            const cronPattern = parseToCronPattern(when);

            return {
              success: true,
              message: cronPattern
                ? `Post ${platform} planifié de manière récurrente (${cronPattern})`
                : `Post ${platform} planifié pour ${when}`,
              job: {
                id: job?.id,
                platform,
                template,
                when,
                recurring: !!cronPattern
              }
            };
          } catch (error) {
            console.error('[TOOL planifier_post] Erreur:', error);
            return {
              success: false,
              error: error.message,
              note: 'Redis est peut-être non disponible'
            };
          }
        }

      case 'voir_taches_planifiees':
        {
          try {
            const [queueTasks, cronJobs, stats] = await Promise.all([
              queueGetPendingTasks(),
              Promise.resolve(getScheduledJobs()),
              getQueueStats()
            ]);

            return {
              success: true,
              queue: {
                waiting: queueTasks.waiting,
                delayed: queueTasks.delayed,
                active: queueTasks.active,
                repeatable: queueTasks.repeatable
              },
              cronJobs: cronJobs,
              stats: stats,
              summary: `${stats.waiting} en attente, ${stats.active} actives, ${stats.delayed} différées, ${queueTasks.repeatable?.length || 0} récurrentes`
            };
          } catch (error) {
            console.error('[TOOL voir_taches_planifiees] Erreur:', error);
            return {
              success: false,
              error: error.message,
              note: 'Redis est peut-être non disponible'
            };
          }
        }

      case 'annuler_tache':
        {
          const { taskId, recurring } = toolInput;

          try {
            let result;
            if (recurring) {
              result = await cancelRecurringTask(taskId);
            } else {
              result = await queueCancelTask(taskId);
            }

            return result;
          } catch (error) {
            console.error('[TOOL annuler_tache] Erreur:', error);
            return {
              success: false,
              error: error.message
            };
          }
        }

      case 'planifier_rappel':
        {
          const { clientId, bookingId, reminderDate, channel } = toolInput;

          try {
            // Convertir la date naturelle en Date
            let targetDate;
            if (reminderDate.toLowerCase().includes('demain')) {
              targetDate = new Date();
              targetDate.setDate(targetDate.getDate() + 1);
              // Extraire l'heure si mentionnée
              const hourMatch = reminderDate.match(/(\d{1,2})(?:h|:)?(\d{0,2})?/);
              if (hourMatch) {
                targetDate.setHours(parseInt(hourMatch[1]), parseInt(hourMatch[2] || 0), 0, 0);
              } else {
                targetDate.setHours(9, 0, 0, 0); // 9h par défaut
              }
            } else {
              targetDate = new Date(reminderDate);
            }

            const job = await schedulerScheduleReminder(
              'default',
              clientId,
              bookingId,
              targetDate,
              channel || 'whatsapp'
            );

            return {
              success: true,
              message: `Rappel planifié pour ${targetDate.toLocaleString('fr-FR')}`,
              job: {
                id: job?.id,
                clientId,
                bookingId,
                scheduledFor: targetDate.toISOString(),
                channel: channel || 'whatsapp'
              }
            };
          } catch (error) {
            console.error('[TOOL planifier_rappel] Erreur:', error);
            return {
              success: false,
              error: error.message
            };
          }
        }

      case 'planifier_relance':
        {
          const { clientId, delayDays } = toolInput;

          try {
            const job = await scheduleFollowup('default', clientId, delayDays || 30);

            const relanceDate = new Date();
            relanceDate.setDate(relanceDate.getDate() + (delayDays || 30));

            return {
              success: true,
              message: `Relance planifiée dans ${delayDays || 30} jours`,
              job: {
                id: job?.id,
                clientId,
                scheduledFor: relanceDate.toISOString()
              }
            };
          } catch (error) {
            console.error('[TOOL planifier_relance] Erreur:', error);
            return {
              success: false,
              error: error.message
            };
          }
        }

      case 'stats_queue':
        {
          try {
            const stats = await getQueueStats();

            return {
              success: true,
              stats: stats,
              summary: `Queue: ${stats.waiting} en attente, ${stats.active} actives, ${stats.completed} terminées, ${stats.failed} échouées`
            };
          } catch (error) {
            console.error('[TOOL stats_queue] Erreur:', error);
            return {
              success: false,
              error: error.message,
              note: 'Redis est peut-être non disponible'
            };
          }
        }

      // === TOOLS COMPUTER USE ===
      case 'ouvrir_navigateur':
        return await ComputerUse.openBrowser();

      case 'fermer_navigateur':
        return await ComputerUse.closeBrowser();

      case 'ouvrir_page':
        return await ComputerUse.openPage(toolInput.url);

      case 'prendre_screenshot':
        return await ComputerUse.screenshot(toolInput.name || 'screenshot');

      case 'connecter_instagram':
        return await ComputerUse.instagramLogin(toolInput.username, toolInput.password);

      case 'publier_instagram_direct':
        return await ComputerUse.instagramPost(toolInput.imagePath, toolInput.caption, toolInput.hashtags);

      case 'connecter_facebook':
        return await ComputerUse.facebookLogin(toolInput.email, toolInput.password);

      case 'publier_facebook_direct':
        return await ComputerUse.facebookPost(toolInput.pageUrl, toolInput.content, toolInput.imagePath);

      case 'connecter_tiktok':
        return await ComputerUse.tiktokLogin(toolInput.username, toolInput.password);

      case 'publier_tiktok_direct':
        return await ComputerUse.tiktokPost(toolInput.videoPath, toolInput.caption, toolInput.hashtags);

      // === TOOLS SANDBOX ===
      case 'definir_mode_sandbox':
        return SandboxController.setMode(toolInput.mode);

      case 'voir_mode_sandbox':
        return SandboxController.getMode();

      case 'simuler_post':
        return await SandboxController.simulatePost(toolInput.platform, {
          caption: toolInput.caption,
          hashtags: toolInput.hashtags,
          imagePath: toolInput.imagePath,
          videoPath: toolInput.videoPath
        });

      case 'analyser_contenu':
        return SandboxController.analyzeContent({
          caption: toolInput.content,
          hashtags: toolInput.hashtags,
          imagePath: toolInput.hasMedia ? 'present' : null
        }, toolInput.platform);

      case 'valider_post':
        return await (toolInput.approved
          ? SandboxController.approvePost(toolInput.postId, toolInput.feedback)
          : SandboxController.rejectPost(toolInput.postId, toolInput.feedback));

      case 'voir_posts_en_attente':
        return await SandboxController.getPendingPosts();

      case 'voir_posts_simules':
        return await SandboxController.listPosts({
          platform: toolInput.platform,
          status: toolInput.status,
          limit: toolInput.limit
        });

      case 'voir_post_simule':
        return await SandboxController.getPost(toolInput.postId);

      case 'supprimer_post_simule':
        return await SandboxController.deletePost(toolInput.postId);

      case 'executer_post_approuve':
        return await SandboxController.executeApprovedPost(toolInput.postId, async (content) => {
          // Déterminer la plateforme et exécuter l'action appropriée
          const post = await SandboxController.getPost(toolInput.postId);
          if (!post.success) return post;

          switch (post.post.platform) {
            case 'instagram':
              return await ComputerUse.instagramPost(
                content.imagePath,
                content.text || content.caption,
                content.hashtags
              );
            case 'facebook':
              return await ComputerUse.facebookPost(
                process.env.FACEBOOK_PAGE_URL,
                content.text || content.caption,
                content.imagePath
              );
            case 'tiktok':
              return await ComputerUse.tiktokPost(
                content.videoPath,
                content.text || content.caption,
                content.hashtags
              );
            default:
              return { success: false, error: `Plateforme ${post.post.platform} non supportée` };
          }
        });

      case 'stats_sandbox':
        return await SandboxController.getStats();

      case 'nettoyer_sandbox':
        return await SandboxController.cleanup(toolInput.olderThanDays || 7);

      // === TOOLS ENVIRONNEMENTS ===
      case 'voir_environnement':
        return EnvironmentManager.getCurrent();

      case 'lister_environnements':
        return EnvironmentManager.list();

      case 'changer_environnement':
        return EnvironmentManager.switchTo(toolInput.environnement);

      case 'verifier_action':
        return EnvironmentManager.canDo(toolInput.action);

      case 'verifier_feature':
        return EnvironmentManager.isEnabled(toolInput.feature);

      case 'obtenir_donnees_env':
        return await EnvironmentManager.getData(toolInput.type);

      case 'comparer_environnements':
        return EnvironmentManager.compareEnvironments(toolInput.env1, toolInput.env2);

      case 'passer_en_dev':
        return EnvironmentManager.switchToDev();

      case 'passer_en_staging':
        return EnvironmentManager.switchToStaging();

      case 'passer_en_production':
        if (toolInput.confirmation !== 'JE CONFIRME') {
          return {
            success: false,
            error: 'Confirmation requise pour passer en production.',
            message: 'Tapez exactement "JE CONFIRME" pour confirmer le passage en production.',
            warning: '⚠️ En production, toutes les actions seront réelles (publications, paiements, notifications) !'
          };
        }
        return EnvironmentManager.switchToProduction();

      default:
        return { error: `Tool ${toolName} non implémenté` };
    }
  } catch (error) {
    console.error(`[TOOL ${toolName}] Erreur:`, error);
    return { error: error.message };
  }
}

// Fonction pour générer du contenu social (simple, peut être amélioré)
function generateSocialPost(plateforme, sujet, inclure_emojis = true) {
  const emojis = {
    instagram: '✨💇🏾‍♀️💖',
    facebook: '👋💇🏾‍♀️',
    story: '🔥💕✨'
  };

  const templates = {
    instagram: `${inclure_emojis ? emojis.instagram : ''} ${sujet}

📍 Fat's Hair-Afro, Franconville
📞 09 39 24 02 69
🌐 Prenez RDV en ligne

#coiffureafro #tresses #locks #franconville #beauteafro #hairsalon`,
    facebook: `${inclure_emojis ? emojis.facebook : ''} ${sujet}

Fat's Hair-Afro - Votre salon spécialiste de la coiffure afro à Franconville.

Réservez dès maintenant au 09 39 24 02 69 !`,
    story: `${inclure_emojis ? emojis.story : ''}
${sujet}

Swipe up pour réserver !
📞 09 39 24 02 69`
  };

  return {
    plateforme,
    contenu: templates[plateforme] || templates.instagram,
    suggestions: [
      "Ajoute une photo de tes plus belles réalisations",
      "Utilise les stories pour montrer un avant/après",
      "Tag tes clients (avec leur accord) pour augmenter la portée"
    ]
  };
}

export default router;

