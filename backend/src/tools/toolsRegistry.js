/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                    TOOLS REGISTRY - SOURCE UNIQUE DE VÉRITÉ                   ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   Ce fichier définit TOUS les outils disponibles pour l'IA Halimah.           ║
 * ║                                                                               ║
 * ║   ARCHITECTURE:                                                               ║
 * ║   • TOOLS_CLIENT (9 outils) - WhatsApp, Téléphone, Chat Web                   ║
 * ║   • TOOLS_ADMIN (50+ outils) - Halimah Pro (inclut TOOLS_CLIENT)              ║
 * ║                                                                               ║
 * ║   RÈGLE: Tous les canaux DOIVENT importer depuis ce fichier.                  ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

// ============================================
// OUTILS CLIENT - Pour WhatsApp, Téléphone, Chat Web
// ============================================

export const TOOLS_CLIENT = [
  {
    name: "parse_date",
    description: "OBLIGATOIRE : Convertit une date relative ('demain', 'samedi prochain', 'lundi') en format YYYY-MM-DD.",
    input_schema: {
      type: "object",
      properties: {
        date_text: {
          type: "string",
          description: "La date en langage naturel (ex: 'demain', 'samedi prochain')"
        },
        heure: {
          type: "integer",
          description: "L'heure demandée (9-18), optionnel"
        }
      },
      required: ["date_text"]
    }
  },
  {
    name: "get_services",
    description: "Récupère la liste de tous les services avec leurs prix EXACTS.",
    input_schema: {
      type: "object",
      properties: {
        categorie: {
          type: "string",
          description: "Filtrer par catégorie: 'locks', 'soins', 'tresses', 'coloration', ou 'all'",
          enum: ["locks", "soins", "tresses", "coloration", "all"]
        }
      },
      required: []
    }
  },
  {
    name: "get_price",
    description: "Récupère le prix EXACT d'un service spécifique.",
    input_schema: {
      type: "object",
      properties: {
        service_name: {
          type: "string",
          description: "Nom du service (ex: 'création crochet locks', 'shampoing')"
        }
      },
      required: ["service_name"]
    }
  },
  {
    name: "check_availability",
    description: "Vérifie si une date/heure est disponible pour un service.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date au format YYYY-MM-DD" },
        heure: { type: "string", description: "Heure au format HH:MM" },
        service_name: { type: "string", description: "Nom du service" }
      },
      required: ["date", "heure", "service_name"]
    }
  },
  {
    name: "get_available_slots",
    description: "Retourne tous les créneaux disponibles pour une date et un service.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date au format YYYY-MM-DD" },
        service_name: { type: "string", description: "Nom du service" }
      },
      required: ["date", "service_name"]
    }
  },
  {
    name: "calculate_travel_fee",
    description: "Calcule les frais de déplacement selon la distance.",
    input_schema: {
      type: "object",
      properties: {
        distance_km: { type: "number", description: "Distance en kilomètres" }
      },
      required: ["distance_km"]
    }
  },
  {
    name: "create_booking",
    description: "Crée une réservation quand TOUTES les infos sont confirmées.",
    input_schema: {
      type: "object",
      properties: {
        service_name: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        heure: { type: "string", description: "HH:MM" },
        lieu: { type: "string", enum: ["domicile", "salon"] },
        adresse: { type: "string", description: "Adresse si domicile" },
        client_nom: { type: "string" },
        client_prenom: { type: "string" },
        client_telephone: { type: "string" }
      },
      required: ["service_name", "date", "heure", "lieu", "client_nom", "client_telephone"]
    }
  },
  {
    name: "find_appointment",
    description: "Recherche les rendez-vous d'un client par numéro de téléphone. Utilise cet outil quand un client veut annuler, modifier ou vérifier son RDV.",
    input_schema: {
      type: "object",
      properties: {
        telephone: { type: "string", description: "Numéro de téléphone du client (10 chiffres)" }
      },
      required: ["telephone"]
    }
  },
  {
    name: "cancel_appointment",
    description: "Annule un rendez-vous existant. Utilise UNIQUEMENT après avoir trouvé le RDV avec find_appointment ET obtenu la confirmation du client.",
    input_schema: {
      type: "object",
      properties: {
        appointment_id: { type: "number", description: "ID du rendez-vous à annuler" },
        reason: { type: "string", description: "Raison de l'annulation (optionnel)" }
      },
      required: ["appointment_id"]
    }
  },
  {
    name: "get_salon_info",
    description: "Récupère les informations du salon (adresse, horaires, téléphone).",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_business_hours",
    description: "Récupère les horaires d'ouverture de la semaine.",
    input_schema: {
      type: "object",
      properties: {
        jour: {
          type: "string",
          description: "Jour de la semaine (optionnel)",
          enum: ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
        }
      },
      required: []
    }
  },
  {
    name: "get_upcoming_days",
    description: "OBLIGATOIRE pour les disponibilités : Retourne les prochains jours avec leurs dates EXACTES et horaires. Utilise cet outil AVANT de parler des disponibilités.",
    input_schema: {
      type: "object",
      properties: {
        nb_jours: {
          type: "integer",
          description: "Nombre de jours à retourner (défaut: 14, max: 60)"
        }
      },
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - Gestion RDV et Clients
// ============================================

const TOOLS_ADMIN_GESTION = [
  {
    name: "get_stats",
    description: "Obtient les statistiques du salon (RDV, CA, clients).",
    input_schema: {
      type: "object",
      properties: {
        periode: {
          type: "string",
          enum: ["jour", "semaine", "mois", "annee"],
          description: "Période pour les statistiques"
        }
      },
      required: []
    }
  },
  {
    name: "get_rdv",
    description: "Récupère les rendez-vous.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date au format YYYY-MM-DD" },
        statut: { type: "string", enum: ["demande", "confirme", "annule", "termine"] },
        client_id: { type: "integer" }
      },
      required: []
    }
  },
  {
    name: "update_rdv",
    description: "Met à jour un rendez-vous existant.",
    input_schema: {
      type: "object",
      properties: {
        rdv_id: { type: "integer", description: "ID du RDV à modifier" },
        statut: { type: "string", enum: ["demande", "confirme", "annule", "termine", "no_show"] },
        notes: { type: "string" },
        date: { type: "string" },
        heure: { type: "string" }
      },
      required: ["rdv_id"]
    }
  },
  {
    name: "send_message",
    description: "Envoie un message SMS ou WhatsApp à un client.",
    input_schema: {
      type: "object",
      properties: {
        telephone: { type: "string" },
        message: { type: "string" },
        canal: { type: "string", enum: ["sms", "whatsapp"] }
      },
      required: ["telephone", "message"]
    }
  },
  {
    name: "get_client_info",
    description: "Récupère les informations complètes d'un client.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "integer" },
        telephone: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "search_clients",
    description: "Recherche des clients par nom, prénom ou téléphone.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Terme de recherche" }
      },
      required: ["query"]
    }
  }
];

