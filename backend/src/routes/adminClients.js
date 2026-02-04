import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateAdmin } from './adminAuth.js';

const router = express.Router();

// ════════════════════════════════════════════════════════════════════
// CLIENTS - LISTE ET CRUD
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/clients
// Liste tous les clients avec pagination et recherche
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      search = '',
      sort = 'created_at',
      order = 'desc',
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Query de base
    let query = supabase
      .from('clients')
      .select('*', { count: 'exact' });

    // Recherche par nom, prénom, téléphone ou email
    if (search) {
      query = query.or(`nom.ilike.%${search}%,prenom.ilike.%${search}%,telephone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Tri
    query = query.order(sort, { ascending: order === 'asc' });

    // Pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data: clients, error, count } = await query;

    if (error) throw error;

    // Pour chaque client, récupérer stats RDV
    const clientsWithStats = await Promise.all(
      clients.map(async (client) => {
        // Count total RDV
        const { count: nbRdv } = await supabase
          .from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', client.id);

        // Dernier RDV
        const { data: dernierRdv } = await supabase
          .from('reservations')
          .select('date, heure, service, statut')
          .eq('client_id', client.id)
          .order('date', { ascending: false })
          .limit(1)
          .single();

        return {
          ...client,
          nb_rdv: nbRdv || 0,
          dernier_rdv: dernierRdv
        };
      })
    );

    res.json({
      clients: clientsWithStats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum)
      }
    });
  } catch (error) {
    console.error('[ADMIN CLIENTS] Erreur liste:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/admin/clients/:id
// Détail complet d'un client
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    // Infos client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (clientError) throw clientError;

    if (!client) {
      return res.status(404).json({ error: 'Client introuvable' });
    }

    // Historique RDV (10 derniers)
    const { data: historiqueRdv } = await supabase
      .from('reservations')
      .select('*, services(nom)')
      .eq('client_id', req.params.id)
      .order('date', { ascending: false })
      .limit(10);

    // Notes privées
    const { data: notes } = await supabase
      .from('notes_clients')
      .select('*')
      .eq('client_id', req.params.id)
      .order('created_at', { ascending: false });

    // STATISTIQUES
    // Total RDV
    const { data: allRdv } = await supabase
      .from('reservations')
      .select('statut, prix_total, service, date')
      .eq('client_id', req.params.id);

    const nbRdvTotal = allRdv?.length || 0;
    const nbRdvHonores = allRdv?.filter(r => r.statut === 'termine').length || 0;
    const nbRdvAnnules = allRdv?.filter(r => r.statut === 'annule').length || 0;

    // CA total (RDV terminés uniquement)
    const caTotal = allRdv
      ?.filter(r => r.statut === 'termine')
      .reduce((sum, r) => sum + (r.prix_total || 0), 0) / 100 || 0;

    // Service favori (le plus demandé)
    const servicesCount = {};
    allRdv?.forEach(r => {
      if (r.service) {
        servicesCount[r.service] = (servicesCount[r.service] || 0) + 1;
      }
    });
    const serviceFavori = Object.entries(servicesCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Fréquence moyenne entre RDV (en jours)
    let frequenceJours = null;
    if (allRdv && allRdv.length > 1) {
      const dates = allRdv
        .map(r => new Date(r.date))
        .sort((a, b) => a - b);

      let totalJours = 0;
      for (let i = 1; i < dates.length; i++) {
        const diff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        totalJours += diff;
      }
      frequenceJours = Math.round(totalJours / (dates.length - 1));
    }

    // Dernière visite
    const derniereVisite = allRdv
      ?.filter(r => r.statut === 'termine')
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.date || null;

    res.json({
      client: {
        ...client,
        derniere_visite: derniereVisite
      },
      stats: {
        ca_total: caTotal,
        nb_rdv_total: nbRdvTotal,
        nb_rdv_honores: nbRdvHonores,
        nb_rdv_annules: nbRdvAnnules,
        service_favori: serviceFavori,
        frequence_jours: frequenceJours
      },
      notes: notes || [],
      historique_rdv: historiqueRdv || []
    });
  } catch (error) {
    console.error('[ADMIN CLIENTS] Erreur détail:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/admin/clients/:id
// Modifier les infos d'un client
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { nom, prenom, telephone, email, adresse } = req.body;

    const updates = {};
    if (nom !== undefined) updates.nom = nom;
    if (prenom !== undefined) updates.prenom = prenom;
    if (telephone !== undefined) updates.telephone = telephone;
    if (email !== undefined) updates.email = email;
    if (adresse !== undefined) updates.adresse = adresse;
    updates.updated_at = new Date().toISOString();

    const { data: client, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'update',
      entite: 'client',
      entite_id: client.id,
      details: { updates }
    });

    res.json({ client });
  } catch (error) {
    console.error('[ADMIN CLIENTS] Erreur modification:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/clients/:id
// Supprimer un client
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    // Vérifier s'il y a des RDV futurs
    const today = new Date().toISOString().split('T')[0];
    const { count: rdvFuturs } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', req.params.id)
      .gte('date', today)
      .neq('statut', 'annule');

    if (rdvFuturs > 0) {
      return res.status(400).json({
        error: `Impossible de supprimer : ${rdvFuturs} rendez-vous futur(s) planifié(s)`
      });
    }

    // Supprimer les notes d'abord (foreign key)
    await supabase
      .from('notes_clients')
      .delete()
      .eq('client_id', req.params.id);

    // Supprimer le client
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'delete',
      entite: 'client',
      entite_id: req.params.id
    });

    res.json({ message: 'Client supprimé' });
  } catch (error) {
    console.error('[ADMIN CLIENTS] Erreur suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════════════
// NOTES PRIVÉES
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/clients/:id/notes
// Liste les notes d'un client
router.get('/:id/notes', authenticateAdmin, async (req, res) => {
  try {
    const { data: notes, error } = await supabase
      .from('notes_clients')
      .select('*')
      .eq('client_id', req.params.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ notes });
  } catch (error) {
    console.error('[ADMIN CLIENTS] Erreur liste notes:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/admin/clients/:id/notes
// Ajouter une note privée
router.post('/:id/notes', authenticateAdmin, async (req, res) => {
  try {
    const { note } = req.body;

    if (!note || note.trim() === '') {
      return res.status(400).json({ error: 'La note ne peut pas être vide' });
    }

    const { data: newNote, error } = await supabase
      .from('notes_clients')
      .insert({
        client_id: req.params.id,
        note: note.trim()
      })
      .select()
      .single();

    if (error) throw error;

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'create',
      entite: 'note_client',
      entite_id: newNote.id,
      details: { client_id: req.params.id }
    });

    res.json({ note: newNote });
  } catch (error) {
    console.error('[ADMIN CLIENTS] Erreur création note:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/clients/:id/notes/:noteId
// Supprimer une note
router.delete('/:id/notes/:noteId', authenticateAdmin, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notes_clients')
      .delete()
      .eq('id', req.params.noteId)
      .eq('client_id', req.params.id); // Sécurité: vérifier que la note appartient au client

    if (error) throw error;

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'delete',
      entite: 'note_client',
      entite_id: req.params.noteId
    });

    res.json({ message: 'Note supprimée' });
  } catch (error) {
    console.error('[ADMIN CLIENTS] Erreur suppression note:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════════════
// STATISTIQUES CLIENT
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/clients/:id/stats
// Statistiques détaillées d'un client
router.get('/:id/stats', authenticateAdmin, async (req, res) => {
  try {
    // Récupérer tous les RDV du client
    const { data: rdv } = await supabase
      .from('reservations')
      .select('statut, prix_total, service, date')
      .eq('client_id', req.params.id);

    if (!rdv) {
      return res.json({
        ca_total: 0,
        nb_rdv_total: 0,
        nb_rdv_honores: 0,
        nb_rdv_annules: 0,
        service_favori: null,
        frequence_jours: null
      });
    }

    const nbRdvTotal = rdv.length;
    const nbRdvHonores = rdv.filter(r => r.statut === 'termine').length;
    const nbRdvAnnules = rdv.filter(r => r.statut === 'annule').length;

    // CA total
    const caTotal = rdv
      .filter(r => r.statut === 'termine')
      .reduce((sum, r) => sum + (r.prix_total || 0), 0) / 100;

    // Service favori
    const servicesCount = {};
    rdv.forEach(r => {
      if (r.service) {
        servicesCount[r.service] = (servicesCount[r.service] || 0) + 1;
      }
    });
    const serviceFavori = Object.entries(servicesCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Fréquence moyenne
    let frequenceJours = null;
    if (rdv.length > 1) {
      const dates = rdv
        .map(r => new Date(r.date))
        .sort((a, b) => a - b);

      let totalJours = 0;
      for (let i = 1; i < dates.length; i++) {
        const diff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24);
        totalJours += diff;
      }
      frequenceJours = Math.round(totalJours / (dates.length - 1));
    }

    res.json({
      ca_total: caTotal,
      nb_rdv_total: nbRdvTotal,
      nb_rdv_honores: nbRdvHonores,
      nb_rdv_annules: nbRdvAnnules,
      service_favori: serviceFavori,
      frequence_jours: frequenceJours
    });
  } catch (error) {
    console.error('[ADMIN CLIENTS] Erreur stats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
