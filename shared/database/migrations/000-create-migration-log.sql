-- Table pour tracker migrations
CREATE TABLE IF NOT EXISTS public.migration_log (
  id SERIAL PRIMARY KEY,
  schema_name TEXT NOT NULL,
  migration_file TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
