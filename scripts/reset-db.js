/**
 * Script de reset de la base de données
 * ATTENTION: Supprime toutes les données!
 * Usage: node scripts/reset-db.js
 */

import { createClient } from '@supabase/supabase-js';
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

// Ordre important pour respecter les contraintes de clés étrangères
const TABLES_TO_RESET = [
  'halimah_memory',
  'order_items',
  'orders',
  'reservations',
  'clients'
];

async function resetTable(tableName) {
  try {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .neq('id', 0);  // Supprime tout (astuce pour éviter l'erreur "no filters")

    if (error) {
      console.log(`⚠️  ${tableName}: ${error.message}`);
      return false;
    }

    // Vérifier le count
    const { count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    console.log(`✅ ${tableName}: vidée (${count || 0} enregistrements restants)`);
    return true;
  } catch (err) {
    console.log(`⚠️  ${tableName}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🗑️  RESET BASE DE DONNÉES - ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('⚠️  ATTENTION: Suppression de toutes les données...\n');

  for (const table of TABLES_TO_RESET) {
    await resetTable(table);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 VÉRIFICATION FINALE:');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Vérification finale
  for (const table of TABLES_TO_RESET) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    console.log(`   ${table}: ${count || 0} enregistrements`);
  }

  console.log('\n✅ Reset terminé');
}

main().catch(console.error);
