/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║   HALIMAH AI - Assistante Client IA                           [LOCKED]        ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   ⛔ FICHIER VERROUILLE - Ne pas modifier sans autorisation                   ║
 * ║                                                                               ║
 * ║   Claude gere la CONVERSATION (comprehension naturelle)                       ║
 * ║   Les OUTILS gerent les DONNEES (prix, dispo, creation RDV)                   ║
 * ║                                                                               ║
 * ║   Claude NE PEUT PAS inventer : prix, disponibilites, infos metier            ║
 * ║                                                                               ║
 * ║   *** NEXUS CORE COMPLIANT ***                                                ║
 * ║   - SERVICES : importes depuis businessRules.js                               ║
 * ║   - TRAVEL_FEES : importes depuis businessRules.js                            ║
 * ║   - Aucune valeur hardcodee autorisee                                         ║
 * ║                                                                               ║
 * ║   Voir : backend/NEXUS_LOCK.md                                                ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
// Import du prompt vocal naturel
import { getVoicePrompt, getGreeting, getGoodbye } from '../prompts/voicePrompt.js';
// Import Google Maps pour calcul des distances
import { getDistanceFromSalon } from '../services/googleMapsService.js';
// *** NEXUS CORE - SOURCE UNIQUE DE VÉRITÉ ***
import { SERVICES as BUSINESS_SERVICES, TRAVEL_FEES, BUSINESS_HOURS } from '../config/businessRules.js';

// ============================================
// CONFIGURATION
// ============================================

const anthropic = new Anthropic();

function getSupabase() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return null;
}

// ============================================
// DONNÉES MÉTIER - IMPORTÉES DE businessRules.js
// ============================================

// Transformation des services depuis businessRules.js vers le format attendu par halimahAI
const SERVICES = Object.fromEntries(
  Object.entries(BUSINESS_SERVICES).map(([key, service]) => [
    service.id,
    {
      nom: service.name,
      prix: service.price,
      duree: service.durationMinutes,
      categorie: service.category,
      blocksFullDay: service.blocksFullDay || false
    }
  ])
);

const HORAIRES = {
  1: { jour: 'Lundi', ouvert: true, debut: 9, fin: 18 },
  2: { jour: 'Mardi', ouvert: true, debut: 9, fin: 18 },
  3: { jour: 'Mercredi', ouvert: true, debut: 9, fin: 18 },
  4: { jour: 'Jeudi', ouvert: true, debut: 9, fin: 13 },
  5: { jour: 'Vendredi', ouvert: true, debut: 13, fin: 18 },
  6: { jour: 'Samedi', ouvert: true, debut: 9, fin: 18 },
  0: { jour: 'Dimanche', ouvert: false }
};

const SALON_INFO = {
  nom: "Fat's Hair-Afro",
  adresse: "8 rue des Monts Rouges, 95130 Franconville",
  telephone: "07 82 23 50 20",
  coiffeuse: "Fatou"
};

// ============================================
// OUTILS DÉTERMINISTES (Claude appelle ces fonctions)
// ============================================

