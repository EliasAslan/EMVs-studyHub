-- Study Hub v2.1 — additive schema fields.
-- Run this once in the Supabase SQL editor for an existing project.
-- Fresh projects created from PHASE_6_SETUP.sql already include these columns.

ALTER TABLE modules ADD COLUMN IF NOT EXISTS overview_note_id TEXT;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS recurrence JSONB;
