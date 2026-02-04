import express from 'express';
import { authenticateAdmin } from './adminAuth.js';
import { generateImage } from '../tools/halimahPro/generateImage.js';
import { generateCaption } from '../tools/halimahPro/generateCaption.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Charger les templates
const templatesPath = path.join(process.cwd(), 'backend/src/data/contentTemplates.json');
let contentTemplates = {};

try {
  const templatesData = fs.readFileSync(templatesPath, 'utf-8');
  contentTemplates = JSON.parse(templatesData);
  console.log('[CONTENT CREATOR] Templates chargés:', Object.keys(contentTemplates.templates || {}).length);
} catch (error) {
  console.error('[CONTENT CREATOR] Erreur chargement templates:', error.message);
}

// GET /api/content/templates - Récupérer les templates disponibles
router.get('/templates', authenticateAdmin, (req, res) => {
  res.json({
    success: true,
    templates: contentTemplates.templates || {},
    hashtags: contentTemplates.hashtags || {},
    styles: contentTemplates.styles || {},
    formats: contentTemplates.formats || {}
  });
});

// POST /api/content/generate-image - Générer une image
router.post('/generate-image', authenticateAdmin, async (req, res) => {
  try {
    const { prompt, style, format, outputName } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Le prompt est requis'
      });
    }

    console.log('[CONTENT CREATOR] Génération image demandée');

    const result = await generateImage({ prompt, style, format, outputName });
    res.json(result);

  } catch (error) {
    console.error('[CONTENT CREATOR] Erreur génération image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/content/generate-caption - Générer une légende
router.post('/generate-caption', authenticateAdmin, async (req, res) => {
  try {
    const { type, platform, data } = req.body;

    if (!type || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Le type et la plateforme sont requis'
      });
    }

    console.log('[CONTENT CREATOR] Génération légende demandée:', type, platform);

    const result = await generateCaption({ type, platform, data });
    res.json(result);

  } catch (error) {
    console.error('[CONTENT CREATOR] Erreur génération légende:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/content/create-post - Créer un post complet (image + légende)
router.post('/create-post', authenticateAdmin, async (req, res) => {
  try {
    const { templateType, platform, data = {} } = req.body;

    if (!templateType || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Le type de template et la plateforme sont requis'
      });
    }

    const template = contentTemplates.templates?.[templateType];

    if (!template) {
      return res.status(400).json({
        success: false,
        error: `Template "${templateType}" non trouvé`,
        availableTemplates: Object.keys(contentTemplates.templates || {})
      });
    }

    console.log('[CONTENT CREATOR] Création post complet:', templateType, platform);

    // Générer le prompt d'image en remplaçant les variables
    let imagePrompt = template.imagePrompt;
    Object.keys(data).forEach(key => {
      imagePrompt = imagePrompt.replace(new RegExp(`\\{${key}\\}`, 'g'), data[key]);
    });

    // Nettoyer les variables non remplacées
    imagePrompt = imagePrompt.replace(/\{[^}]+\}/g, '');

    // Déterminer le format selon la plateforme
    const format = (platform === 'stories' || platform === 'tiktok') ? 'portrait' : 'square';

    // Générer l'image
    console.log('[CONTENT CREATOR] Génération de l\'image...');
    const imageResult = await generateImage({
      prompt: imagePrompt,
      style: data.style || 'african',
      format,
      outputName: `${templateType}-${Date.now()}`
    });

    // Générer la légende
    console.log('[CONTENT CREATOR] Génération de la légende...');
    const captionResult = await generateCaption({
      type: templateType,
      platform: platform === 'stories' ? 'instagram' : platform,
      data
    });

    // Résultat combiné
    const result = {
      success: imageResult.success && captionResult.success,
      image: imageResult,
      caption: captionResult,
      template: templateType,
      platform,
      format,
      createdAt: new Date().toISOString()
    };

    // Si une erreur partielle, inclure les détails
    if (!imageResult.success) {
      result.imageError = imageResult.error;
    }
    if (!captionResult.success) {
      result.captionError = captionResult.error;
    }

    res.json(result);

  } catch (error) {
    console.error('[CONTENT CREATOR] Erreur création post:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/content/generated - Lister les images générées
router.get('/generated', authenticateAdmin, (req, res) => {
  try {
    const generatedDir = path.join(process.cwd(), 'client/public/generated');

    if (!fs.existsSync(generatedDir)) {
      return res.json({
        success: true,
        images: [],
        message: 'Aucune image générée'
      });
    }

    const files = fs.readdirSync(generatedDir)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp'))
      .map(f => {
        const stats = fs.statSync(path.join(generatedDir, f));
        return {
          name: f,
          path: `/generated/${f}`,
          size: stats.size,
          createdAt: stats.birthtime
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      images: files,
      count: files.length
    });

  } catch (error) {
    console.error('[CONTENT CREATOR] Erreur listing images:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/content/generated/:filename - Supprimer une image générée
router.delete('/generated/:filename', authenticateAdmin, (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../../client/public/generated', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Image non trouvée'
      });
    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: `Image ${filename} supprimée`
    });

  } catch (error) {
    console.error('[CONTENT CREATOR] Erreur suppression image:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
