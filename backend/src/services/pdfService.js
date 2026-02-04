/**
 * Service de génération PDF
 * Fat's Hair-Afro - Franconville
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Répertoire de stockage des PDFs générés
const PDF_DIR = path.join(process.cwd(), 'client/public/generated/pdf');

// Créer le répertoire s'il n'existe pas
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
  console.log('[PDF] 📁 Répertoire créé:', PDF_DIR);
}

/**
 * Génère une facture PDF
 * @param {Object} data - Données de la facture
 * @returns {Promise<{success: boolean, path?: string, url?: string, error?: string}>}
 */
export async function generateFacture(data) {
  const {
    numero,
    date,
    client,
    services,
    total,
    acompte = 0,
    notes
  } = data;

  const filename = `facture_${numero || Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // En-tête
      doc.fontSize(24).fillColor('#8B5CF6').text("Fat's Hair-Afro", { align: 'center' });
      doc.fontSize(10).fillColor('#666').text('Coiffure Afro à Domicile', { align: 'center' });
      doc.text('Franconville & Île-de-France', { align: 'center' });
      doc.text('Tél: 07 82 23 50 20', { align: 'center' });
      doc.moveDown(2);

      // Titre
      doc.fontSize(18).fillColor('#000').text('FACTURE', { align: 'center' });
      doc.moveDown();

      // Infos facture
      doc.fontSize(10).fillColor('#333');
      doc.text(`Facture N°: ${numero || 'FAC-' + Date.now()}`);
      doc.text(`Date: ${date || new Date().toLocaleDateString('fr-FR')}`);
      doc.moveDown();

      // Client
      if (client) {
        doc.fontSize(12).fillColor('#000').text('Client:');
        doc.fontSize(10).fillColor('#333');
        doc.text(`${client.nom || 'Non spécifié'}`);
        if (client.adresse) doc.text(client.adresse);
        if (client.telephone) doc.text(`Tél: ${client.telephone}`);
        if (client.email) doc.text(`Email: ${client.email}`);
      }
      doc.moveDown(2);

      // Tableau des services
      doc.fontSize(12).fillColor('#000').text('Prestations:', { underline: true });
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const tableLeft = 50;

      // En-têtes du tableau
      doc.fontSize(10).fillColor('#666');
      doc.text('Description', tableLeft, tableTop);
      doc.text('Prix', 450, tableTop, { width: 100, align: 'right' });

      doc.moveTo(tableLeft, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ccc');

      // Lignes du tableau
      let yPosition = tableTop + 25;
      doc.fillColor('#333');

      if (Array.isArray(services)) {
        services.forEach(service => {
          doc.text(service.nom || service.description || 'Prestation', tableLeft, yPosition);
          doc.text(`${service.prix || 0}€`, 450, yPosition, { width: 100, align: 'right' });
          yPosition += 20;
        });
      } else {
        doc.text('Prestation coiffure', tableLeft, yPosition);
        doc.text(`${total || 0}€`, 450, yPosition, { width: 100, align: 'right' });
        yPosition += 20;
      }

      // Ligne de séparation
      doc.moveTo(tableLeft, yPosition).lineTo(550, yPosition).stroke('#ccc');
      yPosition += 10;

      // Total
      doc.fontSize(12).fillColor('#000');
      doc.text('Total:', 350, yPosition);
      doc.text(`${total || 0}€`, 450, yPosition, { width: 100, align: 'right' });
      yPosition += 20;

      if (acompte > 0) {
        doc.fontSize(10).fillColor('#666');
        doc.text('Acompte versé:', 350, yPosition);
        doc.text(`-${acompte}€`, 450, yPosition, { width: 100, align: 'right' });
        yPosition += 15;

        doc.fontSize(12).fillColor('#8B5CF6');
        doc.text('Reste à payer:', 350, yPosition);
        doc.text(`${(total || 0) - acompte}€`, 450, yPosition, { width: 100, align: 'right' });
      }

      // Notes
      if (notes) {
        doc.moveDown(3);
        doc.fontSize(10).fillColor('#666').text('Notes:', { underline: true });
        doc.text(notes);
      }

      // Pied de page
      doc.moveDown(3);
      doc.fontSize(8).fillColor('#999');
      doc.text('Fat\'s Hair-Afro - SIRET: [À compléter]', { align: 'center' });
      doc.text('Document généré automatiquement', { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        console.log(`[PDF] ✅ Facture générée: ${filename}`);
        resolve({
          success: true,
          path: filepath,
          url: `/generated/pdf/${filename}`,
          filename
        });
      });

      stream.on('error', (err) => {
        console.error('[PDF] ❌ Erreur stream:', err);
        reject({ success: false, error: err.message });
      });

    } catch (error) {
      console.error('[PDF] ❌ Erreur génération:', error);
      reject({ success: false, error: error.message });
    }
  });
}

/**
 * Génère un devis PDF
 * @param {Object} data - Données du devis
 * @returns {Promise<{success: boolean, path?: string, url?: string, error?: string}>}
 */
export async function generateDevis(data) {
  const {
    numero,
    date,
    validite = '30 jours',
    client,
    services,
    total,
    notes
  } = data;

  const filename = `devis_${numero || Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // En-tête
      doc.fontSize(24).fillColor('#8B5CF6').text("Fat's Hair-Afro", { align: 'center' });
      doc.fontSize(10).fillColor('#666').text('Coiffure Afro à Domicile', { align: 'center' });
      doc.text('Franconville & Île-de-France', { align: 'center' });
      doc.text('Tél: 07 82 23 50 20', { align: 'center' });
      doc.moveDown(2);

      // Titre
      doc.fontSize(18).fillColor('#000').text('DEVIS', { align: 'center' });
      doc.moveDown();

      // Infos devis
      doc.fontSize(10).fillColor('#333');
      doc.text(`Devis N°: ${numero || 'DEV-' + Date.now()}`);
      doc.text(`Date: ${date || new Date().toLocaleDateString('fr-FR')}`);
      doc.text(`Validité: ${validite}`);
      doc.moveDown();

      // Client
      if (client) {
        doc.fontSize(12).fillColor('#000').text('Client:');
        doc.fontSize(10).fillColor('#333');
        doc.text(`${client.nom || 'Non spécifié'}`);
        if (client.telephone) doc.text(`Tél: ${client.telephone}`);
        if (client.email) doc.text(`Email: ${client.email}`);
      }
      doc.moveDown(2);

      // Tableau des services
      doc.fontSize(12).fillColor('#000').text('Prestations proposées:', { underline: true });
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const tableLeft = 50;

      // En-têtes
      doc.fontSize(10).fillColor('#666');
      doc.text('Description', tableLeft, tableTop);
      doc.text('Prix', 450, tableTop, { width: 100, align: 'right' });

      doc.moveTo(tableLeft, tableTop + 15).lineTo(550, tableTop + 15).stroke('#ccc');

      let yPosition = tableTop + 25;
      doc.fillColor('#333');

      if (Array.isArray(services)) {
        services.forEach(service => {
          doc.text(service.nom || service.description || 'Prestation', tableLeft, yPosition);
          doc.text(`${service.prix || 0}€`, 450, yPosition, { width: 100, align: 'right' });
          yPosition += 20;
        });
      }

      doc.moveTo(tableLeft, yPosition).lineTo(550, yPosition).stroke('#ccc');
      yPosition += 10;

      // Total
      doc.fontSize(12).fillColor('#8B5CF6');
      doc.text('Total estimé:', 350, yPosition);
      doc.text(`${total || 0}€`, 450, yPosition, { width: 100, align: 'right' });

      // Notes
      if (notes) {
        doc.moveDown(3);
        doc.fontSize(10).fillColor('#666').text('Notes:', { underline: true });
        doc.text(notes);
      }

      // Conditions
      doc.moveDown(3);
      doc.fontSize(9).fillColor('#666');
      doc.text('Ce devis est valable ' + validite + ' à compter de sa date d\'émission.');
      doc.text('Un acompte de 10€ sera demandé à la réservation.');

      // Pied de page
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999');
      doc.text('Fat\'s Hair-Afro - SIRET: [À compléter]', { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        console.log(`[PDF] ✅ Devis généré: ${filename}`);
        resolve({
          success: true,
          path: filepath,
          url: `/generated/pdf/${filename}`,
          filename
        });
      });

      stream.on('error', (err) => {
        reject({ success: false, error: err.message });
      });

    } catch (error) {
      reject({ success: false, error: error.message });
    }
  });
}

