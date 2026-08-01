-- ============================================================================
-- Nexa Stabilization Phase — 2026-08-01
-- 1) Africa admission gate: reclassify location-restricted jobs in existing data
-- 2) Queue reliability: retry backoff column (no more TTL expiry)
-- 3) Company learning: real aggregation function for company_intelligence
-- Applied directly to production (psql) — repo copy kept for drift-free history.
-- ============================================================================

-- ── 2) Queue retry scheduling column ────────────────────────────────────────
ALTER TABLE public.ai_processing_queue ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;
CREATE INDEX IF NOT EXISTS ai_processing_queue_next_retry_idx
  ON public.ai_processing_queue (next_retry_at) WHERE status = 'pending';

-- ── 1) Africa admission backfill ────────────────────────────────────────────
-- Reclassify jobs whose description carries restriction language, UNLESS the
-- posting explicitly welcomes Africa (mirrors classifyEligibility precedence).
UPDATE public.jobs
SET eligibility = 'restricted', is_open_to_africa = false
WHERE is_active
  AND eligibility <> 'restricted'
  AND description_md ~* '(must be (based|located|residing|licensed|registered) in|work authorization for|authorized to work in the (us|uk|eu|canada)|citizens? of|residents? of (the )?(us|uk|eu|canada) only|(us|uk|eu) (only|residents only|citizens only|based only)|(based|located|residing|licensed|registered|board[- ]certified) in (the )?(state of )?(connecticut|california|texas|new york|florida|illinois|pennsylvania|ohio|georgia|north carolina|south carolina|michigan|new jersey|virginia|washington|arizona|massachusetts|tennessee|indiana|missouri|maryland|wisconsin|colorado|minnesota|alabama|louisiana|kentucky|oregon|oklahoma|utah|iowa|nevada|arkansas|mississippi|kansas|new mexico|nebraska|west virginia|idaho|hawaii|maine|new hampshire|montana|rhode island|delaware|south dakota|north dakota|alaska|vermont|wyoming)|(us|united states) (work )?(authorization|eligibility|citizenship|resident|remote|only)|(must )?(be|hold|have) (a )?(valid )?(us|state|medical|nursing|law|attorney|teaching) licen[cs]e|licensed to (work|practice) in (the )?(us|usa|united states|uk|canada)|(within|inside) the (us|united states|uk|united kingdom|eu|canada)|(candidates?|applicants?) (must be|need to be|should be|will be) (based|located|residing|in)|no (visa )?(sponsorship|sponsoring)|(cannot|cannot|can''t|do not|don''t) (provide )?(visa )?sponsorship|(work|employment) authorization (is )?required|(location|locations?)[:—-] ?(us|usa|united states|uk|u\.?k\.?|canada|eu))'
  AND NOT (description_md ~* '(\bafrica\b|\bemea\b|nigeria|kenya|south africa|ghana|egypt|morocco|ethiopia|tanzania|uganda|rwanda|senegal|tunisia|cameroon|zambia|zimbabwe|botswana|namibia|mozambique|angola|ivory coast|lagos|nairobi|accra|addis ababa|cairo|casablanca)');

-- Reclassify jobs located in a restricted country/region with no global
-- outreach language anywhere in the posting.
UPDATE public.jobs
SET eligibility = 'restricted', is_open_to_africa = false
WHERE is_active
  AND eligibility <> 'restricted'
  AND country ~* '^(us|usa|united states|uk|u\.?k\.?|united kingdom|canada|eu|europe|germany|france|spain|italy|netherlands|poland|sweden|norway|denmark|finland|belgium|austria|switzerland|ireland|portugal|australia|new zealand|india|singapore|japan|israel|uae|dubai|qatar|saudi arabia|turkey|brazil|mexico|argentina|colombia|chile|philippines|indonesia|vietnam|thailand|malaysia|south korea|taiwan|hong kong|latam|apac)$'
  AND NOT (description_md ~* '(worldwide|anywhere|global(ly)?|any (time ?zone|location|country)|emea|\bafrica\b|any country)');

-- Trust correctness: jobs the AI already judged restricted are restricted.
UPDATE public.jobs
SET eligibility = 'restricted', is_open_to_africa = false
WHERE id IN (SELECT job_id FROM public.job_ai_intelligence WHERE africa_eligibility = 'restricted')
  AND eligibility <> 'restricted';

-- ── Queue: requeue every TTL-expired job for real processing ───────────────
UPDATE public.ai_processing_queue
SET status = 'pending', error = NULL, completed_at = NULL, attempts = 0, next_retry_at = now()
WHERE error LIKE 'Expired:%';

-- ── 3) Company learning aggregation function ────────────────────────────────
CREATE OR REPLACE FUNCTION public.aggregate_company_intelligence()
RETURNS TABLE (
  company text,
  total_jobs bigint,
  africa_eligible_jobs bigint,
  remote_jobs bigint,
  rejected_jobs bigint,
  dead_page_count bigint,
  verified_count bigint,
  africa_rate real,
  rejection_rate real,
  verification_rate real,
  trust_avg int
)
LANGUAGE sql
AS $$
  WITH base AS (
    SELECT
      j.company,
      (j.eligibility IN ('explicit','likely') AND COALESCE(jai.africa_eligibility, 'unknown') <> 'restricted') AS africa_ok,
      j.is_remote AS remote_ok,
      (q.status = 'failed' OR (q.status = 'completed' AND (q.error LIKE 'Skipped%' OR q.error LIKE 'Rejected%'))) AS rejected,
      (jai.page_status IS NOT NULL AND jai.page_status >= 400) AS dead,
      (jai.model_version LIKE '%:%' AND jai.model_version NOT LIKE 'regex%') AS verified,
      j.trust_score
    FROM public.jobs j
    LEFT JOIN public.job_ai_intelligence jai ON jai.job_id = j.id
    LEFT JOIN public.ai_processing_queue q ON q.job_id = j.id
    WHERE j.is_active
  )
  SELECT
    b.company,
    count(*)::bigint,
    count(*) FILTER (WHERE b.africa_ok)::bigint,
    count(*) FILTER (WHERE b.remote_ok)::bigint,
    count(*) FILTER (WHERE b.rejected)::bigint,
    count(*) FILTER (WHERE b.dead)::bigint,
    count(*) FILTER (WHERE b.verified)::bigint,
    (count(*) FILTER (WHERE b.africa_ok))::real / NULLIF(count(*), 0)::real,
    (count(*) FILTER (WHERE b.rejected))::real / NULLIF(count(*), 0)::real,
    (count(*) FILTER (WHERE b.verified))::real / NULLIF(count(*), 0)::real,
    round(avg(b.trust_score))::int
  FROM base b
  GROUP BY b.company
$$;
