# PHASE 2 — Schema Proposal: EMVS Study Hub → Supabase

> Status: **PROPOSAL ONLY — nothing has been applied.**
> The Supabase project is still empty (no tables, no users), the app still uses
> `localStorage` via `activeAdapter`, and no credentials exist in this repo.
> The draft SQL in the appendix is **not yet applied** and must not be run
> until the decisions in §6 are approved.

Codebase audited: `js/services/store.js`, `js/services/storageAdapter.js`,
`js/app.js`, all files in `js/views/` (18), `js/components/` (4),
`js/utils/helpers.js`, plus `package.json`, `server.js`, `README.md`.
Branch `Storage-and-AI`; Phase-1 changes (`store.js` + `storageAdapter.js`)
are the only working-tree modifications.

---

## 1. Inventory of the actual existing data model

### 1.1 Storage layout today

- Two `localStorage` keys: `emvs_data_v1` (whole app state, one JSON document)
  and `emvs_timer_v1` (ephemeral timer), `js/services/store.js:7-8`.
- `CURRENT_SCHEMA_VERSION = 1`; `MIGRATION_KEY` (`store.js:9`) is defined but
  never read/written — dead constant, migration is driven by
  `parsed.schemaVersion` in `load()` (`store.js:118-175`).
- Persistence pattern: whole-state `save(state)` after every mutation via
  `window.EMVS.save()` (`js/app.js:21-32`). There are no per-entity writes.
- IDs: client-generated strings
  `Date.now().toString(36) + '-' + random` (`store.js:16-18`); stable across
  edit/export/import/reorder by design. Every entity carries `id`, `createdAt`,
  `updatedAt` (epoch-ms numbers); `importData()` backfills any missing ones
  (`store.js:706-713`).
- Every destructive action is confirmation-gated (`confirm()` in views,
  `confirmDialog()` in settings): objective delete, resource delete, session
  delete, exam delete, plan-item delete/drop, capture delete, review delete,
  module delete (cascade), full reset, timer discard, mock discard.
- JSON backup: `exportData()` downloads `emvs-backup-YYYY-MM-DD.json`
  (`store.js:669-677`). `importData()` requires 9 arrays
  (`modules, learningObjectives, resources, studySessions, exams, examResults,
  planItems, captures, weeklyReviews`), fills `schemaVersion`/`settings`,
  backfills ids/timestamps, runs all `ensure*Fields` normalizers, and returns
  `{success, data?, error?}` without touching storage itself
  (`store.js:683-728`). The caller (`js/views/settings.js:importBackup`)
  replaces whole state on success.
- Legacy migration: `migrateFromLegacy()` reads raw strings from
  `emvs_hub_v4_editorial` / `sf_tracker_v5` (via `readLegacyStorage()`,
  `store.js:207-218`), used both for first-run seeding and v0→v1 upgrades.
- Config: `package.json` has **zero dependencies** (only `start: node server.js`);
  `server.js` is a static file server on `127.0.0.1:8080`. No framework, no
  test suite, no build step. ES modules loaded directly in the browser.

### 1.2 Entity inventory (verified field-by-field against views)

**modules** — created in `overview.js:88`, `settings.js:186`; edited inline in
`settings.js:105-128`.
`{id, code*, title*, accent (default '#b45309'), targetGrade (default 5.0,
parseFloat||5.0, input 1–6 step 0.1), createdAt, updatedAt}`.
`*` = required non-empty (`code` uppercased+trimmed, `title` trimmed).

**learningObjectives** — `module-objectives.js:388`.
`{id, moduleId→modules, number* (int ≥1, default max+1 within module),
title*, description (default ''), status ('todo'|'in-progress'|'done',
default 'todo'; NEVER in forms — only via `markUnderstood`/`reopenObjective`,
`store.js:472-498`), confidence (0–5 int, default 0, toggle-off semantics),
notes, confidenceHistory [{value, timestamp}],
sessionHistory [{sessionId, date, duration, note}] (cap 20, newest first),
reviewHistory [{timestamp, outcome 'solid'|'shaky'|'lost', interval,
promisedInterval, nextReview, note?}], lastTouched (ms),
lastReviewed (ms|null), totalStudyTime (minutes), reviewSchedule
({interval, nextReview, reviewCount}|null), createdAt, updatedAt}`.
Spaced-repetition ladder `REVIEW_INTERVALS = [1,4,10,21,45,90]` days
(`store.js:379`). `ensureObjectiveFields` (`store.js:391-413`) backfills all of
the above on load/import/recalc.
⚠️ Known gap (verified): deleting an objective filters only
`state.learningObjectives`; `linkedObjectiveIds`/`objectiveResults` elsewhere
keep dangling ids.

