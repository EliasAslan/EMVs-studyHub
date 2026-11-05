# Study Hub

A calm, offline-first personal school hub for one EMVs apprentice doing the BM at BFO.
German UI (`de-CH`), English code and docs. Svelte 5 + Vite, no backend required for daily use.

The previous vanilla app is preserved on the `archive/vanilla-app` tag. This branch is the
clean-slate rebuild: new storage keys, new data model, new Supabase schema.

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the production build
npm test          # Vitest unit tests
```

Node 20+ is expected.

## What is in v1

- **Heute** — one "start here" item (earliest open homework, else next exam within 14 days),
  daily checklist, deadlines and recent notes.
- **Hausaufgaben** — open/done homework, module and topic filters, quick capture.
- **Module** — program → module → notes, homework, exams, links, topics and local PDFs/images.
- **Notizen** — global notes with optional module/topic, text or photo, `[[wiki links]]` and
  backlinks.
- **Prüfungen** — date, countdown, notes, Swiss grade 1–6 in .5 steps plus a free-text note.
  No averages.
- **Kalender** — month grid with homework and exam deadlines.
- **Links**, **Fokus** (standalone Pomodoro), **Einstellungen**.
- **PWA** — installable, app shell precached, works offline.
- **JSON backup** — export/import all state. Attachments never enter the JSON file.

Not in v1: email reminders (v1.1), tags, Markdown/ICS/CSV export, AI/PDF extraction.

## Architecture

| Concern | File |
|---|---|
| Bootstrap, global CSS | `src/main.js`, `src/app.css` |
| Router | `src/lib/router.js` |
| Pure data helpers | `src/lib/data/*.js` |
| Persistence + entity store | `src/lib/services/store.js`, `storageAdapter.js` |
| Reactive app store + mutators | `src/lib/stores/app.js` |
| Attachments (IndexedDB blobs) | `src/lib/services/attachments.js` |
| Pomodoro engine | `src/lib/services/pomodoro.js`, `pomodoroEngine.js` |
| JSON backup | `src/lib/services/backup.js` |
| Cloud mapping / sync | `src/lib/services/cloudMap.js`, `cloudSync.js` |
| Supabase client / row access | `src/lib/services/supabaseClient.js`, `supabaseData.js` |
| Sync status + German errors | `src/lib/services/syncStatus.js` |
| Reactive cloud store | `src/lib/stores/cloud.js` |
| Shell, navigation, palette | `src/lib/components/Shell.svelte`, `CommandPalette.svelte` |
| Views | `src/lib/views/*.svelte` |
| PWA manifest / icons | `public/manifest.webmanifest`, `public/icons/` |
| Supabase schema | `PHASE_6_SETUP.sql` |
| Unit tests | `tests/*.test.js` (Vitest) |

## Local data

| Key | Contents |
|---|---|
| `studyhub_v1` | whole app state as JSON |
| `studyhub_attachments_v1` | IndexedDB blobs for PDFs/photos |
| `studyhub_timer_v1` | focus timer state |
| `studyhub_pomodoro_prefs_v1` | focus preferences |
| `studyhub_sync_status_v1` | last sync attempt/success |
| `studyhub_cloud_uid_v1` | account binding for the last successful sync |

The old `emvs_data_v1` key is intentionally ignored. Attachments are limited to PDF/image,
max 40 MB, and stay on the device: never in JSON backups and never in Postgres.

Tombstones are kept for 90 days. Deleting a module cascades to its topics, notes, homework,
exams, links and lessons, and removes the module's attachment blobs.

## Cloud sync (Supabase)

Sync is optional. The device is the datastore; the cloud is a convergent copy.

1. Create/choose a Supabase project.
2. Run `PHASE_6_SETUP.sql` in the SQL editor. The rollback block at the top removes the
   archived vanilla-app tables and any previous v3 tables — **export a JSON backup first**.
3. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in
   `src/lib/services/supabaseClient.js`. Only the publishable/anon key belongs in the browser.
4. In Settings → Cloud, sign in or create an account with email/password.
5. Sync runs silently 25 s after the last local change, on sign-in, and when the tab becomes
   visible. Settings also has manual "Synchronisieren" and "Cloud laden" buttons.

Semantics:

- Last-write-wins by `updatedAt`; deletes are soft (`deleted_at` epoch ms).
- A live record newer than its tombstone revives it (undo/restore wins).
- Module deletion closes over children; topic deletion only clears references.
- Account binding prevents uploading local data into a different account.
- Empty local datasets never overwrite a non-empty cloud.
- Upload order is parent-first: programs → modules → topics → notes → homework → exams →
  links → lessons → checklist items → settings.
- After upload the app re-fetches and verifies every row; mismatches fail loudly without
  touching local data.

## Email reminders (v1.1)

Requires a Resend account and Supabase Edge Function. Never block v1 on this feature.

### Setup

1. **Create a Resend account** at [resend.com](https://resend.com). The free tier allows 30 emails/day.

2. **Verify a sender domain** in Resend (required for deliverability). Add a TXT record to your DNS:
   ```
   _resend._domainkey.yourdomain.com    (CNAME to s1.resend.net)
   _resend._domainkey.yourdomain.com    (TXT with publisher key)
   ```

3. **Set environment variables** in your Supabase project:
   - `RESEND_API_KEY` — Your Resend secret key from the dashboard
   - `SUPABASE_SERVICE_ROLE_KEY` — Required for the Edge Function to invoke admin functions

4. **Deploy the Edge Function**:
   - `supabase/functions/send-deadline-reminders/` contains the Edge Function code
   - Deploy with: `supabase functions deploy send-deadline-reminders`

5. **Set up pg_cron** to run the Edge Function weekly (e.g., Friday at 18:00 UTC):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   SELECT cron.schedule(
     '0 18 * * 5',  -- Every Friday at 18:00 UTC
     $$SELECT supabase_admin.invoke_function('send-deadline-reminders')$$
   );
   ```
   - Adjust the cron expression for Saturday: change `5` to `6`
   - Adjust the time by changing `18` to your preferred hour

6. **Configure Supabase credentials** in the Edge Function:
   - The function reads `RESEND_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from environment variables
   - Set these in the Supabase Dashboard → Functions → Reveal Secrets

### Usage

- In **Settings → Erinnerungen**, toggle "E-Mail-Erinnerungen" on
- Change the recipient email if needed (defaults to `e3953s@hotmail.com`)
- Click "Test-E-Mail senden" to verify the setup
- Emails are sent weekly with homework and exams due the next day

### Notes

- If `RESEND_API_KEY` is not configured, the "Test-E-Mail senden" button returns the email content for manual sending
- The app fully works without email reminders — it is a v1.1 feature, deferred from v1
- Opt-out anytime in Settings; no data is sent without explicit opt-in
- Failures show one quiet status dot plus a translated German message in Settings. No toasts,
  no blocking dialogs.

RLS: every table has `own_rows` (`auth.uid() = user_id`) and grants only to `authenticated`.
Attachments are metadata-only JSONB; blobs are never uploaded.

## PWA

`vite-plugin-pwa` generates the service worker at build time. `npm run build && npm run preview`
then install from the browser. The app shell and icons are precached, so reloading with the
server stopped still renders the app. There is no offline banner; sync is best-effort.

Regenerate icons with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\make-icons.ps1
```

## Tests

```bash
npm test
```

Vitest covers pure data helpers, persistence, checklist/deadlines/search, pomodoro,
attachments metadata, cloud row mapping, merge/LWW/tombstone behavior and upload verification.
The archived vanilla `.test.mjs` suites are not part of the rebuild test run.

## Out of scope for v1

- Email reminders (deferred to v1.1: Supabase Edge Function + Resend).
- Multiple users, sharing, social features.
- Streaks, scores, progress bars, percentages, averages or guilt mechanics.
- Server-side rendering.
