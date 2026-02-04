/**
 * Social AI Service
 * Suggestions et génération de contenu par IA
 */

import { supabase } from '../../config/supabase.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============ HELPERS ============

async function getTenantContext(tenantId) {
  try {
    const { data: products } = await supabase
      .from('products')
      .select('name, price')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .limit(5);

    const { data: services } = await supabase
      .from('services')
      .select('name, price')
      .eq('tenant_id', tenantId)
      .limit(5)
      .then(r => r)
      .catch(() => ({ data: null }));

    return {
      productsInfo: products?.length > 0
        ? `Produits: ${products.map(p => `${p.name} (${p.price}€)`).join(', ')}`
        : null,
      servicesInfo: services?.length > 0
        ? `Services: ${services.map(s => `${s.name} (${s.price}€)`).join(', ')}`
        : null,
    };
  } catch (err) {
    console.error('[SOCIAL AI] Error getting context:', err.message);
    return {};
  }
}

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ============ GÉNÉRATION DE POSTS ============

export async function generatePostIdeas(tenantId, options = {}) {
  const { businessType = 'commerce', count = 5, theme } = options;

  try {
    const context = await getTenantContext(tenantId);

    const prompt = `Tu es un expert en social media marketing pour les petites entreprises.

CONTEXTE BUSINESS:
- Type: ${businessType}
- ${context.productsInfo || 'Pas de produits spécifiques'}
- ${context.servicesInfo || ''}

${theme ? `THÈME DEMANDÉ: ${theme}` : ''}

Génère ${count} idées de posts pour les réseaux sociaux.
Pour chaque idée, fournis:
1. Le texte du post (max 280 caractères pour compatibilité X)
2. Une version longue (pour Facebook/LinkedIn, max 500 caractères)
3. Les hashtags suggérés (5-10)
4. Les plateformes recommandées
5. Le type de média suggéré (photo, vidéo, carrousel, rien)
6. La catégorie (promo, tips, behind_scenes, product, event, engagement)

Réponds en JSON valide avec cette structure:
{
  "ideas": [
    {
      "shortContent": "...",
      "longContent": "...",
      "hashtags": ["...", "..."],
      "platforms": ["facebook", "instagram"],
      "mediaType": "photo",
      "category": "promo",
      "tip": "Conseil pour ce post"
    }
  ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = extractJSON(response.content[0].text);
    if (!result) return { success: false, error: 'Format de réponse invalide' };

    return { success: true, data: result.ideas };
  } catch (err) {
    console.error('[SOCIAL AI] Error generating ideas:', err.message);
    return { success: false, error: err.message };
  }
}

export async function generateProductPost(tenantId, productId) {
  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('name, description, price, category:product_categories(name)')
      .eq('id', productId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !product) return { success: false, error: 'Produit non trouvé' };

    const prompt = `Génère un post de réseaux sociaux pour ce produit:

PRODUIT:
- Nom: ${product.name}
- Description: ${product.description || 'Non spécifiée'}
- Prix: ${product.price}€
- Catégorie: ${product.category?.name || 'Non spécifiée'}

Génère 3 versions du post:
1. Version courte (max 280 caractères, pour X/Twitter)
2. Version moyenne (max 500 caractères, pour Instagram)
3. Version longue (max 1000 caractères, pour Facebook/LinkedIn)

Inclus aussi:
- 5-8 hashtags pertinents
- Un call-to-action
- Une suggestion de visuel

Réponds en JSON:
{
  "shortVersion": "...",
  "mediumVersion": "...",
  "longVersion": "...",
  "hashtags": ["..."],
  "callToAction": "...",
  "visualSuggestion": "..."
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = extractJSON(response.content[0].text);
    if (!result) return { success: false, error: 'Format de réponse invalide' };

    return { success: true, data: { product: { id: productId, name: product.name }, ...result } };
  } catch (err) {
    console.error('[SOCIAL AI] Error generating product post:', err.message);
    return { success: false, error: err.message };
  }
}

export async function generatePromoPost(tenantId, promoData) {
  const { productName, discount, originalPrice, promoPrice, endDate, promoCode } = promoData;

  try {
    const prompt = `Génère un post promotionnel accrocheur:

PROMOTION:
- Produit/Service: ${productName}
- Réduction: ${discount}%
- Prix original: ${originalPrice}€
- Prix promo: ${promoPrice}€
${endDate ? `- Fin de l'offre: ${endDate}` : ''}
${promoCode ? `- Code promo: ${promoCode}` : ''}

Crée un post qui:
1. Crée l'urgence
2. Met en valeur l'économie
3. Incite à l'action

Génère 2 versions:
- Courte (280 car max)
- Longue (500 car max)

Ajoute des emojis appropriés.

Réponds en JSON:
{
  "shortVersion": "...",
  "longVersion": "...",
  "hashtags": ["..."],
  "urgencyLevel": "high/medium/low"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = extractJSON(response.content[0].text);
    if (!result) return { success: false, error: 'Format de réponse invalide' };

    return { success: true, data: result };
  } catch (err) {
    console.error('[SOCIAL AI] Error generating promo post:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ SUGGESTIONS ============

export async function suggestHashtags(content, businessType = 'commerce') {
  try {
    const prompt = `Suggère 10-15 hashtags pertinents pour ce post:

CONTENU: "${content}"
TYPE DE BUSINESS: ${businessType}

Inclus:
- 3-4 hashtags populaires (haute visibilité)
- 3-4 hashtags de niche (engagement ciblé)
- 3-4 hashtags locaux/francophones
- 2-3 hashtags tendance

Réponds en JSON:
{
  "popular": ["..."],
  "niche": ["..."],
  "local": ["..."],
  "trending": ["..."],
  "all": ["..."]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = extractJSON(response.content[0].text);
    if (!result) return { success: false, error: 'Format invalide' };

    return { success: true, data: result };
  } catch (err) {
    console.error('[SOCIAL AI] Error suggesting hashtags:', err.message);
    return { success: false, error: err.message };
  }
}

export async function suggestBestTimes(businessType = 'commerce', platforms = []) {
  const bestTimes = {
    commerce: {
      facebook: { days: ['mardi', 'mercredi', 'jeudi'], hours: ['12h-13h', '19h-21h'] },
      instagram: { days: ['mardi', 'mercredi'], hours: ['11h-13h', '19h-21h'] },
      linkedin: { days: ['mardi', 'mercredi', 'jeudi'], hours: ['8h-10h', '12h'] },
      x: { days: ['mercredi', 'jeudi'], hours: ['12h-13h', '17h-18h'] },
      tiktok: { days: ['mardi', 'jeudi', 'vendredi'], hours: ['19h-22h'] },
    },
    services: {
      facebook: { days: ['mardi', 'jeudi'], hours: ['9h-10h', '13h-14h'] },
      instagram: { days: ['lundi', 'mercredi'], hours: ['12h-13h', '18h-20h'] },
      linkedin: { days: ['mardi', 'mercredi'], hours: ['7h-8h', '17h-18h'] },
      x: { days: ['mardi', 'jeudi'], hours: ['9h-10h', '12h-13h'] },
      tiktok: { days: ['mercredi', 'vendredi'], hours: ['18h-21h'] },
    },
    restaurant: {
      facebook: { days: ['jeudi', 'vendredi', 'samedi'], hours: ['11h-12h', '17h-19h'] },
      instagram: { days: ['vendredi', 'samedi', 'dimanche'], hours: ['11h-13h', '18h-20h'] },
      linkedin: { days: ['mardi', 'mercredi'], hours: ['12h-13h'] },
      x: { days: ['vendredi', 'samedi'], hours: ['11h-12h', '18h-19h'] },
      tiktok: { days: ['vendredi', 'samedi'], hours: ['12h-14h', '19h-22h'] },
    },
  };

  const times = bestTimes[businessType] || bestTimes.commerce;
  const result = {};
  const targetPlatforms = platforms.length > 0 ? platforms : Object.keys(times);

  for (const platform of targetPlatforms) {
    if (times[platform]) result[platform] = times[platform];
  }

  return {
    success: true,
    data: {
      businessType,
      recommendations: result,
      tip: 'Ces horaires sont des moyennes. Testez et ajustez selon votre audience.',
    },
  };
}

// ============ RÉPONSES AUTOMATIQUES ============

export async function generateCommentReply(tenantId, commentData) {
  const { comment, postContent, sentiment = 'neutral', authorName } = commentData;

  try {
    const prompt = `Tu es le community manager d'un commerce. Génère une réponse professionnelle et chaleureuse à ce commentaire.

CONTEXTE DU POST: "${postContent || 'Post promotionnel'}"

COMMENTAIRE DE ${authorName || 'un client'}: "${comment}"

SENTIMENT DÉTECTÉ: ${sentiment}

RÈGLES:
- Reste professionnel mais amical
- Utilise le prénom si disponible
- Si question, réponds clairement
- Si compliment, remercie sincèrement
- Si plainte, montre de l'empathie et propose une solution
- Max 150 caractères
- Ajoute 1-2 emojis appropriés

Réponds en JSON:
{
  "reply": "...",
  "tone": "friendly/professional/empathetic",
  "shouldEscalate": false,
  "reason": "..."
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = extractJSON(response.content[0].text);
    if (!result) return { success: false, error: 'Format invalide' };

    return { success: true, data: result };
  } catch (err) {
    console.error('[SOCIAL AI] Error generating reply:', err.message);
    return { success: false, error: err.message };
  }
}

export async function analyzeSentiment(text) {
  try {
    const prompt = `Analyse le sentiment de ce texte et réponds UNIQUEMENT en JSON:

TEXTE: "${text}"

{
  "sentiment": "positive/negative/neutral/question",
  "confidence": 0.0-1.0,
  "topics": ["..."],
  "requiresResponse": true/false,
  "priority": "high/medium/low"
}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = extractJSON(response.content[0].text);
    if (!result) return { success: false, error: 'Format invalide' };

    return { success: true, data: result };
  } catch (err) {
    console.error('[SOCIAL AI] Error analyzing sentiment:', err.message);
    return { success: false, error: err.message };
  }
}
