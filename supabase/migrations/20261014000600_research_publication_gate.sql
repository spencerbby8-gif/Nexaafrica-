-- Preserve every draft and source. Publication requires a separate semantic review.
ALTER TABLE public.company_investigations ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE public.company_investigations ADD COLUMN IF NOT EXISTS editorial_review jsonb;
CREATE OR REPLACE FUNCTION public.protect_completed_investigation() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF OLD.status IN('reviewed','failed') THEN
  -- Permit publication/withdrawal metadata, never rewriting completed evidence or prose.
  IF (to_jsonb(NEW)-ARRAY['published_at','editorial_review','status','error_type']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['published_at','editorial_review','status','error_type'])
     OR (NEW.status IS DISTINCT FROM OLD.status AND NOT(OLD.status='reviewed' AND NEW.status='failed'))
  THEN RAISE EXCEPTION 'Completed investigation content is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- Our two pilot publications require a semantic check, not only quotation matching.
UPDATE public.company_investigations
 SET status='failed',published_at=NULL,error_type='Withdrawn pending semantic editorial review; all source and draft records retained',
 editorial_review='{"decision":"withdrawn","reason":"Citation validity alone does not establish claim entailment; revised source-grounded review required"}'::jsonb
 WHERE id IN('ab618410-f00f-4793-b1ef-8d35bf48869a','b56d6e18-4f61-4405-bd0e-493765616408') AND status='reviewed';
