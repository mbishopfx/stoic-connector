-- Keep ordinary project messages in one durable conversation. Focused,
-- owner-started agent discussions and suggestions remain separate roots.
alter table public.projects
  add column group_chat_root_id uuid references public.board_messages(id) on delete set null;

create unique index projects_group_chat_root_unique
  on public.projects(group_chat_root_id)
  where group_chat_root_id is not null;

comment on column public.projects.group_chat_root_id is
  'The stable root message for the rolling project group chat.';

-- Use the earliest ordinary post as the room root, then fold other ordinary
-- root posts into its thread without changing focused discussions or suggestions.
with roots as (
  select distinct on (m.workspace_id, m.project_id)
    m.workspace_id, m.project_id, m.id
  from public.board_messages m
  where m.parent_id is null
    and m.kind in ('message', 'run_report')
    and left(m.body, length('[stoic-agent-discussion:v1]')) <> '[stoic-agent-discussion:v1]'
  order by m.workspace_id, m.project_id, m.created_at, m.message_seq
)
update public.projects p
set group_chat_root_id = roots.id
from roots
where p.workspace_id = roots.workspace_id
  and p.id = roots.project_id;

update public.board_messages m
set parent_id = p.group_chat_root_id
from public.projects p
where m.workspace_id = p.workspace_id
  and m.project_id = p.id
  and p.group_chat_root_id is not null
  and m.parent_id is null
  and m.id <> p.group_chat_root_id
  and m.kind in ('message', 'run_report')
  and left(m.body, length('[stoic-agent-discussion:v1]')) <> '[stoic-agent-discussion:v1]';

create or replace function public.stoic_post_board_message(
  p_workspace_id uuid, p_project_id uuid, p_actor_agent_id uuid, p_actor_user_id uuid,
  p_kind text, p_body text, p_parent_id uuid, p_idempotency_key text
) returns public.board_messages language plpgsql security definer set search_path = public as $$
declare
  w public.workspaces%rowtype;
  project_row public.projects%rowtype;
  result public.board_messages%rowtype;
  root public.board_messages%rowtype;
  actor text;
  resolved_parent_id uuid := p_parent_id;
  root_id uuid;
  root_body text;
  invited_agent_ids text;
  invited_agent_count bigint;
  agent_reply_count bigint;
  is_dialogue_kickoff boolean := left(p_body, length('[stoic-agent-discussion:v1]')) = '[stoic-agent-discussion:v1]';
