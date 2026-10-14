-- Additive only. Preserve existing queue rows and historical model output.
ALTER TABLE public.ai_processing_queue ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.ai_processing_queue ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
ALTER TABLE public.ai_provider_log ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_log_request_event_unique
 ON public.ai_provider_log(request_id,event);

CREATE TABLE IF NOT EXISTS public.ai_verification_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(), operation text NOT NULL,
 previous_row jsonb, current_row jsonb NOT NULL
);
ALTER TABLE public.ai_verification_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_verification_history FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.ai_verification_history FROM service_role;
GRANT SELECT,INSERT ON public.ai_verification_history TO service_role;
CREATE OR REPLACE FUNCTION public.archive_ai_verification() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
BEGIN
 INSERT INTO public.ai_verification_history(job_id,operation,previous_row,current_row)
 VALUES(NEW.job_id,TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.archive_ai_verification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER archive_ai_verification_after_write AFTER INSERT OR UPDATE ON public.job_ai_intelligence
 FOR EACH ROW EXECUTE FUNCTION public.archive_ai_verification();

CREATE TABLE IF NOT EXISTS public.ai_pilot_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 label text NOT NULL, job_ids uuid[] NOT NULL DEFAULT '{}',
 max_requests integer NOT NULL DEFAULT 100 CHECK(max_requests BETWEEN 1 AND 100),
 requests_reserved integer NOT NULL DEFAULT 0 CHECK(requests_reserved>=0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','closed')),
 CHECK(cardinality(job_ids)<=20), CHECK(requests_reserved<=max_requests)
);
CREATE TABLE IF NOT EXISTS public.ai_model_requests (
 id uuid PRIMARY KEY, run_id uuid NOT NULL REFERENCES public.ai_pilot_runs(id),
 job_id uuid NOT NULL, provider text NOT NULL, model text NOT NULL, agent_id text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 outcome text NOT NULL DEFAULT 'reserved', error_type text,
 CHECK(outcome IN('reserved','success','failure'))
);
ALTER TABLE public.ai_pilot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_pilot_runs,public.ai_model_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ai_pilot_runs,public.ai_model_requests TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_pilot_request(p_run_id uuid,p_request_id uuid,p_job_id uuid,p_provider text,p_model text,p_agent_id text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 UPDATE public.ai_pilot_runs SET requests_reserved=requests_reserved+1
 WHERE id=p_run_id AND status='active' AND requests_reserved<max_requests AND p_job_id=ANY(job_ids);
 IF NOT FOUND THEN RAISE EXCEPTION 'Pilot budget exhausted, closed, or job not authorized'; END IF;
 INSERT INTO public.ai_model_requests(id,run_id,job_id,provider,model,agent_id)
 VALUES(p_request_id,p_run_id,p_job_id,p_provider,p_model,p_agent_id);
 RETURN p_request_id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_pilot_request(uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_pilot_request(uuid,uuid,uuid,text,text,text) TO service_role;

-- Atomic maintenance: bounded, cooldown-aware, and no reset of in-flight work.
CREATE OR REPLACE FUNCTION public.requeue_stale_ai(p_limit integer,p_age_days integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n integer;
BEGIN
 WITH candidates AS (
  SELECT q.id FROM public.ai_processing_queue q
  JOIN public.jobs j ON j.id=q.job_id JOIN public.job_ai_intelligence a ON a.job_id=q.job_id
  WHERE q.status IN('completed','failed') AND j.is_active AND j.is_remote AND j.is_open_to_africa
   AND j.eligibility IN('explicit','likely') AND coalesce(q.outcome,'')<>'rejected'
   AND coalesce(q.error,'') NOT LIKE 'Rejected:%'
   AND (q.next_retry_at IS NULL OR q.next_retry_at<=now())
   AND coalesce(q.last_attempt_at,q.completed_at,'1970-01-01'::timestamptz)<now()-interval '24 hours'
   AND (a.last_verified_at IS NULL OR a.last_verified_at<now()-make_interval(days=>greatest(1,p_age_days))
     OR a.model_version LIKE 'regex%' OR a.model_version LIKE 'no-ai%' OR a.model_version LIKE 'failed%' OR a.model_version='verifyJobReal-threw')
  ORDER BY a.last_verified_at NULLS FIRST,q.id LIMIT greatest(0,least(500,p_limit)) FOR UPDATE OF q SKIP LOCKED
 )
 UPDATE public.ai_processing_queue q SET status='pending',outcome='reverification_queued',attempts=0,
  error='Reverification scheduled',completed_at=NULL,started_at=NULL,next_retry_at=now()
 FROM candidates c WHERE q.id=c.id;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.requeue_stale_ai(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_stale_ai(integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.requeue_orphan_ai(p_limit integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n integer;
BEGIN
 WITH candidates AS (
  SELECT q.id FROM public.ai_processing_queue q JOIN public.jobs j ON j.id=q.job_id
  WHERE q.status='completed' AND q.error IS NULL AND coalesce(q.outcome,'')<>'rejected'
   AND j.is_active AND j.is_remote AND j.is_open_to_africa
   AND coalesce(q.last_attempt_at,q.completed_at,'1970-01-01'::timestamptz)<now()-interval '24 hours'
   AND NOT EXISTS(SELECT 1 FROM public.job_ai_intelligence a WHERE a.job_id=q.job_id)
  ORDER BY q.id LIMIT greatest(0,least(200,p_limit)) FOR UPDATE OF q SKIP LOCKED
 )
 UPDATE public.ai_processing_queue q SET status='pending',outcome='orphan_requeued',attempts=0,
  error='Missing AI output; retry scheduled',completed_at=NULL,started_at=NULL,next_retry_at=now()
 FROM candidates c WHERE q.id=c.id;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.requeue_orphan_ai(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_orphan_ai(integer) TO service_role;
