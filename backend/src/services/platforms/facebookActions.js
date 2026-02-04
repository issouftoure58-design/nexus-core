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

const FACEBOOK_URL = 'https://www.facebook.com';

/**
 * Se connecter à Facebook
 */
export async function loginFacebook(email, password) {
  console.log('[FACEBOOK] 🔐 Tentative de connexion...');
  const page = await createPage('facebook');

  try {
    await navigateTo(page, FACEBOOK_URL);
    await randomDelay(2000, 3000);

    // Gérer le popup cookies
    await handleCookiePopup(page);

    if (await isLoggedIn(page, 'facebook')) {
      console.log('[FACEBOOK] ✅ Déjà connecté');
      return { success: true, alreadyLoggedIn: true, page };
    }

    // Remplir le formulaire
    await waitForElement(page, 'input[name="email"], input#email');
    await typeText(page, 'input[name="email"], input#email', email);
    await randomDelay(500, 1000);
    await typeText(page, 'input[name="pass"], input#pass', password);
    await randomDelay(500, 1000);

    // Cliquer sur Se connecter
    await clickElement(page, 'button[name="login"], button[type="submit"]');

    await randomDelay(3000, 5000);

    if (await isLoggedIn(page, 'facebook')) {
      await saveSession(page, 'facebook');
      console.log('[FACEBOOK] ✅ Connexion réussie');
      return { success: true, page };
    }

    const screenshot = await takeScreenshot(page, 'facebook-login-failed');
    return { success: false, error: 'Connexion échouée', screenshot };

  } catch (error) {
    const screenshot = await takeScreenshot(page, 'facebook-error');
    console.error('[FACEBOOK] ❌ Erreur login:', error.message);
    return { success: false, error: error.message, screenshot };
  }
}

/**
 * Gère le popup cookies Facebook
 */
async function handleCookiePopup(page) {
  try {
    const cookieSelectors = [
      'button[data-cookiebanner="accept_button"]',
      'button:has-text("Accept All")',
      'button:has-text("Tout accepter")',
      'button:has-text("Allow essential and optional cookies")',
      'button:has-text("Autoriser les cookies essentiels et optionnels")'
    ];

    for (const selector of cookieSelectors) {
      if (await waitForElement(page, selector, 2000)) {
        await clickElement(page, selector);
        console.log('[FACEBOOK] 🍪 Popup cookies géré');
        await randomDelay(1000, 2000);
        break;
      }
    }
  } catch (error) {
    // Pas grave si le popup n'existe pas
  }
}

/**
 * Publier sur une Page Facebook
 */
export async function postToFacebookPage(pageUrl, content, imagePath = null) {
  console.log('[FACEBOOK] 📝 Préparation du post...');
  const page = await createPage('facebook');

  try {
    await navigateTo(page, pageUrl);
    await randomDelay(2000, 3000);

    if (!await isLoggedIn(page, 'facebook')) {
      return { success: false, error: 'Non connecté à Facebook. Utilisez d\'abord connecter_facebook.' };
    }

    // Cliquer sur "Create post" / "Créer une publication"
    const createPostSelectors = [
      '[aria-label="Create a post"]',
      '[aria-label="Créer une publication"]',
      'div[role="button"]:has-text("Create post")',
      'div[role="button"]:has-text("Créer une publication")',
      'span:has-text("What\'s on your mind")',
      'span:has-text("Quoi de neuf")'
    ];

    let clicked = false;
    for (const selector of createPostSelectors) {
      if (await waitForElement(page, selector, 3000)) {
        await clickElement(page, selector);
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      return { success: false, error: 'Impossible de trouver le bouton de création de post' };
    }

    await randomDelay(2000, 3000);

    // Écrire le contenu
    const contentSelectors = [
      '[aria-label="What\'s on your mind?"]',
      '[aria-label="Quoi de neuf ?"]',
      'div[contenteditable="true"]',
      'div[role="textbox"]'
    ];

    for (const selector of contentSelectors) {
      if (await waitForElement(page, selector, 5000)) {
        await clickElement(page, selector);
        await page.keyboard.type(content, { delay: 30 });
        console.log('[FACEBOOK] ✍️ Contenu ajouté');
        break;
      }
    }

    await randomDelay(1000, 2000);

    // Upload image si fournie
    if (imagePath) {
      const photoSelectors = [
        '[aria-label="Photo/Video"]',
        '[aria-label="Photo/vidéo"]'
      ];

      for (const selector of photoSelectors) {
        if (await waitForElement(page, selector, 3000)) {
          await clickElement(page, selector);
          await randomDelay(1000, 2000);
          break;
        }
      }

      const fileInput = await page.$('input[type="file"][accept*="image"]');
      if (fileInput) {
        await fileInput.uploadFile(imagePath);
        console.log('[FACEBOOK] 📤 Image uploadée');
        await randomDelay(3000, 5000);
      }
    }

    // Publier
    const postSelectors = [
      '[aria-label="Post"]',
      '[aria-label="Publier"]',
      'div[role="button"]:has-text("Post")',
      'div[role="button"]:has-text("Publier")'
    ];

    for (const selector of postSelectors) {
      if (await waitForElement(page, selector, 3000)) {
        await clickElement(page, selector);
        console.log('[FACEBOOK] 🚀 Publication en cours...');
        break;
      }
    }

    await randomDelay(5000, 8000);

    const screenshot = await takeScreenshot(page, 'facebook-post-result');
    await saveSession(page, 'facebook');

    console.log('[FACEBOOK] ✅ Post publié !');
    return {
      success: true,
      message: 'Post publié avec succès sur Facebook',
      screenshot
    };

  } catch (error) {
    const screenshot = await takeScreenshot(page, 'facebook-post-error');
    console.error('[FACEBOOK] ❌ Erreur post:', error.message);
    return { success: false, error: error.message, screenshot };
  }
}

/**
 * Publier sur le profil personnel
 */
export async function postToProfile(content, imagePath = null) {
  const page = await createPage('facebook');

  try {
    await navigateTo(page, FACEBOOK_URL);
    await randomDelay(2000, 3000);

    // Même logique que postToFacebookPage mais sur le feed principal
    return await postToFacebookPage(FACEBOOK_URL, content, imagePath);

  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  loginFacebook,
  postToFacebookPage,
  postToProfile
};
