import cron from "node-cron";
import { supabase } from "./supabase";
import { sendReminderEmail } from "./email-service";
import { sendReminderSMS } from "./sms-service";

// Formater la date en YYYY-MM-DD
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Récupérer les RDV du lendemain avec infos client
async function getTomorrowAppointments() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);

  console.log(`[RAPPEL] Recherche des RDV pour le ${tomorrowStr}...`);

  const { data: rdvs, error } = await supabase
    .from("reservations")
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
    .eq("date", tomorrowStr)
    .in("statut", ["confirme", "demande"]);

  if (error) {
    console.error("[RAPPEL] Erreur récupération RDV:", error.message);
    return [];
  }

  console.log(`[RAPPEL] ${rdvs?.length || 0} RDV trouvés pour demain`);
  return rdvs || [];
}

// Envoyer les rappels pour un RDV
async function sendReminders(rdv: any) {
  const client = rdv.clients;
  if (!client) {
    console.log(`[RAPPEL] Pas de client associé au RDV ${rdv.id}`);
    return { email: false, sms: false };
  }

  const nom = `${client.prenom || ""} ${client.nom}`.trim();
  const results = { email: false, sms: false };

  // Envoyer email si disponible
  if (client.email) {
    try {
      results.email = await sendReminderEmail(
        client.email,
        nom,
        rdv.service_nom,
        rdv.date,
        rdv.heure,
        rdv.adresse_client
      );
      console.log(`[RAPPEL] Email envoyé à ${client.email} pour RDV ${rdv.id}`);
    } catch (error) {
      console.error(`[RAPPEL] Erreur email pour RDV ${rdv.id}:`, error);
    }
  }

  // Envoyer SMS si disponible
  if (client.telephone) {
    try {
      results.sms = await sendReminderSMS(
        client.telephone,
        client.nom,
        client.prenom || "",
        rdv.service_nom,
        rdv.date,
        rdv.heure,
        rdv.adresse_client
      );
      console.log(`[RAPPEL] SMS envoyé à ${client.telephone} pour RDV ${rdv.id}`);
    } catch (error) {
      console.error(`[RAPPEL] Erreur SMS pour RDV ${rdv.id}:`, error);
    }
  }

  return results;
}

// Job de rappel : tous les jours à 18h
export function startReminderJob() {
  console.log("[RAPPEL] Démarrage du job de rappels automatiques...");

  // Cron : "0 18 * * *" = tous les jours à 18h00
  const job = cron.schedule("0 18 * * *", async () => {
    console.log("[RAPPEL] === Exécution du job de rappels ===");
    console.log(`[RAPPEL] Heure: ${new Date().toLocaleString("fr-FR")}`);

    try {
      const rdvs = await getTomorrowAppointments();

      if (rdvs.length === 0) {
        console.log("[RAPPEL] Aucun RDV à rappeler pour demain");
        return;
      }

      let emailsSent = 0;
      let smsSent = 0;

      for (const rdv of rdvs) {
        const results = await sendReminders(rdv);
        if (results.email) emailsSent++;
        if (results.sms) smsSent++;
      }

      console.log("[RAPPEL] === Résumé ===");
      console.log(`[RAPPEL] RDV traités: ${rdvs.length}`);
      console.log(`[RAPPEL] Emails envoyés: ${emailsSent}`);
      console.log(`[RAPPEL] SMS envoyés: ${smsSent}`);
    } catch (error) {
      console.error("[RAPPEL] Erreur lors de l'exécution du job:", error);
    }
  });

  console.log("[RAPPEL] Job planifié pour 18h00 tous les jours");
  return job;
}

// Fonction pour tester manuellement les rappels (en dev)
export async function testReminderJob() {
  console.log("[RAPPEL-TEST] === Test manuel des rappels ===");

  try {
    const rdvs = await getTomorrowAppointments();

    if (rdvs.length === 0) {
      console.log("[RAPPEL-TEST] Aucun RDV pour demain");
      return { success: true, message: "Aucun RDV pour demain", rdvs: 0 };
    }

    let emailsSent = 0;
    let smsSent = 0;
    const details: any[] = [];

    for (const rdv of rdvs) {
      const results = await sendReminders(rdv);
      if (results.email) emailsSent++;
      if (results.sms) smsSent++;

      details.push({
        rdvId: rdv.id,
        client: rdv.clients?.prenom + " " + rdv.clients?.nom,
        service: rdv.service_nom,
        heure: rdv.heure,
        emailSent: results.email,
        smsSent: results.sms,
      });
    }

    console.log("[RAPPEL-TEST] === Résumé ===");
    console.log(`[RAPPEL-TEST] RDV traités: ${rdvs.length}`);
    console.log(`[RAPPEL-TEST] Emails envoyés: ${emailsSent}`);
    console.log(`[RAPPEL-TEST] SMS envoyés: ${smsSent}`);

    return {
      success: true,
      rdvs: rdvs.length,
      emailsSent,
      smsSent,
      details,
    };
  } catch (error: any) {
    console.error("[RAPPEL-TEST] Erreur:", error);
    return { success: false, error: error.message };
  }
}

// Job de nettoyage des anciennes sessions (optionnel)
export function startCleanupJob() {
  // Tous les jours à 3h du matin
  cron.schedule("0 3 * * *", async () => {
    console.log("[CLEANUP] Nettoyage des anciennes données...");
    // Ajouter ici le nettoyage si nécessaire
  });
}
