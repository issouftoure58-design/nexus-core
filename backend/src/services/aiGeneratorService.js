/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║   AI GENERATOR SERVICE - Halimah Pro                          [LOCKED]        ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║   ⛔ FICHIER VERROUILLE - Ne pas modifier sans autorisation                   ║
 * ║                                                                               ║
 * ║   Genere du contenu dynamique avec Claude pour les outils pro :               ║
 * ║   SEO, Marketing, Strategie, RH                                               ║
 * ║                                                                               ║
 * ║   *** NEXUS CORE COMPLIANT ***                                                ║
 * ║   - SERVICES, TRAVEL_FEES, BUSINESS_HOURS : depuis businessRules.js           ║
 * ║   - BUSINESS_CONTEXT : genere dynamiquement                                   ║
 * ║   - Aucune valeur hardcodee                                                   ║
 * ║                                                                               ║
 * ║   Voir : backend/NEXUS_LOCK.md                                                ║
 * ║                                                                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

import Anthropic from '@anthropic-ai/sdk';
// *** IMPORT DEPUIS NEXUS CORE - SOURCE UNIQUE DE VÉRITÉ ***
import { SERVICES, TRAVEL_FEES, BUSINESS_HOURS, getAllServices } from '../config/businessRules.js';

const anthropic = new Anthropic();

// *** CONTEXTE BUSINESS GÉNÉRÉ DYNAMIQUEMENT DEPUIS NEXUS CORE ***
function generateBusinessContext() {
  const services = getAllServices();
  const minPrice = Math.min(...services.map(s => s.price));
  const maxPrice = Math.max(...services.map(s => s.price));

  // Grouper les services par catégorie
  const categories = {};
  services.forEach(s => {
    if (!categories[s.category]) categories[s.category] = [];
    categories[s.category].push(s.name);
  });

  const servicesText = Object.entries(categories)
    .map(([cat, names]) => `${cat}: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '...' : ''}`)
    .join('; ');

  return `
Fat's Hair-Afro est un salon de coiffure afro à domicile à Franconville (95130), Île-de-France.
Coiffeuse: Fatou
Services: ${servicesText}
Prix: De ${minPrice}€ (shampoing) à ${maxPrice}€ (microlocks crochet)
Frais de déplacement: ${TRAVEL_FEES.BASE_FEE}€ jusqu'à ${TRAVEL_FEES.BASE_DISTANCE_KM}km, puis ${TRAVEL_FEES.PER_KM_BEYOND}€/km
Zone: Franconville + toute l'Île-de-France
Téléphone: 07 82 23 50 20 / 09 39 24 02 69
Site: https://halimah-api.onrender.com
Spécialité: Coiffure afro, cheveux texturés, soins naturels
`;
}

// Contexte business généré dynamiquement
const BUSINESS_CONTEXT = generateBusinessContext();

/**
 * Génère une réponse avec Claude
 */
async function generateWithClaude(prompt, maxTokens = 1500) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  } catch (error) {
    console.error('[AI GENERATOR] Erreur Claude:', error.message);
    throw error;
  }
}

// ============================================
// SEO
// ============================================

export async function generateSeoAnalysis(siteUrl) {
  const prompt = `${BUSINESS_CONTEXT}

Tu es un expert SEO. Analyse le référencement d'un salon de coiffure afro à domicile.
URL: ${siteUrl || 'https://halimah-api.onrender.com'}

Génère une analyse SEO RÉALISTE avec:
1. Score estimé sur 100 (sois honnête)
2. 5 points forts probables pour ce type de business
3. 5 points à améliorer prioritaires
4. 5 recommandations concrètes et actionnables
5. Mots-clés principaux à cibler

Réponds en JSON:
{
  "score": 65,
  "points_forts": ["...", "..."],
  "points_a_ameliorer": ["...", "..."],
  "recommandations": ["...", "..."],
  "mots_cles_cibles": ["...", "..."]
}`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { raw_analysis: result };
  }
}

export async function generateSeoKeywords(service, zone) {
  const prompt = `${BUSINESS_CONTEXT}

Tu es un expert SEO. Génère des mots-clés optimisés pour:
- Service: ${service || 'tous les services'}
- Zone: ${zone || 'Franconville et Île-de-France'}

Génère 20 mots-clés avec leur volume de recherche estimé et difficulté.
Inclus des mots-clés locaux, longue traîne, et questions.

Réponds en JSON:
{
  "mots_cles": [
    {"keyword": "coiffure afro Franconville", "volume": 320, "difficulte": "moyenne"},
    ...
  ],
  "recommandation": "Focus sur..."
}`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { raw: result };
  }
}

export async function generateSeoMeta(page) {
  const prompt = `${BUSINESS_CONTEXT}

Tu es un expert SEO. Génère les balises meta optimisées pour la page: ${page || 'accueil'}

Génère:
- Title (60 caractères max)
- Meta description (155 caractères max)
- H1 suggéré
- 5 balises Open Graph

Réponds en JSON:
{
  "title": "...",
  "meta_description": "...",
  "h1": "...",
  "og_tags": {...}
}`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { raw: result };
  }
}

