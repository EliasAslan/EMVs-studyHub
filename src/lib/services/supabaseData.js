/**
 * Explicit Supabase row access.
 *
 * localStorage remains the app datastore; these helpers only move rows for
 * the signed-in user. Ownership always comes from the authenticated session,
 * never from app data or a caller-supplied user_id.
 */

const TABLES = Object.freeze({
  programs: 'user_id,id',
  modules: 'user_id,id',
  topics: 'user_id,id',
  notes: 'user_id,id',
  homework: 'user_id,id',
  exams: 'user_id,id',
  links: 'user_id,id',
  lessons: 'user_id,id',
  checklist_items: 'user_id,id',
  user_settings: 'user_id',
});

export const ALLOWED_TABLES = Object.freeze(Object.keys(TABLES));

function assertTable(table) {
  if (!Object.hasOwn(TABLES, table)) {
    throw new TypeError(`Unsupported Supabase table: ${table}`);
  }
}

async function getAuthenticatedUserId(client) {
  if (!client?.auth?.getUser) {
    throw new TypeError('A Supabase client is required.');
  }
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  const userId = data?.user?.id;
  if (!userId) throw new Error('Bitte melde dich zuerst bei Supabase an.');
  return userId;
}

/** Fetch only the signed-in user's rows from an allowlisted table. */
export async function listUserRows(client, table) {
  assertTable(table);
  const userId = await getAuthenticatedUserId(client);
  const { data, error } = await client.from(table).select('*').eq('user_id', userId);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** Upsert rows for the signed-in user; caller-supplied user_id is overwritten. */
export async function upsertUserRows(client, table, rows) {
  assertTable(table);
  if (!Array.isArray(rows)) throw new TypeError('Rows must be an array.');
  if (rows.length === 0) return { written: 0 };

  const userId = await getAuthenticatedUserId(client);
  const conflictTarget = TABLES[table];
  const safeRows = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError('Each row must be an object.');
    }
    if (table !== 'user_settings' && (typeof row.id !== 'string' || !row.id)) {
      throw new TypeError(`Every ${table} row must have a non-empty string id.`);
    }
    return { ...row, user_id: userId };
  });

  const { error } = await client.from(table).upsert(safeRows, { onConflict: conflictTarget });
  if (error) throw error;
  return { written: safeRows.length };
}
