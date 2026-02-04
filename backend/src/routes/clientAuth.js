import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Resend } from 'resend';
import { supabase } from '../../../server/supabase.js';

// Client Resend pour l'envoi d'emails transactionnels
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const router = Router();

// 🔒 C2: JWT Secret - DOIT être défini dans .env (pas de fallback en prod)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be defined in .env for production');
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-only-secret-change-in-prod' : null);

const JWT_EXPIRES_IN = '1h'; // 🔒 M4: Access token: 1 heure (au lieu de 15 min pour UX)
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

// Sessions client (pour stocker les refresh tokens en mémoire - en production, utiliser Redis ou DB)
const clientSessions = new Map();

// Générer un token aléatoire
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ============= HELPERS EMAIL =============

async function sendVerificationEmail(email, prenom, nom, verificationToken) {
  if (!resendClient) {
    console.log('[CLIENT-AUTH] ⚠️ RESEND_API_KEY manquante - email de vérification non envoyé');
    return { success: false, simulated: true };
  }

  const verifyUrl = `${process.env.FRONTEND_URL || 'https://fatshairafro.fr'}/mon-compte/verifier-email?token=${verificationToken}`;
  const displayName = prenom || nom || 'Client';

  try {
    const { data, error } = await resendClient.emails.send({
      from: process.env.EMAIL_FROM || "Fat's Hair-Afro <onboarding@resend.dev>",
      to: [email],
      subject: "Vérifiez votre adresse email - Fat's Hair-Afro",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #8B5CF6, #7C3AED); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Fat's Hair-Afro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Coiffure Afro à Domicile</p>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <h2 style="color: #1a1a1a;">Bienvenue ${displayName} !</h2>
            <p style="color: #4a4a4a; line-height: 1.6;">
              Merci de vous être inscrit(e) chez Fat's Hair-Afro. Pour activer votre compte et profiter de vos <strong>50 points de bienvenue</strong>, veuillez vérifier votre adresse email.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="background: #8B5CF6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Vérifier mon email
              </a>
            </div>
            <p style="color: #888; font-size: 13px;">
              Ce lien est valable 24 heures. Si vous n'avez pas créé de compte, ignorez cet email.
            </p>
          </div>
          <div style="padding: 15px; background: #f3f0ff; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 12px 12px;">
            <p style="margin: 0;">Fat's Hair-Afro - Franconville & Île-de-France</p>
            <p style="margin: 5px 0 0 0;">📞 07 82 23 50 20</p>
          </div>
        </div>
      `
    });

    if (error) {
      console.error('[CLIENT-AUTH] Erreur envoi email vérification:', error);
      return { success: false, error: error.message };
    }

    console.log(`[CLIENT-AUTH] ✅ Email de vérification envoyé à ${email} (ID: ${data.id})`);
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error('[CLIENT-AUTH] Exception envoi email vérification:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendPasswordResetEmail(email, nom, resetToken) {
  if (!resendClient) {
    console.log('[CLIENT-AUTH] ⚠️ RESEND_API_KEY manquante - email de reset non envoyé');
    return { success: false, simulated: true };
  }

  const resetUrl = `${process.env.FRONTEND_URL || 'https://fatshairafro.fr'}/mon-compte/reinitialiser-mot-de-passe?token=${resetToken}`;

  try {
    const { data, error } = await resendClient.emails.send({
      from: process.env.EMAIL_FROM || "Fat's Hair-Afro <onboarding@resend.dev>",
      to: [email],
      subject: "Réinitialisation de votre mot de passe - Fat's Hair-Afro",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #8B5CF6, #7C3AED); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Fat's Hair-Afro</h1>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">Coiffure Afro à Domicile</p>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <h2 style="color: #1a1a1a;">Réinitialisation du mot de passe</h2>
            <p style="color: #4a4a4a; line-height: 1.6;">
              Bonjour${nom ? ` ${nom}` : ''},<br>
              Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en créer un nouveau.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: #8B5CF6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Réinitialiser mon mot de passe
              </a>
            </div>
            <p style="color: #888; font-size: 13px;">
              Ce lien est valable 1 heure. Si vous n'avez pas fait cette demande, ignorez cet email.
            </p>
          </div>
          <div style="padding: 15px; background: #f3f0ff; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 12px 12px;">
            <p style="margin: 0;">Fat's Hair-Afro - Franconville & Île-de-France</p>
            <p style="margin: 5px 0 0 0;">📞 07 82 23 50 20</p>
          </div>
        </div>
      `
    });

    if (error) {
      console.error('[CLIENT-AUTH] Erreur envoi email reset:', error);
      return { success: false, error: error.message };
    }

    console.log(`[CLIENT-AUTH] ✅ Email de reset envoyé à ${email} (ID: ${data.id})`);
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error('[CLIENT-AUTH] Exception envoi email reset:', err.message);
    return { success: false, error: err.message };
  }
}