// ============================================
// OUTILS ADMIN - Marketing & SEO
// ============================================

const TOOLS_ADMIN_SEO = [
  {
    name: "seo_analyze",
    description: "Analyse SEO d'une page ou du site.",
    input_schema: {
      type: "object",
      properties: {
        aspect: { type: "string", description: "Aspect à analyser (global, technique, contenu)" }
      },
      required: []
    }
  },
  {
    name: "seo_keywords",
    description: "Suggère des mots-clés SEO pour le salon.",
    input_schema: {
      type: "object",
      properties: {
        service: { type: "string", description: "Service pour les mots-clés" },
        localisation: { type: "string", description: "Zone géographique" }
      },
      required: []
    }
  },
  {
    name: "seo_meta_generate",
    description: "Génère des meta descriptions et titres SEO.",
    input_schema: {
      type: "object",
      properties: {
        page: { type: "string", description: "Page cible (accueil, services, contact)" }
      },
      required: ["page"]
    }
  }
];

const TOOLS_ADMIN_MARKETING = [
  {
    name: "generate_social_post",
    description: "Génère un post pour les réseaux sociaux.",
    input_schema: {
      type: "object",
      properties: {
        sujet: { type: "string", description: "Sujet du post" },
        plateforme: { type: "string", enum: ["instagram", "facebook", "tiktok"] },
        inclure_emojis: { type: "boolean" }
      },
      required: ["sujet"]
    }
  },
  {
    name: "marketing_campaign",
    description: "Crée une campagne marketing.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string" },
        objectif: { type: "string" },
        budget: { type: "number" },
        duree: { type: "string" }
      },
      required: ["objectif"]
    }
  },
  {
    name: "marketing_promo",
    description: "Crée une promotion ou offre spéciale.",
    input_schema: {
      type: "object",
      properties: {
        type_promo: { type: "string", enum: ["reduction", "offre", "parrainage"] },
        service: { type: "string" },
        valeur: { type: "number" },
        conditions: { type: "string" }
      },
      required: ["type_promo"]
    }
  },
  {
    name: "marketing_email",
    description: "Génère un email marketing.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["promo", "newsletter", "relance", "fidelite"] },
        cible: { type: "string" },
        sujet: { type: "string" }
      },
      required: ["type"]
    }
  },
  {
    name: "marketing_sms",
    description: "Génère un SMS marketing.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["promo", "rappel", "anniversaire"] },
        message: { type: "string" }
      },
      required: ["type"]
    }
  }
];

// ============================================
// OUTILS ADMIN - Stratégie Business
// ============================================

