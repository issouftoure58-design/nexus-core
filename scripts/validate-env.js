#!/usr/bin/env node

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * VALIDATION DES VARIABLES D'ENVIRONNEMENT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Ce script vérifie que toutes les variables requises sont configurées
 * AVANT le déploiement pour éviter les erreurs en production.
 *
 * Usage :
 *   npm run validate:env           # Validation standard
 *   npm run validate:env -- --fix  # Affiche les valeurs manquantes à configurer
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// ══════════════════════════════════════════════════════════════════════════════
// DÉFINITION DES VARIABLES
// ══════════════════════════════════════════════════════════════════════════════

const ENV_VARS = {
  // Variables OBLIGATOIRES - le serveur ne démarre pas sans
  required: [
    { key: 'DATABASE_URL', description: 'URL PostgreSQL Supabase', example: 'postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres' },
    { key: 'SUPABASE_URL', description: 'URL du projet Supabase', example: 'https://xxxxx.supabase.co' },
    { key: 'SUPABASE_ANON_KEY', description: 'Clé anonyme Supabase', example: 'eyJhbGciOiJIUzI1NiIs...' },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', description: 'Clé service Supabase', example: 'eyJhbGciOiJIUzI1NiIs...' },
    { key: 'ANTHROPIC_API_KEY', description: 'Clé API Claude (Anthropic)', example: 'sk-ant-api03-...' },
    { key: 'JWT_SECRET', description: 'Secret pour les tokens JWT', example: 'générer avec: openssl rand -hex 32' },
  ],

  // Variables RECOMMANDÉES - fonctionnalités importantes
  recommended: [
    { key: 'ADMIN_PASSWORD', description: 'Mot de passe admin', default: 'halimah2024' },
    { key: 'CORS_ORIGIN', description: 'URL du frontend autorisé', example: 'https://halimah.vercel.app' },
  ],

  // Variables OPTIONNELLES - fonctionnalités additionnelles
  optional: [
    { key: 'REDIS_URL', description: 'Cache Redis', feature: 'Cache performances' },
    { key: 'TWILIO_ACCOUNT_SID', description: 'Twilio Account SID', feature: 'SMS/WhatsApp/Appels' },
    { key: 'TWILIO_AUTH_TOKEN', description: 'Twilio Auth Token', feature: 'SMS/WhatsApp/Appels' },
    { key: 'TWILIO_PHONE_NUMBER', description: 'Numéro Twilio', feature: 'Appels' },
    { key: 'TWILIO_WHATSAPP_NUMBER', description: 'Numéro WhatsApp', feature: 'WhatsApp' },
    { key: 'ELEVENLABS_API_KEY', description: 'ElevenLabs API', feature: 'Voix IA' },
    { key: 'STRIPE_SECRET_KEY', description: 'Clé secrète Stripe', feature: 'Paiements carte' },
    { key: 'STRIPE_WEBHOOK_SECRET', description: 'Webhook Stripe', feature: 'Paiements carte' },
    { key: 'PAYPAL_CLIENT_ID', description: 'PayPal Client ID', feature: 'Paiements PayPal' },
    { key: 'PAYPAL_CLIENT_SECRET', description: 'PayPal Secret', feature: 'Paiements PayPal' },
    { key: 'GOOGLE_MAPS_API_KEY', description: 'Google Maps API', feature: 'Calcul distances' },
    { key: 'RESEND_API_KEY', description: 'Resend API', feature: 'Emails' },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

function validateEnv() {
  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   VALIDATION DES VARIABLES D'ENVIRONNEMENT                       ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const isProduction = process.env.NODE_ENV === 'production';
  const showFix = process.argv.includes('--fix');

  let hasErrors = false;
  let hasWarnings = false;
  const missing = { required: [], recommended: [], optional: [] };

  // Vérifier les variables OBLIGATOIRES
  console.log(`${colors.bold}${colors.blue}1. VARIABLES OBLIGATOIRES${colors.reset}\n`);

  for (const v of ENV_VARS.required) {
    const value = process.env[v.key];
    if (!value || value.trim() === '') {
      console.log(`   ${colors.red}✗ ${v.key}${colors.reset} - ${v.description}`);
      missing.required.push(v);
      hasErrors = true;
    } else {
      const masked = value.substring(0, 8) + '...' + value.substring(value.length - 4);
      console.log(`   ${colors.green}✓${colors.reset} ${v.key} = ${masked}`);
    }
  }

  // Vérifier les variables RECOMMANDÉES
  console.log(`\n${colors.bold}${colors.blue}2. VARIABLES RECOMMANDÉES${colors.reset}\n`);

  for (const v of ENV_VARS.recommended) {
    const value = process.env[v.key];
    if (!value || value.trim() === '') {
      if (v.default) {
        console.log(`   ${colors.yellow}⚠ ${v.key}${colors.reset} - Utilise la valeur par défaut`);
      } else {
        console.log(`   ${colors.yellow}⚠ ${v.key}${colors.reset} - ${v.description}`);
        missing.recommended.push(v);
        hasWarnings = true;
      }
    } else {
      console.log(`   ${colors.green}✓${colors.reset} ${v.key} = ${value.substring(0, 20)}...`);
    }
  }

  // Vérifier les variables OPTIONNELLES
  console.log(`\n${colors.bold}${colors.blue}3. FONCTIONNALITÉS OPTIONNELLES${colors.reset}\n`);

  const features = {};
  for (const v of ENV_VARS.optional) {
    if (!features[v.feature]) features[v.feature] = { vars: [], configured: true };
    features[v.feature].vars.push(v.key);

    const value = process.env[v.key];
    if (!value || value.trim() === '') {
      features[v.feature].configured = false;
    }
  }

  for (const [feature, data] of Object.entries(features)) {
    if (data.configured) {
      console.log(`   ${colors.green}✓${colors.reset} ${feature}`);
    } else {
      console.log(`   ${colors.yellow}○${colors.reset} ${feature} (non configuré)`);
    }
  }

  // Résultat
  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════════╗${colors.reset}`);

  if (hasErrors) {
    console.log(`${colors.cyan}║${colors.reset}   ${colors.red}${colors.bold}✗ ERREUR : Variables obligatoires manquantes${colors.reset}                 ${colors.cyan}║${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}                                                                   ${colors.cyan}║${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}   Le serveur ne peut pas démarrer sans ces variables.             ${colors.cyan}║${colors.reset}`);

    if (showFix) {
      console.log(`${colors.cyan}║${colors.reset}                                                                   ${colors.cyan}║${colors.reset}`);
      console.log(`${colors.cyan}║${colors.reset}   ${colors.bold}Variables à configurer :${colors.reset}                                    ${colors.cyan}║${colors.reset}`);
      for (const v of missing.required) {
        console.log(`${colors.cyan}║${colors.reset}   - ${v.key}                                                       ${colors.cyan}║${colors.reset}`);
      }
    } else {
      console.log(`${colors.cyan}║${colors.reset}   Lancez avec --fix pour voir les détails.                        ${colors.cyan}║${colors.reset}`);
    }
  } else if (hasWarnings) {
    console.log(`${colors.cyan}║${colors.reset}   ${colors.yellow}${colors.bold}⚠ AVERTISSEMENT : Certaines variables recommandées manquent${colors.reset}     ${colors.cyan}║${colors.reset}`);
  } else {
    console.log(`${colors.cyan}║${colors.reset}   ${colors.green}${colors.bold}✓ VALIDATION RÉUSSIE${colors.reset}                                          ${colors.cyan}║${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}                                                                   ${colors.cyan}║${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}   Toutes les variables obligatoires sont configurées.             ${colors.cyan}║${colors.reset}`);
  }

  console.log(`${colors.cyan}╚═══════════════════════════════════════════════════════════════════╝${colors.reset}
`);

  // Afficher les commandes pour configurer sur les plateformes
  if (showFix && missing.required.length > 0) {
    console.log(`${colors.bold}${colors.blue}COMMANDES POUR CONFIGURER :${colors.reset}\n`);

    console.log(`${colors.cyan}# Render (Dashboard → Environment)${colors.reset}`);
    for (const v of missing.required) {
      console.log(`${v.key}=${v.example || 'VOTRE_VALEUR'}`);
    }

    console.log(`\n${colors.cyan}# Vercel CLI${colors.reset}`);
    for (const v of missing.required) {
      console.log(`vercel env add ${v.key}`);
    }
    console.log('');
  }

  process.exit(hasErrors ? 1 : 0);
}

// ══════════════════════════════════════════════════════════════════════════════
// EXÉCUTION
// ══════════════════════════════════════════════════════════════════════════════

validateEnv();
