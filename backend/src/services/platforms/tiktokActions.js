import {
  createPage,
  saveSession,
  navigateTo,
  clickElement,
  typeText,
  takeScreenshot,
  waitForElement,
  uploadFile,
  isLoggedIn,
  randomDelay
} from '../browserService.js';

const TIKTOK_URL = 'https://www.tiktok.com';
const TIKTOK_STUDIO_URL = 'https://www.tiktok.com/creator#/upload';

/**
 * Se connecter à TikTok
 * Note: TikTok a des protections anti-bot assez strictes.
 * La meilleure approche est de se connecter manuellement une fois et sauvegarder les cookies.
 */
export async function loginTikTok(username, password) {
  console.log('[TIKTOK] 🔐 Tentative de connexion...');
  const page = await createPage('tiktok');

  try {
    await navigateTo(page, `${TIKTOK_URL}/login`);
    await randomDelay(2000, 3000);

    // Vérifier si déjà connecté
    if (await isLoggedIn(page, 'tiktok')) {
      console.log('[TIKTOK] ✅ Déjà connecté');
      return { success: true, alreadyLoggedIn: true, page };
    }

    // TikTok est plus complexe à automatiser
    // On guide l'utilisateur plutôt que d'automatiser complètement
    const screenshot = await takeScreenshot(page, 'tiktok-login-page');

    console.log('[TIKTOK] ⚠️ TikTok nécessite souvent une connexion manuelle');

    // Essayer quand même avec email/phone
    const loginWithEmailSelector = 'div:has-text("Use phone / email / username")';
    if (await waitForElement(page, loginWithEmailSelector, 3000)) {
      await clickElement(page, loginWithEmailSelector);
      await randomDelay(1000, 2000);
    }

    // Cliquer sur "Log in with email or username"
    const emailLoginSelector = 'a:has-text("Log in with email or username")';
    if (await waitForElement(page, emailLoginSelector, 3000)) {
      await clickElement(page, emailLoginSelector);
      await randomDelay(1000, 2000);
    }

    // Remplir le formulaire
    const usernameInput = 'input[name="username"], input[placeholder*="Email"], input[placeholder*="Phone"]';
    if (await waitForElement(page, usernameInput, 3000)) {
      await typeText(page, usernameInput, username);
    }

    const passwordInput = 'input[type="password"]';
    if (await waitForElement(page, passwordInput, 3000)) {
      await typeText(page, passwordInput, password);
    }

    // Soumettre
    const submitSelector = 'button[type="submit"]';
    if (await waitForElement(page, submitSelector, 3000)) {
      await clickElement(page, submitSelector);
    }

    await randomDelay(5000, 8000);

    // Vérifier si connecté
    if (await isLoggedIn(page, 'tiktok')) {
      await saveSession(page, 'tiktok');
      console.log('[TIKTOK] ✅ Connexion réussie');
      return { success: true, page };
    }

    // Probablement un captcha ou verification
    const finalScreenshot = await takeScreenshot(page, 'tiktok-login-result');
    return {
      success: false,
      message: 'TikTok peut nécessiter une vérification manuelle (captcha, SMS). Connectez-vous manuellement dans le navigateur et les cookies seront sauvegardés.',
      screenshot: finalScreenshot,
      instructions: [
        '1. Ouvrez le navigateur avec "ouvrir_navigateur"',
        '2. Allez sur "ouvrir_page" avec https://www.tiktok.com/login',
        '3. Connectez-vous manuellement',
        '4. Les cookies seront sauvegardés automatiquement'
      ]
    };

  } catch (error) {
    const screenshot = await takeScreenshot(page, 'tiktok-error');
    console.error('[TIKTOK] ❌ Erreur login:', error.message);
    return { success: false, error: error.message, screenshot };
  }
}

/**
 * Publier une vidéo TikTok (via TikTok Creator Studio)
 */
