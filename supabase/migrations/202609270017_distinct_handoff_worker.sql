-- A boss reviews work and cannot be the worker receiving the same handoff.
create or replace function public.relay_create_handoff(
  p_workspace_id uuid,
  p_project_id uuid,
  p_assigned_agent_id uuid,
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
  if not exists (select 1 from public.projects where id = p_project_id and workspace_id = w.id and archived_at is null) then raise exception 'project_not_found'; end if;
  if not exists (select 1 from public.agents where id = p_assigned_agent_id and workspace_id = w.id and status = 'connected') then raise exception 'assignee_not_found'; end if;
  if p_actor_agent_id is not null and p_idempotency_key is not null then
    select * into h from public.handoffs where workspace_id = w.id and created_by_agent_id = p_actor_agent_id and idempotency_key = p_idempotency_key;
    if found then return to_jsonb(h); end if;
  end if;
  if p_assigned_agent_id = w.boss_agent_id then raise exception 'boss_cannot_be_assignee'; end if;
  initial_status := case when p_actor_agent_id is not null and w.delegation_level = 'propose' then 'proposed' else 'assigned' end;
  insert into public.handoffs (workspace_id, project_id, assigned_agent_id, created_by_agent_id, created_by_user_id, title, goal, constraints, status, idempotency_key)
    values (w.id, p_project_id, p_assigned_agent_id, p_actor_agent_id, p_actor_user_id, p_title, p_goal, coalesce(p_constraints, ''), initial_status, p_idempotency_key)
    returning * into h;
  actor := case when p_actor_agent_id is not null then 'agent:' || p_actor_agent_id else 'user:' || p_actor_user_id end;
  insert into public.task_events (workspace_id, handoff_id, actor_agent_id, actor_user_id, actor_key, event_type, body)
    values (w.id, h.id, p_actor_agent_id, p_actor_user_id, actor, 'created', p_goal);
  insert into public.audit_events (workspace_id, actor_key, action, object_id)
    values (w.id, actor, 'handoff.created', h.id);
  return to_jsonb(h);
end $$;
revoke all on function public.relay_create_handoff(uuid,uuid,uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.relay_create_handoff(uuid,uuid,uuid,uuid,uuid,text,text,text,text) to service_role;

update public.projects p set default_agent_id = null
from public.workspaces w
where p.workspace_id = w.id and p.default_agent_id = w.boss_agent_id;
