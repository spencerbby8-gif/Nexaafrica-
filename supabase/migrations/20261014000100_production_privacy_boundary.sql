-- Non-destructive: preserve all rows; close anonymous/authenticated access to internal data.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND (c.relname LIKE '\_bk\_%' ESCAPE '\' OR c.relname IN ('agent_bridge_requests','ai_benchmark_results','ai_provider_log'))
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',t.relname);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.relname);
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role',t.relname);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "ai_provider_log public read" ON public.ai_provider_log;
ALTER TABLE public.profile_ai_metadata ADD COLUMN IF NOT EXISTS ats_result jsonb;
ALTER TABLE public.profile_ai_metadata ADD COLUMN IF NOT EXISTS skill_categorization jsonb;
ALTER TABLE public.profile_ai_metadata ADD COLUMN IF NOT EXISTS metrics jsonb;
