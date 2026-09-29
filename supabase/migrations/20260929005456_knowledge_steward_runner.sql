-- Add atomic scheduled-run identity so delayed or overlapping cron requests
-- cannot generate duplicate Steward notes for the same local project slot.
alter table public.knowledge_refresh_runs
  add column scheduled_local_date date,
  add column trigger_kind text not null default 'legacy'
    check (trigger_kind in ('scheduled', 'manual', 'legacy'));

update public.knowledge_refresh_runs
set scheduled_local_date = (created_at at time zone 'UTC')::date
where scheduled_local_date is null;

alter table public.knowledge_refresh_runs
  alter column scheduled_local_date set not null,
  alter column scheduled_local_date set default current_date,
  alter column trigger_kind set default 'scheduled';

alter table public.knowledge_refresh_runs
  drop constraint if exists knowledge_refresh_runs_status_check;
alter table public.knowledge_refresh_runs
  add constraint knowledge_refresh_runs_status_check
  check (status in ('running', 'completed', 'partial', 'failed', 'cancelled', 'skipped'));

-- The original content-fingerprint unique constraint blocked future daily runs
-- when project context had not changed. Local-date + slot is the schedule key.
do $$
declare
  unique_constraint record;
begin
  for unique_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.knowledge_refresh_runs'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (workspace_id, project_id, scheduled_slot, source_scope_revision, input_fingerprint)'
  loop
    execute format('alter table public.knowledge_refresh_runs drop constraint %I', unique_constraint.conname);
  end loop;
end
$$;

create unique index knowledge_refresh_runs_scheduled_slot_unique
  on public.knowledge_refresh_runs (workspace_id, project_id, scheduled_local_date, scheduled_slot)
  where trigger_kind = 'scheduled';
create index knowledge_refresh_runs_scheduled_lookup
  on public.knowledge_refresh_runs (workspace_id, project_id, scheduled_local_date, scheduled_slot, status)
  where trigger_kind = 'scheduled';
create index knowledge_settings_enabled
  on public.knowledge_settings (updated_at, workspace_id, project_id)
  where enabled = true;
