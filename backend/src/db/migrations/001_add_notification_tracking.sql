-- Migration: Add notification tracking columns to rendezvous table
-- Date: 2026-01-17
-- Description: Tracks which notifications have been sent to avoid duplicates

-- WhatsApp confirmation sent after payment
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS whatsapp_confirmation_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS whatsapp_confirmation_date TIMESTAMP;

-- WhatsApp reminder sent J-1
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS whatsapp_rappel_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS whatsapp_rappel_date TIMESTAMP;

-- Thank you message sent J+1
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS remerciement_envoye BOOLEAN DEFAULT FALSE;
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS remerciement_date TIMESTAMP;

-- Review request sent J+2
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS demande_avis_envoyee BOOLEAN DEFAULT FALSE;
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS demande_avis_date TIMESTAMP;
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS avis_token TEXT;

-- Email tracking (mirrors WhatsApp)
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS email_confirmation_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE rendezvous ADD COLUMN IF NOT EXISTS email_rappel_sent BOOLEAN DEFAULT FALSE;

-- Create index for faster queries on notification status
CREATE INDEX IF NOT EXISTS idx_rendezvous_notifications
ON rendezvous (date, statut, remerciement_envoye, demande_avis_envoyee);

-- Comment for documentation
COMMENT ON COLUMN rendezvous.whatsapp_confirmation_sent IS 'WhatsApp confirmation sent after payment';
COMMENT ON COLUMN rendezvous.whatsapp_rappel_sent IS 'WhatsApp reminder sent day before appointment';
COMMENT ON COLUMN rendezvous.remerciement_envoye IS 'Thank you message sent day after appointment';
COMMENT ON COLUMN rendezvous.demande_avis_envoyee IS 'Review request sent 2 days after appointment';
COMMENT ON COLUMN rendezvous.avis_token IS 'Secure token for review form link';
