import { TaskTypes } from '../../services/taskQueue.js';
import { generateImage } from '../../tools/halimahPro/generateImage.js';
import { generateCaption } from '../../tools/halimahPro/generateCaption.js';
import { remember, recall } from '../../services/halimahMemory.js';
import ComputerUse from '../../services/computerUseController.js';
import SandboxController from '../../services/sandboxController.js';
import { isProduction, simulatePost } from '../../services/sandboxService.js';

/**
 * Handler pour les tâches réseaux sociaux
 */
export async function handleSocialMediaTask(job) {
  const { type, data, tenantId } = job.data;

  console.log(`[SOCIAL] 📱 Traitement tâche ${type}`);

  switch (type) {
    case TaskTypes.POST_INSTAGRAM:
      return await postToInstagram(data, tenantId);

    case TaskTypes.POST_FACEBOOK:
      return await postToFacebook(data, tenantId);

    case TaskTypes.POST_TIKTOK:
      return await postToTiktok(data, tenantId);

    case TaskTypes.RESPOND_DM:
      return await respondToDM(data, tenantId);

    case TaskTypes.ANALYZE_ENGAGEMENT:
      return await analyzeEngagement(data, tenantId);

    default:
      throw new Error(`Handler social media inconnu: ${type}`);
  }
}

/**
 * Prépare et publie un post Instagram
 */
