import express from 'express';
const router = express.Router();

// TODO: Réimplémenter SENTINEL routes après migration complète
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SENTINEL routes temporairement désactivées',
    version: '1.0.0',
  });
});

export default router;
