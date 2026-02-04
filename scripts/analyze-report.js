/**
 * ANALYSE RAPPORT AUDIT NEXUS
 *
 * Analyse le fichier audit-report.json et génère des recommandations.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportPath = path.join(__dirname, '..', 'audit-report.json');

if (!fs.existsSync(reportPath)) {
  console.error('❌ Fichier audit-report.json non trouvé');
  console.error('   Exécutez d\'abord: node scripts/audit-costs.js');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

console.log('\n🔍 ANALYSE DÉTAILLÉE DU RAPPORT D\'AUDIT\n');
console.log('═══════════════════════════════════════════\n');

// 1. Vérification de cohérence
console.log('📊 VÉRIFICATION COHÉRENCE\n');

if (report.summary.totalCalls === 0) {
  console.log('⚠️  Aucun appel API enregistré dans la période');
  console.log('   Le tracking des appels n\'est peut-être pas actif.\n');

  if (report.suggestions) {
    console.log('💡 Suggestions :');
    report.suggestions.forEach((s, i) => console.log(`   ${i + 1}. ${s}`));
  }
  process.exit(0);
}

const totalFromTenants = Object.values(report.byTenant)
  .reduce((sum, t) => sum + t.cost, 0);

console.log(`Coût total (summary) : ${report.summary.totalCost}€`);
console.log(`Coût total (tenants) : ${totalFromTenants.toFixed(4)}€`);
console.log(`Différence : ${Math.abs(report.summary.totalCost - totalFromTenants).toFixed(4)}€`);

if (Math.abs(report.summary.totalCost - totalFromTenants) < 0.01) {
  console.log('✅ Données cohérentes\n');
} else {
  console.log('⚠️  Légère incohérence (arrondi acceptable)\n');
}

// 2. Vérification calcul théorique
console.log('🔬 COHÉRENCE PRIX/TOKENS\n');

if (report.verification) {
  console.log(`Coût si tout Haiku : ${report.verification.theoreticalCostHaiku}€`);
  console.log(`Coût si tout Sonnet : ${report.verification.theoreticalCostSonnet}€`);
  console.log(`Coût enregistré : ${report.verification.actualCost}€`);
  console.log(report.verification.coherent
    ? '✅ Cohérent avec les tarifs Claude\n'
    : '⚠️  Vérifier le calcul des coûts\n');
}

// 3. Répartition par tenant
console.log('🏢 RÉPARTITION PAR TENANT\n');

const tenantEntries = Object.entries(report.byTenant)
  .sort((a, b) => b[1].cost - a[1].cost);

for (const [tenantId, data] of tenantEntries) {
  const bar = '█'.repeat(Math.round(data.percentage / 5)) + '░'.repeat(20 - Math.round(data.percentage / 5));
  console.log(`${tenantId.padEnd(15)} ${bar} ${data.percentage.toFixed(1)}% (${data.cost.toFixed(2)}€)`);
}
console.log();

// 4. Efficacité par tenant
console.log('📈 EFFICACITÉ PAR TENANT\n');

for (const [tenantId, data] of tenantEntries) {
  const costPerCall = (data.cost / data.calls).toFixed(4);
  const tokensPerCall = Math.round((data.tokensIn + data.tokensOut) / data.calls);

  console.log(`${tenantId}:`);
  console.log(`  Coût/appel : ${costPerCall}€`);
  console.log(`  Tokens/appel : ${tokensPerCall}`);
  console.log(`  Appels : ${data.calls.toLocaleString()}`);

  // Évaluer l'efficacité
  if (parseFloat(costPerCall) > 0.05) {
    console.log(`  ⚠️  Coût élevé par appel - optimiser prompts ou passer à Haiku`);
  } else if (parseFloat(costPerCall) < 0.01) {
    console.log(`  ✅ Très efficient`);
  }
  console.log();
}

// 5. Tendance journalière
if (report.byDate && report.byDate.length > 1) {
  console.log('📅 TENDANCE JOURNALIÈRE\n');

  const days = report.byDate;
  const firstHalf = days.slice(0, Math.floor(days.length / 2));
  const secondHalf = days.slice(Math.floor(days.length / 2));

  const firstHalfCost = firstHalf.reduce((s, d) => s + d.cost, 0);
  const secondHalfCost = secondHalf.reduce((s, d) => s + d.cost, 0);

  const avgFirst = firstHalfCost / firstHalf.length;
  const avgSecond = secondHalfCost / secondHalf.length;

  console.log(`Coût moyen première moitié : ${avgFirst.toFixed(4)}€/jour`);
  console.log(`Coût moyen seconde moitié : ${avgSecond.toFixed(4)}€/jour`);

  const trend = ((avgSecond - avgFirst) / avgFirst * 100);
  if (trend > 10) {
    console.log(`📈 Tendance : +${trend.toFixed(1)}% (coûts en hausse)`);
  } else if (trend < -10) {
    console.log(`📉 Tendance : ${trend.toFixed(1)}% (coûts en baisse)`);
  } else {
    console.log(`➡️  Tendance : stable (${trend > 0 ? '+' : ''}${trend.toFixed(1)}%)`);
  }
  console.log();

  // Jour le plus coûteux
  const maxDay = days.reduce((max, d) => d.cost > max.cost ? d : max, days[0]);
  console.log(`Jour le plus coûteux : ${maxDay.date} (${maxDay.cost.toFixed(2)}€, ${maxDay.calls} appels)\n`);
}

// 6. Recommandations prioritaires
console.log('═══════════════════════════════════════════');
console.log('💡 RECOMMANDATIONS PRIORITAIRES');
console.log('═══════════════════════════════════════════\n');

const recommendations = [];

// Reco 1: Haiku
if (report.opportunities?.haikuSwitch > 1) {
  recommendations.push({
    priority: 1,
    level: 'HIGH',
    action: 'Basculer vers Claude Haiku pour appels simples (FAQ, recherche)',
    saving: report.opportunities.haikuSwitch,
    effort: 'FAIBLE',
    details: 'Modifier le modèle dans les endpoints qui ne nécessitent pas Sonnet'
  });
}

// Reco 2: Cache
if (report.opportunities?.caching > 0.5) {
  recommendations.push({
    priority: 2,
    level: 'MEDIUM',
    action: 'Implémenter un cache Redis pour les FAQ répétitives',
    saving: report.opportunities.caching,
    effort: 'MOYEN',
    details: 'Cache les réponses aux questions fréquentes (services, horaires, tarifs)'
  });
}

// Reco 3: Prompts
if (report.opportunities?.promptOptimization > 0.3) {
  recommendations.push({
    priority: 3,
    level: 'MEDIUM',
    action: 'Optimiser les prompts système',
    saving: report.opportunities.promptOptimization,
    effort: 'FAIBLE',
    details: 'Réduire la longueur des instructions, utiliser des exemples concis'
  });
}

// Reco 4: Multi-tenant
if (tenantEntries.length > 1) {
  const maxTenant = tenantEntries[0];
  const secondTenant = tenantEntries[1];
  if (maxTenant[1].cost > secondTenant[1].cost * 3) {
    recommendations.push({
      priority: 4,
      level: 'LOW',
      action: `Investiguer l'usage élevé du tenant ${maxTenant[0]}`,
      saving: maxTenant[1].cost * 0.1,
      effort: 'FAIBLE',
      details: 'Ce tenant consomme significativement plus - vérifier s\'il y a des abus'
    });
  }
}

// Afficher les recommandations
recommendations
  .sort((a, b) => a.priority - b.priority)
  .forEach((reco, i) => {
    console.log(`${i + 1}. [${reco.level}] ${reco.action}`);
    console.log(`   💰 Économie estimée : ${reco.saving.toFixed(2)}€`);
    console.log(`   ⚙️  Effort : ${reco.effort}`);
    console.log(`   📝 ${reco.details}\n`);
  });

// Total économies
if (report.opportunities) {
  console.log('═══════════════════════════════════════════');
  console.log(`💰 ÉCONOMIE TOTALE POTENTIELLE : ${report.opportunities.total.toFixed(2)}€`);
  console.log(`   Soit ${report.opportunities.percentage}% des coûts actuels`);
  console.log('═══════════════════════════════════════════\n');
}

// 7. Actions immédiates
console.log('🎯 ACTIONS IMMÉDIATES\n');

console.log('1. VÉRIFIER le tracking des appels :');
console.log('   grep -r "trackTenantCall" backend/\n');

console.log('2. VOIR les appels en temps réel :');
console.log('   curl -H "Authorization: Bearer $TOKEN" localhost:5000/api/sentinel/usage\n');

console.log('3. TESTER un switch vers Haiku :');
console.log('   - Identifier les endpoints simples (FAQ, recherche)');
console.log('   - Changer model: "claude-sonnet-4-..." → "claude-3-haiku-20240307"\n');

// 8. Sauvegarder l'analyse
const analysis = {
  coherence: {
    dataDiff: Math.abs(report.summary.totalCost - totalFromTenants),
    valid: Math.abs(report.summary.totalCost - totalFromTenants) < 0.01,
    priceValid: report.verification?.coherent || false,
  },
  distribution: tenantEntries.map(([id, data]) => ({
    tenantId: id,
    cost: data.cost,
    percentage: data.percentage,
    costPerCall: (data.cost / data.calls).toFixed(4),
  })),
  trend: report.byDate?.length > 1 ? {
    direction: (() => {
      const days = report.byDate;
      const firstHalf = days.slice(0, Math.floor(days.length / 2));
      const secondHalf = days.slice(Math.floor(days.length / 2));
      const avgFirst = firstHalf.reduce((s, d) => s + d.cost, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, d) => s + d.cost, 0) / secondHalf.length;
      return avgSecond > avgFirst * 1.1 ? 'up' : avgSecond < avgFirst * 0.9 ? 'down' : 'stable';
    })(),
  } : null,
  recommendations,
  timestamp: new Date().toISOString(),
};

const analysisPath = path.join(__dirname, '..', 'audit-analysis.json');
fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

console.log(`✅ Analyse sauvegardée : ${analysisPath}\n`);
