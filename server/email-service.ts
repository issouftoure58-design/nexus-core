import nodemailer from "nodemailer";

// Configuration du transporteur email
const createTransporter = () => {
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT || "587");
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) {
    console.warn("[EMAIL] Configuration email manquante. Les emails ne seront pas envoyés.");
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
};

// Couleurs de Fat's Hair-Afro
const COLORS = {
  primary: "#8B5CF6", // Violet
  secondary: "#EC4899", // Rose
  gold: "#F59E0B", // Or
  dark: "#1F2937",
  light: "#F9FAFB",
};

// Template de base pour les emails
const baseTemplate = (content: string, title: string) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: ${COLORS.light};">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%); padding: 30px; text-align: center;">
              <div style="font-size: 40px; margin-bottom: 10px;">💇‍♀️</div>
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">Fat's Hair-Afro</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Coiffure afro à domicile en Île-de-France</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${COLORS.dark}; padding: 30px; text-align: center;">
              <p style="color: rgba(255,255,255,0.8); margin: 0 0 10px 0; font-size: 14px;">
                <strong style="color: white;">Fat's Hair-Afro</strong>
              </p>
              <p style="color: rgba(255,255,255,0.6); margin: 0 0 5px 0; font-size: 13px;">
                🏠 Service à domicile - Île-de-France
              </p>
              <p style="color: rgba(255,255,255,0.6); margin: 0 0 15px 0; font-size: 13px;">
                📞 07 82 23 50 20
              </p>
              <div style="margin-top: 15px;">
                <a href="https://wa.me/33782235020" style="display: inline-block; padding: 8px 16px; background-color: #25D366; color: white; text-decoration: none; border-radius: 20px; font-size: 12px; margin: 0 5px;">
                  WhatsApp
                </a>
              </div>
              <p style="color: rgba(255,255,255,0.4); margin: 20px 0 0 0; font-size: 11px;">
                © ${new Date().getFullYear()} Fat's Hair-Afro. Tous droits réservés.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// Formatage de la date en français
const formatDateFr = (dateStr: string): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return date.toLocaleDateString("fr-FR", options);
};

// Template de confirmation de rendez-vous
const confirmationTemplate = (
  nom: string,
  service: string,
  date: string,
  heure: string,
  adresseClient?: string
) => {
  const formattedDate = formatDateFr(date);

  return baseTemplate(
    `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; background-color: #DCFCE7; border-radius: 50%; padding: 15px; margin-bottom: 15px;">
        <span style="font-size: 32px;">✅</span>
      </div>
      <h2 style="color: ${COLORS.dark}; margin: 0; font-size: 24px;">Rendez-vous confirmé !</h2>
    </div>

    <p style="color: ${COLORS.dark}; font-size: 16px; line-height: 1.6;">
      Bonjour <strong>${nom}</strong>,
    </p>

    <p style="color: ${COLORS.dark}; font-size: 16px; line-height: 1.6;">
      Nous avons bien enregistré votre rendez-vous. Voici les détails :
    </p>

    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 25px 0; background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%); border-radius: 12px; overflow: hidden;">
      <tr>
        <td style="padding: 20px;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(139, 92, 246, 0.2);">
                <span style="color: ${COLORS.primary}; font-weight: bold;">📅 Date</span>
                <p style="margin: 5px 0 0 0; color: ${COLORS.dark}; font-size: 16px;">${formattedDate}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(139, 92, 246, 0.2);">
                <span style="color: ${COLORS.primary}; font-weight: bold;">🕐 Heure</span>
                <p style="margin: 5px 0 0 0; color: ${COLORS.dark}; font-size: 16px;">${heure}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0;">
                <span style="color: ${COLORS.primary}; font-weight: bold;">💇‍♀️ Service</span>
                <p style="margin: 5px 0 0 0; color: ${COLORS.dark}; font-size: 16px;">${service}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="color: ${COLORS.dark}; font-size: 14px; line-height: 1.6;">
      <strong>📍 Chez vous :</strong> ${adresseClient || "Fatou viendra à votre adresse"}
    </p>

    <p style="color: #6B7280; font-size: 14px; line-height: 1.6; margin-top: 20px;">
      Si vous devez modifier ou annuler votre rendez-vous, merci de nous contacter au moins 24h à l'avance.
    </p>

    <div style="text-align: center; margin-top: 30px;">
      <a href="tel:+33782235020" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
        📞 Nous contacter
      </a>
    </div>

    <p style="color: ${COLORS.dark}; font-size: 16px; line-height: 1.6; margin-top: 30px;">
      À très bientôt !<br>
      <strong style="color: ${COLORS.primary};">L'équipe Fat's Hair-Afro</strong>
    </p>
    `,
    "Confirmation de rendez-vous - Fat's Hair-Afro"
  );
};

