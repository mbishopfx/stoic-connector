-- An active subscription unlocks coordination. Counts and retained history are
-- not capped by subscription tier; service-level request safeguards live in the
-- application layer.

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
begin
  select * into h from public.handoffs where id = p_handoff_id for update;
  if not found then raise exception 'handoff_not_found'; end if;
  select * into w from public.workspaces where id = h.workspace_id;
  if (p_actor_agent_id is null) = (p_actor_user_id is null) then raise exception 'invalid_actor'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> w.owner_id then raise exception 'forbidden'; end if;
  if p_actor_agent_id is not null and not exists (select 1 from public.agents where id = p_actor_agent_id and workspace_id = w.id and status = 'connected') then raise exception 'forbidden'; end if;
  if w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  actor := case when p_actor_agent_id is not null then 'agent:' || p_actor_agent_id else 'user:' || p_actor_user_id end;
  if p_idempotency_key is not null and exists (
    select 1 from public.task_events where handoff_id = h.id and actor_key = actor and idempotency_key = p_idempotency_key
  ) then return to_jsonb(h); end if;
  next_status := h.status;
  if p_action = 'claim' and h.status in ('assigned', 'changes_requested') and p_actor_agent_id = h.assigned_agent_id then next_status := 'claimed';
  elsif p_action = 'update' and h.status in ('assigned', 'claimed', 'blocked', 'submitted', 'changes_requested') and (p_actor_agent_id in (h.assigned_agent_id, w.boss_agent_id) or p_actor_user_id = w.owner_id) then null;
  elsif p_action = 'block' and h.status = 'claimed' and p_actor_agent_id = h.assigned_agent_id then next_status := 'blocked';
  elsif p_action = 'submit' and h.status in ('claimed', 'blocked') and p_actor_agent_id = h.assigned_agent_id then next_status := 'submitted';
  elsif p_action = 'accept' and h.status = 'submitted' and (p_actor_agent_id = w.boss_agent_id or p_actor_user_id = w.owner_id) then next_status := 'accepted';
  elsif p_action = 'request_changes' and h.status = 'submitted' and (p_actor_agent_id = w.boss_agent_id or p_actor_user_id = w.owner_id) then next_status := 'changes_requested';
  elsif p_action = 'approve_assignment' and h.status = 'proposed' and p_actor_user_id = w.owner_id then next_status := 'assigned';
  elsif p_action = 'cancel' and h.status not in ('accepted', 'canceled') and (p_actor_agent_id = w.boss_agent_id or p_actor_user_id = w.owner_id) then next_status := 'canceled';
  else raise exception 'invalid_transition'; end if;
  if p_action in ('update', 'block', 'submit', 'request_changes') and (p_body is null or char_length(trim(p_body)) < 2) then raise exception 'body_required'; end if;
  update public.handoffs set status = next_status, updated_at = now() where id = h.id returning * into h;
  insert into public.task_events (workspace_id, handoff_id, actor_agent_id, actor_user_id, actor_key, event_type, body, idempotency_key)
    values (w.id, h.id, p_actor_agent_id, p_actor_user_id, actor, p_action, coalesce(p_body, ''), p_idempotency_key);
  insert into public.audit_events (workspace_id, actor_key, action, object_id)
    values (w.id, actor, 'handoff.' || p_action, h.id);
  return to_jsonb(h);
end $$;
revoke all on function public.relay_handoff_action(uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.relay_handoff_action(uuid,uuid,uuid,text,text,text) to service_role;

create or replace function public.relay_reserve_artifact(
  p_workspace_id uuid,
  p_project_id uuid,
  p_handoff_id uuid,
  p_actor_agent_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_mime_type text,
  p_size_bytes bigint
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w public.workspaces%rowtype;
  a public.artifacts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 1));
  select * into w from public.workspaces where id = p_workspace_id;
  if not found then raise exception 'workspace_not_found'; end if;
  if (p_actor_agent_id is null) = (p_actor_user_id is null) then raise exception 'invalid_actor'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> w.owner_id then raise exception 'forbidden'; end if;
  if p_actor_agent_id is not null and not exists (
    select 1 from public.agents where id = p_actor_agent_id and workspace_id = w.id and status = 'connected'
  ) then raise exception 'forbidden'; end if;
  if w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  if not exists (select 1 from public.projects where id = p_project_id and workspace_id = w.id and archived_at is null)
    then raise exception 'project_not_found'; end if;
  if p_handoff_id is not null and not exists (
    select 1 from public.handoffs where id = p_handoff_id and project_id = p_project_id and workspace_id = w.id
  ) then raise exception 'handoff_not_found'; end if;
  insert into public.artifacts (
    workspace_id, project_id, handoff_id, uploaded_by_agent_id, uploaded_by_user_id,
    name, mime_type, size_bytes, storage_path
  ) values (
    w.id, p_project_id, p_handoff_id, p_actor_agent_id, p_actor_user_id,
    p_name, p_mime_type, p_size_bytes, w.id::text || '/' || p_project_id::text || '/' || gen_random_uuid()::text
  ) returning * into a;
  return to_jsonb(a);
end $$;
revoke all on function public.relay_reserve_artifact(uuid,uuid,uuid,uuid,uuid,text,text,bigint) from public, anon, authenticated;
grant execute on function public.relay_reserve_artifact(uuid,uuid,uuid,uuid,uuid,text,text,bigint) to service_role;

create or replace function public.relay_request_approval(
  p_handoff_id uuid,
  p_actor_agent_id uuid,
  p_action_summary text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h public.handoffs%rowtype;
  w public.workspaces%rowtype;
  a public.approvals%rowtype;
begin
  select * into h from public.handoffs where id = p_handoff_id for update;
  if not found then raise exception 'handoff_not_found'; end if;
  select * into w from public.workspaces where id = h.workspace_id;
  if not exists (select 1 from public.agents where id = p_actor_agent_id and workspace_id = w.id and status = 'connected')
    then raise exception 'forbidden'; end if;
  if p_actor_agent_id <> h.assigned_agent_id and p_actor_agent_id <> w.boss_agent_id then raise exception 'forbidden'; end if;
  if w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  select * into a from public.approvals
    where handoff_id = h.id and requested_by_agent_id = p_actor_agent_id and idempotency_key = p_idempotency_key;
  if found then return to_jsonb(a); end if;
  if h.status in ('accepted', 'canceled') then raise exception 'invalid_transition'; end if;
  insert into public.approvals (workspace_id, handoff_id, requested_by_agent_id, action_summary, idempotency_key)
    values (w.id, h.id, p_actor_agent_id, p_action_summary, p_idempotency_key) returning * into a;
  insert into public.task_events (workspace_id, handoff_id, actor_agent_id, actor_key, event_type, body)
    values (w.id, h.id, p_actor_agent_id, 'agent:' || p_actor_agent_id, 'approval_requested', p_action_summary);
  insert into public.audit_events (workspace_id, actor_key, action, object_id)
    values (w.id, 'agent:' || p_actor_agent_id, 'approval.requested', a.id);
  return to_jsonb(a);
end $$;
revoke all on function public.relay_request_approval(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.relay_request_approval(uuid,uuid,text,text) to service_role;
