# PHASE 2 — Schema Proposal: EMVS Study Hub → Supabase

> Status: **PROPOSAL ONLY — nothing has been applied.**
> The Supabase project is still empty (no tables, no users), the app still uses
> `localStorage` via `activeAdapter`, and no credentials exist in this repo.
> The draft SQL in the appendix is **reviewed but NOT YET APPLIED** and must not
> be run until the decisions in §6 are approved.
>
> Revision note (review fixes): §2 now enforces same-owner relationships with
> composite keys; the appendix is self-contained valid PostgreSQL separated from
> prose; §4 specifies exact import/migration behavior per case; §5 adds an
> explicit integrity-gap register. No application code or data was changed.

Codebase audited: `js/services/store.js`, `js/services/storageAdapter.js`,
`js/app.js`, all files in `js/views/` (18), `js/components/` (4),
`js/utils/helpers.js`, plus `package.json`, `server.js`, `README.md`.
Branch `Storage-and-AI`; Phase-1 changes (`store.js` + `storageAdapter.js`)
are the only working-tree source modifications.

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
  (`store.js:706-713`). IDs are never regenerated — this is preserved (§6, D1).
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
  (`store.js:683-728`). The caller replaces whole state on success.
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
Known gap (verified): deleting an objective filters only
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
today (only two cascade-delete filters). A legacy read-mostly collection —
**retained as-is** (no writers added, no rows discarded, §6 R4/D3).

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
- `captures n—1` objectives via nullable `objectiveId` (no cascade; dangling
  tolerated and rendered as unlinked).
- Everything else is **id arrays inside documents**:
  `linkedObjectiveIds`, `linkedResourceIds`, `objectiveResults[].objectiveId`,
  `usageHistory[].sessionId`, `sessionHistory[].sessionId` — no DB-level
  integrity possible today; repair is app-level (`syncExamObjectives`,
  `recalculateObjectiveHistory`).

---

## 2. Proposed tables, columns, types, relationships

### 2.1 Key design (revised per review: same-owner enforcement)

- **Composite primary keys `(user_id, id)` on all 9 row tables.** The client
  `id` is preserved byte-for-byte (no regeneration, R4/D1); adding `user_id`
  to the key makes cross-user overwrites structurally impossible and gives
  every upsert a natural conflict target `(user_id, id)` (§4).
- **`user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`**
  everywhere; `user_settings.user_id` is the PK (one row per user).
- **Composite foreign keys `(user_id, parent_id) → parent(user_id, id)`** for
  every non-nullable parent reference: a row can only point at a parent owned
  by the same user. Cross-owner inserts fail at the database level, regardless
  of application bugs. `exam_results` goes one step further with a three-column
  key `(user_id, exam_id, module_id) → exams(user_id, id, module_id)` (row 5):
  the referenced exam must match the result's user *and* module together, so a
  same-user but wrong-module exam reference is rejected. All three columns are
  `NOT NULL`, so there are no null-matching subtleties; deletion still
  cascades (module → exams → results transitively), and user isolation is
  unchanged (strictly stronger, never weaker).
- **Two nullable references need special handling** because `ON DELETE SET NULL`
  on a composite FK would attempt to null `user_id` (which is `NOT NULL` / PK):
  - `captures.objective_id`: **trigger-only, no FK** (decision D7). The app
    tolerates dangling objective refs on objective delete (renders as
    unlinked); a `SET NULL` FK would rewrite user data on delete, while no-FK
    preserves the exact dangling-tolerant semantics. Same-owner is enforced by
    a `BEFORE INSERT OR UPDATE` trigger instead, which queries `(user_id, id)`
    directly against the composite PK — no additional constraint needed on
    `learning_objectives`.
  - `user_settings.current_module_id`: **single-column FK
    `→ modules(id) ON DELETE SET NULL` + ownership trigger** (decision D8).
    Auto-nulling plus the existing adapter fallback ("first module or null",
    `settings.js:168-170`) reproduces today's visible behavior exactly.
    Requires `UNIQUE(id)` on `modules` as the FK target.
- Timestamps stay `BIGINT` epoch-ms (`created_at`, `updated_at`) for
  backup-compatibility; ISO instants map to `TIMESTAMPTZ`; `''` dates map to
  `NULL DATE`. Enums stay `TEXT + CHECK` (app owns vocabularies,
  `helpers.js:767-780`).

Trade-off summary: composite keys make every FK declaration slightly longer
and require the adapter to always bind `user_id` (it will — from the auth
session, never from imported data, §4). In return, ownership isolation holds
even if RLS were misconfigured, and upsert conflicts are unambiguous. The two
trigger-guarded exceptions are the minimum needed to avoid changing delete
semantics; triggers are deliberately narrow (one predicate each) and covered
by negative tests in Phase 3 (§7 step 4).

### 2.2 Relationship → enforcement register

