-- Relay uses one shared database and one private bucket. All product reads and writes
-- go through the application server; OAuth clients never receive table privileges.
create extension if not exists pgcrypto;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  delegation_level text not null default 'delegate' check (delegation_level in ('observe', 'propose', 'delegate')),
  boss_agent_id uuid,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now()
);
create unique index workspaces_one_per_owner on public.workspaces(owner_id);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  platform text not null check (platform in ('codex', 'hermes', 'openclaw', 'grok', 'muse', 'other')),
  oauth_client_id text,
  credential_hash text,
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'connected', 'revoked')),
  schedule_enabled boolean not null default false,
  schedule_cadence_minutes integer not null default 60 check (schedule_cadence_minutes between 15 and 1440),
  last_check_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (credential_hash),
  unique (workspace_id, oauth_client_id)
);
alter table public.workspaces add constraint workspaces_boss_fk
  foreign key (id, boss_agent_id) references public.agents(workspace_id, id)
  deferrable initially immediate;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  brief text not null default '' check (char_length(brief) <= 20000),
  brief_version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  assigned_agent_id uuid not null,
  created_by_agent_id uuid,
  created_by_user_id uuid references auth.users(id),
  title text not null check (char_length(title) between 3 and 160),
  goal text not null check (char_length(goal) between 10 and 10000),
  constraints text not null default '' check (char_length(constraints) <= 10000),
  status text not null check (status in ('proposed', 'assigned', 'claimed', 'blocked', 'submitted', 'changes_requested', 'accepted', 'canceled')),
  idempotency_key text check (char_length(idempotency_key) <= 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade,
  foreign key (workspace_id, assigned_agent_id) references public.agents(workspace_id, id),
  foreign key (workspace_id, created_by_agent_id) references public.agents(workspace_id, id),
  check ((created_by_agent_id is null) <> (created_by_user_id is null))
);
create unique index handoffs_agent_idempotency on public.handoffs(workspace_id, created_by_agent_id, idempotency_key)
  where created_by_agent_id is not null and idempotency_key is not null;
create index handoffs_inbox on public.handoffs(assigned_agent_id, status, created_at desc);
create index handoffs_project on public.handoffs(project_id, created_at desc);

create table public.task_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  handoff_id uuid not null references public.handoffs(id) on delete cascade,
  actor_agent_id uuid,
  actor_user_id uuid references auth.users(id),
  actor_key text not null,
  event_type text not null,
  body text not null default '' check (char_length(body) <= 20000),
  idempotency_key text check (char_length(idempotency_key) <= 128),
  created_at timestamptz not null default now(),
  check ((actor_agent_id is null) <> (actor_user_id is null))
);
create unique index task_events_idempotency on public.task_events(handoff_id, actor_key, idempotency_key)
  where idempotency_key is not null;
create index task_events_timeline on public.task_events(handoff_id, created_at);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  handoff_id uuid not null references public.handoffs(id) on delete cascade,
  requested_by_agent_id uuid not null references public.agents(id),
  action_summary text not null check (char_length(action_summary) between 10 and 2000),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index approvals_idempotency on public.approvals(handoff_id, requested_by_agent_id, idempotency_key);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  handoff_id uuid references public.handoffs(id) on delete set null,
  uploaded_by_agent_id uuid references public.agents(id),
  uploaded_by_user_id uuid references auth.users(id),
  name text not null check (char_length(name) between 1 and 180),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'ready')),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  check ((uploaded_by_agent_id is null) <> (uploaded_by_user_id is null))
);
create index artifacts_workspace on public.artifacts(workspace_id, created_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_key text not null,
  action text not null,
  object_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_workspace on public.audit_events(workspace_id, created_at desc);

-- The dashboard and MCP endpoint are server mediated. No user or agent JWT can
-- call PostgREST against these tables, even though OAuth tokens carry a user id.
do $$
declare t text;
begin
  foreach t in array array['workspaces','agents','projects','handoffs','task_events','approvals','artifacts','audit_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on sequence public.audit_events_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('relay-artifacts', 'relay-artifacts', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;
-- No storage.objects policy is added: only the server service role can manage
-- objects or mint short-lived signed URLs.
