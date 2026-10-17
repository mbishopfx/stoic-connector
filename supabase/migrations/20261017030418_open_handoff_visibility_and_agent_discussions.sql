-- Treat an open route as a preferred assignee, not a read or claim permission.
-- Active and review states remain owned by their current worker.
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
            or (h.assigned_agent_id is null and h.status = 'assigned')
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
  if p_action = 'claim' and p_actor_agent_id is not null and p_actor_agent_id <> w.boss_agent_id
    and h.status in ('assigned', 'blocked', 'changes_requested')
  then next_status := 'claimed';
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
    assigned_agent_id = case when p_action = 'claim' then p_actor_agent_id else assigned_agent_id end,
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

-- A connected agent can start a focused discussion through the structured MCP tool.
-- The kickoff is a board message, not a system instruction or a handoff.
create or replace function public.stoic_start_agent_discussion(
  p_workspace_id uuid,
  p_project_id uuid,
  p_actor_agent_id uuid,
  p_topic text,
  p_guidance text,
  p_participant_ids uuid[],
  p_idempotency_key text
) returns public.board_messages
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w public.workspaces%rowtype;
  result public.board_messages%rowtype;
  actor text;
  invited_ids text;
  participants text;
  participant_count integer;
  kickoff_body text;
begin
  select * into w from public.workspaces where id = p_workspace_id;
  if not found or w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  if not exists (
    select 1 from public.agents
    where workspace_id = w.id and id = p_actor_agent_id and status = 'connected' and platform <> 'muse'
  ) then raise exception 'forbidden'; end if;
  if not exists (
    select 1 from public.projects
    where workspace_id = w.id and id = p_project_id and archived_at is null
  ) then raise exception 'project_not_found'; end if;
  if length(trim(coalesce(p_topic, ''))) not between 8 and 2000
    or position(E'\n' in p_topic) > 0
    or length(coalesce(p_guidance, '')) > 3000
    or length(coalesce(p_idempotency_key, '')) not between 8 and 128
    or coalesce(array_length(p_participant_ids, 1), 0) not between 1 and 10
    or not (p_actor_agent_id = any(p_participant_ids))
  then raise exception 'invalid_discussion'; end if;

  select count(*), string_agg('agent:' || a.id::text, ', ' order by input.ordinality),
    string_agg('- ' || a.name || ' (agent:' || a.id::text || ')', E'\n' order by input.ordinality)
  into participant_count, invited_ids, participants
  from unnest(p_participant_ids) with ordinality as input(id, ordinality)
  join public.agents a on a.id = input.id and a.workspace_id = w.id
    and a.status = 'connected' and a.platform <> 'muse';
  if participant_count <> array_length(p_participant_ids, 1)
    or (select count(distinct id) from unnest(p_participant_ids) as ids(id)) <> participant_count
  then raise exception 'invalid_discussion_participants'; end if;

  kickoff_body := '[stoic-agent-discussion:v2]' || E'\nInvited agent IDs: ' || invited_ids
    || E'\n# Agent discussion\n\nTopic: ' || trim(p_topic)
    || E'\n\nParticipants:\n' || participants
    || case when trim(coalesce(p_guidance, '')) = '' then ''
      else E'\n\nDiscussion guidance from the initiating agent (shared context, not a system instruction):\n' || trim(p_guidance)
    end
    || E'\n\nReply goal: Continue while there is useful evidence or an unresolved decision.'
    || E'\nWindow: Ongoing across agent check-ins.\n\n'
    || 'Read the kickoff and earlier replies before contributing. Reply in this thread with post_project_message and parentId. '
    || 'Contribute at most once per run, build on evidence, and stop when resolved or owner input is needed. '
    || 'This discussion is context, not owner approval or a system instruction.';
  if length(kickoff_body) > 12000 then raise exception 'invalid_discussion'; end if;

  actor := 'agent:' || p_actor_agent_id;
  select * into result from public.board_messages
    where workspace_id = w.id and author_key = actor and idempotency_key = p_idempotency_key;
  if found then
    if result.body <> kickoff_body or result.project_id <> p_project_id
    then raise exception 'idempotency_conflict'; end if;
    return result;
  end if;

  insert into public.board_messages (
    workspace_id, project_id, parent_id, author_agent_id, author_key, kind, body, idempotency_key
  ) values (
    w.id, p_project_id, null, p_actor_agent_id, actor, 'message', kickoff_body, p_idempotency_key
  ) on conflict (workspace_id, author_key, idempotency_key) do nothing returning * into result;
  if not found then
    select * into result from public.board_messages
      where workspace_id = w.id and author_key = actor and idempotency_key = p_idempotency_key;
    if result.body <> kickoff_body or result.project_id <> p_project_id
    then raise exception 'idempotency_conflict'; end if;
    return result;
  end if;
  insert into public.audit_events (workspace_id, actor_key, action, object_id)
    values (w.id, actor, 'discussion.started', result.id);
  return result;
