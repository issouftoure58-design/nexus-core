-- ============================================================
-- TABLES HALIMAH PRO - MÉMOIRE ET AGENT
-- Exécuter dans Supabase SQL Editor
-- ============================================================

-- Table de mémoire des conversations
CREATE TABLE IF NOT EXISTS halimah_memory (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  attachments JSONB,
  tool_calls JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour recherche rapide par session
CREATE INDEX IF NOT EXISTS idx_halimah_memory_session ON halimah_memory(session_id);
CREATE INDEX IF NOT EXISTS idx_halimah_memory_created ON halimah_memory(created_at DESC);

-- Table des faits mémorisés
CREATE TABLE IF NOT EXISTS halimah_facts (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('preference', 'decision', 'info', 'reminder')),
  fact TEXT NOT NULL,
  source_message_id INTEGER REFERENCES halimah_memory(id) ON DELETE SET NULL,
  confidence REAL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Index pour recherche de faits actifs
CREATE INDEX IF NOT EXISTS idx_halimah_facts_active ON halimah_facts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_halimah_facts_category ON halimah_facts(category);

-- Table des tâches autonomes
CREATE TABLE IF NOT EXISTS halimah_tasks (
  id SERIAL PRIMARY KEY,
  parent_task_id INTEGER REFERENCES halimah_tasks(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  steps JSONB,
  current_step INTEGER DEFAULT 0,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Index pour tâches en cours
CREATE INDEX IF NOT EXISTS idx_halimah_tasks_status ON halimah_tasks(status);

-- Table pour les tokens Google Drive (stockage sécurisé)
CREATE TABLE IF NOT EXISTS halimah_google_tokens (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE DEFAULT 'admin',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expiry_date BIGINT,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activer RLS (Row Level Security) si nécessaire
-- ALTER TABLE halimah_memory ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE halimah_facts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE halimah_tasks ENABLE ROW LEVEL SECURITY;

-- Commenter pour voir le résultat
SELECT 'Tables Halimah Pro créées avec succès!' AS status;
