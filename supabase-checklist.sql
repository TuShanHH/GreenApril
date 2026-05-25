create table if not exists public.checklist_progress (
  checklist_id text not null,
  task_id text not null,
  checked boolean not null default false,
  checked_by text,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (checklist_id, task_id)
);

alter table public.checklist_progress
add column if not exists checked_by text;

alter table public.checklist_progress
add column if not exists checked_at timestamptz;

alter table public.checklist_progress enable row level security;

drop policy if exists "public read checklist progress" on public.checklist_progress;
create policy "public read checklist progress"
on public.checklist_progress
for select
using (true);

drop policy if exists "public write checklist progress" on public.checklist_progress;
create policy "public write checklist progress"
on public.checklist_progress
for insert
with check (true);

drop policy if exists "public update checklist progress" on public.checklist_progress;
create policy "public update checklist progress"
on public.checklist_progress
for update
using (true)
with check (true);

do $$
begin
  alter publication supabase_realtime add table public.checklist_progress;
exception
  when duplicate_object then null;
end $$;