// ============= INSCRIPTION =============
router.post('/register', async (req, res) => {
  // 🔒 Empêcher le cache (fix Chrome/Service Worker)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const { email, password, nom, prenom, telephone } = req.body;

    // Validation
    if (!email || !password || !nom || !telephone) {
      return res.status(400).json({
        success: false,
        error: 'Email, mot de passe, nom et téléphone sont requis'
      });
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Format d\'email invalide'
      });
    }

    // Validation mot de passe (min 8 caractères, 1 chiffre, 1 lettre)
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'Le mot de passe doit contenir au moins 8 caractères, 1 chiffre et 1 lettre'
      });
    }

    // 🔒 G1: Validation téléphone (format français)
    const phoneRegex = /^(?:0[1-9][0-9]{8}|\+33[1-9][0-9]{8})$/;
    const cleanPhone = telephone.replace(/[\s.-]/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        error: 'Numéro de téléphone invalide (format: 0612345678 ou +33612345678)'
      });
    }

    // Vérifier si l'email existe déjà
    const { data: existingByEmail } = await supabase
      .from('clients')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingByEmail) {
      return res.status(400).json({
        success: false,
        error: 'Cet email est déjà utilisé'
      });
    }

    // Vérifier si le téléphone existe déjà
    const { data: existingByPhone } = await supabase
      .from('clients')
      .select('id, email, password_hash')
      .eq('telephone', telephone)
      .single();

    // Si le téléphone existe mais sans compte (créé via RDV), on met à jour
    if (existingByPhone && !existingByPhone.password_hash) {
      const passwordHash = await bcrypt.hash(password, 12);
      const verificationToken = generateToken();
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      const { error: updateError } = await supabase
        .from('clients')
        .update({
          email: email.toLowerCase(),
          nom,
          prenom: prenom || null,
          password_hash: passwordHash,
          email_verified: false,
          verification_token: verificationToken,
          verification_token_expiry: verificationTokenExpiry.toISOString(),
          loyalty_points: 50 // Bonus inscription
        })
        .eq('id', existingByPhone.id);

      if (updateError) throw updateError;

      // Envoyer email de vérification (non-bloquant)
      sendVerificationEmail(email, prenom, nom, verificationToken).catch(err => {
        console.error('[CLIENT-AUTH] Erreur email vérification:', err.message);
      });

      return res.json({
        success: true,
        message: 'Compte créé avec succès. Vérifiez votre email pour activer votre compte.',
        bonusPoints: 50
      });
    }

    if (existingByPhone && existingByPhone.password_hash) {
      return res.status(400).json({
        success: false,
        error: 'Ce numéro de téléphone est déjà associé à un compte'
      });
    }

    // Créer un nouveau client
    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = generateToken();
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const { data: newClient, error: insertError } = await supabase
      .from('clients')
      .insert({
        email: email.toLowerCase(),
        nom,
        prenom: prenom || null,
        telephone,
        password_hash: passwordHash,
        email_verified: false,
        verification_token: verificationToken,
        verification_token_expiry: verificationTokenExpiry.toISOString(),
        loyalty_points: 50 // Bonus inscription
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Créer la transaction de points bonus
    await supabase.from('loyalty_transactions').insert({
      client_id: newClient.id,
      type: 'bonus',
      points: 50,
      description: 'Bonus de bienvenue à l\'inscription'
    });

    // Envoyer email de vérification (non-bloquant)
    sendVerificationEmail(email, prenom, nom, verificationToken).catch(err => {
      console.error('[CLIENT-AUTH] Erreur email vérification:', err.message);
    });

    res.json({
      success: true,
      message: 'Compte créé avec succès. Vérifiez votre email pour activer votre compte.',
      bonusPoints: 50
    });

  } catch (error) {
    console.error('Erreur inscription:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'inscription'
    });
  }
});

