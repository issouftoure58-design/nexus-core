import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;

const migrationSQL = `
-- Create orders table
CREATE TABLE IF NOT EXISTS "orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer,
  "statut" text DEFAULT 'en_attente' NOT NULL,
  "sous_total" integer NOT NULL,
  "frais_deplacement" integer DEFAULT 0,
  "total" integer NOT NULL,
  "paiement_methode" text,
  "paiement_statut" text DEFAULT 'en_attente',
  "paiement_id" text,
  "paiement_date" timestamp,
  "lieu" text NOT NULL,
  "adresse_client" text,
  "distance_km" real,
  "duree_trajet_minutes" integer,
  "date_rdv" text NOT NULL,
  "heure_debut" text NOT NULL,
  "client_nom" text NOT NULL,
  "client_prenom" text,
  "client_telephone" text NOT NULL,
  "client_email" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS "order_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL,
  "service_nom" text NOT NULL,
  "service_description" text,
  "duree_minutes" integer NOT NULL,
  "prix" integer NOT NULL,
  "reservation_id" integer,
  "ordre" integer DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Add order_id to reservations if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reservations' AND column_name = 'order_id'
  ) THEN
    ALTER TABLE "reservations" ADD COLUMN "order_id" integer;
  END IF;
END $$;

-- Add foreign keys if not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'order_items_order_id_orders_id_fk'
  ) THEN
    ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_client_id_clients_id_fk'
  ) THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'reservations_order_id_orders_id_fk'
  ) THEN
    ALTER TABLE "reservations" ADD CONSTRAINT "reservations_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL;
  END IF;
END $$;
`;

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    await client.query(migrationSQL);
    console.log('Migration completed successfully!');

    // Verify tables exist
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('orders', 'order_items')
    `);
    console.log('Tables created:', result.rows.map(r => r.table_name).join(', '));

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
