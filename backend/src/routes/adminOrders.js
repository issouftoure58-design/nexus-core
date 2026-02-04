import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateAdmin } from './adminAuth.js';

const router = express.Router();

// Statuts possibles pour une commande
const STATUTS_VALIDES = ['en_attente', 'confirme', 'paye', 'termine', 'annule'];

// ════════════════════════════════════════════════════════════════════
// LISTE & FILTRES
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/orders
// Liste toutes les commandes avec filtres et pagination
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      statut,
      paiement,
      periode = 'semaine',
      page = 1,
      limit = 20,
      sort = 'created_at',
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Calculer les dates selon la période
    const now = new Date();
    let dateDebut = null;

    switch (periode) {
      case 'aujourd_hui':
        dateDebut = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'semaine':
        dateDebut = new Date(now);
        dateDebut.setDate(now.getDate() - 7);
        break;
      case 'mois':
        dateDebut = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'tous':
        dateDebut = null;
        break;
      default:
        dateDebut = new Date(now);
        dateDebut.setDate(now.getDate() - 7);
    }

    // Query de base avec jointures
    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          service_nom,
          service_description,
          duree_minutes,
          prix,
          ordre
        )
      `, { count: 'exact' });

    // Filtres
    if (statut && statut !== 'tous') {
      query = query.eq('statut', statut);
    }
    if (paiement && paiement !== 'tous') {
      query = query.eq('paiement_methode', paiement);
    }
    if (dateDebut) {
      query = query.gte('created_at', dateDebut.toISOString());
    }

    // Tri
    query = query.order(sort, { ascending: order === 'asc' });

    // Pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data: orders, error, count } = await query;

    if (error) throw error;

    res.json({
      orders: orders || [],
      totalPages: Math.ceil((count || 0) / limitNum),
      total: count || 0,
      page: pageNum
    });
  } catch (error) {
    console.error('[ADMIN ORDERS] Erreur liste:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════════════
// STATISTIQUES
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/orders/stats
// Statistiques des commandes
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    // Récupérer toutes les commandes
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, statut, total, paiement_statut');

    if (error) throw error;

    // Calculer les statistiques
    const stats = {
      total: orders?.length || 0,
      en_attente: 0,
      confirme: 0,
      paye: 0,
      termine: 0,
      annule: 0,
      ca_total: 0
    };

    orders?.forEach(order => {
      // Compter par statut
      if (stats[order.statut] !== undefined) {
        stats[order.statut]++;
      }

      // CA total (commandes confirmées, payées ou terminées)
      if (['confirme', 'paye', 'termine'].includes(order.statut)) {
        stats.ca_total += order.total || 0;
      }
    });

    res.json(stats);
  } catch (error) {
    console.error('[ADMIN ORDERS] Erreur stats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════════════

// PATCH /api/admin/orders/:id/status
// Changer le statut d'une commande
router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { statut } = req.body;
    const orderId = parseInt(req.params.id);

    if (!statut || !STATUTS_VALIDES.includes(statut)) {
      return res.status(400).json({
        error: `Statut invalide. Valeurs acceptées : ${STATUTS_VALIDES.join(', ')}`
      });
    }

    // Récupérer la commande actuelle
    const { data: currentOrder, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !currentOrder) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    // Préparer les mises à jour
    const updates = {
      statut,
      updated_at: new Date().toISOString()
    };

    // Si confirmé ou terminé, mettre à jour aussi les réservations associées
    if (statut === 'confirme') {
      // Mettre les réservations en "confirme"
      await supabase
        .from('reservations')
        .update({ statut: 'confirme', updated_at: new Date().toISOString() })
        .eq('order_id', orderId);
    } else if (statut === 'termine') {
      // Mettre les réservations en "termine"
      await supabase
        .from('reservations')
        .update({ statut: 'termine', updated_at: new Date().toISOString() })
        .eq('order_id', orderId);

      // Si paiement sur place, marquer comme payé
      if (currentOrder.paiement_methode === 'sur_place') {
        updates.paiement_statut = 'paye';
        updates.paiement_date = new Date().toISOString();
      }
    } else if (statut === 'annule') {
      // Annuler aussi les réservations
      await supabase
        .from('reservations')
        .update({ statut: 'annule', updated_at: new Date().toISOString() })
        .eq('order_id', orderId);
    }

    // Mettre à jour la commande
    const { data: order, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    // Logger l'action
    try {
      await supabase.from('historique_admin').insert({
        admin_id: req.admin?.id || 1,
        action: 'update_statut',
        entite: 'order',
        entite_id: orderId,
        details: { ancien_statut: currentOrder.statut, nouveau_statut: statut }
      });
    } catch (logError) {
      console.error('[ADMIN ORDERS] Erreur log:', logError);
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error('[ADMIN ORDERS] Erreur changement statut:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/admin/orders/:id
// Détail d'une commande
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          service_nom,
          service_description,
          duree_minutes,
          prix,
          ordre,
          reservation_id
        )
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Commande introuvable' });
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error('[ADMIN ORDERS] Erreur détail:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/orders/export/csv
// Export CSV des commandes
router.get('/export/csv', authenticateAdmin, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;

    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (
          service_nom,
          prix
        )
      `)
      .order('created_at', { ascending: false });

    if (date_debut) {
      query = query.gte('created_at', date_debut);
    }
    if (date_fin) {
      query = query.lte('created_at', date_fin);
    }

    const { data: orders, error } = await query;

    if (error) throw error;

    // Générer le CSV
    const csvHeader = 'ID;Date Creation;Date RDV;Heure;Client;Telephone;Email;Services;Lieu;Statut;Paiement;Sous-Total (€);Frais Depl (€);Total (€)\n';

    const csvRows = (orders || []).map(o => {
      const services = o.order_items?.map(i => i.service_nom).join(', ') || '';
      const sousTotal = (o.sous_total / 100).toFixed(2);
      const fraisDepl = (o.frais_deplacement / 100).toFixed(2);
      const total = (o.total / 100).toFixed(2);
      const dateCreation = new Date(o.created_at).toLocaleDateString('fr-FR');
      const client = `${o.client_prenom || ''} ${o.client_nom}`.trim();

      return `${o.id};${dateCreation};${o.date_rdv};${o.heure_debut};${client};${o.client_telephone};${o.client_email || ''};${services};${o.lieu};${o.statut};${o.paiement_methode};${sousTotal};${fraisDepl};${total}`;
    }).join('\n');

    const csv = csvHeader + csvRows;

    // Définir les headers pour le téléchargement
    const filename = `commandes_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csv); // BOM UTF-8 pour Excel
  } catch (error) {
    console.error('[ADMIN ORDERS] Erreur export:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
