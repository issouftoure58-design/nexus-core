-- Migration 011: Extend tenants table with full business config
-- Ajoute la config complete (services, horaires, features, etc.)
-- precedemment stockee uniquement dans les fichiers JS.
-- La table tenants existe deja avec: id, name, domain, plan, status, settings

-- Colonnes structurees (requetables)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS assistant_name TEXT DEFAULT 'Nexus';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS gerante TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS telephone TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS concept TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS secteur TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ville TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS frozen BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS nexus_version TEXT DEFAULT '1.0.0';

-- JSONB: config legacy complete (retournee par getTenantConfig)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- JSONB extraits pour requetes directes
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS limits_config JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS branding JSONB DEFAULT '{}';

-- Timestamp mise a jour
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_tenants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_updated_at ON tenants;
CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION update_tenants_updated_at();
