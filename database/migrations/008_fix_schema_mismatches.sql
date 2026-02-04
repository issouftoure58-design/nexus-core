-- Migration 008: Fix schema mismatches
-- Adds missing columns to parametres and services tables

-- Add missing column to parametres table
ALTER TABLE parametres
ADD COLUMN IF NOT EXISTS categorie VARCHAR(50);

-- Add missing column to services table
ALTER TABLE services
ADD COLUMN IF NOT EXISTS ordre INTEGER DEFAULT 0;

-- Update existing services with ordre values (optional, for proper ordering)
UPDATE services
SET ordre =
  CASE nom
    WHEN 'Tresses' THEN 1
    WHEN 'Nattes' THEN 2
    WHEN 'Vanilles' THEN 3
    WHEN 'Locks' THEN 4
    WHEN 'Défrisage' THEN 5
    WHEN 'Coloration' THEN 6
    ELSE 99
  END
WHERE ordre = 0;
