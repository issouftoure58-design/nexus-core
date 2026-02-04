import express from 'express';

const router = express.Router();

// ============= AUTOCOMPLETE ADRESSE (API Adresse data.gouv.fr) =============
// GET /api/places/autocomplete?input=15 rue de la paix
// Utilise l'API gratuite du gouvernement français
router.get('/autocomplete', async (req, res) => {
  try {
    const { input } = req.query;

    if (!input || input.length < 3) {
      return res.json({ success: true, predictions: [] });
    }

    // API Adresse du gouvernement français (gratuite, sans clé API)
    const url = new URL('https://api-adresse.data.gouv.fr/search/');
    url.searchParams.set('q', input);
    url.searchParams.set('limit', '5');
    url.searchParams.set('autocomplete', '1');

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.features && data.features.length > 0) {
      res.json({
        success: true,
        predictions: data.features.map((f) => ({
          place_id: f.properties.id || '',
          description: f.properties.label || '',
          city: f.properties.city || '',
          postcode: f.properties.postcode || '',
          context: f.properties.context || ''
        }))
      });
    } else {
      res.json({ success: true, predictions: [] });
    }

  } catch (error) {
    console.error('[PLACES] Erreur autocomplete:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

export default router;
