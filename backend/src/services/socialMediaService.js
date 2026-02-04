import { socialMediaConfig, isPlatformConfigured, getAvailablePlatforms, getPlatformStatus } from '../config/socialMedia.js';

// === FACEBOOK ===
async function postToFacebook(content, imageUrl = null) {
  if (!isPlatformConfigured('facebook')) {
    return { success: false, error: 'Facebook non configuré. Ajoute META_ACCESS_TOKEN et FACEBOOK_PAGE_ID dans .env' };
  }

  try {
    const { accessToken, facebookPageId } = socialMediaConfig.meta;
    let endpoint = `https://graph.facebook.com/v18.0/${facebookPageId}/feed`;
    let body = { message: content, access_token: accessToken };

    // Si image fournie, utiliser /photos endpoint
    if (imageUrl) {
      endpoint = `https://graph.facebook.com/v18.0/${facebookPageId}/photos`;
      body = { url: imageUrl, caption: content, access_token: accessToken };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return {
      success: true,
      postId: data.id || data.post_id,
      platform: 'facebook',
      url: `https://facebook.com/${data.id}`,
      message: 'Post publié sur Facebook !'
    };
  } catch (error) {
    console.error('[FACEBOOK] Erreur:', error);
    return { success: false, error: error.message };
  }
}

// === INSTAGRAM ===
async function postToInstagram(content, imageUrl) {
  if (!isPlatformConfigured('instagram')) {
    return { success: false, error: 'Instagram non configuré. Ajoute META_ACCESS_TOKEN et INSTAGRAM_ACCOUNT_ID dans .env' };
  }

  if (!imageUrl) {
    return { success: false, error: 'Instagram requiert une image pour publier' };
  }

  try {
    const { accessToken, instagramAccountId } = socialMediaConfig.meta;

    // Étape 1: Créer le conteneur média
    const containerResponse = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption: content,
          access_token: accessToken
        })
      }
    );

    const containerData = await containerResponse.json();

    if (containerData.error) {
      return { success: false, error: containerData.error.message };
    }

    // Attendre que le conteneur soit prêt (polling)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Étape 2: Publier le conteneur
    const publishResponse = await fetch(
      `https://graph.facebook.com/v18.0/${instagramAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerData.id,
          access_token: accessToken
        })
      }
    );

    const publishData = await publishResponse.json();

    if (publishData.error) {
      return { success: false, error: publishData.error.message };
    }

    return {
      success: true,
      postId: publishData.id,
      platform: 'instagram',
      message: 'Post publié sur Instagram !'
    };
  } catch (error) {
    console.error('[INSTAGRAM] Erreur:', error);
    return { success: false, error: error.message };
  }
}

// === TWITTER/X ===
async function postToTwitter(content, imageUrl = null) {
  if (!isPlatformConfigured('twitter')) {
    return { success: false, error: 'Twitter/X non configuré. Ajoute les clés TWITTER_* dans .env' };
  }

  try {
    const { apiKey, apiSecret, accessToken, accessTokenSecret } = socialMediaConfig.twitter;

    // Pour Twitter, on utilise OAuth 1.0a
    // Note: En production, utiliser une lib comme 'twitter-api-v2'

    const tweetBody = { text: content };

    // Simplification - en production utiliser twitter-api-v2
    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${socialMediaConfig.twitter.bearerToken}`
      },
      body: JSON.stringify(tweetBody)
    });

    const data = await response.json();

    if (data.errors || data.detail) {
      return { success: false, error: data.errors?.[0]?.message || data.detail || 'Erreur Twitter' };
    }

    return {
      success: true,
      postId: data.data?.id,
      platform: 'twitter',
      url: data.data?.id ? `https://twitter.com/i/status/${data.data.id}` : null,
      message: 'Tweet publié sur X !'
    };
  } catch (error) {
    console.error('[TWITTER] Erreur:', error);
    return { success: false, error: error.message };
  }
}

