-- Migration 009: Create reservations view
-- Creates a view 'reservations' as an alias for 'rendezvous' table
-- This allows the admin API to use 'reservations' while keeping the original table name

-- Drop the view if it exists
DROP VIEW IF EXISTS reservations;

-- Create a view that mirrors the rendezvous table
CREATE VIEW reservations AS SELECT * FROM rendezvous;

-- Note: Views in PostgreSQL are read-only by default
-- For INSERT/UPDATE/DELETE operations through the view, we would need INSTEAD OF triggers
-- However, for now we'll keep the admin API using direct table access for writes
-- and only use the view for reads, or we could just use the table name directly in code

-- Alternative: Simply rename the table (simpler but more destructive)
-- ALTER TABLE rendezvous RENAME TO reservations;

-- Since the admin panel might need write operations, let's actually rename the table instead
DROP VIEW IF EXISTS reservations;
ALTER TABLE rendezvous RENAME TO reservations;