const TOOLS_ADMIN_STRATEGIE = [
  {
    name: "strategie_analyze",
    description: "Analyse stratégique du business (SWOT, concurrence).",
    input_schema: {
      type: "object",
      properties: {
        aspect: { type: "string", enum: ["swot", "concurrence", "marche", "global"] }
      },
      required: []
    }
  },
  {
    name: "strategie_pricing",
    description: "Analyse et optimise les tarifs.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["analyser", "optimiser", "comparer"] },
        service: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "strategie_objectifs",
    description: "Définit et suit les objectifs business.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["voir", "definir", "suivre"] },
        periode: { type: "string" },
        type_objectif: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "strategie_rapport",
    description: "Génère un rapport stratégique.",
    input_schema: {
      type: "object",
      properties: {
        periode: { type: "string" },
        format: { type: "string", enum: ["resume", "complet", "executif"] }
      },
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - Réseaux Sociaux
// ============================================

const TOOLS_ADMIN_SOCIAL = [
  {
    name: "social_publish",
    description: "Publie directement sur les réseaux sociaux.",
    input_schema: {
      type: "object",
      properties: {
        platforms: { type: "array", items: { type: "string" }, description: "Plateformes cibles" },
        content: { type: "string", description: "Contenu du post" },
        image_url: { type: "string", description: "URL de l'image (optionnel)" },
        confirm: { type: "boolean", description: "Confirmation de publication" }
      },
      required: ["platforms", "content"]
    }
  },
  {
    name: "social_schedule",
    description: "Programme un post pour plus tard.",
    input_schema: {
      type: "object",
      properties: {
        platforms: { type: "array", items: { type: "string" } },
        content: { type: "string" },
        image_url: { type: "string" },
        scheduled_time: { type: "string", description: "Date/heure de publication" }
      },
      required: ["platforms", "content", "scheduled_time"]
    }
  },
  {
    name: "social_status",
    description: "Vérifie le statut des plateformes et posts programmés.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["check_platforms", "list_scheduled", "cancel_scheduled"] },
        post_id: { type: "string" }
      },
      required: ["action"]
    }
  },
  {
    name: "social_generate_content",
    description: "Génère du contenu optimisé pour les réseaux sociaux.",
    input_schema: {
      type: "object",
      properties: {
        sujet: { type: "string" },
        type: { type: "string", enum: ["promo", "inspiration", "avant_apres", "conseil"] },
        platforms: { type: "array", items: { type: "string" } }
      },
      required: ["sujet"]
    }
  }
];

// ============================================
// OUTILS ADMIN - Création de Contenu
// ============================================

const TOOLS_ADMIN_CONTENU = [
  {
    name: "creer_image",
    description: "Génère une image avec DALL-E pour les réseaux sociaux.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Description de l'image" },
        style: { type: "string", enum: ["african", "modern", "elegant", "vibrant"] },
        format: { type: "string", enum: ["square", "portrait", "landscape"] }
      },
      required: ["prompt"]
    }
  },
  {
    name: "creer_legende",
    description: "Génère une légende optimisée pour un post.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["promo", "avant_apres", "citation", "star_semaine", "temoignage"] },
        platform: { type: "string", enum: ["instagram", "facebook", "tiktok"] },
        service: { type: "string" },
        prix: { type: "number" },
        prixPromo: { type: "number" },
        reduction: { type: "number" },
        theme: { type: "string" },
        prenom: { type: "string" },
        avis: { type: "string" }
      },
      required: ["type"]
    }
  },
  {
    name: "creer_post_complet",
    description: "Crée un post complet (image + légende) à partir d'un template.",
    input_schema: {
      type: "object",
      properties: {
        template: { type: "string", description: "Nom du template" },
        platform: { type: "string", enum: ["instagram", "facebook", "tiktok", "stories"] },
        service: { type: "string" },
        prix: { type: "number" },
        reduction: { type: "number" },
        theme: { type: "string" },
        style: { type: "string" }
      },
      required: ["template", "platform"]
    }
  },
  {
    name: "lister_templates",
    description: "Liste les templates de contenu disponibles.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "lister_images_generees",
    description: "Liste les images générées récemment.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Nombre d'images à retourner" }
      },
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - Mémoire & Contexte
// ============================================

