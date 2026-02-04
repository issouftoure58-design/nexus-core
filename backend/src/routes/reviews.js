/**
 * Routes Avis Clients - Fat's Hair-Afro
 *
 * GET  /api/reviews              - Avis approuvés (public)
 * POST /api/reviews              - Soumettre un avis (via token)
 * GET  /api/admin/reviews        - Tous les avis (admin)
 * PATCH /api/admin/reviews/:id   - Approuver/rejeter (admin)
 */

import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateAdmin } from './adminAuth.js';
import crypto from 'crypto';

const router = express.Router();

// ============================================
// ROUTES PUBLIQUES
// ============================================

// GET /api/reviews - Avis approuvés (public)
router.get('/', async (req, res) => {
  try {
    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('id, client_prenom, rating, comment, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    // Calculer la note moyenne
    const ratings = (reviews || []).map(r => r.rating);
    const moyenne = ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : 0;

    res.json({
      success: true,
      reviews: reviews || [],
      stats: {
        total: ratings.length,
        moyenne,
        distribution: {
          5: ratings.filter(r => r === 5).length,
          4: ratings.filter(r => r === 4).length,
          3: ratings.filter(r => r === 3).length,
          2: ratings.filter(r => r === 2).length,
          1: ratings.filter(r => r === 1).length,
        }
      }
    });
  } catch (error) {
    console.error('[REVIEWS] Erreur GET /:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/reviews - Soumettre un avis (via token)
router.post('/', async (req, res) => {
  try {
    const { token } = req.query;
    const { rating, comment } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token requis' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Note entre 1 et 5 requise' });
    }

    // Vérifier le token (lié à une réservation)
    const { data: reservation, error: resErr } = await supabase
      .from('reservations')
      .select('id, client_id, client_nom, demande_avis_envoyee')
      .eq('avis_token', token)
      .single();

    if (resErr || !reservation) {
      return res.status(404).json({ error: 'Lien invalide ou expiré' });
    }

    // Vérifier qu'un avis n'a pas déjà été soumis pour cette réservation
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('reservation_id', reservation.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Vous avez déjà laissé un avis pour cette prestation' });
    }

    // Extraire le prénom du client
    let clientPrenom = 'Client';
    if (reservation.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('prenom, nom')
        .eq('id', reservation.client_id)
        .single();
      if (client) {
        clientPrenom = client.prenom || client.nom || 'Client';
      }
    }

    // Créer l'avis
    const { data: review, error: insertErr } = await supabase
      .from('reviews')
      .insert({
        client_id: reservation.client_id,
        reservation_id: reservation.id,
        client_prenom: clientPrenom,
        rating: parseInt(rating),
        comment: comment?.trim() || null,
        status: 'pending'
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    res.status(201).json({
      success: true,
      message: 'Merci pour votre avis ! Il sera publié après modération.',
      review: { id: review.id, rating: review.rating }
    });
  } catch (error) {
    console.error('[REVIEWS] Erreur POST /:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// ROUTES ADMIN
// ============================================

// GET /api/admin/reviews - Tous les avis (admin)
router.get('/admin', authenticateAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from('reviews')
      .select('*', { count: 'exact' });

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data: reviews, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    // Compter par statut
    const { data: pendingData } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    res.json({
      success: true,
      reviews: reviews || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / parseInt(limit))
      },
      pendingCount: pendingData?.length || 0
    });
  } catch (error) {
    console.error('[REVIEWS] Erreur GET /admin:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/admin/reviews/:id - Approuver/rejeter (admin)
router.patch('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Statut invalide (approved ou rejected)' });
    }

    const updateData = { status };
    if (status === 'approved') {
      updateData.approved_at = new Date().toISOString();
    }

    const { data: review, error } = await supabase
      .from('reviews')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      review,
      message: status === 'approved' ? 'Avis approuvé et publié' : 'Avis rejeté'
    });
  } catch (error) {
    console.error('[REVIEWS] Erreur PATCH /admin/:id:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================
// UTILITAIRE : Générer un token d'avis pour une réservation
// ============================================

export async function generateReviewToken(reservationId) {
  const token = crypto.randomBytes(32).toString('hex');

  await supabase
    .from('reservations')
    .update({ avis_token: token, demande_avis_envoyee: true })
    .eq('id', reservationId);

  return token;
}

export default router;