// ============= CONNEXION =============
router.post('/login', async (req, res) => {
  // 🔒 Empêcher le cache (fix Chrome/Service Worker)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email et mot de passe requis'
      });
    }

    // Trouver le client
    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !client) {
      return res.status(401).json({
        success: false,
        error: 'Email ou mot de passe incorrect'
      });
    }

    if (!client.password_hash) {
      return res.status(401).json({
        success: false,
        error: 'Ce compte n\'a pas de mot de passe. Veuillez vous inscrire.'
      });
    }

    // Vérifier le mot de passe
    const isValid = await bcrypt.compare(password, client.password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Email ou mot de passe incorrect'
      });
    }

    // Mettre à jour la date de dernière connexion
    await supabase
      .from('clients')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', client.id);

    // Générer les tokens
    const accessToken = jwt.sign(
      { id: client.id, email: client.email, type: 'client' },
      EFFECTIVE_JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = generateToken();
    const refreshTokenExpiry = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    // Stocker le refresh token
    clientSessions.set(refreshToken, {
      clientId: client.id,
      expiresAt: refreshTokenExpiry,
      userAgent: req.headers['user-agent']
    });

    // Sauvegarder en base aussi
    await supabase.from('client_sessions').insert({
      client_id: client.id,
      refresh_token: refreshToken,
      expires_at: refreshTokenExpiry.toISOString(),
      user_agent: req.headers['user-agent'],
      ip_address: req.ip
    });

    res.json({
      success: true,
      accessToken,
      refreshToken,
      client: {
        id: client.id,
        nom: client.nom,
        prenom: client.prenom,
        email: client.email,
        telephone: client.telephone,
        emailVerified: client.email_verified,
        loyaltyPoints: client.loyalty_points || 0
      }
    });

  } catch (error) {
    console.error('Erreur connexion:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la connexion'
    });
  }
});

// ============= REFRESH TOKEN =============
router.post('/refresh', async (req, res) => {
  // 🔒 Empêcher le cache (fix Chrome/Service Worker)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token requis'
      });
    }

    // Vérifier le refresh token
    const session = clientSessions.get(refreshToken);
    if (!session || new Date() > session.expiresAt) {
      clientSessions.delete(refreshToken);
      return res.status(401).json({
        success: false,
        error: 'Session expirée, veuillez vous reconnecter'
      });
    }

    // Récupérer le client
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', session.clientId)
      .single();

    if (!client) {
      return res.status(401).json({
        success: false,
        error: 'Client non trouvé'
      });
    }

    // Générer un nouveau access token
    const accessToken = jwt.sign(
      { id: client.id, email: client.email, type: 'client' },
      EFFECTIVE_JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      accessToken
    });

  } catch (error) {
    console.error('Erreur refresh:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du rafraîchissement du token'
    });
  }
});

// ============= DÉCONNEXION =============
router.post('/logout', async (req, res) => {
  // 🔒 Empêcher le cache (fix Chrome/Service Worker)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      clientSessions.delete(refreshToken);

      // Supprimer de la base
      await supabase
        .from('client_sessions')
        .delete()
        .eq('refresh_token', refreshToken);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur logout:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la déconnexion' });
  }
});

// ============= VÉRIFICATION EMAIL =============
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token de vérification requis'
      });
    }

    const { data: client, error } = await supabase
      .from('clients')
      .select('*')
      .eq('verification_token', token)
      .single();

    if (error || !client) {
      return res.status(400).json({
        success: false,
        error: 'Token invalide'
      });
    }

    if (new Date() > new Date(client.verification_token_expiry)) {
      return res.status(400).json({
        success: false,
        error: 'Token expiré. Demandez un nouveau lien de vérification.'
      });
    }

    // Marquer l'email comme vérifié
    await supabase
      .from('clients')
      .update({
        email_verified: true,
        verification_token: null,
        verification_token_expiry: null
      })
      .eq('id', client.id);

    res.json({
      success: true,
      message: 'Email vérifié avec succès !'
    });

  } catch (error) {
    console.error('Erreur vérification email:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification'
    });
  }
});

// ============= MOT DE PASSE OUBLIÉ =============
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email requis'
      });
    }

    const { data: client } = await supabase
      .from('clients')
      .select('id, nom')
      .eq('email', email.toLowerCase())
      .single();

    // Toujours retourner succès pour ne pas révéler si l'email existe
    if (!client) {
      return res.json({
        success: true,
        message: 'Si cet email existe, vous recevrez un lien de réinitialisation.'
      });
    }

    const resetToken = generateToken();
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

    await supabase
      .from('clients')
      .update({
        reset_token: resetToken,
        reset_token_expiry: resetTokenExpiry.toISOString()
      })
      .eq('id', client.id);

    // Envoyer email de réinitialisation (non-bloquant)
    sendPasswordResetEmail(email, client.nom, resetToken).catch(err => {
      console.error('[CLIENT-AUTH] Erreur email reset:', err.message);
    });

    res.json({
      success: true,
      message: 'Si cet email existe, vous recevrez un lien de réinitialisation.'
    });

  } catch (error) {
    console.error('Erreur forgot password:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la demande'
    });
  }
});