const TOOLS_ADMIN_MEMOIRE = [
  {
    name: "memoriser",
    description: "Mémorise une information sur un client ou le salon.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["preference", "learning", "fact", "insight"] },
        category: { type: "string", enum: ["admin", "client", "business", "content"] },
        key: { type: "string", description: "Clé du souvenir" },
        value: { type: "string", description: "Valeur à mémoriser" },
        clientId: { type: "string" }
      },
      required: ["key", "value"]
    }
  },
  {
    name: "se_souvenir",
    description: "Récupère des souvenirs sur un sujet.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Mot-clé de recherche" },
        type: { type: "string" },
        category: { type: "string", enum: ["admin", "client", "business", "content", "all"] },
        key: { type: "string" },
        clientId: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "tout_savoir_sur_client",
    description: "Récupère toutes les informations mémorisées sur un client.",
    input_schema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "ID ou téléphone du client" }
      },
      required: ["clientId"]
    }
  },
  {
    name: "noter_insight",
    description: "Note une observation ou tendance importante.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["observation", "tendance", "recommandation", "alerte"] },
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "integer", description: "Priorité de 1 à 10" }
      },
      required: ["title", "description"]
    }
  },
  {
    name: "voir_insights",
    description: "Liste les observations en attente.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer" }
      },
      required: []
    }
  },
  {
    name: "oublier",
    description: "Supprime un souvenir de la mémoire.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Clé du souvenir à oublier" },
        category: { type: "string" }
      },
      required: ["key"]
    }
  },
  {
    name: "memory_stats",
    description: "Affiche les statistiques de la mémoire.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - Planification & Tâches
// ============================================

const TOOLS_ADMIN_PLANIFICATION = [
  {
    name: "planifier_post",
    description: "Planifie un post pour les réseaux sociaux.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["instagram", "facebook", "tiktok"] },
        template: { type: "string" },
        when: { type: "string", description: "Quand publier (demain 10h, dans 2h, tous les mardis)" },
        service: { type: "string" },
        customText: { type: "string" },
        imagePrompt: { type: "string" }
      },
      required: ["platform", "when"]
    }
  },
  {
    name: "voir_taches_planifiees",
    description: "Liste toutes les tâches planifiées.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "annuler_tache",
    description: "Annule une tâche planifiée.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "ID de la tâche" },
        recurring: { type: "boolean", description: "Si c'est une tâche récurrente" }
      },
      required: ["taskId"]
    }
  },
  {
    name: "planifier_rappel",
    description: "Planifie un rappel de RDV pour un client.",
    input_schema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        bookingId: { type: "integer" },
        reminderDate: { type: "string", description: "Date du rappel" },
        channel: { type: "string", enum: ["whatsapp", "sms", "email"] }
      },
      required: ["clientId", "reminderDate"]
    }
  },
  {
    name: "planifier_relance",
    description: "Planifie une relance pour un client inactif.",
    input_schema: {
      type: "object",
      properties: {
        clientId: { type: "string" },
        delayDays: { type: "integer", description: "Délai en jours avant relance" }
      },
      required: ["clientId"]
    }
  },
  {
    name: "stats_queue",
    description: "Affiche les statistiques de la queue de tâches.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - Computer Use (Navigateur)
// ============================================

const TOOLS_ADMIN_COMPUTER_USE = [
  {
    name: "ouvrir_navigateur",
    description: "Lance le navigateur contrôlé.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "fermer_navigateur",
    description: "Ferme le navigateur.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "ouvrir_page",
    description: "Ouvre une URL et prend un screenshot.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" }
      },
      required: ["url"]
    }
  },
  {
    name: "prendre_screenshot",
    description: "Capture l'écran actuel.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "connecter_instagram",
    description: "Se connecte à Instagram.",
    input_schema: {
      type: "object",
      properties: {
        username: { type: "string" },
        password: { type: "string" }
      },
      required: ["username", "password"]
    }
  },
  {
    name: "publier_instagram_direct",
    description: "Publie directement sur Instagram.",
    input_schema: {
      type: "object",
      properties: {
        imagePath: { type: "string" },
        caption: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } }
      },
      required: ["imagePath", "caption"]
    }
  },
  {
    name: "connecter_facebook",
    description: "Se connecte à Facebook.",
    input_schema: {
      type: "object",
      properties: {
        email: { type: "string" },
        password: { type: "string" }
      },
      required: ["email", "password"]
    }
  },
  {
    name: "publier_facebook_direct",
    description: "Publie directement sur Facebook.",
    input_schema: {
      type: "object",
      properties: {
        pageUrl: { type: "string" },
        content: { type: "string" },
        imagePath: { type: "string" }
      },
      required: ["content"]
    }
  },
  {
    name: "connecter_tiktok",
    description: "Se connecte à TikTok.",
    input_schema: {
      type: "object",
      properties: {
        username: { type: "string" },
        password: { type: "string" }
      },
      required: ["username", "password"]
    }
  },
  {
    name: "publier_tiktok_direct",
    description: "Publie directement sur TikTok.",
    input_schema: {
      type: "object",
      properties: {
        videoPath: { type: "string" },
        caption: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } }
      },
      required: ["videoPath", "caption"]
    }
  }
];

// ============================================
// OUTILS ADMIN - Sandbox (Test)
// ============================================

