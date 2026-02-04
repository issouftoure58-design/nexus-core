/**
 * Intelligent Analyzer - Analyse contextuelle des métriques
 *
 * Fournit :
 * - Benchmarks industrie
 * - Comparaisons historiques
 * - Opportunités détectées
 * - Actions recommandées
 */

import costTracker from './costTracker.js';
import liveEventStream from './liveEventStream.js';
import modelRouter from './modelRouter.js';
import responseCache from './responseCache.js';
import promptOptimizer from './promptOptimizer.js';

class IntelligentAnalyzer {
  constructor() {
    // Benchmarks industrie (moyennes du marché)
    this.benchmarks = {
      costPerCall: {
        haiku: 0.0003,      // ~0.03 centimes
        sonnet: 0.02,       // ~2 centimes
        industry: 0.015     // Moyenne industrie
      },
      tokensPerCall: {
        optimal: 1000,
        acceptable: 2000,
        high: 5000,
        critical: 8000
      },
      cacheHitRate: {
        excellent: 50,
        good: 30,
        acceptable: 15,
        poor: 5
      },
      modelDistribution: {
        optimal: { haiku: 70, sonnet: 30 },
        acceptable: { haiku: 50, sonnet: 50 }
      },
      responseTime: {
        excellent: 1000,    // <1s
        good: 3000,         // <3s
        acceptable: 5000,   // <5s
        slow: 10000         // >10s
      }
    };
  }

