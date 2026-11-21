/**
 * Neon Auth + Data API client.
 *
 * Both URLs are public endpoints. Auth issues the session JWT; the Data API
 * attaches it to per-user, row-level secured database queries.
 */
import { createClient, SupabaseAuthAdapter } from '@neon/neon-js';

export const NEON_AUTH_URL =
  import.meta.env.VITE_NEON_AUTH_URL ||
  'https://ep-polished-sunset-bdyv6pbx.neonauth.c-8.us-east-2.aws.neon.tech/neondb/auth';

export const NEON_DATA_API_URL =
  import.meta.env.VITE_NEON_DATA_API_URL ||
  'https://ep-polished-sunset-bdyv6pbx.apirest.c-8.us-east-2.aws.neon.tech/neondb/rest/v1';

export function isNeonConfigured() {
  return NEON_AUTH_URL.startsWith('https://') && NEON_DATA_API_URL.startsWith('https://');
}

let client = null;

export function getNeonClient() {
  if (!isNeonConfigured()) {
    throw new Error('Neon Auth und Data API sind nicht konfiguriert.');
  }
  if (!client) {
    client = createClient({
      auth: { adapter: SupabaseAuthAdapter(), url: NEON_AUTH_URL },
      dataApi: { url: NEON_DATA_API_URL },
    });
  }
  return client;
}
