-- Markdown-first project knowledge storage. Notes remain validated Markdown;
-- graph indexes are derived by the application and are never an approval surface.
create table public.knowledge_notes (
  workspace_id uuid not null,
  project_id uuid not null,
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'),
  path text not null check (
    char_length(path) between 5 and 240
    and right(lower(path), 3) = '.md'
    and left(path, 1) <> '/'
    and path !~ '(^|/)\.\.(\/|$)'
    and path !~ '^[A-Za-z]:[\\/]'
    and path !~ '[[:cntrl:]]'
  ),
  kind text not null check (kind in ('index', 'brief', 'decision', 'agent_profile', 'handoff', 'artifact', 'question', 'note', 'steward_audit')),
  title text not null check (char_length(title) between 1 and 160),
  status text not null check (status in ('active', 'proposed', 'stale', 'superseded', 'archived', 'conflicted')),
  confidence text not null check (confidence in ('verified', 'likely', 'uncertain')),
  note_created_at timestamptz not null,
  note_updated_at timestamptz not null,
  source_agent text check (source_agent is null or source_agent ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'),
  source_user text check (source_user is null or source_user ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'),
  source_handoff text check (source_handoff is null or source_handoff ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$'),
  supersedes text[] not null default '{}',
  related text[] not null default '{}',
  evidence text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  body text not null check (char_length(body) between 1 and 24000),
  markdown text not null check (char_length(markdown) between 1 and 40000),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  stored_created_at timestamptz not null default now(),
  stored_updated_at timestamptz not null default now(),
  primary key (workspace_id, project_id, id),
  unique (workspace_id, project_id, path),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade,
  check (note_updated_at >= note_created_at),
  check (cardinality(supersedes) <= 50),
  check (cardinality(related) <= 50),
  check (cardinality(evidence) <= 50)
);
create index knowledge_notes_project_updated on public.knowledge_notes(project_id, note_updated_at desc, id);
create index knowledge_notes_project_kind on public.knowledge_notes(project_id, kind, status);

create table public.knowledge_settings (
  workspace_id uuid not null,
  project_id uuid not null,
  enabled boolean not null default false,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64 and timezone !~ '[[:space:]]'),
  schedule_slots text[] not null default array['08:00', '13:00', '18:00'],
  source_scopes text[] not null default array['brief', 'decisions', 'board', 'handoffs', 'artifacts', 'agents'],
  retention_days integer not null default 365 check (retention_days between 1 and 3650),
  pinned_note_ids text[] not null default '{}',
  settings_revision bigint not null default 1 check (settings_revision > 0),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, project_id),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade,
  check (cardinality(schedule_slots) between 1 and 6),
  check (cardinality(source_scopes) between 1 and 10),
  check (source_scopes <@ array['brief', 'decisions', 'board', 'handoffs', 'artifacts', 'agents']::text[]),
  check (cardinality(pinned_note_ids) <= 100)
);

create table public.knowledge_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  scheduled_slot text not null check (scheduled_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  source_scope_revision bigint not null check (source_scope_revision > 0),
  input_fingerprint text not null check (char_length(input_fingerprint) between 16 and 128),
  status text not null check (status in ('completed', 'partial', 'failed', 'cancelled')),
  started_at timestamptz not null,
  completed_at timestamptz,
  note_ids_created text[] not null default '{}',
  note_ids_updated text[] not null default '{}',
  note_ids_stale text[] not null default '{}',
  conflict_ids text[] not null default '{}',
  unresolved_references text[] not null default '{}',
  safety_findings jsonb not null default '[]'::jsonb,
  output_counts jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  created_at timestamptz not null default now(),
  unique (workspace_id, project_id, scheduled_slot, source_scope_revision, input_fingerprint),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade,
  check (completed_at is null or completed_at >= started_at),
  check (cardinality(note_ids_created) <= 200),
  check (cardinality(note_ids_updated) <= 200),
  check (cardinality(note_ids_stale) <= 200),
  check (cardinality(conflict_ids) <= 200),
  check (cardinality(unresolved_references) <= 500)
);
create index knowledge_refresh_runs_project on public.knowledge_refresh_runs(project_id, created_at desc);

create or replace function public.stoic_touch_knowledge_settings()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.settings_revision := old.settings_revision + 1;
  return new;
end
$$;
drop trigger if exists knowledge_settings_touch on public.knowledge_settings;
create trigger knowledge_settings_touch
  before update on public.knowledge_settings
  for each row execute function public.stoic_touch_knowledge_settings();

create or replace function public.stoic_touch_knowledge_note()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.stored_updated_at := now();
  return new;
end
$$;
drop trigger if exists knowledge_notes_touch on public.knowledge_notes;
create trigger knowledge_notes_touch
  before update on public.knowledge_notes
  for each row execute function public.stoic_touch_knowledge_note();

do $$
declare t text;
begin
  foreach t in array array['knowledge_notes', 'knowledge_settings', 'knowledge_refresh_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
revoke all on function public.stoic_touch_knowledge_settings() from public, anon, authenticated;
revoke all on function public.stoic_touch_knowledge_note() from public, anon, authenticated;
