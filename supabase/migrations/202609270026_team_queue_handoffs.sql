-- A team-queue handoff is one shared task offered to every connected worker.
-- The first eligible worker to claim it becomes the sole assignee.
alter table public.handoffs alter column assigned_agent_id drop not null;
create unique index if not exists handoffs_workspace_id_id
  on public.handoffs(workspace_id, id);

create table public.handoff_eligible_agents (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  handoff_id uuid not null,
  agent_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, handoff_id, agent_id),
  foreign key (workspace_id, handoff_id)
    references public.handoffs(workspace_id, id) on delete cascade,
  foreign key (workspace_id, agent_id)
    references public.agents(workspace_id, id) on delete cascade
);
alter table public.handoff_eligible_agents enable row level security;
revoke all on table public.handoff_eligible_agents from public, anon, authenticated;
grant all on table public.handoff_eligible_agents to service_role;
create index handoff_eligible_agents_inbox
  on public.handoff_eligible_agents(workspace_id, agent_id, handoff_id);
create index handoffs_team_queue
  on public.handoffs(workspace_id, updated_at desc)
  where assigned_agent_id is null;
comment on table public.handoff_eligible_agents is
  'Connected workers eligible to claim an open team-queue handoff; application access remains service-mediated.';

create or replace function public.relay_create_team_handoff(
  p_workspace_id uuid,
  p_project_id uuid,
  p_actor_agent_id uuid,
  p_actor_user_id uuid,
  p_title text,
  p_goal text,
  p_constraints text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w public.workspaces%rowtype;
  h public.handoffs%rowtype;
  actor text;
  initial_status text;
  eligible_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  select * into w from public.workspaces where id = p_workspace_id;
  if not found then raise exception 'workspace_not_found'; end if;
  if w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  if w.delegation_level = 'observe' then raise exception 'forbidden'; end if;
  if (p_actor_agent_id is null) = (p_actor_user_id is null) then raise exception 'invalid_actor'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> w.owner_id then raise exception 'forbidden'; end if;
  if p_actor_agent_id is not null then
    if p_actor_agent_id <> w.boss_agent_id or w.delegation_level = 'observe' then raise exception 'forbidden'; end if;
    if not exists (select 1 from public.agents where id = p_actor_agent_id and workspace_id = w.id and status = 'connected') then raise exception 'forbidden'; end if;
  end if;

  if p_idempotency_key is not null then
    select * into h from public.handoffs
      where workspace_id = w.id and idempotency_key = p_idempotency_key
        and ((p_actor_agent_id is not null and created_by_agent_id = p_actor_agent_id)
          or (p_actor_user_id is not null and created_by_user_id = p_actor_user_id));
    if found then
      if h.project_id <> p_project_id or h.title <> p_title or h.goal <> p_goal
        or h.constraints <> coalesce(p_constraints, '')
        or not exists (select 1 from public.handoff_eligible_agents e where e.workspace_id = w.id and e.handoff_id = h.id)
      then raise exception 'idempotency_conflict'; end if;
      return to_jsonb(h);
    end if;
  end if;

  if not exists (select 1 from public.projects where id = p_project_id and workspace_id = w.id and archived_at is null) then raise exception 'project_not_found'; end if;
  select count(*) into eligible_count from public.agents
    where workspace_id = w.id and status = 'connected' and (w.boss_agent_id is null or id <> w.boss_agent_id);
  if eligible_count = 0 then raise exception 'no_workers_available'; end if;

  initial_status := case when p_actor_agent_id is not null and w.delegation_level = 'propose' then 'proposed' else 'assigned' end;
  insert into public.handoffs (workspace_id, project_id, assigned_agent_id, created_by_agent_id, created_by_user_id, title, goal, constraints, status, idempotency_key)
    values (w.id, p_project_id, null, p_actor_agent_id, p_actor_user_id, p_title, p_goal, coalesce(p_constraints, ''), initial_status, p_idempotency_key)
    returning * into h;
  insert into public.handoff_eligible_agents (workspace_id, handoff_id, agent_id)
    select w.id, h.id, a.id from public.agents a
    where a.workspace_id = w.id and a.status = 'connected' and (w.boss_agent_id is null or a.id <> w.boss_agent_id);

  actor := case when p_actor_agent_id is not null then 'agent:' || p_actor_agent_id else 'user:' || p_actor_user_id end;
  insert into public.task_events (workspace_id, handoff_id, actor_agent_id, actor_user_id, actor_key, event_type, body)
    values (w.id, h.id, p_actor_agent_id, p_actor_user_id, actor, 'created', p_goal);
  insert into public.task_events (workspace_id, handoff_id, actor_agent_id, actor_user_id, actor_key, event_type, body)
    values (w.id, h.id, p_actor_agent_id, p_actor_user_id, actor, 'queued_for_team', eligible_count::text || ' connected workers can claim this handoff');
  insert into public.audit_events (workspace_id, actor_key, action, object_id, details)
    values (w.id, actor, 'handoff.created', h.id, jsonb_build_object('dispatchMode', 'team_queue', 'eligibleAgentCount', eligible_count));
  return to_jsonb(h);
end $$;
revoke all on function public.relay_create_team_handoff(uuid,uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.relay_create_team_handoff(uuid,uuid,uuid,uuid,text,text,text,text) to service_role;

create or replace function public.relay_agent_handoff_page(
  p_workspace_id uuid,
  p_agent_id uuid,
  p_project_id uuid,
  p_offset integer
) returns table (
  id uuid,
  project_id uuid,
  assigned_agent_id uuid,
  created_by_agent_id uuid,
  title text,
  goal text,
  constraints text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  boss_id uuid;
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then raise exception 'invalid_page'; end if;
  select w.boss_agent_id into boss_id from public.workspaces w where w.id = p_workspace_id;
  if not found then raise exception 'workspace_not_found'; end if;
  if not exists (select 1 from public.agents a where a.id = p_agent_id and a.workspace_id = p_workspace_id and a.status = 'connected') then
    raise exception 'forbidden';
  end if;

  return query
    select h.id, h.project_id, h.assigned_agent_id, h.created_by_agent_id,
      h.title, h.goal, h.constraints, h.status, h.created_at, h.updated_at
    from public.handoffs h
    where h.workspace_id = p_workspace_id
      and (p_project_id is null or h.project_id = p_project_id)
      and h.status not in ('accepted', 'canceled')
      and (
        p_agent_id = boss_id
        or (
          h.status <> 'proposed'
          and (
            h.assigned_agent_id = p_agent_id
            or (h.assigned_agent_id is null and exists (
              select 1 from public.handoff_eligible_agents e
              where e.workspace_id = p_workspace_id and e.handoff_id = h.id and e.agent_id = p_agent_id
            ))
          )
        )
      )
    order by h.updated_at desc, h.id desc
    offset p_offset limit 100;
end $$;
revoke all on function public.relay_agent_handoff_page(uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.relay_agent_handoff_page(uuid,uuid,uuid,integer) to service_role;

create or replace function public.relay_handoff_action(
  p_handoff_id uuid,
  p_actor_agent_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_body text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h public.handoffs%rowtype;
  w public.workspaces%rowtype;
  actor text;
  next_status text;
  prior_event public.task_events%rowtype;
begin
  select * into h from public.handoffs where id = p_handoff_id for update;
  if not found then raise exception 'handoff_not_found'; end if;
  select * into w from public.workspaces where id = h.workspace_id;
  if (p_actor_agent_id is null) = (p_actor_user_id is null) then raise exception 'invalid_actor'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> w.owner_id then raise exception 'forbidden'; end if;
  if p_actor_agent_id is not null and not exists (select 1 from public.agents where id = p_actor_agent_id and workspace_id = w.id and status = 'connected') then raise exception 'forbidden'; end if;
  if w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  actor := case when p_actor_agent_id is not null then 'agent:' || p_actor_agent_id else 'user:' || p_actor_user_id end;
  if p_idempotency_key is not null then
    select * into prior_event from public.task_events
      where handoff_id = h.id and actor_key = actor and idempotency_key = p_idempotency_key;
    if found then
      if prior_event.event_type <> p_action or prior_event.body <> coalesce(p_body, '') then raise exception 'idempotency_conflict'; end if;
      return to_jsonb(h);
    end if;
  end if;

  next_status := h.status;
  if p_action = 'claim' and h.status in ('assigned', 'changes_requested') and (
    p_actor_agent_id = h.assigned_agent_id
    or (h.assigned_agent_id is null and exists (
      select 1 from public.handoff_eligible_agents e
      where e.workspace_id = h.workspace_id and e.handoff_id = h.id and e.agent_id = p_actor_agent_id
    ))
  ) then next_status := 'claimed';
  elsif p_action = 'update' and h.status in ('assigned', 'claimed', 'blocked', 'submitted', 'changes_requested') and (p_actor_agent_id in (h.assigned_agent_id, w.boss_agent_id) or p_actor_user_id = w.owner_id) then null;
  elsif p_action = 'block' and h.status = 'claimed' and p_actor_agent_id = h.assigned_agent_id then next_status := 'blocked';
  elsif p_action = 'submit' and h.status in ('claimed', 'blocked') and p_actor_agent_id = h.assigned_agent_id then next_status := 'submitted';
  elsif p_action = 'accept' and h.status = 'submitted' and (p_actor_agent_id = w.boss_agent_id or p_actor_user_id = w.owner_id) then next_status := 'accepted';
  elsif p_action = 'request_changes' and h.status = 'submitted' and (p_actor_agent_id = w.boss_agent_id or p_actor_user_id = w.owner_id) then next_status := 'changes_requested';
  elsif p_action = 'approve_assignment' and h.status = 'proposed' and p_actor_user_id = w.owner_id then next_status := 'assigned';
  elsif p_action = 'cancel' and h.status not in ('accepted', 'canceled') and (p_actor_agent_id = w.boss_agent_id or p_actor_user_id = w.owner_id) then next_status := 'canceled';
  else raise exception 'invalid_transition'; end if;
  if p_action in ('update', 'block', 'submit', 'request_changes') and (p_body is null or char_length(trim(p_body)) < 2) then raise exception 'body_required'; end if;
  update public.handoffs set status = next_status,
    assigned_agent_id = case when p_action = 'claim' and h.assigned_agent_id is null then p_actor_agent_id else assigned_agent_id end,
    updated_at = now()
    where id = h.id returning * into h;
  insert into public.task_events (workspace_id, handoff_id, actor_agent_id, actor_user_id, actor_key, event_type, body, idempotency_key)
    values (w.id, h.id, p_actor_agent_id, p_actor_user_id, actor, p_action, coalesce(p_body, ''), p_idempotency_key);
  insert into public.audit_events (workspace_id, actor_key, action, object_id)
    values (w.id, actor, 'handoff.' || p_action, h.id);
  return to_jsonb(h);
end $$;
revoke all on function public.relay_handoff_action(uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.relay_handoff_action(uuid,uuid,uuid,text,text,text) to service_role;
