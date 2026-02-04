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
  randomDelay,
  getText,
  withRetry
} from '../browserService.js';

const INSTAGRAM_URL = 'https://www.instagram.com';

/**
 * Se connecter à Instagram
 */
export async function loginInstagram(username, password) {
  console.log('[INSTAGRAM] 🔐 Tentative de connexion...');
  const page = await createPage('instagram');

  try {
    // Vérifier si déjà connecté
    await navigateTo(page, INSTAGRAM_URL);
    await randomDelay(2000, 3000);

    if (await isLoggedIn(page, 'instagram')) {
      console.log('[INSTAGRAM] ✅ Déjà connecté');
      return { success: true, alreadyLoggedIn: true, page };
    }

    // Aller sur la page de login
    await navigateTo(page, `${INSTAGRAM_URL}/accounts/login/`);
    await waitForElement(page, 'input[name="username"]');

    // Accepter les cookies si présent
    await handleCookiePopup(page);

    // Remplir le formulaire
    await typeText(page, 'input[name="username"]', username);
    await randomDelay(500, 1000);
    await typeText(page, 'input[name="password"]', password);
    await randomDelay(500, 1000);

    // Cliquer sur Se connecter
    await clickElement(page, 'button[type="submit"]');

    // Attendre la redirection
    await randomDelay(3000, 5000);

    // Gérer les popups
    await handleInstagramPopups(page);

    // Vérifier la connexion
    if (await isLoggedIn(page, 'instagram')) {
      await saveSession(page, 'instagram');
      console.log('[INSTAGRAM] ✅ Connexion réussie');
      return { success: true, page };
    } else {
      const screenshot = await takeScreenshot(page, 'instagram-login-failed');
      return { success: false, error: 'Connexion échouée - vérifiez vos identifiants', screenshot };
    }

  } catch (error) {
    const screenshot = await takeScreenshot(page, 'instagram-error');
    console.error('[INSTAGRAM] ❌ Erreur login:', error.message);
    return { success: false, error: error.message, screenshot };
  }
}

/**
 * Gère le popup cookies
 */
async function handleCookiePopup(page) {
  try {
    // Boutons courants pour refuser/accepter cookies
    const cookieSelectors = [
      'button:has-text("Decline optional cookies")',
      'button:has-text("Refuser les cookies optionnels")',
      'button:has-text("Allow essential and optional cookies")',
      'button:has-text("Autoriser tous les cookies")'
    ];

    for (const selector of cookieSelectors) {
      if (await waitForElement(page, selector, 2000)) {
        await clickElement(page, selector);
        console.log('[INSTAGRAM] 🍪 Popup cookies géré');
        break;
      }
    }
  } catch (error) {
    // Pas grave si le popup n'existe pas
  }
}

/**
 * Gère les popups Instagram (notifications, save login, etc.)
 */
async function handleInstagramPopups(page) {
  await randomDelay(2000, 3000);

  const popupSelectors = [
    // "Save Login Info" / "Enregistrer les informations de connexion"
    'button:has-text("Not Now")',
    'button:has-text("Pas maintenant")',
    // "Turn on Notifications" / "Activer les notifications"
    'button:has-text("Not Now")',
    'button:has-text("Pas maintenant")',
    // "Add to Home Screen"
    'button:has-text("Cancel")',
    'button:has-text("Annuler")'
  ];

  for (const selector of popupSelectors) {
    try {
      const button = await page.$(selector);
      if (button) {
        await button.click();
        console.log('[INSTAGRAM] 📱 Popup fermé');
        await randomDelay(1000, 2000);
      }
    } catch (error) {
      // Ignorer si le popup n'existe pas
    }
  }
}

/**
 * Publier un post Instagram
 */
