alter table public.workspaces
  add column mcp_activity_capture_started_at timestamptz not null default now();

create table public.mcp_tool_activity_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_key text not null check (char_length(actor_key) between 8 and 96),
  tool_name text not null check (char_length(tool_name) between 1 and 64 and tool_name ~ '^[a-z][a-z0-9_]*$'),
  outcome text not null check (outcome in ('success', 'error')),
  duration_ms integer not null check (duration_ms between 0 and 180000),
  occurred_at timestamptz not null default now()
);
create index mcp_tool_activity_workspace_time
  on public.mcp_tool_activity_events(workspace_id, occurred_at desc);
create index mcp_tool_activity_workspace_actor_time
  on public.mcp_tool_activity_events(workspace_id, actor_key, occurred_at desc);
create index mcp_tool_activity_workspace_tool_time
  on public.mcp_tool_activity_events(workspace_id, tool_name, occurred_at desc);

alter table public.mcp_tool_activity_events enable row level security;
revoke all on public.mcp_tool_activity_events from public, anon, authenticated;
grant all on public.mcp_tool_activity_events to service_role;
grant usage, select on sequence public.mcp_tool_activity_events_id_seq to service_role;

comment on table public.mcp_tool_activity_events is
  'Metadata-only MCP tools/call observations from the capture start timestamp; never stores tool arguments, results, credentials, or chat bodies.';
comment on column public.workspaces.mcp_activity_capture_started_at is
  'MCP activity coverage begins when analytics instrumentation is installed for this workspace; no earlier MCP tool history is represented.';

create table public.workspace_activity_rollups (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  mcp_tool_calls bigint not null default 0 check (mcp_tool_calls >= 0),
  mcp_tool_errors bigint not null default 0 check (mcp_tool_errors >= 0),
  mcp_agent_tool_calls bigint not null default 0 check (mcp_agent_tool_calls >= 0),
  mcp_tool_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(mcp_tool_counts) = 'object' and octet_length(mcp_tool_counts::text) <= 8192),
  task_events bigint not null default 0 check (task_events >= 0),
  agent_task_events bigint not null default 0 check (agent_task_events >= 0),
  board_messages bigint not null default 0 check (board_messages >= 0),
  agent_board_messages bigint not null default 0 check (agent_board_messages >= 0),
  audit_actions bigint not null default 0 check (audit_actions >= 0),
  active_agents bigint not null default 0 check (active_agents >= 0),
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'running', 'complete', 'failed')),
  analysis_summary text check (analysis_summary is null or char_length(analysis_summary) <= 500),
  analysis_observations jsonb not null default '[]'::jsonb check (jsonb_typeof(analysis_observations) = 'array' and jsonb_array_length(analysis_observations) <= 3 and octet_length(analysis_observations::text) <= 2048),
  analysis_error text check (analysis_error is null or analysis_error in ('provider_unavailable', 'context_unavailable', 'invalid_response', 'analysis_failed', 'analysis_stalled')),
  analysis_attempts integer not null default 0 check (analysis_attempts >= 0),
  analysis_claimed_at timestamptz,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (window_end = window_start + interval '6 hours'),
  unique (workspace_id, window_start)
);
create index workspace_activity_rollups_window
  on public.workspace_activity_rollups(window_start desc, workspace_id);
create index workspace_activity_rollups_analysis_queue
  on public.workspace_activity_rollups(analysis_status, window_end, analysis_claimed_at);

alter table public.workspace_activity_rollups enable row level security;
revoke all on public.workspace_activity_rollups from public, anon, authenticated;
grant all on public.workspace_activity_rollups to service_role;
grant usage, select on sequence public.workspace_activity_rollups_id_seq to service_role;

comment on table public.workspace_activity_rollups is
  'Idempotent six-hour UTC counts from workspace task, shared-message, audit, and MCP metadata. Managed analysis is bounded annotation; deterministic columns are metric truth.';

