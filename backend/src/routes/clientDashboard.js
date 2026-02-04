import { Router } from 'express';
import { supabase } from '../../../server/supabase.js';
import { authenticateClient } from './clientAuth.js';

const router = Router();

// Toutes les routes nécessitent une authentification
router.use(authenticateClient);

// ============= PROFIL =============

// GET /profile - Récupérer le profil complet
router.get('/profile', async (req, res) => {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('id, nom, prenom, email, telephone, email_verified, loyalty_points, total_spent, created_at')
      .eq('id', req.client.id)
      .single();

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client non trouvé'
      });
    }

    res.json({
      success: true,
      client: {
        id: client.id,
        nom: client.nom,
        prenom: client.prenom,
        email: client.email,
        telephone: client.telephone,
        emailVerified: client.email_verified,
        loyaltyPoints: client.loyalty_points || 0,
        totalSpent: client.total_spent || 0,
        memberSince: client.created_at
      }
    });

  } catch (error) {
    console.error('Erreur get profile:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// PATCH /profile - Mettre à jour le profil
router.patch('/profile', async (req, res) => {
  try {
    const { nom, prenom, telephone } = req.body;

    const updates = {};
    if (nom) updates.nom = nom;
    if (prenom !== undefined) updates.prenom = prenom || null;
    if (telephone) updates.telephone = telephone;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Aucune modification fournie'
      });
    }

    const { error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', req.client.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Profil mis à jour'
    });

  } catch (error) {
    console.error('Erreur update profile:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ============= RÉSERVATIONS =============

// GET /reservations - Toutes les réservations
router.get('/reservations', async (req, res) => {
  try {
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('client_id', req.client.id)
      .order('date', { ascending: false })
      .order('heure', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      reservations: reservations.map(r => ({
        id: r.id,
        service: r.service_nom,
        date: r.date,
        heure: r.heure,
        statut: r.statut,
        prixTotal: r.prix_total,
        adresse: r.adresse_client,
        notes: r.notes,
        pointsEarned: r.loyalty_points_earned || 0,
        createdAt: r.created_at
      }))
    });

  } catch (error) {
    console.error('Erreur get reservations:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// GET /reservations/upcoming - Réservations à venir
router.get('/reservations/upcoming', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('client_id', req.client.id)
      .gte('date', today)
      .in('statut', ['demande', 'confirme'])
      .order('date', { ascending: true })
      .order('heure', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      reservations: reservations.map(r => ({
        id: r.id,
        service: r.service_nom,
        date: r.date,
        heure: r.heure,
        statut: r.statut,
        prixTotal: r.prix_total,
        adresse: r.adresse_client,
        notes: r.notes
      }))
    });

  } catch (error) {
    console.error('Erreur get upcoming:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// GET /reservations/history - Historique des réservations
router.get('/reservations/history', async (req, res) => {
  try {
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('client_id', req.client.id)
      .in('statut', ['termine', 'annule'])
      .order('date', { ascending: false })
      .order('heure', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      success: true,
      reservations: reservations.map(r => ({
        id: r.id,
        service: r.service_nom,
        date: r.date,
        heure: r.heure,
        statut: r.statut,
        prixTotal: r.prix_total,
        pointsEarned: r.loyalty_points_earned || 0,
        createdAt: r.created_at
      }))
    });

  } catch (error) {
    console.error('Erreur get history:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// DELETE /reservations/:id - Annuler une réservation
router.delete('/reservations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier que la réservation appartient au client
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', id)
      .eq('client_id', req.client.id)
      .single();

    if (fetchError || !reservation) {
      return res.status(404).json({
        success: false,
        error: 'Réservation non trouvée'
      });
    }

    // Vérifier le statut
    if (reservation.statut === 'termine') {
      return res.status(400).json({
        success: false,
        error: 'Impossible d\'annuler une réservation terminée'
      });
    }

    if (reservation.statut === 'annule') {
      return res.status(400).json({
        success: false,
        error: 'Cette réservation est déjà annulée'
      });
    }

    // Vérifier le délai d'annulation (24h avant)
    const rdvDate = new Date(`${reservation.date}T${reservation.heure}`);
    const now = new Date();
    const hoursUntilRdv = (rdvDate - now) / (1000 * 60 * 60);

    if (hoursUntilRdv < 24) {
      return res.status(400).json({
        success: false,
        error: 'Les annulations doivent être faites au moins 24h avant le rendez-vous'
      });
    }

    // Annuler la réservation
    const { error: updateError } = await supabase
      .from('reservations')
      .update({
        statut: 'annule',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: 'Réservation annulée avec succès'
    });

  } catch (error) {
    console.error('Erreur cancel reservation:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ============= FIDÉLITÉ =============

// GET /loyalty/balance - Solde des points
router.get('/loyalty/balance', async (req, res) => {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('loyalty_points, total_spent')
      .eq('id', req.client.id)
      .single();

    res.json({
      success: true,
      balance: {
        points: client?.loyalty_points || 0,
        totalSpent: client?.total_spent || 0
      }
    });

  } catch (error) {
    console.error('Erreur get balance:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// GET /loyalty/transactions - Historique des points
router.get('/loyalty/transactions', async (req, res) => {
  try {
    const { data: transactions, error } = await supabase
      .from('loyalty_transactions')
      .select('*')
      .eq('client_id', req.client.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      success: true,
      transactions: (transactions || []).map(t => ({
        id: t.id,
        type: t.type,
        points: t.points,
        description: t.description,
        createdAt: t.created_at
      }))
    });

  } catch (error) {
    console.error('Erreur get transactions:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// GET /loyalty/rewards - Récompenses disponibles
router.get('/loyalty/rewards', async (req, res) => {
  try {
    const { data: rewards, error } = await supabase
      .from('loyalty_rewards')
      .select('*')
      .eq('is_active', true)
      .order('points_required', { ascending: true });

    if (error) throw error;

    // Récupérer le solde du client
    const { data: client } = await supabase
      .from('clients')
      .select('loyalty_points')
      .eq('id', req.client.id)
      .single();

    const currentPoints = client?.loyalty_points || 0;

    res.json({
      success: true,
      currentPoints,
      rewards: (rewards || []).map(r => ({
        id: r.id,
        nom: r.nom,
        description: r.description,
        pointsRequired: r.points_required,
        reductionAmount: r.reduction_amount,
        canRedeem: currentPoints >= r.points_required
      }))
    });

  } catch (error) {
    console.error('Erreur get rewards:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// POST /loyalty/redeem - Échanger des points contre une récompense
router.post('/loyalty/redeem', async (req, res) => {
  try {
    const { rewardId } = req.body;

    if (!rewardId) {
      return res.status(400).json({
        success: false,
        error: 'ID de récompense requis'
      });
    }

    // Récupérer la récompense
    const { data: reward, error: rewardError } = await supabase
      .from('loyalty_rewards')
      .select('*')
      .eq('id', rewardId)
      .eq('is_active', true)
      .single();

    if (rewardError || !reward) {
      return res.status(404).json({
        success: false,
        error: 'Récompense non trouvée ou inactive'
      });
    }

    // Récupérer le solde du client
    const { data: client } = await supabase
      .from('clients')
      .select('loyalty_points')
      .eq('id', req.client.id)
      .single();

    const currentPoints = client?.loyalty_points || 0;

    if (currentPoints < reward.points_required) {
      return res.status(400).json({
        success: false,
        error: `Points insuffisants. Vous avez ${currentPoints} points, ${reward.points_required} requis.`
      });
    }

    // Déduire les points
    const newBalance = currentPoints - reward.points_required;

    await supabase
      .from('clients')
      .update({ loyalty_points: newBalance })
      .eq('id', req.client.id);

    // Créer la transaction
    await supabase.from('loyalty_transactions').insert({
      client_id: req.client.id,
      type: 'redeem',
      points: -reward.points_required,
      description: `Récompense: ${reward.nom}`,
      reward_id: reward.id
    });

    res.json({
      success: true,
      message: `Récompense "${reward.nom}" obtenue avec succès !`,
      newBalance,
      reward: {
        nom: reward.nom,
        description: reward.description
      }
    });

  } catch (error) {
    console.error('Erreur redeem:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

export default router;
