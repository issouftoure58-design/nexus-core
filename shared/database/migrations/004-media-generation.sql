-- Tables génération médias IA
-- Run via: psql $SUPABASE_URL < 004-media-generation.sql

-- Historique générations
CREATE TABLE IF NOT EXISTS media_generations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'image', 'video', 'background_removal', 'upscale'
  model TEXT NOT NULL, -- 'flux-schnell', 'sdxl', 'stable-video', etc.
  prompt TEXT,
  input_url TEXT,
  output_url TEXT NOT NULL,
  platform TEXT, -- 'instagram', 'facebook', 'linkedin'
  theme TEXT, -- 'promotion', 'event', 'info'
  cost_credits DECIMAL(10,4) DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_media_generations_tenant ON media_generations(tenant_id);
CREATE INDEX idx_media_generations_created ON media_generations(created_at DESC);

-- Templates médias par business
CREATE TABLE IF NOT EXISTS media_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  business_type TEXT NOT NULL, -- 'salon', 'restaurant', 'commerce'
  platform TEXT NOT NULL,
  theme TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  aspect_ratio TEXT,
  example_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Templates par défaut
INSERT INTO media_templates (name, business_type, platform, theme, prompt_template, aspect_ratio) VALUES
('Promo Salon Instagram', 'salon_coiffure', 'instagram', 'promotion',
 'Professional hair salon promotion post, modern aesthetic, vibrant colors, {text}', '1:1'),
('Event Restaurant Facebook', 'restaurant', 'facebook', 'event',
 'Restaurant event announcement, elegant design, food photography style, {text}', '16:9'),
('Info Commerce LinkedIn', 'commerce', 'linkedin', 'info',
 'Professional retail business post, clean corporate design, {text}', '1.91:1');

-- Usage tracking (pour facturation)
CREATE TABLE IF NOT EXISTS media_usage (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  month TEXT NOT NULL, -- 'YYYY-MM'
  images_generated INTEGER DEFAULT 0,
  videos_generated INTEGER DEFAULT 0,
  total_cost_credits DECIMAL(10,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_media_usage_tenant_month ON media_usage(tenant_id, month);

-- Comptes réseaux sociaux connectés
CREATE TABLE IF NOT EXISTS social_accounts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  platform TEXT NOT NULL, -- 'facebook', 'instagram', 'linkedin'
  access_token TEXT NOT NULL,
  page_id TEXT,
  ig_account_id TEXT,
  token_expires_at TIMESTAMP,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_social_accounts_tenant ON social_accounts(tenant_id);

-- Posts réseaux sociaux
CREATE TABLE IF NOT EXISTS social_posts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  post_id TEXT, -- ID du post sur la plateforme
  status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'published', 'error'
  scheduled_at TIMESTAMP,
  published_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_social_posts_tenant ON social_posts(tenant_id);
CREATE INDEX idx_social_posts_scheduled ON social_posts(status, scheduled_at);

-- Fonction increment usage
CREATE OR REPLACE FUNCTION increment_media_usage(
  p_tenant_id INTEGER,
  p_type TEXT,
  p_cost DECIMAL
)
RETURNS VOID AS $$
DECLARE
  v_month TEXT := TO_CHAR(NOW(), 'YYYY-MM');
BEGIN
  INSERT INTO media_usage (tenant_id, month, images_generated, videos_generated, total_cost_credits)
  VALUES (
    p_tenant_id,
    v_month,
    CASE WHEN p_type = 'image' THEN 1 ELSE 0 END,
    CASE WHEN p_type = 'video' THEN 1 ELSE 0 END,
    p_cost
  )
  ON CONFLICT (tenant_id, month)
  DO UPDATE SET
    images_generated = media_usage.images_generated + CASE WHEN p_type = 'image' THEN 1 ELSE 0 END,
    videos_generated = media_usage.videos_generated + CASE WHEN p_type = 'video' THEN 1 ELSE 0 END,
    total_cost_credits = media_usage.total_cost_credits + p_cost,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Log migration
INSERT INTO public.migration_log (
  schema_name,
  migration_file,
  status,
  created_at
) VALUES (
  'public',
  '004-media-generation.sql',
  'completed',
  NOW()
);

SELECT 'Media generation tables created' AS result;