const TOOLS_ADMIN_SANDBOX = [
  {
    name: "definir_mode_sandbox",
    description: "Change le mode sandbox (simulation, validation, production).",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["simulation", "validation", "production"] }
      },
      required: ["mode"]
    }
  },
  {
    name: "voir_mode_sandbox",
    description: "Affiche le mode sandbox actuel.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "simuler_post",
    description: "Simule un post sans le publier.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["instagram", "facebook", "tiktok"] },
        caption: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
        imagePath: { type: "string" },
        videoPath: { type: "string" }
      },
      required: ["platform", "caption"]
    }
  },
  {
    name: "analyser_contenu",
    description: "Analyse la qualité d'un contenu avec score.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
        hasMedia: { type: "boolean" },
        platform: { type: "string" }
      },
      required: ["content", "platform"]
    }
  },
  {
    name: "valider_post",
    description: "Approuve ou rejette un post en attente.",
    input_schema: {
      type: "object",
      properties: {
        postId: { type: "string" },
        approved: { type: "boolean" },
        feedback: { type: "string" }
      },
      required: ["postId", "approved"]
    }
  },
  {
    name: "voir_posts_en_attente",
    description: "Liste les posts en attente de validation.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "voir_posts_simules",
    description: "Liste tous les posts simulés.",
    input_schema: {
      type: "object",
      properties: {
        platform: { type: "string" },
        status: { type: "string" },
        limit: { type: "integer" }
      },
      required: []
    }
  },
  {
    name: "voir_post_simule",
    description: "Affiche les détails d'un post simulé.",
    input_schema: {
      type: "object",
      properties: {
        postId: { type: "string" }
      },
      required: ["postId"]
    }
  },
  {
    name: "supprimer_post_simule",
    description: "Supprime un post simulé.",
    input_schema: {
      type: "object",
      properties: {
        postId: { type: "string" }
      },
      required: ["postId"]
    }
  },
  {
    name: "executer_post_approuve",
    description: "Publie un post qui a été approuvé.",
    input_schema: {
      type: "object",
      properties: {
        postId: { type: "string" }
      },
      required: ["postId"]
    }
  },
  {
    name: "stats_sandbox",
    description: "Statistiques du sandbox.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "nettoyer_sandbox",
    description: "Supprime les anciens fichiers du sandbox.",
    input_schema: {
      type: "object",
      properties: {
        olderThanDays: { type: "integer" }
      },
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - Environnements
// ============================================

const TOOLS_ADMIN_ENVIRONNEMENTS = [
  {
    name: "voir_environnement",
    description: "Affiche l'environnement actuel et sa configuration.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "lister_environnements",
    description: "Liste tous les environnements disponibles.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "changer_environnement",
    description: "Change d'environnement.",
    input_schema: {
      type: "object",
      properties: {
        environnement: { type: "string", enum: ["development", "staging", "production"] }
      },
      required: ["environnement"]
    }
  },
  {
    name: "verifier_action",
    description: "Vérifie si une action est autorisée dans l'environnement actuel.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string" }
      },
      required: ["action"]
    }
  },
  {
    name: "verifier_feature",
    description: "Vérifie si une feature est activée.",
    input_schema: {
      type: "object",
      properties: {
        feature: { type: "string" }
      },
      required: ["feature"]
    }
  },
  {
    name: "obtenir_donnees_env",
    description: "Récupère des données selon l'environnement.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["stats", "clients", "rdv"] }
      },
      required: ["type"]
    }
  },
  {
    name: "comparer_environnements",
    description: "Compare deux environnements.",
    input_schema: {
      type: "object",
      properties: {
        env1: { type: "string" },
        env2: { type: "string" }
      },
      required: ["env1", "env2"]
    }
  },
  {
    name: "passer_en_dev",
    description: "Passe en mode développement.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "passer_en_staging",
    description: "Passe en mode staging.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "passer_en_production",
    description: "Passe en mode production (confirmation requise).",
    input_schema: {
      type: "object",
      properties: {
        confirmation: { type: "string", description: "Doit être 'JE CONFIRME'" }
      },
      required: ["confirmation"]
    }
  }
];

// ============================================
// OUTILS ADMIN - Fichiers & Google Drive
// ============================================