// ============================================
// MARKETING
// ============================================

export async function generateMarketingCampaign(type, objectif, budget) {
  const prompt = `${BUSINESS_CONTEXT}

Tu es un expert marketing digital. Crée une campagne complète pour un salon de coiffure afro.

Type de campagne: ${type || 'promotion'}
Objectif: ${objectif || 'augmenter les réservations'}
Budget: ${budget || 'petit budget'}

Génère un plan de campagne complet avec:
1. Nom de la campagne
2. Durée recommandée
3. Canaux (Instagram, Facebook, SMS, Email)
4. Planning semaine par semaine
5. Messages clés
6. Visuels à créer
7. KPIs à suivre
8. Budget détaillé

Réponds en JSON structuré.`;

  const result = await generateWithClaude(prompt, 2000);
  try {
    return JSON.parse(result);
  } catch {
    return { plan_campagne: result };
  }
}

export async function generatePromotion(typePromo, reduction, services) {
  const prompt = `${BUSINESS_CONTEXT}

Crée une offre promotionnelle attractive:
- Type: ${typePromo || 'réduction'}
- Réduction: ${reduction || '20%'}
- Services concernés: ${services || 'tous'}

Génère:
1. Nom accrocheur de l'offre
2. Code promo unique
3. Conditions d'utilisation
4. Message Instagram (avec emojis et hashtags)
5. Message SMS (160 caractères max)
6. Dates suggérées (durée limitée)

Réponds en JSON.`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { promo: result };
  }
}

export async function generateMarketingEmail(type, sujet, destinataires) {
  const prompt = `${BUSINESS_CONTEXT}

Crée un email marketing professionnel:
- Type: ${type || 'newsletter'}
- Sujet: ${sujet || 'actualités du salon'}
- Destinataires: ${destinataires || 'tous les clients'}

Génère:
1. Objet de l'email (50 caractères max, accrocheur)
2. Pré-header
3. Corps de l'email en HTML (design moderne, responsive)
4. Call-to-action principal
5. PS / Message de fin

Réponds en JSON avec le HTML de l'email.`;

  const result = await generateWithClaude(prompt, 2000);
  try {
    return JSON.parse(result);
  } catch {
    return { email: result };
  }
}

export async function generateMarketingSMS(type, message, timing) {
  const prompt = `${BUSINESS_CONTEXT}

Crée une campagne SMS efficace:
- Type: ${type || 'rappel'}
- Message souhaité: ${message || 'promotion'}
- Moment d'envoi: ${timing || 'immédiat'}

Génère 5 variantes de SMS (160 caractères max chacun).
Inclus des call-to-action clairs.

Réponds en JSON:
{
  "variantes": ["...", "...", "...", "...", "..."],
  "meilleur_moment": "...",
  "conseil": "..."
}`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { sms: result };
  }
}

// ============================================
// STRATÉGIE
// ============================================

export async function generateStrategieAnalysis(aspect, donnees) {
  const prompt = `${BUSINESS_CONTEXT}

Tu es un consultant en stratégie business. Analyse l'aspect suivant:
Aspect: ${aspect || 'global'}
Données disponibles: ${JSON.stringify(donnees || {})}

Génère une analyse SWOT complète avec:
1. Forces (5 points)
2. Faiblesses (5 points)
3. Opportunités (5 points)
4. Menaces (5 points)
5. Recommandations prioritaires (5 actions)
6. Quick wins (3 actions rapides)

Réponds en JSON structuré.`;

  const result = await generateWithClaude(prompt, 2000);
  try {
    return JSON.parse(result);
  } catch {
    return { analyse: result };
  }
}

export async function generateStrategiePricing(servicesActuels, objectif) {
  const prompt = `${BUSINESS_CONTEXT}

Tu es un expert en pricing. Analyse et optimise la tarification:
Services actuels: ${JSON.stringify(servicesActuels || 'voir contexte')}
Objectif: ${objectif || 'maximiser le CA'}

Génère:
1. Analyse des prix actuels vs marché
2. Recommandations de prix par service
3. Stratégie de pricing (pénétration, écrémage, valeur)
4. Packages/formules à créer
5. Impact estimé sur le CA

Réponds en JSON.`;

  const result = await generateWithClaude(prompt, 2000);
  try {
    return JSON.parse(result);
  } catch {
    return { pricing: result };
  }
}

export async function generateStrategieObjectifs(periode, focus) {
  const prompt = `${BUSINESS_CONTEXT}

Tu es un coach business. Définis des objectifs SMART pour:
Période: ${periode || 'trimestre'}
Focus: ${focus || 'croissance'}

Génère:
1. 3 objectifs principaux (SMART)
2. KPIs pour chaque objectif
3. Actions à mettre en place
4. Jalons et deadlines
5. Ressources nécessaires

Réponds en JSON structuré.`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { objectifs: result };
  }
}

