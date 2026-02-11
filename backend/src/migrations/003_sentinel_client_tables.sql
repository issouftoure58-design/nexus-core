-- ============================================
-- MIGRATION 003 : SENTINEL CLIENT ANALYTICS
-- Dashboard Business Intelligence pour clients Business
-- ============================================

-- Extension UUID si pas deja presente
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE 1 : Snapshots quotidiens activite
-- ============================================
CREATE TABLE IF NOT EXISTS sentinel_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,

  -- Activite clients
  total_clients INTEGER DEFAULT 0,
  new_clients INTEGER DEFAULT 0,
  active_clients INTEGER DEFAULT 0,
  returning_clients INTEGER DEFAULT 0,

  -- Reservations
  total_reservations INTEGER DEFAULT 0,
  reservations_confirmed INTEGER DEFAULT 0,
  reservations_cancelled INTEGER DEFAULT 0,
  reservations_completed INTEGER DEFAULT 0,
  reservations_pending INTEGER DEFAULT 0,
  no_show_count INTEGER DEFAULT 0,

  -- Revenus
  revenue_total NUMERIC DEFAULT 0,
  revenue_paid NUMERIC DEFAULT 0,
  revenue_pending NUMERIC DEFAULT 0,
  average_basket NUMERIC DEFAULT 0,

  -- Taux de conversion
  conversion_rate NUMERIC, -- % visiteurs -> clients
  booking_rate NUMERIC, -- % demandes -> RDV confirmes
  completion_rate NUMERIC, -- % RDV confirmes -> termines
  no_show_rate NUMERIC, -- % RDV -> no-show
  cancellation_rate NUMERIC, -- % RDV -> annules

  -- Usage modules NEXUS
  crm_actions INTEGER DEFAULT 0,
  marketing_campaigns_sent INTEGER DEFAULT 0,
  marketing_emails_sent INTEGER DEFAULT 0,
  ai_conversations INTEGER DEFAULT 0,
  ai_messages_count INTEGER DEFAULT 0,
  sms_sent INTEGER DEFAULT 0,
  calls_count INTEGER DEFAULT 0,
  calls_minutes INTEGER DEFAULT 0,

  -- Top services du jour
  top_services JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_tenant_date ON sentinel_daily_snapshots(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON sentinel_daily_snapshots(date DESC);

-- ============================================
-- TABLE 2 : Couts detailles par jour
-- ============================================
CREATE TABLE IF NOT EXISTS sentinel_daily_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL,

  -- Couts API IA (Anthropic/OpenAI)
  ai_tokens_input INTEGER DEFAULT 0,
  ai_tokens_output INTEGER DEFAULT 0,
  ai_cost_eur NUMERIC DEFAULT 0,

  -- Couts SMS (Twilio)
  sms_sent INTEGER DEFAULT 0,
  sms_received INTEGER DEFAULT 0,
  sms_cost_eur NUMERIC DEFAULT 0,

  -- Couts voix (Twilio)
  voice_calls INTEGER DEFAULT 0,
  voice_minutes INTEGER DEFAULT 0,
  voice_cost_eur NUMERIC DEFAULT 0,

  -- Couts emails (Resend)
  emails_sent INTEGER DEFAULT 0,
  emails_cost_eur NUMERIC DEFAULT 0,

  -- Couts storage (Supabase)
  storage_mb_used NUMERIC DEFAULT 0,
  storage_cost_eur NUMERIC DEFAULT 0,

  -- Total
  total_cost_eur NUMERIC DEFAULT 0,

  -- Comparaison
  cost_vs_yesterday_percent NUMERIC, -- +/- % vs hier
  cost_vs_avg_7d_percent NUMERIC, -- +/- % vs moyenne 7j

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

CREATE INDEX IF NOT EXISTS idx_costs_tenant_date ON sentinel_daily_costs(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_costs_date ON sentinel_daily_costs(date DESC);

-- ============================================
-- TABLE 3 : Objectifs & KPIs
-- ============================================
CREATE TABLE IF NOT EXISTS sentinel_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(255) NOT NULL UNIQUE,

  -- Objectifs mensuels
  goal_revenue_monthly NUMERIC, -- Objectif CA mensuel
  goal_new_clients_monthly INTEGER, -- Objectif nouveaux clients/mois
  goal_reservations_monthly INTEGER, -- Objectif RDV/mois
  goal_conversion_rate NUMERIC, -- Objectif taux conversion %
  goal_completion_rate NUMERIC, -- Objectif taux completion %

  -- Objectifs hebdomadaires
  goal_revenue_weekly NUMERIC,
  goal_reservations_weekly INTEGER,

  -- Seuils alertes (notification si depasse)
  alert_no_show_rate_threshold NUMERIC DEFAULT 15.0, -- Alerte si > 15%
  alert_cancellation_rate_threshold NUMERIC DEFAULT 20.0, -- Alerte si > 20%
  alert_cost_daily_threshold NUMERIC DEFAULT 50.0, -- Alerte si > 50EUR/jour
  alert_low_booking_threshold INTEGER DEFAULT 3, -- Alerte si < 3 RDV/jour

  -- Notifications preferences
  notify_daily_summary BOOLEAN DEFAULT true,
  notify_weekly_report BOOLEAN DEFAULT true,
  notify_goal_achieved BOOLEAN DEFAULT true,
  notify_alerts BOOLEAN DEFAULT true,
  notification_email VARCHAR(255),
  notification_phone VARCHAR(20),

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_tenant ON sentinel_goals(tenant_id);

-- ============================================
-- TABLE 4 : Insights & Recommandations IA
-- ============================================
CREATE TABLE IF NOT EXISTS sentinel_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Type et categorie
  insight_type VARCHAR(50) NOT NULL CHECK (insight_type IN ('opportunity', 'warning', 'tip', 'trend', 'achievement')),
  category VARCHAR(50) NOT NULL CHECK (category IN ('revenue', 'clients', 'marketing', 'operations', 'costs', 'performance')),

  -- Contenu
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,

  -- Donnees support (pour afficher graphiques)
  data_snapshot JSONB,
  comparison_period VARCHAR(20), -- 'week', 'month', 'quarter'

  -- Impact estime
  impact_type VARCHAR(50), -- 'revenue_increase', 'cost_reduction', 'time_saving', 'client_retention'
  impact_value NUMERIC, -- Ex: 500 (euros), 20 (%), 2 (heures)
  impact_unit VARCHAR(20), -- 'eur', 'percent', 'hours', 'clients'

  -- Actions suggerees
  suggested_actions JSONB DEFAULT '[]', -- [{action: "...", priority: 1-5, effort: "low|medium|high"}]

  -- Gestion
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'implemented', 'expired')),

  -- Timestamps
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL = pas d'expiration
  dismissed_at TIMESTAMPTZ,
  dismissed_reason TEXT,
  implemented_at TIMESTAMPTZ,
  implemented_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_insights_tenant ON sentinel_insights(tenant_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_insights_active ON sentinel_insights(tenant_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_insights_type ON sentinel_insights(insight_type, generated_at DESC);

-- ============================================
-- VUE : Resume dashboard pour tenant
-- ============================================
CREATE OR REPLACE VIEW sentinel_dashboard_summary AS
SELECT
  s.tenant_id,

  -- Aujourd'hui
  (SELECT COALESCE(SUM(revenue_paid), 0) FROM sentinel_daily_snapshots WHERE tenant_id = s.tenant_id AND date = CURRENT_DATE) as revenue_today,
  (SELECT COALESCE(SUM(total_reservations), 0) FROM sentinel_daily_snapshots WHERE tenant_id = s.tenant_id AND date = CURRENT_DATE) as reservations_today,
  (SELECT COALESCE(SUM(new_clients), 0) FROM sentinel_daily_snapshots WHERE tenant_id = s.tenant_id AND date = CURRENT_DATE) as new_clients_today,

  -- 7 derniers jours
  (SELECT COALESCE(SUM(revenue_paid), 0) FROM sentinel_daily_snapshots WHERE tenant_id = s.tenant_id AND date >= CURRENT_DATE - 7) as revenue_7d,
  (SELECT COALESCE(SUM(total_reservations), 0) FROM sentinel_daily_snapshots WHERE tenant_id = s.tenant_id AND date >= CURRENT_DATE - 7) as reservations_7d,
  (SELECT COALESCE(SUM(new_clients), 0) FROM sentinel_daily_snapshots WHERE tenant_id = s.tenant_id AND date >= CURRENT_DATE - 7) as new_clients_7d,
  (SELECT COALESCE(AVG(no_show_rate), 0) FROM sentinel_daily_snapshots WHERE tenant_id = s.tenant_id AND date >= CURRENT_DATE - 7) as avg_no_show_rate_7d,

  -- 30 derniers jours
  (SELECT COALESCE(SUM(revenue_paid), 0) FROM sentinel_daily_snapshots WHERE tenant_id = s.tenant_id AND date >= CURRENT_DATE - 30) as revenue_30d,
  (SELECT COALESCE(SUM(total_reservations), 0) FROM sentinel_daily_snapshots WHERE tenant_id = s.tenant_id AND date >= CURRENT_DATE - 30) as reservations_30d,
  (SELECT COALESCE(SUM(new_clients), 0) FROM sentinel_daily_snapshots WHERE tenant_id = s.tenant_id AND date >= CURRENT_DATE - 30) as new_clients_30d,

  -- Couts 30 derniers jours
  (SELECT COALESCE(SUM(total_cost_eur), 0) FROM sentinel_daily_costs WHERE tenant_id = s.tenant_id AND date >= CURRENT_DATE - 30) as costs_30d,

  -- Insights actifs
  (SELECT COUNT(*) FROM sentinel_insights WHERE tenant_id = s.tenant_id AND status = 'active') as active_insights,
  (SELECT COUNT(*) FROM sentinel_insights WHERE tenant_id = s.tenant_id AND status = 'active' AND priority >= 8) as high_priority_insights

FROM (SELECT DISTINCT tenant_id FROM sentinel_daily_snapshots) s;

-- ============================================
-- COMMENTAIRES
-- ============================================
COMMENT ON TABLE sentinel_daily_snapshots IS 'Snapshots quotidiens activite business par tenant';
COMMENT ON TABLE sentinel_daily_costs IS 'Couts utilisation NEXUS par tenant par jour';
COMMENT ON TABLE sentinel_goals IS 'Objectifs et KPIs configures par tenant';
COMMENT ON TABLE sentinel_insights IS 'Insights et recommandations IA pour optimisation business';
