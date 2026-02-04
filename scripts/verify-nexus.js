#!/usr/bin/env node

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║                                                                   ║
 * ║   VÉRIFICATION NEXUS CORE - Cohérence des canaux                 ║
 * ║                                                                   ║
 * ║   Ce script vérifie que tous les canaux utilisent NEXUS Core     ║
 * ║   comme source unique de vérité.                                  ║
 * ║                                                                   ║
 * ║   Usage: npm run verify:nexus                                     ║
 * ║                                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

import fs from 'fs';
import path from 'path';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   VÉRIFICATION NEXUS CORE - Cohérence des canaux                 ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝${colors.reset}
`);

let hasErrors = false;
let hasWarnings = false;

// ══════════════════════════════════════════════════════════════════════
// VÉRIFICATION 1: FICHIERS NEXUS CORE
// ══════════════════════════════════════════════════════════════════════

console.log(`${colors.bold}${colors.blue}1. VÉRIFICATION DES FICHIERS NEXUS CORE${colors.reset}\n`);

const requiredFiles = [
  { path: 'backend/src/config/businessRules.js', description: 'Règles métier verrouillées' },
  { path: 'backend/src/services/bookingValidator.js', description: 'Validateur centralisé' },
  { path: 'backend/src/core/unified/nexusCore.js', description: 'Service NEXUS Core' },
];

for (const file of requiredFiles) {
  const fullPath = path.join(process.cwd(), file.path);
  if (fs.existsSync(fullPath)) {
    console.log(`   ${colors.green}✓${colors.reset} ${file.path}`);
  } else {
    console.log(`   ${colors.red}✗ MANQUANT: ${file.path}${colors.reset}`);
    console.log(`     → ${file.description}`);
    hasErrors = true;
  }
}

// ══════════════════════════════════════════════════════════════════════
// VÉRIFICATION 2: IMPORT DE NEXUS CORE DANS LES CANAUX
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}2. VÉRIFICATION DES IMPORTS NEXUS CORE${colors.reset}\n`);

const channelFiles = [
  {
    path: 'backend/src/routes/twilioWebhooks.js',
    channel: 'Téléphone/SMS',
    shouldContain: ['unified/nexusCore', 'processMessage'],
    shouldNotContain: ['halimahAI.chat']
  },
  {
    path: 'server/routes.ts',
    channel: 'WhatsApp + Chat Web',
    shouldContain: ['unified/nexusCore', 'nexusProcessMessage'],
    shouldNotContain: []
  },
];

