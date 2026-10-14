-- Private provenance, including failed validation outputs. Public queries exclude these fields.
ALTER TABLE public.company_investigations ADD COLUMN IF NOT EXISTS raw_response text;
ALTER TABLE public.company_investigations ADD COLUMN IF NOT EXISTS prompt_text text;
ALTER TABLE public.company_investigations ADD COLUMN IF NOT EXISTS prompt_hash text;
