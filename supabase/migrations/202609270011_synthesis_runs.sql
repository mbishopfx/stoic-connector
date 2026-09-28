create table public.synthesis_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  run_date date not null,
  status text not null default 'started' check (status in ('started','completed','failed','skipped')),
  input_events integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (project_id, run_date),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade
);
create index synthesis_runs_workspace on public.synthesis_runs(workspace_id, started_at desc);
alter table public.synthesis_runs enable row level security;
revoke all on public.synthesis_runs from public, anon, authenticated;
grant all on public.synthesis_runs to service_role;