**resources** — `module-resources.js:429`. Used ≠ understood is a hard invariant.
`{id, moduleId, name*, type (RESOURCE_TYPES=`Video, Exercise, Dataset,
Project, Cheat Sheet, Article, Book, Other`, `helpers.js:767`; default
'Video', legacy 'Other'), focus ('70'|'30'|custom string), status
('todo'|'in-progress'|'done', default 'todo'; not editable in modal),
url (default ''), linkedObjectiveIds [], notes, usageHistory
[{timestamp, sessionId?, note?}], understood (bool, default false),
understoodAt (ms|null), understoodHistory [{timestamp, value}],
lastUsed (ms|null), createdAt, updatedAt}`.
`markResourceUsed` never touches `understood`; `setResourceUnderstood` is the
only writer of understanding (`store.js:535-568`).
Delete cascades *outward*: unlinks `studySessions[].linkedResourceIds`.

**studySessions** — `module-sessions.js:274` (manual) and `:452` (post-timer);
mock sessions in `mock-exam.js:404-414`.
`{id, moduleId, startTime (ISO string), duration (int minutes, 1–480,
default 30; timer-derived = max(1, round(elapsedMs/60000))),
linkedObjectiveIds [], linkedResourceIds [], note, createdAt, updatedAt}`.
Creating appends to objectives via `updateObjectiveHistory`
(`store.js:771-799`); editing/deleting triggers full
`recalculateObjectiveHistory` (`store.js:810-831`).

**exams** — `module-exams.js:384`; mocks in `mock-exam.js:381-400`.
`{id, moduleId, name*, date ('YYYY-MM-DD' or ''), weight (int 0–100,
parseInt||0; mocks always 0), score/max (**strings**, '' = ungraded; mocks
store **numbers** — mixed types in the wild), linkedObjectiveIds [],
objectiveResults [{objectiveId, rating 'weak'|'okay'|'strong'|null,
note}], description, isMock (bool, default false),
durationMin (number, mock-only extra; preserved because `ensureExamFields`
mutates in place, `store.js:597-609`), createdAt, updatedAt}`.
Grades are **derived, never stored**: `getExamGrade = 1 + 5·(score/max)`
(`helpers.js:102-107`); projection excludes `isMock`
(`helpers.js:109-121`); `getNextExam` excludes mocks/graded/dateless
(`helpers.js:27-29`). Delete cascades to `examResults` by `examId`.

**examResults** — `{id, examId, moduleId, score/max (numbers), grade,
date, objectiveResults [], notes, createdAt}` — shape exists **only** in the
legacy-migration writer (`store.js:298-313`). No view creates or edits them
today (only two cascade-delete filters: `module-exams.js:139`,
`settings.js:163`). Effectively a **legacy read-mostly collection**.

**planItems** — `module-plan.js:340`.
`{id, moduleId, week (int 1–53, default current ISO week), title (default
'Woche W'), text*, type ('task'|'milestone'|'review', `helpers.js:780`),
linkedObjectiveIds [], linkedResourceIds [], done (bool), dropped (bool),
notes, dueDate (date-string|null), createdAt, updatedAt}`.
Drop ≠ delete (explicit deprioritize, row kept).

**captures** — `captures.js:262` (quick) and `:296` (full editor).
`{id, type* ('question'|'term'|'resource'|'mistake'|'thought',
`helpers.js:770`; default 'thought'), content* (non-empty), moduleId (nullable),
objectiveId (nullable), tags (string[]; comma-split in full editor),
timestamp (ISO, **immutable on edit**), createdAt, updatedAt}`.

**weeklyReviews** — `weekly-review.js:176-192`.
`{id, week (1–53), year (2020–2030), moduleId (nullable = global/all-modules),
moduleTitle (denormalized snapshot), wentWell, didntWork, nextWeek (the three
asked QUESTIONS, `weekly-review.js:20-23`), learned, adjustments (legacy,
preserved untouched, no longer asked), studyTime, sessionsCount,
objectivesReviewed (snapshots recomputed on save), createdAt, updatedAt}`.
App-level dedup: one review per week+year+scope (find-or-edit,
`weekly-review.js:168-174`).

