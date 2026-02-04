-- Copier données de public vers tenant_1_fatshairafro

SET search_path TO tenant_1_fatshairafro, public;

-- Copier clients
INSERT INTO tenant_1_fatshairafro.clients
SELECT * FROM public.clients;

SELECT COUNT(*) as clients_copied FROM tenant_1_fatshairafro.clients;

-- Copier services
INSERT INTO tenant_1_fatshairafro.services
SELECT * FROM public.services;

SELECT COUNT(*) as services_copied FROM tenant_1_fatshairafro.services;

-- Copier reservations
INSERT INTO tenant_1_fatshairafro.reservations
SELECT * FROM public.reservations;

SELECT COUNT(*) as reservations_copied FROM tenant_1_fatshairafro.reservations;

-- Copier reviews
INSERT INTO tenant_1_fatshairafro.reviews
SELECT * FROM public.reviews;

SELECT COUNT(*) as reviews_copied FROM tenant_1_fatshairafro.reviews;

-- Vérifier intégrité
DO $
DECLARE
  public_count INT;
  tenant_count INT;
BEGIN
  -- Clients
  SELECT COUNT(*) INTO public_count FROM public.clients;
  SELECT COUNT(*) INTO tenant_count FROM tenant_1_fatshairafro.clients;

  IF public_count != tenant_count THEN
    RAISE EXCEPTION 'Clients count mismatch: public=%, tenant=%', public_count, tenant_count;
  END IF;

  -- Reservations
  SELECT COUNT(*) INTO public_count FROM public.reservations;
  SELECT COUNT(*) INTO tenant_count FROM tenant_1_fatshairafro.reservations;

  IF public_count != tenant_count THEN
    RAISE EXCEPTION 'Reservations count mismatch: public=%, tenant=%', public_count, tenant_count;
  END IF;

  RAISE NOTICE 'Data integrity check: PASSED';
END $;

-- Log
INSERT INTO public.migration_log (
  schema_name,
  migration_file,
  status,
  created_at
) VALUES (
  'tenant_1_fatshairafro',
  '002-copy-data.sql',
  'completed',
  NOW()
);

SELECT 'Données copiées et vérifiées' AS result;
