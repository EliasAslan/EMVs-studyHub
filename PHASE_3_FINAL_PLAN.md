# Phase 3.1 — Final Supabase Plan (authoritative decision record)

> Status: **PLAN ONLY — nothing has been applied.**
> `PHASE_2_SCHEMA_PROPOSAL.md` (including its SQL appendix) is left **unchanged**
> by this phase. This document records the user's Phase 3.1 decisions, corrects
> the Phase 3 RLS-only recommendation, and is the authoritative reference for
> implementation. No SQL was executed, no Supabase project was touched, no
> application behavior was changed.

Codebase verified: `js/services/store.js` (keys, `load`/`save` latch,
`importData`, module-delete cascade), `js/services/storageAdapter.js`
(`activeAdapter = localStorageAdapter`), `js/app.js` (startup banner, no
auth/session/account concept — only study sessions), `js/views/settings.js`
(import/reset/module-delete incl. uncommitted `phase-2.2.1-banner-fix` delta),
proposal §§2–7.

## 1. Recorded decisions (locked, do not reopen without user approval)

1. **Isolation:** one account = one private dataset. No sharing, collaboration,
   realtime, teams, or admin features.
2. **Auth:** Supabase Auth with **email + password** initially. No OAuth,
   no magic link, no custom SMTP work in this phase.
3. **Sync mode:** **manual, explicit upload/download only.** No automatic sync
   on login. localStorage stays the default backend until migration is
   thoroughly tested.
4. **IDs:** existing client record IDs preserved byte-for-byte
   (`store.js:35-37`); never regenerated. JSON backup/import
   (`store.js:713-772`) remains available and untouched.
5. **Tables:** retain **all ten** proposed tables initially, including
   `exam_results` (legacy, read-mostly).
6. **Keys:** keep composite PKs `(user_id, id)` and same-owner composite FKs
   where ordinary constraints work (§3). RLS stays as an additional layer,
   not the only layer.
7. **Triggers:** avoid triggers wherever an ordinary constraint or existing
   application behavior is sufficient (§3: both proposal triggers dropped).
8. **Safety invariants:** never clear local data before successful cloud write
   **and** read-back verification; never silently overwrite conflicting data;
   never upload one account's local data to another account (§§5–6).

## 2. Correction to the Phase 3 RLS-only recommendation

Phase 3 recommended simplifying to RLS-only (single-column `id` PK, plain
FKs, no triggers). Per the locked decision (§1.6) that recommendation is
**withdrawn**. The final model is **RLS + composite keys + composite FKs,
zero triggers**:

* RLS (`USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`,
  `TO authenticated`, default-deny) controls **which rows a user can touch**.
* Composite PKs `(user_id, id)` give every upsert an unambiguous conflict
  target and make cross-user overwrites structurally impossible: user A's
  import can only ever address `(A, *)` rows.
