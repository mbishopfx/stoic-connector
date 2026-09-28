alter table public.artifacts
  add column idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 128),
  add column content_digest text check (content_digest is null or content_digest ~ '^[a-f0-9]{64}$');

create unique index artifacts_agent_idempotency
  on public.artifacts(workspace_id, uploaded_by_agent_id, idempotency_key)
  where uploaded_by_agent_id is not null and idempotency_key is not null;
create unique index artifacts_owner_idempotency
  on public.artifacts(workspace_id, uploaded_by_user_id, idempotency_key)
  where uploaded_by_user_id is not null and idempotency_key is not null;

create or replace function public.stoic_reserve_artifact_v2(
  p_workspace_id uuid,
  p_project_id uuid,
  p_handoff_id uuid,
  p_actor_agent_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_idempotency_key text,
  p_content_digest text
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
  if p_idempotency_key is not null then
    select * into a from public.artifacts
      where workspace_id = w.id and idempotency_key = p_idempotency_key
        and ((uploaded_by_agent_id is not distinct from p_actor_agent_id and p_actor_agent_id is not null)
          or (uploaded_by_user_id is not distinct from p_actor_user_id and p_actor_user_id is not null));
    if found then
      if a.project_id <> p_project_id or a.handoff_id is distinct from p_handoff_id
        or a.name <> p_name or a.mime_type <> p_mime_type or a.size_bytes <> p_size_bytes
        or a.content_digest is distinct from p_content_digest
      then raise exception 'idempotency_conflict'; end if;
      return to_jsonb(a) || jsonb_build_object('idempotent_replay', true);
    end if;
  end if;
  insert into public.artifacts (
    workspace_id, project_id, handoff_id, uploaded_by_agent_id, uploaded_by_user_id,
    name, mime_type, size_bytes, storage_path, idempotency_key, content_digest
  ) values (
    w.id, p_project_id, p_handoff_id, p_actor_agent_id, p_actor_user_id,
    p_name, p_mime_type, p_size_bytes, w.id::text || '/' || p_project_id::text || '/' || gen_random_uuid()::text,
    p_idempotency_key, p_content_digest
  ) returning * into a;
  return to_jsonb(a) || jsonb_build_object('idempotent_replay', false);
end $$;
revoke all on function public.stoic_reserve_artifact_v2(uuid,uuid,uuid,uuid,uuid,text,text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.stoic_reserve_artifact_v2(uuid,uuid,uuid,uuid,uuid,text,text,bigint,text,text) to service_role;
