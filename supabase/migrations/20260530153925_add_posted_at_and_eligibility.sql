-- original remote migration: add_posted_at_and_eligibility
-- make idempotent to fix drift
alter table public.jobs add column if not exists posted_at timestamptz default now();
alter table public.jobs add column if not exists eligibility text default 'unknown';
update public.jobs set posted_at = created_at where posted_at is null;
update public.jobs set eligibility = case when is_open_to_africa then 'likely' else 'unknown' end where eligibility is null;
do $$ begin if exists (select 1 from pg_constraint where conname='jobs_eligibility_check') then alter table public.jobs drop constraint jobs_eligibility_check; end if; end $$;
alter table public.jobs add constraint jobs_eligibility_check check (eligibility in ('explicit','likely','restricted','unknown'));
create index if not exists jobs_posted_at_idx on public.jobs (posted_at desc);
