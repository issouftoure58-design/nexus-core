#!/usr/bin/env node
/**
 * CLI: Create a new tenant
 * Usage: node backend/src/cli/create-tenant.js <tenant_id> <business_name> [--domain=example.com]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const args = process.argv.slice(2);
const tenantId = args[0];
const businessName = args[1];
const domainArg = args.find(a => a.startsWith('--domain='));
const domain = domainArg ? domainArg.split('=')[1] : null;

if (!tenantId || !businessName) {
  console.error('Usage: node backend/src/cli/create-tenant.js <tenant_id> <business_name> [--domain=example.com]');
  console.error('Example: node backend/src/cli/create-tenant.js moncoiffeur "Mon Coiffeur Paris" --domain=moncoiffeur.com');
  process.exit(1);
}

if (!/^[a-z0-9_-]+$/.test(tenantId)) {
  console.error('Error: tenant_id must be lowercase alphanumeric with hyphens/underscores only');
  process.exit(1);
}

async function main() {
  // Check if tenant already exists
  const { data: existing } = await supabase.from('tenants').select('id').eq('id', tenantId).single();
  if (existing) {
    console.error(`Error: Tenant "${tenantId}" already exists`);
    process.exit(1);
  }

  // Create tenant
  const { data, error } = await supabase.from('tenants').insert({
    id: tenantId,
    name: businessName,
    domain: domain,
    plan: 'starter',
    status: 'active',
    settings: {},
  }).select().single();

  if (error) {
    console.error('Error creating tenant:', error.message);
    process.exit(1);
  }

  // Create admin user for the tenant
  const adminEmail = `admin@${domain || tenantId + '.nexus.dev'}`;
  const defaultPassword = 'changeme2026';

  const { error: adminError } = await supabase.from('admin_users').insert({
    email: adminEmail,
    password_hash: defaultPassword, // Should be hashed in production
    role: 'admin',
    tenant_id: tenantId,
  });

  if (adminError) {
    console.warn('Warning: Could not create admin user:', adminError.message);
  }

  console.log('\n✅ Tenant created successfully!\n');
  console.log(`  ID:       ${data.id}`);
  console.log(`  Name:     ${data.name}`);
  console.log(`  Domain:   ${data.domain || '(none)'}`);
  console.log(`  Plan:     ${data.plan}`);
  console.log(`  Admin:    ${adminEmail}`);
  console.log(`  Password: ${defaultPassword}`);
  console.log(`\n  To use: add header X-Tenant-ID: ${tenantId}\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
