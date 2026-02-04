// Réexportation du client Supabase depuis le serveur principal
import { supabase, rawSupabase } from '../../../server/supabase.ts';

export { supabase, rawSupabase };
export default supabase;
