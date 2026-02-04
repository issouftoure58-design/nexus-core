/**
 * AUDIT COÛTS NEXUS
 *
 * Analyse les données de la table sentinel_usage pour comprendre
 * les 53.04€ de coûts API Claude.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Initialiser Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requises');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Prix Claude API (par token, en EUR) - pour vérification
const PRICING = {
  haiku: { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
  sonnet: { input: 3 / 1_000_000, output: 15 / 1_000_000 },
};

async function auditCosts() {
  console.log('🔍 AUDIT COÛTS NEXUS\n');
  console.log('═══════════════════════════════════════════\n');

  // Période : 1er février 2026 - aujourd'hui
  const startDate = '2026-02-01';
  const endDate = new Date().toISOString().split('T')[0];

  console.log(`📅 Période : ${startDate} → ${endDate}\n`);

  // 1. Récupérer TOUS les enregistrements d'usage
  console.log('📊 Chargement des données sentinel_usage...\n');

  const { data: usageData, error: usageError } = await supabase
    .from('sentinel_usage')
    .select('*')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  if (usageError) {
    console.error('❌ Erreur chargement usage:', usageError.message);
    process.exit(1);
  }

  console.log(`✅ ${usageData?.length || 0} enregistrements trouvés\n`);

  if (!usageData || usageData.length === 0) {
    console.log('⚠️  Aucune donnée d\'usage trouvée dans la table sentinel_usage');
    console.log('   Vérifiez que des appels API ont été tracés.\n');

    // Essayer de voir les tables disponibles
    console.log('📋 Recherche d\'autres sources de données...\n');

    // Vérifier halimah_memory pour les conversations IA
    const { data: memoryData, count: memoryCount } = await supabase
      .from('halimah_memory')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate);

    console.log(`   halimah_memory : ${memoryCount || 0} enregistrements`);

    // Vérifier halimah_tasks
    const { count: tasksCount } = await supabase
      .from('halimah_tasks')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate);

    console.log(`   halimah_tasks : ${tasksCount || 0} enregistrements`);

    // Vérifier sentinel_alerts
    const { data: alertsData, count: alertsCount } = await supabase
      .from('sentinel_alerts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(20);

    console.log(`   sentinel_alerts : ${alertsCount || 0} enregistrements\n`);

    if (alertsData && alertsData.length > 0) {
      console.log('📢 Dernières alertes SENTINEL :\n');
      alertsData.slice(0, 5).forEach(alert => {
        console.log(`   [${alert.level}] ${alert.tenant_id}: ${alert.percentage}% - ${alert.message}`);
        console.log(`   Date: ${alert.created_at}\n`);
      });
    }

    // Créer un rapport vide
    const emptyReport = {
      period: { start: startDate, end: endDate },
      summary: { totalCalls: 0, totalCost: 0, avgCostPerCall: 0 },
      byTenant: {},
      byDate: [],
      message: 'Aucune donnée dans sentinel_usage - les appels API ne sont peut-être pas tracés',
      suggestions: [
        'Vérifier que trackTenantCall() est appelé après chaque appel Claude',
        'Vérifier la connexion Supabase dans persistence.js',
        'Vérifier les logs serveur pour erreurs de persistence'
      ],
      timestamp: new Date().toISOString()
    };

    const reportPath = path.join(__dirname, '..', 'audit-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(emptyReport, null, 2));
    console.log(`\n✅ Rapport (vide) sauvegardé : ${reportPath}\n`);

    return emptyReport;
  }

  // 2. Analyser par tenant
  console.log('═══════════════════════════════════════════');
  console.log('📊 ANALYSE PAR TENANT');
  console.log('═══════════════════════════════════════════\n');

  const byTenant = {};
  let totalCost = 0;
  let totalCalls = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (const row of usageData) {
    const tenantId = row.tenant_id || 'unknown';
    const cost = parseFloat(row.cost || 0);
    const calls = row.calls || 0;
    const tokensIn = row.tokens_in || 0;
    const tokensOut = row.tokens_out || 0;

    if (!byTenant[tenantId]) {
      byTenant[tenantId] = {
        calls: 0,
        cost: 0,
        tokensIn: 0,
        tokensOut: 0,
        days: [],
      };
    }

    byTenant[tenantId].calls += calls;
    byTenant[tenantId].cost += cost;
    byTenant[tenantId].tokensIn += tokensIn;
    byTenant[tenantId].tokensOut += tokensOut;
    byTenant[tenantId].days.push({
      date: row.date,
      calls,
      cost,
      tokensIn,
      tokensOut,
    });

    totalCost += cost;
    totalCalls += calls;
    totalTokensIn += tokensIn;
    totalTokensOut += tokensOut;
  }

  // 3. Afficher résultats par tenant
  for (const [tenantId, data] of Object.entries(byTenant)) {
    const percentage = totalCost > 0 ? ((data.cost / totalCost) * 100).toFixed(1) : '0.0';
    const avgCostPerCall = data.calls > 0 ? (data.cost / data.calls).toFixed(4) : '0.0000';

    console.log(`🏢 TENANT : ${tenantId}`);
    console.log(`   Appels total : ${data.calls.toLocaleString()}`);
    console.log(`   Coût total : ${data.cost.toFixed(4)}€ (${percentage}% du total)`);
    console.log(`   Tokens IN : ${data.tokensIn.toLocaleString()}`);
    console.log(`   Tokens OUT : ${data.tokensOut.toLocaleString()}`);
    console.log(`   Coût moyen/appel : ${avgCostPerCall}€`);
    console.log(`   Jours actifs : ${data.days.length}\n`);

    // Top 3 jours les plus coûteux
    const topDays = [...data.days].sort((a, b) => b.cost - a.cost).slice(0, 3);
    if (topDays.length > 0) {
      console.log('   📅 Top 3 jours coûteux :');
      topDays.forEach((day, i) => {
        console.log(`      ${i + 1}. ${day.date}: ${day.cost.toFixed(4)}€ (${day.calls} appels)`);
      });
      console.log();
    }
  }

  // 4. Résumé global
  console.log('═══════════════════════════════════════════');
  console.log('💰 RÉSUMÉ GLOBAL');
  console.log('═══════════════════════════════════════════\n');

  console.log(`Total appels : ${totalCalls.toLocaleString()}`);
  console.log(`Total tokens IN : ${totalTokensIn.toLocaleString()}`);
  console.log(`Total tokens OUT : ${totalTokensOut.toLocaleString()}`);
  console.log(`Total tokens : ${(totalTokensIn + totalTokensOut).toLocaleString()}`);
  console.log(`\n💰 COÛT TOTAL : ${totalCost.toFixed(2)}€\n`);

  // 5. Vérification calcul théorique
  console.log('═══════════════════════════════════════════');
  console.log('🔬 VÉRIFICATION CALCUL');
  console.log('═══════════════════════════════════════════\n');

  // Supposons Sonnet (le plus cher) pour estimation haute
  const theoreticalCostSonnet =
    (totalTokensIn * PRICING.sonnet.input) +
    (totalTokensOut * PRICING.sonnet.output);

  // Supposons Haiku (le moins cher) pour estimation basse
  const theoreticalCostHaiku =
    (totalTokensIn * PRICING.haiku.input) +
    (totalTokensOut * PRICING.haiku.output);

  console.log(`Coût théorique (si tout Haiku) : ${theoreticalCostHaiku.toFixed(4)}€`);
  console.log(`Coût théorique (si tout Sonnet) : ${theoreticalCostSonnet.toFixed(4)}€`);
  console.log(`Coût enregistré : ${totalCost.toFixed(4)}€`);

  if (totalCost >= theoreticalCostHaiku && totalCost <= theoreticalCostSonnet) {
    console.log('✅ Coût cohérent avec le mix de modèles\n');
  } else if (totalCost > theoreticalCostSonnet * 1.1) {
    console.log('⚠️  Coût supérieur au maximum théorique - vérifier le calcul\n');
  } else if (totalCost < theoreticalCostHaiku * 0.9) {
    console.log('⚠️  Coût inférieur au minimum théorique - vérifier le calcul\n');
  }

  // 6. Analyse par jour
  console.log('═══════════════════════════════════════════');
  console.log('📅 ÉVOLUTION PAR JOUR');
  console.log('═══════════════════════════════════════════\n');

  const byDate = {};
  for (const row of usageData) {
    if (!byDate[row.date]) {
      byDate[row.date] = { calls: 0, cost: 0, tokensIn: 0, tokensOut: 0 };
    }
    byDate[row.date].calls += row.calls || 0;
    byDate[row.date].cost += parseFloat(row.cost || 0);
    byDate[row.date].tokensIn += row.tokens_in || 0;
    byDate[row.date].tokensOut += row.tokens_out || 0;
  }

  const sortedDates = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));

  console.log('Date       | Appels | Coût     | Tokens');
  console.log('-----------|--------|----------|--------');

  for (const [date, data] of sortedDates) {
    const costStr = data.cost.toFixed(4).padStart(8);
    const callsStr = data.calls.toString().padStart(6);
    const tokensStr = (data.tokensIn + data.tokensOut).toLocaleString().padStart(8);
    console.log(`${date} | ${callsStr} | ${costStr}€ | ${tokensStr}`);
  }

  // 7. Opportunités d'économie
  console.log('\n═══════════════════════════════════════════');
  console.log('💡 OPPORTUNITÉS D\'ÉCONOMIE');
  console.log('═══════════════════════════════════════════\n');

  const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;
  const avgTokensPerCall = totalCalls > 0 ? (totalTokensIn + totalTokensOut) / totalCalls : 0;

  console.log(`Coût moyen par appel : ${avgCostPerCall.toFixed(4)}€`);
  console.log(`Tokens moyens par appel : ${Math.round(avgTokensPerCall)}`);

  // Estimer économies avec Haiku
  const savingsWithHaiku = totalCost - theoreticalCostHaiku;
  console.log(`\n1. Basculer vers Haiku pour appels simples`);
  console.log(`   Économie max estimée : ${savingsWithHaiku.toFixed(2)}€`);
  console.log(`   Soit ${((savingsWithHaiku / totalCost) * 100).toFixed(1)}% d'économie`);

  // Cache pour FAQ répétitives
  const cacheEstimate = totalCost * 0.15;
  console.log(`\n2. Implémenter cache pour FAQ répétitives`);
  console.log(`   Économie estimée : ~${cacheEstimate.toFixed(2)}€ (15%)`);

  // Optimiser prompts
  const promptOptimization = totalCost * 0.10;
  console.log(`\n3. Optimiser longueur des prompts système`);
  console.log(`   Économie estimée : ~${promptOptimization.toFixed(2)}€ (10%)`);

  const totalSavings = savingsWithHaiku + cacheEstimate + promptOptimization;
  console.log(`\n💰 ÉCONOMIE TOTALE POTENTIELLE : ${totalSavings.toFixed(2)}€`);
  console.log(`   Soit ${((totalSavings / totalCost) * 100).toFixed(1)}% des coûts actuels\n`);

  // 8. Sauvegarder rapport
  const report = {
    period: {
      start: startDate,
      end: endDate,
    },
    summary: {
      totalCalls,
      totalTokensIn,
      totalTokensOut,
      totalCost: parseFloat(totalCost.toFixed(4)),
      avgCostPerCall: parseFloat(avgCostPerCall.toFixed(4)),
      avgTokensPerCall: Math.round(avgTokensPerCall),
    },
    byTenant: Object.fromEntries(
      Object.entries(byTenant).map(([tid, data]) => [
        tid,
        {
          calls: data.calls,
          cost: parseFloat(data.cost.toFixed(4)),
          tokensIn: data.tokensIn,
          tokensOut: data.tokensOut,
          percentage: parseFloat(((data.cost / totalCost) * 100).toFixed(1)),
          topDays: data.days.sort((a, b) => b.cost - a.cost).slice(0, 5),
        }
      ])
    ),
    byDate: sortedDates.map(([date, data]) => ({
      date,
      ...data,
      cost: parseFloat(data.cost.toFixed(4)),
    })),
    verification: {
      theoreticalCostHaiku: parseFloat(theoreticalCostHaiku.toFixed(4)),
      theoreticalCostSonnet: parseFloat(theoreticalCostSonnet.toFixed(4)),
      actualCost: parseFloat(totalCost.toFixed(4)),
      coherent: totalCost >= theoreticalCostHaiku * 0.9 && totalCost <= theoreticalCostSonnet * 1.1,
    },
    opportunities: {
      haikuSwitch: parseFloat(savingsWithHaiku.toFixed(2)),
      caching: parseFloat(cacheEstimate.toFixed(2)),
      promptOptimization: parseFloat(promptOptimization.toFixed(2)),
      total: parseFloat(totalSavings.toFixed(2)),
      percentage: parseFloat(((totalSavings / totalCost) * 100).toFixed(1)),
    },
    timestamp: new Date().toISOString(),
  };

  const reportPath = path.join(__dirname, '..', 'audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('═══════════════════════════════════════════');
  console.log(`✅ Rapport sauvegardé : ${reportPath}`);
  console.log('═══════════════════════════════════════════\n');

  return report;
}

// Exécuter
auditCosts()
  .then(report => {
    console.log('✅ Audit terminé avec succès');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erreur audit:', err);
    process.exit(1);
  });
