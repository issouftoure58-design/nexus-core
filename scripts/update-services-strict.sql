-- ============================================
-- MIGRATION : TARIFS ET RÈGLES MÉTIER STRICTES
-- Fat's Hair-Afro - Janvier 2026
-- ============================================

-- 1. AJOUTER LES NOUVELLES COLONNES À LA TABLE SERVICES
ALTER TABLE services
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'autre',
ADD COLUMN IF NOT EXISTS price_is_minimum BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS blocks_full_day BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS blocks_days INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- 2. VIDER ET RE-REMPLIR LA TABLE SERVICES AVEC LES VRAIS TARIFS
DELETE FROM services;

-- LOCKS (prix en CENTIMES)
INSERT INTO services (nom, category, duree, prix, price_is_minimum, blocks_full_day, blocks_days, description, active) VALUES
('Création crochet locks', 'locks', 480, 20000, FALSE, TRUE, 1, 'Création de locks au crochet - JOURNÉE ENTIÈRE', TRUE),
('Création microlocks crochet', 'locks', 960, 30000, TRUE, TRUE, 2, 'Création microlocks au crochet - 2 JOURS CONSÉCUTIFS', TRUE),
('Création microlocks twist', 'locks', 480, 15000, TRUE, TRUE, 1, 'Création microlocks twist - JOURNÉE ENTIÈRE', TRUE),
('Reprise racines locks', 'locks', 120, 5000, FALSE, FALSE, 1, 'Entretien et reprise des racines de locks', TRUE),
('Reprise racines micro-locks', 'locks', 240, 10000, FALSE, FALSE, 1, 'Reprise racines micro-locks - Demi-journée', TRUE),
('Décapage de locks', 'locks', 60, 3500, FALSE, FALSE, 1, 'Nettoyage en profondeur des locks', TRUE);

-- SOINS
INSERT INTO services (nom, category, duree, prix, price_is_minimum, blocks_full_day, description, active) VALUES
('Soin complet', 'soins', 60, 5000, FALSE, FALSE, 'Soin profond et hydratation complète', TRUE),
('Soin hydratant', 'soins', 60, 4000, FALSE, FALSE, 'Hydratation cheveux afro', TRUE),
('Shampoing', 'soins', 30, 1000, FALSE, FALSE, 'Shampoing et démêlage', TRUE);

-- TRESSES
INSERT INTO services (nom, category, duree, prix, price_is_minimum, blocks_full_day, description, active) VALUES
('Braids', 'tresses', 300, 6000, TRUE, FALSE, 'Tresses avec ou sans rajouts - durée variable', TRUE),
('Nattes collées sans rajout', 'tresses', 60, 2000, TRUE, FALSE, 'Nattes plaquées naturelles - durée variable', TRUE),
('Nattes collées avec rajout', 'tresses', 120, 4000, TRUE, FALSE, 'Nattes plaquées avec extensions - durée variable', TRUE);

-- COLORATION & BRUSHING
INSERT INTO services (nom, category, duree, prix, price_is_minimum, blocks_full_day, description, active) VALUES
('Teinture sans ammoniaque', 'coloration', 40, 4000, FALSE, FALSE, 'Coloration douce', TRUE),
('Décoloration', 'coloration', 10, 2000, FALSE, FALSE, 'Décoloration cheveux', TRUE),
('Brushing cheveux afro', 'coloration', 60, 2000, FALSE, FALSE, 'Brushing adapté aux cheveux crépus', TRUE);

-- 3. CRÉER LA TABLE DES FRAIS DE DÉPLACEMENT
CREATE TABLE IF NOT EXISTS travel_fees (
  id SERIAL PRIMARY KEY,
  min_distance_km INTEGER NOT NULL,
  max_distance_km INTEGER, -- NULL = pas de limite
  base_fee INTEGER NOT NULL, -- en centimes
  per_km_fee INTEGER DEFAULT 0, -- en centimes
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Vider et re-remplir
DELETE FROM travel_fees;

INSERT INTO travel_fees (min_distance_km, max_distance_km, base_fee, per_km_fee, description) VALUES
(0, 8, 1000, 0, 'Forfait 0-8 km : 10€'),
(9, NULL, 1000, 110, '8km + 1,10€/km au-delà');

-- 4. CRÉER INDEX POUR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(active);
CREATE INDEX IF NOT EXISTS idx_services_blocks_full_day ON services(blocks_full_day);

-- 5. VÉRIFICATION
SELECT name, category, duree as duree_min, prix/100.0 as prix_eur,
       price_is_minimum as "a_partir_de",
       blocks_full_day as "journee_entiere",
       blocks_days as "nb_jours"
FROM services
WHERE active = TRUE
ORDER BY category, nom;
