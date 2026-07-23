-- placeholder: original 003_seed_jobs removed seed data, already applied in remote
-- making idempotent to satisfy history check
do $$ begin
  -- no-op, seed jobs already cleaned in prod
exception when others then null;
end $$;
