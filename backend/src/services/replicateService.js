/**
 * Service génération médias via Replicate
 */

import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Générer image avec Flux Schnell (rapide, gratuit)
 */
export async function generateImage(prompt, options = {}) {
  try {
    console.log('[REPLICATE] Génération image:', prompt);

    const output = await replicate.run(
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt,
          num_outputs: 1,
          aspect_ratio: options.aspect_ratio || "1:1",
          output_format: "png",
          output_quality: options.quality || 80
        }
      }
    );

    const imageUrl = Array.isArray(output) ? output[0] : output;

    console.log('[REPLICATE] ✅ Image générée:', imageUrl);

    return {
      success: true,
      url: imageUrl,
      prompt,
      model: 'flux-schnell'
    };

  } catch (error) {
    console.error('[REPLICATE] Erreur génération:', error);
    throw error;
  }
}

/**
 * Générer image HD avec SDXL (meilleure qualité)
 */
export async function generateImageHD(prompt, options = {}) {
  try {
    console.log('[REPLICATE] Génération image HD:', prompt);

    const output = await replicate.run(
      "stability-ai/sdxl",
      {
        input: {
          prompt,
          negative_prompt: "ugly, blurry, low quality",
          num_outputs: 1,
          width: options.width || 1024,
          height: options.height || 1024,
          scheduler: "K_EULER",
          num_inference_steps: 25,
          guidance_scale: 7.5
        }
      }
    );

    const imageUrl = Array.isArray(output) ? output[0] : output;

    console.log('[REPLICATE] ✅ Image HD générée');

    return {
      success: true,
      url: imageUrl,
      prompt,
      model: 'sdxl'
    };

  } catch (error) {
    console.error('[REPLICATE] Erreur génération HD:', error);
    throw error;
  }
}

/**
 * Supprimer background image
 */
export async function removeBackground(imageUrl) {
  try {
    console.log('[REPLICATE] Suppression background:', imageUrl);

    const output = await replicate.run(
      "cjwbw/rembg",
      {
        input: {
          image: imageUrl
        }
      }
    );

    console.log('[REPLICATE] ✅ Background supprimé');

    return {
      success: true,
      url: output,
      original: imageUrl
    };

  } catch (error) {
    console.error('[REPLICATE] Erreur suppression bg:', error);
    throw error;
  }
}

/**
 * Upscale image (améliorer qualité)
 */
export async function upscaleImage(imageUrl, scale = 2) {
  try {
    console.log('[REPLICATE] Upscale image:', imageUrl);

    const output = await replicate.run(
      "nightmareai/real-esrgan",
      {
        input: {
          image: imageUrl,
          scale,
          face_enhance: false
        }
      }
    );

    console.log('[REPLICATE] ✅ Image upscaled');

    return {
      success: true,
      url: output,
      scale
    };

  } catch (error) {
    console.error('[REPLICATE] Erreur upscale:', error);
    throw error;
  }
}

/**
 * Générer vidéo courte (2-3s)
 */
export async function generateVideo(imageUrl, motion = 'medium') {
  try {
    console.log('[REPLICATE] Génération vidéo:', imageUrl);

    const output = await replicate.run(
      "stability-ai/stable-video-diffusion",
      {
        input: {
          input_image: imageUrl,
          motion_bucket_id: motion === 'low' ? 40 : motion === 'high' ? 180 : 127,
          fps: 6,
          frames: 14
        }
      }
    );

    console.log('[REPLICATE] ✅ Vidéo générée');

    return {
      success: true,
      url: output,
      duration: '2-3s',
      fps: 6
    };

  } catch (error) {
    console.error('[REPLICATE] Erreur génération vidéo:', error);
    throw error;
  }
}

/**
 * Générer post réseaux sociaux complet
 */
export async function generateSocialPost(options) {
  const {
    platform,
    theme,
    businessType,
    text,
    style = 'moderne'
  } = options;

  try {
    console.log(`[REPLICATE] Génération post ${platform}:`, theme);

    const prompts = {
      instagram: {
        promotion: `Professional Instagram post for ${businessType}, ${style} style, promotional theme, vibrant colors, eye-catching design, high quality, ${text}`,
        event: `Event announcement Instagram post, ${style} aesthetic, ${businessType} business, clean design, ${text}`,
        info: `Informative Instagram carousel design, ${style} look, professional ${businessType} branding, ${text}`
      },
      facebook: {
        promotion: `Facebook promotional post, ${style} design, ${businessType} professional quality, engaging layout, ${text}`,
        event: `Facebook event cover, ${style} aesthetic, ${businessType} theme, high engagement design, ${text}`,
        info: `Facebook informational post, clean ${style} layout, professional ${businessType} branding, ${text}`
      },
      linkedin: {
        promotion: `LinkedIn professional post, ${style} corporate design, ${businessType} industry, business-focused, ${text}`,
        event: `LinkedIn event graphic, professional ${style} aesthetic, ${businessType} industry standard, ${text}`,
        info: `LinkedIn informational graphic, ${style} professional design, ${businessType} sector, ${text}`
      }
    };

    const prompt = prompts[platform]?.[theme] || prompts.instagram.info;

    const aspectRatios = {
      instagram: '1:1',
      facebook: '16:9',
      linkedin: '1.91:1'
    };

    const image = await generateImage(prompt, {
      aspect_ratio: aspectRatios[platform] || '1:1',
      quality: 90
    });

    const caption = generateCaption({
      platform,
      theme,
      text,
      businessType
    });

    return {
      success: true,
      image: image.url,
      caption,
      platform,
      theme
    };

  } catch (error) {
    console.error('[REPLICATE] Erreur génération post:', error);
    throw error;
  }
}

/**
 * Générer caption (template simple)
 */
function generateCaption(options) {
  const { platform, theme, text, businessType } = options;

  const templates = {
    instagram: {
      promotion: `🎉 ${text}\n\n✨ Ne ratez pas cette occasion !\n\n#${businessType} #promotion #bonplan`,
      event: `📅 ${text}\n\n🎊 Rejoignez-nous !\n\n#event #${businessType}`,
      info: `💡 ${text}\n\n#${businessType} #info #astuce`
    },
    facebook: {
      promotion: `${text}\n\nProfitez-en maintenant ! 🎁`,
      event: `${text}\n\nNous serions ravis de vous accueillir ! 🎉`,
      info: `${text}\n\nPartagez avec vos amis ! 👍`
    },
    linkedin: {
      promotion: `${text}\n\n#Business #${businessType}`,
      event: `${text}\n\n#ProfessionalEvent #Networking`,
      info: `${text}\n\n#Industry #Insights`
    }
  };

  return templates[platform]?.[theme] || text;
}
