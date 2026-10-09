-- =====================================================================
-- EMVS Study Hub — Phase 4 setup script (REVIEWED, NOT YET APPLIED)
--
-- Source: PHASE_3_FINAL_PLAN.md §§2–3 (authoritative) + §7 step 3.
-- Derives from the PHASE_2_SCHEMA_PROPOSAL.md appendix with exactly
-- three deviations, all required by the locked Phase 3.1 decisions:
--   (1) §C triggers/functions REMOVED entirely (zero triggers, D7/D8);
--   (2) user_settings.current_module_id is a plain nullable TEXT column
--       (no FK, no trigger; app fallback is the enforcer, D8);
--   (3) uq_modules_id REMOVED (it existed solely as that FK's target).
-- Kept unchanged: 10 tables, composite PKs (user_id, id), same-owner
-- composite FKs (rows 1–8), three-column exam_results FK + backing
-- uq_exams_user_id_module, CHECKs/defaults, indexes, RLS + grants +
-- policies. captures.objective_id stays a plain nullable TEXT column (D7).
--
-- HOW TO RUN (read these first):
--   1. Run the §0 PRE-FLIGHT query below first and confirm the project
--      is empty (no public.* EMVS tables yet). Do NOT run §§A–B twice:
--      plain CREATE TABLE statements fail if tables already exist.
--      If a re-run is ever needed, drop the tables first (rollback, §R).
--   2. Paste §§A–B into the Supabase SQL Editor and run once.
--   3. Use SYNTHETIC test data only. Never real study data in Phase 4.
-- =====================================================================

-- ==================== §0. PRE-FLIGHT (read-only, run first) =================
-- Expected on an empty project: zero rows.
-- If any of the 10 EMVS tables already exist, STOP and report back
-- before running §§A–B.

-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('modules','learning_objectives','resources',
--       'study_sessions','exams','exam_results','plan_items','captures',
--       'weekly_reviews','user_settings')
--   ORDER BY table_name;

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

-- Supporting UNIQUE for the exam_results invariant: the three-column
-- foreign key below needs (user_id, id, module_id) to be a UNIQUE
-- constraint on exams. (This is uq_exams_user_id_module — RETAINED.
-- The removed uq_modules_id is intentionally absent: with no FK on
-- user_settings.current_module_id, no global module-id UNIQUE exists.)
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
  -- objective_id is INTENTIONALLY unconstrained (no FK, no trigger, D7):
  -- the app tolerates dangling objective refs (renders as unlinked), a
  -- SET NULL FK would rewrite user data on delete, and a restrictive FK
  -- would block deletes the app currently allows.
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
  -- current_module_id is INTENTIONALLY a plain column (no FK, no trigger,
  -- D8): the app fallback (first module or null) already handles dangling
  -- ids, so neither auto-nulling nor an ownership trigger is needed.
  current_module_id TEXT,
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
-- Default-deny: RLS enabled on all 10 tables, no permissive policy means
-- no access. Grants to `authenticated` only; nothing to `anon`;
-- `service_role` is never used by the frontend.

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

-- One FOR ALL policy per table (policy names are per-table scoped in
-- PostgreSQL, so reusing `own_rows` on each table is valid).
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

-- ==================== §R. Rollback (only if re-run needed) =================
-- The script is run-once. If you ever need a clean re-run, execute this
-- FIRST (destroys all EMVS cloud data — synthetic test data only in
-- Phase 4), then re-run §§A–B:
--
-- DROP TABLE IF EXISTS user_settings, weekly_reviews, captures,
--   plan_items, exam_results, exams, study_sessions, resources,
--   learning_objectives, modules;