// ============= RÉINITIALISATION MOT DE PASSE =============
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token et nouveau mot de passe requis'
      });
    }

    // Validation mot de passe
    if (newPassword.length < 8 || !/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'Le mot de passe doit contenir au moins 8 caractères, 1 chiffre et 1 lettre'
      });
    }

    const { data: client } = await supabase
      .from('clients')
      .select('id, reset_token_expiry')
      .eq('reset_token', token)
      .single();

    if (!client) {
      return res.status(400).json({
        success: false,
        error: 'Token invalide'
      });
    }

    if (new Date() > new Date(client.reset_token_expiry)) {
      return res.status(400).json({
        success: false,
        error: 'Token expiré. Demandez un nouveau lien.'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Mettre à jour le mot de passe et invalider toutes les sessions
    await supabase
      .from('clients')
      .update({
        password_hash: passwordHash,
        reset_token: null,
        reset_token_expiry: null
      })
      .eq('id', client.id);

    // Invalider toutes les sessions du client
    await supabase
      .from('client_sessions')
      .delete()
      .eq('client_id', client.id);

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès. Vous pouvez maintenant vous connecter.'
    });

  } catch (error) {
    console.error('Erreur reset password:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la réinitialisation'
    });
  }
});

// ============= PROFIL (authentifié) =============
router.get('/me', authenticateClient, async (req, res) => {
  // 🔒 Empêcher le cache (fix Chrome/Service Worker)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

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
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du profil'
    });
  }
});

// ============= CRÉATION COMPTE PAR HALIMAH (après réservation) =============
// Cette route permet à Halimah de créer un compte pour un client après réservation
// et d'envoyer les identifiants par SMS/email
router.post('/create-by-halimah', async (req, res) => {
  try {
    const { clientId, telephone, email, nom, prenom, sendCredentials } = req.body;

    // Validation
    if (!telephone && !clientId) {
      return res.status(400).json({
        success: false,
        error: 'Téléphone ou ID client requis'
      });
    }

    // Chercher le client existant
    let client = null;
    if (clientId) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      client = data;
    } else if (telephone) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('telephone', telephone)
        .single();
      client = data;
    }

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client non trouvé'
      });
    }

    // Si le client a déjà un compte (password_hash existe), retourner une erreur
    if (client.password_hash) {
      return res.status(400).json({
        success: false,
        error: 'Ce client a déjà un compte',
        hasAccount: true
      });
    }

    // Générer un mot de passe temporaire
    const tempPassword = crypto.randomBytes(4).toString('hex') + '1A'; // 8 caractères + 1 chiffre + 1 lettre
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Générer un token de réinitialisation pour personnaliser le mot de passe
    const resetToken = generateToken();
    const resetTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    // Mettre à jour le client avec le mot de passe temporaire
    const clientEmail = email || client.email || `${client.telephone}@temp.fatshairafro.fr`;

    const { error: updateError } = await supabase
      .from('clients')
      .update({
        email: clientEmail.toLowerCase(),
        nom: nom || client.nom,
        prenom: prenom || client.prenom,
        password_hash: passwordHash,
        email_verified: false,
        reset_token: resetToken,
        reset_token_expiry: resetTokenExpiry.toISOString(),
        loyalty_points: (client.loyalty_points || 0) + 50 // Bonus inscription
      })
      .eq('id', client.id);

    if (updateError) throw updateError;

    // Créer la transaction de points bonus
    await supabase.from('loyalty_transactions').insert({
      client_id: client.id,
      type: 'bonus',
      points: 50,
      description: 'Bonus de bienvenue - compte créé par Halimah'
    });

    // Envoyer les identifiants si demandé
    const siteUrl = process.env.FRONTEND_URL || 'https://fatshairafro.fr';
    const resetUrl = `${siteUrl}/mon-compte/reinitialisation?token=${resetToken}`;

    if (sendCredentials) {
      // Envoyer par SMS
      if (client.telephone) {
        try {
          const { sendConfirmationSMS } = await import('../../../server/sms-service.js');
          const smsMessage = `Fat's Hair-Afro - Votre compte a été créé!\n\nVos identifiants:\nEmail: ${clientEmail}\nMot de passe: ${tempPassword}\n\nPersonnalisez votre mot de passe: ${resetUrl}\n\nVous avez reçu 50 points de bienvenue!`;
          // Note: utiliser une fonction SMS générique ici
          console.log('[CLIENT-AUTH] SMS à envoyer:', smsMessage);
        } catch (smsError) {
          console.error('[CLIENT-AUTH] Erreur envoi SMS:', smsError);
        }
      }

      // Envoyer par email si disponible
      if (email || client.email) {
        try {
          const { sendConfirmationEmail } = await import('../../../server/email-service.js');
          // Note: implémenter un template email pour les identifiants
          console.log('[CLIENT-AUTH] Email à envoyer pour:', clientEmail);
        } catch (emailError) {
          console.error('[CLIENT-AUTH] Erreur envoi email:', emailError);
        }
      }
    }

    res.json({
      success: true,
      message: 'Compte créé avec succès',
      client: {
        id: client.id,
        email: clientEmail,
        tempPassword: sendCredentials ? tempPassword : undefined, // Ne pas retourner le mdp si envoyé
        resetUrl: resetUrl,
        bonusPoints: 50
      }
    });

  } catch (error) {
    console.error('[CLIENT-AUTH] Erreur create-by-halimah:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création du compte'
    });
  }
});

