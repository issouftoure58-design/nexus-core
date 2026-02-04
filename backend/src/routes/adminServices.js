import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateAdmin } from './adminAuth.js';

const router = express.Router();

// GET /api/admin/services - Liste tous les services
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { data: services, error } = await supabase
      .from('services')
      .select('*')
      .order('ordre', { ascending: true });

    if (error) throw error;

    // Mapper les champs pour le frontend (duree -> duree_minutes)
    const mappedServices = services.map(s => ({
      ...s,
      duree_minutes: s.duree_minutes || s.duree || 0, // Compatibilité avec les deux noms de champ
      actif: s.actif !== false
    }));

    res.json({ services: mappedServices });
  } catch (error) {
    console.error('[ADMIN SERVICES] Erreur liste:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/admin/services/:id - Un service
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { data: service, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    res.json({ service });
  } catch (error) {
    console.error('[ADMIN SERVICES] Erreur détail:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/services - Créer service
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { nom, description, prix, duree_minutes, categorie, actif } = req.body;

    if (!nom || !prix || !duree_minutes) {
      return res.status(400).json({ error: 'Nom, prix et durée requis' });
    }

    // Récupérer le prochain ordre
    const { data: maxOrdre } = await supabase
      .from('services')
      .select('ordre')
      .order('ordre', { ascending: false })
      .limit(1)
      .single();

    const ordre = (maxOrdre?.ordre || 0) + 1;

    const { data: service, error } = await supabase
      .from('services')
      .insert({
        nom,
        description,
        prix: Math.round(prix * 100), // Convertir en centimes
        duree: duree_minutes, // Le champ s'appelle 'duree' dans la DB
        categorie: categorie || 'Coiffure',
        actif: actif !== false,
        ordre
      })
      .select()
      .single();

    if (error) throw error;

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'create',
      entite: 'service',
      entite_id: service.id,
      details: { nom: service.nom, prix: service.prix }
    });

    res.json({ service });
  } catch (error) {
    console.error('[ADMIN SERVICES] Erreur création:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/admin/services/:id - Modifier service
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { nom, description, prix, duree_minutes, categorie, actif } = req.body;

    const updates = {};
    if (nom !== undefined) updates.nom = nom;
    if (description !== undefined) updates.description = description;
    if (prix !== undefined) updates.prix = Math.round(prix * 100); // Convertir en centimes
    if (duree_minutes !== undefined) updates.duree = duree_minutes; // Le champ s'appelle 'duree' dans la DB
    if (categorie !== undefined) updates.categorie = categorie;
    if (actif !== undefined) updates.actif = actif;
    updates.updated_at = new Date().toISOString();

    const { data: service, error } = await supabase
      .from('services')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'update',
      entite: 'service',
      entite_id: service.id,
      details: { updates }
    });

    res.json({ service });
  } catch (error) {
    console.error('[ADMIN SERVICES] Erreur modification:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/services/:id - Supprimer service
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    // Vérifier si service utilisé dans des réservations
    const { count } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('service_id', req.params.id);

    if (count > 0) {
      return res.status(400).json({
        error: `Impossible de supprimer: ${count} réservation(s) utilisent ce service`
      });
    }

    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'delete',
      entite: 'service',
      entite_id: req.params.id
    });

    res.json({ message: 'Service supprimé' });
  } catch (error) {
    console.error('[ADMIN SERVICES] Erreur suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/admin/services/:id/toggle - Activer/Désactiver
router.patch('/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const { data: service } = await supabase
      .from('services')
      .select('actif')
      .eq('id', req.params.id)
      .single();

    const { data: updated, error } = await supabase
      .from('services')
      .update({ actif: !service.actif })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'toggle',
      entite: 'service',
      entite_id: updated.id,
      details: { actif: updated.actif }
    });

    res.json({ service: updated });
  } catch (error) {
    console.error('[ADMIN SERVICES] Erreur toggle:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