/**
 * Génère un rapport PDF
 * @param {Object} data - Données du rapport
 * @returns {Promise<{success: boolean, path?: string, url?: string, error?: string}>}
 */
export async function generateRapport(data) {
  const {
    titre,
    periode,
    sections,
    stats
  } = data;

  const filename = `rapport_${periode || Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);

      doc.pipe(stream);

      // En-tête
      doc.fontSize(24).fillColor('#8B5CF6').text("Fat's Hair-Afro", { align: 'center' });
      doc.fontSize(10).fillColor('#666').text('Rapport d\'activité', { align: 'center' });
      doc.moveDown(2);

      // Titre
      doc.fontSize(18).fillColor('#000').text(titre || 'Rapport', { align: 'center' });
      doc.fontSize(12).fillColor('#666').text(`Période: ${periode || 'Non spécifiée'}`, { align: 'center' });
      doc.moveDown(2);

      // Stats principales
      if (stats) {
        doc.fontSize(14).fillColor('#000').text('Chiffres clés', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#333');

        if (stats.ca) doc.text(`• Chiffre d'affaires: ${stats.ca}`);
        if (stats.nbRdv) doc.text(`• Nombre de RDV: ${stats.nbRdv}`);
        if (stats.nbClients) doc.text(`• Clients: ${stats.nbClients}`);
        doc.moveDown();
      }

      // Sections
      if (Array.isArray(sections)) {
        sections.forEach(section => {
          doc.fontSize(12).fillColor('#8B5CF6').text(section.titre || 'Section', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(10).fillColor('#333').text(section.contenu || '');
          doc.moveDown();
        });
      }

      // Pied de page
      doc.moveDown(2);
      doc.fontSize(8).fillColor('#999');
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        console.log(`[PDF] ✅ Rapport généré: ${filename}`);
        resolve({
          success: true,
          path: filepath,
          url: `/generated/pdf/${filename}`,
          filename
        });
      });

      stream.on('error', (err) => {
        reject({ success: false, error: err.message });
      });

    } catch (error) {
      reject({ success: false, error: error.message });
    }
  });
}

/**
 * Liste les PDFs générés
 * @returns {Array} Liste des fichiers PDF
 */
export function listGeneratedPdfs() {
  try {
    if (!fs.existsSync(PDF_DIR)) {
      return [];
    }

    const files = fs.readdirSync(PDF_DIR)
      .filter(f => f.endsWith('.pdf'))
      .map(f => {
        const stats = fs.statSync(path.join(PDF_DIR, f));
        return {
          name: f,
          url: `/generated/pdf/${f}`,
          size: stats.size,
          createdAt: stats.birthtime
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return files;
  } catch (error) {
    console.error('[PDF] Erreur listing:', error);
    return [];
  }
}

export default {
  generateFacture,
  generateDevis,
  generateRapport,
  listGeneratedPdfs
};
