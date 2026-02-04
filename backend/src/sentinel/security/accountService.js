/**
 * SENTINEL Account Service
 * Gestion des comptes utilisateurs avec politique de securite
 */

import { supabase } from '../../config/supabase.js';
import {
  validatePasswordStrength,
  generateProvisionalPassword,
  generateProvisionalId,
  isPasswordInHistory,
  getProvisionalExpiry,
  isProvisionalExpired,
  isPasswordExpired,
  hashPassword,
  verifyPassword,
  POLICY,
} from './passwordPolicy.js';
import { logAuthFailure, logAuthSuccess, logSecurityEvent, EVENT_TYPES, SEVERITY } from './securityLogger.js';

// Creer un compte provisoire
export async function createProvisionalAccount(email, tenantId, role = 'admin') {
  const provisionalPassword = generateProvisionalPassword();
  const hashedPassword = await hashPassword(provisionalPassword);
  const expiry = getProvisionalExpiry();

  try {
    const { data, error } = await supabase
      .from('admin_users')
      .insert({
        email,
        password_hash: hashedPassword,
        nom: email.split('@')[0],
        role,
        tenant_id: tenantId,
        actif: true,
        is_provisional: true,
        provisional_expiry: expiry.toISOString(),
        must_change_password: true,
        password_changed_at: new Date().toISOString(),
        password_history: JSON.stringify([hashedPassword]),
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      user: data,
      credentials: {
        email,
        provisionalPassword,
        expiresAt: expiry,
        mustChangeWithin: `${POLICY.provisionalExpiry} jours`,
      },
    };
  } catch (err) {
    console.error('[SENTINEL] Error creating provisional account:', err.message);
    return { success: false, error: err.message };
  }
}

// Changer le mot de passe
export async function changePassword(userId, currentPassword, newPassword) {
  try {
    const { data: user, error: fetchError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      return { success: false, error: 'Utilisateur non trouvé' };
    }

    // Verifier le mot de passe actuel
    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return { success: false, error: 'Mot de passe actuel incorrect' };
    }

    // Valider le nouveau mot de passe
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      return { success: false, error: 'Nouveau mot de passe invalide', details: validation.errors };
    }

    // Verifier l'historique
    const history = user.password_history || [];
    const parsedHistory = typeof history === 'string' ? JSON.parse(history) : history;
    const inHistory = await isPasswordInHistory(newPassword, parsedHistory);
    if (inHistory) {
      return { success: false, error: `Ce mot de passe a déjà été utilisé (historique des ${POLICY.historyCount} derniers)` };
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await hashPassword(newPassword);

    // Mettre a jour l'historique
    const newHistory = [hashedPassword, ...parsedHistory].slice(0, POLICY.historyCount);

    const { error: updateError } = await supabase
      .from('admin_users')
      .update({
        password_hash: hashedPassword,
        is_provisional: false,
        provisional_expiry: null,
        must_change_password: false,
        password_changed_at: new Date().toISOString(),
        password_history: JSON.stringify(newHistory),
        failed_login_attempts: 0,
        locked_until: null,
      })
      .eq('id', userId);

    if (updateError) throw updateError;

    await logSecurityEvent({
      type: EVENT_TYPES.PASSWORD_CHANGE,
      severity: SEVERITY.LOW,
      userId,
      tenantId: user.tenant_id,
      details: { provisional: user.is_provisional },
    });

    return { success: true, message: 'Mot de passe changé avec succès' };
  } catch (err) {
    console.error('[SENTINEL] Error changing password:', err.message);
    return { success: false, error: err.message };
  }
}

// Verifier le login avec politique de securite
export async function verifyLogin(email, password, req) {
  try {
    const { data: user, error: fetchError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email)
      .eq('actif', true)
      .single();

    if (fetchError || !user) {
      await logAuthFailure(req, 'Utilisateur non trouvé');
      return { success: false, error: 'Identifiants incorrects' };
    }

    // Verifier si le compte est verrouille
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const remainingMinutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      await logAuthFailure(req, 'Compte verrouillé');
      return { success: false, error: `Compte verrouillé. Réessayez dans ${remainingMinutes} minutes.` };
    }

    // Verifier le mot de passe
    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const maxAttempts = 5;

      let lockUntil = null;
      if (attempts >= maxAttempts) {
        lockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      }

      await supabase
        .from('admin_users')
        .update({
          failed_login_attempts: attempts,
          locked_until: lockUntil,
        })
        .eq('id', user.id);

      await logAuthFailure(req, `Mot de passe incorrect (tentative ${attempts}/${maxAttempts})`);

      if (lockUntil) {
        return { success: false, error: 'Trop de tentatives. Compte verrouillé pour 30 minutes.' };
      }

      return { success: false, error: 'Identifiants incorrects' };
    }

    // Verifier si le compte provisoire est expire
    if (user.is_provisional && isProvisionalExpired(user.provisional_expiry)) {
      await logAuthFailure(req, 'Compte provisoire expiré');
      return {
        success: false,
        error: "Votre compte provisoire a expiré. Contactez l'administrateur.",
        expired: true,
      };
    }

    // Reinitialiser les tentatives echouees
    await supabase
      .from('admin_users')
      .update({
        failed_login_attempts: 0,
        locked_until: null,
      })
      .eq('id', user.id);

    await logAuthSuccess(req, user.id);

    const response = {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nom: user.nom,
        role: user.role,
        tenant_id: user.tenant_id,
      },
    };

    if (user.must_change_password) {
      response.mustChangePassword = true;
      response.message = 'Vous devez changer votre mot de passe';
    }

    if (isPasswordExpired(user.password_changed_at)) {
      response.passwordExpired = true;
      response.message = 'Votre mot de passe a expiré';
    }

    return response;
  } catch (err) {
    console.error('[SENTINEL] Error verifying login:', err.message);
    return { success: false, error: 'Erreur de connexion' };
  }
}