export async function postToTikTok(videoPath, caption, hashtags = '') {
  console.log('[TIKTOK] 🎬 Préparation du post...');
  const page = await createPage('tiktok');

  try {
    // Aller sur TikTok Creator Studio
    await navigateTo(page, TIKTOK_STUDIO_URL);
    await randomDelay(3000, 5000);

    // Vérifier si connecté
    if (!await isLoggedIn(page, 'tiktok')) {
      return {
        success: false,
        error: 'Non connecté à TikTok. Connectez-vous d\'abord manuellement et réessayez.'
      };
    }

    // Chercher le sélecteur d'upload
    const uploadSelector = 'input[type="file"][accept*="video"]';
    if (await waitForElement(page, uploadSelector, 10000)) {
      await uploadFile(page, uploadSelector, videoPath);
      console.log('[TIKTOK] 📤 Vidéo uploadée');
    } else {
      // Alternative: cliquer sur la zone de drop
      const dropZoneSelector = 'div[class*="upload"]';
      if (await waitForElement(page, dropZoneSelector, 5000)) {
        await clickElement(page, dropZoneSelector);
        await randomDelay(1000, 2000);
        await uploadFile(page, 'input[type="file"]', videoPath);
      }
    }

    // Attendre le traitement de la vidéo
    console.log('[TIKTOK] ⏳ Traitement de la vidéo...');
    await randomDelay(10000, 15000);

    // Ajouter caption
    const captionSelector = '[data-e2e="caption-input"], div[contenteditable="true"]';
    if (await waitForElement(page, captionSelector, 10000)) {
      await clickElement(page, captionSelector);
      const fullCaption = hashtags ? `${caption} ${hashtags}` : caption;
      await page.keyboard.type(fullCaption, { delay: 30 });
      console.log('[TIKTOK] ✍️ Description ajoutée');
    }

    await randomDelay(2000, 3000);

    // Publier
    const postSelectors = [
      'button[data-e2e="post-button"]',
      'button:has-text("Post")',
      'button:has-text("Publier")'
    ];

    for (const selector of postSelectors) {
      if (await waitForElement(page, selector, 5000)) {
        await clickElement(page, selector);
        console.log('[TIKTOK] 🚀 Publication en cours...');
        break;
      }
    }

    await randomDelay(5000, 10000);

    const screenshot = await takeScreenshot(page, 'tiktok-post-result');
    await saveSession(page, 'tiktok');

    console.log('[TIKTOK] ✅ Vidéo publiée !');
    return {
      success: true,
      message: 'Vidéo publiée avec succès sur TikTok',
      screenshot
    };

  } catch (error) {
    const screenshot = await takeScreenshot(page, 'tiktok-post-error');
    console.error('[TIKTOK] ❌ Erreur post:', error.message);
    return { success: false, error: error.message, screenshot };
  }
}

/**
 * Récupérer les stats d'un compte TikTok
 */
export async function getTikTokStats() {
  const page = await createPage('tiktok');

  try {
    await navigateTo(page, `${TIKTOK_URL}/creator#/home`);
    await randomDelay(3000, 5000);

    // Les stats sont affichées sur le dashboard creator
    const screenshot = await takeScreenshot(page, 'tiktok-stats');

    // Essayer de récupérer quelques métriques
    const stats = {};

    // Ces sélecteurs peuvent varier selon les mises à jour de TikTok
    const metricsSelectors = {
      views: '[data-e2e="video-views"]',
      followers: '[data-e2e="followers-count"]',
      likes: '[data-e2e="likes-count"]'
    };

    for (const [metric, selector] of Object.entries(metricsSelectors)) {
      try {
        const value = await page.$eval(selector, el => el.textContent);
        stats[metric] = value;
      } catch {
        stats[metric] = 'N/A';
      }
    }

    return {
      success: true,
      stats,
      screenshot
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  loginTikTok,
  postToTikTok,
  getTikTokStats
};
