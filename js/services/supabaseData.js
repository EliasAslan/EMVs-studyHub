/**
 * Explicit Supabase row access foundation.
 *
 * IMPORTANT:
 * - Not connected to activeAdapter; localStorage remains the app's datastore.
 * - No bulk migration, deletion, or automatic sync is performed here.
 * - Ownership is always taken from the authenticated Supabase session.
 */

const TABLES = Object.freeze({
  user_settings: 'user_id',
  modules: 'user_id,id',
  learning_objectives: 'user_id,id',
  resources: 'user_id,id',
  study_sessions: 'user_id,id',
  exams: 'user_id,id',
  exam_results: 'user_id,id',
  plan_items: 'user_id,id',
  captures: 'user_id,id',
  weekly_reviews: 'user_id,id',
});

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

/**
 * Fetch only the signed-in user's rows from an allowlisted table.
 * The explicit user_id filter complements database RLS.
 */
export async function listUserRows(client, table) {
  assertTable(table);
  const userId = await getAuthenticatedUserId(client);
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * Upsert rows for the signed-in user.
 * Any user_id supplied by the caller is overwritten with the session user.
 * This is a low-level primitive, not the migration/sync workflow.
 */
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

  const { error } = await client
    .from(table)
    .upsert(safeRows, { onConflict: conflictTarget });
  if (error) throw error;
  return { written: safeRows.length };
}
