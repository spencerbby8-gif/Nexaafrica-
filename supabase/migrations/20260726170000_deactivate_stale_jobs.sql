-- Nexa prod hardening 2026-07-26: stale jobs still active (issue #7)
-- Mirrors app/api/jobs/deactivate-stale default thresholds (posted_at 60d,
-- expires_at past now). The deactivate-stale cron had not been firing.
UPDATE public.jobs
SET is_active = false
WHERE is_active = true
  AND (posted_at < now() - interval '60 day'
       OR (expires_at IS NOT NULL AND expires_at < now()));