export async function generateStrategieRapport(periode, donnees) {
  const prompt = `${BUSINESS_CONTEXT}

Tu es un analyste business. Génère un rapport stratégique:
Période: ${periode || 'mensuel'}
Données: ${JSON.stringify(donnees || {})}

Génère un rapport complet avec:
1. Résumé exécutif
2. Analyse des performances
3. Points clés (positifs et négatifs)
4. Comparaison période précédente
5. Recommandations
6. Plan d'action pour la période suivante

Réponds en JSON structuré.`;

  const result = await generateWithClaude(prompt, 2500);
  try {
    return JSON.parse(result);
  } catch {
    return { rapport: result };
  }
}

// ============================================
// RH
// ============================================

export async function generateRhPlanning(semaine, contraintes) {
  const prompt = `${BUSINESS_CONTEXT}

Tu es un expert en organisation du travail. Optimise le planning:
Semaine: ${semaine || 'prochaine'}
Contraintes: ${JSON.stringify(contraintes || {})}

Génère un planning optimisé avec:
1. Horaires recommandés par jour
2. Créneaux haute activité
3. Temps de pause
4. Jours de repos suggérés
5. Conseils d'organisation

Réponds en JSON.`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { planning: result };
  }
}

export async function generateRhTempsTravail(periode, heuresEffectuees) {
  const prompt = `${BUSINESS_CONTEXT}

Analyse le temps de travail:
Période: ${periode || 'semaine'}
Heures effectuées: ${heuresEffectuees || 'non spécifié'}

Génère:
1. Synthèse des heures
2. Comparaison avec les normes légales
3. Productivité estimée
4. Alertes si surcharge
5. Recommandations équilibre vie pro/perso

Réponds en JSON.`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { analyse: result };
  }
}

export async function generateRhConges(demandeType, dates) {
  const prompt = `${BUSINESS_CONTEXT}

Gestion des congés:
Type: ${demandeType || 'vacances'}
Dates demandées: ${dates || 'non spécifié'}

Génère:
1. Validation de la demande
2. Impact sur l'activité
3. Actions à prévoir (message clients, report RDV)
4. Checklist avant départ
5. Message d'absence suggéré

Réponds en JSON.`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { conges: result };
  }
}

export async function generateRhObjectifs(typeObjectif, periode) {
  const prompt = `${BUSINESS_CONTEXT}

Définition d'objectifs personnels:
Type: ${typeObjectif || 'développement'}
Période: ${periode || 'trimestre'}

Génère:
1. 5 objectifs professionnels pertinents
2. Indicateurs de réussite
3. Plan de développement
4. Formations suggérées
5. Récompenses/célébrations

Réponds en JSON.`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { objectifs: result };
  }
}

export async function generateRhFormation(domaine, niveau) {
  const prompt = `${BUSINESS_CONTEXT}

Recherche de formations pour une coiffeuse afro:
Domaine: ${domaine || 'techniques avancées'}
Niveau: ${niveau || 'confirmé'}

Génère:
1. 5 formations recommandées (avec prix estimés)
2. Organismes de formation
3. Certifications disponibles
4. Aides financières possibles (OPCO, CPF)
5. Retour sur investissement estimé

Réponds en JSON.`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { formations: result };
  }
}

export async function generateRhBienEtre(probleme, contexte) {
  const prompt = `${BUSINESS_CONTEXT}

Tu es un coach bien-être au travail. Conseille sur:
Problème: ${probleme || 'stress général'}
Contexte: ${contexte || 'travail intensif'}

Génère des conseils personnalisés:
1. Diagnostic de la situation
2. 5 conseils pratiques immédiats
3. Routine bien-être suggérée
4. Signes d'alerte à surveiller
5. Ressources utiles

Réponds en JSON.`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { conseils: result };
  }
}

// ============================================
// COMMERCIAL (devis)
// ============================================

export async function generateDevis(client, services, options) {
  const prompt = `${BUSINESS_CONTEXT}

Génère un devis professionnel:
Client: ${JSON.stringify(client || {})}
Services demandés: ${JSON.stringify(services || [])}
Options: ${JSON.stringify(options || {})}

Génère:
1. Numéro de devis unique
2. Détail des prestations
3. Prix unitaires et total
4. Frais de déplacement estimés
5. Conditions de validité
6. Mentions légales

Réponds en JSON avec tous les éléments du devis.`;

  const result = await generateWithClaude(prompt);
  try {
    return JSON.parse(result);
  } catch {
    return { devis: result };
  }
}

export default {
  generateSeoAnalysis,
  generateSeoKeywords,
  generateSeoMeta,
  generateMarketingCampaign,
  generatePromotion,
  generateMarketingEmail,
  generateMarketingSMS,
  generateStrategieAnalysis,
  generateStrategiePricing,
  generateStrategieObjectifs,
  generateStrategieRapport,
  generateRhPlanning,
  generateRhTempsTravail,
  generateRhConges,
  generateRhObjectifs,
  generateRhFormation,
  generateRhBienEtre,
  generateDevis
};
