#!/usr/bin/env node
/**
 * Seed tenant configs from JS files into Supabase tenants table.
 *
 * Works with the CURRENT table schema: id, name, domain, tier, status, settings
 * Full config is stored in the `settings` JSONB column.
 * After migration 011 is applied, run with --extended to also populate
 * the structured columns (slug, frozen, config, features, etc.)
 *
 * Usage:
 *   node scripts/seed-tenants-to-db.js            # Base columns only
 *   node scripts/seed-tenants-to-db.js --extended  # After migration 011
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const extendedMode = process.argv.includes('--extended');

// Import static tenant configs
const fatshairafro = (await import('../backend/src/config/tenants/fatshairafro.js')).default;
const decoevent = (await import('../backend/src/config/tenants/decoevent.js')).default;

const tenantConfigs = [fatshairafro, decoevent];

async function seedTenant(config) {
  const tenantId = config.id;

  const { data: existing } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .single();

  // Base row: only columns that exist in the current table
  const row = {
    name: config.name,
    domain: config.domain,
    tier: config.plan || 'starter',
    status: 'active',
    settings: config, // Full config stored in settings JSONB
  };

  // Extended columns (only after migration 011 is applied)
  if (extendedMode) {
    Object.assign(row, {
      slug: tenantId,
      assistant_name: config.assistantName || 'Nexus',
      gerante: config.gerante || null,
      telephone: config.telephone || null,
      adresse: config.adresse || null,
      concept: config.concept || null,
      secteur: config.secteur || null,
      ville: config.ville || null,
      frozen: config.frozen || false,
      nexus_version: config.nexusVersion || '1.0.0',
      features: config.features || {},
      limits_config: config.limits || {},
      branding: config.branding || {},
      config: config,
    });
  }

  if (existing) {
    const { error } = await supabase
      .from('tenants')
      .update(row)
      .eq('id', tenantId);
    if (error) throw new Error(`Update ${tenantId}: ${error.message}`);
    console.log(`  Updated: ${tenantId} (${config.name})`);
  } else {
    const { error } = await supabase
      .from('tenants')
      .insert({ id: tenantId, ...row });
    if (error) throw new Error(`Insert ${tenantId}: ${error.message}`);
    console.log(`  Inserted: ${tenantId} (${config.name})`);
  }
}

async function main() {
  console.log(`Seeding tenant configs into Supabase (mode: ${extendedMode ? 'extended' : 'base'})...\n`);

  for (const config of tenantConfigs) {
    await seedTenant(config);
  }

  // Verify
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, tier, status')
    .order('id');

  if (error) {
    console.error('\nVerification failed:', error.message);
  } else {
    console.log(`\nDone. ${data.length} tenants in DB:`);
    for (const t of data) {
      console.log(`  - ${t.id}: ${t.name} (tier=${t.tier}, status=${t.status})`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
