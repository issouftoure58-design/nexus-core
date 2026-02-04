/**
 * Live Event Stream - Flux d'événements temps réel
 *
 * Capture et diffuse tous les événements NEXUS en temps réel :
 * - Conversations IA
 * - Optimisations (cache, routing, prompts)
 * - Coûts et économies
 * - Sécurité
 */

class LiveEventStream {
  constructor() {
    this.events = [];
    this.maxEvents = 100;
    this.listeners = new Set();

    // Stats agrégées
    this.sessionStats = {
      totalConversations: 0,
      totalCacheHits: 0,
      totalSavings: 0,
      haikuCalls: 0,
      sonnetCalls: 0,
      startTime: Date.now()
    };
  }

  /**
   * Ajoute un événement au flux
   */
  addEvent(event) {
    const enrichedEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    // Ajouter au début (plus récent d'abord)
    this.events.unshift(enrichedEvent);

    // Limiter taille
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    // Notifier listeners (SSE)
    this.notifyListeners(enrichedEvent);

    // Log console pour debug
    console.log(`[PULSE] ${event.icon || '📡'} ${event.type}: ${event.action}`);

    return enrichedEvent;
  }

  // ═══════════════════════════════════════════════════════
  // TYPES D'ÉVÉNEMENTS
  // ═══════════════════════════════════════════════════════

  /**
   * Événement conversation IA
   */
  conversation(data) {
    this.sessionStats.totalConversations++;
    return this.addEvent({
      type: 'conversation',
      category: 'ai',
      icon: '💬',
      ...data
    });
  }

  /**
   * Événement optimisation (routing, prompts)
   */
  optimization(data) {
    if (data.model?.includes('haiku')) {
      this.sessionStats.haikuCalls++;
    } else if (data.model?.includes('sonnet')) {
      this.sessionStats.sonnetCalls++;
    }
    return this.addEvent({
      type: 'optimization',
      category: 'system',
      icon: '⚡',
      ...data
    });
  }

  /**
   * Événement cache (hit/set)
   */
  cache(data) {
    if (data.action === 'Cache HIT') {
      this.sessionStats.totalCacheHits++;
    }
    return this.addEvent({
      type: 'cache',
      category: 'performance',
      icon: '💾',
      ...data
    });
  }

  /**
   * Événement sécurité
   */
  security(data) {
    return this.addEvent({
      type: 'security',
      category: 'security',
      icon: '🛡️',
      ...data
    });
  }

  /**
   * Événement erreur
   */
  error(data) {
    return this.addEvent({
      type: 'error',
      category: 'error',
      icon: '⚠️',
      ...data
    });
  }

  /**
   * Événement coût/économie
   */
  cost(data) {
    if (data.saving) {
      this.sessionStats.totalSavings += parseFloat(data.saving) || 0;
    }
    return this.addEvent({
      type: 'cost',
      category: 'financial',
      icon: '💰',
      ...data
    });
  }

  /**
   * Événement système général
   */
  system(data) {
    return this.addEvent({
      type: 'system',
      category: 'system',
      icon: '🔧',
      ...data
    });
  }

  // ═══════════════════════════════════════════════════════
  // REQUÊTES
  // ═══════════════════════════════════════════════════════

  /**
   * Récupère les événements récents
   */
  getRecent(limit = 20) {
    return this.events.slice(0, limit);
  }

  /**
   * Filtre par type
   */
  getByType(type, limit = 20) {
    return this.events
      .filter(e => e.type === type)
      .slice(0, limit);
  }

  /**
   * Filtre par catégorie
   */
  getByCategory(category, limit = 20) {
    return this.events
      .filter(e => e.category === category)
      .slice(0, limit);
  }

  /**
   * Stats en temps réel
   */
  getStats() {
    const now = Date.now();
    const last5min = this.events.filter(e =>
      now - new Date(e.timestamp).getTime() < 5 * 60 * 1000
    );
    const last1min = this.events.filter(e =>
      now - new Date(e.timestamp).getTime() < 60 * 1000
    );

    const byType = {};
    last5min.forEach(e => {
      byType[e.type] = (byType[e.type] || 0) + 1;
    });

    const uptimeMinutes = Math.floor((now - this.sessionStats.startTime) / 60000);

    return {
      total: this.events.length,
      last5min: last5min.length,
      last1min: last1min.length,
      byType,
      latestTimestamp: this.events[0]?.timestamp,
      session: {
        ...this.sessionStats,
        uptimeMinutes,
        haikuPercentage: this.sessionStats.haikuCalls + this.sessionStats.sonnetCalls > 0
          ? ((this.sessionStats.haikuCalls / (this.sessionStats.haikuCalls + this.sessionStats.sonnetCalls)) * 100).toFixed(1)
          : 0
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  // PUB/SUB POUR SSE
  // ═══════════════════════════════════════════════════════

  /**
   * S'abonner aux événements (pour SSE)
   */
  subscribe(listener) {
    this.listeners.add(listener);
    console.log(`[PULSE] New subscriber (${this.listeners.size} total)`);
    return () => {
      this.listeners.delete(listener);
      console.log(`[PULSE] Subscriber left (${this.listeners.size} remaining)`);
    };
  }

  /**
   * Notifie tous les listeners
   */
  notifyListeners(event) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error('[PULSE] Listener error:', err);
      }
    });
  }

  /**
   * Nombre de listeners actifs
   */
  getListenerCount() {
    return this.listeners.size;
  }

  // ═══════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════

  /**
   * Vide les événements
   */
  clear() {
    this.events = [];
    console.log('[PULSE] Events cleared');
  }

  /**
   * Reset les stats de session
   */
  resetStats() {
    this.sessionStats = {
      totalConversations: 0,
      totalCacheHits: 0,
      totalSavings: 0,
      haikuCalls: 0,
      sonnetCalls: 0,
      startTime: Date.now()
    };
    console.log('[PULSE] Stats reset');
  }
}

// Singleton
const liveEventStream = new LiveEventStream();

export { liveEventStream };
export default liveEventStream;
