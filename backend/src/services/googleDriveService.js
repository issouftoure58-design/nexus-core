/**
 * Service Google Drive pour Halimah Pro
 * Permet à Halimah d'accéder aux fichiers Google Drive de Fatou
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { supabase } from '../config/supabase.js';

// ============================================================
// === CONFIGURATION ===
// ============================================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/google/callback';

// Scopes requis pour Google Drive
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',      // Accès aux fichiers créés par l'app
  'https://www.googleapis.com/auth/drive.readonly',   // Lecture de tous les fichiers
  'https://www.googleapis.com/auth/drive.metadata.readonly' // Lecture des métadonnées
];

// Vérifier si Google Drive est configuré
const GDRIVE_CONFIGURED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

if (!GDRIVE_CONFIGURED) {
  console.log('[GOOGLE DRIVE] ⚠️ Non configuré - Ajouter GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env');
} else {
  console.log('[GOOGLE DRIVE] ✅ Configuration détectée');
}

// Client OAuth2
let oauth2Client = null;

function getOAuth2Client() {
  if (!oauth2Client && GDRIVE_CONFIGURED) {
    oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI
    );
  }
  return oauth2Client;
}

// ============================================================
// === GESTION DES TOKENS ===
// ============================================================

/**
 * Récupère les tokens stockés en base
 */
async function getStoredTokens(userId = 'admin') {
  try {
    const { data, error } = await supabase
      .from('halimah_google_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[GOOGLE DRIVE] Erreur lecture tokens:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[GOOGLE DRIVE] Exception getStoredTokens:', err);
    return null;
  }
}

/**
 * Sauvegarde les tokens en base
 */
async function saveTokens(tokens, userId = 'admin') {
  try {
    const { data: existing } = await supabase
      .from('halimah_google_tokens')
      .select('id')
      .eq('user_id', userId)
      .single();

    const tokenData = {
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || 'Bearer',
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      // Mettre à jour
      const { error } = await supabase
        .from('halimah_google_tokens')
        .update(tokenData)
        .eq('user_id', userId);

      if (error) throw error;
    } else {
      // Créer
      const { error } = await supabase
        .from('halimah_google_tokens')
        .insert(tokenData);

      if (error) throw error;
    }

    console.log('[GOOGLE DRIVE] ✅ Tokens sauvegardés');
    return true;
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur saveTokens:', err);
    return false;
  }
}

/**
 * Supprime les tokens (déconnexion)
 */
async function deleteTokens(userId = 'admin') {
  try {
    const { error } = await supabase
      .from('halimah_google_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
    console.log('[GOOGLE DRIVE] 🗑️ Tokens supprimés');
    return true;
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur deleteTokens:', err);
    return false;
  }
}

// ============================================================
// === AUTHENTIFICATION ===
// ============================================================

/**
 * Vérifie si Google Drive est configuré
 */
export function isConfigured() {
  return GDRIVE_CONFIGURED;
}

/**
 * Vérifie si l'utilisateur est connecté
 */
export async function isConnected(userId = 'admin') {
  const tokens = await getStoredTokens(userId);
  return !!tokens?.access_token;
}

/**
 * Génère l'URL d'authentification Google
 */
export function getAuthUrl() {
  if (!GDRIVE_CONFIGURED) {
    return { success: false, error: 'Google Drive non configuré' };
  }

  const client = getOAuth2Client();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force le refresh token
  });

  return { success: true, url };
}

/**
 * Gère le callback OAuth et sauvegarde les tokens
 */
export async function handleCallback(code, userId = 'admin') {
  if (!GDRIVE_CONFIGURED) {
    return { success: false, error: 'Google Drive non configuré' };
  }

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    // Sauvegarder les tokens
    await saveTokens(tokens, userId);

    // Configurer le client
    client.setCredentials(tokens);

    console.log('[GOOGLE DRIVE] ✅ Authentification réussie');
    return { success: true, message: 'Connecté à Google Drive' };
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur handleCallback:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Déconnecte Google Drive
 */
export async function disconnect(userId = 'admin') {
  try {
    await deleteTokens(userId);
    oauth2Client = null;
    return { success: true, message: 'Déconnecté de Google Drive' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Obtient un client Drive authentifié
 */
async function getAuthenticatedDrive(userId = 'admin') {
  if (!GDRIVE_CONFIGURED) {
    throw new Error('Google Drive non configuré');
  }

  const tokens = await getStoredTokens(userId);
  if (!tokens) {
    throw new Error('Non connecté à Google Drive');
  }

  const client = getOAuth2Client();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date
  });

  // Rafraîchir le token si expiré
  if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
    try {
      const { credentials } = await client.refreshAccessToken();
      await saveTokens(credentials, userId);
      client.setCredentials(credentials);
    } catch (err) {
      console.error('[GOOGLE DRIVE] Erreur refresh token:', err);
      throw new Error('Token expiré, veuillez vous reconnecter');
    }
  }

  return google.drive({ version: 'v3', auth: client });
}

// ============================================================
// === OPÉRATIONS SUR LES FICHIERS ===
// ============================================================

/**
 * Liste les fichiers Google Drive
 */
export async function listFiles(folderId = 'root', query = '', pageSize = 20, userId = 'admin') {
  try {
    const drive = await getAuthenticatedDrive(userId);

    let q = `'${folderId}' in parents and trashed = false`;
    if (query) {
      q += ` and name contains '${query}'`;
    }

    const response = await drive.files.list({
      q,
      pageSize,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, iconLink)',
      orderBy: 'modifiedTime desc'
    });

    const files = response.data.files.map(file => ({
      id: file.id,
      name: file.name,
      type: file.mimeType.includes('folder') ? 'folder' : 'file',
      mimeType: file.mimeType,
      size: file.size ? parseInt(file.size) : null,
      sizeFormatted: file.size ? formatFileSize(parseInt(file.size)) : null,
      createdAt: file.createdTime,
      modifiedAt: file.modifiedTime,
      webUrl: file.webViewLink,
      icon: file.iconLink
    }));

    return {
      success: true,
      folderId,
      count: files.length,
      files
    };
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur listFiles:', err);
    return { success: false, error: err.message, files: [] };
  }
}

