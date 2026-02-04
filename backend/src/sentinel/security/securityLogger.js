/**
 * SENTINEL Security Logger
 * Trace toutes les activites de securite
 */

import { supabase } from '../../config/supabase.js';

export const EVENT_TYPES = {
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  INVALID_INPUT: 'invalid_input',
  SQL_INJECTION_ATTEMPT: 'sql_injection_attempt',
  XSS_ATTEMPT: 'xss_attempt',
  PATH_TRAVERSAL_ATTEMPT: 'path_traversal_attempt',
  CSRF_FAILURE: 'csrf_failure',
  AUTH_FAILURE: 'auth_failure',
  AUTH_SUCCESS: 'auth_success',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  BLOCKED_IP: 'blocked_ip',
  PERMISSION_DENIED: 'permission_denied',
  PASSWORD_CHANGE: 'password_change',
  PASSWORD_RESET: 'password_reset',
  ACCOUNT_LOCKED: 'account_locked',
  PROVISIONAL_EXPIRED: 'provisional_expired',
};

export const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// Buffer pour batch insert
let logBuffer = [];
const BUFFER_SIZE = 10;
const FLUSH_INTERVAL = 30 * 1000;

export async function flushLogs() {
  if (logBuffer.length === 0) return;

  const logsToInsert = [...logBuffer];
  logBuffer = [];

  try {
    const { error } = await supabase
      .from('sentinel_security_logs')
      .insert(logsToInsert);

    if (error) {
      console.error('[SENTINEL] Error saving security logs:', error.message);
      logBuffer = [...logsToInsert, ...logBuffer].slice(0, 1000);
    }
  } catch (err) {
    console.error('[SENTINEL] Security log flush failed:', err.message);
  }
}

setInterval(flushLogs, FLUSH_INTERVAL);

export async function logSecurityEvent(event) {
  const logEntry = {
    event_type: event.type,
    severity: event.severity || SEVERITY.MEDIUM,
    ip_address: event.ip || 'unknown',
    user_id: event.userId || null,
    tenant_id: event.tenantId || null,
    path: event.path || null,
    method: event.method || null,
    details: event.details || {},
    user_agent: event.userAgent || null,
    created_at: new Date().toISOString(),
  };

  const emoji = { low: '', medium: '!', high: '!!', critical: '!!!' };
  console.log(
    `[SENTINEL SECURITY] ${emoji[logEntry.severity] || ''} ${event.type}: ip=${logEntry.ip_address} path=${logEntry.path}`
  );

  logBuffer.push(logEntry);

  if (logBuffer.length >= BUFFER_SIZE) {
    flushLogs();
  }

  return logEntry;
}

export function logRateLimitExceeded(req) {
  return logSecurityEvent({
    type: EVENT_TYPES.RATE_LIMIT_EXCEEDED,
    severity: SEVERITY.MEDIUM,
    ip: req.ip,
    path: req.path,
    method: req.method,
    userAgent: req.headers?.['user-agent'],
    tenantId: req.tenantId,
  });
}

export function logInvalidInput(req, threats) {
  // Determine severity by threat type
  const hasSql = threats.some((t) => t.type === 'SQL_INJECTION');
  const hasXss = threats.some((t) => t.type === 'XSS');
  const severity = hasSql ? SEVERITY.CRITICAL : hasXss ? SEVERITY.HIGH : SEVERITY.MEDIUM;

  return logSecurityEvent({
    type: hasSql
      ? EVENT_TYPES.SQL_INJECTION_ATTEMPT
      : hasXss
        ? EVENT_TYPES.XSS_ATTEMPT
        : EVENT_TYPES.INVALID_INPUT,
    severity,
    ip: req.ip,
    path: req.path,
    method: req.method,
    userAgent: req.headers?.['user-agent'],
    tenantId: req.tenantId,
    details: { threats },
  });
}

export function logAuthFailure(req, reason) {
  return logSecurityEvent({
    type: EVENT_TYPES.AUTH_FAILURE,
    severity: SEVERITY.MEDIUM,
    ip: req.ip,
    path: req.path,
    method: req.method,
    userAgent: req.headers?.['user-agent'],
    details: { reason },
  });
}

export function logAuthSuccess(req, userId) {
  return logSecurityEvent({
    type: EVENT_TYPES.AUTH_SUCCESS,
    severity: SEVERITY.LOW,
    ip: req.ip,
    path: req.path,
    userId,
    userAgent: req.headers?.['user-agent'],
  });
}

export async function getRecentLogs(limit = 100, filters = {}) {
  try {
    let query = supabase
      .from('sentinel_security_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters.severity) query = query.eq('severity', filters.severity);
    if (filters.eventType) query = query.eq('event_type', filters.eventType);
    if (filters.ip) query = query.eq('ip_address', filters.ip);
    if (filters.tenantId) query = query.eq('tenant_id', filters.tenantId);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[SENTINEL] Error fetching security logs:', err.message);
    return [];
  }
}

export async function getSecurityStats(hours = 24) {
  try {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('sentinel_security_logs')
      .select('event_type, severity')
      .gte('created_at', since);

    if (error) throw error;

    const stats = {
      total: data.length,
      bySeverity: {},
      byType: {},
      critical: 0,
      high: 0,
    };

    for (const log of data) {
      stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1;
      stats.byType[log.event_type] = (stats.byType[log.event_type] || 0) + 1;
      if (log.severity === 'critical') stats.critical++;
      if (log.severity === 'high') stats.high++;
    }

    return stats;
  } catch (err) {
    console.error('[SENTINEL] Error getting security stats:', err.message);
    return { total: 0, bySeverity: {}, byType: {}, critical: 0, high: 0 };
  }
}