  /**
   * Analyse complète des coûts et performances
   */
  async analyzeCosts(tenantId = null) {
    try {
      // Récupérer données de multiples sources
      const [currentMonth, today] = await Promise.all([
        costTracker.getCurrentMonthCosts(tenantId),
        costTracker.getTodayCosts(tenantId)
      ]);

      // Événements récents
      const events = liveEventStream.getRecent(1000);

      // Stats des services d'optimisation
      const routerStats = modelRouter.getStats();
      const cacheStats = responseCache.getStats();
      const promptStats = promptOptimizer.getStats();

      // Calculer métriques
      const metrics = this.calculateMetrics(currentMonth, today, events, {
        router: routerStats,
        cache: cacheStats,
        prompt: promptStats
      });

      // Analyser tendances
      const trends = this.analyzeTrends(events);

      // Identifier opportunités
      const opportunities = this.identifyOpportunities(metrics, trends);

      // Générer insights
      const insights = this.generateInsights(metrics, trends, opportunities);

      return {
        metrics,
        trends,
        opportunities,
        insights,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[ANALYZER] Error:', error);
      throw error;
    }
  }

  /**
   * Calcule métriques détaillées
   */
  calculateMetrics(month, today, events, optimizationStats) {
    // Statistiques des appels par modèle
    const conversations = events.filter(e => e.type === 'conversation');
    const haikuCalls = conversations.filter(e =>
      e.model?.toLowerCase().includes('haiku')
    ).length;
    const sonnetCalls = conversations.filter(e =>
      e.model?.toLowerCase().includes('sonnet')
    ).length;
    const totalCalls = Math.max(haikuCalls + sonnetCalls, 1);

    // Utiliser les stats du router si disponibles
    const routerHaiku = optimizationStats.router?.haiku || haikuCalls;
    const routerSonnet = optimizationStats.router?.sonnet || sonnetCalls;
    const routerTotal = routerHaiku + routerSonnet || 1;

    // Cache stats
    const cacheHits = optimizationStats.cache?.hits ||
      events.filter(e => e.type === 'cache' && e.action?.includes('HIT')).length;
    const cacheMisses = optimizationStats.cache?.misses ||
      events.filter(e => e.type === 'cache' && e.action?.includes('SET')).length;
    const cacheTotal = cacheHits + cacheMisses || 1;
    const cacheHitRate = ((cacheHits / cacheTotal) * 100);

    // Coûts
    const monthTotal = month?.total || 0;
    const monthCalls = month?.calls || 1;
    const avgCostPerCall = monthTotal / monthCalls;

    // Tokens
    const monthTokensIn = month?.tokensIn || 0;
    const monthTokensOut = month?.tokensOut || 0;
    const avgTokensPerCall = Math.round((monthTokensIn + monthTokensOut) / monthCalls);

    // Économies calculées
    const costsSaved = events
      .filter(e => e.type === 'cost' && e.saving)
      .reduce((sum, e) => sum + parseFloat(e.saving || 0), 0);

    const tokensSaved = optimizationStats.prompt?.savedTokens || 0;

    // Temps de réponse moyen
    const responseTimes = conversations
      .filter(e => e.responseTime)
      .map(e => parseInt(e.responseTime));
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

    return {
      calls: {
        total: monthCalls,
        today: today?.calls || 0,
        haiku: routerHaiku,
        sonnet: routerSonnet,
        distribution: {
          haiku: ((routerHaiku / routerTotal) * 100).toFixed(1),
          sonnet: ((routerSonnet / routerTotal) * 100).toFixed(1)
        }
      },
      costs: {
        total: monthTotal,
        today: today?.total || 0,
        avgPerCall: avgCostPerCall.toFixed(4),
        saved: costsSaved.toFixed(4)
      },
      tokens: {
        total: monthTokensIn + monthTokensOut,
        input: monthTokensIn,
        output: monthTokensOut,
        avgPerCall: avgTokensPerCall,
        saved: tokensSaved
      },
      cache: {
        hits: cacheHits,
        misses: cacheMisses,
        size: optimizationStats.cache?.size || 0,
        hitRate: cacheHitRate.toFixed(1)
      },
      performance: {
        avgResponseTime,
        rating: this.rateResponseTime(avgResponseTime)
      }
    };
  }

  /**
   * Note le temps de réponse
   */
  rateResponseTime(ms) {
    if (ms < this.benchmarks.responseTime.excellent) return 'excellent';
    if (ms < this.benchmarks.responseTime.good) return 'good';
    if (ms < this.benchmarks.responseTime.acceptable) return 'acceptable';
    return 'slow';
  }

  /**
   * Analyse les tendances
   */
  analyzeTrends(events) {
    const now = Date.now();

    // Filtrer par période
    const last24h = events.filter(e =>
      now - new Date(e.timestamp).getTime() < 24 * 60 * 60 * 1000
    );
    const lastHour = events.filter(e =>
      now - new Date(e.timestamp).getTime() < 60 * 60 * 1000
    );
    const last5min = events.filter(e =>
      now - new Date(e.timestamp).getTime() < 5 * 60 * 1000
    );

    // Conversations par période
    const convLast24h = last24h.filter(e => e.type === 'conversation').length;
    const convLastHour = lastHour.filter(e => e.type === 'conversation').length;
    const convLast5min = last5min.filter(e => e.type === 'conversation').length;
    const avgPerHour = convLast24h / 24;

    // Déterminer tendance
    let activityTrend = 'stable';
    if (convLastHour > avgPerHour * 1.5) activityTrend = 'increasing';
    else if (convLastHour < avgPerHour * 0.5) activityTrend = 'decreasing';

    // Cache trend
    const cacheHitsLast24h = last24h.filter(e =>
      e.type === 'cache' && e.action?.includes('HIT')
    ).length;
    const cacheSetsLast24h = last24h.filter(e =>
      e.type === 'cache' && e.action?.includes('SET')
    ).length;
    const cacheTrend = cacheHitsLast24h > cacheSetsLast24h ? 'improving' : 'stable';

    // Erreurs
    const errorsLast24h = last24h.filter(e => e.type === 'error').length;

    return {
      activity: {
        last24h: convLast24h,
        lastHour: convLastHour,
        last5min: convLast5min,
        perHour: avgPerHour.toFixed(1),
        trend: activityTrend
      },
      cache: {
        trend: cacheTrend,
        hitsLast24h: cacheHitsLast24h,
        setsLast24h: cacheSetsLast24h
      },
      errors: {
        last24h: errorsLast24h,
        status: errorsLast24h === 0 ? 'healthy' : errorsLast24h < 5 ? 'warning' : 'critical'
      }
    };
  }

  /**
   * Identifie les opportunités d'optimisation
   */
  identifyOpportunities(metrics, trends) {
    const opportunities = [];

    // 1. Optimisation distribution modèle
    const haikuPercentage = parseFloat(metrics.calls.distribution.haiku);
    if (haikuPercentage < this.benchmarks.modelDistribution.optimal.haiku) {
      const potentialIncrease = this.benchmarks.modelDistribution.optimal.haiku - haikuPercentage;
      const potentialSaving = (metrics.costs.total * (potentialIncrease / 100) * 0.88);

      opportunities.push({
        priority: 'HIGH',
        category: 'cost',
        title: 'Augmenter usage Haiku',
        description: `Actuellement ${haikuPercentage}% Haiku. L'optimal industrie est 70%.`,
        action: 'Ajuster les règles du Model Router pour router plus de conversations simples vers Haiku',
        saving: potentialSaving.toFixed(2),
        effort: 'Low',
        impact: 'High'
      });
    }

    // 2. Amélioration cache
    const cacheHitRate = parseFloat(metrics.cache.hitRate);
    if (cacheHitRate < this.benchmarks.cacheHitRate.good) {
      const potentialSaving = metrics.costs.total * 0.15;

      opportunities.push({
        priority: 'MEDIUM',
        category: 'performance',
        title: 'Améliorer taux de cache',
        description: `Hit rate actuel: ${cacheHitRate}%. Objectif: 30%+.`,
        action: 'Identifier et pré-cacher les 10 questions les plus fréquentes (horaires, services, prix)',
        saving: potentialSaving.toFixed(2),
        effort: 'Low',
        impact: 'Medium'
      });
    }

    // 3. Réduction tokens
    if (metrics.tokens.avgPerCall > this.benchmarks.tokensPerCall.acceptable) {
      const excessTokens = metrics.tokens.avgPerCall - this.benchmarks.tokensPerCall.acceptable;
      const potentialSaving = metrics.costs.total * 0.10;

      opportunities.push({
        priority: 'MEDIUM',
        category: 'optimization',
        title: 'Réduire tokens par appel',
        description: `Moyenne: ${metrics.tokens.avgPerCall} tokens/appel. Optimal: <2000.`,
        action: 'Optimiser les prompts système et réduire le contexte business envoyé',
        saving: potentialSaving.toFixed(2),
        effort: 'Medium',
        impact: 'Medium'
      });
    }

    // 4. Activité croissante (info)
    if (trends.activity.trend === 'increasing') {
      opportunities.push({
        priority: 'INFO',
        category: 'growth',
        title: 'Activité en hausse',
        description: `${trends.activity.lastHour} conversations cette heure vs ${trends.activity.perHour}/h en moyenne.`,
        action: 'Surveiller les quotas API et les performances du cache',
        saving: null,
        effort: 'Low',
        impact: 'Low'
      });
    }

    // 5. Erreurs détectées
    if (trends.errors.status !== 'healthy') {
      opportunities.push({
        priority: trends.errors.status === 'critical' ? 'HIGH' : 'MEDIUM',
        category: 'reliability',
        title: 'Erreurs détectées',
        description: `${trends.errors.last24h} erreurs dans les dernières 24h.`,
        action: 'Analyser les logs d\'erreurs et implémenter des retry automatiques',
        saving: null,
        effort: 'Medium',
        impact: 'High'
      });
    }

    // 6. Cache excellent (positive)
    if (cacheHitRate >= this.benchmarks.cacheHitRate.excellent) {
      opportunities.push({
        priority: 'INFO',
        category: 'success',
        title: 'Cache performant',
        description: `Excellent hit rate de ${cacheHitRate}% !`,
        action: 'Maintenir les patterns actuels de caching',
        saving: null,
        effort: 'None',
        impact: 'High'
      });
    }

    // Trier par priorité
    const priorityOrder = { HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
    return opportunities.sort((a, b) =>
      priorityOrder[b.priority] - priorityOrder[a.priority]
    );
  }

  /**
   * Génère des insights intelligents
   */
  generateInsights(metrics, trends, opportunities) {
    const insights = [];

    // 1. Score de performance global
    const performanceScore = this.calculatePerformanceScore(metrics);
    insights.push({
      type: 'performance',
      title: 'Score Performance',
      value: performanceScore,
      interpretation: this.interpretPerformanceScore(performanceScore),
      color: performanceScore >= 80 ? 'green' : performanceScore >= 60 ? 'yellow' : 'red'
    });

    // 2. Efficacité coûts
    const costEfficiency = this.calculateCostEfficiency(metrics);
    insights.push({
      type: 'efficiency',
      title: 'Efficacité Coûts',
      value: costEfficiency,
      interpretation: `${costEfficiency}% par rapport au coût optimal (tout Haiku)`,
      color: costEfficiency >= 80 ? 'green' : costEfficiency >= 60 ? 'yellow' : 'red'
    });

    // 3. Tendance activité
    const trendIcon = trends.activity.trend === 'increasing' ? '📈' :
                      trends.activity.trend === 'decreasing' ? '📉' : '➡️';
    insights.push({
      type: 'trend',
      title: 'Tendance Activité',
      value: trends.activity.trend,
      interpretation: trends.activity.trend === 'increasing'
        ? `${trendIcon} Activité en hausse - ${trends.activity.lastHour} conv/h`
        : trends.activity.trend === 'decreasing'
        ? `${trendIcon} Activité en baisse`
        : `${trendIcon} Activité stable - ${trends.activity.perHour} conv/h`,
      color: trends.activity.trend === 'increasing' ? 'blue' : 'gray'
    });

    // 4. Économies potentielles
    const totalSavings = opportunities
      .filter(o => o.saving)
      .reduce((sum, o) => sum + parseFloat(o.saving), 0);

    if (totalSavings > 0) {
      insights.push({
        type: 'opportunity',
        title: 'Économies Possibles',
        value: totalSavings.toFixed(2),
        interpretation: `${opportunities.filter(o => o.saving).length} opportunités identifiées`,
        color: 'green'
      });
    }

    // 5. Santé système
    insights.push({
      type: 'health',
      title: 'Santé Système',
      value: trends.errors.status,
      interpretation: trends.errors.status === 'healthy'
        ? 'Aucune erreur détectée'
        : `${trends.errors.last24h} erreurs en 24h`,
      color: trends.errors.status === 'healthy' ? 'green' :
             trends.errors.status === 'warning' ? 'yellow' : 'red'
    });

    return insights;
  }

  /**
   * Calcule score de performance (0-100)
   */
  calculatePerformanceScore(metrics) {
    let score = 100;

    // Pénalité distribution modèle
    const haikuPct = parseFloat(metrics.calls.distribution.haiku);
    if (haikuPct < 70) {
      score -= Math.min(25, (70 - haikuPct) * 0.5);
    }

    // Pénalité cache
    const cacheRate = parseFloat(metrics.cache.hitRate);
    if (cacheRate < 30) {
      score -= Math.min(20, (30 - cacheRate) * 0.4);
    }

    // Pénalité tokens
    if (metrics.tokens.avgPerCall > 2000) {
      score -= Math.min(20, (metrics.tokens.avgPerCall - 2000) / 150);
    }

    // Bonus cache excellent
    if (cacheRate >= 50) {
      score += 5;
    }

    // Bonus Haiku optimal
    if (haikuPct >= 70) {
      score += 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Interprète le score de performance
   */
  interpretPerformanceScore(score) {
    if (score >= 90) return 'Excellent - Optimisations maximales atteintes';
    if (score >= 80) return 'Très bien - Quelques améliorations possibles';
    if (score >= 70) return 'Bien - Optimisations en cours d\'application';
    if (score >= 60) return 'Acceptable - Optimisations recommandées';
    if (score >= 40) return 'À améliorer - Actions prioritaires nécessaires';
    return 'Critique - Optimisations urgentes requises';
  }

  /**
   * Calcule l'efficacité coûts (%)
   */
  calculateCostEfficiency(metrics) {
    if (metrics.costs.total <= 0) return 100;

    // Coût optimal = tout en Haiku avec cache parfait
    const optimalCostPerCall = this.benchmarks.costPerCall.haiku;
    const actualCostPerCall = parseFloat(metrics.costs.avgPerCall);

    if (actualCostPerCall <= 0) return 100;

    // Efficacité = (optimal / actuel) * 100, plafonné à 100
    const efficiency = (optimalCostPerCall / actualCostPerCall) * 100;
    return Math.min(100, Math.round(efficiency));
  }

  /**
   * Obtient un résumé rapide pour le dashboard
   */
  async getQuickSummary(tenantId = null) {
    const analysis = await this.analyzeCosts(tenantId);

    return {
      score: analysis.insights.find(i => i.type === 'performance')?.value || 0,
      trend: analysis.trends.activity.trend,
      opportunities: analysis.opportunities.filter(o => o.priority === 'HIGH').length,
      savings: analysis.opportunities
        .filter(o => o.saving)
        .reduce((sum, o) => sum + parseFloat(o.saving), 0)
        .toFixed(2)
    };
  }
}

// Singleton
const intelligentAnalyzer = new IntelligentAnalyzer();
export { intelligentAnalyzer };
export default intelligentAnalyzer;
