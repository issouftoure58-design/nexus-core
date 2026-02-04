/**
 * Prompt Optimizer - Reduction des tokens inutiles
 *
 * Analyse et optimise les prompts systeme pour reduire la consommation.
 * Objectif: -10% de tokens sans perte de qualite.
 */

class PromptOptimizer {
  constructor() {
    this.stats = {
      totalOriginal: 0,
      totalOptimized: 0,
      totalSaved: 0
    };

    // Compressions de phrases courantes
    this.compressions = [
      // Instructions redondantes
      [/Tu es un assistant IA intelligent et serviable/gi, 'Assistant IA'],
      [/Tu es une assistante IA/gi, 'Assistante IA'],
      [/Réponds de manière claire et concise/gi, 'Réponds clairement'],
      [/Réponds toujours de façon/gi, 'Réponds'],
      [/Si tu ne comprends pas la question/gi, 'Si incompris'],
      [/N'hésite pas à demander des précisions/gi, 'Demande précisions si besoin'],
      [/Il est important de noter que/gi, 'Note:'],
      [/Il est essentiel de/gi, 'Essentiel:'],
      [/Tu dois toujours/gi, 'Toujours'],
      [/Tu ne dois jamais/gi, 'Jamais'],
      [/S'il te plaît/gi, 'SVP'],
      [/Par exemple/gi, 'Ex:'],
      [/C'est-à-dire/gi, 'ie'],
      [/En d'autres termes/gi, 'Autrement dit'],
      [/Dans le cas où/gi, 'Si'],
      [/Afin de/gi, 'Pour'],
      [/Dans le but de/gi, 'Pour'],
      [/Il est nécessaire de/gi, 'Il faut'],
      [/Il est recommandé de/gi, 'Recommandé:'],
      [/Veuillez noter que/gi, 'Note:'],
      [/Gardez à l'esprit que/gi, 'Rappel:'],
      [/N'oubliez pas que/gi, 'Rappel:'],
      [/Il convient de mentionner que/gi, ''],
      [/Il va sans dire que/gi, ''],

      // Formules de politesse excessives
      [/Très cordialement,?/gi, ''],
      [/Bien cordialement,?/gi, ''],
      [/Avec plaisir,?/gi, ''],
      [/Je vous en prie,?/gi, ''],
    ];
  }

  /**
   * Optimise un prompt systeme
   */
  optimize(systemPrompt, context = {}) {
    if (!systemPrompt) return systemPrompt;

    const originalLength = systemPrompt.length;

    // 1. Supprimer repetitions
    let optimized = this.removeRepetitions(systemPrompt);

    // 2. Compresser instructions
    optimized = this.compressInstructions(optimized);

    // 3. Supprimer espaces excessifs
    optimized = this.cleanWhitespace(optimized);

    // 4. Si question simple, reduire contexte
    if (context.isSimple) {
      optimized = this.reduceContext(optimized);
    }

    // Stats
    this.stats.totalOriginal += originalLength;
    this.stats.totalOptimized += optimized.length;
    this.stats.totalSaved += (originalLength - optimized.length);

    return optimized;
  }

  /**
   * Supprime les lignes dupliquees
   */
  removeRepetitions(text) {
    const lines = text.split('\n');
    const seen = new Set();
    const unique = [];

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      // Garder lignes vides (structure)
      if (!trimmed) {
        unique.push(line);
        continue;
      }

      // Ignorer si deja vu (meme contenu)
      if (seen.has(trimmed)) {
        continue;
      }

      seen.add(trimmed);
      unique.push(line);
    }

    return unique.join('\n');
  }

  /**
   * Applique les compressions
   */
  compressInstructions(text) {
    let compressed = text;

    for (const [pattern, replacement] of this.compressions) {
      compressed = compressed.replace(pattern, replacement);
    }

    return compressed;
  }

  /**
   * Nettoie espaces excessifs
   */
  cleanWhitespace(text) {
    return text
      // Supprimer espaces multiples
      .replace(/  +/g, ' ')
      // Supprimer lignes vides multiples
      .replace(/\n\n\n+/g, '\n\n')
      // Supprimer espaces en debut/fin de ligne
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim();
  }

  /**
   * Reduit le contexte pour questions simples
   */
  reduceContext(text) {
    // Si le prompt contient une section contexte, la reduire
    const contextMarkers = ['---CONTEXT---', '## Contexte', '# Contexte', '### Informations'];

    for (const marker of contextMarkers) {
      const idx = text.indexOf(marker);
      if (idx !== -1) {
        const beforeContext = text.substring(0, idx + marker.length);
        const afterContext = text.substring(idx + marker.length);

        // Garder seulement 500 premiers caracteres du contexte
        const shortContext = afterContext.substring(0, 500);
        const truncated = shortContext.lastIndexOf('\n');

        return beforeContext + (truncated > 0 ? shortContext.substring(0, truncated) : shortContext) + '\n[contexte tronqué pour optimisation]';
      }
    }

    // Si prompt > 2000 chars et question simple, tronquer
    if (text.length > 2000) {
      return text.substring(0, 2000) + '\n[...]';
    }

    return text;
  }

  /**
   * Calcule la reduction de tokens
   */
  calculateSavings(original, optimized) {
    // Approximation: 1 token ≈ 4 caracteres en francais
    const originalTokens = Math.ceil(original.length / 4);
    const optimizedTokens = Math.ceil(optimized.length / 4);
    const saved = originalTokens - optimizedTokens;
    const percentage = originalTokens > 0 ? ((saved / originalTokens) * 100) : 0;

    return {
      originalTokens,
      optimizedTokens,
      saved,
      percentage: parseFloat(percentage.toFixed(1))
    };
  }

  /**
   * Stats globales
   */
  getStats() {
    const savedTokens = Math.ceil(this.stats.totalSaved / 4);
    const originalTokens = Math.ceil(this.stats.totalOriginal / 4);

    return {
      originalChars: this.stats.totalOriginal,
      optimizedChars: this.stats.totalOptimized,
      savedChars: this.stats.totalSaved,
      savedTokens,
      percentage: originalTokens > 0
        ? ((savedTokens / originalTokens) * 100).toFixed(1)
        : 0
    };
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = { totalOriginal: 0, totalOptimized: 0, totalSaved: 0 };
  }
}

// Singleton
const promptOptimizer = new PromptOptimizer();
export { promptOptimizer };
export default promptOptimizer;
