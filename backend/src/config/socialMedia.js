// Configuration des APIs réseaux sociaux

export const socialMediaConfig = {
  meta: {
    // Facebook & Instagram utilisent la même API Meta
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    accessToken: process.env.META_ACCESS_TOKEN, // Long-lived token
    instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID,
    facebookPageId: process.env.FACEBOOK_PAGE_ID,
  },
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    accessToken: process.env.TIKTOK_ACCESS_TOKEN,
  },
  twitter: {
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    bearerToken: process.env.TWITTER_BEARER_TOKEN,
  },
  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    organizationId: process.env.LINKEDIN_ORGANIZATION_ID,
  }
};

// Vérifier si une plateforme est configurée
export function isPlatformConfigured(platform) {
  switch (platform) {
    case 'instagram':
      return !!(socialMediaConfig.meta.accessToken && socialMediaConfig.meta.instagramAccountId);
    case 'facebook':
      return !!(socialMediaConfig.meta.accessToken && socialMediaConfig.meta.facebookPageId);
    case 'tiktok':
      return !!(socialMediaConfig.tiktok.accessToken);
    case 'twitter':
    case 'x':
      return !!(socialMediaConfig.twitter.accessToken && socialMediaConfig.twitter.accessTokenSecret);
    case 'linkedin':
      return !!(socialMediaConfig.linkedin.accessToken);
    default:
      return false;
  }
}

// Liste des plateformes disponibles
export function getAvailablePlatforms() {
  const platforms = ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok'];
  return platforms.filter(p => isPlatformConfigured(p));
}

// Obtenir les infos de configuration pour l'affichage
export function getPlatformStatus() {
  const platforms = [
    { name: 'instagram', label: 'Instagram', icon: '📸' },
    { name: 'facebook', label: 'Facebook', icon: '👤' },
    { name: 'twitter', label: 'Twitter/X', icon: '🐦' },
    { name: 'linkedin', label: 'LinkedIn', icon: '💼' },
    { name: 'tiktok', label: 'TikTok', icon: '🎵' }
  ];

  return platforms.map(p => ({
    ...p,
    configured: isPlatformConfigured(p.name),
    status: isPlatformConfigured(p.name) ? '✅ Prêt' : '❌ Non configuré'
  }));
}
