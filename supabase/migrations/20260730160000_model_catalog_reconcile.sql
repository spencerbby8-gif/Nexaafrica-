-- Model truth reconciliation (P2)
-- discoverAllModels() writes discovery_endpoint / discovery_error, which the
-- original 20260728100000 catalog migration omitted. Since Supabase replay
-- runs migrations in version order and repo==prod must hold, these additive
-- columns land here.

alter table public.ai_model_catalog add column if not exists discovery_endpoint text;
alter table public.ai_model_catalog add column if not exists discovery_error text;
