/**
 * Neon Auth + Data API client.
 *
 * Only the public Neon database URL belongs in a browser app. Database access
 * is protected by authenticated JWTs and per-user row-level security.
 */
import { createClient } from '@neon/neon-js/supabase';

export const NEON_DATABASE_URL =
  import.meta.env.VITE_NEON_DATABASE_URL ||
  'https://ep-polished-sunset-bdyv6pbx.c-8.us-east-2.aws.neon.tech/neondb';

export function isNeonConfigured() {
  return NEON_DATABASE_URL.startsWith('https://') && !NEON_DATABASE_URL.includes('PASTE_YOUR_');
}

let client = null;

export function getNeonClient() {
  if (!isNeonConfigured()) {
    throw new Error('Neon ist nicht konfiguriert.');
  }
  if (!client) client = createClient(NEON_DATABASE_URL);
  return client;
}
