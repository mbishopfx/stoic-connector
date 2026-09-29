-- Private owner-to-Stoic intake. Agent credentials have no direct access here.
create table public.intake_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  title text not null default 'New conversation' check (char_length(title) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade
);
create index intake_threads_workspace_updated on public.intake_threads(workspace_id, updated_at desc, id);

create table public.intake_turns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  thread_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_key text not null check (char_length(request_key) between 8 and 128),
  prompt text not null check (char_length(prompt) <= 12000),
  artifact_ids uuid[] not null default '{}',
  transcript text not null default '' check (char_length(transcript) <= 12000),
  response text not null default '' check (char_length(response) <= 12000),
  proposal jsonb,
  proposal_status text not null default 'none' check (proposal_status in ('none', 'pending', 'creating', 'created', 'dismissed')),
  handoff_id uuid,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  error_message text check (error_message is null or char_length(error_message) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, request_key),
  foreign key (workspace_id, thread_id) references public.intake_threads(workspace_id, id) on delete cascade,
  foreign key (handoff_id) references public.handoffs(id) on delete set null,
  check (cardinality(artifact_ids) <= 5),
  check (jsonb_typeof(proposal) is null or jsonb_typeof(proposal) = 'object')
);
create index intake_turns_thread_created on public.intake_turns(thread_id, created_at, id);

alter table public.intake_threads enable row level security;
alter table public.intake_turns enable row level security;
revoke all on table public.intake_threads, public.intake_turns from anon, authenticated;
grant all on table public.intake_threads, public.intake_turns to service_role;