/**
 * Recherche dans Google Drive
 */
export async function searchFiles(query, pageSize = 20, userId = 'admin') {
  try {
    const drive = await getAuthenticatedDrive(userId);

    const response = await drive.files.list({
      q: `name contains '${query}' and trashed = false`,
      pageSize,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, parents)',
      orderBy: 'modifiedTime desc'
    });

    return {
      success: true,
      query,
      count: response.data.files.length,
      files: response.data.files.map(file => ({
        id: file.id,
        name: file.name,
        type: file.mimeType.includes('folder') ? 'folder' : 'file',
        mimeType: file.mimeType,
        size: file.size ? formatFileSize(parseInt(file.size)) : null,
        modifiedAt: file.modifiedTime,
        webUrl: file.webViewLink
      }))
    };
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur searchFiles:', err);
    return { success: false, error: err.message, files: [] };
  }
}

/**
 * Lit le contenu d'un fichier (texte uniquement)
 */
export async function readFile(fileId, userId = 'admin') {
  try {
    const drive = await getAuthenticatedDrive(userId);

    // Obtenir les métadonnées
    const metadata = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, webViewLink'
    });

    const file = metadata.data;
    const mimeType = file.mimeType;

    // Pour les fichiers Google Docs, exporter en texte
    if (mimeType === 'application/vnd.google-apps.document') {
      const response = await drive.files.export({
        fileId,
        mimeType: 'text/plain'
      });
      return {
        success: true,
        file: {
          id: file.id,
          name: file.name,
          type: 'google-doc',
          webUrl: file.webViewLink
        },
        content: response.data
      };
    }

    // Pour les fichiers Google Sheets, exporter en CSV
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const response = await drive.files.export({
        fileId,
        mimeType: 'text/csv'
      });
      return {
        success: true,
        file: {
          id: file.id,
          name: file.name,
          type: 'google-sheet',
          webUrl: file.webViewLink
        },
        content: response.data
      };
    }

    // Pour les fichiers texte simples
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      const response = await drive.files.get({
        fileId,
        alt: 'media'
      });
      return {
        success: true,
        file: {
          id: file.id,
          name: file.name,
          type: 'text',
          mimeType,
          webUrl: file.webViewLink
        },
        content: response.data
      };
    }

    // Pour les autres types, retourner uniquement les métadonnées
    return {
      success: true,
      file: {
        id: file.id,
        name: file.name,
        type: 'binary',
        mimeType,
        size: file.size,
        webUrl: file.webViewLink
      },
      message: 'Fichier binaire - utiliser le lien pour visualiser'
    };
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur readFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Crée un fichier dans Google Drive
 */
