/**
 * Script de backup de la base de données
 * Usage: node scripts/backup-db.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES_TO_BACKUP = [
  'clients',
  'reservations',
  'orders',
  'order_items',
  'messages',
  'halimah_memory',
  'halimah_facts'
];

async function backupTable(tableName) {
  try {
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' });

    if (error) {
      console.log(`⚠️  Table ${tableName}: ${error.message}`);
      return { table: tableName, count: 0, data: [], error: error.message };
    }

    console.log(`✅ ${tableName}: ${data?.length || 0} enregistrements`);
    return { table: tableName, count: data?.length || 0, data: data || [] };
  } catch (err) {
    console.log(`⚠️  Table ${tableName}: ${err.message}`);
    return { table: tableName, count: 0, data: [], error: err.message };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📦 BACKUP BASE DE DONNÉES - ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════\n');

  const backup = {
    timestamp: new Date().toISOString(),
    supabaseUrl: supabaseUrl.replace(/https?:\/\//, '').split('.')[0] + '.supabase.co',
    tables: {}
  };

  let totalRecords = 0;

  for (const table of TABLES_TO_BACKUP) {
    const result = await backupTable(table);
    backup.tables[table] = {
      count: result.count,
      data: result.data,
      error: result.error || null
    };
    totalRecords += result.count;
  }

  // Sauvegarder le fichier
  const backupPath = path.join(process.cwd(), 'docs/backup/db_backup_2026-01-25.json');
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`📊 TOTAL: ${totalRecords} enregistrements`);
  console.log(`💾 Sauvegardé dans: ${backupPath}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
