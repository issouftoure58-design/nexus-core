-- Migration 010: Create payments table
-- Stores all payment transactions (Stripe & PayPal) for reservations and orders

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,

  -- Lien vers la réservation ou commande
  reservation_id INTEGER REFERENCES reservations(id) ON DELETE SET NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,

  -- Provider & IDs externes
  provider VARCHAR(20) NOT NULL, -- 'stripe', 'paypal'
  payment_intent_id TEXT,        -- Stripe PaymentIntent ID
  paypal_order_id TEXT,          -- PayPal Order ID
  paypal_capture_id TEXT,        -- PayPal Capture ID
  refund_id TEXT,                -- ID du remboursement (Stripe ou PayPal)

  -- Montants (en euros, NUMERIC pour precision)
  amount NUMERIC(10,2) NOT NULL,         -- Montant payé
  refund_amount NUMERIC(10,2) DEFAULT 0, -- Montant remboursé

  -- Type & Statut
  type VARCHAR(20) NOT NULL DEFAULT 'acompte', -- 'acompte', 'total'
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'

  -- Métadonnées
  metadata JSONB DEFAULT '{}',

  -- Multi-tenant
  tenant_id TEXT NOT NULL DEFAULT 'fatshairafro',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_payments_reservation_id ON payments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_intent_id ON payments(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_paypal_order_id ON payments(paypal_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at();
