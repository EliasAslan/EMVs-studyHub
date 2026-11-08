# Study Hub

A calm, offline-first personal school hub for one EMVs apprentice doing the BM at BFO.
German UI (`de-CH`), English code and docs. Svelte 5 + Vite, no backend required for daily use.

This is the deliberately reduced v2 rebuild: new storage keys, new data model, new Supabase
schema, and a smaller, calmer feature set. The previous vanilla app is preserved on the
`archive/vanilla-app` tag and in Git history. There is no data migration from the old app:
the rebuild starts clean.

Current release: **v2.1.0** — adds the optional local AI assistant, module overview notes,
recurring homework, and an accessibility pass. Existing v2.0 data keeps working; see
[Upgrading from v2.0](#upgrading-from-v20).

## Quick start

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the production build
npm test          # Vitest unit tests
npm run test:e2e  # Playwright (Edge locally on Windows, Chromium in CI)
```

Node 22+ is expected (Vite 8). Playwright builds and previews the production app
automatically on `127.0.0.1:5173`. On systems without Edge, run
`npx playwright install chromium` once.

## What is in v2.1

- **Heute** — one "start here" item (earliest open homework, else next exam within 14 days),
  daily checklist, deadlines and recent notes.
- **Hausaufgaben** — open/done homework, module and topic filters, quick capture, and optional
  daily/weekly/monthly recurrence. Completing a recurring item creates exactly one next
  instance; it never duplicates on reload.
- **Module** — program → module → notes, homework, exams, links, topics and local PDFs/images,
  plus one overview note per module that is edited and linked like any other summary note.
- **Notizen** — global notes with optional module/topic, text or photo, `[[wiki links]]` and
  backlinks. Module overviews are normal summary notes, so they appear here too.
- **Prüfungen** — date, countdown, notes, Swiss grade 1–6 in .5 steps plus a free-text note.
  No averages.
- **Kalender** — month grid with homework and exam deadlines.
- **Links**, **Fokus** (Pomodoro timer with session history and statistics), **Einstellungen**.
- **Assistent (optional local AI)** — a chat page that reads your app data through `@` mentions
  (`@prüfungen`, `@hub`, `@M294`, `@notiz/<id>`, …), plus quiet draft buttons on notes and
  modules. Off by default; talks only to your own Ollama instance; chat history is never saved.
- **Mobile shell** — sidebar drawer below 900 px with focus trap and a bottom tab bar.
- **PWA** — installable, app shell precached, works offline.
- **JSON backup** — export/import all state. Attachments never enter the JSON file.
- **Cloud sync** — optional Supabase copy. The device stays the source of truth.
- **Email reminders** — optional weekly deadline email via Supabase Edge Function and Resend.

### Intentionally not ported

The vanilla app also had learning objectives with confidence/review history, weak spots and
the Today review queue, study sessions, module plan/resources, exam preparation/mock/results,
PDF import (including feeding PDFs to the local assistant), the captures inbox, and six
switchable navigation layouts. These are out of scope for v2. The archived app remains
available on the tag if one of them is needed later.

## Architecture

| Concern | File |
|---|---|
| Bootstrap, global CSS | `src/main.js`, `src/app.css` |
| Router | `src/lib/router.js` |
| Pure data helpers | `src/lib/data/*.js` |
| Recurrence math | `src/lib/data/recurrence.js` |
| AI defaults + URL helpers | `src/lib/data/aiConfig.js` |
| AI context, aliases, mentions | `src/lib/data/aiContext.js` |
| Local Ollama client | `src/lib/services/localAI.js` |
| Device-local AI settings | `src/lib/stores/ai.js` |
| Persistence + entity store | `src/lib/services/store.js`, `storageAdapter.js` |
| Reactive app store + mutators | `src/lib/stores/app.js` |
| Attachments (IndexedDB blobs) | `src/lib/services/attachments.js` |
| Pomodoro engine | `src/lib/services/pomodoro.js`, `pomodoroEngine.js` |
| JSON backup | `src/lib/services/backup.js` |
| Cloud mapping / sync | `src/lib/services/cloudMap.js`, `cloudSync.js` |
| Supabase client / row access | `src/lib/services/supabaseClient.js`, `supabaseData.js` |
| Sync status + German errors | `src/lib/services/syncStatus.js` |
| Reactive cloud store | `src/lib/stores/cloud.js` |
| Shell, navigation, palette | `src/lib/components/Shell.svelte`, `Palette.svelte` |
| Views | `src/lib/views/*.svelte` |
| PWA manifest / icons | `public/manifest.webmanifest`, `public/icons/` |
| Supabase schema | `PHASE_6_SETUP.sql` |
| Unit tests | `tests/*.test.js` (Vitest) |
| Browser tests | `e2e/study-hub-e2e.test.ts`, `e2e/v2-1-features.test.ts`, `e2e/a11y.test.ts` (Playwright) |

## Local data

| Key | Contents |
|---|---|
| `studyhub_v1` | whole app state as JSON |
| `studyhub_attachments_v1` | IndexedDB blobs for PDFs/photos |
| `studyhub_timer_v1` | focus timer state |
| `studyhub_pomodoro_prefs_v1` | focus preferences |
| `studyhub_pomodoro_history_v1` | completed focus sessions |
| `studyhub_sync_status_v1` | last sync attempt/success |
| `studyhub_cloud_uid_v1` | account binding for the last successful sync |
| `studyhub_ai_v1` | device-local AI on/off, base URL, model and context size; never synced |

The old `emvs_data_v1` key is intentionally ignored. There is no importer: the vanilla app and
the rebuild do not share data, and both start empty. Attachments are limited to PDF/image,
max 40 MB, and stay on the device: never in JSON backups and never in Postgres. AI settings are
also device-local: they are not part of the app state, JSON backup or cloud sync.

Tombstones are kept for 90 days. Deleting a module cascades to its topics, notes, homework,
exams, links and lessons, and removes the module's attachment blobs. Deleting a note clears the
module's overview reference instead of leaving a dangling id.

## Local AI assistant (optional)

The assistant is off by default. Nothing is sent anywhere until you enable it in
**Einstellungen → Lokale KI** and send a question. It only talks to the base URL you configure
(usually your own computer).

### Setup

1. Install [Ollama](https://ollama.com) and pull a model, for example:
   ```bash
   ollama pull qwen3:8b
   ```
2. Allow the app's origin to call Ollama. The default local origin is
   `http://localhost:5173`; add your production origin if you install the PWA from another host.
   For example, in PowerShell:
   ```powershell
   $env:OLLAMA_ORIGINS = "http://localhost:5173,https://your-production-origin.example"
   ollama serve
   ```
   On macOS/Linux:
   ```bash
   OLLAMA_ORIGINS="http://localhost:5173,https://your-production-origin.example" ollama serve
   ```
   If Ollama is already running as a service, set the variable in the service environment and
   restart it.
3. In **Einstellungen → Lokale KI**, enable the assistant. The defaults are
   `http://localhost:11434`, model `qwen3:8b`, context 8192 tokens. Use **Verbindung prüfen** to
   confirm the address and list available models.
4. Open **Assistent** in the sidebar. The navigation entry and all AI buttons only appear while
   the assistant is enabled.

### Usage

- Type `@` for the context menu: `@heute`, `@hausaufgaben`, `@module`, `@notizen`, `@prüfungen`,
  `@kalender`, `@links`, `@fokus`, `@seite` (last non-assistant page), `@hub` (whole-hub
  snapshot), module codes such as `@M294`, and stable picks such as `@notiz/<id>`.
- The context tray shows exactly what will be sent and the character budget. Long references are
  trimmed per section and overall.
- Deep links from notes and modules open the assistant with the reference and a suggested prompt:
  `#/assistant?ref=note:<id>` (also `module:<id>` / `exam:<id>`) and optional `&prompt=…`.
- Draft buttons on notes and modules open a preview. A draft is only written after you press
  **Übernehmen**; closing or failing leaves the original text untouched.
- Chat history is kept in memory for the current visit only. **Neu** clears it.

### Privacy and limits

- Requests go only to the configured base URL. There is no hosted AI service and no API key.
- AI configuration is stored in `studyhub_ai_v1` on this device and is never uploaded, synced or
  included in JSON backups.
- Chat messages and contexts are not persisted. The app does not log them.
- The model sees only the context blocks you include; attachments and file contents are not sent.
- The service is loaded lazily: AI-off users do not download the Ollama client.

### Troubleshooting

- **"Ollama nicht erreichbar" / CORS** — start Ollama with `OLLAMA_ORIGINS` set to the exact
  origin shown in the browser (scheme, host and port), then reload.
- **Model not found** — check the model name in Settings and run `ollama pull <model>`.
- **Timeout** — the first request can be slow while the model loads; try again, or choose a
  smaller model.
- **Nothing appears** — the assistant is disabled. Enable it in Settings; the page itself stays
  reachable at `#/assistant` but shows only the enable hint.

## Upgrading from v2.0

1. Open the new build. Local data is read from the same `studyhub_v1` key; no manual step is
   needed. New fields (`modules.overviewNoteId`, `homework.recurrence`) are additive and old
   records keep working.
2. If you use cloud sync, run `supabase/migrations/20261107_v2_1_fields.sql` once in the
   Supabase SQL editor. Fresh projects created from `PHASE_6_SETUP.sql` already include the
   columns.
3. Optional: enable the local assistant in Settings and follow the setup above.

Rolling back to v2.0 is safe for reading, but v2.0 ignores the new fields. Export a JSON backup
before downgrading if you care about overview or recurrence metadata.

## Cloud sync (Supabase)

Sync is optional. The device is the datastore; the cloud is a convergent copy.

1. Create/choose a Supabase project.
2. Run `PHASE_6_SETUP.sql` in the SQL editor. The optional §R rollback block drops the archived
   vanilla-app tables and any previous v3 tables. Skip it if you still need that data. For an
   existing v2.0 project, run `supabase/migrations/20261107_v2_1_fields.sql` instead; it only
   adds the new columns.
3. Optionally set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; the current project
   defaults live in `src/lib/services/supabaseClient.js`. Only the publishable/anon key belongs
   in the browser.
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

## Email reminders (optional)

Requires a Resend account and Supabase Edge Function. The app works fully without it.

### Setup

1. **Create a Resend account** at [resend.com](https://resend.com). The free tier allows 30 emails/day.

2. **Verify a sender domain** in Resend (required for deliverability). Add the DNS records shown
   in the Resend dashboard for your domain.

3. **Set environment variables** in your Supabase project:
   - `RESEND_API_KEY` — your Resend secret key from the dashboard
   - `SUPABASE_SERVICE_ROLE_KEY` — required for the Edge Function to invoke admin functions
   - `DEFAULT_REMINDER_EMAIL` — optional fallback when no address is set in the app

4. **Deploy the Edge Function**:
   ```bash
   supabase functions deploy send-deadline-reminders
   ```

5. **Set up pg_cron** to run the Edge Function weekly (e.g., Friday at 18:00 UTC):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   SELECT cron.schedule(
     '0 18 * * 5',
     $$SELECT supabase_admin.invoke_function('send-deadline-reminders')$$
   );
   ```
   - Adjust the cron expression for Saturday: change `5` to `6`
   - Adjust the time by changing `18` to your preferred hour

### Usage

- In **Settings → Erinnerungen**, toggle "E-Mail-Erinnerungen" on
- Set the recipient address there; the Edge Function uses that address
- Click "Test-E-Mail senden" to verify the setup
- Emails are sent weekly with homework and exams due the next day

### Notes

- If `RESEND_API_KEY` is not configured, the "Test-E-Mail senden" button returns the email
  content for manual sending
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
npm run test:e2e
```

Vitest covers pure data helpers, persistence, checklist/deadlines/search, recurrence math,
pomodoro, attachments metadata, AI context/aliases, the Ollama client, cloud row mapping,
merge/LWW/tombstone behavior and upload verification. Playwright covers the core desktop flows,
the mobile drawer, focus history, settings, AI gating with a fake Ollama stream, `@` mentions,
recurring homework, module overviews, keyboard-only AI flows, and axe-core WCAG 2.1 A/AA checks
on every main route (serious and critical findings fail the suite).

CI (`.github/workflows/ci.yml`) runs unit tests, the production build and Playwright on every
push to `main`/`rebuild/svelte` and on pull requests.

## Out of scope for v2.1

- Multiple users, sharing, social features.
- Streaks, scores, progress bars, percentages, averages or guilt mechanics.
- Server-side rendering.
- Hosted or cloud AI, chat history, and sending attachments or PDF contents to the model.
- Flashcards, spaced repetition and quizzes; study features stay calm.
- Porting the omitted vanilla features listed above.
