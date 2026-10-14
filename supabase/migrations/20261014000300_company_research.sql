CREATE TABLE public.company_investigations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES public.jobs(id),
 run_id uuid NOT NULL REFERENCES public.ai_pilot_runs(id), company text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 status text NOT NULL DEFAULT 'researching' CHECK(status IN('researching','reviewed','failed')),
 scope jsonb NOT NULL, report jsonb, provider_model text, model_request_ids uuid[], error_type text
);
CREATE TABLE public.company_research_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), investigation_id uuid NOT NULL REFERENCES public.company_investigations(id),
 url text NOT NULL, final_url text, source_kind text NOT NULL, title text,
 fetched_at timestamptz NOT NULL DEFAULT now(), published_at text, http_status integer,
 status text NOT NULL CHECK(status IN('fetched','blocked','failed')),
 content_hash text, content text NOT NULL DEFAULT '', error_type text
);
ALTER TABLE public.company_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_research_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_investigations,public.company_research_sources FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.company_investigations TO service_role;
GRANT SELECT,INSERT ON public.company_research_sources TO service_role;
CREATE INDEX company_investigations_job_latest ON public.company_investigations(job_id,created_at DESC);
CREATE OR REPLACE FUNCTION public.protect_completed_investigation() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.status IN('reviewed','failed') THEN RAISE EXCEPTION 'Completed investigations are immutable; create a new investigation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_completed_investigation BEFORE UPDATE ON public.company_investigations
 FOR EACH ROW EXECUTE FUNCTION public.protect_completed_investigation();
