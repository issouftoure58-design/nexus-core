import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import EnvironmentManager from '../../services/environmentManager.js';
import { isDevelopment, isFeatureEnabled, getCurrentEnvironment } from '../../config/environments.js';

// Initialisation paresseuse du client OpenAI
let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Génère une image avec DALL-E 3
 * @param {string} prompt - Description de l'image à générer
 * @param {string} style - Style visuel (african, modern, elegant, vibrant)
 * @param {string} format - Format (square, portrait, landscape)
 * @param {string} outputName - Nom du fichier de sortie
 */
export async function generateImage({ prompt, style = 'african', format = 'square', outputName }) {
  // En dev ou si DALL-E désactivé, retourner une image placeholder
  if (isDevelopment() || !isFeatureEnabled('dalle')) {
    EnvironmentManager.log('info', 'DALL-E Image (MOCK)', { prompt: prompt.slice(0, 50) + '...' });

    const mockResult = EnvironmentManager.mockApiResponse('dalle', 'generate');

    // Créer un placeholder avec le texte du prompt
    const placeholderText = encodeURIComponent(prompt.slice(0, 30) + '...');
    const sizeMap = { square: '1024x1024', portrait: '1024x1792', landscape: '1792x1024' };
    const size = sizeMap[format] || sizeMap.square;

    return {
      success: true,
      url: `https://via.placeholder.com/${size.replace('x', '/')}.png?text=${placeholderText}`,
      localPath: `/generated/mock-image-${Date.now()}.png`,
      prompt: prompt,
      format,
      style,
      mock: true,
      environment: getCurrentEnvironment(),
      message: `[MOCK] Image simulée en environnement ${getCurrentEnvironment()}. Passez en staging/production pour générer une vraie image.`
    };
  }

  const openai = getOpenAIClient();

  if (!openai) {
    return {
      success: false,
      error: 'OpenAI API key non configurée. Ajoute OPENAI_API_KEY dans .env'
    };
  }

  // Enrichir le prompt avec le style Fat's Hair-Afro
  const stylePrompts = {
    african: 'Style africain élégant, couleurs chaudes (or, bordeaux, crème), motifs wax subtils, luxueux mais chaleureux',
    modern: 'Style moderne et épuré, minimaliste, tons neutres avec accents dorés',
    elegant: 'Style haut de gamme, sophistiqué, éclairage doux, finitions premium',
    vibrant: 'Couleurs vives et énergiques, style tendance TikTok/Instagram, dynamique'
  };

  const sizeMap = {
    square: '1024x1024',      // Posts Instagram/Facebook
    portrait: '1024x1792',    // Stories/Reels
    landscape: '1792x1024'    // Bannières/YouTube
  };

  const fullPrompt = `${prompt}. ${stylePrompts[style] || stylePrompts.african}. Pour un salon de coiffure afro haut de gamme "Fat's Hair-Afro". Image professionnelle, haute qualité.`;

  try {
    console.log('[GENERATE IMAGE] Génération avec DALL-E 3...');
    console.log('[GENERATE IMAGE] Prompt:', fullPrompt.substring(0, 100) + '...');
    console.log('[GENERATE IMAGE] Format:', format, '→', sizeMap[format] || sizeMap.square);

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: fullPrompt,
      n: 1,
      size: sizeMap[format] || sizeMap.square,
      quality: 'hd'
    });

    const imageUrl = response.data[0].url;
    const revisedPrompt = response.data[0].revised_prompt;

    // Générer un nom de fichier unique si non fourni
    const fileName = outputName || `image-${Date.now()}`;

    // Chemin vers le dossier generated dans client/public
    const generatedDir = path.join(process.cwd(), 'client/public/generated');
    const imagePath = path.join(generatedDir, `${fileName}.png`);

    // Créer le dossier si nécessaire
    if (!fs.existsSync(generatedDir)) {
      fs.mkdirSync(generatedDir, { recursive: true });
    }

    // Télécharger l'image
    console.log('[GENERATE IMAGE] Téléchargement de l\'image...');
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      throw new Error(`Erreur téléchargement: ${imageResponse.status}`);
    }

    const buffer = await imageResponse.arrayBuffer();
    fs.writeFileSync(imagePath, Buffer.from(buffer));

    console.log('[GENERATE IMAGE] ✅ Image sauvegardée:', imagePath);

    return {
      success: true,
      url: imageUrl,
      localPath: `/generated/${fileName}.png`,
      prompt: fullPrompt,
      revisedPrompt,
      format,
      style
    };

  } catch (error) {
    console.error('[GENERATE IMAGE] ❌ Erreur:', error.message);

    // Messages d'erreur plus clairs
    let errorMessage = error.message;
    if (error.message.includes('billing')) {
      errorMessage = 'Le compte OpenAI nécessite une mise à jour de facturation.';
    } else if (error.message.includes('rate limit')) {
      errorMessage = 'Trop de demandes. Réessaie dans quelques secondes.';
    } else if (error.message.includes('content_policy')) {
      errorMessage = 'Le contenu demandé ne respecte pas les règles de sécurité. Reformule ta demande.';
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

export default generateImage;
