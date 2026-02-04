import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';

// Plugin pour éviter la détection bot
puppeteer.use(StealthPlugin());

// ============ CONFIGURATION ============

const BROWSER_CONFIG = {
  headless: process.env.NODE_ENV === 'production' ? 'new' : false,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920,1080'
  ],
  defaultViewport: {
    width: 1920,
    height: 1080
  }
};

// Dossier pour les sessions (cookies, localStorage)
const SESSIONS_DIR = path.join(process.cwd(), 'data', 'browser-sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Dossier pour les screenshots
const SCREENSHOTS_DIR = path.join(process.cwd(), 'data', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ============ BROWSER MANAGER ============

let browserInstance = null;
let activePage = null;

/**
 * Obtient ou crée une instance de navigateur
 */
export async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log('[BROWSER] 🌐 Lancement du navigateur...');
    browserInstance = await puppeteer.launch(BROWSER_CONFIG);
    console.log('[BROWSER] ✅ Navigateur lancé');
  }
  return browserInstance;
}

/**
 * Ferme le navigateur
 */
export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    activePage = null;
    console.log('[BROWSER] 🌐 Navigateur fermé');
  }
}

/**
 * Crée une nouvelle page avec session persistante
 */
export async function createPage(sessionName = 'default') {
  const browser = await getBrowser();
  const page = await browser.newPage();

  // Charger les cookies si existants
  const cookiesPath = path.join(SESSIONS_DIR, `${sessionName}-cookies.json`);
  if (fs.existsSync(cookiesPath)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      await page.setCookie(...cookies);
      console.log(`[BROWSER] 🍪 Cookies chargés pour session: ${sessionName}`);
    } catch (error) {
      console.warn(`[BROWSER] ⚠️ Erreur chargement cookies:`, error.message);
    }
  }

  // User agent réaliste
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Configurer les timeouts
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(30000);

  activePage = page;
  return page;
}

/**
 * Obtient la page active ou en crée une nouvelle
 */
export async function getActivePage(sessionName = 'default') {
  if (!activePage || activePage.isClosed()) {
    activePage = await createPage(sessionName);
  }
  return activePage;
}

/**
 * Sauvegarde les cookies de la session
 */
export async function saveSession(page, sessionName = 'default') {
  try {
    const cookies = await page.cookies();
    const cookiesPath = path.join(SESSIONS_DIR, `${sessionName}-cookies.json`);
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    console.log(`[BROWSER] 🍪 Session sauvegardée: ${sessionName}`);
  } catch (error) {
    console.error(`[BROWSER] ❌ Erreur sauvegarde session:`, error.message);
  }
}

// ============ ACTIONS DE BASE ============

/**
 * Navigue vers une URL
 */
export async function navigateTo(page, url, waitFor = 'networkidle2') {
  console.log(`[BROWSER] 🔗 Navigation vers: ${url}`);
  try {
    await page.goto(url, { waitUntil: waitFor, timeout: 30000 });
    await randomDelay(1000, 2000);
    return true;
  } catch (error) {
    console.error(`[BROWSER] ❌ Erreur navigation:`, error.message);
    return false;
  }
}

/**
 * Clique sur un élément
 */
export async function clickElement(page, selector, options = {}) {
  try {
    await page.waitForSelector(selector, { timeout: 10000 });
    await randomDelay(500, 1000);

    if (options.humanLike) {
      // Mouvement de souris humain
      const element = await page.$(selector);
      const box = await element.boundingBox();
      if (box) {
        await page.mouse.move(
          box.x + box.width / 2 + Math.random() * 10,
          box.y + box.height / 2 + Math.random() * 10,
          { steps: 10 }
        );
        await randomDelay(100, 300);
      }
    }

    await page.click(selector);
    console.log(`[BROWSER] 🖱️ Click: ${selector}`);
    return true;
  } catch (error) {
    console.error(`[BROWSER] ❌ Erreur click ${selector}:`, error.message);
    return false;
  }
}

/**
 * Tape du texte (façon humaine)
 */
export async function typeText(page, selector, text, options = {}) {
  try {
    await page.waitForSelector(selector, { timeout: 10000 });
    await clickElement(page, selector);
    await randomDelay(300, 500);

    // Effacer le contenu existant
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.value = '';
    }, selector);

    // Taper caractère par caractère (humain)
    for (const char of text) {
      await page.type(selector, char, { delay: 50 + Math.random() * 100 });
    }

    console.log(`[BROWSER] ⌨️ Texte tapé dans: ${selector}`);
    return true;
  } catch (error) {
    console.error(`[BROWSER] ❌ Erreur type ${selector}:`, error.message);
    return false;
  }
}

/**
 * Prend un screenshot
 */
export async function takeScreenshot(page, name = 'screenshot') {
  try {
    const filename = `${name}-${Date.now()}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`[BROWSER] 📸 Screenshot: ${filename}`);
    return filepath;
  } catch (error) {
    console.error(`[BROWSER] ❌ Erreur screenshot:`, error.message);
    return null;
  }
}

/**
 * Attend un élément
 */
export async function waitForElement(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Récupère le texte d'un élément
 */
export async function getText(page, selector) {
  try {
    await page.waitForSelector(selector, { timeout: 5000 });
    return await page.$eval(selector, el => el.textContent.trim());
  } catch {
    return null;
  }
}

/**
 * Scroll de la page
 */
export async function scroll(page, direction = 'down', amount = 500) {
  await page.evaluate((dir, amt) => {
    window.scrollBy(0, dir === 'down' ? amt : -amt);
  }, direction, amount);
  await randomDelay(500, 1000);
}

/**
 * Upload un fichier
 */
export async function uploadFile(page, selector, filePath) {
  try {
    const input = await page.$(selector);
    if (input) {
      await input.uploadFile(filePath);
      console.log(`[BROWSER] 📁 Fichier uploadé: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[BROWSER] ❌ Erreur upload:`, error.message);
    return false;
  }
}

/**
 * Attend que la page soit chargée
 */
export async function waitForPageLoad(page) {
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
}

// ============ UTILITAIRES ============

/**
 * Délai aléatoire (simule comportement humain)
 */
export async function randomDelay(min = 500, max = 1500) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Vérifie si connecté à un site
 */
export async function isLoggedIn(page, platform) {
  const selectors = {
    instagram: '[aria-label="Home"], [aria-label="Accueil"]',
    facebook: '[aria-label="Your profile"], [aria-label="Votre profil"]',
    tiktok: '[data-e2e="profile-icon"]'
  };

  return await waitForElement(page, selectors[platform], 5000);
}

/**
 * Exécute une fonction avec retry
 */
export async function withRetry(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`[BROWSER] ⚠️ Retry ${i + 1}/${maxRetries}...`);
      await randomDelay(delay, delay * 2);
    }
  }
}

export default {
  getBrowser,
  closeBrowser,
  createPage,
  getActivePage,
  saveSession,
  navigateTo,
  clickElement,
  typeText,
  takeScreenshot,
  waitForElement,
  getText,
  scroll,
  uploadFile,
  waitForPageLoad,
  randomDelay,
  isLoggedIn,
  withRetry
};