const TOOLS_ADMIN_FICHIERS = [
  {
    name: "file_list",
    description: "Liste les fichiers dans un répertoire du workspace.",
    input_schema: {
      type: "object",
      properties: {
        directory: { type: "string", description: "Sous-dossier (documents, images, exports, imports, temp)" }
      },
      required: []
    }
  },
  {
    name: "file_read",
    description: "Lit le contenu d'un fichier.",
    input_schema: {
      type: "object",
      properties: {
        filepath: { type: "string", description: "Chemin relatif du fichier" }
      },
      required: ["filepath"]
    }
  },
  {
    name: "file_write",
    description: "Écrit ou crée un fichier.",
    input_schema: {
      type: "object",
      properties: {
        filepath: { type: "string" },
        content: { type: "string" }
      },
      required: ["filepath", "content"]
    }
  },
  {
    name: "file_append",
    description: "Ajoute du contenu à la fin d'un fichier.",
    input_schema: {
      type: "object",
      properties: {
        filepath: { type: "string" },
        content: { type: "string" }
      },
      required: ["filepath", "content"]
    }
  },
  {
    name: "file_delete",
    description: "Supprime un fichier.",
    input_schema: {
      type: "object",
      properties: {
        filepath: { type: "string" }
      },
      required: ["filepath"]
    }
  },
  {
    name: "file_search",
    description: "Recherche dans les fichiers.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Terme à rechercher" },
        directory: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "file_copy",
    description: "Copie un fichier.",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string" },
        destination: { type: "string" }
      },
      required: ["source", "destination"]
    }
  },
  {
    name: "file_move",
    description: "Déplace ou renomme un fichier.",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string" },
        destination: { type: "string" }
      },
      required: ["source", "destination"]
    }
  },
  {
    name: "workspace_stats",
    description: "Affiche les statistiques du workspace.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - Google Drive
// ============================================

const TOOLS_ADMIN_GDRIVE = [
  {
    name: "gdrive_status",
    description: "Vérifie si Google Drive est connecté.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "gdrive_list",
    description: "Liste les fichiers Google Drive.",
    input_schema: {
      type: "object",
      properties: {
        folder_id: { type: "string" },
        query: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "gdrive_search",
    description: "Recherche dans Google Drive.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "gdrive_read",
    description: "Lit le contenu d'un fichier Drive.",
    input_schema: {
      type: "object",
      properties: {
        file_id: { type: "string" }
      },
      required: ["file_id"]
    }
  },
  {
    name: "gdrive_create",
    description: "Crée un fichier sur Google Drive.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        content: { type: "string" },
        folder_id: { type: "string" }
      },
      required: ["name", "content"]
    }
  },
  {
    name: "gdrive_update",
    description: "Met à jour un fichier Drive.",
    input_schema: {
      type: "object",
      properties: {
        file_id: { type: "string" },
        content: { type: "string" }
      },
      required: ["file_id", "content"]
    }
  },
  {
    name: "gdrive_delete",
    description: "Supprime un fichier Drive.",
    input_schema: {
      type: "object",
      properties: {
        file_id: { type: "string" }
      },
      required: ["file_id"]
    }
  },
  {
    name: "gdrive_create_folder",
    description: "Crée un dossier sur Google Drive.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        parent_id: { type: "string" }
      },
      required: ["name"]
    }
  },
  {
    name: "gdrive_download",
    description: "Télécharge un fichier Drive vers le serveur.",
    input_schema: {
      type: "object",
      properties: {
        file_id: { type: "string" },
        local_dir: { type: "string" }
      },
      required: ["file_id"]
    }
  },
  {
    name: "gdrive_upload",
    description: "Upload un fichier local vers Google Drive.",
    input_schema: {
      type: "object",
      properties: {
        local_path: { type: "string" },
        folder_id: { type: "string" }
      },
      required: ["local_path"]
    }
  }
];

// ============================================
// OUTILS ADMIN - Agent Autonome
// ============================================

const TOOLS_ADMIN_AGENT = [
  {
    name: "agent_plan",
    description: "Décompose une demande complexe en étapes.",
    input_schema: {
      type: "object",
      properties: {
        request: { type: "string", description: "La demande à décomposer" }
      },
      required: ["request"]
    }
  },
  {
    name: "agent_execute",
    description: "Exécute une tâche planifiée.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "integer" }
      },
      required: ["task_id"]
    }
  },
  {
    name: "agent_confirm",
    description: "Confirme et continue une tâche en attente.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "integer" }
      },
      required: ["task_id"]
    }
  },
  {
    name: "agent_cancel",
    description: "Annule une tâche.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "integer" }
      },
      required: ["task_id"]
    }
  },
  {
    name: "agent_status",
    description: "Vérifie le statut des tâches.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "integer" }
      },
      required: []
    }
  },
  {
    name: "agent_history",
    description: "Affiche l'historique des tâches.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer" }
      },
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - Recherche Web
// ============================================

