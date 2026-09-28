-- Project-level files announce themselves once, regardless of which authorized
-- actor finalizes or retries the upload. Handoff files stay on the handoff.
alter table public.board_messages drop constraint board_messages_kind_check;
alter table public.board_messages add constraint board_messages_kind_check
  check (kind in ('message', 'run_report', 'suggestion', 'artifact'));

do $$
declare old_name text;
begin
  select conname into old_name from pg_constraint
    where conrelid = 'public.board_messages'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%author_agent_id%'
    limit 1;
  if old_name is null then raise exception 'board author constraint not found'; end if;
  execute format('alter table public.board_messages drop constraint %I', old_name);
end $$;
alter table public.board_messages add constraint board_messages_author_check check (
  (author_agent_id is null) <> (author_user_id is null)
  or (kind in ('suggestion', 'artifact') and author_agent_id is null and author_user_id is null and author_key = 'system:stoic')
);

create or replace function public.stoic_announce_project_artifact(p_artifact_id uuid)
returns public.board_messages language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.artifacts%rowtype; result public.board_messages%rowtype;
begin
  select * into a from public.artifacts where id = p_artifact_id and status = 'ready';
  if not found then raise exception 'artifact_not_ready'; end if;
  if a.handoff_id is not null then raise exception 'handoff_artifact_not_public'; end if;
  insert into public.board_messages(workspace_id,project_id,author_key,kind,body,idempotency_key)
    values(a.workspace_id,a.project_id,'system:stoic','artifact',
      'Shared project file ready: ' || a.name || '. Artifact ID: ' || a.id::text || '. Use get_artifact to download it.',
      'artifact-ready:' || a.id::text)
    on conflict (workspace_id,author_key,idempotency_key) do nothing returning * into result;
  if not found then
    select * into result from public.board_messages
      where workspace_id = a.workspace_id and author_key = 'system:stoic'
        and idempotency_key = 'artifact-ready:' || a.id::text;
  end if;
  return result;
end $$;
revoke all on function public.stoic_announce_project_artifact(uuid) from public, anon, authenticated;
grant execute on function public.stoic_announce_project_artifact(uuid) to service_role;
