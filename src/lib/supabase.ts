import { createClient } from "@supabase/supabase-js";

// Usato SOLO se NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sono
// presenti (vedi isSupabaseMode() in lib/store.ts). Lo schema SQL
// corrispondente è in supabase/schema.sql.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Variabili Supabase mancanti: configurazione in modalità file-locale.");
  }
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}
