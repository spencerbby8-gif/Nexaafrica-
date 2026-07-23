-- placeholder for phase16_intelligence_extraction — adds intelligence + salary_* columns
alter table public.jobs add column if not exists intelligence jsonb not null default '{}'::jsonb;
alter table public.jobs add column if not exists salary_min int;
alter table public.jobs add column if not exists salary_max int;
alter table public.jobs add column if not exists salary_currency text;
alter table public.jobs add column if not exists salary_period text;
do $$ begin
  if exists (select 1 from pg_constraint where conname='jobs_employment_type_check') then alter table public.jobs drop constraint jobs_employment_type_check; end if;
end $$;
alter table public.jobs add constraint jobs_employment_type_check check (employment_type in ('full_time','part_time','contract','freelance','consultant','temporary','internship','unknown'));
create index if not exists jobs_intelligence_gin_idx on public.jobs using gin (intelligence jsonb_path_ops);
create index if not exists jobs_salary_currency_idx on public.jobs (salary_currency) where salary_currency is not null;
