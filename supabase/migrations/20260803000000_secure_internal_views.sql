-- Nexa security hardening — 2026-08-03 (triage breakpoint #1)
-- Close anon-readable AI/internal surfaces in production.
--
-- 1) Views: anon/authenticated had SELECT grants on every internal view and
--    none ran with security_invoker, so they executed as owner and bypassed
--    RLS — exposing provider telemetry, per-job quality scores, and ingest
--    health to anonymous users. Revoke + owner-context views.
revoke all on public.ai_provider_analytics,
  public.ai_provider_task_quality,
  public.ai_quality_daily,
  public.ai_quality_scores,
  public.ai_benchmark_trends,
  public.source_health_summary
from anon, authenticated;

alter view public.ai_provider_analytics set (security_invoker = true);
alter view public.ai_provider_task_quality set (security_invoker = true);
alter view public.ai_quality_daily set (security_invoker = true);
alter view public.ai_quality_scores set (security_invoker = true);
alter view public.ai_benchmark_trends set (security_invoker = true);
alter view public.source_health_summary set (security_invoker = true);

-- 2) Internal tables: revoke ALL from anon as defense in depth. RLS already
--    denies anon, but a future policy change must never open these.
revoke all on public.ai_provider_log,
  public.ai_orch_health,
  public.ai_processing_queue,
  public.ai_processing_stats,
  public.ingest_runs,
  public.company_intelligence,
  public.source_intelligence,
  public.ai_model_catalog,
  public.ai_model_registry,
  public.ai_benchmark_results,
  public.trust_audit_log,
  public.profiles,
  public.profile_versions,
  public.profile_ai_metadata,
  public.profile_experience,
  public.profile_skills,
  public.saved_jobs
from anon;
