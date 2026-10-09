/**
 * Supabase browser client configuration.
 *
 * Only the public publishable/anon key belongs in a browser app.
 * NEVER put a service_role key or database password here.
 */
export const SUPABASE_URL = 'https://atotphhdrsjcxjtpptkg.supabase.co';

// Supabase Dashboard → Project Settings → API Keys → publishable key.
// Replace this placeholder before testing authentication.
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_uRP3ELY3TJtQRxuL0aS5Uw_gaxfKSKx';

export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL.startsWith('https://') &&
    SUPABASE_PUBLISHABLE_KEY &&
    !SUPABASE_PUBLISHABLE_KEY.includes('PASTE_YOUR_')
  );
}

let clientPromise = null;

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase ist noch nicht konfiguriert. Trage zuerst den Publishable Key in js/services/supabaseClient.js ein.');
  }

  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2')
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }))
      .catch(error => {
        clientPromise = null;
        throw error;
      });
  }

  return clientPromise;
}
