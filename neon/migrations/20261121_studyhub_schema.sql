-- Study Hub Neon schema alignment and row security.
-- Applied to project lively-morning-24456871, database neondb, branch production.
-- IDs remain text because Study Hub generates text IDs. Auth user IDs remain UUIDs.
-- All app rows are isolated with Neon Auth JWT-backed auth.uid() policies.

ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS modules_user_id_program_id_fkey;
ALTER TABLE public.topics DROP CONSTRAINT IF EXISTS topics_user_id_module_id_fkey;
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_user_id_module_id_fkey;
ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS notes_user_id_topic_id_fkey;
ALTER TABLE public.homework DROP CONSTRAINT IF EXISTS homework_user_id_module_id_fkey;
ALTER TABLE public.homework DROP CONSTRAINT IF EXISTS homework_user_id_topic_id_fkey;
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_user_id_module_id_fkey;
ALTER TABLE public.links DROP CONSTRAINT IF EXISTS links_user_id_module_id_fkey;
ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_user_id_module_id_fkey;

ALTER TABLE public.programs ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.modules ALTER COLUMN id TYPE text USING id::text, ALTER COLUMN program_id TYPE text USING program_id::text;
ALTER TABLE public.topics ALTER COLUMN id TYPE text USING id::text, ALTER COLUMN module_id TYPE text USING module_id::text;
ALTER TABLE public.notes ALTER COLUMN id TYPE text USING id::text, ALTER COLUMN module_id TYPE text USING module_id::text, ALTER COLUMN topic_id TYPE text USING topic_id::text;
ALTER TABLE public.homework ALTER COLUMN id TYPE text USING id::text, ALTER COLUMN module_id TYPE text USING module_id::text, ALTER COLUMN topic_id TYPE text USING topic_id::text;
ALTER TABLE public.exams ALTER COLUMN id TYPE text USING id::text, ALTER COLUMN module_id TYPE text USING module_id::text;
ALTER TABLE public.links ALTER COLUMN id TYPE text USING id::text, ALTER COLUMN module_id TYPE text USING module_id::text;
ALTER TABLE public.lessons ALTER COLUMN id TYPE text USING id::text, ALTER COLUMN module_id TYPE text USING module_id::text;
ALTER TABLE public.checklist_items ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE public.modules ALTER COLUMN program_id SET NOT NULL;
ALTER TABLE public.topics ALTER COLUMN module_id SET NOT NULL;

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS body text NOT NULL DEFAULT '';
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'note';
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS overview_note_id text;
ALTER TABLE public.homework ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE public.homework ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false;
ALTER TABLE public.homework ADD COLUMN IF NOT EXISTS done_at bigint;
ALTER TABLE public.homework ADD COLUMN IF NOT EXISTS recurrence jsonb;
ALTER TABLE public.exams ALTER COLUMN grade TYPE double precision USING grade::double precision;
ALTER TABLE public.exams ALTER COLUMN notes SET DEFAULT '';
ALTER TABLE public.exams ALTER COLUMN notes SET NOT NULL;
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS topic_ids text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS grade_note text NOT NULL DEFAULT '';
ALTER TABLE public.exams ALTER COLUMN grade_note SET NOT NULL;
ALTER TABLE public.links ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '';
ALTER TABLE public.links ADD COLUMN IF NOT EXISTS url text NOT NULL DEFAULT '';
ALTER TABLE public.links ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS day_of_week smallint NOT NULL DEFAULT 1;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS start_time text NOT NULL DEFAULT '08:00';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS end_time text NOT NULL DEFAULT '09:00';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS room text NOT NULL DEFAULT '';
ALTER TABLE public.checklist_items ADD COLUMN IF NOT EXISTS text text NOT NULL DEFAULT '';
ALTER TABLE public.checklist_items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'light';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS nav_collapsed boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS email_reminders boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS last_export_at bigint;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS change_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS current_program_id text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS updated_at bigint NOT NULL DEFAULT 0;
ALTER TABLE public.modules ALTER COLUMN overview_note_id TYPE text USING overview_note_id::text;
ALTER TABLE public.notes ALTER COLUMN overview_note_id TYPE text USING overview_note_id::text;

ALTER TABLE public.modules ADD CONSTRAINT modules_user_id_program_id_fkey FOREIGN KEY (user_id, program_id) REFERENCES public.programs(user_id, id) ON DELETE CASCADE;
ALTER TABLE public.topics ADD CONSTRAINT topics_user_id_module_id_fkey FOREIGN KEY (user_id, module_id) REFERENCES public.modules(user_id, id) ON DELETE CASCADE;
ALTER TABLE public.notes ADD CONSTRAINT notes_user_id_module_id_fkey FOREIGN KEY (user_id, module_id) REFERENCES public.modules(user_id, id) ON DELETE CASCADE;
ALTER TABLE public.notes ADD CONSTRAINT notes_user_id_topic_id_fkey FOREIGN KEY (user_id, topic_id) REFERENCES public.topics(user_id, id) ON DELETE SET NULL (topic_id);
ALTER TABLE public.homework ADD CONSTRAINT homework_user_id_module_id_fkey FOREIGN KEY (user_id, module_id) REFERENCES public.modules(user_id, id) ON DELETE CASCADE;
ALTER TABLE public.homework ADD CONSTRAINT homework_user_id_topic_id_fkey FOREIGN KEY (user_id, topic_id) REFERENCES public.topics(user_id, id) ON DELETE SET NULL (topic_id);
ALTER TABLE public.exams ADD CONSTRAINT exams_user_id_module_id_fkey FOREIGN KEY (user_id, module_id) REFERENCES public.modules(user_id, id) ON DELETE CASCADE;
ALTER TABLE public.links ADD CONSTRAINT links_user_id_module_id_fkey FOREIGN KEY (user_id, module_id) REFERENCES public.modules(user_id, id) ON DELETE CASCADE;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_user_id_module_id_fkey FOREIGN KEY (user_id, module_id) REFERENCES public.modules(user_id, id) ON DELETE CASCADE;

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY studyhub_own_rows ON public.programs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY studyhub_own_rows ON public.modules FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY studyhub_own_rows ON public.topics FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY studyhub_own_rows ON public.notes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY studyhub_own_rows ON public.homework FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY studyhub_own_rows ON public.exams FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY studyhub_own_rows ON public.links FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY studyhub_own_rows ON public.lessons FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY studyhub_own_rows ON public.checklist_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY studyhub_own_rows ON public.user_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs, public.modules, public.topics, public.notes, public.homework, public.exams, public.links, public.lessons, public.checklist_items, public.user_settings TO authenticated;
