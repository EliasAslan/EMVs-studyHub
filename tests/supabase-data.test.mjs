import assert from 'node:assert/strict';
import { listUserRows, upsertUserRows } from '../js/services/supabaseData.js';

let calls;
function mockClient({ userId = 'user-a', authError = null, queryError = null, rows = [] } = {}) {
  calls = [];
  return {
    auth: {
      async getUser() {
        calls.push(['getUser']);
        return { data: { user: userId ? { id: userId } : null }, error: authError };
      },
    },
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            async eq(column, value) {
              calls.push(['eq', column, value]);
              return { data: rows, error: queryError };
            },
          };
        },
        async upsert(payload, options) {
          calls.push(['upsert', payload, options]);
          return { error: queryError };
        },
      };
    },
  };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

await test('listUserRows filters to the authenticated user', async () => {
  const client = mockClient({ rows: [{ id: 'm1', user_id: 'user-a' }] });
  const rows = await listUserRows(client, 'modules');
  assert.deepEqual(rows, [{ id: 'm1', user_id: 'user-a' }]);
  assert(calls.some((c) => c[0] === 'eq' && c[1] === 'user_id' && c[2] === 'user-a'));
});

await test('upsertUserRows overwrites a supplied user_id with session owner', async () => {
  const client = mockClient();
  const result = await upsertUserRows(client, 'modules', [
    { id: 'm1', user_id: 'user-b', code: 'DB1', title: 'Test', accent: '#b45309' },
  ]);
  assert.deepEqual(result, { written: 1 });
  const upsert = calls.find((c) => c[0] === 'upsert');
  assert.equal(upsert[1][0].user_id, 'user-a');
  assert.equal(upsert[2].onConflict, 'user_id,id');
});

await test('user_settings uses user_id as conflict target', async () => {
  const client = mockClient();
  await upsertUserRows(client, 'user_settings', [{ theme: 'dark' }]);
  const upsert = calls.find((c) => c[0] === 'upsert');
  assert.equal(upsert[2].onConflict, 'user_id');
  assert.equal(upsert[1][0].user_id, 'user-a');
});

await test('empty upsert is a no-op without a network call', async () => {
  const client = mockClient();
  assert.deepEqual(await upsertUserRows(client, 'modules', []), { written: 0 });
  assert.equal(calls.length, 0);
});

await test('rejects unsupported table names', async () => {
  await assert.rejects(() => listUserRows(mockClient(), 'auth.users'), /Unsupported/);
});

await test('rejects rows without stable ids', async () => {
  await assert.rejects(() => upsertUserRows(mockClient(), 'modules', [{ title: 'Missing id' }]), /id/);
});

await test('refuses operations without an authenticated user', async () => {
  await assert.rejects(() => listUserRows(mockClient({ userId: null }), 'modules'), /sign in|anmelden|supabase an/i);
});

await test('propagates Supabase errors', async () => {
  const error = new Error('RLS rejected write');
  await assert.rejects(() => upsertUserRows(mockClient({ queryError: error }), 'modules', [
    { id: 'm1', code: 'DB1', title: 'Test', accent: '#b45309' },
  ]), /RLS rejected write/);
});
