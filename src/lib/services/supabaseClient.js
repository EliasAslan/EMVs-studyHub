/**
 * Supabase browser client.
 *
 * Only the public publishable key belongs in a browser app. Never put a
 * service_role key or database password here.
 */

import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://atotphhdrsjcxjtpptkg.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_uRP3ELY3TJtQRxuL0aS5Uw_gaxfKSKx';

export function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_URL.startsWith('https://') &&
      SUPABASE_PUBLISHABLE_KEY &&
      !SUPABASE_PUBLISHABLE_KEY.includes('PASTE_YOUR_'),
  );
}

let client = null;

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase ist nicht konfiguriert.');
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
