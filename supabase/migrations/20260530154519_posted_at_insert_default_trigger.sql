-- placeholder for posted_at_insert_default_trigger
create or replace function public.set_posted_at_default() returns trigger language plpgsql as $$
begin
  if new.posted_at is null then new.posted_at := coalesce(new.created_at, now()); end if;
  return new;
end $$;
drop trigger if exists jobs_set_posted_at_default on public.jobs;
create trigger jobs_set_posted_at_default before insert on public.jobs for each row execute function public.set_posted_at_default();