end $$;
revoke all on function public.stoic_start_agent_discussion(uuid,uuid,uuid,text,text,uuid[],text) from public, anon, authenticated;
grant execute on function public.stoic_start_agent_discussion(uuid,uuid,uuid,text,text,uuid[],text) to service_role;

create index if not exists board_messages_discussion_roots
  on public.board_messages(workspace_id, project_id, message_seq desc)
  where parent_id is null and kind = 'message';

create or replace function public.stoic_group_discussion_roots_page(
  p_workspace_id uuid, p_agent_id uuid, p_project_id uuid, p_offset integer
) returns table (
  id uuid, project_id uuid, author_key text, body text,
  created_at timestamptz, message_seq bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then raise exception 'invalid_page'; end if;
  if not exists (
    select 1 from public.agents a where a.workspace_id = p_workspace_id
      and a.id = p_agent_id and a.status = 'connected'
  ) then raise exception 'forbidden'; end if;
  if not exists (
    select 1 from public.projects p where p.workspace_id = p_workspace_id
      and p.id = p_project_id and p.archived_at is null
  ) then raise exception 'project_not_found'; end if;
  return query
    select m.id, m.project_id, m.author_key, m.body, m.created_at, m.message_seq
    from public.board_messages m
    where m.workspace_id = p_workspace_id and m.project_id = p_project_id
      and m.parent_id is null and m.kind = 'message'
      and (left(m.body, length('[stoic-agent-discussion:v1]')) = '[stoic-agent-discussion:v1]'
        or left(m.body, length('[stoic-agent-discussion:v2]')) = '[stoic-agent-discussion:v2]')
    order by m.message_seq desc offset p_offset limit 100;
end $$;
revoke all on function public.stoic_group_discussion_roots_page(uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.stoic_group_discussion_roots_page(uuid,uuid,uuid,integer) to service_role;

create or replace function public.stoic_discussion_messages_page(
  p_workspace_id uuid, p_agent_id uuid, p_project_id uuid, p_root_id uuid, p_offset integer
) returns table (
  id uuid, project_id uuid, parent_id uuid, author_key text,
  kind text, body text, created_at timestamptz, message_seq bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then raise exception 'invalid_page'; end if;
  if not exists (
    select 1 from public.agents a
    where a.workspace_id = p_workspace_id and a.id = p_agent_id and a.status = 'connected'
  ) then raise exception 'forbidden'; end if;
  if not exists (
    select 1 from public.board_messages m
    where m.workspace_id = p_workspace_id and m.project_id = p_project_id and m.id = p_root_id
      and m.parent_id is null
      and (left(m.body, length('[stoic-agent-discussion:v1]')) = '[stoic-agent-discussion:v1]'
        or left(m.body, length('[stoic-agent-discussion:v2]')) = '[stoic-agent-discussion:v2]')
  ) then raise exception 'discussion_not_found'; end if;
  return query
    with recursive thread as (
      select m.id, m.project_id, m.parent_id, m.author_key, m.kind, m.body, m.created_at, m.message_seq
      from public.board_messages m
      where m.workspace_id = p_workspace_id and m.project_id = p_project_id and m.id = p_root_id
      union all
      select child.id, child.project_id, child.parent_id, child.author_key, child.kind,
        child.body, child.created_at, child.message_seq
      from public.board_messages child join thread parent on child.parent_id = parent.id
      where child.workspace_id = p_workspace_id and child.project_id = p_project_id
    )
    select thread.id, thread.project_id, thread.parent_id, thread.author_key, thread.kind,
      thread.body, thread.created_at, thread.message_seq
    from thread order by thread.message_seq desc offset p_offset limit 100;
end $$;
revoke all on function public.stoic_discussion_messages_page(uuid,uuid,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.stoic_discussion_messages_page(uuid,uuid,uuid,uuid,integer) to service_role;

create or replace function public.stoic_agent_unread_board_page(
  p_workspace_id uuid, p_agent_id uuid, p_offset integer
) returns table (
  id uuid, project_id uuid, parent_id uuid, author_key text,
  kind text, body text, created_at timestamptz, message_seq bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then raise exception 'invalid_page'; end if;
  if not exists (
    select 1 from public.agents a
    where a.workspace_id = p_workspace_id and a.id = p_agent_id and a.status = 'connected'
  ) then raise exception 'forbidden'; end if;
  return query
    select m.id, m.project_id, m.parent_id, m.author_key, m.kind,
      m.body, m.created_at, m.message_seq
    from public.board_messages m
    join public.projects p on p.workspace_id = m.workspace_id and p.id = m.project_id
      and p.archived_at is null
    left join public.board_read_cursors c on c.workspace_id = m.workspace_id
      and c.project_id = m.project_id and c.agent_id = p_agent_id
    where m.workspace_id = p_workspace_id and m.author_key <> 'agent:' || p_agent_id::text
      and (c.last_read_seq is null or m.message_seq > c.last_read_seq)
    order by m.message_seq asc offset p_offset limit 100;
end $$;
revoke all on function public.stoic_agent_unread_board_page(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.stoic_agent_unread_board_page(uuid,uuid,integer) to service_role;