const tools = [
  {
    name: "parse_date",
    description: "OBLIGATOIRE : Convertit une date relative ('demain', 'samedi prochain', 'lundi') en format YYYY-MM-DD. Utilise TOUJOURS cet outil avant check_availability.",
    input_schema: {
      type: "object",
      properties: {
        date_text: {
          type: "string",
          description: "La date en langage naturel (ex: 'demain', 'samedi prochain', 'lundi', 'après-demain', '25 janvier')"
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
    description: "Récupère la liste de tous les services avec leurs prix EXACTS. Utilise cet outil quand le client demande les services, les prix, ou veut savoir ce qui est proposé.",
    input_schema: {
      type: "object",
      properties: {
        categorie: {
          type: "string",
          description: "Filtrer par catégorie: 'locks', 'soins', 'tresses', 'coloration', ou 'all' pour tout",
          enum: ["locks", "soins", "tresses", "coloration", "all"]
        }
      },
      required: []
    }
  },
  {
    name: "get_price",
    description: "Récupère le prix EXACT d'un service spécifique. TOUJOURS utiliser cet outil pour donner un prix, ne JAMAIS inventer.",
    input_schema: {
      type: "object",
      properties: {
        service_id: {
          type: "string",
          description: "ID du service (ex: 'creation_locks', 'shampoing', 'braids')"
        }
      },
      required: ["service_id"]
    }
  },
  {
    name: "check_availability",
    description: "Vérifie si une date/heure est disponible pour un service. TOUJOURS utiliser avant de confirmer un créneau.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date au format YYYY-MM-DD" },
        heure: { type: "integer", description: "Heure (9-18)" },
        duree_minutes: { type: "integer", description: "Durée du service en minutes" }
      },
      required: ["date", "heure", "duree_minutes"]
    }
  },
  {
    name: "get_next_available_slot",
    description: "Trouve le prochain créneau VRAIMENT disponible pour un service. Utilise cet outil pour proposer une date au client.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "ID du service" },
        after_date: { type: "string", description: "Chercher après cette date (YYYY-MM-DD), optionnel" }
      },
      required: ["service_id"]
    }
  },
  {
    name: "calculate_travel_fee",
    description: "Calcule les frais de déplacement pour une adresse. 10€ de base + 1.10€/km après 8km.",
    input_schema: {
      type: "object",
      properties: {
        adresse: { type: "string", description: "Adresse du client" }
      },
      required: ["adresse"]
    }
  },
  {
    name: "create_booking",
    description: "Crée une réservation UNIQUEMENT quand toutes les infos sont confirmées par le client.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD" },
        heure: { type: "integer" },
        lieu: { type: "string", enum: ["domicile", "fatou"] },
        adresse: { type: "string", description: "Adresse si domicile" },
        client_nom: { type: "string" },
        client_telephone: { type: "string" }
      },
      required: ["service_id", "date", "heure", "lieu", "client_nom", "client_telephone"]
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
  }
];

// ============================================
// IMPLÉMENTATION DES OUTILS
// ============================================

