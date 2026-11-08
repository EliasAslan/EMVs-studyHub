-- =====================================================================
-- Study Hub — v3 cloud schema (clean slate)
--
-- Run this on a fresh Supabase project, or run §R first to remove the
-- archived vanilla-app tables. The previous dataset is disposable for
-- this release; export a JSON backup before dropping anything.
--
-- Model:
--   * Every row belongs to auth.uid(); composite keys (user_id, id).
--   * Deletes are soft (deleted_at BIGINT, epoch ms); app prunes after 90 days.
--   * Blobs never enter Postgres: attachments is metadata-only JSONB.
--   * RLS policy `own_rows` on every table; authenticated grants only.
-- =====================================================================

-- ==================== §R. Rollback (optional, destructive) ====================
-- Old vanilla-app tables:
DROP TABLE IF EXISTS user_settings, weekly_reviews, captures,
  plan_items, exam_results, exams, study_sessions, resources,
  learning_objectives, modules CASCADE;

-- v3 tables (for a clean re-run):
DROP TABLE IF EXISTS user_settings, checklist_items, lessons, links, exams,
  homework, notes, topics, modules, programs CASCADE;

-- ==================== §A. Tables ====================

CREATE TABLE programs (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#4f46e5',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE modules (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  program_id TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  accent TEXT NOT NULL DEFAULT '#4f46e5',
  sort_order INTEGER NOT NULL DEFAULT 0,
  attachments JSONB NOT NULL DEFAULT '[]',
  overview_note_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, program_id) REFERENCES programs (user_id, id) ON DELETE CASCADE
);

CREATE TABLE topics (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE notes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT,
  topic_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'note'
    CHECK (type IN ('note', 'mistake', 'question', 'summary')),
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, topic_id) REFERENCES topics (user_id, id) ON DELETE CASCADE
);

CREATE TABLE homework (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT,
  topic_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  due_date DATE,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  done_at BIGINT,
  recurrence JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, topic_id) REFERENCES topics (user_id, id) ON DELETE CASCADE
);

CREATE TABLE exams (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT,
  topic_ids TEXT[] NOT NULL DEFAULT '{}',
  title TEXT NOT NULL DEFAULT '',
  date DATE,
  notes TEXT NOT NULL DEFAULT '',
  grade DOUBLE PRECISION
    CHECK (grade IS NULL OR (grade BETWEEN 1 AND 6 AND grade * 2 = floor(grade * 2))),
  grade_note TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE links (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  module_id TEXT,
  label TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'custom'
    CHECK (kind IN ('teams', 'onenote', 'website', 'youtube', 'custom')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE lessons (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TEXT NOT NULL DEFAULT '08:00',
  end_time TEXT NOT NULL DEFAULT '09:00',
  module_id TEXT,
  label TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, module_id) REFERENCES modules (user_id, id) ON DELETE CASCADE
);

CREATE TABLE checklist_items (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('custom', 'studied')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  nav_collapsed BOOLEAN NOT NULL DEFAULT FALSE,
  email TEXT NOT NULL DEFAULT '',
  email_reminders BOOLEAN NOT NULL DEFAULT FALSE,
  last_export_at BIGINT,
  change_count INTEGER NOT NULL DEFAULT 0,
  current_program_id TEXT,
  updated_at BIGINT NOT NULL
);

-- ==================== §B. Indexes ====================

CREATE INDEX idx_modules_user_program ON modules (user_id, program_id);
CREATE INDEX idx_topics_user_module ON topics (user_id, module_id);
CREATE INDEX idx_notes_user_module ON notes (user_id, module_id);
CREATE INDEX idx_notes_user_topic ON notes (user_id, topic_id);
CREATE INDEX idx_homework_user_module ON homework (user_id, module_id);
CREATE INDEX idx_homework_user_due ON homework (user_id, due_date);
CREATE INDEX idx_exams_user_module ON exams (user_id, module_id);
CREATE INDEX idx_exams_user_date ON exams (user_id, date);
CREATE INDEX idx_links_user_module ON links (user_id, module_id);
CREATE INDEX idx_lessons_user_day ON lessons (user_id, day_of_week);

CREATE INDEX idx_programs_deleted ON programs (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_modules_deleted ON modules (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_topics_deleted ON topics (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_notes_deleted ON notes (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_homework_deleted ON homework (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_exams_deleted ON exams (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_links_deleted ON links (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_lessons_deleted ON lessons (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_checklist_deleted ON checklist_items (user_id, deleted_at) WHERE deleted_at IS NOT NULL;

-- ==================== §C. RLS + grants ====================

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON programs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON topics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON homework TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings TO authenticated;

CREATE POLICY own_rows ON programs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON modules FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON topics FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON notes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON homework FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON exams FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON links FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON lessons FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON checklist_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY own_rows ON user_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
