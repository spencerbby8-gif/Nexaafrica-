ALTER TABLE public.company_investigations ADD COLUMN IF NOT EXISTS model_outputs jsonb NOT NULL DEFAULT '[]'::jsonb;
