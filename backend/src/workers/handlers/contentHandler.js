import { TaskTypes } from '../../services/taskQueue.js';
import { generateImage } from '../../tools/halimahPro/generateImage.js';
import { generateCaption } from '../../tools/halimahPro/generateCaption.js';

/**
 * Handler pour les tâches de génération de contenu
 */
export async function handleContentTask(job) {
  const { type, data } = job.data;

  console.log(`[CONTENT] 🎨 Traitement tâche ${type}`);

  switch (type) {
    case TaskTypes.GENERATE_CONTENT:
      return await generateFullContent(data);

    case TaskTypes.GENERATE_IMAGE:
      return await generateImageContent(data);

    default:
      throw new Error(`Handler contenu inconnu: ${type}`);
  }
}

/**
 * Génère un contenu complet (image + légende)
 */
async function generateFullContent(data) {
  const { template, platform, service, imagePrompt, customText } = data;

  console.log('[CONTENT] 📝 Génération contenu complet...');

  try {
    // Générer l'image
    const image = await generateImage({
      prompt: imagePrompt || `${service || 'coiffure afro'} hairstyle, professional, beautiful lighting, salon quality`,
      style: data.style || 'african',
      format: platform === 'stories' ? 'portrait' : 'square'
    });

    // Générer la légende
    const caption = await generateCaption({
      type: template || 'avant-apres',
      platform: platform || 'instagram',
      data: { service, customText, ...data }
    });

    console.log('[CONTENT] ✅ Contenu généré');

    return {
      image: {
        localPath: image?.localPath,
        url: image?.url
      },
      caption: caption?.legende || caption,
      hashtags: caption?.hashtags || [],
      ready: true,
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('[CONTENT] ❌ Erreur génération contenu:', error);
    return {
      ready: false,
      error: error.message
    };
  }
}

/**
 * Génère uniquement une image
 */
async function generateImageContent(data) {
  const { prompt, style, format, service } = data;

  console.log('[CONTENT] 🖼️ Génération image...');

  try {
    const finalPrompt = prompt || `Professional ${service || 'african hairstyle'}, salon photo, beautiful lighting`;

    const image = await generateImage({
      prompt: finalPrompt,
      style: style || 'african',
      format: format || 'square'
    });

    console.log('[CONTENT] ✅ Image générée');

    return {
      image: {
        localPath: image?.localPath,
        url: image?.url,
        prompt: finalPrompt
      },
      generated: true,
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('[CONTENT] ❌ Erreur génération image:', error);
    return {
      generated: false,
      error: error.message
    };
  }
}