// === LINKEDIN ===
async function postToLinkedIn(content, imageUrl = null) {
  if (!isPlatformConfigured('linkedin')) {
    return { success: false, error: 'LinkedIn non configuré. Ajoute les clés LINKEDIN_* dans .env' };
  }

  try {
    const { accessToken, organizationId } = socialMediaConfig.linkedin;

    // Déterminer si c'est un post personnel ou d'organisation
    const author = organizationId
      ? `urn:li:organization:${organizationId}`
      : 'urn:li:person:me';

    const postBody = {
      author: author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(postBody)
    });

    if (response.status === 401 || response.status === 403) {
      return { success: false, error: 'Token LinkedIn expiré ou permissions insuffisantes' };
    }

    const data = await response.json();

    if (data.message) {
      return { success: false, error: data.message };
    }

    return {
      success: true,
      postId: data.id,
      platform: 'linkedin',
      message: 'Post publié sur LinkedIn !'
    };
  } catch (error) {
    console.error('[LINKEDIN] Erreur:', error);
    return { success: false, error: error.message };
  }
}

// === TIKTOK ===
async function postToTikTok(content, videoUrl) {
  if (!isPlatformConfigured('tiktok')) {
    return { success: false, error: 'TikTok non configuré. Ajoute les clés TIKTOK_* dans .env' };
  }

  if (!videoUrl) {
    return { success: false, error: 'TikTok requiert une vidéo pour publier' };
  }

  try {
    const { accessToken } = socialMediaConfig.tiktok;

    // TikTok Content Posting API
    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        post_info: {
          title: content.substring(0, 150), // TikTok limite le titre à 150 chars
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: videoUrl
        }
      })
    });

    const data = await response.json();

    if (data.error) {
      return { success: false, error: data.error.message || 'Erreur TikTok' };
    }

    return {
      success: true,
      postId: data.data?.publish_id,
      platform: 'tiktok',
      message: 'Vidéo en cours de publication sur TikTok (peut prendre quelques minutes)'
    };
  } catch (error) {
    console.error('[TIKTOK] Erreur:', error);
    return { success: false, error: error.message };
  }
}

// === FONCTION PRINCIPALE DE PUBLICATION ===
export async function publishToSocialMedia(platforms, content, mediaUrl = null, mediaType = 'image') {
  const results = [];

  for (const platform of platforms) {
    let result;
    const platformLower = platform.toLowerCase();

    console.log(`[SOCIAL] Publication sur ${platform}...`);

    switch (platformLower) {
      case 'facebook':
        result = await postToFacebook(content, mediaUrl);
        break;
      case 'instagram':
        result = await postToInstagram(content, mediaUrl);
        break;
      case 'twitter':
      case 'x':
        result = await postToTwitter(content, mediaUrl);
        break;
      case 'linkedin':
        result = await postToLinkedIn(content, mediaUrl);
        break;
      case 'tiktok':
        if (mediaType === 'video') {
          result = await postToTikTok(content, mediaUrl);
        } else {
          result = { success: false, error: 'TikTok nécessite une vidéo, pas une image' };
        }
        break;
      default:
        result = { success: false, error: `Plateforme "${platform}" non supportée` };
    }

    results.push({ platform: platformLower, ...result });
  }

  // Résumé
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  return {
    total: results.length,
    succes: successful.length,
    echecs: failed.length,
    resultats: results,
    resume: successful.length === results.length
      ? `Publié sur ${successful.length} plateforme(s) avec succès !`
      : `${successful.length}/${results.length} publication(s) réussie(s)`
  };
}

// === PLANIFICATION DE POSTS ===
export async function schedulePost(platforms, content, mediaUrl, scheduledTime) {
  try {
    const { supabase } = await import('../config/supabase.js');

    // Valider la date
    const scheduleDate = new Date(scheduledTime);
    if (scheduleDate <= new Date()) {
      return { success: false, error: 'La date de programmation doit être dans le futur' };
    }

    const { data, error } = await supabase
      .from('scheduled_posts')
      .insert({
        platforms: platforms,
        content: content,
        media_url: mediaUrl,
        scheduled_time: scheduledTime,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      // Si la table n'existe pas, informer l'utilisateur
      if (error.code === '42P01') {
        return {
          success: false,
          error: 'La table scheduled_posts n\'existe pas encore. Exécute la migration SQL.',
          conseil: 'Crée la table scheduled_posts dans Supabase pour activer la programmation'
        };
      }
      return { success: false, error: error.message };
    }

    const dateFormatted = new Date(scheduledTime).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    return {
      success: true,
      postId: data.id,
      platforms: platforms,
      scheduled_time: scheduledTime,
      message: `Post programmé pour ${dateFormatted} sur ${platforms.join(', ')}`
    };
  } catch (error) {
    console.error('[SCHEDULE] Erreur:', error);
    return { success: false, error: error.message };
  }
}

// === RÉCUPÉRER LES POSTS PROGRAMMÉS ===
export async function getScheduledPosts() {
  try {
    const { supabase } = await import('../config/supabase.js');

    const { data, error } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('status', 'pending')
      .order('scheduled_time', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        return {
          success: true,
          posts: [],
          message: 'Aucun post programmé (table non créée)'
        };
      }
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      return {
        success: true,
        posts: [],
        message: 'Aucun post programmé pour le moment'
      };
    }

    const postsFormatted = data.map(post => ({
      id: post.id,
      platforms: post.platforms,
      content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
      scheduled_time: new Date(post.scheduled_time).toLocaleString('fr-FR'),
      has_media: !!post.media_url
    }));

    return {
      success: true,
      count: data.length,
      posts: postsFormatted
    };
  } catch (error) {
    console.error('[SCHEDULED] Erreur:', error);
    return { success: false, error: error.message };
  }
}

