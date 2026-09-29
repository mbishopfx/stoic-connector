-- Attach owner-intake project files to the handoff the owner approves.
-- This makes them visible in handoff details and applies the handoff's worker scope.
create function public.stoic_attach_intake_artifacts_to_handoff(
  p_workspace_id uuid,
  p_owner_id uuid,
  p_project_id uuid,
  p_handoff_id uuid,
  p_artifact_ids uuid[]
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected_count integer;
  valid_count integer;
begin
  if p_workspace_id is null or p_owner_id is null or p_project_id is null or p_handoff_id is null
    or p_artifact_ids is null or cardinality(p_artifact_ids) > 5 then
    raise exception 'invalid_artifacts';
  end if;

  perform 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = p_owner_id
    for share;
  if not found then raise exception 'forbidden'; end if;

  perform 1 from public.handoffs h
    where h.id = p_handoff_id and h.workspace_id = p_workspace_id
      and h.project_id = p_project_id and h.created_by_user_id = p_owner_id
    for update;
  if not found then raise exception 'handoff_not_found'; end if;

  expected_count := cardinality(p_artifact_ids);
  if expected_count = 0 then return 0; end if;

  if (select count(distinct id) from unnest(p_artifact_ids) as ids(id)) <> expected_count then
    raise exception 'invalid_artifacts';
  end if;

  -- Lock in UUID order so concurrent attempts involving multiple files are stable.
  perform 1 from public.artifacts a
    where a.id = any(p_artifact_ids)
    order by a.id
    for update;

  select count(*) into valid_count
    from public.artifacts a
    where a.id = any(p_artifact_ids)
      and a.workspace_id = p_workspace_id
      and a.project_id = p_project_id
      and a.status = 'ready'
      and (a.handoff_id is null or a.handoff_id = p_handoff_id);
  if valid_count <> expected_count then raise exception 'artifact_not_attachable'; end if;

  update public.artifacts a
    set handoff_id = p_handoff_id
    where a.id = any(p_artifact_ids)
      and a.workspace_id = p_workspace_id
      and a.project_id = p_project_id
      and a.status = 'ready'
      and a.handoff_id is null;

  select count(*) into valid_count
    from public.artifacts a
    where a.id = any(p_artifact_ids)
      and a.workspace_id = p_workspace_id
      and a.project_id = p_project_id
      and a.status = 'ready'
      and a.handoff_id = p_handoff_id;
  if valid_count <> expected_count then raise exception 'artifact_not_attachable'; end if;

  insert into public.task_events (
    workspace_id, handoff_id, actor_user_id, actor_key, event_type, body, idempotency_key
  )
  select p_workspace_id, p_handoff_id, p_owner_id, 'user:' || p_owner_id::text,
    'artifact_attached', 'Attached file: ' || a.name || '. Artifact ID: ' || a.id::text,
    'intake-artifact:' || a.id::text
  from public.artifacts a
  where a.id = any(p_artifact_ids)
  on conflict (handoff_id, actor_key, idempotency_key) where idempotency_key is not null do nothing;

  update public.handoffs set updated_at = now()
    where id = p_handoff_id and workspace_id = p_workspace_id;

  return expected_count;
end
$$;

revoke all on function public.stoic_attach_intake_artifacts_to_handoff(uuid,uuid,uuid,uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.stoic_attach_intake_artifacts_to_handoff(uuid,uuid,uuid,uuid,uuid[]) to service_role;