begin
  select * into w from public.workspaces where id = p_workspace_id for share;
  if not found or w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  if (p_actor_agent_id is null) = (p_actor_user_id is null) then raise exception 'forbidden'; end if;
  if p_actor_agent_id is not null then
    if not exists (select 1 from public.agents where id = p_actor_agent_id and workspace_id = w.id and status = 'connected') then raise exception 'forbidden'; end if;
    actor := 'agent:' || p_actor_agent_id;
  else
    if p_actor_user_id <> w.owner_id then raise exception 'forbidden'; end if;
    actor := 'user:' || p_actor_user_id;
  end if;
  if p_kind not in ('message','run_report','suggestion') or char_length(p_body) not between 1 and 12000 or char_length(p_idempotency_key) not between 8 and 128 then raise exception 'invalid_message'; end if;
  if p_kind = 'suggestion' and p_actor_agent_id is not null then raise exception 'forbidden'; end if;
  if is_dialogue_kickoff and (p_actor_user_id is null or p_parent_id is not null or p_kind <> 'message') then
    raise exception 'invalid_discussion_kickoff';
  end if;

  -- Serialize room-root creation and keep all unthreaded messages attached to it.
  select * into project_row from public.projects
    where workspace_id = w.id and id = p_project_id and archived_at is null
    for update;
  if not found then raise exception 'project_not_found'; end if;

  select * into result from public.board_messages
    where workspace_id = w.id and author_key = actor and idempotency_key = p_idempotency_key;
  if found then
    if result.project_id <> p_project_id or result.kind <> p_kind or result.body <> p_body
      or (p_parent_id is not null and result.parent_id is distinct from p_parent_id)
      or (p_parent_id is null and result.parent_id is not null
        and result.parent_id is distinct from project_row.group_chat_root_id) then
      raise exception 'idempotency_conflict';
    end if;
    return result;
  end if;

  if p_parent_id is null and not is_dialogue_kickoff
    and p_kind in ('message', 'run_report') and project_row.group_chat_root_id is not null then
    resolved_parent_id := project_row.group_chat_root_id;
  end if;

  if resolved_parent_id is not null and not exists (
    select 1 from public.board_messages
    where workspace_id = w.id and project_id = p_project_id and id = resolved_parent_id
  ) then raise exception 'parent_not_found'; end if;

  if p_actor_agent_id is not null and resolved_parent_id is not null then
    with recursive ancestors as (
      select m.id, m.parent_id, m.body, m.created_at
        from public.board_messages m
        where m.workspace_id = w.id and m.project_id = p_project_id and m.id = resolved_parent_id
      union all
      select parent.id, parent.parent_id, parent.body, parent.created_at
        from public.board_messages parent
        join ancestors child on child.parent_id = parent.id
        where parent.workspace_id = w.id and parent.project_id = p_project_id
    )
    select id, body into root_id, root_body
      from ancestors where parent_id is null limit 1;

    if found and left(root_body, length('[stoic-agent-discussion:v1]')) = '[stoic-agent-discussion:v1]' then
      select * into root from public.board_messages where workspace_id = w.id and id = root_id for update;
      -- Recheck after locking the root so concurrent retries stay idempotent at the reply cap.
      select * into result from public.board_messages where workspace_id = w.id and author_key = actor and idempotency_key = p_idempotency_key;
      if found then
        if result.project_id <> p_project_id or result.kind <> p_kind or result.body <> p_body or result.parent_id is distinct from resolved_parent_id then raise exception 'idempotency_conflict'; end if;
        return result;
      end if;
      invited_agent_ids := split_part(split_part(root.body, E'Invited agent IDs: ', 2), E'\n', 1);
      select count(*) into invited_agent_count from regexp_matches(invited_agent_ids, 'agent:[0-9a-f-]{36}', 'g');
      if invited_agent_count not between 1 and 10 then raise exception 'invalid_discussion_participants'; end if;
      if position('agent:' || p_actor_agent_id::text in invited_agent_ids) = 0 then raise exception 'discussion_agent_not_invited'; end if;
      if clock_timestamp() >= root.created_at + interval '90 minutes' then raise exception 'discussion_window_ended'; end if;

      with recursive thread_messages as (
        select m.id, m.parent_id, m.author_agent_id
          from public.board_messages m
          where m.workspace_id = w.id and m.project_id = p_project_id and m.id = root.id
        union all
        select child.id, child.parent_id, child.author_agent_id
          from public.board_messages child
          join thread_messages parent on child.parent_id = parent.id
          where child.workspace_id = w.id and child.project_id = p_project_id
      )
      select count(*) into agent_reply_count from thread_messages where id <> root.id and author_agent_id is not null;
      if agent_reply_count >= 10 then raise exception 'discussion_reply_cap_reached'; end if;
    end if;
  end if;

  insert into public.board_messages(workspace_id,project_id,parent_id,author_agent_id,author_user_id,author_key,kind,body,idempotency_key)
    values(w.id,p_project_id,resolved_parent_id,p_actor_agent_id,p_actor_user_id,actor,p_kind,p_body,p_idempotency_key)
    on conflict (workspace_id,author_key,idempotency_key) do nothing returning * into result;
  if not found then
    select * into result from public.board_messages where workspace_id = w.id and author_key = actor and idempotency_key = p_idempotency_key;
    if result.project_id <> p_project_id or result.kind <> p_kind or result.body <> p_body or result.parent_id is distinct from resolved_parent_id then raise exception 'idempotency_conflict'; end if;
    return result;
  end if;

  if resolved_parent_id is null and not is_dialogue_kickoff and p_kind in ('message', 'run_report')
    and project_row.group_chat_root_id is null then
    update public.projects set group_chat_root_id = result.id
      where workspace_id = w.id and id = p_project_id;
  end if;
  insert into public.audit_events(workspace_id,actor_key,action,object_id)
    values(w.id,actor,'board.' || p_kind,result.id);
  return result;
end $$;

revoke all on function public.stoic_post_board_message(uuid,uuid,uuid,uuid,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.stoic_post_board_message(uuid,uuid,uuid,uuid,text,text,uuid,text) to service_role;

comment on function public.stoic_post_board_message(uuid,uuid,uuid,uuid,text,text,uuid,text) is
  'Posts ordinary project messages into the rolling project group chat when no explicit parent is supplied.';
