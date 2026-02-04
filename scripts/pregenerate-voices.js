#!/usr/bin/env node
/**
 * Script de pré-génération des phrases vocales courantes
 *
 * Ce script génère et cache toutes les phrases courantes
 * pour économiser les crédits ElevenLabs lors des appels téléphoniques.
 *
 * Usage:
 *   node scripts/pregenerate-voices.js
 *   node scripts/pregenerate-voices.js --voice <voiceId>
 *   node scripts/pregenerate-voices.js --check (vérifier seulement, ne pas générer)
 *
 * @requires ELEVENLABS_API_KEY dans les variables d'environnement
 */

import 'dotenv/config';
import voiceService from '../backend/src/services/voiceService.js';

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  console.log('\n');
  log('cyan', '╔════════════════════════════════════════════════════════════╗');
  log('cyan', '║      PRÉ-GÉNÉRATION DES PHRASES VOCALES HALIMAH           ║');
  log('cyan', '╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Vérifier la configuration
  if (!voiceService.isConfigured()) {
    log('red', '❌ ELEVENLABS_API_KEY non configurée dans .env');
    process.exit(1);
  }

  // Parser les arguments
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const voiceIndex = args.indexOf('--voice');
  const voiceId = voiceIndex > -1 ? args[voiceIndex + 1] : undefined;

  // Afficher les phrases disponibles
  const phrases = voiceService.PREGENERATED_PHRASES;
  const phraseCount = Object.keys(phrases).length;

  log('blue', `📝 Phrases à pré-générer: ${phraseCount}`);
  console.log('');

  // Compter les caractères totaux
  let totalChars = 0;
  for (const phrase of Object.values(phrases)) {
    totalChars += phrase.length;
  }
  log('blue', `📊 Caractères totaux: ${totalChars}`);
  console.log('');

  // Vérifier le quota avant
  try {
    const quotaBefore = await voiceService.getQuota();
    if (quotaBefore.available) {
      log('blue', `📈 Quota ElevenLabs:`);
      console.log(`   Utilisé: ${quotaBefore.used.toLocaleString()} / ${quotaBefore.limit.toLocaleString()} (${quotaBefore.percentUsed}%)`);
      console.log(`   Restant: ${quotaBefore.remaining.toLocaleString()} caractères`);
      console.log('');

      if (quotaBefore.remaining < totalChars && !checkOnly) {
        log('yellow', `⚠️  Attention: ${totalChars} caractères nécessaires, ${quotaBefore.remaining} disponibles`);
        console.log('');
      }
    }
  } catch (error) {
    log('yellow', `⚠️  Impossible de vérifier le quota: ${error.message}`);
  }

  // Afficher les stats du cache actuel
  const cacheStats = voiceService.getCacheStats();
  log('blue', `💾 Cache actuel: ${cacheStats.cacheFiles} fichiers (${cacheStats.cacheSize})`);
  console.log('');

  if (checkOnly) {
    log('yellow', '🔍 Mode vérification uniquement (--check)');
    console.log('');

    // Lister les phrases et leur statut de cache
    log('blue', 'Phrases et statut de cache:');
    console.log('');

    for (const [key, phrase] of Object.entries(phrases)) {
      const cached = await voiceService.textToSpeech(phrase, { useCache: true, optimize: false });
      const status = cached.fromCache ? '✅ cached' : '❌ non cached';
      console.log(`  ${status} ${key}: "${phrase.substring(0, 40)}${phrase.length > 40 ? '...' : ''}"`);
    }

    console.log('');
    process.exit(0);
  }

  // Pré-générer les phrases
  log('green', '🚀 Démarrage de la pré-génération...');
  console.log('');

  const startTime = Date.now();
  const result = await voiceService.pregenerateCommonPhrases(voiceId);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  log('cyan', '╔════════════════════════════════════════════════════════════╗');
  log('cyan', '║                      RÉSULTAT                              ║');
  log('cyan', '╚════════════════════════════════════════════════════════════╝');
  console.log('');

  log('green', `✅ Phrases générées: ${result.generated}`);
  log('yellow', `💾 Déjà en cache: ${result.skipped}`);
  if (result.errors > 0) {
    log('red', `❌ Erreurs: ${result.errors}`);
  }
  log('blue', `⏱️  Durée: ${duration}s`);
  console.log('');

  // Vérifier le quota après
  try {
    const quotaAfter = await voiceService.getQuota();
    if (quotaAfter.available) {
      log('blue', `📈 Quota restant: ${quotaAfter.remaining.toLocaleString()} caractères`);
    }
  } catch (error) {
    // Ignorer
  }

  // Afficher les nouvelles stats du cache
  const newCacheStats = voiceService.getCacheStats();
  log('blue', `💾 Cache total: ${newCacheStats.cacheFiles} fichiers (${newCacheStats.cacheSize})`);
  console.log('');

  // Estimation des économies
  const estimatedCalls = 100; // Appels téléphoniques par mois
  const avgPhrasesPerCall = 5; // Phrases pré-générées utilisées par appel
  const avgCharsPerPhrase = Math.round(totalChars / phraseCount);
  const monthlySavings = estimatedCalls * avgPhrasesPerCall * avgCharsPerPhrase;

  log('cyan', '📊 ESTIMATION DES ÉCONOMIES:');
  console.log(`   Pour ${estimatedCalls} appels/mois avec ~${avgPhrasesPerCall} phrases pré-générées/appel:`);
  console.log(`   ~${monthlySavings.toLocaleString()} caractères économisés/mois`);
  console.log('');

  log('green', '✅ Pré-génération terminée avec succès!');
  console.log('');
}

main().catch(error => {
  log('red', `❌ Erreur: ${error.message}`);
  console.error(error);
  process.exit(1);
});