const TOOLS_ADMIN_RECHERCHE = [
  {
    name: "recherche_web",
    description: "Effectue une recherche web générale.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Terme de recherche" },
        max_results: { type: "integer" }
      },
      required: ["query"]
    }
  },
  {
    name: "recherche_actualites",
    description: "Recherche les actualités récentes.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        domaine: { type: "string", enum: ["beaute", "coiffure", "mode", "business"] }
      },
      required: ["query"]
    }
  },
  {
    name: "recherche_concurrent",
    description: "Recherche des informations sur un concurrent.",
    input_schema: {
      type: "object",
      properties: {
        nom: { type: "string", description: "Nom du salon concurrent" },
        localisation: { type: "string" }
      },
      required: ["nom"]
    }
  },
  {
    name: "recherche_tendances",
    description: "Recherche les tendances coiffure afro.",
    input_schema: {
      type: "object",
      properties: {
        theme: { type: "string", enum: ["locks", "tresses", "braids", "naturel", "coloration"] }
      },
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - Comptabilité & Commercial
// ============================================

// ============================================
// OUTILS ADMIN - Commercial
// ============================================

const TOOLS_ADMIN_COMMERCIAL = [
  {
    name: "commercial_devis",
    description: "Génère un devis.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["creer", "voir", "envoyer"] },
        client_id: { type: "integer" },
        services: { type: "array", items: { type: "string" } },
        notes: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "commercial_ventes",
    description: "Analyse les ventes.",
    input_schema: {
      type: "object",
      properties: {
        periode: { type: "string" },
        type_analyse: { type: "string", enum: ["service", "client", "global"] },
        comparer: { type: "boolean" }
      },
      required: []
    }
  },
  {
    name: "commercial_relances",
    description: "Gère les relances clients.",
    input_schema: {
      type: "object",
      properties: {
        type_relance: { type: "string", enum: ["devis", "inactif", "anniversaire"] },
        action: { type: "string", enum: ["lister", "envoyer"] }
      },
      required: []
    }
  },
  {
    name: "commercial_performance",
    description: "Analyse les performances commerciales.",
    input_schema: {
      type: "object",
      properties: {
        indicateurs: { type: "array", items: { type: "string" } },
        periode: { type: "string" }
      },
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - Comptabilité
// ============================================

const TOOLS_ADMIN_COMPTABLE = [
  {
    name: "comptable_facturation",
    description: "Génère et gère les factures.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["creer", "lister", "exporter"] },
        periode: { type: "string" },
        rdv_id: { type: "integer" },
        format: { type: "string", enum: ["pdf", "csv"] }
      },
      required: []
    }
  },
  {
    name: "comptable_depenses",
    description: "Gère les dépenses.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["ajouter", "lister", "analyser"] },
        categorie: { type: "string" },
        montant: { type: "number" },
        description: { type: "string" },
        periode: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "comptable_tresorerie",
    description: "Analyse la trésorerie.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["voir", "prevision", "flux"] },
        periode: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "comptable_fiscal",
    description: "Gestion fiscale (TVA, URSSAF).",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["tva", "urssaf", "cotisations"] },
        periode: { type: "string" },
        action: { type: "string", enum: ["calculer", "echeances", "declarer"] }
      },
      required: []
    }
  },
  {
    name: "comptable_rapport",
    description: "Génère un rapport comptable.",
    input_schema: {
      type: "object",
      properties: {
        type_rapport: { type: "string", enum: ["mensuel", "trimestriel", "annuel"] },
        periode: { type: "string" },
        format: { type: "string", enum: ["resume", "complet"] }
      },
      required: []
    }
  }
];

// ============================================
// OUTILS ADMIN - RH (Ressources Humaines)
// ============================================

const TOOLS_ADMIN_RH = [
  {
    name: "rh_planning",
    description: "Gère le planning de travail.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["voir", "modifier", "optimiser"] },
        semaine: { type: "string" },
        modifications: { type: "object" }
      },
      required: []
    }
  },
  {
    name: "rh_temps_travail",
    description: "Analyse le temps de travail.",
    input_schema: {
      type: "object",
      properties: {
        periode: { type: "string" },
        type: { type: "string", enum: ["heures", "productivite", "repartition"] }
      },
      required: []
    }
  },
  {
    name: "rh_conges",
    description: "Gère les congés et jours de repos.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["poser", "voir", "annuler"] },
        date_debut: { type: "string" },
        date_fin: { type: "string" },
        motif: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "rh_objectifs",
    description: "Définit et suit les objectifs personnels.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["voir", "definir", "suivre"] },
        type_objectif: { type: "string" },
        periode: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "rh_formation",
    description: "Recherche et planifie des formations.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["rechercher", "planifier", "historique"] },
        domaine: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "rh_bien_etre",
    description: "Conseils sur l'équilibre travail/vie.",
    input_schema: {
      type: "object",
      properties: {
        aspect: { type: "string", enum: ["stress", "equilibre", "organisation", "global"] }
      },
      required: []
    }
  }
];

// ============================================
// ASSEMBLAGE DES OUTILS ADMIN
// ============================================

