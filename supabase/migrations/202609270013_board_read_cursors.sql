-- Checking an inbox does not acknowledge project discussion. Each agent
-- explicitly acknowledges the newest board message it finished reading.
alter table public.board_messages add column message_seq bigint generated always as identity;
create unique index board_messages_sequence on public.board_messages(message_seq);
revoke all on sequence public.board_messages_message_seq_seq from public, anon, authenticated;
grant usage, select on sequence public.board_messages_message_seq_seq to service_role;

create table public.board_read_cursors (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null,
  project_id uuid not null,
  last_read_seq bigint not null,
  last_read_id uuid not null,
  primary key (workspace_id, agent_id, project_id),
  foreign key (workspace_id, agent_id) references public.agents(workspace_id, id) on delete cascade,
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade,
  foreign key (workspace_id, last_read_id) references public.board_messages(workspace_id, id) on delete cascade
);
alter table public.board_read_cursors enable row level security;
revoke all on public.board_read_cursors from public, anon, authenticated;
grant all on public.board_read_cursors to service_role;

create or replace function public.stoic_unread_board_projects(p_workspace_id uuid, p_agent_id uuid)
returns table(project_id uuid) language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.agents a join public.workspaces w on w.id = a.workspace_id
    where a.id = p_agent_id and a.workspace_id = p_workspace_id and a.status = 'connected' and w.plan = 'pro'
  ) then raise exception 'forbidden'; end if;
  return query
    select distinct b.project_id
    from public.board_messages b
    join public.projects p on p.workspace_id = b.workspace_id and p.id = b.project_id and p.archived_at is null
    left join public.board_read_cursors c on c.workspace_id = b.workspace_id and c.agent_id = p_agent_id and c.project_id = b.project_id
    where b.workspace_id = p_workspace_id and b.author_key <> 'agent:' || p_agent_id::text
      and (c.last_read_seq is null or b.message_seq > c.last_read_seq);
end $$;
revoke all on function public.stoic_unread_board_projects(uuid,uuid) from public, anon, authenticated;
grant execute on function public.stoic_unread_board_projects(uuid,uuid) to service_role;

create or replace function public.stoic_ack_board_message(
  p_workspace_id uuid, p_agent_id uuid, p_project_id uuid, p_message_id uuid
) returns public.board_read_cursors language plpgsql security definer set search_path = public as $$
declare m public.board_messages%rowtype; result public.board_read_cursors%rowtype;
begin
  if not exists (
    select 1 from public.agents a join public.workspaces w on w.id = a.workspace_id
    where a.id = p_agent_id and a.workspace_id = p_workspace_id and a.status = 'connected' and w.plan = 'pro'
  ) then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.projects where workspace_id = p_workspace_id and id = p_project_id and archived_at is null)
    then raise exception 'project_not_found'; end if;
  select * into m from public.board_messages
    where workspace_id = p_workspace_id and project_id = p_project_id and id = p_message_id;
  if not found then raise exception 'message_not_found'; end if;
  insert into public.board_read_cursors(workspace_id,agent_id,project_id,last_read_seq,last_read_id)
    values(p_workspace_id,p_agent_id,p_project_id,m.message_seq,m.id)
    on conflict (workspace_id,agent_id,project_id) do update
      set last_read_seq = excluded.last_read_seq, last_read_id = excluded.last_read_id
      where excluded.last_read_seq > board_read_cursors.last_read_seq;
  select * into result from public.board_read_cursors
    where workspace_id = p_workspace_id and agent_id = p_agent_id and project_id = p_project_id;
  return result;
end $$;
revoke all on function public.stoic_ack_board_message(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.stoic_ack_board_message(uuid,uuid,uuid,uuid) to service_role;
