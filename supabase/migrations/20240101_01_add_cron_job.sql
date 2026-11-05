-- Add pg_cron extension for scheduled email reminders
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the deadline reminder function to run weekly on Friday at 18:00 UTC
-- Adjust the schedule as needed (cron format: minute hour day-of-month month day-of-week)
-- FRIS 18 * * 5 runs at 18:00 every Friday (day 5 = Friday)
-- You can change to SATURDAY by using day 6 instead of 5

SELECT cron.schedule(
  '0 18 * * 5',  -- Every Friday at 18:00 UTC
  $$SELECT supabase_admin.invoke_function('send-deadline-reminders')$$
);

-- Also add a comment for reference
COMMON ON
SELECT cron.schedule(
  '0 18 * * 5',  -- Weekly on Friday at 18:00 UTC
  'Invoke send-deadline-reminders Edge Function for deadline reminders'
);