for (const file of channelFiles) {
  const fullPath = path.join(process.cwd(), file.path);

  if (!fs.existsSync(fullPath)) {
    console.log(`   ${colors.yellow}⚠ ${file.channel}: Fichier non trouvé (${file.path})${colors.reset}`);
    hasWarnings = true;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  let fileOk = true;

  // Vérifier les imports requis
  for (const required of file.shouldContain) {
    if (!content.includes(required)) {
      console.log(`   ${colors.red}✗ ${file.channel}: Manque '${required}'${colors.reset}`);
      fileOk = false;
      hasErrors = true;
    }
  }

  // Vérifier les imports interdits
  for (const forbidden of file.shouldNotContain) {
    if (content.includes(forbidden)) {
      console.log(`   ${colors.red}✗ ${file.channel}: Contient encore '${forbidden}'${colors.reset}`);
      fileOk = false;
      hasErrors = true;
    }
  }

  if (fileOk) {
    console.log(`   ${colors.green}✓${colors.reset} ${file.channel} utilise NEXUS Core`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// VÉRIFICATION 3: PAS DE SERVICES DUPLIQUÉS
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}3. VÉRIFICATION DES SOURCES DE DONNÉES${colors.reset}\n`);

const filesWithPotentialDuplication = [
  'backend/src/core/halimahAI.js',
  'backend/src/core/nexusCore.js',
];

const businessRulesPath = path.join(process.cwd(), 'backend/src/config/businessRules.js');
const businessRulesContent = fs.readFileSync(businessRulesPath, 'utf8');

// Vérifier que businessRules.js contient Object.freeze
if (businessRulesContent.includes('Object.freeze')) {
  console.log(`   ${colors.green}✓${colors.reset} businessRules.js utilise Object.freeze`);
} else {
  console.log(`   ${colors.red}✗ businessRules.js n'utilise pas Object.freeze${colors.reset}`);
  hasErrors = true;
}

// Compter les définitions de SERVICES
let servicesDefinitions = 0;

for (const file of filesWithPotentialDuplication) {
  const fullPath = path.join(process.cwd(), file);
  if (!fs.existsSync(fullPath)) continue;

  const content = fs.readFileSync(fullPath, 'utf8');

  // Chercher les définitions de services locales (pas des imports)
  const hasLocalServices = content.includes('export const SERVICES = {') ||
                           content.includes('const SERVICES = {') && !content.includes('import');

  if (hasLocalServices && !file.includes('businessRules')) {
    console.log(`   ${colors.yellow}⚠ ${file} définit ses propres SERVICES (à migrer)${colors.reset}`);
    servicesDefinitions++;
    hasWarnings = true;
  }
}

if (servicesDefinitions === 0) {
  console.log(`   ${colors.green}✓${colors.reset} Pas de duplication de SERVICES détectée`);
}

// ══════════════════════════════════════════════════════════════════════
// VÉRIFICATION 4: CACHE
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}4. VÉRIFICATION DU CACHE${colors.reset}\n`);

const nexusCorePath = path.join(process.cwd(), 'backend/src/core/unified/nexusCore.js');
if (fs.existsSync(nexusCorePath)) {
  const nexusCoreContent = fs.readFileSync(nexusCorePath, 'utf8');

  if (nexusCoreContent.includes('const cache = new Map()')) {
    console.log(`   ${colors.green}✓${colors.reset} Cache mémoire implémenté`);
  } else {
    console.log(`   ${colors.yellow}⚠ Cache non implémenté (performances réduites)${colors.reset}`);
    hasWarnings = true;
  }

  if (nexusCoreContent.includes('getCached') && nexusCoreContent.includes('setCache')) {
    console.log(`   ${colors.green}✓${colors.reset} Fonctions cache (getCached/setCache)`);
  }

  if (nexusCoreContent.includes('invalidateCache')) {
    console.log(`   ${colors.green}✓${colors.reset} Invalidation du cache`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// VÉRIFICATION 5: OUTILS UNIFIÉS
// ══════════════════════════════════════════════════════════════════════

console.log(`\n${colors.bold}${colors.blue}5. VÉRIFICATION DES OUTILS IA${colors.reset}\n`);

if (fs.existsSync(nexusCorePath)) {
  const nexusCoreContent = fs.readFileSync(nexusCorePath, 'utf8');

  const requiredTools = [
    'parse_date',
    'get_services',
    'get_price',
    'check_availability',
    'get_available_slots',
    'calculate_travel_fee',
    'create_booking',
    'get_salon_info',
    'get_business_hours'
  ];

  let allToolsPresent = true;
  for (const tool of requiredTools) {
    if (nexusCoreContent.includes(`name: "${tool}"`)) {
      console.log(`   ${colors.green}✓${colors.reset} Outil ${tool}`);
    } else {
      console.log(`   ${colors.red}✗ Outil manquant: ${tool}${colors.reset}`);
      allToolsPresent = false;
      hasErrors = true;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// RÉSULTAT FINAL
// ══════════════════════════════════════════════════════════════════════

console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║`);

if (hasErrors) {
  console.log(`${colors.cyan}║${colors.reset}   ${colors.red}${colors.bold}⚠️  ERREURS DÉTECTÉES - COHÉRENCE NON GARANTIE${colors.reset}               ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}                                                                   ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}   ${colors.red}Certains canaux n'utilisent pas NEXUS Core.${colors.reset}                  ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}   ${colors.red}Les données peuvent être incohérentes entre canaux.${colors.reset}          ${colors.cyan}║`);
} else if (hasWarnings) {
  console.log(`${colors.cyan}║${colors.reset}   ${colors.yellow}${colors.bold}⚠️  AVERTISSEMENTS - MIGRATION INCOMPLÈTE${colors.reset}                    ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}                                                                   ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}   ${colors.yellow}Certains fichiers doivent encore être migrés.${colors.reset}                ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}   ${colors.yellow}Le système fonctionne mais n'est pas optimal.${colors.reset}                ${colors.cyan}║`);
} else {
  console.log(`${colors.cyan}║${colors.reset}   ${colors.green}${colors.bold}✅ VÉRIFICATION RÉUSSIE - NEXUS CORE OK${colors.reset}                      ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}                                                                   ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}   ${colors.green}Tous les canaux utilisent NEXUS Core.${colors.reset}                        ${colors.cyan}║`);
  console.log(`${colors.cyan}║${colors.reset}   ${colors.green}Les données sont cohérentes sur tous les canaux.${colors.reset}             ${colors.cyan}║`);
}

console.log(`${colors.cyan}║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝${colors.reset}
`);

process.exit(hasErrors ? 1 : 0);