export async function postToInstagram(imagePath, caption, hashtags = '') {
  console.log('[INSTAGRAM] 📸 Préparation du post...');
  const page = await createPage('instagram');

  try {
    await navigateTo(page, INSTAGRAM_URL);
    await randomDelay(2000, 3000);

    // Vérifier connexion
    if (!await isLoggedIn(page, 'instagram')) {
      return { success: false, error: 'Non connecté à Instagram. Utilisez d\'abord connecter_instagram.' };
    }

    // Cliquer sur "Create" / "Créer" (le +)
    const createSelectors = [
      'svg[aria-label="New post"]',
      'svg[aria-label="Nouvelle publication"]',
      '[aria-label="New post"]',
      '[aria-label="Nouvelle publication"]'
    ];

    let clicked = false;
    for (const selector of createSelectors) {
      if (await waitForElement(page, selector, 3000)) {
        await clickElement(page, selector, { humanLike: true });
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      // Essayer via l'URL directe
      await navigateTo(page, `${INSTAGRAM_URL}/create/style/`);
    }

    await randomDelay(2000, 3000);

    // Attendre le dialog d'upload
    const fileInputSelector = 'input[type="file"]';
    await waitForElement(page, fileInputSelector, 10000);

    // Upload l'image
    await uploadFile(page, fileInputSelector, imagePath);
    console.log('[INSTAGRAM] 📤 Image uploadée');

    await randomDelay(3000, 5000);

    // Cliquer Next (filtres) - chercher les différents textes possibles
    const nextSelectors = [
      'button:has-text("Next")',
      'button:has-text("Suivant")',
      'div[role="button"]:has-text("Next")',
      'div[role="button"]:has-text("Suivant")'
    ];

    for (const selector of nextSelectors) {
      if (await waitForElement(page, selector, 3000)) {
        await clickElement(page, selector);
        break;
      }
    }

    await randomDelay(2000, 3000);

    // Cliquer Next encore (vers caption)
    for (const selector of nextSelectors) {
      if (await waitForElement(page, selector, 3000)) {
        await clickElement(page, selector);
        break;
      }
    }

    await randomDelay(2000, 3000);

    // Écrire la légende
    const captionSelectors = [
      'textarea[aria-label="Write a caption..."]',
      'textarea[aria-label="Écrivez une légende..."]',
      'div[aria-label="Write a caption..."]',
      'div[aria-label="Écrivez une légende..."]'
    ];

    const fullCaption = hashtags ? `${caption}\n\n${hashtags}` : caption;

    for (const selector of captionSelectors) {
      if (await waitForElement(page, selector, 5000)) {
        await clickElement(page, selector);
        await page.keyboard.type(fullCaption, { delay: 30 });
        console.log('[INSTAGRAM] ✍️ Légende ajoutée');
        break;
      }
    }

    await randomDelay(2000, 3000);

    // Publier - chercher les différents textes possibles
    const shareSelectors = [
      'button:has-text("Share")',
      'button:has-text("Partager")',
      'div[role="button"]:has-text("Share")',
      'div[role="button"]:has-text("Partager")'
    ];

    for (const selector of shareSelectors) {
      if (await waitForElement(page, selector, 3000)) {
        await clickElement(page, selector);
        console.log('[INSTAGRAM] 🚀 Publication en cours...');
        break;
      }
    }

    // Attendre confirmation (checkmark ou retour au feed)
    await randomDelay(5000, 8000);

    const screenshot = await takeScreenshot(page, 'instagram-post-result');
    await saveSession(page, 'instagram');

    console.log('[INSTAGRAM] ✅ Post publié !');
    return {
      success: true,
      message: 'Post publié avec succès sur Instagram',
      screenshot
    };

  } catch (error) {
    const screenshot = await takeScreenshot(page, 'instagram-post-error');
    console.error('[INSTAGRAM] ❌ Erreur post:', error.message);
    return { success: false, error: error.message, screenshot };
  }
}

/**
 * Récupérer les stats d'un post
 */
export async function getPostStats(postUrl) {
  const page = await createPage('instagram');

  try {
    await navigateTo(page, postUrl);
    await randomDelay(2000, 3000);

    // Récupérer likes
    const likesSelector = 'section span, a[href*="liked_by"] span';
    const likes = await getText(page, likesSelector);

    // Récupérer commentaires
    const commentsSelector = 'ul > li';
    const commentsCount = await page.$$eval(commentsSelector, els => els.length);

    const screenshot = await takeScreenshot(page, 'instagram-stats');

    return {
      success: true,
      stats: {
        likes: likes || '0',
        comments: commentsCount || 0
      },
      screenshot
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Répondre à un DM
 */
export async function replyToDM(username, message) {
  const page = await createPage('instagram');

  try {
    await navigateTo(page, `${INSTAGRAM_URL}/direct/inbox/`);
    await randomDelay(2000, 3000);

    // Chercher la conversation
    const conversationSelector = `a[href*="${username}"], div:has-text("${username}")`;
    if (await waitForElement(page, conversationSelector, 5000)) {
      await clickElement(page, conversationSelector);
    }

    await randomDelay(1000, 2000);

    // Trouver le champ de message
    const messageInputSelectors = [
      'textarea[placeholder="Message..."]',
      'textarea[placeholder="Envoyer un message..."]'
    ];

    for (const selector of messageInputSelectors) {
      if (await waitForElement(page, selector, 3000)) {
        await typeText(page, selector, message);
        break;
      }
    }

    // Envoyer
    await page.keyboard.press('Enter');

    console.log('[INSTAGRAM] 💬 DM envoyé');
    return { success: true, message: 'Message envoyé' };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default {
  loginInstagram,
  postToInstagram,
  getPostStats,
  replyToDM
};
