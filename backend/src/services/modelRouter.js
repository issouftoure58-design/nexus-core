/**
 * Model Router - Selection intelligente Haiku/Sonnet
 *
 * Analyse la complexite de chaque requete et route vers le modele optimal.
 * Haiku = questions simples, FAQ, recherche (88% moins cher)
 * Sonnet = RDV, commandes, support complexe
 */

class ModelRouter {
  constructor() {
    this.stats = {
      haiku: 0,
      sonnet: 0,
      cached: 0,
      totalSaved: 0
    };

    // Seuil de complexité: score < threshold → Haiku
    this.thresholds = {
      simple: 3 // Score < 3 → Haiku, >= 3 → Sonnet
    };

    // Prix par 1M tokens (EUR)
    this.pricing = {
      haiku: { input: 0.25, output: 1.25 },
      sonnet: { input: 3, output: 15 }
    };
  }

  /**
   * Decide quel modele utiliser selon la complexite
   */
  selectModel(conversation) {
    const { userMessage, context = {} } = conversation;

    // Analyser la complexite
    const complexity = this.analyzeComplexity(userMessage, context);

    // Decision
    if (complexity.score < this.thresholds.simple) {
      this.stats.haiku++;
      return {
        model: 'claude-3-haiku-20240307',
        reason: complexity.reasons.join(', '),
        expectedCost: 'low',
        complexity: complexity.score
      };
    }

    this.stats.sonnet++;
    return {
      model: 'claude-sonnet-4-20250514',
      reason: complexity.reasons.length > 0 ? complexity.reasons.join(', ') : 'Complex query requires Sonnet',
      expectedCost: 'high',
      complexity: complexity.score
    };
  }

  /**
   * Analyse la complexite de la requete
   */
  analyzeComplexity(message, context) {
    const reasons = [];
    let score = 0;

    if (!message) {
      return { score: 1, reasons: ['Empty message'] };
    }

    const msgLower = message.toLowerCase();

    // 1. Salutations simples (Haiku) - score 1
    const greetingPatterns = [
      /^(bonjour|salut|hello|hi|hey|coucou|bonsoir)/i,
      /^(merci|ok|d'accord|parfait|super|genial)/i,
      /^(oui|non|ouais|nope)/i
    ];

    if (greetingPatterns.some(p => p.test(message.trim()))) {
      reasons.push('Salutation/confirmation simple');
      return { score: 1, reasons };
    }

    // 2. Questions FAQ courtes (Haiku) - score 2
    const faqPatterns = [
      /horaires?/i,
      /ouvert|ferm[eé]/i,
      /(quel|quels?).*(prix|tarif|co[uû]t)/i,
      /combien.*co[uû]te/i,
      /adresse|o[uù].*trouv/i,
      /t[eé]l[eé]phone|num[eé]ro|contact/i,
      /comment.*venir/i,
      /parking/i
    ];

    if (faqPatterns.some(p => p.test(message)) && message.length < 100) {
      reasons.push('Question FAQ');
      return { score: 2, reasons };
    }

    // 3. Recherche simple (Haiku) - score 2
    if (context.intent === 'search' ||
        /cherche|trouve|recherche|liste/i.test(msgLower)) {
      if (message.length < 150) {
        reasons.push('Recherche simple');
        return { score: 2, reasons };
      }
    }

    // 4. Demande de services/prestations (Haiku) - score 2
    if (/quels?.*(service|prestation|soin)/i.test(message) ||
        /proposez|faites|offrez/i.test(message)) {
      reasons.push('Demande liste services');
      return { score: 2, reasons };
    }

    // 5. Prise de RDV (Sonnet) - score 5
    if (context.intent === 'booking' ||
        /rendez-vous|rdv|r[eé]serv/i.test(msgLower) ||
        /disponible|cr[eé]neau|slot/i.test(msgLower)) {
      reasons.push('Prise de RDV - logique complexe');
      score = 5;
    }

    // 6. Commande (Sonnet) - score 5
    if (context.intent === 'order' ||
        /commander|acheter|panier|paiement/i.test(msgLower)) {
      reasons.push('Commande - precision requise');
      score = 5;
    }

    // 7. Support/probleme (Sonnet) - score 4
    if (/probl[eè]me|bug|erreur|marche pas|fonctionne pas/i.test(msgLower) ||
        /aide|help|besoin/i.test(msgLower)) {
      reasons.push('Support - analyse complexe');
      score = Math.max(score, 4);
    }

    // 8. Message long (Sonnet) - score 4
    if (message.length > 300) {
      reasons.push('Message long - contexte riche');
      score = Math.max(score, 4);
    }

    // 9. Conversation longue (Sonnet) - score 4
    if (context.conversationLength > 5) {
      reasons.push('Conversation longue - contexte important');
      score = Math.max(score, 4);
    }

    // 10. Questions complexes multi-parties (Sonnet) - score 4
    if ((message.match(/\?/g) || []).length > 1 ||
        /et aussi|en plus|egalement/i.test(msgLower)) {
      reasons.push('Question multi-parties');
      score = Math.max(score, 4);
    }

    return {
      score: score || 3, // Par defaut moyen
      reasons: reasons.length > 0 ? reasons : ['Complexite moyenne']
    };
  }

  /**
   * Calcule economie estimee
   */
  calculateSavings(tokensIn, tokensOut) {
    const sonnetCost = (tokensIn * this.pricing.sonnet.input / 1_000_000) +
                       (tokensOut * this.pricing.sonnet.output / 1_000_000);
    const haikuCost = (tokensIn * this.pricing.haiku.input / 1_000_000) +
                      (tokensOut * this.pricing.haiku.output / 1_000_000);

    return {
      sonnetCost,
      haikuCost,
      saved: sonnetCost - haikuCost,
      percentage: ((sonnetCost - haikuCost) / sonnetCost * 100).toFixed(1)
    };
  }

  /**
   * Ajuste les seuils de routage
   * @param {number} adjustment - Valeur d'ajustement (ex: +0.5 = plus de Haiku)
   */
  adjustThresholds(adjustment) {
    const oldSimple = this.thresholds.simple;

    // Augmenter seuil = plus de conversations vers Haiku
    this.thresholds.simple = Math.max(1, Math.min(6, this.thresholds.simple + adjustment));

    console.log(`[ROUTER] Seuil ajusté: simple ${oldSimple} → ${this.thresholds.simple}`);

    return {
      adjusted: true,
      oldThresholds: { simple: oldSimple },
      newThresholds: { simple: this.thresholds.simple },
      expectedIncrease: Math.round(adjustment * 10)
    };
  }

  /**
   * Stats du routing
   */
  getStats() {
    const total = this.stats.haiku + this.stats.sonnet;
    return {
      haiku: this.stats.haiku,
      sonnet: this.stats.sonnet,
      cached: this.stats.cached,
      total,
      haikuPercentage: total > 0 ? ((this.stats.haiku / total) * 100).toFixed(1) : 0,
      estimatedSavings: this.stats.totalSaved.toFixed(4)
    };
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = { haiku: 0, sonnet: 0, cached: 0, totalSaved: 0 };
  }
}

// Singleton
const modelRouter = new ModelRouter();
export { modelRouter };
export default modelRouter;
