-- Storage bucket for CV uploads (private; access via signed URLs only)
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

drop policy if exists "cvs owner read" on storage.objects;
create policy "cvs owner read" on storage.objects
  for select using (
    bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "cvs owner insert" on storage.objects;
create policy "cvs owner insert" on storage.objects
  for insert with check (
    bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "cvs owner update" on storage.objects;
create policy "cvs owner update" on storage.objects
  for update using (
    bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "cvs owner delete" on storage.objects;
create policy "cvs owner delete" on storage.objects
  for delete using (
    bucket_id = 'cvs' and auth.uid()::text = (storage.foldername(name))[1]
  );
