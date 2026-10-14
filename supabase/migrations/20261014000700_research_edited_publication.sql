-- Store a separately validated edited edition; never overwrite the model's draft.
ALTER TABLE public.company_investigations ADD COLUMN IF NOT EXISTS publication_report jsonb;
CREATE OR REPLACE FUNCTION public.protect_completed_investigation() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.status IN('reviewed','failed') THEN
  IF (to_jsonb(NEW)-ARRAY['published_at','editorial_review','publication_report','status','error_type']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['published_at','editorial_review','publication_report','status','error_type'])
     OR (NEW.status IS DISTINCT FROM OLD.status AND NOT(OLD.status='reviewed' AND NEW.status='failed'))
     OR (OLD.publication_report IS NOT NULL AND NEW.publication_report IS DISTINCT FROM OLD.publication_report)
  THEN RAISE EXCEPTION 'Completed investigation content and approved edition are immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