create or replace function public.stoic_rollup_activity_window(p_window_start timestamptz, p_window_end timestamptz)
returns setof public.workspace_activity_rollups
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_window_end <> p_window_start + interval '6 hours'
    or p_window_start <> date_bin(interval '6 hours', p_window_start, timestamptz '2000-01-01 00:00:00+00')
    or p_window_end > date_bin(interval '6 hours', now(), timestamptz '2000-01-01 00:00:00+00') then
    raise exception 'invalid_activity_window';
  end if;

  return query
  with eligible as (
    select w.id as workspace_id from public.workspaces w where w.plan = 'pro'
  ),
  mcp_counts as (
    select e.workspace_id, count(*)::bigint as tool_calls,
      count(*) filter (where e.outcome = 'error')::bigint as tool_errors,
      count(*) filter (where e.actor_key like 'agent:%')::bigint as agent_tool_calls
    from public.mcp_tool_activity_events e
    join eligible w on w.workspace_id = e.workspace_id
    where e.occurred_at >= p_window_start and e.occurred_at < p_window_end
    group by e.workspace_id
  ),
  mcp_tool_counts as (
    select grouped.workspace_id,
      jsonb_object_agg(grouped.tool_name, jsonb_build_object('calls', grouped.calls, 'errors', grouped.errors)) as tool_counts
    from (
      select e.workspace_id, e.tool_name, count(*)::bigint as calls,
        count(*) filter (where e.outcome = 'error')::bigint as errors
      from public.mcp_tool_activity_events e
      join eligible w on w.workspace_id = e.workspace_id
      where e.occurred_at >= p_window_start and e.occurred_at < p_window_end
      group by e.workspace_id, e.tool_name
    ) grouped
    group by grouped.workspace_id
  ),
  task_counts as (
    select e.workspace_id, count(*)::bigint as task_events,
      count(*) filter (where e.actor_agent_id is not null)::bigint as agent_task_events
    from public.task_events e
    join eligible w on w.workspace_id = e.workspace_id
    where e.created_at >= p_window_start and e.created_at < p_window_end
    group by e.workspace_id
  ),
  board_counts as (
    select b.workspace_id, count(*)::bigint as board_messages,
      count(*) filter (where b.author_agent_id is not null)::bigint as agent_board_messages
    from public.board_messages b
    join eligible w on w.workspace_id = b.workspace_id
    where b.created_at >= p_window_start and b.created_at < p_window_end
    group by b.workspace_id
  ),
  audit_counts as (
    select a.workspace_id, count(*)::bigint as audit_actions
    from public.audit_events a
    join eligible w on w.workspace_id = a.workspace_id
    where a.created_at >= p_window_start and a.created_at < p_window_end
    group by a.workspace_id
  ),
  actor_rows as (
    select e.workspace_id, e.actor_agent_id::text as actor_id from public.task_events e
      join eligible w on w.workspace_id = e.workspace_id
      where e.created_at >= p_window_start and e.created_at < p_window_end and e.actor_agent_id is not null
    union
    select b.workspace_id, b.author_agent_id::text from public.board_messages b
      join eligible w on w.workspace_id = b.workspace_id
      where b.created_at >= p_window_start and b.created_at < p_window_end and b.author_agent_id is not null
    union
    select e.workspace_id, substring(e.actor_key from 7) from public.mcp_tool_activity_events e
      join eligible w on w.workspace_id = e.workspace_id
      where e.occurred_at >= p_window_start and e.occurred_at < p_window_end and e.actor_key like 'agent:%'
    union
    select a.workspace_id, substring(a.actor_key from 7) from public.audit_events a
      join eligible w on w.workspace_id = a.workspace_id
      where a.created_at >= p_window_start and a.created_at < p_window_end and a.actor_key like 'agent:%'
  ),
  actor_counts as (
    select workspace_id, count(distinct actor_id)::bigint as active_agents from actor_rows group by workspace_id
  )
  insert into public.workspace_activity_rollups (
    workspace_id, window_start, window_end, mcp_tool_calls, mcp_tool_errors, mcp_agent_tool_calls,
    mcp_tool_counts, task_events, agent_task_events, board_messages, agent_board_messages,
    audit_actions, active_agents
  )
  select w.workspace_id, p_window_start, p_window_end,
    coalesce(m.tool_calls, 0), coalesce(m.tool_errors, 0), coalesce(m.agent_tool_calls, 0),
    coalesce(mt.tool_counts, '{}'::jsonb), coalesce(t.task_events, 0), coalesce(t.agent_task_events, 0),
    coalesce(b.board_messages, 0), coalesce(b.agent_board_messages, 0), coalesce(a.audit_actions, 0),
    coalesce(ac.active_agents, 0)
  from eligible w
  left join mcp_counts m on m.workspace_id = w.workspace_id
  left join mcp_tool_counts mt on mt.workspace_id = w.workspace_id
  left join task_counts t on t.workspace_id = w.workspace_id
  left join board_counts b on b.workspace_id = w.workspace_id
  left join audit_counts a on a.workspace_id = w.workspace_id
  left join actor_counts ac on ac.workspace_id = w.workspace_id
  on conflict (workspace_id, window_start) do update set
    window_end = excluded.window_end,
    mcp_tool_calls = excluded.mcp_tool_calls,
    mcp_tool_errors = excluded.mcp_tool_errors,
    mcp_agent_tool_calls = excluded.mcp_agent_tool_calls,
    mcp_tool_counts = excluded.mcp_tool_counts,
    task_events = excluded.task_events,
    agent_task_events = excluded.agent_task_events,
    board_messages = excluded.board_messages,
    agent_board_messages = excluded.agent_board_messages,
    audit_actions = excluded.audit_actions,
    active_agents = excluded.active_agents,
    updated_at = now()
  returning *;