// Template de rappel de rendez-vous
const reminderTemplate = (
  nom: string,
  service: string,
  date: string,
  heure: string,
  adresseClient?: string
) => {
  const formattedDate = formatDateFr(date);

  return baseTemplate(
    `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; background-color: #FEF3C7; border-radius: 50%; padding: 15px; margin-bottom: 15px;">
        <span style="font-size: 32px;">⏰</span>
      </div>
      <h2 style="color: ${COLORS.dark}; margin: 0; font-size: 24px;">Rappel de rendez-vous</h2>
    </div>

    <p style="color: ${COLORS.dark}; font-size: 16px; line-height: 1.6;">
      Bonjour <strong>${nom}</strong>,
    </p>

    <p style="color: ${COLORS.dark}; font-size: 16px; line-height: 1.6;">
      Nous vous rappelons que vous avez un rendez-vous <strong>demain</strong> :
    </p>

    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 25px 0; background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%); border-radius: 12px; overflow: hidden; border-left: 4px solid ${COLORS.gold};">
      <tr>
        <td style="padding: 20px;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(245, 158, 11, 0.2);">
                <span style="color: ${COLORS.gold}; font-weight: bold;">📅 Date</span>
                <p style="margin: 5px 0 0 0; color: ${COLORS.dark}; font-size: 16px; font-weight: bold;">${formattedDate}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(245, 158, 11, 0.2);">
                <span style="color: ${COLORS.gold}; font-weight: bold;">🕐 Heure</span>
                <p style="margin: 5px 0 0 0; color: ${COLORS.dark}; font-size: 16px; font-weight: bold;">${heure}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0;">
                <span style="color: ${COLORS.gold}; font-weight: bold;">💇‍♀️ Service</span>
                <p style="margin: 5px 0 0 0; color: ${COLORS.dark}; font-size: 16px;">${service}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="color: ${COLORS.dark}; font-size: 14px; line-height: 1.6;">
      <strong>📍 Chez vous :</strong> ${adresseClient || "Fatou viendra à votre adresse"}
    </p>

    <div style="background-color: #FEF3C7; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <p style="color: ${COLORS.dark}; font-size: 14px; margin: 0;">
        💡 <strong>Conseil :</strong> Fatou arrivera à l'heure prévue. Préparez un espace confortable pour la prestation.
      </p>
    </div>

    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">
      Si vous devez annuler, merci de nous prévenir rapidement au 07 82 23 50 20.
    </p>

    <p style="color: ${COLORS.dark}; font-size: 16px; line-height: 1.6; margin-top: 30px;">
      À demain !<br>
      <strong style="color: ${COLORS.primary};">L'équipe Fat's Hair-Afro</strong>
    </p>
    `,
    "Rappel de rendez-vous - Fat's Hair-Afro"
  );
};

