import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getTenantId } from "./tenant-context";

if (!process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL must be set");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set");
}

// Raw client — no tenant filtering. Use for system/Sentinel/Nexus queries.
export const rawSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);

// Tables that should NEVER be filtered by tenant_id
const SYSTEM_TABLES = new Set([
  "tenants",
  "admin_users",
  "sentinel_usage",
  "sentinel_alerts",
  "sentinel_security_logs",
  "si_metrics",
  "si_alerts",
  "si_predictions",
  "si_reports",
  "si_anomalies",
  "migration_log",
]);

/**
 * Creates a proxy around the query builder returned by .from(table)
 * that auto-injects .eq('tenant_id', tenantId) on select/insert/update/delete/upsert.
 */
function createQueryProxy(queryBuilder: any, tenantId: string): any {
  return new Proxy(queryBuilder, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);

      // For select: inject .eq('tenant_id', tenantId) after the select call
      if (prop === "select") {
        return (...args: any[]) => {
          const result = val.apply(target, args);
          return result.eq("tenant_id", tenantId);
        };
      }

      // For insert: inject tenant_id into each row
      if (prop === "insert") {
        return (rows: any, ...rest: any[]) => {
          const inject = (row: any) => ({ ...row, tenant_id: tenantId });
          const patched = Array.isArray(rows) ? rows.map(inject) : inject(rows);
          return val.call(target, patched, ...rest);
        };
      }

      // For update: inject .eq('tenant_id', tenantId) after match
      if (prop === "update") {
        return (...args: any[]) => {
          const result = val.apply(target, args);
          return result.eq("tenant_id", tenantId);
        };
      }

      // For delete: inject .eq('tenant_id', tenantId)
      if (prop === "delete") {
        return (...args: any[]) => {
          const result = val.apply(target, args);
          return result.eq("tenant_id", tenantId);
        };
      }

      // For upsert: inject tenant_id into each row
      if (prop === "upsert") {
        return (rows: any, ...rest: any[]) => {
          const inject = (row: any) => ({ ...row, tenant_id: tenantId });
          const patched = Array.isArray(rows) ? rows.map(inject) : inject(rows);
          return val.call(target, patched, ...rest);
        };
      }

      return val;
    },
  });
}

/**
 * Tenant-aware Supabase client.
 * Intercepts .from(table) and auto-filters by tenant_id from AsyncLocalStorage context.
 * System tables are not filtered.
 */
export const supabase: SupabaseClient = new Proxy(rawSupabase, {
  get(target, prop, receiver) {
    if (prop === "from") {
      return (table: string) => {
        const qb = target.from(table);
        // Skip tenant filtering for system tables
        if (SYSTEM_TABLES.has(table)) {
          return qb;
        }
        const tenantId = getTenantId();
        // No tenant filtering in NEXUS context (tenantId is null)
        if (!tenantId) return qb;
        return createQueryProxy(qb, tenantId);
      };
    }
    return Reflect.get(target, prop, receiver);
  },
}) as SupabaseClient;
