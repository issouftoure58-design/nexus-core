/**
 * Script de reset de halimah_memory (table avec UUID)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🗑️  Reset halimah_memory...');

  // Supprimer avec une condition qui matche tout
  const { error } = await supabase
    .from('halimah_memory')
    .delete()
    .gte('created_at', '1970-01-01');

  if (error) {
    console.log('⚠️  Erreur:', error.message);
  }

  // Vérifier
  const { count } = await supabase
    .from('halimah_memory')
    .select('*', { count: 'exact', head: true });

  console.log(`✅ halimah_memory: ${count || 0} enregistrements`);
}

main().catch(console.error);