// Template d'annulation de rendez-vous
const cancellationTemplate = (
  nom: string,
  service: string,
  date: string,
  heure: string
) => {
  const formattedDate = formatDateFr(date);

  return baseTemplate(
    `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; background-color: #FEE2E2; border-radius: 50%; padding: 15px; margin-bottom: 15px;">
        <span style="font-size: 32px;">❌</span>
      </div>
      <h2 style="color: ${COLORS.dark}; margin: 0; font-size: 24px;">Rendez-vous annulé</h2>
    </div>

    <p style="color: ${COLORS.dark}; font-size: 16px; line-height: 1.6;">
      Bonjour <strong>${nom}</strong>,
    </p>

    <p style="color: ${COLORS.dark}; font-size: 16px; line-height: 1.6;">
      Nous confirmons l'annulation de votre rendez-vous :
    </p>

    <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 25px 0; background-color: #FEE2E2; border-radius: 12px; overflow: hidden; opacity: 0.9;">
      <tr>
        <td style="padding: 20px;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0;">
                <span style="color: #991B1B; text-decoration: line-through;">📅 ${formattedDate}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">
                <span style="color: #991B1B; text-decoration: line-through;">🕐 ${heure}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">
                <span style="color: #991B1B; text-decoration: line-through;">💇‍♀️ ${service}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="color: ${COLORS.dark}; font-size: 16px; line-height: 1.6;">
      Nous serions ravis de vous accueillir à une autre date. N'hésitez pas à reprendre rendez-vous !
    </p>

    <div style="text-align: center; margin-top: 30px;">
      <a href="https://wa.me/33782235020" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
        📅 Reprendre rendez-vous
      </a>
    </div>

    <p style="color: ${COLORS.dark}; font-size: 16px; line-height: 1.6; margin-top: 30px;">
      À bientôt !<br>
      <strong style="color: ${COLORS.primary};">L'équipe Fat's Hair-Afro</strong>
    </p>
    `,
    "Annulation de rendez-vous - Fat's Hair-Afro"
  );
};

// Fonctions d'envoi d'emails
export async function sendConfirmationEmail(
  email: string,
  nom: string,
  service: string,
  date: string,
  heure: string,
  adresseClient?: string
): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) {
    console.log("[EMAIL] Transporter non configuré, email non envoyé");
    return false;
  }

  try {
    const html = confirmationTemplate(nom, service, date, heure, adresseClient);
    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    await transporter.sendMail({
      from: `"Fat's Hair-Afro" <${fromAddress}>`,
      to: email,
      subject: `✅ Confirmation de votre RDV - ${service}`,
      html,
    });

    console.log(`[EMAIL] Confirmation envoyée à ${email} pour RDV du ${date} à ${heure}`);
    return true;
  } catch (error) {
    console.error("[EMAIL] Erreur envoi confirmation:", error);
    return false;
  }
}

export async function sendReminderEmail(
  email: string,
  nom: string,
  service: string,
  date: string,
  heure: string,
  adresseClient?: string
): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) {
    console.log("[EMAIL] Transporter non configuré, email non envoyé");
    return false;
  }

  try {
    const html = reminderTemplate(nom, service, date, heure, adresseClient);
    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    await transporter.sendMail({
      from: `"Fat's Hair-Afro" <${fromAddress}>`,
      to: email,
      subject: `⏰ Rappel : RDV demain à ${heure} - ${service}`,
      html,
    });

    console.log(`[EMAIL] Rappel envoyé à ${email} pour RDV du ${date} à ${heure}`);
    return true;
  } catch (error) {
    console.error("[EMAIL] Erreur envoi rappel:", error);
    return false;
  }
}

export async function sendCancellationEmail(
  email: string,
  nom: string,
  service: string,
  date: string,
  heure: string
): Promise<boolean> {
  const transporter = createTransporter();
  if (!transporter) {
    console.log("[EMAIL] Transporter non configuré, email non envoyé");
    return false;
  }

  try {
    const html = cancellationTemplate(nom, service, date, heure);
    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    await transporter.sendMail({
      from: `"Fat's Hair-Afro" <${fromAddress}>`,
      to: email,
      subject: `❌ Annulation de votre RDV - ${service}`,
      html,
    });

    console.log(`[EMAIL] Annulation envoyée à ${email} pour RDV du ${date} à ${heure}`);
    return true;
  } catch (error) {
    console.error("[EMAIL] Erreur envoi annulation:", error);
    return false;
  }
}

// Export pour tests
export const emailTemplates = {
  confirmation: confirmationTemplate,
  reminder: reminderTemplate,
  cancellation: cancellationTemplate,
};
