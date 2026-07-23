-- placeholder for phase_7_add_jobs_source_unique_constraint, already applied
-- ensure unique index exists
create unique index if not exists jobs_source_unique on public.jobs (source, source_id) where source is not null and source_id is not null;
