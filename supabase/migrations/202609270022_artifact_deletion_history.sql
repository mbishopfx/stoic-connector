-- Keep deleted file metadata for audit and stable retries, while excluding the
-- object from downloads, listings, and usage. A private handoff file must not
-- become a project-level file if its handoff is removed.
alter table public.artifacts drop constraint artifacts_status_check;
alter table public.artifacts add constraint artifacts_status_check
  check (status in ('pending', 'ready', 'deleted'));
alter table public.artifacts add column deleted_at timestamptz;
alter table public.artifacts drop constraint artifacts_handoff_id_fkey;
alter table public.artifacts add constraint artifacts_handoff_id_fkey
  foreign key (handoff_id) references public.handoffs(id) on delete restrict;

create or replace function public.stoic_mark_artifact_deleted(
  p_workspace_id uuid, p_owner_id uuid, p_artifact_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare w public.workspaces%rowtype; a public.artifacts%rowtype;
begin
  select * into w from public.workspaces where id = p_workspace_id;
  if not found or w.owner_id <> p_owner_id then raise exception 'forbidden'; end if;
  select * into a from public.artifacts
    where id = p_artifact_id and workspace_id = w.id for update;
  if not found then raise exception 'artifact_not_found'; end if;
  if a.status = 'deleted' then return jsonb_build_object('id', a.id, 'status', a.status, 'alreadyDeleted', true); end if;
  if a.status <> 'ready' then raise exception 'invalid_transition'; end if;
  update public.artifacts set status = 'deleted', deleted_at = now() where id = a.id;
  insert into public.audit_events(workspace_id,actor_key,action,object_id)
    values(w.id,'user:' || p_owner_id::text,'artifact.deleted',a.id);
  if a.handoff_id is null then
    insert into public.board_messages(workspace_id,project_id,author_key,kind,body,idempotency_key)
      values(w.id,a.project_id,'system:stoic','artifact',
        'Shared project file removed: ' || a.name || '. Artifact ID: ' || a.id::text || '. Previous download links no longer work.',
        'artifact-deleted:' || a.id::text)
      on conflict (workspace_id,author_key,idempotency_key) do nothing;
  else
    insert into public.task_events(workspace_id,handoff_id,actor_user_id,actor_key,event_type,body,idempotency_key)
      values(w.id,a.handoff_id,p_owner_id,'user:' || p_owner_id::text,'artifact_deleted',
        'Attached file removed: ' || a.name || '. Artifact ID: ' || a.id::text,
        'artifact-deleted:' || a.id::text)
      on conflict do nothing;
    update public.handoffs set updated_at = now() where id = a.handoff_id;
  end if;
  return jsonb_build_object('id', a.id, 'status', 'deleted', 'alreadyDeleted', false);
end $$;
revoke all on function public.stoic_mark_artifact_deleted(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.stoic_mark_artifact_deleted(uuid,uuid,uuid) to service_role;
