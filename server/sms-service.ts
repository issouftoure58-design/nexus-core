import twilio from "twilio";
import { rawSupabase } from "./supabase";
import { getTenantId } from "./tenant-context";

// Configuration Twilio
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Vérifier si Twilio est configuré
function isTwilioConfigured(): boolean {
  return !!(accountSid && authToken && twilioPhoneNumber);
}

// Créer le client Twilio (lazy loading)
let twilioClient: twilio.Twilio | null = null;

function getClient(): twilio.Twilio | null {
  if (!isTwilioConfigured()) {
    console.warn("[SMS] Twilio non configuré - SMS désactivés");
    return null;
  }
  if (!twilioClient) {
    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

// Normaliser le numéro de téléphone au format E.164 pour Twilio
function normalizePhoneNumber(telephone: string): string {
  // Enlève tous les espaces, tirets, points
  let clean = telephone.replace(/[\s\-\.]/g, '');

  // Si commence par 0, remplace par +33
  if (clean.startsWith('0')) {
    clean = '+33' + clean.substring(1);
  }

  // Si ne commence pas par +, ajoute +33
  if (!clean.startsWith('+')) {
    clean = '+33' + clean;
  }

  return clean;
}

// Formater la date pour l'affichage (ex: "15 janvier")
function formatDateDisplay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

// Envoyer un SMS générique
async function sendSMS(to: string, message: string): Promise<boolean> {
  // Debug: afficher la config Twilio
  console.log("[SMS] === DÉBUT ENVOI SMS ===");
  console.log("[SMS] Twilio configuré:", isTwilioConfigured());
  console.log("[SMS] From number:", twilioPhoneNumber);

  const client = getClient();
  if (!client) {
    console.log("[SMS] Mode simulation (pas de client Twilio)");
    console.log("[SMS] Message:", message);
    return false;
  }

  // Debug: afficher le numéro original et normalisé
  console.log("[SMS] Numéro original:", to);
  const normalizedPhone = normalizePhoneNumber(to);
  console.log("[SMS] Numéro normalisé:", normalizedPhone);

  // Vérification du format E.164
  if (!/^\+33[0-9]{9}$/.test(normalizedPhone)) {
    console.error("[SMS] ERREUR: Format invalide! Attendu: +33XXXXXXXXX, Reçu:", normalizedPhone);
  }

  try {
    console.log("[SMS] Appel Twilio messages.create()...");
    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: normalizedPhone,
    });
    console.log("[SMS] SUCCESS! SID:", result.sid);
    console.log("[SMS] Status:", result.status);
    return true;
  } catch (error: any) {
    console.error("[SMS] === ERREUR TWILIO ===");
    console.error("[SMS] Message:", error.message);
    console.error("[SMS] Code:", error.code);
    console.error("[SMS] Status:", error.status);
    console.error("[SMS] More info:", error.moreInfo);
    console.error("[SMS] Détails complets:", JSON.stringify(error, null, 2));
    return false;
  }
}

/**
 * Get the reception agent's signature for SMS
 */
async function getAgentSignature(): Promise<string> {
  try {
    const tenantId = getTenantId();
    const { data } = await rawSupabase
      .from('ai_agents')
      .select('signature_phrase, custom_name')
      .eq('tenant_id', tenantId)
      .eq('agent_type', 'reception')
      .eq('active', true)
      .single();
    return data?.signature_phrase || '';
  } catch { return ''; }
}

/**
 * Envoie un SMS de confirmation de rendez-vous
 * NOTE: Fatou se déplace à domicile, donc on affiche l'adresse du CLIENT
 */
export async function sendConfirmationSMS(
  telephone: string,
  nom: string,
  prenom: string,
  service: string,
  date: string,
  heure: string,
  adresseClient?: string
): Promise<boolean> {
  const dateFormatted = formatDateDisplay(date);

  // Message adapté au service à domicile
  let message: string;
  if (adresseClient) {
    message = `✅ RDV confirmé ! ${service} le ${dateFormatted} à ${heure}. 📍 Chez vous : ${adresseClient}. À bientôt !`;
  } else {
    message = `✅ RDV confirmé ! ${service} le ${dateFormatted} à ${heure}. Fatou viendra chez vous. À bientôt !`;
  }

  // Append agent signature if configured
  const sig = await getAgentSignature();
  if (sig) message += `\n${sig}`;

  // Vérifier la longueur (max 160 caractères pour un SMS standard)
  if (message.length > 160) {
    console.warn(`[SMS] Message trop long (${message.length} chars), sera divisé`);
  }

  return sendSMS(telephone, message);
}

/**
 * Envoie un SMS de rappel de rendez-vous (la veille)
 * NOTE: Fatou se déplace à domicile
 */
export async function sendReminderSMS(
  telephone: string,
  nom: string,
  prenom: string,
  service: string,
  date: string,
  heure: string,
  adresseClient?: string
): Promise<boolean> {
  let message: string;
  if (adresseClient) {
    message = `📅 Rappel : RDV demain ${heure} pour ${service}. Fatou viendra chez vous. À bientôt !`;
  } else {
    message = `📅 Rappel : RDV demain ${heure} pour ${service}. Fatou viendra chez vous. À bientôt !`;
  }

  return sendSMS(telephone, message);
}

/**
 * Envoie un SMS d'annulation de rendez-vous
 */
export async function sendCancellationSMS(
  telephone: string,
  nom: string,
  prenom: string,
  service: string,
  date: string,
  heure: string
): Promise<boolean> {
  const dateFormatted = formatDateDisplay(date);
  const message = `❌ Votre RDV ${service} du ${dateFormatted} à ${heure} est annulé. Appelez Fatou au 07 82 23 50 20.`;

  return sendSMS(telephone, message);
}
