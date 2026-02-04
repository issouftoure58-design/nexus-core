/**
 * SENTINEL - Cost Monitor
 *
 * Surveille: Couts Claude/ElevenLabs/Twilio/Stripe
 * Seuils: warning 30 EUR, critical 50 EUR, shutdown 100 EUR
 */

import { THRESHOLDS } from '../config/thresholds.js';

class CostMonitor {
  constructor() {
    this.costs = {
      daily: {},
      monthly: {}
    };
    this.currentDate = new Date().toISOString().split('T')[0];
    this.currentMonth = this.currentDate.substring(0, 7);
  }

  // Pricing constants (approximate)
  static PRICING = {
    claude: {
      inputPer1k: 0.003,    // $3 per 1M input tokens
      outputPer1k: 0.015    // $15 per 1M output tokens
    },
    elevenlabs: {
      perCharacter: 0.00003  // ~$30 per 1M characters
    },
    twilio: {
      smsOutbound: 0.05,     // ~$0.05 per SMS
      smsInbound: 0.01,
      voicePerMinute: 0.02
    },
    stripe: {
      percentage: 0.029,     // 2.9%
      fixed: 0.30            // + $0.30
    },
    googleMaps: {
      perRequest: 0.005      // ~$5 per 1000 requests
    }
  };

  resetIfNewDay() {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.currentDate) {
      this.costs.daily = {};
      this.currentDate = today;
    }

    const month = today.substring(0, 7);
    if (month !== this.currentMonth) {
      this.costs.monthly = {};
      this.currentMonth = month;
    }
  }

  trackCost(service, amount, details = {}) {
    this.resetIfNewDay();

    if (!this.costs.daily[service]) {
      this.costs.daily[service] = { total: 0, calls: 0, details: [] };
    }
    if (!this.costs.monthly[service]) {
      this.costs.monthly[service] = { total: 0, calls: 0 };
    }

    this.costs.daily[service].total += amount;
    this.costs.daily[service].calls += 1;
    this.costs.daily[service].details.push({
      amount,
      timestamp: new Date().toISOString(),
      ...details
    });

    this.costs.monthly[service].total += amount;
    this.costs.monthly[service].calls += 1;

    // Keep only last 100 details per service
    if (this.costs.daily[service].details.length > 100) {
      this.costs.daily[service].details.shift();
    }

    return this.getTodayCosts();
  }

  trackClaudeUsage(inputTokens, outputTokens) {
    const cost =
      (inputTokens / 1000) * CostMonitor.PRICING.claude.inputPer1k +
      (outputTokens / 1000) * CostMonitor.PRICING.claude.outputPer1k;

    return this.trackCost('claude', cost, { inputTokens, outputTokens });
  }

  trackTwilioSMS(direction = 'outbound') {
    const cost = direction === 'outbound'
      ? CostMonitor.PRICING.twilio.smsOutbound
      : CostMonitor.PRICING.twilio.smsInbound;

    return this.trackCost('twilio_sms', cost, { direction });
  }

  trackTwilioVoice(minutes) {
    const cost = minutes * CostMonitor.PRICING.twilio.voicePerMinute;
    return this.trackCost('twilio_voice', cost, { minutes });
  }

  trackElevenLabs(characters) {
    const cost = characters * CostMonitor.PRICING.elevenlabs.perCharacter;
    return this.trackCost('elevenlabs', cost, { characters });
  }

  trackStripePayment(amount) {
    const cost = amount * CostMonitor.PRICING.stripe.percentage + CostMonitor.PRICING.stripe.fixed;
    return this.trackCost('stripe', cost, { paymentAmount: amount });
  }

  trackGoogleMaps(requests = 1) {
    const cost = requests * CostMonitor.PRICING.googleMaps.perRequest;
    return this.trackCost('google_maps', cost, { requests });
  }

  getTodayCosts() {
    this.resetIfNewDay();

    let total = 0;
    const breakdown = {};

    for (const [service, data] of Object.entries(this.costs.daily)) {
      total += data.total;
      breakdown[service] = {
        total: Math.round(data.total * 100) / 100,
        calls: data.calls
      };
    }

    return {
      date: this.currentDate,
      total: Math.round(total * 100) / 100,
      breakdown,
      status: this.getStatus(total),
      thresholds: THRESHOLDS.daily
    };
  }

  getMonthCosts() {
    this.resetIfNewDay();

    let total = 0;
    const breakdown = {};

    for (const [service, data] of Object.entries(this.costs.monthly)) {
      total += data.total;
      breakdown[service] = {
        total: Math.round(data.total * 100) / 100,
        calls: data.calls
      };
    }

    return {
      month: this.currentMonth,
      total: Math.round(total * 100) / 100,
      breakdown,
      status: this.getStatus(total, 'monthly'),
      thresholds: THRESHOLDS.monthly
    };
  }

  getStatus(total, period = 'daily') {
    const thresholds = period === 'monthly' ? THRESHOLDS.monthly : THRESHOLDS.daily;

    if (total >= thresholds.shutdown) return 'SHUTDOWN';
    if (total >= thresholds.critical) return 'CRITICAL';
    if (total >= thresholds.warning) return 'WARNING';
    return 'OK';
  }
}

export const costMonitor = new CostMonitor();
export default costMonitor;
