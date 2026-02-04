-- ════════════════════════════════════════════════════════════════════
-- Migration 007: Gestion Disponibilités
-- ════════════════════════════════════════════════════════════════════

-- Table horaires hebdomadaires
CREATE TABLE IF NOT EXISTS horaires_hebdo (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jour_semaine INTEGER NOT NULL CHECK (jour_semaine >= 0 AND jour_semaine <= 6),
  heure_debut TIME,
  heure_fin TIME,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(jour_semaine)
);

-- Table blocs d'indisponibilité temporaires
CREATE TABLE IF NOT EXISTS blocs_indispo (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL,
  heure_debut TIME NOT NULL,
  heure_fin TIME NOT NULL,
  motif VARCHAR(255),
  recurrent BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insérer les horaires par défaut de Fatou
INSERT INTO horaires_hebdo (jour_semaine, heure_debut, heure_fin, is_active) VALUES
  (0, NULL, NULL, false), -- Dimanche : Fermé
  (1, '09:00', '18:00', true), -- Lundi : 9h-18h
  (2, '09:00', '18:00', true), -- Mardi : 9h-18h
  (3, '09:00', '18:00', true), -- Mercredi : 9h-18h
  (4, '09:00', '13:00', true), -- Jeudi : 9h-13h
  (5, '13:00', '18:00', true), -- Vendredi : 13h-18h
  (6, '09:00', '18:00', true)  -- Samedi : 9h-18h
ON CONFLICT (jour_semaine) DO NOTHING;

-- Index pour les requêtes par date
CREATE INDEX IF NOT EXISTS idx_blocs_indispo_date ON blocs_indispo(date);
CREATE INDEX IF NOT EXISTS idx_conges_dates ON conges(date_debut, date_fin);