export async function createFile(name, content, mimeType = 'text/plain', folderId = 'root', userId = 'admin') {
  try {
    const drive = await getAuthenticatedDrive(userId);

    const fileMetadata = {
      name,
      parents: [folderId]
    };

    const media = {
      mimeType,
      body: content
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, name, webViewLink'
    });

    console.log(`[GOOGLE DRIVE] ✅ Fichier créé: ${name}`);

    return {
      success: true,
      action: 'created',
      file: {
        id: response.data.id,
        name: response.data.name,
        webUrl: response.data.webViewLink
      }
    };
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur createFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Met à jour le contenu d'un fichier
 */
export async function updateFile(fileId, content, userId = 'admin') {
  try {
    const drive = await getAuthenticatedDrive(userId);

    const response = await drive.files.update({
      fileId,
      media: {
        body: content
      },
      fields: 'id, name, webViewLink, modifiedTime'
    });

    console.log(`[GOOGLE DRIVE] ✅ Fichier mis à jour: ${response.data.name}`);

    return {
      success: true,
      action: 'updated',
      file: {
        id: response.data.id,
        name: response.data.name,
        webUrl: response.data.webViewLink,
        modifiedAt: response.data.modifiedTime
      }
    };
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur updateFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Supprime un fichier (déplace vers la corbeille)
 */
export async function deleteFile(fileId, userId = 'admin') {
  try {
    const drive = await getAuthenticatedDrive(userId);

    // Obtenir le nom avant suppression
    const metadata = await drive.files.get({
      fileId,
      fields: 'name'
    });

    await drive.files.update({
      fileId,
      requestBody: { trashed: true }
    });

    console.log(`[GOOGLE DRIVE] 🗑️ Fichier supprimé: ${metadata.data.name}`);

    return {
      success: true,
      action: 'deleted',
      name: metadata.data.name,
      message: 'Fichier déplacé vers la corbeille Google Drive'
    };
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur deleteFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Crée un dossier
 */
export async function createFolder(name, parentId = 'root', userId = 'admin') {
  try {
    const drive = await getAuthenticatedDrive(userId);

    const response = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      },
      fields: 'id, name, webViewLink'
    });

    console.log(`[GOOGLE DRIVE] 📁 Dossier créé: ${name}`);

    return {
      success: true,
      action: 'created',
      folder: {
        id: response.data.id,
        name: response.data.name,
        webUrl: response.data.webViewLink
      }
    };
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur createFolder:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Télécharge un fichier Google Drive vers le serveur local
 */
export async function downloadFile(fileId, localDir = 'halimah-workspace/imports', userId = 'admin') {
  try {
    const drive = await getAuthenticatedDrive(userId);

    // Obtenir les métadonnées
    const metadata = await drive.files.get({
      fileId,
      fields: 'name, mimeType, size'
    });

    const file = metadata.data;
    const localPath = path.join(process.cwd(), 'client/public', localDir, file.name);

    // Créer le répertoire si nécessaire
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Pour les Google Docs, exporter
    if (file.mimeType === 'application/vnd.google-apps.document') {
      const response = await drive.files.export({
        fileId,
        mimeType: 'text/plain'
      }, { responseType: 'stream' });

      const dest = fs.createWriteStream(localPath + '.txt');
      await new Promise((resolve, reject) => {
        response.data.pipe(dest).on('finish', resolve).on('error', reject);
      });

      return {
        success: true,
        action: 'downloaded',
        originalName: file.name,
        localPath: `/${localDir}/${file.name}.txt`,
        type: 'google-doc-exported'
      };
    }

    // Pour les fichiers normaux
    const response = await drive.files.get({
      fileId,
      alt: 'media'
    }, { responseType: 'stream' });

    const dest = fs.createWriteStream(localPath);
    await new Promise((resolve, reject) => {
      response.data.pipe(dest).on('finish', resolve).on('error', reject);
    });

    console.log(`[GOOGLE DRIVE] ⬇️ Fichier téléchargé: ${file.name}`);

    return {
      success: true,
      action: 'downloaded',
      name: file.name,
      localPath: `/${localDir}/${file.name}`,
      size: file.size
    };
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur downloadFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Upload un fichier local vers Google Drive
 */
export async function uploadFile(localPath, folderId = 'root', userId = 'admin') {
  try {
    const drive = await getAuthenticatedDrive(userId);

    const fullPath = path.join(process.cwd(), 'client/public', localPath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'Fichier local non trouvé' };
    }

    const filename = path.basename(fullPath);
    const mimeType = getMimeType(fullPath);

    const response = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId]
      },
      media: {
        mimeType,
        body: fs.createReadStream(fullPath)
      },
      fields: 'id, name, webViewLink, size'
    });

    console.log(`[GOOGLE DRIVE] ⬆️ Fichier uploadé: ${filename}`);

    return {
      success: true,
      action: 'uploaded',
      file: {
        id: response.data.id,
        name: response.data.name,
        webUrl: response.data.webViewLink,
        size: response.data.size
      }
    };
  } catch (err) {
    console.error('[GOOGLE DRIVE] Erreur uploadFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Obtient le statut de connexion Google Drive
 */
export async function getStatus(userId = 'admin') {
  const configured = isConfigured();
  const connected = await isConnected(userId);

  return {
    configured,
    connected,
    message: !configured
      ? 'Google Drive non configuré. Ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env'
      : !connected
        ? 'Non connecté. Cliquez sur "Connecter Google Drive" dans les paramètres.'
        : 'Connecté à Google Drive'
  };
}

// ============================================================
// === UTILITAIRES ===
// ============================================================

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getMimeType(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  const mimeTypes = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export default {
  isConfigured,
  isConnected,
  getAuthUrl,
  handleCallback,
  disconnect,
  getStatus,
  listFiles,
  searchFiles,
  readFile,
  createFile,
  updateFile,
  deleteFile,
  createFolder,
  downloadFile,
  uploadFile
};