// === ANNULER UN POST PROGRAMMÉ ===
export async function cancelScheduledPost(postId) {
  try {
    const { supabase } = await import('../config/supabase.js');

    const { error } = await supabase
      .from('scheduled_posts')
      .update({ status: 'cancelled' })
      .eq('id', postId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, message: 'Post programmé annulé' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// === GÉNÉRATION DE CONTENU OPTIMISÉ ===
export function generateSocialContent(sujet, type, platforms = ['instagram', 'facebook', 'twitter']) {
  const templates = {
    instagram: {
      promo: `✨ ${sujet} ✨

🎁 Offre spéciale chez Fat's Hair-Afro !

📍 Service à domicile - Franconville & Île-de-France
📞 Réserve au 09 39 24 02 69
🌐 Lien en bio

#coiffureafro #tresses #nattes #locks #franconville #coiffeuseadomicile #cheveuxafro #beauteafro #promo`,

      conseil: `💡 CONSEIL CAPILLAIRE 💡

${sujet}

Prendre soin de ses cheveux, c'est essentiel ! 💜

Tu as des questions ? Demande-moi en commentaire !

#conseilcheveux #cheveuxafro #cheveuxcrepus #haircare #naturalhairtips #coiffureafro`,

      avant_apres: `✨ TRANSFORMATION ✨

Avant ➡️ Après

${sujet}

Tu veux la même ?
📞 09 39 24 02 69
📍 À domicile - Franconville & IDF

#avantapres #transformation #coiffureafro #tresses #beforeandafter`,

      inspiration: `✨ INSPIRATION DU JOUR ✨

${sujet}

Quelle coiffure te fait rêver ? Dis-moi en commentaire ! 💜

📞 09 39 24 02 69

#inspiration #coiffureafro #ideecoiffure #tresses #locks #nattes`,

      coulisses: `🎬 BEHIND THE SCENES 🎬

${sujet}

Petit aperçu de mon quotidien de coiffeuse passionnée 💜

#behindthescenes #coulisses #coiffeuse #passioncoiffure #coiffureafro`,

      temoignage: `⭐ AVIS CLIENT ⭐

"${sujet}"

Merci pour ta confiance ! 💜

Toi aussi, fais-toi chouchouter à domicile !
📞 09 39 24 02 69

#avis #temoignage #clientesatisfaite #coiffureafro`
    },

    facebook: {
      promo: `🎉 OFFRE SPÉCIALE 🎉

${sujet}

Fat's Hair-Afro - Votre coiffeuse afro à domicile depuis 25 ans

📍 Franconville et toute l'Île-de-France
📞 09 39 24 02 69
💻 Réservation en ligne disponible

N'hésitez pas à partager avec vos amies ! 💜`,

      conseil: `💡 Le conseil de Fatou 💡

${sujet}

25 ans d'expérience au service de vos cheveux !

Des questions ? Posez-les en commentaire, je réponds à toutes ! 😊`,

      avant_apres: `✨ AVANT / APRÈS ✨

${sujet}

Vous aussi, offrez-vous une transformation !

📞 09 39 24 02 69
📍 Service à domicile - Franconville et IDF`,

      temoignage: `⭐⭐⭐⭐⭐

"${sujet}"

Merci à mes clientes pour leur confiance ! 💜

Vous aussi, faites-vous chouchouter à domicile !
📞 09 39 24 02 69`,

      inspiration: `💜 INSPIRATION 💜

${sujet}

Envie de changement ? Je me déplace chez vous !

📞 09 39 24 02 69
📍 Franconville et Île-de-France`,

      coulisses: `🎬 Dans les coulisses...

${sujet}

La passion du métier, c'est ça qui fait la différence ! 💜`
    },

    twitter: {
      promo: `✨ ${sujet}

📍 Coiffeuse afro à domicile - Franconville & IDF
📞 09 39 24 02 69

#coiffureafro #tresses #franconville`,

      conseil: `💡 Conseil cheveux afro :

${sujet}

#cheveuxafro #haircare #naturalhairtips`,

      avant_apres: `✨ Avant ➡️ Après

${sujet}

📞 09 39 24 02 69

#transformation #coiffureafro`,

      inspiration: `✨ ${sujet}

Envie de changement ? Je me déplace chez vous ! 💜

#coiffureafro #inspiration`,

      temoignage: `⭐ "${sujet}"

Merci pour la confiance !

#avis #coiffureafro`,

      coulisses: `🎬 ${sujet}

#behindthescenes #coiffureafro`
    },

    linkedin: {
      promo: `🚀 Offre spéciale - Fat's Hair-Afro

${sujet}

Depuis 25 ans, j'accompagne mes clientes dans leur parcours capillaire. Le service à domicile, c'est mon engagement pour vous offrir confort et qualité.

Fat's Hair-Afro - Franconville & Île-de-France
📞 09 39 24 02 69

#entrepreneuriat #beaute #coiffure #serviceclient`,

      conseil: `💡 Conseil d'experte

${sujet}

25 ans d'expérience en coiffure afro m'ont appris une chose : chaque chevelure est unique et mérite une attention particulière.

#cheveux #beaute #expertise #conseil`,

      avant_apres: `✨ Transformation capillaire

${sujet}

Le pouvoir d'une belle coiffure sur la confiance en soi est immense.

Fat's Hair-Afro - Service à domicile
#transformation #confiance #beaute`,

      coulisses: `📸 Un jour dans ma vie de coiffeuse à domicile

${sujet}

La passion du métier, c'est ce qui fait la différence.

#entrepreneuriat #passionmetier #coiffure #artisanat`,

      temoignage: `⭐ Témoignage client

"${sujet}"

Ces retours me motivent chaque jour à donner le meilleur de moi-même.

#satisfaction #client #qualite`,

      inspiration: `💜 Inspiration

${sujet}

L'art de la coiffure afro, c'est valoriser la beauté naturelle.

#inspiration #beaute #diversite`
    },

    tiktok: {
      promo: `${sujet} ✨ #coiffureafro #tresses #fyp #pourtoi`,
      conseil: `Conseil cheveux afro 💡 ${sujet} #haircare #cheveuxafro #fyp`,
      avant_apres: `Transformation incroyable ✨ ${sujet} #avantapres #transformation #fyp`,
      coulisses: `POV: Tu es coiffeuse afro 🎬 ${sujet} #behindthescenes #fyp`,
      inspiration: `Inspo coiffure 💜 ${sujet} #inspiration #coiffure #fyp`,
      temoignage: `Ma cliente est trop contente 🥹 ${sujet} #avis #fyp`
    }
  };

  const results = {};

  for (const platform of platforms) {
    const platformLower = platform.toLowerCase();
    const platformTemplates = templates[platformLower] || templates.instagram;
    results[platform] = {
      contenu: platformTemplates[type] || platformTemplates.promo,
      caracteres: (platformTemplates[type] || platformTemplates.promo).length,
      limite: platformLower === 'twitter' ? 280 : platformLower === 'tiktok' ? 150 : 2200
    };
  }

  return {
    sujet,
    type,
    contenus: results,
    conseil: 'Adapte légèrement chaque post selon la plateforme pour de meilleurs résultats !',
    meilleur_moment: {
      instagram: 'Mardi-Jeudi 11h-13h ou 19h-21h',
      facebook: 'Mercredi-Vendredi 13h-16h',
      twitter: 'Mardi-Jeudi 9h-11h',
      linkedin: 'Mardi-Jeudi 8h-10h ou 17h-18h',
      tiktok: 'Soir 18h-22h, weekend'
    }
  };
}

// Export des fonctions utilitaires
export { getAvailablePlatforms, getPlatformStatus };