* Composite FKs `(user_id, module_id) → modules(user_id, id)` (and the
  three-column `exam_results` key, §3) control **which relationships can
  exist**: a child row is accepted only if its parent row exists **for the
  same user**. Concretely: even if application code (or a guessed id) tried
  to attach user A's objective to user B's module id, the insert fails at
  the database level because no `(A, moduleB)` parent row exists — RLS alone
  would permit the child row (it is A's own row) and only the composite FK
  rejects the cross-owner *reference*. The same holds if RLS were ever
  misconfigured: the FKs still refuse cross-owner links.
* The adapter still always binds `user_id` from the auth session, never from
  imported data (rule M1, §5).

## 3. Final schema resolution (RLS + composites, no triggers)

Keep proposal §2.2 rows 1–8 and the three-column `exam_results` key exactly
as specified (composite FKs, `CASCADE` mirroring the app cascade in
`settings.js:160-168`; `exam_results` key
`(user_id, exam_id, module_id) → exams(user_id, id, module_id)` backed by
`uq_exams_user_id_module`, all `NOT NULL`). Two deliberate deviations from
the proposal, both implementing "avoid triggers" (§1.7):

* **D7 — `captures.objective_id`: plain nullable `TEXT` column, no FK, no
  trigger.** Rationale: the app is already dangling-tolerant (delete of an
  objective leaves the id; capture renders as unlinked — verified current
  behavior). A composite FK with `SET NULL` would rewrite user data on
  delete; a FK with restrict would block deletes the app currently allows.
  Worst case without enforcement is a self-inflicted dead link that renders
  exactly like today's dangling ids — no leak (RLS still bars reading the
  other user's objective) and no data loss. Enforcement = existing app
  behavior; the adapter may additionally check ownership against already
  fetched own objectives before write (no DB procedure).
* **D8 — `user_settings.current_module_id`: plain nullable `TEXT` column,
  no FK, no trigger.** Rationale: the existing fallback
  (`settings.js:170-172`, first module or null) already reproduces correct
  visible behavior for dangling ids, so neither auto-nulling nor a trigger
  is needed. Consequence: the proposal's global `UNIQUE(id)` on `modules`
  (`uq_modules_id`), which existed solely as this FK's target, is **dropped**
  with the FK — removing the only cross-user uniqueness side effect.
  Keep `uq_exams_user_id_module` (still required by the `exam_results` key).

`TEXT[]` link-id sets and `JSONB` history blobs stay unenforced (gaps G1/G2);
repair stays app-level (`syncExamObjectives`, `recalculateObjectiveHistory`,
run after every cloud fetch). Implementation-time SQL amendment: apply the
proposal appendix **minus** §C triggers/functions, with `current_module_id`
as plain `TEXT`, `objective_id` as plain `TEXT`, and without
`uq_modules_id`. Nothing is applied in this phase.

## 4. Account-switching behavior (greenfield — no auth exists in the app today)

Local data in a browser profile currently has no owner. The following is
required implementation behavior (specified here, built later):

* The adapter layer records the last-synced auth user id in a **separate**
  local key (e.g. alongside `emvs_data_v1`, never inside the dataset, never
  from imported data). In-memory cloud state is cleared on sign-out.
* **A different signed-in account must never silently inherit or upload the
  previous account's local dataset.** On detecting
  `auth.uid() != last-synced uid` with a non-empty local dataset, the app
  blocks all cloud writes and shows an explicit account-mismatch prompt
  identifying both sides ("This device holds local data last synced with
  account A. You are signed in as B."). Available actions only:
  (a) download B's cloud data (offer JSON backup of local first);
  (b) upload local to B (only after passing stale/conflict checks in §5
  with C1–C3 confirmations); (c) stay offline / sign out — local untouched.
* **Recovery before any destructive switch:** force-offer a JSON export
  (`exportData`, `store.js:713-721`) and require the same explicit consent
  pattern as backup import/reset (`settings.js`, `confirmDialog`). A switch
  never clears `emvs_data_v1` without a verified backup or a verified
  cloud write + read-back.
* **Interaction with the storage latch** (`store.js:224-232`): while a read
  failure is recorded, saves stay refused regardless of account state;
  signing in/out must not clear the latch — only a successful `load()`,
  explicit reset, or consented backup import clears it.

## 5. Migration and sync semantics (locked)

* **M1 — Never trust an imported `user_id`.** Backups contain none; any
  present value is stripped and replaced with `auth.uid()`.
* **M2 — Cross-account overwrite impossible by construction.** PK
  `(user_id, id)` + RLS + composite FKs; adapter binds the session user.
* **M3 — Boundary normalization only:** `''`→NULL dates, epoch-ms→
  `BIGINT`/`TIMESTAMPTZ`, mock numeric `score/max`→TEXT (round-trip restores
  numbers for mocks when `is_mock`); history/link blobs verbatim.
* **M4 — localStorage never cleared by migration** until read-back
  verification (per-table counts + spot-checks) passes; rollback = keep
  using local data.
* **First upload:** dry-run `importData()` validation first; invalid backups
  never touch Supabase. Ordered per-table upserts, parents before children
  (`modules → objectives → resources → sessions → exams → exam_results →
  plan → captures → reviews → settings`). Explicit "Upload my local data"
  action only (C3).
* **Repeat import, same data:** `INSERT … ON CONFLICT (user_id, id)
  DO UPDATE` with identical values = safe no-op. No deletes in import.
* **Conflicts:** newer `updated_at` wins; equal timestamps with differing
  content count as conflict; `exam_results` compares `created_at` (it has no
  `updated_at`); settings compares its `updated_at`. Cloud-newer rows are
  skipped, listed in a per-table ledger, and overwritten only with explicit
  per-row or per-table confirmation (C1, default = keep cloud).
* **Wholly stale backup** (cloud max newer in every table): abort before any
  write, ask "Backup is older than cloud data — overwrite anyway?" (C2).
* **Partial failure / interrupted upload:** each table's bulk upsert is one
  request = one transaction (PostgREST semantics); a failed table rolls back
  whole, earlier tables stay as idempotent upserts (valid parents-only
  state). Retry resumes at the first incomplete table; re-running completed
  tables is a no-op. Stateless — no resume cursors. A per-table ledger
  (inserted/updated/skipped-conflict/failed) is always shown.
* **Offline / failure:** localStorage is the working copy; failed requests
  keep local behavior predictable with a message, never a silent "done".
  Timer state stays local-only (never synced). JSON export/import always
  available as the ultimate fallback.
* **Orphan rows in hand-edited files:** composite FKs reject them; the row is
  reported as failed, migration continues, the file is never silently
  repaired.

## 6. Resolution register

**Assumption recorded:** the source proposal references "C1–C3" but never
labels them. C1–C3 below are mapped to the three confirmations in proposal
§4.3; this mapping is an assumption of this plan, not a claim about the
original text.

| ID | Resolution | Required vs optional |
|---|---|---|
| D1 composite PKs, preserve client ids | **Required, kept.** Id preservation = correctness; composites = required integrity layer with RLS. | Required |
| D2 `TEXT[]` over junction tables | **Required, kept.** No junction tables at this scale. | Required |
| D3 retain `exam_results` | **Required, kept** (all ten tables). No writers added, no rows discarded. | Required |
| D4 timer local-only | **Required, kept.** | Required |
| D5 auth method | **Resolved: email + password**, strictly private single-owner. Password/session policy details deferred to implementation. | Required (method locked; details deferrable) |
| D6 composite-FK ownership model | **Required, kept** (RLS + composites together). Phase 3 RLS-only simplification withdrawn (§2). | Required |
| D7 `captures.objective_id` | **Resolved: plain column, no FK, no trigger** (app dangling-tolerance is the enforcer). | Required (trigger explicitly dropped) |
| D8 `user_settings.current_module_id` | **Resolved: plain column, no FK, no trigger** (app fallback is the enforcer); drop `uq_modules_id`. | Required (trigger + FK explicitly dropped) |
| D9 weekly-review `COALESCE` index | **Deferred.** App find-or-edit dedup stays the enforcer. | Optional future |
| R1 dangling link ids | Pre-existing, accepted. No silent sweeps. | Accepted (not a blocker) |
| R2 mixed `score/max` types | Handled via M3 + `TEXT` columns; no history rewrite. | Required handling |
| R3 RLS/composites untested | **Isolation gate (§7) must pass before any real data.** Nothing claimed secure until green. | Required gate |
| R4 `exam_results` read-mostly | Accepted as specified. | Accepted |
| R5 weekly uniqueness app-side | Accepted; D9 deferred. | Accepted |
| R6 trigger maintenance | **Eliminated** (zero triggers in final model). | Resolved |
| C1 overwrite cloud-newer row | Explicit per-row/per-table confirmation; default keep cloud. | Required UI |
| C2 apply wholly stale backup | Abort + explicit "overwrite anyway?" confirmation. | Required UI |
| C3 first upload | Explicit opt-in action; never automatic on login. | Required UI |

## 7. Ordered implementation checklist (do not start without user go-ahead)

1. **Baseline.** Commit or stash the uncommitted `phase-2.2.1-banner-fix`
   delta so the starting point is unambiguous. *Accept:* `git status` clean
   or delta explicitly tracked. *Rollback:* n/a.
2. **Project + Auth.** Create Supabase project; enable email+password Auth;
   anon key in git-ignored local config only. *Accept:* `grep` for keys /
   `service_role` in repo clean; no users yet. *Rollback:* rotate key /
   reset project.
3. **Schema (amended appendix).** Apply proposal SQL **minus §C triggers**,
   with D7/D8 as plain columns and without `uq_modules_id`; keep
   `uq_exams_user_id_module`. Verify tables, composite PKs/FKs, RLS enabled,
   grants to `authenticated` only, policies. *Accept:* dashboard review
   matches §3. *Rollback:* drop schema / reset project; app untouched.
4. **Two-user isolation gate — must pass before any app/cloud code.**
   Positive: own CRUD on all 10 tables incl. settings. Negative: cross-user
   SELECT/INSERT/UPDATE/DELETE denied; cross-owner `module_id` insert
   rejected by composite FK; cross-module `exam_results` insert rejected by
   the three-column FK; `anon` sees nothing; `auth.users` delete cascades.
   Synthetic data only. *Accept:* all green. *Rollback:* fix SQL/RLS,
   re-run; no real data involved.
5. **Adapter (no behavior change).** Add `supabase-js` + `SupabaseAdapter`
   behind `storageAdapter.js`; `localStorageAdapter` stays default; offline
   fallback; M1/M3 in adapter; last-synced-uid tracking. *Accept:* `npm
   test` green; success paths unchanged. *Rollback:* `setAdapter` back.
6. **Migration + sync UI on copies only** (§§4–5: validation, ordering,
   ledger, C1–C3, account-switch prompt, latch interaction). Test with
   synthetic data and a *copy* of a real backup, never the live profile.
   *Accept:* repeat = no-op; stale aborts; conflicts listed; interruption
   resumable; local byte-identical until verification. *Rollback:* stay on
   local; abandon cloud rows (idempotent, safe).
7. **Opt-in cutover.** Per-profile explicit opt-in; local fallback + JSON
   export untouched; manual upload/download only. *Accept:* cross-device
   read works; offline predictable; failures messaged. *Rollback:* flip
   adapter back; re-import last JSON backup.

## 8. Genuinely unresolved questions

1. Supabase email/password policy details (confirmation email required?
   session persistence length?) — implementation-time defaults acceptable.
2. Exact German UI copy for the account-mismatch prompt and conflict ledger
   — draft during implementation.
3. Payload chunking threshold if a table ever exceeds single-request limits
   (current KB-scale data needs none; per-chunk ledger already specified).