end $$;
revoke all on function public.stoic_rollup_activity_window(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.stoic_rollup_activity_window(timestamptz, timestamptz) to service_role;

create or replace function public.stoic_claim_activity_analysis()
returns setof public.workspace_activity_rollups
language plpgsql security definer set search_path = public, pg_temp as $$
declare claimed public.workspace_activity_rollups%rowtype;
begin
  update public.workspace_activity_rollups r set analysis_status = 'failed', analysis_error = 'analysis_stalled', updated_at = now()
    where r.analysis_status = 'running' and r.analysis_attempts >= 3
      and r.analysis_claimed_at < now() - interval '10 minutes';
  select * into claimed from public.workspace_activity_rollups r
    where r.analysis_attempts < 3 and (
      r.analysis_status = 'pending'
      or (r.analysis_status = 'failed' and r.analysis_claimed_at < now() - interval '1 hour')
      or (r.analysis_status = 'running' and r.analysis_claimed_at < now() - interval '10 minutes')
    )
    order by r.window_end asc, r.workspace_id asc
    for update skip locked limit 1;
  if not found then return; end if;
  update public.workspace_activity_rollups set analysis_status = 'running', analysis_error = null,
    analysis_attempts = analysis_attempts + 1, analysis_claimed_at = now(), updated_at = now()
    where id = claimed.id returning * into claimed;
  return next claimed;
end $$;
revoke all on function public.stoic_claim_activity_analysis() from public, anon, authenticated;
grant execute on function public.stoic_claim_activity_analysis() to service_role;

create or replace function public.stoic_complete_activity_analysis(
  p_workspace_id uuid, p_window_start timestamptz, p_summary text, p_observations jsonb
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if char_length(p_summary) < 1 or char_length(p_summary) > 500
    or jsonb_typeof(p_observations) <> 'array' or jsonb_array_length(p_observations) > 3
    or octet_length(p_observations::text) > 2048 then raise exception 'invalid_activity_analysis'; end if;
  update public.workspace_activity_rollups set analysis_status = 'complete', analysis_summary = p_summary,
    analysis_observations = p_observations, analysis_error = null, analyzed_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and window_start = p_window_start and analysis_status = 'running';
  if not found then raise exception 'activity_analysis_claim_lost'; end if;
end $$;
revoke all on function public.stoic_complete_activity_analysis(uuid, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.stoic_complete_activity_analysis(uuid, timestamptz, text, jsonb) to service_role;

create or replace function public.stoic_fail_activity_analysis(
  p_workspace_id uuid, p_window_start timestamptz, p_error text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_error not in ('provider_unavailable', 'context_unavailable', 'invalid_response', 'analysis_failed') then
    raise exception 'invalid_activity_analysis_error';
  end if;
  update public.workspace_activity_rollups set analysis_status = 'failed', analysis_error = p_error,
    analyzed_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and window_start = p_window_start and analysis_status = 'running';
  if not found then raise exception 'activity_analysis_claim_lost'; end if;
end $$;
revoke all on function public.stoic_fail_activity_analysis(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.stoic_fail_activity_analysis(uuid, timestamptz, text) to service_role;
