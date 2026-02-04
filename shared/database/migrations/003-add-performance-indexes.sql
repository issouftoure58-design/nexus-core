-- Performance indexes for tenant_1_fatshairafro
-- Run via: psql $SUPABASE_URL < 003-add-performance-indexes.sql

-- Composite index for date + statut lookups (dashboard, scheduler)
CREATE INDEX IF NOT EXISTS idx_reservations_date_statut
ON tenant_1_fatshairafro.reservations(date_rdv, statut);

-- Index telephone for client lookups
CREATE INDEX IF NOT EXISTS idx_clients_telephone
ON tenant_1_fatshairafro.clients(telephone);

-- Composite index for dashboard stats (date + statut + prix)
CREATE INDEX IF NOT EXISTS idx_reservations_dashboard
ON tenant_1_fatshairafro.reservations(date_rdv, statut, prix_total);

-- Log
INSERT INTO public.migration_log (
  schema_name,
  migration_file,
  status,
  created_at
) VALUES (
  'tenant_1_fatshairafro',
  '003-add-performance-indexes.sql',
  'completed',
  NOW()
);

SELECT 'Performance indexes created' AS result;
