import express from 'express';
import { supabase } from '../config/supabase.js';
import { authenticateAdmin } from './adminAuth.js';
import { checkConflicts } from '../utils/conflictChecker.js';

const router = express.Router();

// Statuts possibles pour une réservation
// - demande: nouvelle réservation en attente de confirmation
// - en_attente_paiement: réservation créée via panier, en attente de paiement en ligne
// - confirme: réservation confirmée
// - annule: réservation annulée
// - termine: réservation terminée
// - no_show: client ne s'est pas présenté
const STATUTS_VALIDES = ['demande', 'en_attente', 'en_attente_paiement', 'confirme', 'annule', 'termine', 'no_show'];

// ════════════════════════════════════════════════════════════════════
// LISTE & FILTRES
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/reservations
// Liste toutes les réservations avec filtres et pagination
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      statut,
      date_debut,
      date_fin,
      client_id,
      service,
      page = 1,
      limit = 20,
      sort = 'date',
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Query de base avec jointures
    let query = supabase
      .from('reservations')
      .select(`
        *,
        clients (
          id,
          nom,
          prenom,
          telephone,
          email
        )
      `, { count: 'exact' });

    // Filtres
    if (statut) {
      query = query.eq('statut', statut);
    }
    if (date_debut) {
      query = query.gte('date', date_debut);
    }
    if (date_fin) {
      query = query.lte('date', date_fin);
    }
    if (client_id) {
      query = query.eq('client_id', client_id);
    }
    if (service) {
      query = query.ilike('service', `%${service}%`);
    }

    // Tri
    query = query.order(sort, { ascending: order === 'asc' });

    // Pagination
    query = query.range(offset, offset + limitNum - 1);

    const { data: reservations, error, count } = await query;

    if (error) throw error;

    // Formater les réservations
    const formattedReservations = (reservations || []).map(r => ({
      id: r.id,
      date_rdv: r.date,
      heure_rdv: r.heure,
      statut: r.statut,
      lieu: r.lieu || 'salon',
      prix_total: r.prix_total ? r.prix_total / 100 : 0,
      frais_deplacement: r.frais_deplacement ? r.frais_deplacement / 100 : 0,
      notes: r.notes,
      created_at: r.created_at,
      client: r.clients ? {
        id: r.clients.id,
        nom: r.clients.nom,
        prenom: r.clients.prenom,
        telephone: r.clients.telephone,
        email: r.clients.email
      } : null,
      service: {
        nom: r.service_nom || r.service,
        duree_minutes: r.duree_minutes
      },
      adresse_client: r.adresse_client,
      distance_km: r.distance_km,
      duree_trajet_minutes: r.duree_trajet_minutes
    }));

    res.json({
      reservations: formattedReservations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum)
      }
    });
  } catch (error) {
    console.error('[ADMIN RESERVATIONS] Erreur liste:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/admin/reservations/:id
// Détail complet d'une réservation
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { data: reservation, error } = await supabase
      .from('reservations')
      .select(`
        *,
        clients (
          id,
          nom,
          prenom,
          telephone,
          email
        )
      `)
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    if (!reservation) {
      return res.status(404).json({ error: 'Réservation introuvable' });
    }

    // Récupérer les informations du service depuis la table services
    const serviceName = reservation.service_nom || reservation.service;
    const { data: serviceInfo } = await supabase
      .from('services')
      .select('id, nom, prix, duree, description')
      .ilike('nom', serviceName || '')
      .single();

    // Formater la réponse
    const formattedReservation = {
      id: reservation.id,
      date_rdv: reservation.date,
      heure_rdv: reservation.heure,
      statut: reservation.statut,
      lieu: reservation.lieu || 'salon',
      prix_total: reservation.prix_total ? reservation.prix_total / 100 : 0,
      frais_deplacement: reservation.frais_deplacement ? reservation.frais_deplacement / 100 : 0,
      notes: reservation.notes,
      created_at: reservation.created_at,
      updated_at: reservation.updated_at,
      client: reservation.clients ? {
        id: reservation.clients.id,
        nom: reservation.clients.nom,
        prenom: reservation.clients.prenom,
        telephone: reservation.clients.telephone,
        email: reservation.clients.email
      } : null,
      service: {
        id: serviceInfo?.id || null,
        nom: reservation.service_nom || reservation.service,
        prix_base: serviceInfo?.prix ? serviceInfo.prix / 100 : 0,
        duree_minutes: reservation.duree_minutes || serviceInfo?.duree || 0,
        description: serviceInfo?.description || null
      },
      deplacement: reservation.lieu === 'domicile' ? {
        adresse_client: reservation.adresse_client,
        distance_km: reservation.distance_km,
        duree_trajet_minutes: reservation.duree_trajet_minutes,
        frais: reservation.frais_deplacement ? reservation.frais_deplacement / 100 : 0
      } : null,
      created_via: reservation.created_via || 'chatbot'
    };

    res.json({ reservation: formattedReservation });
  } catch (error) {
    console.error('[ADMIN RESERVATIONS] Erreur détail:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════════════

// POST /api/admin/reservations
// Créer une réservation manuellement
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      client_id,
      service,
      date_rdv,
      heure_rdv,
      lieu,
      adresse_client,
      distance_km,
      duree_trajet_minutes,
      frais_deplacement,
      notes
    } = req.body;

    // Validation
    if (!client_id || !service || !date_rdv || !heure_rdv) {
      return res.status(400).json({
        error: 'Champs requis : client_id, service, date_rdv, heure_rdv'
      });
    }

    // Vérifier que le client existe et récupérer ses infos
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, prenom, nom, telephone')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return res.status(404).json({ error: 'Client introuvable' });
    }

    // Créer via createReservationUnified (même logique que tous les canaux)
    const { createReservationUnified } = await import('../core/unified/nexusCore.js');

    const result = await createReservationUnified({
      service_name: service,
      date: date_rdv,
      heure: heure_rdv,
      client_nom: `${client.prenom || ''} ${client.nom || ''}`.trim() || 'Client',
      client_telephone: client.telephone || '',
      lieu: lieu || 'chez_fatou',
      adresse: lieu === 'domicile' ? adresse_client : null,
      notes: notes || '[Via admin]',
      statut: 'confirme'
    }, 'admin', { sendSMS: false, skipValidation: false });

    if (!result.success) {
      // Conflit horaire
      if (result.error && result.error.includes('Conflit')) {
        return res.status(409).json({
          error: result.error,
          suggestions: result.suggestions || []
        });
      }
      return res.status(400).json({ error: result.error || 'Erreur création' });
    }

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'create',
      entite: 'reservation',
      entite_id: result.reservationId,
      details: { client_id, service, date_rdv, heure_rdv, lieu }
    });

    // Récupérer la réservation complète pour la réponse
    const { data: reservation } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', result.reservationId)
      .single();

    res.json({ reservation });
  } catch (error) {
    console.error('[ADMIN RESERVATIONS] Erreur création:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/admin/reservations/:id
// Modifier une réservation
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const {
      date_rdv,
      heure_rdv,
      service,
      statut,
      lieu,
      adresse_client,
      distance_km,
      duree_trajet_minutes,
      frais_deplacement,
      notes
    } = req.body;

    // Récupérer la réservation actuelle avec téléphone client
    const { data: currentRdv, error: fetchError } = await supabase
      .from('reservations')
      .select('*, clients(telephone)')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !currentRdv) {
      return res.status(404).json({ error: 'Réservation introuvable' });
    }

    // Si RDV annulé/terminé, on autorise seulement le changement de statut
    if ((currentRdv.statut === 'annule' || currentRdv.statut === 'termine') && !statut) {
      return res.status(400).json({
        error: `Impossible de modifier une réservation ${currentRdv.statut}. Changez d'abord le statut.`
      });
    }

    const updates = {
      updated_at: new Date().toISOString()
    };

    // Si changement de date/heure, vérifier chevauchements (durée incluse)
    if (date_rdv || heure_rdv) {
      const newDate = date_rdv || currentRdv.date;
      const newHeure = heure_rdv || currentRdv.heure;
      const duree = currentRdv.duree_minutes || 60;

      const conflictResult = await checkConflicts(supabase, newDate, newHeure, duree, req.params.id);
      if (conflictResult.conflict) {
        const c = conflictResult.rdv;
        return res.status(409).json({
          error: `Conflit : ${c.client} (${c.service}) jusqu'à ${c.fin}`,
          suggestions: conflictResult.suggestions
        });
      }

      if (date_rdv) updates.date = date_rdv;
      if (heure_rdv) updates.heure = heure_rdv;
    }

    // Si changement de service, recalculer le prix
    if (service && service !== currentRdv.service_nom) {
      const { data: serviceInfo, error: serviceError } = await supabase
        .from('services')
        .select('nom, prix, duree')
        .ilike('nom', service)
        .single();

      if (serviceError || !serviceInfo) {
        return res.status(404).json({ error: `Service introuvable: ${service}` });
      }

      updates.service_nom = serviceInfo.nom;
      updates.duree_minutes = serviceInfo.duree;

      // Recalculer prix total
      const fraisDepl = updates.frais_deplacement !== undefined
        ? updates.frais_deplacement
        : currentRdv.frais_deplacement || 0;
      updates.prix_total = serviceInfo.prix + fraisDepl;

      console.log(`[ADMIN EDIT] Service: ${currentRdv.service_nom} → ${serviceInfo.nom} (${serviceInfo.prix/100}€, ${serviceInfo.duree}min)`);
    }

    // Si changement de lieu
    if (lieu !== undefined) {
      updates.lieu = lieu;

      if (lieu === 'domicile') {
        if (adresse_client !== undefined) updates.adresse_client = adresse_client;
        if (distance_km !== undefined) updates.distance_km = distance_km;
        if (duree_trajet_minutes !== undefined) updates.duree_trajet_minutes = duree_trajet_minutes;
        if (frais_deplacement !== undefined) {
          updates.frais_deplacement = Math.round(frais_deplacement * 100);
          // Recalculer prix total
          const { data: serviceInfo } = await supabase
            .from('services')
            .select('prix')
            .ilike('nom', updates.service_nom || currentRdv.service_nom)
            .single();

          if (serviceInfo) {
            updates.prix_total = serviceInfo.prix + updates.frais_deplacement;
          }
        }
      } else {
        // Si passage au salon, annuler les frais de déplacement
        updates.adresse_client = null;
        updates.distance_km = null;
        updates.duree_trajet_minutes = null;
        updates.frais_deplacement = 0;

        // Recalculer prix total
        const { data: serviceInfo } = await supabase
          .from('services')
          .select('prix')
          .ilike('nom', updates.service_nom || currentRdv.service_nom)
          .single();

        if (serviceInfo) {
          updates.prix_total = serviceInfo.prix;
        }
      }
    }

    // Statut
    if (statut && statut !== currentRdv.statut) {
      updates.statut = statut;
      console.log(`[ADMIN EDIT] Statut: ${currentRdv.statut} → ${statut}`);
    }

    // Notes
    if (notes !== undefined) updates.notes = notes;

    // Appliquer les modifications
    const { data: reservation, error } = await supabase
      .from('reservations')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // SMS notification si changement service, date ou heure
    if (updates.service_nom || updates.date || updates.heure) {
      try {
        const telephone = currentRdv.clients?.telephone;
        if (telephone) {
          const { sendConfirmationSMS } = await import('../services/bookingService.js');
          const finalDate = updates.date || currentRdv.date;
          const finalHeure = updates.heure || currentRdv.heure;
          const finalService = updates.service_nom || currentRdv.service_nom;
          const finalPrix = (updates.prix_total || currentRdv.prix_total || 0) / 100;

          await sendConfirmationSMS(telephone, {
            service: finalService,
            date: finalDate,
            heure: finalHeure,
            prixTotal: finalPrix,
            fraisDeplacement: (currentRdv.frais_deplacement || 0) / 100,
            adresse: currentRdv.adresse_client
          });
          console.log(`[ADMIN EDIT] SMS notif envoyé à ${telephone}`);
        }
      } catch (smsErr) {
        console.error('[ADMIN EDIT] SMS échoué (non bloquant):', smsErr.message);
      }
    }

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'update',
      entite: 'reservation',
      entite_id: reservation.id,
      details: { updates }
    });

    res.json({ reservation, changes: updates });
  } catch (error) {
    console.error('[ADMIN RESERVATIONS] Erreur modification:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/admin/reservations/:id/statut
// Changer le statut d'une réservation
router.patch('/:id/statut', authenticateAdmin, async (req, res) => {
  try {
    const { statut } = req.body;

    if (!statut || !STATUTS_VALIDES.includes(statut)) {
      return res.status(400).json({
        error: `Statut invalide. Valeurs acceptées : ${STATUTS_VALIDES.join(', ')}`
      });
    }

    // Récupérer la réservation actuelle
    const { data: currentRdv, error: fetchError } = await supabase
      .from('reservations')
      .select('*, clients(nom, prenom, telephone)')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !currentRdv) {
      return res.status(404).json({ error: 'Réservation introuvable' });
    }

    // Empêcher certaines transitions
    if (currentRdv.statut === 'termine' && statut === 'en_attente') {
      return res.status(400).json({
        error: 'Impossible de repasser une réservation terminée en attente'
      });
    }

    // Mettre à jour le statut
    const { data: reservation, error } = await supabase
      .from('reservations')
      .update({
        statut,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'update_statut',
      entite: 'reservation',
      entite_id: reservation.id,
      details: { ancien_statut: currentRdv.statut, nouveau_statut: statut }
    });

    // TODO: Si annulation, déclencher logique de remboursement si applicable

    res.json({ reservation });
  } catch (error) {
    console.error('[ADMIN RESERVATIONS] Erreur changement statut:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/admin/reservations/:id
// Supprimer une réservation (cas exceptionnel)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    // Vérifier que la réservation existe
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !reservation) {
      return res.status(404).json({ error: 'Réservation introuvable' });
    }

    // Supprimer
    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    // Logger l'action
    await supabase.from('historique_admin').insert({
      admin_id: req.admin.id,
      action: 'delete',
      entite: 'reservation',
      entite_id: req.params.id,
      details: {
        client_id: reservation.client_id,
        date: reservation.date,
        service: reservation.service
      }
    });

    res.json({ message: 'Réservation supprimée' });
  } catch (error) {
    console.error('[ADMIN RESERVATIONS] Erreur suppression:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════════════
// STATISTIQUES
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/reservations/stats
// Statistiques des réservations
router.get('/stats/periode', authenticateAdmin, async (req, res) => {
  try {
    const { periode = 'mois' } = req.query;

    // Calculer les dates selon la période
    const now = new Date();
    let dateDebut;

    switch (periode) {
      case 'semaine':
        dateDebut = new Date(now);
        dateDebut.setDate(now.getDate() - 7);
        break;
      case 'mois':
        dateDebut = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'annee':
        dateDebut = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        dateDebut = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const dateDebutStr = dateDebut.toISOString().split('T')[0];

    // Récupérer toutes les réservations de la période
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('statut, prix_total, service, date, lieu')
      .gte('date', dateDebutStr);

    if (error) throw error;

    // Calculer les statistiques
    const total = reservations?.length || 0;

    const parStatut = {
      en_attente: 0,
      confirme: 0,
      annule: 0,
      termine: 0,
      no_show: 0
    };

    let caTotal = 0;
    const servicesCount = {};
    let nbDomicile = 0;
    let nbSalon = 0;

    reservations?.forEach(r => {
      parStatut[r.statut] = (parStatut[r.statut] || 0) + 1;

      if (r.statut === 'termine') {
        caTotal += (r.prix_total || 0) / 100;
      }

      if (r.service) {
        servicesCount[r.service] = (servicesCount[r.service] || 0) + 1;
      }

      if (r.lieu === 'domicile') {
        nbDomicile++;
      } else {
        nbSalon++;
      }
    });

    // Services les plus demandés
    const servicesPopulaires = Object.entries(servicesCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([service, count]) => ({ service, count }));

    // Taux d'annulation
    const tauxAnnulation = total > 0
      ? Math.round(((parStatut.annule + parStatut.no_show) / total) * 100)
      : 0;

    res.json({
      periode,
      date_debut: dateDebutStr,
      date_fin: now.toISOString().split('T')[0],
      total_reservations: total,
      ca_total: caTotal,
      par_statut: parStatut,
      taux_annulation: tauxAnnulation,
      services_populaires: servicesPopulaires,
      repartition_lieu: {
        salon: nbSalon,
        domicile: nbDomicile
      }
    });
  } catch (error) {
    console.error('[ADMIN RESERVATIONS] Erreur stats:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════════════
// EXPORT
// ════════════════════════════════════════════════════════════════════

// GET /api/admin/reservations/export
// Export CSV des réservations
router.get('/export/csv', authenticateAdmin, async (req, res) => {
  try {
    const { date_debut, date_fin } = req.query;

    let query = supabase
      .from('reservations')
      .select(`
        *,
        clients (
          nom,
          prenom,
          telephone,
          email
        )
      `)
      .order('date', { ascending: true });

    if (date_debut) {
      query = query.gte('date', date_debut);
    }
    if (date_fin) {
      query = query.lte('date', date_fin);
    }

    const { data: reservations, error } = await query;

    if (error) throw error;

    // Générer le CSV
    const csvHeader = 'ID;Date;Heure;Client;Telephone;Service;Lieu;Statut;Prix Total (€);Frais Deplacement (€);Notes\n';

    const csvRows = (reservations || []).map(r => {
      const client = r.clients ? `${r.clients.prenom} ${r.clients.nom}` : 'N/A';
      const telephone = r.clients?.telephone || 'N/A';
      const prixTotal = r.prix_total ? (r.prix_total / 100).toFixed(2) : '0.00';
      const fraisDepl = r.frais_deplacement ? (r.frais_deplacement / 100).toFixed(2) : '0.00';
      const notes = (r.notes || '').replace(/;/g, ',').replace(/\n/g, ' ');

      return `${r.id};${r.date};${r.heure};${client};${telephone};${r.service};${r.lieu || 'salon'};${r.statut};${prixTotal};${fraisDepl};${notes}`;
    }).join('\n');

    const csv = csvHeader + csvRows;

    // Définir les headers pour le téléchargement
    const filename = `reservations_${date_debut || 'debut'}_${date_fin || 'fin'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\ufeff' + csv); // BOM UTF-8 pour Excel
  } catch (error) {
    console.error('[ADMIN RESERVATIONS] Erreur export:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
