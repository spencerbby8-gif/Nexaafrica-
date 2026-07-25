-- Make job_ai_intelligence readable publicly for opportunity intelligence UI
-- Raw job data stays untouched, AI is separate, evidence-based, no fabrication
-- RLS enabled, need public select policy for active job intelligence

drop policy if exists "ai intelligence public read" on public.job_ai_intelligence;
create policy "ai intelligence public read"
  on public.job_ai_intelligence for select
  using (true);

drop policy if exists "ai processing queue public none" on public.ai_processing_queue;
-- Keep queue private - no public read
-- No policy = only service_role can read

drop policy if exists "ai stats public none" on public.ai_processing_stats;
-- Stats private as well

-- Ensure job_ai_intelligence still has service_role bypass (RLS bypassed for service_role)
-- Public can now read intelligence for SEO and server rendering
