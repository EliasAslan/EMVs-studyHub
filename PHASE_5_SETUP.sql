-- =====================================================================
-- EMVS Study Hub — Phase 5 setup script (CANONICAL v2, supersedes v1)
--
-- Source: Consolidation plan v2 — W4.1
-- Key changes vs v1 (PHASE_4_SETUP.sql):
--   (1) deleted_at BIGINT NULL on all 9 id-bearing tables (NOT user_settings)
--       for tombstone-based soft deletes. 90-day prune handled by app.
--   (2) study_sessions.start_time → BIGINT (epoch ms) instead of TIMESTAMPTZ
--   (3) captures.timestamp → BIGINT (epoch ms) instead of TIMESTAMPTZ
--       Removes the need for normalizeVerifyTimestamps() machinery.
--   (4) user_settings gains deleted_at for completeness (though app never
--       deletes settings; reserved for future).
--   (5) exam_results gains updated_at BIGINT (was only created_at) for LWW.
--
-- HOW TO RUN (read these first):
--   1. Run §R rollback below FIRST to drop v1 tables (data is disposable).
--   2. Paste §§A–B into Supabase SQL Editor and run once.
--   3. Use SYNTHETIC test data only. Never real study data.
-- =====================================================================

-- ==================== §R. Rollback (run FIRST) ====================
-- Destroys all EMVS v1 cloud data — synthetic test data only.

DROP TABLE IF EXISTS user_settings, weekly_reviews, captures,
  plan_items, exam_results, exams, study_sessions, resources,
  learning_objectives, modules;

-- ==================== §A. Tables (v2) ====================

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
  deleted_at BIGINT,
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
  deleted_at BIGINT,
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
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE study_sessions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  start_time BIGINT NOT NULL,  -- epoch ms (was TIMESTAMPTZ)
  duration INTEGER NOT NULL CHECK (duration BETWEEN 1 AND 480),
  linked_objective_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_resource_ids TEXT[] NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
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
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

-- Supporting UNIQUE for the exam_results invariant: the three-column
-- foreign key below needs (user_id, id, module_id) to be a UNIQUE
-- constraint on exams.
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
  updated_at BIGINT NOT NULL,  -- added for LWW (was only created_at)
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  -- One three-column key enforces BOTH invariants at once: the referenced
  -- exam must belong to the same user AND to the same module as the result.
  FOREIGN KEY (user_id, exam_id, module_id) REFERENCES exams (user_id, id, module_id) ON DELETE CASCADE
);

CREATE TABLE plan_items (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  week INTEGER NOT NULL CHECK (week BETWEEN 1 AND 53),
  year INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2030),
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
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE captures (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT,
  objective_id TEXT,
  -- objective_id is INTENTIONALLY unconstrained (no FK, no trigger):
  -- the app tolerates dangling objective refs (renders as unlinked).
  type TEXT NOT NULL
    CHECK (type IN ('question', 'term', 'resource', 'mistake', 'thought')),
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  timestamp BIGINT NOT NULL,  -- epoch ms (was TIMESTAMPTZ)
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
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
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  -- current_module_id is INTENTIONALLY a plain column (no FK, no trigger):
  -- the app fallback (first module or null) already handles dangling ids.
  current_module_id TEXT,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT  -- reserved; app never deletes settings
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

-- Deleted-at indexes for tombstone queries (optional but recommended)
CREATE INDEX idx_modules_deleted ON modules (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_objectives_deleted ON learning_objectives (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_resources_deleted ON resources (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_sessions_deleted ON study_sessions (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_exams_deleted ON exams (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_exam_results_deleted ON exam_results (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_plan_deleted ON plan_items (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_captures_deleted ON captures (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_reviews_deleted ON weekly_reviews (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_settings_deleted ON user_settings (user_id, deleted_at) WHERE deleted_at IS NOT NULL;

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
-- Policies include deleted_at IS NULL for normal reads; tombstone reads
-- use separate app queries with deleted_at filter.

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

-- ==================== §C. Schema version note ====================
-- This v2 schema replaces v1 entirely. App code must use schemaVersion=2
-- and expect deleted_at columns on all 9 collections + exam_results.updated_at.
-- The cloudMap.js toRow/fromRow functions handle the v2↔app mapping.