**settings** (single object, not array): `{theme ('light'|'dark'),
currentModuleId (string|null)}`.

**timer state** (separate key, never in backups): `{moduleId, plannedMinutes,
startTime (epoch ms), pausedTime (accumulated ms), running (bool)}`
(`module-sessions.js`; read in `module-home.js` via `loadTimerState`).

### 1.3 Relationship map (as enforced *in code* today)

- `modules 1—n` objectives / resources / sessions / exams / examResults /
  planItems / captures / weeklyReviews via `moduleId` (app-level cascade on
  module delete, `settings.js:158-166`; `currentModuleId` falls back to first
  module or null).
- `exams 1—n` examResults via `examId` (cascade on exam delete).
- `captures n—1` objectives via nullable `objectiveId` (no cascade; SET NULL
  semantics on objective delete are implicit).
- Everything else is **id arrays inside documents**:
  `linkedObjectiveIds`, `linkedResourceIds`, `objectiveResults[].objectiveId`,
  `usageHistory[].sessionId`, `sessionHistory[].sessionId` — no DB-level
  integrity possible today; repair is app-level (`syncExamObjectives`,
  `recalculateObjectiveHistory`).

---

## 2. Proposed tables, columns, types, relationships

One table per collection + one settings row per user. Timer state stays
**local-only** (see §6, decision D4).

Conventions: `id TEXT PRIMARY KEY` (preserves existing client-generated stable
ids and all relationships byte-for-byte — see decision D1); `user_id UUID NOT
NULL REFERENCES auth.users(id) ON DELETE CASCADE` on every row table;
timestamps as `BIGINT` epoch-ms (`created_at`, `updated_at`) to stay
backup-compatible with `Date.now()` values; ISO timestamps map to
`TIMESTAMPTZ`; `exams.date`/`planItems.dueDate` map `''` → `NULL DATE`;
enums as `TEXT + CHECK` (simpler than PG enums for a student project; the app
already owns the vocabularies in `helpers.js:767-780`).

