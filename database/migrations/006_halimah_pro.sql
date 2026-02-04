-- ════════════════════════════════════════════════════════════════════
-- Migration 006: Halimah Pro - Interface Admin
-- ════════════════════════════════════════════════════════════════════

-- Table admin (utilisateurs admin)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nom VARCHAR(100) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table paramètres globaux
CREATE TABLE IF NOT EXISTS parametres (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cle VARCHAR(100) UNIQUE NOT NULL,
  valeur JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table notes clients
CREATE TABLE IF NOT EXISTS notes_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table congés / indisponibilités
CREATE TABLE IF NOT EXISTS conges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  motif VARCHAR(255),
  type VARCHAR(50) DEFAULT 'conge', -- conge, fermeture, autre
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table historique actions admin
CREATE TABLE IF NOT EXISTS historique_admin (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES admin_users(id),
  action VARCHAR(100) NOT NULL,
  entite VARCHAR(50) NOT NULL,
  entite_id UUID,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insérer admin par défaut (Fatou)
-- Mot de passe: "fatou2026" (à changer après première connexion)
INSERT INTO admin_users (email, password_hash, nom, role)
VALUES (
  'fatou@fatshairafro.fr',
  '$2b$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGu7xQuCH9cPKmWxq',
  'Fatou',
  'admin'
) ON CONFLICT (email) DO NOTHING;

-- Insérer paramètres par défaut
INSERT INTO parametres (cle, valeur, description) VALUES
  ('frais_deplacement_base', '{"montant": 10, "description": "Frais de base (0-8km)"}', 'Frais de déplacement de base'),
  ('frais_deplacement_km', '{"montant": 1.10, "description": "Par km supplémentaire"}', 'Coût par km au-delà de 8km'),
  ('acompte_montant', '{"montant": 10, "type": "fixe"}', 'Montant de l''acompte'),
  ('delai_annulation_gratuite', '{"heures": 24}', 'Délai annulation sans frais'),
  ('zone_deplacement_max', '{"km": 50}', 'Distance maximale de déplacement'),
  ('notifications_email', '{"actif": true}', 'Activer notifications email'),
  ('notifications_whatsapp', '{"actif": true}', 'Activer notifications WhatsApp')
ON CONFLICT (cle) DO NOTHING;