async function executeTool(toolName, toolInput) {
  console.log(`[HALIMAH AI] Outil appelé: ${toolName}`, toolInput);

  switch (toolName) {
    case 'parse_date': {
      const { date_text, heure } = toolInput;
      const now = new Date();
      now.setHours(12, 0, 0, 0); // Normaliser

      let targetDate = null;
      const text = date_text.toLowerCase().trim();

      // Dictionnaire des jours
      const joursMap = {
        'dimanche': 0, 'lundi': 1, 'mardi': 2, 'mercredi': 3,
        'jeudi': 4, 'vendredi': 5, 'samedi': 6
      };

      // Cas simples
      if (text === 'demain') {
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (text === 'après-demain' || text === 'apres-demain' || text === 'après demain') {
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 2);
      } else if (text === "aujourd'hui" || text === 'aujourdhui') {
        targetDate = new Date(now);
      } else {
        // Chercher un jour de la semaine
        for (const [jour, index] of Object.entries(joursMap)) {
          if (text.includes(jour)) {
            targetDate = new Date(now);
            const currentDay = now.getDay();
            let daysToAdd = index - currentDay;
            if (daysToAdd <= 0) daysToAdd += 7; // Prochain occurrence
            targetDate.setDate(targetDate.getDate() + daysToAdd);
            break;
          }
        }

        // Chercher une date au format "25 janvier" ou "25/01"
        if (!targetDate) {
          const moisMap = {
            'janvier': 0, 'février': 1, 'fevrier': 1, 'mars': 2, 'avril': 3,
            'mai': 4, 'juin': 5, 'juillet': 6, 'août': 7, 'aout': 7,
            'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11, 'decembre': 11
          };

          // Format "25 janvier"
          for (const [moisNom, moisIndex] of Object.entries(moisMap)) {
            const regex = new RegExp(`(\\d{1,2})\\s*${moisNom}`);
            const match = text.match(regex);
            if (match) {
              targetDate = new Date(now.getFullYear(), moisIndex, parseInt(match[1]));
              if (targetDate < now) {
                targetDate.setFullYear(targetDate.getFullYear() + 1);
              }
              break;
            }
          }

          // Format "25/01" ou "25/1"
          if (!targetDate) {
            const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})/);
            if (slashMatch) {
              targetDate = new Date(now.getFullYear(), parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
              if (targetDate < now) {
                targetDate.setFullYear(targetDate.getFullYear() + 1);
              }
            }
          }
        }
      }

      if (!targetDate) {
        return {
          success: false,
          error: `Je n'ai pas compris la date "${date_text}". Pouvez-vous préciser le jour ?`
        };
      }

      const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth()+1).padStart(2,'0')}-${String(targetDate.getDate()).padStart(2,'0')}`;
      const jourSemaine = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][targetDate.getDay()];

      return {
        success: true,
        date: dateStr,
        jour: jourSemaine,
        jour_numero: targetDate.getDate(),
        mois: targetDate.getMonth() + 1,
        heure: heure || null,
        dateFormatee: `${jourSemaine} ${targetDate.getDate()}/${targetDate.getMonth()+1}/${targetDate.getFullYear()}`
      };
    }

    case 'get_services': {
      const categorie = toolInput.categorie || 'all';
      const services = Object.entries(SERVICES)
        .filter(([id, s]) => categorie === 'all' || s.categorie === categorie)
        .map(([id, s]) => ({
          id,
          nom: s.nom,
          prix: `${s.prix}€`,
          duree: s.duree >= 60 ? `${Math.floor(s.duree/60)}h${s.duree%60 > 0 ? s.duree%60 : ''}` : `${s.duree}min`,
          categorie: s.categorie
        }));
      return { success: true, services };
    }

    case 'get_price': {
      const service = SERVICES[toolInput.service_id];
      if (!service) {
        // Chercher par nom partiel
        const found = Object.entries(SERVICES).find(([id, s]) =>
          s.nom.toLowerCase().includes(toolInput.service_id.toLowerCase()) ||
          id.includes(toolInput.service_id.toLowerCase())
        );
        if (found) {
          return { success: true, service: found[1].nom, prix: found[1].prix, duree: found[1].duree };
        }
        return { success: false, error: "Service non trouvé" };
      }
      return { success: true, service: service.nom, prix: service.prix, duree: service.duree };
    }

    case 'check_availability': {
      const db = getSupabase();
      if (!db) return { success: true, disponible: true, message: "Base non connectée, supposé disponible" };

      const { date, heure, duree_minutes } = toolInput;
      const { data: rdvs } = await db
        .from('reservations')
        .select('heure, duree_minutes')
        .eq('date', date)
        .in('statut', ['demande', 'confirme', 'en_attente']);

      if (!rdvs || rdvs.length === 0) {
        return { success: true, disponible: true };
      }

      // Vérifier les conflits
      const heureDebut = heure;
      const heureFin = heure + Math.ceil(duree_minutes / 60);

      for (const rdv of rdvs) {
        const rdvDebut = parseInt(rdv.heure);
        const rdvFin = rdvDebut + Math.ceil((rdv.duree_minutes || 60) / 60);
        if (!(heureFin <= rdvDebut || heureDebut >= rdvFin)) {
          return { success: true, disponible: false, conflit: `Créneau ${rdvDebut}h-${rdvFin}h déjà pris` };
        }
      }

      return { success: true, disponible: true };
    }

    case 'get_next_available_slot': {
      const service = SERVICES[toolInput.service_id];
      if (!service) return { success: false, error: "Service non trouvé" };

      const db = getSupabase();
      const dureeMinutes = service.duree;
      const now = new Date();
      now.setHours(12, 0, 0, 0);

      for (let i = 1; i <= 30; i++) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() + i);

        const jourSemaine = checkDate.getDay();
        const horaires = HORAIRES[jourSemaine];
        if (!horaires || !horaires.ouvert) continue;

        const heuresJournee = (horaires.fin - horaires.debut) * 60;
        if (dureeMinutes > heuresJournee) continue;

        const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth()+1).padStart(2,'0')}-${String(checkDate.getDate()).padStart(2,'0')}`;

        // Vérifier la dispo en base
        if (db) {
          const { data: rdvs } = await db
            .from('reservations')
            .select('heure, duree_minutes')
            .eq('date', dateStr)
            .in('statut', ['demande', 'confirme', 'en_attente']);

          // Trouver un créneau libre
          const heuresOccupees = new Set();
          if (rdvs) {
            for (const rdv of rdvs) {
              const h = parseInt(rdv.heure);
              const duree = rdv.duree_minutes || 60;
              for (let x = h; x < h + Math.ceil(duree/60); x++) {
                heuresOccupees.add(x);
              }
            }
          }

          // Chercher premier créneau libre
          for (let h = horaires.debut; h <= horaires.fin - Math.ceil(dureeMinutes/60); h++) {
            let libre = true;
            for (let x = h; x < h + Math.ceil(dureeMinutes/60); x++) {
              if (heuresOccupees.has(x)) { libre = false; break; }
            }
            if (libre) {
              return {
                success: true,
                date: dateStr,
                jour: horaires.jour,
                heure: h,
                dateFormatee: `${horaires.jour} ${checkDate.getDate()}/${checkDate.getMonth()+1}/${checkDate.getFullYear()}`
              };
            }
          }
        } else {
          // Sans DB, proposer 9h
          return {
            success: true,
            date: dateStr,
            jour: horaires.jour,
            heure: horaires.debut,
            dateFormatee: `${horaires.jour} ${checkDate.getDate()}/${checkDate.getMonth()+1}/${checkDate.getFullYear()}`
          };
        }
      }

      return { success: false, error: "Aucun créneau disponible dans les 30 prochains jours" };
    }

    case 'calculate_travel_fee': {
      // Calcul RÉEL avec Google Maps
      const clientAddress = toolInput.adresse;
      if (!clientAddress) {
        return { success: false, error: "Adresse client requise" };
      }

      try {
        const distanceResult = await getDistanceFromSalon(clientAddress);
        const distanceKm = distanceResult.distance_km;

        // *** UTILISE TRAVEL_FEES depuis businessRules.js (NEXUS CORE) ***
        const frais = TRAVEL_FEES.calculate(distanceKm);

        return {
          success: true,
          frais: frais,
          distance_km: distanceKm,
          duree_trajet: distanceResult.duree_text,
          adresse_validee: distanceResult.destination,
          message: `Frais de déplacement : ${frais}€ (${distanceKm} km, trajet ${distanceResult.duree_text})`
        };
      } catch (error) {
        console.error('[HALIMAH AI] Erreur calcul distance:', error.message);
        // Fallback si Google Maps échoue - utilise BASE_FEE depuis NEXUS CORE
        return {
          success: true,
          frais: TRAVEL_FEES.BASE_FEE,
          message: `Frais de déplacement : ${TRAVEL_FEES.BASE_FEE}€ minimum (distance exacte non calculée)`
        };
      }
    }

    case 'create_booking': {
      const db = getSupabase();
      if (!db) return { success: false, error: "Base de données non disponible" };

      const service = SERVICES[toolInput.service_id];
      if (!service) return { success: false, error: "Service non trouvé" };

      // Extraire prénom et nom du client
      const nameParts = toolInput.client_nom.trim().split(' ');
      const prenom = nameParts[0] || 'Client';
      const nom = nameParts.slice(1).join(' ') || 'Halimah';

      // Normaliser le téléphone
      const telephone = toolInput.client_telephone.replace(/\s/g, '');

      // Chercher ou créer le client
      let clientId;
      const { data: existingClient } = await db
        .from('clients')
        .select('id')
        .eq('telephone', telephone)
        .single();

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        // Créer le client
        const { data: newClient, error: clientError } = await db
          .from('clients')
          .insert({ prenom, nom, telephone })
          .select('id')
          .single();

        if (clientError) {
          console.error('[HALIMAH AI] Erreur création client:', clientError);
          return { success: false, error: clientError.message };
        }
        clientId = newClient.id;
      }

      // Créer la réservation
      // Note: pas de colonne "lieu", on utilise adresse_client (null = salon)
      const { error } = await db.from('reservations').insert({
        client_id: clientId,
        date: toolInput.date,
        heure: `${toolInput.heure}:00`,
        duree_minutes: service.duree,
        service_nom: service.nom,
        prix_service: service.prix * 100, // en centimes
        adresse_client: toolInput.lieu === 'domicile' ? toolInput.adresse : null,
        telephone: telephone,
        statut: 'demande',
        created_via: 'halimah-ai',
        notes: toolInput.lieu === 'domicile' ? `Domicile: ${toolInput.adresse}` : 'Salon Franconville'
      });

      if (error) {
        console.error('[HALIMAH AI] Erreur création RDV:', error);
        return { success: false, error: error.message };
      }

      return {
        success: true,
        message: "Réservation créée avec succès",
        recap: {
          service: service.nom,
          prix: service.prix,
          date: toolInput.date,
          heure: `${toolInput.heure}h`,
          lieu: toolInput.lieu === 'fatou' ? SALON_INFO.adresse : toolInput.adresse,
          client: toolInput.client_nom
        }
      };
    }

    case 'get_salon_info': {
      return {
        success: true,
        ...SALON_INFO,
        horaires: Object.values(HORAIRES).map(h =>
          h.ouvert ? `${h.jour}: ${h.debut}h-${h.fin}h` : `${h.jour}: Fermé`
        )
      };
    }

    default:
      return { success: false, error: "Outil inconnu" };
  }
}

