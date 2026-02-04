/**
 * Service de Système de Fichiers pour Halimah Pro
 * Permet à Halimah de lire, écrire et gérer des fichiers dans un workspace dédié
 */

import fs from 'fs';
import path from 'path';

// ============================================================
// === CONFIGURATION ===
// ============================================================

const WORKSPACE_ROOT = path.join(process.cwd(), 'client/public/halimah-workspace');

// Types de fichiers autorisés
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.json', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Créer la structure du workspace si elle n'existe pas
const WORKSPACE_DIRS = ['documents', 'images', 'exports', 'imports', 'temp'];

function initWorkspace() {
  if (!fs.existsSync(WORKSPACE_ROOT)) {
    fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
    console.log('[FILESYSTEM] 📁 Workspace créé:', WORKSPACE_ROOT);
  }

  for (const dir of WORKSPACE_DIRS) {
    const dirPath = path.join(WORKSPACE_ROOT, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // Créer le .gitignore
  const gitignorePath = path.join(WORKSPACE_ROOT, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '# Ignorer les fichiers temporaires\ntemp/*\n!temp/.gitkeep\n');
  }
}

// Initialiser au chargement du module
initWorkspace();

// ============================================================
// === VALIDATION ET SÉCURITÉ ===
// ============================================================

/**
 * Valide et normalise un chemin pour éviter les attaques de traversée
 */
function validatePath(relativePath) {
  // Normaliser le chemin
  const normalizedPath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');

  // Construire le chemin absolu
  const absolutePath = path.join(WORKSPACE_ROOT, normalizedPath);

  // Vérifier que le chemin reste dans le workspace
  if (!absolutePath.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Accès refusé: chemin en dehors du workspace');
  }

  return absolutePath;
}

/**
 * Vérifie si l'extension est autorisée
 */
function isAllowedExtension(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Convertit un chemin absolu en chemin relatif pour l'URL
 */
function toRelativeUrl(absolutePath) {
  const relativePath = absolutePath.replace(path.join(process.cwd(), 'client/public'), '');
  return relativePath.replace(/\\/g, '/');
}

// ============================================================
// === OPÉRATIONS SUR LES FICHIERS ===
// ============================================================

/**
 * Liste les fichiers d'un répertoire
 */
export async function listFiles(directory = '') {
  try {
    const dirPath = validatePath(directory);

    if (!fs.existsSync(dirPath)) {
      return { success: false, error: 'Répertoire non trouvé', files: [] };
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    const files = entries.map(entry => {
      const fullPath = path.join(dirPath, entry.name);
      const stats = fs.statSync(fullPath);

      return {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size),
        extension: entry.isDirectory() ? null : path.extname(entry.name),
        url: entry.isDirectory() ? null : toRelativeUrl(fullPath),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      };
    });

    // Trier: dossiers d'abord, puis par nom
    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      success: true,
      directory: directory || '/',
      count: files.length,
      files
    };
  } catch (err) {
    console.error('[FILESYSTEM] Erreur listFiles:', err);
    return { success: false, error: err.message, files: [] };
  }
}

/**
 * Lit le contenu d'un fichier
 */
export async function readFile(filepath) {
  try {
    const fullPath = validatePath(filepath);

    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'Fichier non trouvé' };
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      return { success: false, error: 'Le chemin spécifié est un répertoire' };
    }

    if (stats.size > MAX_FILE_SIZE) {
      return { success: false, error: 'Fichier trop volumineux' };
    }

    const ext = path.extname(fullPath).toLowerCase();

    // Pour les images et PDF, retourner juste les métadonnées + URL
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf'].includes(ext)) {
      return {
        success: true,
        name: path.basename(fullPath),
        type: ext === '.pdf' ? 'pdf' : 'image',
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size),
        url: toRelativeUrl(fullPath),
        message: ext === '.pdf' ? 'Fichier PDF - utiliser l\'URL pour le télécharger' : 'Image - utiliser l\'URL pour la visualiser'
      };
    }

    // Pour les fichiers texte, lire le contenu
    const content = fs.readFileSync(fullPath, 'utf-8');

    return {
      success: true,
      name: path.basename(fullPath),
      type: 'text',
      size: stats.size,
      sizeFormatted: formatFileSize(stats.size),
      url: toRelativeUrl(fullPath),
      content: content.length > 50000 ? content.substring(0, 50000) + '\n\n[...Fichier tronqué - trop long...]' : content
    };
  } catch (err) {
    console.error('[FILESYSTEM] Erreur readFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Écrit dans un fichier (crée ou remplace)
 */
export async function writeFile(filepath, content) {
  try {
    const fullPath = validatePath(filepath);

    if (!isAllowedExtension(fullPath)) {
      return { success: false, error: `Extension non autorisée. Extensions permises: ${ALLOWED_EXTENSIONS.join(', ')}` };
    }

    // Créer le répertoire parent si nécessaire
    const dirPath = path.dirname(fullPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Vérifier la taille du contenu
    const contentSize = Buffer.byteLength(content, 'utf-8');
    if (contentSize > MAX_FILE_SIZE) {
      return { success: false, error: 'Contenu trop volumineux (max 50MB)' };
    }

    const existed = fs.existsSync(fullPath);
    fs.writeFileSync(fullPath, content, 'utf-8');

    console.log(`[FILESYSTEM] ✅ Fichier ${existed ? 'modifié' : 'créé'}: ${filepath}`);

    return {
      success: true,
      action: existed ? 'modified' : 'created',
      name: path.basename(fullPath),
      path: filepath,
      url: toRelativeUrl(fullPath),
      size: contentSize,
      sizeFormatted: formatFileSize(contentSize)
    };
  } catch (err) {
    console.error('[FILESYSTEM] Erreur writeFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Ajoute du contenu à un fichier existant
 */
export async function appendFile(filepath, content) {
  try {
    const fullPath = validatePath(filepath);

    if (!fs.existsSync(fullPath)) {
      // Si le fichier n'existe pas, le créer
      return writeFile(filepath, content);
    }

    fs.appendFileSync(fullPath, content, 'utf-8');

    const stats = fs.statSync(fullPath);

    console.log(`[FILESYSTEM] ✅ Contenu ajouté à: ${filepath}`);

    return {
      success: true,
      action: 'appended',
      name: path.basename(fullPath),
      path: filepath,
      url: toRelativeUrl(fullPath),
      size: stats.size,
      sizeFormatted: formatFileSize(stats.size)
    };
  } catch (err) {
    console.error('[FILESYSTEM] Erreur appendFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Supprime un fichier
 */
export async function deleteFile(filepath) {
  try {
    const fullPath = validatePath(filepath);

    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'Fichier non trouvé' };
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      return { success: false, error: 'Impossible de supprimer un répertoire avec cette commande' };
    }

    const fileName = path.basename(fullPath);
    fs.unlinkSync(fullPath);

    console.log(`[FILESYSTEM] 🗑️ Fichier supprimé: ${filepath}`);

    return {
      success: true,
      action: 'deleted',
      name: fileName,
      path: filepath
    };
  } catch (err) {
    console.error('[FILESYSTEM] Erreur deleteFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Crée un répertoire
 */
export async function createDirectory(dirpath) {
  try {
    const fullPath = validatePath(dirpath);

    if (fs.existsSync(fullPath)) {
      return { success: false, error: 'Le répertoire existe déjà' };
    }

    fs.mkdirSync(fullPath, { recursive: true });

    console.log(`[FILESYSTEM] 📁 Répertoire créé: ${dirpath}`);

    return {
      success: true,
      action: 'created',
      path: dirpath
    };
  } catch (err) {
    console.error('[FILESYSTEM] Erreur createDirectory:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Recherche dans les fichiers
 */
export async function searchFiles(query, directory = '') {
  try {
    const dirPath = validatePath(directory);
    const results = [];

    function searchRecursive(currentDir) {
      if (!fs.existsSync(currentDir)) return;

      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Rechercher récursivement dans les sous-dossiers
          searchRecursive(fullPath);
        } else {
          // Rechercher dans le nom du fichier
          if (entry.name.toLowerCase().includes(query.toLowerCase())) {
            results.push({
              type: 'filename_match',
              name: entry.name,
              path: fullPath.replace(WORKSPACE_ROOT, '').replace(/^[\/\\]/, ''),
              url: toRelativeUrl(fullPath)
            });
          }

          // Rechercher dans le contenu des fichiers texte
          const ext = path.extname(entry.name).toLowerCase();
          if (['.txt', '.md', '.json', '.csv'].includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              if (content.toLowerCase().includes(query.toLowerCase())) {
                // Trouver le contexte autour de la correspondance
                const index = content.toLowerCase().indexOf(query.toLowerCase());
                const start = Math.max(0, index - 50);
                const end = Math.min(content.length, index + query.length + 50);
                const context = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '');

                results.push({
                  type: 'content_match',
                  name: entry.name,
                  path: fullPath.replace(WORKSPACE_ROOT, '').replace(/^[\/\\]/, ''),
                  url: toRelativeUrl(fullPath),
                  context: context.replace(/\n/g, ' ')
                });
              }
            } catch (e) {
              // Ignorer les erreurs de lecture
            }
          }
        }
      }
    }

    searchRecursive(dirPath);

    return {
      success: true,
      query,
      directory: directory || '/',
      count: results.length,
      results: results.slice(0, 50) // Limiter à 50 résultats
    };
  } catch (err) {
    console.error('[FILESYSTEM] Erreur searchFiles:', err);
    return { success: false, error: err.message, results: [] };
  }
}

/**
 * Copie un fichier
 */
export async function copyFile(sourcePath, destPath) {
  try {
    const fullSourcePath = validatePath(sourcePath);
    const fullDestPath = validatePath(destPath);

    if (!fs.existsSync(fullSourcePath)) {
      return { success: false, error: 'Fichier source non trouvé' };
    }

    // Créer le répertoire de destination si nécessaire
    const destDir = path.dirname(fullDestPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(fullSourcePath, fullDestPath);

    console.log(`[FILESYSTEM] 📋 Fichier copié: ${sourcePath} -> ${destPath}`);

    return {
      success: true,
      action: 'copied',
      source: sourcePath,
      destination: destPath,
      url: toRelativeUrl(fullDestPath)
    };
  } catch (err) {
    console.error('[FILESYSTEM] Erreur copyFile:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Renomme/déplace un fichier
 */
export async function moveFile(sourcePath, destPath) {
  try {
    const fullSourcePath = validatePath(sourcePath);
    const fullDestPath = validatePath(destPath);

    if (!fs.existsSync(fullSourcePath)) {
      return { success: false, error: 'Fichier source non trouvé' };
    }

    // Créer le répertoire de destination si nécessaire
    const destDir = path.dirname(fullDestPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.renameSync(fullSourcePath, fullDestPath);

    console.log(`[FILESYSTEM] 📦 Fichier déplacé: ${sourcePath} -> ${destPath}`);

    return {
      success: true,
      action: 'moved',
      source: sourcePath,
      destination: destPath,
      url: toRelativeUrl(fullDestPath)
    };
  } catch (err) {
    console.error('[FILESYSTEM] Erreur moveFile:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================
// === UTILITAIRES ===
// ============================================================

/**
 * Formate la taille d'un fichier
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Obtient des statistiques sur le workspace
 */
export async function getWorkspaceStats() {
  try {
    let totalFiles = 0;
    let totalSize = 0;
    const byType = {};

    function countRecursive(dir) {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          countRecursive(fullPath);
        } else {
          totalFiles++;
          const stats = fs.statSync(fullPath);
          totalSize += stats.size;

          const ext = path.extname(entry.name).toLowerCase() || 'sans extension';
          byType[ext] = (byType[ext] || 0) + 1;
        }
      }
    }

    countRecursive(WORKSPACE_ROOT);

    return {
      success: true,
      totalFiles,
      totalSize,
      totalSizeFormatted: formatFileSize(totalSize),
      byType,
      workspacePath: '/halimah-workspace'
    };
  } catch (err) {
    console.error('[FILESYSTEM] Erreur stats:', err);
    return { success: false, error: err.message };
  }
}

export default {
  listFiles,
  readFile,
  writeFile,
  appendFile,
  deleteFile,
  createDirectory,
  searchFiles,
  copyFile,
  moveFile,
  getWorkspaceStats
};