| # | Relationship | Enforcement | Delete behavior (mirrors app) |
|---|---|---|---|
| 1 | objectives.module_id → modules | composite FK `(user_id, module_id)` | `ON DELETE CASCADE` (app cascade, `settings.js:159`) |
| 2 | resources.module_id → modules | composite FK | `CASCADE` (app cascade, `:160`) |
| 3 | study_sessions.module_id → modules | composite FK | `CASCADE` (app cascade, `:161`) |
| 4 | exams.module_id → modules | composite FK | `CASCADE` (app cascade, `:162`) |
| 5 | exam_results.(module_id, exam_id) → exams | single three-column FK `(user_id, exam_id, module_id) → exams(user_id, id, module_id)` (backed by `uq_exams_user_id_module`): guarantees the referenced exam is same-user **and** same-module as the result — a result carrying M2 for an exam in M1 is rejected | `CASCADE` (app cascades, `settings.js:163` + `module-exams.js:139`; module delete reaches results transitively via exams) |
| 6 | plan_items.module_id → modules | composite FK | `CASCADE` (app cascade, `:164`) |
| 7 | captures.module_id → modules (nullable; NULL skips the check, NULL-module captures survive — exactly as the app's `filter(c => c.moduleId !== id)` treats them, `:165`) | composite FK | `CASCADE` |
| 8 | weekly_reviews.module_id → modules (nullable = global; same NULL semantics, `:166`) | composite FK | `CASCADE` |
| 9 | captures.objective_id → learning_objectives (nullable, dangling-tolerant) | ownership trigger only, no FK (D7) | none in DB — app behavior unchanged |
| 10 | user_settings.current_module_id → modules (nullable) | single-column FK `→ modules(id)` + ownership trigger (D8) | `SET NULL` + adapter fallback to first module/null |
| 11 | `linked_*_ids TEXT[]`, `tags TEXT[]` | **not enforceable** — gap G1 (§5) | app-level only (as today) |
| 12 | `objective_results`, `*_history`, `review_schedule` JSONB | **not enforceable** — gap G2 (§5) | app repair fns (`syncExamObjectives`, `recalculateObjectiveHistory`) |

### 2.3 Columns

`id TEXT NOT NULL`, `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE
CASCADE`, `PRIMARY KEY (user_id, id)` on all row tables, plus one
`UNIQUE(id)` constraint on `modules` — solely as the target of
`user_settings.current_module_id` (row 10; plain unique indexes cannot serve
as FK targets, hence a constraint). No other single-column UNIQUEs exist:
cross-user access is barred by RLS and composite FKs regardless.

| Table | Columns beyond keys/`created_at`/`updated_at` (BIGINT ms) |
|---|---|
| `modules` | `code TEXT NOT NULL`, `title TEXT NOT NULL`, `accent TEXT NOT NULL DEFAULT '#b45309'`, `target_grade DOUBLE PRECISION NOT NULL DEFAULT 5.0 CHECK (target_grade BETWEEN 1 AND 6)` |
| `learning_objectives` | `module_id TEXT NOT NULL` (+ composite FK), `number INT NOT NULL`, `title TEXT NOT NULL`, `description TEXT NOT NULL DEFAULT ''`, `status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in-progress','done'))`, `confidence INT NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 5)`, `notes TEXT NOT NULL DEFAULT ''`, `confidence_history/session_history/review_history JSONB NOT NULL DEFAULT '[]'`, `last_touched BIGINT NOT NULL`, `last_reviewed BIGINT`, `total_study_time INT NOT NULL DEFAULT 0`, `review_schedule JSONB` |
| `resources` | `module_id` (+FK), `name TEXT NOT NULL`, `type TEXT NOT NULL DEFAULT 'Video' CHECK (…8 values…)`, `focus TEXT NOT NULL DEFAULT '70'`, `status TEXT NOT NULL DEFAULT 'todo' CHECK (…)`, `url TEXT NOT NULL DEFAULT ''`, `linked_objective_ids TEXT[] NOT NULL DEFAULT '{}'`, `notes TEXT NOT NULL DEFAULT ''`, `usage_history JSONB NOT NULL DEFAULT '[]'`, `understood BOOLEAN NOT NULL DEFAULT FALSE`, `understood_at BIGINT`, `understood_history JSONB NOT NULL DEFAULT '[]'`, `last_used BIGINT` |
| `study_sessions` | `module_id` (+FK), `start_time TIMESTAMPTZ NOT NULL`, `duration INT NOT NULL CHECK (duration BETWEEN 1 AND 480)`, `linked_objective_ids/linked_resource_ids TEXT[] NOT NULL DEFAULT '{}'`, `note TEXT NOT NULL DEFAULT ''` |
| `exams` | `module_id` (+FK), `name TEXT NOT NULL`, `date DATE` (NULL = undated), `weight INT NOT NULL DEFAULT 0 CHECK (weight BETWEEN 0 AND 100)`, `score/max TEXT NOT NULL DEFAULT ''` (**TEXT deliberately**: manual exams store strings, mocks store numbers, `''` = ungraded — adapter normalizes on read, §4 rule M3), `linked_objective_ids TEXT[] NOT NULL DEFAULT '{}'`, `objective_results JSONB NOT NULL DEFAULT '[]'`, `description TEXT NOT NULL DEFAULT ''`, `is_mock BOOLEAN NOT NULL DEFAULT FALSE`, `duration_min INT` (mock-only, nullable; preserved, never dropped) |
| `exam_results` (legacy, read-mostly; retained per R4/D3) | `exam_id TEXT NOT NULL` (+ composite FK CASCADE), `module_id TEXT NOT NULL` (+ composite FK CASCADE), `score/max/grade DOUBLE PRECISION` (nullable — legacy rows may lack grade), `date DATE`, `objective_results JSONB NOT NULL DEFAULT '[]'`, `notes TEXT NOT NULL DEFAULT ''`, `created_at BIGINT NOT NULL` (no `updated_at`: legacy shape has none — preserved exactly) |
| `plan_items` | `module_id` (+FK), `week INT NOT NULL CHECK (week BETWEEN 1 AND 53)`, `title TEXT NOT NULL`, `text TEXT NOT NULL`, `type TEXT NOT NULL DEFAULT 'task' CHECK (type IN ('task','milestone','review'))`, `linked_objective_ids/linked_resource_ids TEXT[] NOT NULL DEFAULT '{}'`, `done/dropped BOOLEAN NOT NULL DEFAULT FALSE`, `notes TEXT NOT NULL DEFAULT ''`, `due_date DATE` |
| `captures` | `module_id TEXT` (+ composite FK CASCADE, nullable), `objective_id TEXT` (trigger-only, nullable), `type TEXT NOT NULL CHECK (type IN ('question','term','resource','mistake','thought'))`, `content TEXT NOT NULL`, `tags TEXT[] NOT NULL DEFAULT '{}'`, `timestamp TIMESTAMPTZ NOT NULL` |
| `weekly_reviews` | `week INT NOT NULL CHECK (week BETWEEN 1 AND 53)`, `year INT NOT NULL CHECK (year BETWEEN 2020 AND 2030)`, `module_id TEXT` (+ composite FK CASCADE, nullable = global), `module_title TEXT NOT NULL DEFAULT ''`, `went_well/didnt_work/next_week/learned/adjustments TEXT NOT NULL DEFAULT ''`, `study_time/sessions_count/objectives_reviewed INT NOT NULL DEFAULT 0` |
| `user_settings` | `user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark'))`, `current_module_id TEXT REFERENCES modules(id) ON DELETE SET NULL` (+ ownership trigger), `updated_at BIGINT NOT NULL` |

Indexes (minimal, reviewed): composite PKs already index `(user_id, id)`;
add `(user_id, module_id)` on the 7 module-scoped row tables,
`(user_id, exam_id)` on `exam_results`, `(user_id, year, week)` on
`weekly_reviews`. No `(user_id, updated_at)` index: sync reads whole datasets
(today's access pattern) and the PK prefix serves owner-scoping; add later
only if partial sync is introduced.

**Relational vs JSONB — trade-offs:** native columns for anything filtered,
sorted, validated, or cross-row (ids, `module_id`, statuses, dates, `weight`,
`is_mock`, `done/dropped`, `understood`) with CHECKs/FKs/indexes; `TEXT[]`
for link-id sets (opaque membership sets in JS; junction tables would add ~5
tables and sync complexity for zero current query benefit — revisit only if
SQL-side link queries are needed); `JSONB` for append-only history logs
(write-once/read-whole, variable shape, never SQL-filtered, backup-identical).
Accepted cost: no FK enforcement inside `TEXT[]`/`JSONB` — registered as gaps
G1/G2 in §5, matching today's app-level repair model.

### 2.4 Cross-user effect of `UNIQUE(id)` on `modules` (assessed per review)

The `uq_modules_id` constraint enforces **global** module-id uniqueness, not
just per-user: two different users can never hold the same module `id`.
Assessment:
- **Collision probability: negligible.** `generateId()` (`store.js:16-18`)
  combines millisecond timestamps with 9 random base-36 characters (~47 bits
  of entropy plus time ordering). Accidental cross-user collision is not a
  realistic event.
- **Failure mode is loud, never silent.** A colliding insert fails with a
  unique violation; the row is reported as failed (§4). No overwrite is
  possible — PK `(user_id, id)` plus RLS already bars cross-user writes, so
  the constraint can only ever reject, never corrupt.
- **No information leak of consequence.** A uniqueness error reveals at most
  that an id exists somewhere; ids are unguessable randoms and RLS still
  denies all reads. Not a viable oracle.
- **Why it is needed:** `user_settings.current_module_id → modules(id)`
  requires a UNIQUE *constraint* as its FK target (a plain unique index is not
  eligible), and the single-column form is required because `SET NULL` on a
  composite FK would attempt to null `user_id` (§2.1).
- **Alternative considered:** drop the constraint and guard settings with the
  trigger alone. That removes the global restriction but also loses automatic
  `SET NULL` on module delete, pushing more work into the adapter fallback.
- **Recommendation: keep** (required for D8 as specified; risk accepted).

---

## 3. Ownership and RLS policy design

- Default-deny: `ENABLE ROW LEVEL SECURITY` on all 10 tables; no permissive
  policy means no access, including for `anon`.
- One `FOR ALL` policy per table (student-project simplicity over
  per-operation splits):
  `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
  `TO authenticated`. `user_settings` uses the same predicate on its PK.
- Defense in depth (new per review): even with RLS bypassed/misconfigured,
  composite FKs (§2.2 rows 1–8) make cross-owner references impossible, and
  the two triggers (rows 9–10) raise exceptions on cross-owner writes.
  Triggers run as the invoking user, so their internal `SELECT`s are themselves
  RLS-governed — a trigger can only "see" the writer's own parents, which is
  exactly the property being enforced.
- Grants are part of the migration (appendix): `GRANT SELECT, INSERT, UPDATE,
  DELETE` to `authenticated` only. No grants to `anon`; `service_role` is never
  used by the frontend.
- ⚠️ NOT claimed as secure: designed, not implemented or tested. The Phase-3
  gate (§7 step 4) requires positive tests (own CRUD works) **and negative
  tests** (cross-user read/write fails; cross-owner FK insert fails; trigger
  rejects cross-owner `objective_id`/`current_module_id`; anon gets nothing)
  before any real data is synced.

---

## 4. Migration and import strategy (revised per review)

### 4.1 Non-negotiable rules

- **M1 — Never trust an imported `user_id`.** Backup files contain no `user_id`
  (localStorage shape has none); if one ever appears, it is stripped and
  replaced with `auth.uid()` server-side / adapter-side. All writes bind the
  session user, never file content.
- **M2 — Cross-user overwrite is impossible by construction.** PK
  `(user_id, id)` + RLS + composite FKs mean user A's import can only ever
  touch `(A, *)` rows. There is no code path that writes another owner's rows.
- **M3 — Type normalization at the boundary, never silent data change.**
  `''`→NULL for dates; epoch-ms→`BIGINT`/`TIMESTAMPTZ`; mock numeric
  `score/max`→TEXT (round-trip restores numbers for mocks by re-parsing
  numeric strings when `is_mock` is true — documented in adapter spec, Phase 3).
  History blobs (`JSONB`) and link arrays are stored verbatim.
- **M4 — localStorage is never cleared by migration.** It remains the source of
  truth until read-back verification passes; rollback = keep using local data.

### 4.2 Case-by-case behavior

| Case | Behavior |
|---|---|
| **First-time migration** (empty cloud account) | Dry-run `importData()` validation first (existing logic, `store.js:683-728`); a backup that fails validation never touches Supabase. Then ordered upserts, parents before children: `modules → learning_objectives → resources → study_sessions → exams → exam_results → plan_items → captures → weekly_reviews → user_settings` (`current_module_id` last so its FK resolves). One transaction per table. Verify: row counts per table + spot-checks (one objective's history, one exam's breakdown, settings, one legacy `exam_results` row if present). |
| **Repeat import, same data** | `INSERT … ON CONFLICT (user_id, id) DO UPDATE` with identical values = safe no-op. No duplicates possible (PK, not delete-then-insert — deletes are never part of import). |
| **ID conflict, same user, cloud newer** (`stored.updated_at > incoming.updated_at`, `exam_results` compare `created_at`) | **Never silently overwrite.** Row is skipped and reported in the per-table conflict list. Overwriting a newer cloud row requires explicit per-row (or per-table "keep mine / keep backup") user confirmation in the Phase-3 import UI. Default = keep cloud. |
| **ID conflict, same user, backup newer or equal** | Upsert overwrites (normal sync direction). Equal timestamps with differing content are treated as conflict (same as cloud-newer) — timestamps are the arbiter, content hashing is out of scope. |
| **Stale whole backup** (backup predates cloud, e.g. old file re-imported) | Detected cheaply first: compare max `updatedAt` per table against cloud max. If the entire backup is older, abort before writing anything and ask for confirmation ("Backup is older than cloud data — overwrite anyway?"). No partial application of a stale file without consent. |
| **Partial failure** (network/error mid-migration) | Committed tables stay (all writes were idempotent upserts); the failed table rolls back whole — its bulk upsert is a single request, hence a single transaction (§4.4). Retry resumes at the failed table — re-running earlier tables is a no-op. A per-table result ledger (counts: inserted/updated/skipped-conflict/failed) is shown, never a silent "done". |
| **Retry after app restart** | Same as repeat import: stateless, driven by comparing backup rows to cloud rows. No resume cursors to corrupt. |
| **Missing FK parent in backup** (e.g. objective references a module absent from the file) | Impossible from a consistent `exportData()` file (whole-state export). If hand-edited files produce orphans, the composite FK rejects the child row, the row is reported as failed, and migration continues with the rest. The file is never "repaired" silently. |
| **Settings row** | Single-row upsert with the same newer-wins + confirmation rule on `updated_at`. Theme applies only after user confirms when cloud is newer. |

### 4.3 Decisions requiring user confirmation (Phase-3 import UI)

1. Overwriting any cloud row newer than the backup row (per-row accept, or
   per-table "keep all cloud / take all backup").
2. Applying a wholly stale backup.
3. First-time migration itself (explicit "Upload my local data" action —
   never automatic on login).

### 4.4 Transaction behavior (clarified per review)

- **Each Supabase REST (PostgREST) request runs in its own transaction.
  Multiple REST requests never share a transaction.** Nothing in this proposal
  implies otherwise: there is no multi-table atomic commit over the REST API.
- **Per-table bulk upsert = one request = one transaction = atomic.**
  Phase 3 sends each table's rows as a single bulk `POST` with
  `Prefer: resolution=merge-duplicates` and `on-conflict=user_id,id`. Either
  all rows of that table commit or none do — a table is never left
  half-written by a failed request.
- **Size assumption with fallback.** EMVS datasets are KB-scale (whole-state
  JSON backups), so one request per table holds. If a future table ever
  exceeds payload limits and must be chunked, atomicity narrows to per-chunk;
  chunked writes stay safe because every chunk is an idempotent upsert and
  each chunk is recorded in the result ledger before the next is sent.
- **Across tables: ordered, resumable, never corrupt.** Tables migrate in
  dependency order (§4.2); a later-table failure leaves earlier tables
  committed and the failed table rolled back whole. This partial-table-set
  state is valid (parents without children satisfy all FKs) and retry simply
  replays from the first incomplete table — replayed tables are no-ops via
  idempotent upserts.
- **"Migration complete" is declared only after read-back verification**
  (row counts + spot-checks, §4.2); until then localStorage remains the source
  of truth (M4). A single cross-table transaction (e.g. one Postgres RPC
  wrapping all tables) is a possible future hardening but is explicitly
  **not** proposed now — it would move migration logic server-side for no
  benefit at this data scale.

---

## 5. Required Supabase configuration (Phase 3, not now)

- New project; Auth enabled (method TBD — D5); no users created now.
- Apply appendix SQL via SQL editor in its printed order: tables (incl. the
  `modules` UNIQUE constraint) → indexes → `ENABLE RLS` → grants → policies →
  trigger functions → triggers.
- Frontend uses the **anon key only** (never `service_role`; never committed —
  env/local git-ignored config only).
- No storage buckets, no extensions, no Edge Functions now (uploads/AI leave
  room by adding *new* tables later, e.g. `documents(user_id, id, …)` with the
  same composite-key pattern — no changes to the tables proposed here).
- Phase-3 code adds `supabase-js` (first dependency) + `SupabaseAdapter`
  behind the existing `storageAdapter.js` interface; `localStorageAdapter`
  stays default and offline fallback.

### 5.1 Integrity-gap register (TEXT[] / JSONB references)

| Gap | References | Why unenforceable | Mitigation (current → Phase 3) |
|---|---|---|---|
| G1 | `linked_objective_ids`, `linked_resource_ids`, `tags` (`TEXT[]`) | Array members can't be FK targets | Today: nothing (objective delete leaves dangling ids — verified §1.2). Phase 3: adapter reuses `syncExamObjectives`-style sweeps; optional periodic repair; GIN indexes only if SQL-side membership queries appear. |
| G2 | `objective_results[].objectiveId`, `usageHistory[].sessionId`, `sessionHistory[].sessionId` (JSONB) | Object properties can't be FK targets | Today: `syncExamObjectives` (exams) and `recalculateObjectiveHistory` (sessions) repair on read paths. Phase 3: run the same normalizers after every cloud fetch — zero new logic, just re-invocation. |
| G3 | Weekly-review uniqueness (week, year, scope) with NULL `module_id` | NULLs never conflict in a plain UNIQUE constraint | Keep app find-or-edit dedup (`weekly-review.js:168-174`) as the enforcer (status quo); optional `UNIQUE(user_id, week, year, COALESCE(module_id, ''))` expression index later — needs approval (D9). |

---

## 6. Risks, assumptions, decisions requiring approval

- **R1 — Dangling link ids are pre-existing** (verified §1.2). Composite FKs
  cover all scalar parent refs; G1/G2 remain app-repaired. No silent sweeps
  without approval.
- **R2 — Mixed `score/max` types** (strings vs mock numbers vs `''`). `TEXT`
  columns + documented adapter normalization (M3); no history rewrite.
- **R3 — RLS + triggers untested by design.** Mandatory two-user positive and
  negative test gate (§7 step 4) before real data syncs. Nothing here is
  claimed secure.
- **R4 — `exam_results` retained read-mostly** (no writers added, no rows
  discarded). Dropping it would discard legacy-migrated rows — explicitly
  **not** proposed.
- **R5 — Weekly-review uniqueness stays app-side** (G3); DB expression index
  deferred to D9.
- **R6 — Trigger maintenance cost.** Two narrow triggers (D7/D8) are the only
  procedural code; they must be re-verified if those columns are ever
  restructured.
- **D1 — Composite PKs `(user_id, id)` preserving client ids** (vs server
  UUIDs + mapping table). Recommended: composite (zero id churn, conflict
  target included).
- **D2 — `TEXT[]` over junction tables.** Recommended as §2 (revisit only on
  real SQL-side link-query need).
- **D3 — `exam_results` retained.** Recommended (R4).
- **D4 — Timer state stays local-only** (cross-device timer sync creates
  conflicts for an ephemeral value).
- **D5 — Auth method** (email+password vs magic link) and confirmation that
  data stays strictly private single-owner (no sharing tables proposed).
- **D6 — Composite-FK + trigger ownership model as specified** (vs RLS-only).
  Recommended: defense in depth as §2–§3.
- **D7 — `captures.objective_id` trigger-only, no FK** (exact dangling-tolerant
  behavior preservation over DB strictness). Recommended, with R6 accepted.
- **D8 — `user_settings.current_module_id` single-FK `SET NULL` + trigger**
  (vs trigger-only). Recommended: auto-null + existing adapter fallback
  reproduces behavior exactly.
- **D9 — Optional `COALESCE` unique index for weekly reviews** (deferred).
- **A1 — One Supabase user owns one full EMVS dataset; no teams/orgs.**
- **A2 — Small data; whole-dataset load stays viable; no pagination designed.**

---

## 7. Recommended implementation sequence (next phase)

1. Approve/decide D1–D9 + confirm R1–R6 accepted. No SQL before this.
2. Create Supabase project; enable Auth (per D5); establish secret handling
   (anon key in git-ignored local config only).
3. Apply appendix SQL via SQL editor in its printed order; verify objects in
   the dashboard (tables, composite PKs, FKs, RLS enabled, policies, triggers).
4. **Isolation test gate (must pass before any app work):** positive (own CRUD
   on every table incl. settings) and negative (cross-user SELECT/INSERT/
   UPDATE/DELETE denied; cross-owner `module_id` insert rejected by FK;
   cross-module `exam_results` insert rejected by the three-column FK;
   cross-owner `objective_id`/`current_module_id` rejected by triggers;
   `anon` sees nothing; delete of `auth.users` cascades). Real data sync is
   blocked until green — RLS is not claimed secure until this passes.
5. Add `supabase-js`; implement `SupabaseAdapter` behind the
   `storageAdapter.js` interface (`getItem/setItem/removeItem` + `setAdapter()`;
   binds `auth.uid()`, strips any `user_id` from payloads per M1, applies M3
   mappings); keep `localStorageAdapter` default + offline fallback. No
   behavior change yet.
6. Build migration + import UI per §4 (dry-run validation, ordered per-table
   transactions, conflict ledger, confirmations C1–C3); test with synthetic
   data and a *copy* of a real backup — never the live browser profile — until
   counts + spot-checks pass.
7. Cut over behind explicit per-profile opt-in; keep localStorage fallback and
   JSON export untouched. Multi-device conflict strategy stays row-level
   newer-wins (§4.2) until a merge proposal exists.

---

## Appendix — Reviewed migration SQL (REVIEWED DRAFT — NOT YET APPLIED — DO NOT RUN)

The statements below form one self-contained migration. Explanatory text ends
here; everything inside the code block is raw PostgreSQL intended to be copied
directly into the Supabase SQL editor (after D1–D9 approval — DO NOT RUN yet).

Validation status: **manual only — never executed.** No local PostgreSQL
tooling exists in this environment (`psql`, `pg_ctl`, Docker, and Python are
all absent from PATH), so no disposable test database or parser run was
possible. The manual pass covered: every `CREATE TABLE` column list and type;
composite `PRIMARY KEY (user_id, id)` on all 9 row tables; every composite FK
referencing an existing PK `((user_id, id))`, and the single-column settings
FK referencing the `uq_modules_id` UNIQUE *constraint* (a plain unique index
would be an ineligible target); `CHECK`/`DEFAULT` forms including `TEXT[]`
`'{}'` and `JSONB` `'[]'`; `ENABLE ROW LEVEL SECURITY` on all 10 tables;
`GRANT`s to `authenticated` only; `FOR ALL ... USING ... WITH CHECK` policy
form; `plpgsql` trigger functions (`RAISE EXCEPTION ... %`, `RETURN NEW`,
`$$` quoting) and `BEFORE INSERT OR UPDATE OF ... EXECUTE FUNCTION` trigger
form; and identifier legality (`type`, `text`, `timestamp`, `date`, `number`,
`year`, `week` are all non-reserved keywords, legal as bare column names).
An automated scan of the fenced block additionally confirms: exactly 1 fence,
0 backticks, 0 asterisks, balanced parentheses, even quote counts, and the
expected statement census (10 tables, 10 RLS enables, 10 grants, 10 policies,
2 functions, 2 triggers, 9 indexes, 2 constraints).

```sql
-- =====================================================================
-- EMVS Study Hub Supabase migration — REVIEWED DRAFT, NOT YET APPLIED.
-- DO NOT RUN. Requires approval of D1–D9 (§6) and the §7-step-4 gate.
-- Apply in this order: tables (§A) → RLS+grants+policies (§B) → triggers (§C).
-- =====================================================================

-- ==================== §A. Tables ====================

CREATE TABLE modules (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  accent TEXT NOT NULL DEFAULT '#b45309',
  target_grade DOUBLE PRECISION NOT NULL DEFAULT 5.0
    CHECK (target_grade BETWEEN 1 AND 6),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id)
);
-- UNIQUE constraint (not a plain unique index: FK targets require a
-- constraint). Target of user_settings.current_module_id.
ALTER TABLE modules ADD CONSTRAINT uq_modules_id UNIQUE (id);

CREATE TABLE learning_objectives (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in-progress', 'done')),
  confidence INTEGER NOT NULL DEFAULT 0
    CHECK (confidence BETWEEN 0 AND 5),
  notes TEXT NOT NULL DEFAULT '',
  confidence_history JSONB NOT NULL DEFAULT '[]',
  session_history JSONB NOT NULL DEFAULT '[]',
  review_history JSONB NOT NULL DEFAULT '[]',
  last_touched BIGINT NOT NULL,
  last_reviewed BIGINT,
  total_study_time INTEGER NOT NULL DEFAULT 0,
  review_schedule JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE resources (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Video'
    CHECK (type IN ('Video', 'Exercise', 'Dataset', 'Project', 'Cheat Sheet', 'Article', 'Book', 'Other')),
  focus TEXT NOT NULL DEFAULT '70',
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in-progress', 'done')),
  url TEXT NOT NULL DEFAULT '',
  linked_objective_ids TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  usage_history JSONB NOT NULL DEFAULT '[]',
  understood BOOLEAN NOT NULL DEFAULT FALSE,
  understood_at BIGINT,
  understood_history JSONB NOT NULL DEFAULT '[]',
  last_used BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE study_sessions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL CHECK (duration BETWEEN 1 AND 480),
  linked_objective_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_resource_ids TEXT[] NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE exams (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  date DATE,
  weight INTEGER NOT NULL DEFAULT 0 CHECK (weight BETWEEN 0 AND 100),
  score TEXT NOT NULL DEFAULT '',
  max TEXT NOT NULL DEFAULT '',
  linked_objective_ids TEXT[] NOT NULL DEFAULT '{}',
  objective_results JSONB NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  is_mock BOOLEAN NOT NULL DEFAULT FALSE,
  duration_min INTEGER,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

-- Supporting UNIQUE for the exam_results invariant (§2.2 row 5): the
-- three-column foreign key below needs (user_id, id, module_id) to be
-- a UNIQUE constraint on exams.
ALTER TABLE exams ADD CONSTRAINT uq_exams_user_id_module UNIQUE (user_id, id, module_id);

CREATE TABLE exam_results (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  exam_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  score DOUBLE PRECISION,
  max DOUBLE PRECISION,
  grade DOUBLE PRECISION,
  date DATE,
  objective_results JSONB NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id),
  -- One three-column key enforces BOTH invariants at once: the referenced
  -- exam must belong to the same user AND to the same module as the result.
  -- A result pointing at same-user exam E (module M1) while carrying
  -- module_id M2 matches no exams row (E, M2) and is rejected.
  FOREIGN KEY (user_id, exam_id, module_id) REFERENCES exams (user_id, id, module_id) ON DELETE CASCADE
);

CREATE TABLE plan_items (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 53),
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'task'
    CHECK (type IN ('task', 'milestone', 'review')),
  linked_objective_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_resource_ids TEXT[] NOT NULL DEFAULT '{}',
  done BOOLEAN NOT NULL DEFAULT FALSE,
  dropped BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NOT NULL DEFAULT '',
  due_date DATE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE captures (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT,
  objective_id TEXT,
  type TEXT NOT NULL
    CHECK (type IN ('question', 'term', 'resource', 'mistake', 'thought')),
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE weekly_reviews (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 53),
  year INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2030),
  module_id TEXT,
  module_title TEXT NOT NULL DEFAULT '',
  went_well TEXT NOT NULL DEFAULT '',
  didnt_work TEXT NOT NULL DEFAULT '',
  next_week TEXT NOT NULL DEFAULT '',
  learned TEXT NOT NULL DEFAULT '',
  adjustments TEXT NOT NULL DEFAULT '',
  study_time INTEGER NOT NULL DEFAULT 0,
  sessions_count INTEGER NOT NULL DEFAULT 0,
  objectives_reviewed INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  current_module_id TEXT REFERENCES modules (id) ON DELETE SET NULL,
  updated_at BIGINT NOT NULL
);

-- Supporting indexes (PKs already cover (user_id, id)).
CREATE INDEX idx_objectives_user_module ON learning_objectives (user_id, module_id);
CREATE INDEX idx_resources_user_module ON resources (user_id, module_id);
CREATE INDEX idx_sessions_user_module ON study_sessions (user_id, module_id);
CREATE INDEX idx_exams_user_module ON exams (user_id, module_id);
CREATE INDEX idx_exam_results_user_exam ON exam_results (user_id, exam_id);
CREATE INDEX idx_exam_results_user_module ON exam_results (user_id, module_id);
CREATE INDEX idx_plan_user_module ON plan_items (user_id, module_id);
CREATE INDEX idx_captures_user_module ON captures (user_id, module_id);
CREATE INDEX idx_reviews_user_scope ON weekly_reviews (user_id, year, week);

-- ==================== §B. RLS, grants, policies ====================

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_objectives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON study_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exam_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON plan_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON captures TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON weekly_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings TO authenticated;

CREATE POLICY own_rows ON modules FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON learning_objectives FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON resources FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON study_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON exams FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON exam_results FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON plan_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON captures FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON weekly_reviews FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON user_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ==================== §C. Same-owner triggers ====================
-- Guards the two nullable references that cannot use composite FKs (§2.1).
-- Each trigger only permits NULL or a parent row owned by NEW.user_id.

CREATE OR REPLACE FUNCTION check_capture_objective_owner()
RETURNS trigger AS $$
BEGIN
  IF NEW.objective_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM learning_objectives o
    WHERE o.id = NEW.objective_id AND o.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'cross-owner objective reference: %', NEW.objective_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_captures_objective_owner
  BEFORE INSERT OR UPDATE OF objective_id ON captures
  FOR EACH ROW EXECUTE FUNCTION check_capture_objective_owner();

CREATE OR REPLACE FUNCTION check_settings_module_owner()
RETURNS trigger AS $$
BEGIN
  IF NEW.current_module_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM modules m
    WHERE m.id = NEW.current_module_id AND m.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'cross-owner module reference: %', NEW.current_module_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_settings_module_owner
  BEFORE INSERT OR UPDATE OF current_module_id ON user_settings
  FOR EACH ROW EXECUTE FUNCTION check_settings_module_owner();
```

---

## Completion report (Phase 2 review fixes)

- **Files changed:** `PHASE_2_SCHEMA_PROPOSAL.md` only. No application source,
  adapter, config, or data file was modified.
- **Fixes applied:** (1) composite PKs `(user_id, id)` + composite FKs on all
  non-nullable parent refs, with a per-relationship enforcement register
  (§2.1–§2.2); (2) appendix rewritten as self-contained valid PostgreSQL —
  prose separated above the fence, RLS `ENABLE` + `GRANT` + `CREATE POLICY`
  explicit per table, triggers included (§C); (3) import safety specified per
  case with M1–M4 rules, newer-wins + confirmation matrix, stale-backup abort,
  per-table transactions, orphan rejection (§4); (4) legacy `exam_results`
  retained with no writers/drops, ids never regenerated, history blobs stored
  verbatim (§1.2, §4 M3, §6 R4); (5) every FK/deletion/constraint/index
  reviewed against app behavior with gaps G1–G3 registered (§2.2, §5.1);
  (6) trade-offs explained inline; open decisions listed as D1–D9.
- **Remaining approvals:** D1–D9 and acceptance of R1–R6; confirmation UX
  (C1–C3) is Phase-3 design. RLS/triggers are reviewed on paper only.
- **Checks performed (all read-only):** re-read of the proposal sections
  against `store.js` (keys, `importData`, cascade sites), view delete/cascade
  paths (`settings.js:158-176`, `module-exams.js:139`), and shapes
  (`mock-exam.js:381-414`, `captures.js:262-305`, `weekly-review.js:20-23,
  168-192`); manual PostgreSQL syntax pass over every appendix statement
  (key/FK/CHECK/default forms, RLS/policy/grant/trigger syntax, apply order);
  `git status`/`git diff --stat` confirming proposal-only changes; ESM import
  smoke check of the untouched `store.js`/`storageAdapter.js`.
- **Supabase remains untouched:** no SQL executed, no tables created, no users,
  no auth configuration, no credentials added, no adapter switch, no behavior
  or data changes. No live migration has occurred. RLS is **not** claimed
  secure — the §7-step-4 two-user gate stands. Stopping here per boundary.

---

## Completion report (Final SQL and transaction review)

- **Files changed:** `PHASE_2_SCHEMA_PROPOSAL.md` only. No application source,
  adapter, config, or data file was modified; prior phases' work remains
  committed (`215093e`).
- **Fixes applied:** (1) fence scan confirms the SQL block contains zero
  Markdown markers (no `*TEXT*`/`*INTEGER*`/backtick artifacts — the earlier
  asterisks flagged in review exist only in prose); appendix intro now states
  copy-paste intent and validation status; (2) validation declared as
  **manual only** — no `psql`/`pg_ctl`/Docker/Python exists locally, so no
  disposable database or parser run was possible, and execution is not
  claimed; automated fence scan (counts, balance, census) supports the manual
  pass; (3) new §4.4 states REST-request transaction semantics explicitly
  (one request = one transaction, never shared), per-table single-request
  atomic bulk upsert with chunking fallback, cross-table resume protocol, and
  verification-gated completion; partial-failure row now references §4.4;
  (4) all 10 tables/FKs/constraints/policies/grants/triggers re-checked;
  new §2.4 assesses `UNIQUE(id)` on `modules` (negligible collision risk,
  loud failure mode, no read leak, required FK target — recommendation:
  keep).
- **Checks actually performed (all read-only, none against Supabase):**
  `where psql/pg_ctl/docker/python` (all absent — tooling finding); Node fence
  scan of the committed file (1 fence, 283 lines, 0 backticks, 0 asterisks,
  parens 131/131, quotes even, semicolons 62 = 54 statements + 8 in-function,
  census 10/10/10/10/2/2/9/1 as specified); full re-read of the SQL appendix
  statement-by-statement; `git status`/`git diff --stat` confirming
  proposal-only changes; ESM import smoke check of untouched sources.
- **Remaining approvals:** unchanged — D1–D9, R1–R6, confirmation UX C1–C3
  (now joined by the §4.4 single-RPC alternative, explicitly deferred).
- **Supabase remains untouched:** nothing executed anywhere (no local engine
  exists to execute on), no project changes, no users, no credentials, no
  adapter switch, no behavior or data changes. Stopping here per boundary.

---

## Completion report (Phase 2.1 — storage reliability and schema consistency)

- **Code fixes (`js/services/storageAdapter.js`, `js/services/store.js`):**
  (1) `getItem()` now returns `null` only for genuinely missing keys and throws
  a typed `StorageError` (`READ_FAILED` / `PARSE_FAILED`) on access or JSON
  failures, instead of collapsing both cases to `null`; (2) `save()` and
  `saveTimerState()` return the adapter's boolean verbatim, so quota/access
  failures report `false` instead of unconditional `true`; (3) `load()`
  routes read failures to a blank seed (never demo data), records the error
  for `getStorageError()`/`clearStorageError()`, and never writes — the
  stored value survives; missing keys keep the exact first-run path;
  `loadTimerState()` returns `null` on corrupt timer state without throwing
  or writing. Verified no caller branches on these return values (60+ sites
  fire-and-forget), so the change is behavior-preserving on success paths.
  Additive exports only (`StorageError`, `STORAGE_KEY`, `TIMER_KEY`,
  `getStorageError`, `clearStorageError`).
- **Proposal fixes (`PHASE_2_SCHEMA_PROPOSAL.md`):** `exam_results` now uses
  one three-column FK `(user_id, exam_id, module_id) → exams(user_id, id,
  module_id)` backed by `uq_exams_user_id_module`, enforcing same-user AND
  same-module in a single constraint; user isolation strictly stronger, never
  weaker; all-`NOT NULL` columns (no null-matching subtleties); CASCADE
  preserved transitively. Register row 5, §2.1, §7 gate, and census updated.
- **Tests (`tests/storage.test.mjs`, `npm test`):** 18/18 pass. Negative
  control against pre-fix HEAD code confirms all three bugs were real
  (save→true on quota failure; corrupt→demo seed; no error accessor).
- **Remaining risks:** UI does not yet surface `getStorageError()` (banner
  work belongs to a UI phase); `readLegacyStorage` stays best-effort
  null-on-failure (legacy keys only, documented); weekly G3 and link-array
  G1/G2 gaps unchanged; RLS/triggers still unexecuted by design.
- **Supabase remains untouched and the app still uses localStorage** via the
  unchanged `activeAdapter` default. No SQL executed, no users, no
  credentials, nothing uploaded. Stopping here; Phase 3 not started.

---

## Completion report (Phase 2.2 — final reliability check)

- **Save latch (`js/services/store.js`):** `save()` and `saveTimerState()`
  return `false` without writing while a storage read failure is recorded —
  one in-memory flag (`lastStorageError`, already introduced in 2.1), no new
  abstractions. The latch clears on the next successful `load()`, on explicit
  `clearAll()` (confirmed reset = consent to discard), and on backup import
  (`settings.js:importBackup` calls `clearStorageError()` first — choosing a
  file is explicit consent to replace storage). First-run saves still work.
- **Regression tests (`tests/storage.test.mjs`, now 21 tests):** the exact
  required sequence passes — store data, corrupt it, `load()` fails to blank
  (not demo), `save()`/`saveTimerState()` return `false`, original raw value
  byte-identical afterwards; plus read-failure variant, and re-enablement via
  successful load / first run / reset. Full suite: **21 passed, 0 failed**.
- **UI surfacing (`js/app.js`):** toast auto-hides, so a persistent
  `role="alert"` banner is injected in `init()` only when `load()` failed —
  German message stating data could not be read and saving is disabled, with
  an "Einstellungen öffnen" button to the recovery paths (import/reset).
  Inline styles reuse existing theme vars; no CSS, layout, or redesign.
  Verified by code inspection against `index.html` (`#main`) and existing
  `var(--red)` usage; browser rendering itself could not be executed here.
- **Schema verification (no change):** `exam_results` three-column FK
  positionally matches `(user_id, exam_id, module_id) → exams(user_id, id,
  module_id)` with supporting `uq_exams_user_id_module`; names unique,
  types UUID/TEXT/TEXT both sides, CASCADE transitive, all columns NOT NULL.
  Fence re-scan confirms the appendix untouched and clean (1 fence, 0
  Markdown markers, census 10/10/10/10/2/2/9/2, parens 134/134, 63
  semicolons). No concrete correctness issue found — no schema change made.
- **Checks actually run:** `npm test` (21/21 pass); `node --check` on ESM
  copies of `app.js`/`settings.js`/`store.js` (parse OK; DOM code not
  executed); fence scan; `git status`/`diff --stat`. SQL not executed, as
  required. No local PG tooling exists; browser rendering not available.
- **Remaining limitations:** banner copy assumes German UI (matches app);
  stored JSON scalars (`false`, `"null"`) normalize to blank/first-run via
  the pre-existing migration path without recording an error (they carry no
  recoverable data); `getStorageError()` banner shows only at startup.
- **Supabase remains untouched:** no SQL executed, no project changes, no
  auth/RLS/cloud work, `activeAdapter` still localStorage, no credentials,
  nothing uploaded, nothing committed or pushed. Stopping here.
