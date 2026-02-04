/**
 * Computer Use Controller
 * Point d'entrée unique pour toutes les actions d'automatisation navigateur
 */

import {
  getBrowser,
  closeBrowser,
  createPage,
  getActivePage,
  navigateTo,
  takeScreenshot,
  clickElement,
  typeText,
  waitForElement,
  getText,
  scroll,
  uploadFile,
  saveSession
} from './browserService.js';

import {
  loginInstagram,
  postToInstagram,
  getPostStats,
  replyToDM
} from './platforms/instagramActions.js';

import {
  loginFacebook,
  postToFacebookPage,
  postToProfile
} from './platforms/facebookActions.js';

import {
  loginTikTok,
  postToTikTok,
  getTikTokStats
} from './platforms/tiktokActions.js';

// Intégration environnement
import EnvironmentManager from './environmentManager.js';
import { isDevelopment, isFeatureEnabled, getCurrentEnvironment } from '../config/environments.js';

/**
 * Controller principal pour Computer Use
 */
export const ComputerUse = {

  // ============ BROWSER MANAGEMENT ============

  /**
   * Ouvre le navigateur
   */
  async openBrowser() {
    try {
      await getBrowser();
      return { success: true, message: 'Navigateur ouvert' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Ferme le navigateur
   */
  async closeBrowser() {
    try {
      await closeBrowser();
      return { success: true, message: 'Navigateur fermé' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Ouvre une page web
   */
  async openPage(url, sessionName = 'default') {
    try {
      const page = await createPage(sessionName);
      await navigateTo(page, url);
      const screenshot = await takeScreenshot(page, 'page');
      return {
        success: true,
        message: `Page ouverte: ${url}`,
        screenshot
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Prend un screenshot de la page active
   */
  async screenshot(name = 'screenshot') {
    try {
      const page = await getActivePage();
      const filepath = await takeScreenshot(page, name);
      return {
        success: true,
        message: 'Screenshot pris',
        path: filepath
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Clique sur un élément
   */
  async click(selector, humanLike = true) {
    try {
      const page = await getActivePage();
      const clicked = await clickElement(page, selector, { humanLike });
      if (clicked) {
        return { success: true, message: `Cliqué sur: ${selector}` };
      }
      return { success: false, error: `Élément non trouvé: ${selector}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Tape du texte dans un champ
   */
  async type(selector, text) {
    try {
      const page = await getActivePage();
      const typed = await typeText(page, selector, text);
      if (typed) {
        return { success: true, message: `Texte tapé dans: ${selector}` };
      }
      return { success: false, error: `Élément non trouvé: ${selector}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Récupère le texte d'un élément
   */
  async getText(selector) {
    try {
      const page = await getActivePage();
      const text = await getText(page, selector);
      return {
        success: true,
        text: text || ''
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Scroll la page
   */
  async scroll(direction = 'down', amount = 500) {
    try {
      const page = await getActivePage();
      await scroll(page, direction, amount);
      return { success: true, message: `Scrollé ${direction} de ${amount}px` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Upload un fichier
   */
  async upload(selector, filePath) {
    try {
      const page = await getActivePage();
      const uploaded = await uploadFile(page, selector, filePath);
      if (uploaded) {
        return { success: true, message: `Fichier uploadé: ${filePath}` };
      }
      return { success: false, error: 'Upload échoué' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Attend un élément
   */
  async waitFor(selector, timeout = 10000) {
    try {
      const page = await getActivePage();
      const found = await waitForElement(page, selector, timeout);
      return {
        success: found,
        message: found ? `Élément trouvé: ${selector}` : `Élément non trouvé: ${selector}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // ============ INSTAGRAM ============

  /**
   * Connexion Instagram
   */
  async instagramLogin(username, password) {
    // En dev, simuler la connexion
    if (isDevelopment()) {
      EnvironmentManager.log('info', 'Instagram Login (MOCK)', { username });
      return EnvironmentManager.mockApiResponse('instagram', 'login');
    }
    // Vérifier si la feature est activée
    if (!isFeatureEnabled('social')) {
      return {
        success: false,
        error: `Réseaux sociaux désactivés en ${getCurrentEnvironment()}`,
        environment: getCurrentEnvironment()
      };
    }
    return await loginInstagram(username, password);
  },

  /**
   * Publier sur Instagram
   */
  async instagramPost(imagePath, caption, hashtags = '') {
    // En dev, simuler la publication
    if (isDevelopment()) {
      EnvironmentManager.log('info', 'Instagram Post (MOCK)', { caption: caption.slice(0, 50) + '...' });
      return EnvironmentManager.mockApiResponse('instagram', 'post');
    }
    // Vérifier si la feature est activée
    if (!isFeatureEnabled('social')) {
      return {
        success: false,
        error: `Réseaux sociaux désactivés en ${getCurrentEnvironment()}`,
        environment: getCurrentEnvironment()
      };
    }
    return await postToInstagram(imagePath, caption, hashtags);
  },

  /**
   * Stats d'un post Instagram
   */
  async instagramStats(postUrl) {
    return await getPostStats(postUrl);
  },

  /**
   * Répondre à un DM Instagram
   */
  async instagramDM(username, message) {
    return await replyToDM(username, message);
  },

  // ============ FACEBOOK ============

  /**
   * Connexion Facebook
   */
  async facebookLogin(email, password) {
    // En dev, simuler la connexion
    if (isDevelopment()) {
      EnvironmentManager.log('info', 'Facebook Login (MOCK)', { email });
      return EnvironmentManager.mockApiResponse('facebook', 'login');
    }
    if (!isFeatureEnabled('social')) {
      return {
        success: false,
        error: `Réseaux sociaux désactivés en ${getCurrentEnvironment()}`,
        environment: getCurrentEnvironment()
      };
    }
    return await loginFacebook(email, password);
  },

  /**
   * Publier sur une Page Facebook
   */
  async facebookPost(pageUrl, content, imagePath = null) {
    // En dev, simuler la publication
    if (isDevelopment()) {
      EnvironmentManager.log('info', 'Facebook Post (MOCK)', { content: content.slice(0, 50) + '...' });
      return EnvironmentManager.mockApiResponse('facebook', 'post');
    }
    if (!isFeatureEnabled('social')) {
      return {
        success: false,
        error: `Réseaux sociaux désactivés en ${getCurrentEnvironment()}`,
        environment: getCurrentEnvironment()
      };
    }
    return await postToFacebookPage(pageUrl, content, imagePath);
  },

  /**
   * Publier sur le profil Facebook
   */
  async facebookProfilePost(content, imagePath = null) {
    // En dev, simuler la publication
    if (isDevelopment()) {
      EnvironmentManager.log('info', 'Facebook Profile Post (MOCK)', { content: content.slice(0, 50) + '...' });
      return EnvironmentManager.mockApiResponse('facebook', 'post');
    }
    if (!isFeatureEnabled('social')) {
      return {
        success: false,
        error: `Réseaux sociaux désactivés en ${getCurrentEnvironment()}`,
        environment: getCurrentEnvironment()
      };
    }
    return await postToProfile(content, imagePath);
  },

  // ============ TIKTOK ============

  /**
   * Connexion TikTok
   */
  async tiktokLogin(username, password) {
    // En dev, simuler la connexion
    if (isDevelopment()) {
      EnvironmentManager.log('info', 'TikTok Login (MOCK)', { username });
      return EnvironmentManager.mockApiResponse('tiktok', 'login');
    }
    if (!isFeatureEnabled('social')) {
      return {
        success: false,
        error: `Réseaux sociaux désactivés en ${getCurrentEnvironment()}`,
        environment: getCurrentEnvironment()
      };
    }
    return await loginTikTok(username, password);
  },

  /**
   * Publier une vidéo TikTok
   */
  async tiktokPost(videoPath, caption, hashtags = '') {
    // En dev, simuler la publication
    if (isDevelopment()) {
      EnvironmentManager.log('info', 'TikTok Post (MOCK)', { caption: caption.slice(0, 50) + '...' });
      return EnvironmentManager.mockApiResponse('tiktok', 'post');
    }
    if (!isFeatureEnabled('social')) {
      return {
        success: false,
        error: `Réseaux sociaux désactivés en ${getCurrentEnvironment()}`,
        environment: getCurrentEnvironment()
      };
    }
    return await postToTikTok(videoPath, caption, hashtags);
  },

  /**
   * Stats TikTok
   */
  async tiktokStats() {
    return await getTikTokStats();
  },

  // ============ HELPERS ============

  /**
   * Exécute une action générique
   */
  async executeAction(action, params = {}) {
    const actions = {
      'open_browser': () => this.openBrowser(),
      'close_browser': () => this.closeBrowser(),
      'open_page': () => this.openPage(params.url, params.session),
      'screenshot': () => this.screenshot(params.name),
      'click': () => this.click(params.selector, params.humanLike),
      'type': () => this.type(params.selector, params.text),
      'get_text': () => this.getText(params.selector),
      'scroll': () => this.scroll(params.direction, params.amount),
      'upload': () => this.upload(params.selector, params.filePath),
      'wait_for': () => this.waitFor(params.selector, params.timeout),
      // Instagram
      'instagram_login': () => this.instagramLogin(params.username, params.password),
      'instagram_post': () => this.instagramPost(params.imagePath, params.caption, params.hashtags),
      'instagram_stats': () => this.instagramStats(params.postUrl),
      'instagram_dm': () => this.instagramDM(params.username, params.message),
      // Facebook
      'facebook_login': () => this.facebookLogin(params.email, params.password),
      'facebook_post': () => this.facebookPost(params.pageUrl, params.content, params.imagePath),
      'facebook_profile_post': () => this.facebookProfilePost(params.content, params.imagePath),
      // TikTok
      'tiktok_login': () => this.tiktokLogin(params.username, params.password),
      'tiktok_post': () => this.tiktokPost(params.videoPath, params.caption, params.hashtags),
      'tiktok_stats': () => this.tiktokStats()
    };

    if (actions[action]) {
      return await actions[action]();
    }

    return { success: false, error: `Action inconnue: ${action}` };
  }
};

export default ComputerUse;
