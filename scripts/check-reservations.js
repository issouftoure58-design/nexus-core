import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await supabase
  .from('reservations')
  .select('id, service_nom, date, heure, statut, adresse_client, prix_total, created_via')
  .order('id', { ascending: false })
  .limit(3);

console.log('Dernières réservations:');
console.log(JSON.stringify(data, null, 2));
