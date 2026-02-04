/**
 * Response Cache - Cache intelligent pour FAQ
 *
 * Met en cache les reponses aux questions frequentes.
 * Objectif: -15% d'appels API pour FAQ repetitives.
 */

class ResponseCache {
  constructor() {
    // Cache en memoire (Map pour LRU-like behavior)
    this.cache = new Map();
    this.maxSize = 200;
    this.ttl = 24 * 60 * 60 * 1000; // 24h

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };

    // Patterns FAQ cacheables
    this.faqPatterns = [
      /horaires?/i,
      /ouvert|ferm[eé]/i,
      /prix|tarif|co[uû]t/i,
      /adresse|o[uù].*se.*trouv/i,
      /t[eé]l[eé]phone|num[eé]ro|contact/i,
      /comment.*(venir|acc[eè]s|trouver)/i,
      /parking/i,
      /quels?.*(service|prestation|soin)/i,
      /proposez|faites|offrez/i,
      /c'est quoi/i,
      /qu'est-ce que/i
    ];

    // Patterns NON cacheables (donnees personnelles/dynamiques)
    this.nonCacheablePatterns = [
      /rendez-vous|rdv|r[eé]serv/i,
      /commander|acheter|panier/i,
      /mon compte|mes/i,
      /annuler|modifier/i,
      /paiement|payer/i,
      /disponible|cr[eé]neau/i
    ];
  }

  /**
   * Genere une cle de cache normalisee
   */
  generateKey(question, context = {}) {
    // Normaliser la question
    const normalized = question
      .toLowerCase()
      .trim()
      // Supprimer ponctuation
      .replace(/[?!.,;:'"()]/g, '')
      // Supprimer accents
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      // Espaces multiples -> simple
      .replace(/\s+/g, ' ')
      // Supprimer mots vides courts
      .replace(/\b(le|la|les|un|une|des|du|de|a|et|ou|je|tu|il|nous|vous|ils|est|sont|etes|suis)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Cle = tenant + question normalisee
    const tenantId = context.tenantId || 'global';
    return `${tenantId}:${normalized}`;
  }

  /**
   * Verifie si une question est cacheable
   */
  isCacheable(question, context = {}) {
    if (!question || question.length < 5) return false;

    const msgLower = question.toLowerCase();

    // Verifier patterns NON cacheables d'abord
    if (this.nonCacheablePatterns.some(p => p.test(question))) {
      return false;
    }

    // Verifier patterns FAQ cacheables
    if (this.faqPatterns.some(p => p.test(question))) {
      return true;
    }

    // Questions courtes (<80 chars) = probablement FAQ
    if (question.length < 80 && !context.hasPersonalData) {
      return true;
    }

    // Intent explicite
    if (context.intent === 'faq' || context.intent === 'info') {
      return true;
    }

    return false;
  }

  /**
   * Recupere reponse du cache
   */
  get(question, context = {}) {
    const key = this.generateKey(question, context);
    const cached = this.cache.get(key);

    if (!cached) {
      this.stats.misses++;
      return null;
    }

    // Verifier expiration
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Cache HIT
    cached.hits++;
    this.stats.hits++;

    console.log(`[CACHE] HIT: "${question.substring(0, 40)}..." (${cached.hits} hits)`);

    return {
      response: cached.response,
      fromCache: true,
      cacheHits: cached.hits,
      cachedAt: cached.timestamp
    };
  }

  /**
   * Met en cache une reponse
   */
  set(question, response, context = {}) {
    if (!this.isCacheable(question, context)) {
      return false;
    }

    const key = this.generateKey(question, context);

    // Eviction si cache plein (LRU-like: supprimer le plus ancien)
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hits: 0,
      question: question.substring(0, 100) // Pour debug
    });

    this.stats.sets++;
    console.log(`[CACHE] SET: "${question.substring(0, 40)}..."`);

    return true;
  }

  /**
   * Invalide une entree specifique
   */
  invalidate(question, context = {}) {
    const key = this.generateKey(question, context);
    return this.cache.delete(key);
  }

  /**
   * Invalide tout le cache d'un tenant
   */
  invalidateTenant(tenantId) {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Stats du cache
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100) : 0;

    // Calculer economie estimee (1 hit = ~0.02€ economise)
    const estimatedSavings = this.stats.hits * 0.02;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      evictions: this.stats.evictions,
      hitRate: hitRate.toFixed(1),
      estimatedSavings: estimatedSavings.toFixed(2)
    };
  }

  /**
   * Liste les entrees en cache (debug)
   */
  listEntries(limit = 20) {
    const entries = [];
    let count = 0;

    for (const [key, value] of this.cache.entries()) {
      if (count >= limit) break;
      entries.push({
        key: key.substring(0, 50),
        question: value.question,
        hits: value.hits,
        age: Math.round((Date.now() - value.timestamp) / 1000 / 60) + 'min'
      });
      count++;
    }

    return entries;
  }

  /**
   * Nettoie les entrées expirées du cache
   */
  cleanExpired() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[CACHE] ${cleaned} entrées expirées nettoyées`);
    }

    return cleaned;
  }

  /**
   * Clear complet du cache
   */
  clear() {
    this.cache.clear();
    console.log('[CACHE] Cleared');
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };
  }
}

// Singleton
const responseCache = new ResponseCache();
export { responseCache };
export default responseCache;
