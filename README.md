# EMVS Study Hub

German (de-CH) single-user study manager. Vanilla ES modules, no framework, no build step.

## Quick Start

```bash
npm install   # only for test runner dependencies (none — uses Node built-ins)
npm start     # serves on http://localhost:8080
npm test      # runs all 17 test suites
```

## Architecture

| Concern | File |
|---------|------|
| App bootstrap, `window.EMVS` global | `js/app.js` |
| Persistence (localStorage), data model, entity mutators | `js/services/store.js` |
| Storage adapter + failure latch | `js/services/storageAdapter.js` |
| Cloud schema (Supabase) | `PHASE_4_SETUP.sql` (v1), `PHASE_5_SETUP.sql` (v2) |
| Cloud camelCase↔snake_case mapping | `js/services/cloudMap.js` |
| Cloud sync primitives + merge engine | `js/services/cloudSync.js` |
| Supabase client + publishable key | `js/services/supabaseClient.js` |
| Auth UI + sync buttons | `js/services/auth.js` |
| Sync status persistence + error translation | `js/services/syncStatus.js` |
| Field/pure helpers (weakness, grades) | `js/utils/helpers.js` |
| Layout registry (6 layouts) | `js/utils/navLayout.js` |
| Nav layout renderers | `js/components/nav/{index,context,tree,mega,dock,bento,mobile,shared}.js` |
| Classic shell + module section | `js/components/sidebar.js` |
| Bottom tabbar + More sheet | `js/components/tabbar.js` |
| Views (one per route) | `js/views/*.js` (router: `js/views/router.js`) |
| Tests (plain Node, no framework) | `tests/*.test.mjs` |

## Data Model (camelCase, key `emvs_data_v1`)

Top-level collections: `modules`, `learningObjectives`, `resources`, `studySessions`, `exams`, `examResults`, `planItems`, `captures`, `weeklyReviews`, `settings`, `tombstones`.

Every entity has `id` (`generateId()` = `<base36-time>-<base36-random>`), `createdAt`, `updatedAt` (epoch ms).

**Review ladder**: `REVIEW_INTERVALS = [1, 4, 10, 21, 45, 90]` days.

**History arrays** (capped at 100): `confidenceHistory`, `sessionHistory`, `reviewHistory`, `usageHistory`, `understoodHistory`.

## Cloud (Supabase)

- 10 tables: `modules`, `learning_objectives`, `resources`, `study_sessions`, `exams`, `exam_results`, `plan_items`, `captures`, `weekly_reviews`, `user_settings`
- Composite PKs `(user_id, id)`; RLS `own_rows` policies; grants to `authenticated` only
- **v2 schema** (`PHASE_5_SETUP.sql`): adds `deleted_at BIGINT` on 9 tables for tombstones; `study_sessions.start_time` and `captures.timestamp` as `BIGINT` epoch ms

## Sync Semantics (v2)

- **Cloud is source of truth**; localStorage is offline cache
- **Silent auto-sync**: on sign-in, app start (if session exists), 25s debounced after `save()`, `visibilitychange → hidden`, multi-tab `storage` event
- **Merge engine** (`syncState()`): 9-step LWW by `updatedAt` (examResults by `createdAt`); tombstones propagate both ways; FK closure enforced; >10 local erasures → backup prompt
- **Manual buttons** (Settings): force upload / force download for recovery
- **No routine dialogs**; failures show red dot + retry, never toast-spam

## Navigation (6 layouts kept)

| Layout | Group | Description |
|--------|-------|-------------|
| `tree` | sidebar | **Default** — hierarchical subjects → chapters → topics |
| `mega` | bar | Top bar with grouped mega menus |
| `dock` | bar | Floating pill dock |
| `context` | smart | Goal-based: Learn / Practice / Plan / Review |
| `bento` | smart | Visual launchpad of grouped cards |
| `mobile` | bar | Phone-first: bottom bar + contextual header |

**Removed**: `rail`, `workspace`, `command`, `focus` (legacy IDs migrate automatically).

## Key Decisions (locked)

- Cloud primary, local cache; login optional (no wall)
- Tombstones for deletes; 90-day prune
- `shaky` review = repeat current rung (doc wins)
- `markUnderstood` never writes `confidence` (confirmDialog if <4)
- Swiss grade 1–6 (6 best, <4 fail); `de-CH` formatting
- XSS discipline: all user content → `escapeHtml`/`escapeAttr`
- No frameworks, no build, no new deps (CDN vendors documented in `VENDORING.md`)
- Services DOM-free/pure for plain-Node tests

## Testing

```bash
npm test
```

- 17 test suites, plain Node (no framework)
- Auto-discovered via `tests/run.mjs` glob
- Cover: storage, reliability, navigation, sync, PDF, planning, weaknesses, plan rollover

## Out of Scope

- `localAI.js` / `pdfExtract.js` internals (prompts, model `qwen3:8b`, caps)
- CRDTs / conflict-free replicated data types
- Any change to Swiss grade direction or `generateId()`

## License

Private / educational use.