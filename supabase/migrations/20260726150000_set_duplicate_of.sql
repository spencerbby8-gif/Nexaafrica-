-- Nexa prod hardening 2026-07-26: duplicate_of never set (issue #8)
-- Mark cross-listing duplicates: identical company + title + location, keeping
-- the earliest-seen job as canonical. Reversible (duplicate_of is nullable).
WITH dups AS (
  SELECT id,
         FIRST_VALUE(id) OVER w AS canon,
         ROW_NUMBER() OVER w AS rn
  FROM public.jobs
  WHERE is_active = true
  WINDOW w AS (
    PARTITION BY lower(company), lower(title), COALESCE(location, '')
    ORDER BY created_at ASC NULLS LAST, posted_at ASC NULLS LAST
  )
)
UPDATE public.jobs
SET duplicate_of = dups.canon
FROM dups
WHERE public.jobs.id = dups.id AND dups.rn > 1 AND public.jobs.duplicate_of IS NULL;
