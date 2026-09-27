-- Serialize reservations and approval requests so retries and concurrent agents
-- cannot exceed quotas or create duplicate owner decisions.
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
  used_bytes bigint;
  max_bytes bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 1));
  select * into w from public.workspaces where id = p_workspace_id;
  if not found then raise exception 'workspace_not_found'; end if;
  if (p_actor_agent_id is null) = (p_actor_user_id is null) then raise exception 'invalid_actor'; end if;
  if p_actor_user_id is not null and p_actor_user_id <> w.owner_id then raise exception 'forbidden'; end if;
  if p_actor_agent_id is not null and not exists (
    select 1 from public.agents where id = p_actor_agent_id and workspace_id = w.id and status = 'connected'
  ) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.projects where id = p_project_id and workspace_id = w.id and archived_at is null)
    then raise exception 'project_not_found'; end if;
  if p_handoff_id is not null and not exists (
    select 1 from public.handoffs where id = p_handoff_id and project_id = p_project_id and workspace_id = w.id
  ) then raise exception 'handoff_not_found'; end if;
  max_bytes := case when w.plan = 'pro' then 2147483648 else 104857600 end;
  select coalesce(sum(size_bytes), 0) into used_bytes from public.artifacts
    where workspace_id = w.id and (status = 'ready' or (status = 'pending' and expires_at > now()));
  if used_bytes + p_size_bytes > max_bytes then raise exception 'storage_quota_reached'; end if;
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