// ============================================
// SYSTÈME PROMPT
// ============================================

// Fonction pour obtenir le prompt système avec la date du jour
function getSystemPrompt() {
  const now = new Date();
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  const jourSemaine = jours[now.getDay()];
  const jour = now.getDate();
  const moisNom = mois[now.getMonth()];
  const annee = now.getFullYear();
  const dateFormatee = `${jourSemaine} ${jour} ${moisNom} ${annee}`;
  const dateISO = `${annee}-${String(now.getMonth()+1).padStart(2,'0')}-${String(jour).padStart(2,'0')}`;

  return `Tu es Halimah, l'assistante virtuelle de Fat's Hair-Afro, coiffeuse afro professionnelle à Franconville.

=== DATE DU JOUR ===
Nous sommes le ${dateFormatee}.
Date ISO pour les outils : ${dateISO}

CALCUL DES DATES RELATIVES :
- "demain" = ${calculerDateRelative(1)}
- "après-demain" = ${calculerDateRelative(2)}
- "samedi prochain" = ${calculerProchainJour(6)}
- "lundi prochain" = ${calculerProchainJour(1)}
Utilise TOUJOURS l'outil parse_date pour convertir les dates relatives en format YYYY-MM-DD.

=== CONCEPT IMPORTANT ===
- Fat's Hair-Afro n'est PAS un salon de coiffure traditionnel
- Fatou est une coiffeuse indépendante qui propose 2 options :
  1. Se déplacer chez le client (service à domicile avec frais de déplacement)
  2. Recevoir le client chez elle à Franconville (8 rue des Monts Rouges)
- Tu ne dois JAMAIS parler de "salon" mais plutôt de "chez Fatou" ou "à domicile"

=== PERSONNALITÉ ===
- Chaleureuse, professionnelle, efficace
- Tu vouvoies toujours les clients
- Tu es concise mais pas froide
- Tu peux utiliser des emojis avec modération (sauf au téléphone)

=== RÈGLES ABSOLUES ===
1. Tu ne dois JAMAIS inventer un prix → Utilise l'outil get_price ou get_services
2. Tu ne dois JAMAIS inventer une disponibilité → Utilise check_availability
3. Tu ne dois JAMAIS confirmer un RDV sans utiliser create_booking
4. Tu dois TOUJOURS utiliser parse_date pour convertir les dates relatives
5. Tu dois TOUJOURS vérifier la disponibilité AVANT de proposer un créneau

=== PROCESSUS DE RÉSERVATION (SUIVRE EXACTEMENT) ===

ÉTAPE 1 - COMPRENDRE LA DEMANDE :
- Le client demande un service → Note le service
- Le client donne une date/heure → Utilise parse_date puis check_availability
- Si pas de date donnée → Demande "Vous préférez quel jour ?"

ÉTAPE 2 - VÉRIFIER LA DISPONIBILITÉ :
- Utilise d'ABORD check_availability avec la date/heure demandée
- Si disponible → Propose ce créneau
- Si non disponible → Utilise get_next_available_slot puis propose une alternative

ÉTAPE 3 - CONFIRMER LE CRÉNEAU :
- Quand le client dit "oui", "ok", "d'accord", "parfait", "ça marche" → C'est une CONFIRMATION
- Après confirmation du créneau → Demande le lieu (domicile ou chez Fatou)

ÉTAPE 4 - COLLECTER LES INFOS :
- Si domicile → Demande l'adresse
- Demande : "Pour finaliser, j'ai besoin de votre nom et téléphone"

ÉTAPE 5 - CRÉER LA RÉSERVATION :
- Récapitule TOUT (service, date, heure, lieu, prix)
- Demande confirmation finale
- Quand le client confirme → Utilise create_booking

=== GESTION DES CONFIRMATIONS ===
Ces mots/phrases signifient OUI :
- "oui", "ok", "d'accord", "parfait", "ça marche", "super", "très bien", "nickel", "impec", "c'est bon", "je confirme", "on fait comme ça"

Ces mots signifient NON :
- "non", "pas vraiment", "autre chose", "plutôt", "je préfère"

=== IMPORTANT ===
- GARDE LE CONTEXTE : Si le client a dit "locks", ne propose pas "tresses"
- RESPECTE L'HEURE DEMANDÉE : Si le client dit "10h", vérifie 10h, pas 16h
- ÉCOUTE LE CLIENT : Ne change pas arbitrairement ses choix
- Réponses courtes et claires, pas de bavardage`;
}