async function postToInstagram(data, tenantId) {
  const { template, service, customText, imagePrompt, autoPublish } = data;

  console.log('[SOCIAL] 📸 Préparation post Instagram...');

  let image = null;
  let caption = null;

  try {
    // 1. Générer l'image si demandé
    if (imagePrompt || !data.imageUrl) {
      console.log('[SOCIAL] 🎨 Génération image...');
      image = await generateImage({
        prompt: imagePrompt || `Professional photo for hair salon, ${service || 'african hairstyle'}, beautiful lighting`,
        style: 'african',
        format: 'square'
      });
    }

    // 2. Générer la légende
    console.log('[SOCIAL] ✍️ Génération légende...');
    caption = await generateCaption({
      type: template || 'avant-apres',
      platform: 'instagram',
      data: { service, customText, ...data }
    });

    const imagePath = image?.localPath || data.imageUrl;
    const captionText = caption?.legende || caption;
    const hashtags = caption?.hashtags?.join(' ') || '';

    // 3. Publier via Computer Use si autoPublish est activé
    let publishResult = null;
    if (autoPublish !== false) {
      // Vérifier le mode sandbox
      if (!isProduction()) {
        console.log('[SOCIAL] 🧪 Mode sandbox - simulation de publication...');
        const sandboxResult = await simulatePost('instagram', {
          caption: captionText,
          hashtags: hashtags,
          imagePath: imagePath
        });

        return {
          platform: 'instagram',
          image: imagePath,
          caption: captionText,
          hashtags: hashtags,
          status: 'simulated',
          published: false,
          sandboxMode: true,
          simulation: sandboxResult,
          message: 'Post simulé (mode sandbox). Passez en mode production pour publier réellement.'
        };
      }

      console.log('[SOCIAL] 🚀 Publication via Computer Use...');

      // Récupérer les identifiants
      const credentials = await getCredentials(tenantId, 'instagram');

      if (credentials?.username && credentials?.password) {
        // Se connecter
        const loginResult = await ComputerUse.instagramLogin(
          credentials.username,
          credentials.password
        );

        if (loginResult.success || loginResult.alreadyLoggedIn) {
          // Publier
          publishResult = await ComputerUse.instagramPost(
            imagePath,
            captionText,
            hashtags
          );
        } else {
          console.warn('[SOCIAL] ⚠️ Connexion Instagram échouée:', loginResult.error);
        }
      } else {
        console.warn('[SOCIAL] ⚠️ Identifiants Instagram non configurés');
      }
    }

    // 4. Mémoriser le post
    if (remember) {
      await remember({
        tenantId: tenantId || 'default',
        type: 'fact',
        category: 'content',
        key: 'last_instagram_post',
        value: JSON.stringify({
          date: new Date().toISOString(),
          template,
          service,
          imageUrl: imagePath,
          status: publishResult?.success ? 'published' : 'prepared',
          published: publishResult?.success || false
        })
      });
    }

    console.log('[SOCIAL] ✅ Post Instagram traité');

    return {
      platform: 'instagram',
      image: imagePath,
      caption: captionText,
      hashtags: hashtags,
      status: publishResult?.success ? 'published' : 'prepared',
      published: publishResult?.success || false,
      publishResult: publishResult,
      screenshot: publishResult?.screenshot
    };

  } catch (error) {
    console.error('[SOCIAL] ❌ Erreur Instagram:', error);
    return {
      platform: 'instagram',
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Prépare et publie un post Facebook
 */
async function postToFacebook(data, tenantId) {
  const { template, service, customText, pageUrl, autoPublish } = data;

  console.log('[SOCIAL] 📘 Préparation post Facebook...');

  try {
    // Générer l'image si nécessaire
    let imagePath = data.imagePath;
    if (!imagePath && data.imagePrompt) {
      const image = await generateImage({
        prompt: data.imagePrompt || `Professional hair salon photo, ${service}`,
        style: 'african',
        format: 'square'
      });
      imagePath = image?.localPath;
    }

    // Générer la légende
    const caption = await generateCaption({
      type: template || 'avant-apres',
      platform: 'facebook',
      data: { service, customText, ...data }
    });

    const content = caption?.legende || caption;

    // Publier via Computer Use si autoPublish est activé
    let publishResult = null;
    if (autoPublish !== false && pageUrl) {
      // Vérifier le mode sandbox
      if (!isProduction()) {
        console.log('[SOCIAL] 🧪 Mode sandbox - simulation de publication Facebook...');
        const sandboxResult = await simulatePost('facebook', {
          text: content,
          imagePath: imagePath
        });

        return {
          platform: 'facebook',
          content: content,
          imagePath: imagePath,
          status: 'simulated',
          published: false,
          sandboxMode: true,
          simulation: sandboxResult,
          message: 'Post simulé (mode sandbox). Passez en mode production pour publier réellement.'
        };
      }

      console.log('[SOCIAL] 🚀 Publication via Computer Use...');

      const credentials = await getCredentials(tenantId, 'facebook');

      if (credentials?.email && credentials?.password) {
        const loginResult = await ComputerUse.facebookLogin(
          credentials.email,
          credentials.password
        );

        if (loginResult.success || loginResult.alreadyLoggedIn) {
          publishResult = await ComputerUse.facebookPost(
            pageUrl,
            content,
            imagePath
          );
        }
      }
    }

    // Mémoriser
    if (remember) {
      await remember({
        tenantId: tenantId || 'default',
        type: 'fact',
        category: 'content',
        key: 'last_facebook_post',
        value: JSON.stringify({
          date: new Date().toISOString(),
          template,
          status: publishResult?.success ? 'published' : 'prepared'
        })
      });
    }

    return {
      platform: 'facebook',
      content: content,
      imagePath: imagePath,
      status: publishResult?.success ? 'published' : 'prepared',
      published: publishResult?.success || false,
      publishResult: publishResult
    };

  } catch (error) {
    console.error('[SOCIAL] ❌ Erreur Facebook:', error);
    return { platform: 'facebook', status: 'error', error: error.message };
  }
}

/**
 * Prépare et publie un post TikTok
 */
async function postToTiktok(data, tenantId) {
  const { videoPath, caption, hashtags, autoPublish } = data;

  console.log('[SOCIAL] 🎵 Préparation post TikTok...');

  try {
    // TikTok nécessite une vidéo
    if (!videoPath) {
      return {
        platform: 'tiktok',
        status: 'error',
        error: 'Chemin vidéo requis pour TikTok',
        note: 'Utilisez videoPath pour spécifier le chemin de la vidéo'
      };
    }

    // Publier via Computer Use si autoPublish est activé
    let publishResult = null;
    if (autoPublish !== false) {
      // Vérifier le mode sandbox
      if (!isProduction()) {
        console.log('[SOCIAL] 🧪 Mode sandbox - simulation de publication TikTok...');
        const sandboxResult = await simulatePost('tiktok', {
          caption: caption || 'Nouvelle coiffure',
          hashtags: hashtags || '#coiffure #afro',
          videoPath: videoPath
        });

        return {
          platform: 'tiktok',
          videoPath: videoPath,
          caption: caption,
          hashtags: hashtags,
          status: 'simulated',
          published: false,
          sandboxMode: true,
          simulation: sandboxResult,
          message: 'Post simulé (mode sandbox). Passez en mode production pour publier réellement.'
        };
      }

      console.log('[SOCIAL] 🚀 Publication via Computer Use...');

      const credentials = await getCredentials(tenantId, 'tiktok');

      if (credentials?.username && credentials?.password) {
        const loginResult = await ComputerUse.tiktokLogin(
          credentials.username,
          credentials.password
        );

        if (loginResult.success || loginResult.alreadyLoggedIn) {
          publishResult = await ComputerUse.tiktokPost(
            videoPath,
            caption || 'Nouvelle coiffure',
            hashtags || '#coiffure #afro'
          );
        }
      }
    }

    return {
      platform: 'tiktok',
      videoPath: videoPath,
      caption: caption,
      hashtags: hashtags,
      status: publishResult?.success ? 'published' : 'prepared',
      published: publishResult?.success || false,
      publishResult: publishResult
    };

  } catch (error) {
    console.error('[SOCIAL] ❌ Erreur TikTok:', error);
    return { platform: 'tiktok', status: 'error', error: error.message };
  }
}

/**
 * Répond à un DM
 */
async function respondToDM(data, tenantId) {
  const { platform, username, message } = data;

  console.log(`[SOCIAL] 💬 Réponse DM ${platform}...`);

  try {
    if (platform === 'instagram') {
      const result = await ComputerUse.instagramDM(username, message);
      return {
        platform,
        username,
        message,
        status: result.success ? 'sent' : 'failed',
        result
      };
    }

    return {
      platform,
      status: 'not_implemented',
      note: `DM automatique non disponible pour ${platform}`
    };

  } catch (error) {
    return {
      platform,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Analyse l'engagement des publications
 */
async function analyzeEngagement(data, tenantId) {
  console.log('[SOCIAL] 📊 Analyse engagement...');

  const stats = {
    instagram: { followers: 0, engagement_rate: 0, top_posts: [] },
    facebook: { followers: 0, reach: 0 },
    tiktok: { followers: 0, views: 0 }
  };

  // Essayer de récupérer les stats via Computer Use
  try {
    const tiktokStats = await ComputerUse.tiktokStats();
    if (tiktokStats.success) {
      stats.tiktok = tiktokStats.stats;
    }
  } catch (error) {
    console.warn('[SOCIAL] Stats TikTok non disponibles');
  }

  return {
    analyzed: true,
    stats,
    recommendations: [
      'Publier plus de contenus avant/après',
      'Utiliser des hashtags locaux (#coiffureIDF)',
      'Poster entre 18h et 20h pour plus d\'engagement'
    ]
  };
}

/**
 * Récupère les identifiants depuis la mémoire ou les variables d'environnement
 */
async function getCredentials(tenantId, platform) {
  // D'abord essayer la mémoire
  if (recall) {
    try {
      const stored = await recall({
        tenantId: tenantId || 'default',
        category: 'credentials',
        key: platform
      });

      if (stored?.value) {
        return typeof stored.value === 'string'
          ? JSON.parse(stored.value)
          : stored.value;
      }
    } catch (error) {
      // Ignorer les erreurs de mémoire
    }
  }

  // Sinon, utiliser les variables d'environnement
  const envCredentials = {
    instagram: {
      username: process.env.INSTAGRAM_USERNAME,
      password: process.env.INSTAGRAM_PASSWORD
    },
    facebook: {
      email: process.env.FACEBOOK_EMAIL,
      password: process.env.FACEBOOK_PASSWORD
    },
    tiktok: {
      username: process.env.TIKTOK_USERNAME,
      password: process.env.TIKTOK_PASSWORD
    }
  };

  return envCredentials[platform] || null;
}
