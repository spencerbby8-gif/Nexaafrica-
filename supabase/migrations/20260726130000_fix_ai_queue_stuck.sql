-- Nexa prod hardening 2026-07-26: AI queue stuck rows (issue #3, data)
-- Root cause: processAIQueue recovery uses started_at < cutoff, which never
-- matches NULL started_at, so 'processing' rows with NULL started_at stick
-- forever. This resets them to pending. (Code fix for the recovery query is
-- in lib/ai/engine.ts.) Idempotent.
UPDATE public.ai_processing_queue
SET status = 'pending', started_at = NULL,
    error = 'Reset stuck (started_at NULL) 2026-07-26'
WHERE status = 'processing' AND started_at IS NULL;