| Table | Key columns (beyond `id`, `user_id`, `created_at`, `updated_at`) |
|---|---|
| `modules` | `code TEXT NOT NULL`, `title TEXT NOT NULL`, `accent TEXT NOT NULL DEFAULT '#b45309'`, `target_grade DOUBLE PRECISION NOT NULL DEFAULT 5.0 CHECK (1–6)` |
| `learning_objectives` | `module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE`, `number INT NOT NULL`, `title TEXT NOT NULL`, `description TEXT NOT NULL DEFAULT ''`, `status TEXT NOT NULL DEFAULT 'todo' CHECK (…)`, `confidence INT NOT NULL DEFAULT 0 CHECK (0–5)`, `notes TEXT NOT NULL DEFAULT ''`, `confidence_history JSONB NOT NULL DEFAULT '[]'`, `session_history JSONB NOT NULL DEFAULT '[]'`, `review_history JSONB NOT NULL DEFAULT '[]'`, `last_touched BIGINT NOT NULL`, `last_reviewed BIGINT`, `total_study_time INT NOT NULL DEFAULT 0`, `review_schedule JSONB` (nullable `{interval,nextReview,reviewCount}`) |
| `resources` | `module_id …CASCADE`, `name TEXT NOT NULL`, `type TEXT NOT NULL DEFAULT 'Video' CHECK (…)`, `focus TEXT NOT NULL DEFAULT '70'`, `status TEXT NOT NULL DEFAULT 'todo' CHECK (…)`, `url TEXT NOT NULL DEFAULT ''`, `linked_objective_ids TEXT[] NOT NULL DEFAULT '{}'`, `notes TEXT NOT NULL DEFAULT ''`, `usage_history JSONB NOT NULL DEFAULT '[]'`, `understood BOOLEAN NOT NULL DEFAULT FALSE`, `understood_at BIGINT`, `understood_history JSONB NOT NULL DEFAULT '[]'`, `last_used BIGINT` |
| `study_sessions` | `module_id …CASCADE`, `start_time TIMESTAMPTZ NOT NULL`, `duration INT NOT NULL CHECK (1–480)`, `linked_objective_ids TEXT[] NOT NULL DEFAULT '{}'`, `linked_resource_ids TEXT[] NOT NULL DEFAULT '{}'`, `note TEXT NOT NULL DEFAULT ''` |
| `exams` | `module_id …CASCADE`, `name TEXT NOT NULL`, `date DATE` (NULL = undated), `weight INT NOT NULL DEFAULT 0 CHECK (0–100)`, `score TEXT NOT NULL DEFAULT ''`, `max TEXT NOT NULL DEFAULT ''` (**TEXT deliberately**: app stores `''` for ungraded and numbers for mocks — adapter normalizes on read; see §4), `linked_objective_ids TEXT[] NOT NULL DEFAULT '{}'`, `objective_results JSONB NOT NULL DEFAULT '[]'`, `description TEXT NOT NULL DEFAULT ''`, `is_mock BOOLEAN NOT NULL DEFAULT FALSE`, `duration_min INT` (mock-only, nullable) |
| `exam_results` (legacy, read-mostly) | `exam_id TEXT REFERENCES exams(id) ON DELETE CASCADE`, `module_id …CASCADE`, `score/max DOUBLE PRECISION`, `grade DOUBLE PRECISION`, `date DATE`, `objective_results JSONB NOT NULL DEFAULT '[]'`, `notes TEXT NOT NULL DEFAULT ''` |
| `plan_items` | `module_id …CASCADE`, `week INT NOT NULL CHECK (1–53)`, `title TEXT NOT NULL`, `text TEXT NOT NULL`, `type TEXT NOT NULL DEFAULT 'task' CHECK (…)`, `linked_objective_ids/linked_resource_ids TEXT[] DEFAULT '{}'`, `done/dropped BOOLEAN DEFAULT FALSE`, `notes TEXT DEFAULT ''`, `due_date DATE` (nullable) |
| `captures` | `module_id TEXT REFERENCES modules(id) ON DELETE CASCADE` (nullable), `objective_id TEXT REFERENCES learning_objectives(id) ON DELETE SET NULL` (nullable), `type TEXT NOT NULL CHECK (…)`, `content TEXT NOT NULL`, `tags TEXT[] NOT NULL DEFAULT '{}'`, `timestamp TIMESTAMPTZ NOT NULL` |
| `weekly_reviews` | `week INT CHECK (1–53)`, `year INT CHECK (2020–2030)`, `module_id …CASCADE` (nullable = global), `module_title TEXT DEFAULT ''`, `went_well/didnt_work/next_week/learned/adjustments TEXT DEFAULT ''`, `study_time/sessions_count/objectives_reviewed INT DEFAULT 0` |
| `user_settings` | `user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `theme TEXT NOT NULL DEFAULT 'light' CHECK (…)`, `current_module_id TEXT REFERENCES modules(id) ON DELETE SET NULL`, `updated_at BIGINT NOT NULL` |

Indexes (minimal): `(user_id)` on every row table; `(user_id, module_id)`
on module-scoped tables; `(user_id, updated_at DESC)` for sync ordering.

**Relational vs JSONB — trade-offs (as applied here):**
- *Native columns* for anything the app filters/sorts/validates or that has
  cross-row meaning: ids, `module_id`, `status/type/confidence/week/year`,
  dates, `weight`, `is_mock`, `done/dropped`, `understood`. These get CHECKs,
  FKs, and indexes.
- *`TEXT[]`* for link-id arrays (`linked_*_ids`, `tags`): the app treats them
  as opaque sets (membership tests in JS, never joins); a GIN index is enough.
  Full junction tables would give referential integrity but ~5 extra tables
  and complex sync code for zero current query benefit — revisit only if
  SQL-side link queries are ever needed.
- *`JSONB`* for append-only history logs (`*_history`, `objective_results`,
  `review_schedule`): write-once/read-whole, variable shape, never filtered in
  SQL. Keeps rows backup-identical to localStorage. Cost accepted: no FK
  enforcement inside these blobs (matches today's app-level repair model).

---

## 3. Ownership and RLS policy design

- Every row carries `user_id`; `user_settings.user_id` **is** the PK (one row
  per user). All FKs are scoped to the same owner implicitly through RLS.
- `ENABLE ROW LEVEL SECURITY` on all 10 tables; default-deny (no permissive
  policies = no access, including for `anon`).
- One `FOR ALL` policy per table (student-project simplicity over
  per-operation split):
  `CREATE POLICY "own rows" ON <t> FOR ALL TO authenticated
   USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`
- `user_settings`: same pattern (`USING/WITH CHECK (auth.uid() = user_id)`).
- Deletion semantics mirror the app: `ON DELETE CASCADE` from `modules` to all
  module-scoped rows and `exams → exam_results` (exactly the two cascades the
  app performs today); `captures.objective_id → SET NULL`;
  `user_settings.current_module_id → SET NULL` (adapter then applies the
  existing "first module or null" fallback). Auth-user deletion cascades
  everything via `user_id`.
- ⚠️ NOT claimed as working: policies are designed, not implemented or tested
  (§6, risk R3). Testing with two users (A must never read B's rows, anon gets
  nothing) is an explicit Phase-3 gate.

---

## 4. Migration and import strategy

1. **Reuse the existing validator as the gate.** Run the JSON backup through
   the current `importData()` logic first (dry-run, no writes): it already
   enforces the 9 arrays, backfills ids/timestamps, and normalizes
   (`store.js:683-728`). A backup that fails here never touches Supabase.
2. **Order matters (parents before children):** `modules → learning_objectives
   → resources → study_sessions → exams → exam_results → plan_items →
   captures → weekly_reviews → user_settings`. `user_settings.current_module_id`
   is written last so its FK resolves.
3. **Preserve everything:** upsert keyed on the existing stable `id` + inject
   `user_id` server-side (from `auth.uid()`, never from the file); never
   regenerate ids. Type mapping at the boundary: `''`→NULL for dates,
   epoch-ms→`BIGINT`/`TIMESTAMPTZ`, mock exam numeric `score/max`→TEXT.
4. **Duplicates / retries:** `INSERT … ON CONFLICT (id) DO UPDATE` guarded by
   `WHERE user_id = auth.uid()` makes re-imports idempotent — re-running a
   backup is a safe no-op, not a duplicator. (Cross-user id collision is
   negligible given `generateId()` entropy; see D1.)
5. **Failures:** migrate one table per transaction; on error abort that table,
   keep already-committed tables (idempotent retry resumes cleanly), and
   report per-table counts. localStorage remains the source of truth and is
   **never cleared** until a post-migration read-back verification passes
   (row counts + spot-check of one objective's history, one exam's breakdown,
   settings, and a legacy `exam_results` row if present).
6. **Partial imports:** same mechanism — retry the failed tables only; never
   half-write a table (transaction per table) and never delete-then-insert
   (upsert only).

---

## 5. Required Supabase configuration (to be done in Phase 3, not now)

- New Supabase project; Auth enabled (method TBD — decision D5); no additional
  users created now.
- SQL editor: create tables + indexes + FKs, then `ENABLE RLS` + policies
  (appendix draft, after D1–D4 approval).
- Frontend uses the **anon key only**; `service_role` never ships to the
  browser. No storage buckets, no extensions (pgvector deferred to a future
  AI phase), no Edge Functions.
- Phase-3 code adds `supabase-js` as the project's **first dependency** and a
  `SupabaseAdapter` implementing the `storageAdapter.js` interface
  (`getItem/setItem/removeItem` + `setAdapter()` switch), with `localStorage`
  retained as offline fallback.

---

## 6. Risks, assumptions, decisions requiring approval

- **R1 — Dangling link ids are pre-existing.** Objective delete leaves stale
  ids in link arrays (verified, §1.2). SQL FKs cannot cover `TEXT[]`/`JSONB`;
  the proposal keeps app-level repair. Optional hardening (adapter-side
  unlink sweep) is Phase-3 scope.
- **R2 — Mixed `score/max` types.** Manual exams store strings, mocks store
  numbers, `''` means ungraded. The `TEXT` column + adapter normalization is
  proposed; alternative is normalizing history once at migration (data
  rewrite — rejected for now as it touches user data semantics).
- **R3 — RLS untested by design.** Policies exist only on paper; the two-user
  isolation test is a mandatory Phase-3 gate before any real data is synced.
- **R4 — `exam_results` may be dead weight.** No writer besides legacy
  migration; grades derive live. Proposal keeps the table for backup fidelity;
  alternative is dropping it (needs explicit approval — it would discard
  legacy-migrated rows).
- **R5 — Weekly-review uniqueness.** App dedups per week+year+scope in JS;
  NULL `module_id` defeats a plain PG unique constraint. Proposal: keep dedup
  in the app (status quo), optionally add a `COALESCE`-based unique index
  later.
- **D1 — TEXT PKs preserving client ids** (vs server UUIDs + id mapping table).
  Recommended: TEXT PK (simplest, byte-compatible backups/relationships).
- **D2 — `TEXT[]` over junction tables** for link arrays. Recommended as above.
- **D3 — `exam_results` retained.** Needs approval (see R4).
- **D4 — Timer state stays local-only** (never synced; cross-device timer sync
  creates conflicts for an ephemeral value). Needs approval.
- **D5 — Auth method** (email+password vs magic link) and future sharing model
  (current design assumes strictly private single-owner data — no sharing
  tables proposed).
- **A1 — Single-user-per-dataset.** Assumes one Supabase user owns one full
  EMVS dataset; no organizations/teams.
- **A2 — Small data.** Whole-dataset load (today's access pattern) stays
  viable; no pagination designed.

---

## 7. Recommended implementation sequence (next phase)

1. Approve/decide D1–D5 + R4 above. No SQL before this.
2. Create Supabase project; enable Auth (per D5); record anon key handling
   (never commit secrets — env/local config only, git-ignored).
3. Apply table DDL (appendix, reviewed) via SQL editor; verify in dashboard.
4. Enable RLS + policies; run the **two-user isolation test** (A reads/writes
   own rows; cannot see B's; anon sees nothing). Gate: no app work until green.
5. Add `supabase-js`, implement `SupabaseAdapter` behind the existing
   `storageAdapter.js` interface; keep `localStorageAdapter` as default and
   offline fallback. No behavior change yet.
6. Build the migration script (§4: validate → ordered upserts → verify
   read-back); test with a **synthetic** dataset and a copy of a real backup —
   never the live browser profile — until counts + spot-checks pass.
7. Cut over behind an explicit user opt-in per profile; keep localStorage as
   fallback and JSON export untouched. Revisit sync/conflict strategy
   (last-write-wins vs merge) as its own proposal before multi-device use.

---

## Appendix — Draft DDL (DRAFT — NOT YET APPLIED — DO NOT RUN)

```sql
-- ============================================================
-- DRAFT ONLY — NOT YET APPLIED. DO NOT RUN.
-- Requires approval of D1–D5 (§6) and the Phase-3 RLS test gate.
-- ============================================================
CREATE TABLE modules (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL, title TEXT NOT NULL,
  accent TEXT NOT NULL DEFAULT '#b45309',
  target_grade DOUBLE PRECISION NOT NULL DEFAULT 5.0 CHECK (target_grade BETWEEN 1 AND 6),
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE learning_objectives (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  number INT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in-progress','done')),
  confidence INT NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 5),
  confidence_history JSONB NOT NULL DEFAULT '[]',
  session_history JSONB NOT NULL DEFAULT '[]',
  review_history JSONB NOT NULL DEFAULT '[]',
  last_touched BIGINT NOT NULL, last_reviewed BIGINT,
  total_study_time INT NOT NULL DEFAULT 0,
  review_schedule JSONB,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Video'
    CHECK (type IN ('Video','Exercise','Dataset','Project','Cheat Sheet','Article','Book','Other')),
  focus TEXT NOT NULL DEFAULT '70',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in-progress','done')),
  url TEXT NOT NULL DEFAULT '',
  linked_objective_ids TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  usage_history JSONB NOT NULL DEFAULT '[]',
  understood BOOLEAN NOT NULL DEFAULT FALSE,
  understood_at BIGINT, understood_history JSONB NOT NULL DEFAULT '[]',
  last_used BIGINT,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE study_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  duration INT NOT NULL CHECK (duration BETWEEN 1 AND 480),
  linked_objective_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_resource_ids TEXT[] NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE exams (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  name TEXT NOT NULL, date DATE,
  weight INT NOT NULL DEFAULT 0 CHECK (weight BETWEEN 0 AND 100),
  score TEXT NOT NULL DEFAULT '', max TEXT NOT NULL DEFAULT '',
  linked_objective_ids TEXT[] NOT NULL DEFAULT '{}',
  objective_results JSONB NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  is_mock BOOLEAN NOT NULL DEFAULT FALSE, duration_min INT,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE exam_results (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_id TEXT REFERENCES exams(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  score DOUBLE PRECISION, max DOUBLE PRECISION, grade DOUBLE PRECISION,
  date DATE, objective_results JSONB NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);
CREATE TABLE plan_items (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  week INT NOT NULL CHECK (week BETWEEN 1 AND 53),
  title TEXT NOT NULL, text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('task','milestone','review')),
  linked_objective_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_resource_ids TEXT[] NOT NULL DEFAULT '{}',
  done BOOLEAN NOT NULL DEFAULT FALSE, dropped BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT '', due_date DATE,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE captures (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES modules(id) ON DELETE CASCADE,
  objective_id TEXT REFERENCES learning_objectives(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('question','term','resource','mistake','thought')),
  content TEXT NOT NULL, tags TEXT[] NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE weekly_reviews (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week INT NOT NULL CHECK (week BETWEEN 1 AND 53),
  year INT NOT NULL CHECK (year BETWEEN 2020 AND 2030),
  module_id TEXT REFERENCES modules(id) ON DELETE CASCADE,
  module_title TEXT NOT NULL DEFAULT '',
  went_well TEXT NOT NULL DEFAULT '', didnt_work TEXT NOT NULL DEFAULT '',
  next_week TEXT NOT NULL DEFAULT '', learned TEXT NOT NULL DEFAULT '',
  adjustments TEXT NOT NULL DEFAULT '',
  study_time INT NOT NULL DEFAULT 0,
  sessions_count INT NOT NULL DEFAULT 0, objectives_reviewed INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
);
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark')),
  current_module_id TEXT REFERENCES modules(id) ON DELETE SET NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX idx_mod_user ON modules(user_id);
CREATE INDEX idx_obj_user_mod ON learning_objectives(user_id, module_id);
CREATE INDEX idx_res_user_mod ON resources(user_id, module_id);
CREATE INDEX idx_ses_user_mod ON study_sessions(user_id, module_id);
CREATE INDEX idx_exm_user_mod ON exams(user_id, module_id);
CREATE INDEX idx_xr_user_exam ON exam_results(user_id, exam_id);
CREATE INDEX idx_plan_user_mod ON plan_items(user_id, module_id);
CREATE INDEX idx_cap_user_mod ON captures(user_id, module_id);
CREATE INDEX idx_wr_user_scope ON weekly_reviews(user_id, year, week);
-- RLS (design only — untested):
-- ALTER TABLE <each> ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "own rows" ON <each> FOR ALL TO authenticated
--   USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- (user_settings: same predicate on its PK.)
```

---

## Completion report (Phase 2)

- **Files created:** `PHASE_2_SCHEMA_PROPOSAL.md` (this file). **Files changed:**
  none — `git status` shows only the pre-existing Phase-1 entries
  (`M js/services/store.js`, `?? js/services/storageAdapter.js`,
  `?? COMPLETION_REPORT.md`).
- **Key schema decisions:** TEXT PKs preserving client ids; native columns +
  CHECKs/FKs for queryable scalars; `TEXT[]` for link arrays; `JSONB` for
  history logs; per-user `user_id` + `FOR ALL` RLS; timer state local-only
  (proposed); `exam_results` retained as legacy (pending approval); weekly
  dedup stays app-side.
- **Unresolved questions:** D1–D5 and R4 require explicit approval before any
  SQL is written or run; RLS effectiveness is designed but unproven (Phase-3
  two-user gate).
- **Checks performed (all read-only):** full source audit of store, adapter,
  all 18 views, 4 components, helpers, app entry, server, package config;
  verified field shapes/validation/CRUD/confirmations against code (incl.
  `MIGRATION_KEY` dead constant, mock-exam numeric scores, `exam_results`
  writer-less status, QUESTIONS keys, timer shape); `node --input-type=module`
  import smoke checks of `store.js`/`storageAdapter.js` from Phase 1 remain
  valid — no source file was modified in this phase.
- **Supabase remains untouched:** no SQL executed, no tables created, no users,
  no auth configuration, no credentials added, no adapter switch, no behavior
  or data changes. No live migration has occurred. Stopping here per phase
  boundary.