export const TOOLS_ADMIN = [
  // Inclut tous les outils clients
  ...TOOLS_CLIENT,
  // Outils de gestion
  ...TOOLS_ADMIN_GESTION,
  // SEO
  ...TOOLS_ADMIN_SEO,
  // Marketing
  ...TOOLS_ADMIN_MARKETING,
  // Stratégie Business
  ...TOOLS_ADMIN_STRATEGIE,
  // Réseaux sociaux
  ...TOOLS_ADMIN_SOCIAL,
  // Commercial
  ...TOOLS_ADMIN_COMMERCIAL,
  // Comptabilité
  ...TOOLS_ADMIN_COMPTABLE,
  // RH
  ...TOOLS_ADMIN_RH,
  // Création de contenu
  ...TOOLS_ADMIN_CONTENU,
  // Mémoire
  ...TOOLS_ADMIN_MEMOIRE,
  // Planification
  ...TOOLS_ADMIN_PLANIFICATION,
  // Fichiers
  ...TOOLS_ADMIN_FICHIERS,
  // Google Drive
  ...TOOLS_ADMIN_GDRIVE,
  // Agent autonome
  ...TOOLS_ADMIN_AGENT,
  // Recherche web
  ...TOOLS_ADMIN_RECHERCHE,
  // Computer Use
  ...TOOLS_ADMIN_COMPUTER_USE,
  // Sandbox
  ...TOOLS_ADMIN_SANDBOX,
  // Environnements
  ...TOOLS_ADMIN_ENVIRONNEMENTS
];

// ============================================
// HELPERS
// ============================================

/**
 * Récupère les outils par catégorie
 */
export function getToolsByCategory(category) {
  const categories = {
    client: TOOLS_CLIENT,
    gestion: TOOLS_ADMIN_GESTION,
    seo: TOOLS_ADMIN_SEO,
    marketing: TOOLS_ADMIN_MARKETING,
    strategie: TOOLS_ADMIN_STRATEGIE,
    social: TOOLS_ADMIN_SOCIAL,
    commercial: TOOLS_ADMIN_COMMERCIAL,
    comptable: TOOLS_ADMIN_COMPTABLE,
    rh: TOOLS_ADMIN_RH,
    contenu: TOOLS_ADMIN_CONTENU,
    memoire: TOOLS_ADMIN_MEMOIRE,
    planification: TOOLS_ADMIN_PLANIFICATION,
    fichiers: TOOLS_ADMIN_FICHIERS,
    gdrive: TOOLS_ADMIN_GDRIVE,
    agent: TOOLS_ADMIN_AGENT,
    recherche: TOOLS_ADMIN_RECHERCHE,
    computer_use: TOOLS_ADMIN_COMPUTER_USE,
    sandbox: TOOLS_ADMIN_SANDBOX,
    environnements: TOOLS_ADMIN_ENVIRONNEMENTS,
    admin: TOOLS_ADMIN
  };
  return categories[category] || [];
}

/**
 * Récupère un outil par son nom
 */
export function getToolByName(name) {
  return TOOLS_ADMIN.find(t => t.name === name);
}

/**
 * Liste tous les noms d'outils disponibles
 */
export function listToolNames(type = 'admin') {
  const tools = type === 'client' ? TOOLS_CLIENT : TOOLS_ADMIN;
  return tools.map(t => t.name);
}

// ============================================
// STATISTIQUES
// ============================================

export const TOOLS_STATS = {
  client: TOOLS_CLIENT.length,
  gestion: TOOLS_ADMIN_GESTION.length,
  seo: TOOLS_ADMIN_SEO.length,
  marketing: TOOLS_ADMIN_MARKETING.length,
  strategie: TOOLS_ADMIN_STRATEGIE.length,
  social: TOOLS_ADMIN_SOCIAL.length,
  commercial: TOOLS_ADMIN_COMMERCIAL.length,
  comptable: TOOLS_ADMIN_COMPTABLE.length,
  rh: TOOLS_ADMIN_RH.length,
  contenu: TOOLS_ADMIN_CONTENU.length,
  memoire: TOOLS_ADMIN_MEMOIRE.length,
  planification: TOOLS_ADMIN_PLANIFICATION.length,
  fichiers: TOOLS_ADMIN_FICHIERS.length,
  gdrive: TOOLS_ADMIN_GDRIVE.length,
  agent: TOOLS_ADMIN_AGENT.length,
  recherche: TOOLS_ADMIN_RECHERCHE.length,
  computer_use: TOOLS_ADMIN_COMPUTER_USE.length,
  sandbox: TOOLS_ADMIN_SANDBOX.length,
  environnements: TOOLS_ADMIN_ENVIRONNEMENTS.length,
  admin_total: TOOLS_ADMIN.length
};

console.log(`[TOOLS REGISTRY] Chargé: ${TOOLS_CLIENT.length} outils client, ${TOOLS_ADMIN.length} outils admin`);

export default {
  TOOLS_CLIENT,
  TOOLS_ADMIN,
  getToolsByCategory,
  getToolByName,
  listToolNames,
  TOOLS_STATS
};
