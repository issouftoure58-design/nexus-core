/**
 * Cost Tracker - Source de vérité unique pour les coûts
 *
 * Récupère les coûts depuis :
 * - sentinel_usage (Supabase) pour Anthropic
 * - twilio_call_logs (Supabase) pour Twilio (SMS + appels)
 * - ElevenLabs API quota pour ElevenLabs (caractères TTS)
 *
 * Utilisé par tous les onglets du dashboard pour garantir la cohérence.
 */

import { supabase } from '../config/supabase.js';

// Tarifs Twilio (France)
const TWILIO_PRICING = {
  sms_outbound: 0.0725,  // €/SMS sortant
  sms_inbound: 0.0075,   // €/SMS entrant
  voice_per_min: 0.015,   // €/minute d'appel
};

// Tarifs ElevenLabs
const ELEVENLABS_PRICING = {
  turbo: 0.00015,        // €/caractère (turbo_v2_5)
  multilingual: 0.00030, // €/caractère (multilingual_v2)
};

class CostTracker {
  constructor() {
    this.cache = {};
    this.cacheTimestamp = null;
    this.cacheTTL = 30000; // 30 secondes
    this.elevenLabsCache = null;
    this.elevenLabsCacheTs = null;
    this.twilioCostCache = {};
    this.twilioCostCacheTs = null;
  }

