import { AsyncLocalStorage } from "node:async_hooks";

const tenantStore = new AsyncLocalStorage<string | null>();

/** Get current tenant ID from async context. Returns null if NEXUS context (no tenant). */
export function getTenantId(): string | null {
  const store = tenantStore.getStore();
  return store === undefined ? null : store;
}

/** Run a function within a tenant context (null = NEXUS context) */
export function runWithTenant<T>(tenantId: string | null, fn: () => T): T {
  return tenantStore.run(tenantId, fn);
}
