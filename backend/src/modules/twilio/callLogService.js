/**
 * Twilio Call Log Service
 * Persistance des appels et SMS Twilio en base
 */

import { supabase } from '../../config/supabase.js';

// ============ LOGGING ============

export async function logCallStart(tenantId, callData) {
  const {
    CallSid, From, To, Direction = 'inbound',
    CallerCity, CallerState, CallerCountry,
  } = callData;

  try {
    const { data, error } = await supabase
      .from('twilio_call_logs')
      .insert({
        tenant_id: tenantId,
        call_sid: CallSid,
        channel: 'voice',
        direction: Direction === 'outbound-api' ? 'outbound' : 'inbound',
        from_number: From,
        to_number: To,
        caller_city: CallerCity || null,
        caller_state: CallerState || null,
        caller_country: CallerCountry || null,
        call_status: 'ringing',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[CALL-LOG] Error logging call start:', err.message);
    return { success: false, error: err.message };
  }
}

export async function logCallEnd(callData) {
  const { CallSid, CallStatus, CallDuration } = callData;

  try {
    const { data, error } = await supabase
      .from('twilio_call_logs')
      .update({
        call_status: CallStatus,
        call_duration: CallDuration ? parseInt(CallDuration, 10) : null,
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('call_sid', CallSid)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[CALL-LOG] Error logging call end:', err.message);
    return { success: false, error: err.message };
  }
}

export async function logSMS(tenantId, smsData) {
  const { MessageSid, From, To, Body, Direction = 'inbound' } = smsData;

  try {
    const { data, error } = await supabase
      .from('twilio_call_logs')
      .insert({
        tenant_id: tenantId,
        message_sid: MessageSid,
        channel: 'sms',
        direction: Direction === 'outbound-api' ? 'outbound' : 'inbound',
        from_number: From,
        to_number: To,
        sms_body: Body || null,
        sms_status: 'received',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[CALL-LOG] Error logging SMS:', err.message);
    return { success: false, error: err.message };
  }
}

export async function logSMSStatus(smsData) {
  const { MessageSid, MessageStatus } = smsData;

  try {
    const { data, error } = await supabase
      .from('twilio_call_logs')
      .update({
        sms_status: MessageStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('message_sid', MessageSid)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[CALL-LOG] Error logging SMS status:', err.message);
    return { success: false, error: err.message };
  }
}

export async function updateCallSummary(callSid, summary) {
  try {
    const { data, error } = await supabase
      .from('twilio_call_logs')
      .update({ ai_summary: summary, updated_at: new Date().toISOString() })
      .eq('call_sid', callSid)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[CALL-LOG] Error updating summary:', err.message);
    return { success: false, error: err.message };
  }
}

// ============ QUERIES ============

export async function getCallLogs(tenantId, options = {}) {
  const { channel, limit = 50, offset = 0, startDate, endDate } = options;

  try {
    let query = supabase
      .from('twilio_call_logs')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (channel) query = query.eq('channel', channel);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data, error, count } = await query;
    if (error) throw error;
    return { success: true, data, count };
  } catch (err) {
    console.error('[CALL-LOG] Error getting logs:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getCallLogByCallSid(callSid) {
  try {
    const { data, error } = await supabase
      .from('twilio_call_logs')
      .select('*')
      .eq('call_sid', callSid)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('[CALL-LOG] Error getting log:', err.message);
    return { success: false, error: err.message };
  }
}

export async function getCallStats(tenantId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('twilio_call_logs')
      .select('channel, call_status, call_duration, sms_status')
      .eq('tenant_id', tenantId)
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    const stats = {
      totalCalls: 0,
      totalSMS: 0,
      totalDuration: 0,
      avgDuration: 0,
      byStatus: {},
    };

    for (const log of data) {
      if (log.channel === 'voice') {
        stats.totalCalls++;
        if (log.call_duration) stats.totalDuration += log.call_duration;
        const s = log.call_status || 'unknown';
        stats.byStatus[s] = (stats.byStatus[s] || 0) + 1;
      } else {
        stats.totalSMS++;
      }
    }

    if (stats.totalCalls > 0) {
      stats.avgDuration = Math.round(stats.totalDuration / stats.totalCalls);
    }

    return { success: true, data: stats };
  } catch (err) {
    console.error('[CALL-LOG] Error getting stats:', err.message);
    return { success: false, error: err.message };
  }
}