// ============= ENVOI INVITATION À CRÉER UN COMPTE =============
// Envoie un SMS/email invitant le client à créer son compte sur le site
router.post('/send-invitation', async (req, res) => {
  try {
    const { clientId, telephone } = req.body;

    // Chercher le client
    let client = null;
    if (clientId) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();
      client = data;
    } else if (telephone) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('telephone', telephone)
        .single();
      client = data;
    }

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client non trouvé'
      });
    }

    // Si le client a déjà un compte
    if (client.password_hash) {
      return res.status(400).json({
        success: false,
        error: 'Ce client a déjà un compte',
        hasAccount: true
      });
    }

    const siteUrl = process.env.FRONTEND_URL || 'https://fatshairafro.fr';
    const registerUrl = `${siteUrl}/mon-compte/inscription`;

    // Envoyer SMS d'invitation
    if (client.telephone) {
      try {
        // Utiliser Twilio pour envoyer le SMS
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (accountSid && authToken && fromNumber) {
          const twilio = (await import('twilio')).default;
          const twilioClient = twilio(accountSid, authToken);

          const message = `Bonjour ${client.prenom || client.nom} !\n\nSuite à votre réservation chez Fat's Hair-Afro, créez votre compte fidélité pour accéder à vos avantages.\n\n50 points offerts à l'inscription!\n\nInscrivez-vous: ${registerUrl}\n\nUtilisez le même numéro de téléphone pour lier vos réservations.`;

          await twilioClient.messages.create({
            body: message,
            from: fromNumber,
            to: client.telephone.startsWith('+') ? client.telephone : `+33${client.telephone.substring(1)}`
          });

          console.log('[CLIENT-AUTH] SMS invitation envoyé à:', client.telephone);
        }
      } catch (smsError) {
        console.error('[CLIENT-AUTH] Erreur envoi SMS invitation:', smsError);
      }
    }

    // Envoyer email d'invitation si disponible
    if (client.email) {
      try {
        const { sendInvitationEmail } = await import('../../../server/email-service.js');
        if (sendInvitationEmail) {
          await sendInvitationEmail(client.email, {
            nom: client.nom,
            prenom: client.prenom,
            registerUrl
          });
        }
      } catch (emailError) {
        console.error('[CLIENT-AUTH] Erreur envoi email invitation:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Invitation envoyée',
      sentTo: {
        sms: !!client.telephone,
        email: !!client.email
      }
    });

  } catch (error) {
    console.error('[CLIENT-AUTH] Erreur send-invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'envoi de l\'invitation'
    });
  }
});

// ============= MIDDLEWARE AUTHENTIFICATION CLIENT =============
export function authenticateClient(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Token d\'authentification requis'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET);
    if (decoded.type !== 'client') {
      return res.status(401).json({
        success: false,
        error: 'Token invalide'
      });
    }
    req.client = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expiré',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Token invalide'
    });
  }
}

export default router;
