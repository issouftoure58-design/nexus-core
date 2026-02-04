-- ============================================================
-- SYSTÈME DE MÉMOIRE ÉVOLUTIVE HALIMAH PRO v2
-- Exécuter dans Supabase SQL Editor
-- ============================================================

-- Activer l'extension UUID si pas déjà fait
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE MÉMOIRE PRINCIPALE
-- ============================================================
CREATE TABLE IF NOT EXISTS halimah_memory (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  -- Classification
  type VARCHAR(50) NOT NULL,  -- preference, learning, insight, fact, feedback
  category VARCHAR(50) NOT NULL,  -- client, business, admin, content, conversation

  -- Contenu
  subject_type VARCHAR(50),  -- client, service, post, general
  subject_id UUID,
  key VARCHAR(255) NOT NULL,
  value TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',

  -- Confiance & usage
  confidence DECIMAL(3,2) DEFAULT 0.50,  -- 0.00 à 1.00
  use_count INTEGER DEFAULT 0,
  last_used TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_memory_type ON halimah_memory(type, category);
CREATE INDEX IF NOT EXISTS idx_memory_subject ON halimah_memory(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_memory_key ON halimah_memory(key);
CREATE INDEX IF NOT EXISTS idx_memory_confidence ON halimah_memory(confidence DESC);

-- ============================================================
-- TABLE FEEDBACK POUR APPRENTISSAGE
-- ============================================================
CREATE TABLE IF NOT EXISTS halimah_feedback (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  conversation_id UUID,
  message_id UUID,

  rating INTEGER CHECK (rating BETWEEN 1 AND 5),  -- 1-5 étoiles
  feedback_type VARCHAR(50),  -- helpful, not_helpful, wrong, perfect
  comment TEXT,

  -- Contexte
  context JSONB DEFAULT '{}',  -- La conversation/action concernée

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON halimah_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON halimah_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON halimah_feedback(created_at DESC);

-- ============================================================
-- TABLE INSIGHTS GÉNÉRÉS
-- ============================================================
CREATE TABLE IF NOT EXISTS halimah_insights (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  insight_type VARCHAR(50),  -- trend, recommendation, warning, opportunity
  title VARCHAR(255),
  description TEXT,
  data JSONB DEFAULT '{}',

  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),  -- 1-10
  is_actioned BOOLEAN DEFAULT FALSE,
  actioned_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_insights_type ON halimah_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_priority ON halimah_insights(priority DESC);
CREATE INDEX IF NOT EXISTS idx_insights_actioned ON halimah_insights(is_actioned);

-- ============================================================
-- TABLE CONVERSATIONS (pour historique et analyse)
-- ============================================================
CREATE TABLE IF NOT EXISTS halimah_conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  session_id TEXT NOT NULL,

  -- Messages
  messages JSONB DEFAULT '[]',  -- Array de {role, content, timestamp, tools_used}

  -- Métadonnées
  topic VARCHAR(255),  -- Sujet principal détecté
  client_id UUID,  -- Si conversation concerne un client
  tools_used JSONB DEFAULT '[]',  -- Outils utilisés pendant la conversation

  -- Stats
  message_count INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_conversations_session ON halimah_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_topic ON halimah_conversations(topic);
CREATE INDEX IF NOT EXISTS idx_conversations_client ON halimah_conversations(client_id);

-- ============================================================
-- FONCTION DE MISE À JOUR AUTOMATIQUE
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour halimah_memory
DROP TRIGGER IF EXISTS update_halimah_memory_updated_at ON halimah_memory;
CREATE TRIGGER update_halimah_memory_updated_at
  BEFORE UPDATE ON halimah_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DONNÉES INITIALES (Préférences par défaut)
-- ============================================================

-- Insérer quelques préférences admin par défaut
INSERT INTO halimah_memory (type, category, key, value, confidence) VALUES
  ('preference', 'admin', 'ton_communication', 'Chaleureux et professionnel, vouvoiement avec les clients', 0.9),
  ('preference', 'admin', 'langue', 'Français', 1.0),
  ('preference', 'admin', 'business_type', 'Coiffure afro à domicile', 1.0),
  ('preference', 'admin', 'business_name', 'Fat''s Hair-Afro', 1.0),
  ('preference', 'admin', 'zone_intervention', 'Franconville et Île-de-France', 1.0)
ON CONFLICT DO NOTHING;

-- ============================================================
-- VÉRIFICATION
-- ============================================================
SELECT 'Tables Halimah Memory v2 créées avec succès!' AS status;
