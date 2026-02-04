/**
 * Service Facebook/Instagram OAuth + Publication
 */

const FB_APP_ID = process.env.FACEBOOK_APP_ID;
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || 'https://nexus.app/auth/facebook/callback';

/**
 * Obtenir URL OAuth Facebook
 */
export function getAuthUrl() {
  const scopes = [
    'pages_manage_posts',
    'pages_read_engagement',
    'instagram_basic',
    'instagram_content_publish'
  ].join(',');

  return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FB_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopes}&response_type=code`;
}

/**
 * Échanger code contre access token
 */
export async function exchangeCodeForToken(code) {
  const url = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.access_token;
}

/**
 * Obtenir long-lived token (60 jours)
 */
export async function getLongLivedToken(shortToken) {
  const url = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&fb_exchange_token=${shortToken}`;

  const response = await fetch(url);
  const data = await response.json();

  return data.access_token;
}

/**
 * Publier sur page Facebook
 */
export async function publishToFacebook(pageId, accessToken, options) {
  const { message, imageUrl } = options;

  const url = `https://graph.facebook.com/v18.0/${pageId}/photos`;

  const body = {
    message,
    url: imageUrl,
    access_token: accessToken
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return {
    success: true,
    postId: data.id,
    platform: 'facebook'
  };
}

/**
 * Publier sur Instagram Business
 */
export async function publishToInstagram(igAccountId, accessToken, options) {
  const { caption, imageUrl } = options;

  // Étape 1: Créer container
  const createUrl = `https://graph.facebook.com/v18.0/${igAccountId}/media`;

  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: accessToken
    })
  });

  const createData = await createResponse.json();

  if (createData.error) {
    throw new Error(createData.error.message);
  }

  const containerId = createData.id;

  // Étape 2: Publier
  const publishUrl = `https://graph.facebook.com/v18.0/${igAccountId}/media_publish`;

  const publishResponse = await fetch(publishUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken
    })
  });

  const publishData = await publishResponse.json();

  if (publishData.error) {
    throw new Error(publishData.error.message);
  }

  return {
    success: true,
    postId: publishData.id,
    platform: 'instagram'
  };
}
