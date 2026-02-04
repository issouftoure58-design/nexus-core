/**
 * SENTINEL - Health Monitor
 *
 * Surveille: Uptime, memoire, CPU, connexions DB, APIs externes
 * Priorite #1 - Le plus critique
 */

import { createClient } from '@supabase/supabase-js';

class HealthMonitor {
  constructor() {
    this.lastResults = null;
    this.history = [];
  }

  async check() {
    const results = {
      timestamp: new Date().toISOString(),
      memory: await this.checkMemory(),
      database: await this.checkDatabase(),
      apis: await this.checkExternalAPIs(),
      uptime: this.checkUptime()
    };

    this.lastResults = results;
    this.history.push(results);

    // Keep only last 100 checks
    if (this.history.length > 100) {
      this.history.shift();
    }

    return results;
  }

  async checkMemory() {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const usagePercent = Math.round((used.heapUsed / used.heapTotal) * 100);

    let status = 'OK';
    if (usagePercent > 90) status = 'CRITICAL';
    else if (usagePercent > 75) status = 'WARNING';

    return {
      status,
      heapUsedMB,
      heapTotalMB,
      usagePercent,
      rss: Math.round(used.rss / 1024 / 1024)
    };
  }

  async checkDatabase() {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        return { status: 'WARNING', message: 'Supabase not configured' };
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const startTime = Date.now();

      const { error } = await supabase.from('services').select('id').limit(1);
      const latency = Date.now() - startTime;

      if (error) {
        return { status: 'CRITICAL', message: error.message, latency };
      }

      let status = 'OK';
      if (latency > 2000) status = 'CRITICAL';
      else if (latency > 1000) status = 'WARNING';

      return { status, latency, message: 'Connected' };
    } catch (error) {
      return { status: 'CRITICAL', message: error.message };
    }
  }

  async checkExternalAPIs() {
    const apis = {};

    // Check Anthropic API
    apis.anthropic = {
      status: process.env.ANTHROPIC_API_KEY ? 'OK' : 'WARNING',
      configured: !!process.env.ANTHROPIC_API_KEY
    };

    // Check Twilio
    apis.twilio = {
      status: process.env.TWILIO_ACCOUNT_SID ? 'OK' : 'WARNING',
      configured: !!process.env.TWILIO_ACCOUNT_SID
    };

    // Check Stripe
    apis.stripe = {
      status: process.env.STRIPE_SECRET_KEY ? 'OK' : 'WARNING',
      configured: !!process.env.STRIPE_SECRET_KEY
    };

    // Check Google Maps
    apis.googleMaps = {
      status: process.env.GOOGLE_MAPS_API_KEY ? 'OK' : 'WARNING',
      configured: !!process.env.GOOGLE_MAPS_API_KEY
    };

    return apis;
  }

  checkUptime() {
    const uptimeSeconds = process.uptime();
    const uptimeHours = Math.round(uptimeSeconds / 3600 * 100) / 100;

    return {
      status: 'OK',
      seconds: Math.round(uptimeSeconds),
      hours: uptimeHours,
      started: new Date(Date.now() - uptimeSeconds * 1000).toISOString()
    };
  }

  getLastResults() {
    return this.lastResults;
  }

  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }
}

export const healthMonitor = new HealthMonitor();
export default healthMonitor;
