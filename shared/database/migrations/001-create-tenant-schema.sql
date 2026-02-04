-- Création schema tenant isolé
-- Usage: psql $SUPABASE_URL < 001-create-tenant-schema.sql

-- Créer schema
CREATE SCHEMA IF NOT EXISTS tenant_1_fatshairafro;

-- Set search path
SET search_path TO tenant_1_fatshairafro, public;

-- Copier structure tables depuis public

-- Table clients
CREATE TABLE tenant_1_fatshairafro.clients AS
SELECT * FROM public.clients WHERE 1=0;

-- Table services
CREATE TABLE tenant_1_fatshairafro.services AS
SELECT * FROM public.services WHERE 1=0;

-- Table reservations
CREATE TABLE tenant_1_fatshairafro.reservations AS
SELECT * FROM public.reservations WHERE 1=0;

-- Table reviews
CREATE TABLE tenant_1_fatshairafro.reviews AS
SELECT * FROM public.reviews WHERE 1=0;

-- Copier indexes
CREATE INDEX idx_reservations_date ON tenant_1_fatshairafro.reservations(date_rdv);
CREATE INDEX idx_reservations_client ON tenant_1_fatshairafro.reservations(client_id);
CREATE INDEX idx_reservations_statut ON tenant_1_fatshairafro.reservations(statut);

-- Copier foreign keys
ALTER TABLE tenant_1_fatshairafro.reservations
  ADD CONSTRAINT fk_client
  FOREIGN KEY (client_id)
  REFERENCES tenant_1_fatshairafro.clients(id);

ALTER TABLE tenant_1_fatshairafro.reservations
  ADD CONSTRAINT fk_service
  FOREIGN KEY (service_id)
  REFERENCES tenant_1_fatshairafro.services(id);

-- Permissions
GRANT ALL ON SCHEMA tenant_1_fatshairafro TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA tenant_1_fatshairafro TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tenant_1_fatshairafro TO authenticated;

-- Log
INSERT INTO public.migration_log (
  schema_name,
  migration_file,
  status,
  created_at
) VALUES (
  'tenant_1_fatshairafro',
  '001-create-tenant-schema.sql',
  'completed',
  NOW()
);

SELECT 'Schema tenant_1_fatshairafro créé' AS result;