// Fonctions utilitaires pour les dates
function calculerDateRelative(joursAAjouter) {
  const date = new Date();
  date.setDate(date.getDate() + joursAAjouter);
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return `${jours[date.getDay()]} ${date.getDate()}/${date.getMonth()+1} (${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')})`;
}

function calculerProchainJour(jourCible) {
  // jourCible: 0=dimanche, 1=lundi, ... 6=samedi
  const now = new Date();
  const jourActuel = now.getDay();
  let joursAAjouter = jourCible - jourActuel;
  if (joursAAjouter <= 0) joursAAjouter += 7; // Prochain occurrence

  const date = new Date();
  date.setDate(date.getDate() + joursAAjouter);
  const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  return `${jours[date.getDay()]} ${date.getDate()}/${date.getMonth()+1} (${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')})`;
}

// ============================================
// FONCTION PRINCIPALE
// ============================================

// Stockage des conversations (en mémoire, à remplacer par Redis/DB en prod)
const conversations = new Map();

export async function chat(sessionId, userMessage, canal = 'chat') {
  console.log(`[HALIMAH AI] Session: ${sessionId}, Canal: ${canal}`);
  console.log(`[HALIMAH AI] Message: ${userMessage}`);

  // Récupérer ou créer l'historique
  if (!conversations.has(sessionId)) {
    conversations.set(sessionId, []);
  }
  const messages = conversations.get(sessionId);

  // Ajouter le message utilisateur
  messages.push({ role: 'user', content: userMessage });

  // Adapter le système prompt selon le canal
  let systemPrompt = getSystemPrompt(); // Générer dynamiquement avec la date du jour
  if (canal === 'phone') {
    // Utiliser le prompt vocal naturel optimisé pour la synthèse vocale
    systemPrompt = getVoicePrompt({
      includePrice: true,
      includeDate: true,
      includeAddress: true
    });
  }

  try {
    // Appel à Claude avec les outils
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools: tools,
      messages: messages
    });

    // Boucle pour gérer les appels d'outils
    while (response.stop_reason === 'tool_use') {
      // Trouver TOUS les tool_use blocks dans la réponse
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      if (toolUseBlocks.length === 0) break;

      // Ajouter d'abord la réponse de l'assistant
      messages.push({ role: 'assistant', content: response.content });

      // Exécuter TOUS les outils et collecter les résultats
      const toolResults = [];
      for (const toolUseBlock of toolUseBlocks) {
        const toolResult = await executeTool(toolUseBlock.name, toolUseBlock.input);
        console.log(`[HALIMAH AI] Résultat outil ${toolUseBlock.name}:`, toolResult);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(toolResult)
        });
      }

      // Ajouter tous les résultats d'outils en une seule fois
      messages.push({ role: 'user', content: toolResults });

      // Continuer la conversation
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools,
        messages: messages
      });
    }

    // Extraire la réponse textuelle
    const textBlock = response.content.find(block => block.type === 'text');
    const assistantMessage = textBlock ? textBlock.text : "Je suis désolée, je n'ai pas pu traiter votre demande.";

    // Sauvegarder la réponse dans l'historique (content complet pour maintenir le contexte)
    messages.push({ role: 'assistant', content: response.content });

    // Limiter l'historique à 20 messages
    if (messages.length > 20) {
      messages.splice(0, messages.length - 20);
    }

    console.log(`[HALIMAH AI] Réponse: ${assistantMessage.substring(0, 100)}...`);

    return {
      success: true,
      response: assistantMessage,
      sessionId
    };

  } catch (error) {
    console.error('[HALIMAH AI] Erreur:', error);
    return {
      success: false,
      response: "Désolée, j'ai rencontré un problème technique. Pouvez-vous réessayer ?",
      error: error.message
    };
  }
}

// Nettoyer une session
export function clearSession(sessionId) {
  conversations.delete(sessionId);
}

export { SERVICES, HORAIRES, SALON_INFO };