  /**
   * Récupère les coûts réels depuis sentinel_usage
   */
  async getRealCosts(options = {}) {
    const {
      tenantId = null,
      startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      endDate = new Date()
    } = options;

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Cache key
    const cacheKey = `${tenantId || 'all'}-${startDateStr}-${endDateStr}`;
    if (this.cache[cacheKey] && Date.now() - this.cacheTimestamp < this.cacheTTL) {
      return this.cache[cacheKey];
    }

    try {
      // Requête Supabase
      let query = supabase
        .from('sentinel_usage')
        .select('tenant_id, date, calls, tokens_in, tokens_out, cost')
        .gte('date', startDateStr)
        .lte('date', endDateStr);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[COST-TRACKER] Erreur Supabase:', error.message);
        throw error;
      }

      // Calculer les totaux
      const costs = {
        total: 0,
        byService: {
          anthropic: 0,
          twilio: 0,
          elevenlabs: 0
        },
        calls: 0,
        tokensIn: 0,
        tokensOut: 0,
        byTenant: {},
        byDate: []
      };

      const dateMap = {};

      for (const row of (data || [])) {
        const cost = parseFloat(row.cost || 0);
        const calls = row.calls || 0;
        const tokensIn = row.tokens_in || 0;
        const tokensOut = row.tokens_out || 0;

        // Total général
        costs.total += cost;
        costs.calls += calls;
        costs.tokensIn += tokensIn;
        costs.tokensOut += tokensOut;

        // Par tenant
        if (!costs.byTenant[row.tenant_id]) {
          costs.byTenant[row.tenant_id] = {
            cost: 0,
            calls: 0,
            tokensIn: 0,
            tokensOut: 0
          };
        }
        costs.byTenant[row.tenant_id].cost += cost;
        costs.byTenant[row.tenant_id].calls += calls;
        costs.byTenant[row.tenant_id].tokensIn += tokensIn;
        costs.byTenant[row.tenant_id].tokensOut += tokensOut;

        // Par date
        if (!dateMap[row.date]) {
          dateMap[row.date] = { date: row.date, cost: 0, calls: 0 };
        }
        dateMap[row.date].cost += cost;
        dateMap[row.date].calls += calls;

        // Claude = Anthropic
        costs.byService.anthropic += cost;
      }

      // Trier par date
      costs.byDate = Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));

      // Arrondir
      costs.total = parseFloat(costs.total.toFixed(4));
      costs.byService.anthropic = parseFloat(costs.byService.anthropic.toFixed(4));

      // Cache
      this.cache[cacheKey] = costs;
      this.cacheTimestamp = Date.now();

      return costs;
    } catch (error) {
      console.error('[COST-TRACKER] Erreur:', error.message);
      // Retourner des valeurs par défaut
      return {
        total: 0,
        byService: { anthropic: 0, twilio: 0, elevenlabs: 0 },
        calls: 0,
        tokensIn: 0,
        tokensOut: 0,
        byTenant: {},
        byDate: [],
        error: error.message
      };
    }
  }

  /**
   * Coûts du mois en cours
   */
  async getCurrentMonthCosts(tenantId = null) {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );

    return await this.getRealCosts({
      tenantId,
      startDate: startOfMonth,
      endDate: new Date()
    });
  }

  /**
   * Coûts d'aujourd'hui
   */
  async getTodayCosts(tenantId = null) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return await this.getRealCosts({
      tenantId,
      startDate: startOfDay,
      endDate: new Date()
    });
  }

  /**
   * Coûts d'hier
   */
  async getYesterdayCosts(tenantId = null) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    return await this.getRealCosts({
      tenantId,
      startDate: yesterday,
      endDate: endOfYesterday
    });
  }

  /**
   * Coûts Twilio calculés depuis twilio_call_logs
   */
  async getTwilioCosts(options = {}) {
    const {
      startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      endDate = new Date()
    } = options;

    const startDateStr = startDate.toISOString();
    const endDateStr = endDate.toISOString();

    // Cache
    const cacheKey = `twilio-${startDateStr}-${endDateStr}`;
    if (this.twilioCostCache[cacheKey] && Date.now() - this.twilioCostCacheTs < this.cacheTTL) {
      return this.twilioCostCache[cacheKey];
    }

    try {
      const { data, error } = await supabase
        .from('twilio_call_logs')
        .select('channel, direction, call_duration, created_at')
        .gte('created_at', startDateStr)
        .lte('created_at', endDateStr);

      if (error) throw error;

      let smsCost = 0;
      let voiceCost = 0;
      let smsCount = 0;
      let voiceCount = 0;
      let totalDuration = 0;

      for (const log of (data || [])) {
        if (log.channel === 'sms') {
          smsCount++;
          smsCost += log.direction === 'outbound'
            ? TWILIO_PRICING.sms_outbound
            : TWILIO_PRICING.sms_inbound;
        } else if (log.channel === 'voice') {
          voiceCount++;
          const durationMin = (log.call_duration || 0) / 60;
          totalDuration += log.call_duration || 0;
          voiceCost += durationMin * TWILIO_PRICING.voice_per_min;
        }
      }

      const total = parseFloat((smsCost + voiceCost).toFixed(4));
      const result = {
        total,
        sms: { count: smsCount, cost: parseFloat(smsCost.toFixed(4)) },
        voice: { count: voiceCount, cost: parseFloat(voiceCost.toFixed(4)), totalDurationSec: totalDuration },
      };

      this.twilioCostCache[cacheKey] = result;
      this.twilioCostCacheTs = Date.now();
      return result;
    } catch (error) {
      console.error('[COST-TRACKER] Erreur Twilio costs:', error.message);
      return { total: 0, sms: { count: 0, cost: 0 }, voice: { count: 0, cost: 0, totalDurationSec: 0 } };
    }
  }

  /**
   * Coûts ElevenLabs depuis l'API quota
   */
  async getElevenLabsCosts() {
    // Cache 60s pour les appels API ElevenLabs
    if (this.elevenLabsCache && Date.now() - this.elevenLabsCacheTs < 60000) {
      return this.elevenLabsCache;
    }

    try {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return { total: 0, characters: 0, limit: 0, percentUsed: 0 };
      }

      const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': apiKey }
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API ${response.status}`);
      }

      const data = await response.json();
      const charsUsed = data.character_count || 0;
      const charLimit = data.character_limit || 0;

      // Calcul coût : turbo par défaut
      const model = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';
      const pricePerChar = model.includes('multilingual') ? ELEVENLABS_PRICING.multilingual : ELEVENLABS_PRICING.turbo;
      const cost = parseFloat((charsUsed * pricePerChar).toFixed(4));

      const result = {
        total: cost,
        characters: charsUsed,
        limit: charLimit,
        remaining: charLimit - charsUsed,
        percentUsed: charLimit > 0 ? Math.round((charsUsed / charLimit) * 100) : 0,
        tier: data.tier || 'unknown',
      };

      this.elevenLabsCache = result;
      this.elevenLabsCacheTs = Date.now();
      return result;
    } catch (error) {
      console.error('[COST-TRACKER] Erreur ElevenLabs costs:', error.message);
      return { total: 0, characters: 0, limit: 0, percentUsed: 0 };
    }
  }

  /**
   * Coûts complets agrégés de tous les services
   */
  async getFullCostBreakdown(options = {}) {
    const [anthropicData, twilioData, elevenLabsData] = await Promise.all([
      this.getCurrentMonthCosts(options.tenantId || null),
      this.getTwilioCosts(options),
      this.getElevenLabsCosts(),
    ]);

    return {
      anthropic: anthropicData.byService?.anthropic || anthropicData.total || 0,
      twilio: twilioData.total,
      elevenlabs: elevenLabsData.total,
      total: parseFloat((
        (anthropicData.byService?.anthropic || anthropicData.total || 0) +
        twilioData.total +
        elevenLabsData.total
      ).toFixed(4)),
      details: {
        anthropic: { calls: anthropicData.calls, tokensIn: anthropicData.tokensIn, tokensOut: anthropicData.tokensOut },
        twilio: twilioData,
        elevenlabs: elevenLabsData,
      },
    };
  }

  /**
   * Coûts d'aujourd'hui pour tous les services
   */
  async getTodayFullCosts(tenantId = null) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    const [anthropicToday, twilioToday] = await Promise.all([
      this.getTodayCosts(tenantId),
      this.getTwilioCosts({ startDate: startOfDay, endDate: now }),
    ]);

    // ElevenLabs API donne le total du mois, pas du jour - on ne peut pas isoler aujourd'hui
    // On retourne 0 pour elevenlabs today (pas de granularité journalière via l'API)
    return {
      anthropic: anthropicToday.byService?.anthropic || anthropicToday.total || 0,
      twilio: twilioToday.total,
      elevenlabs: 0,
      total: parseFloat((
        (anthropicToday.byService?.anthropic || anthropicToday.total || 0) +
        twilioToday.total
      ).toFixed(4)),
    };
  }

  /**
   * Invalide le cache
   */
  invalidateCache() {
    this.cache = {};
    this.cacheTimestamp = null;
    this.elevenLabsCache = null;
    this.elevenLabsCacheTs = null;
    this.twilioCostCache = {};
    this.twilioCostCacheTs = null;
  }
}

// Singleton
const costTracker = new CostTracker();
export { costTracker };
export default costTracker;
