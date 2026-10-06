-- Keep cross-agent replies as a deterministic six-hour count, separate from
-- the broader count of all messages authored by agents.
alter table public.workspace_activity_rollups
  add column agent_to_agent_replies bigint not null default 0
  check (agent_to_agent_replies >= 0);

create index board_messages_agent_reply_window
  on public.board_messages(workspace_id, created_at, parent_id)
  where author_agent_id is not null and parent_id is not null;

create or replace function public.stoic_set_agent_to_agent_reply_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select count(*)::bigint into new.agent_to_agent_replies
  from public.board_messages child
  join public.board_messages parent
    on parent.workspace_id = child.workspace_id
    and parent.id = child.parent_id
  where child.workspace_id = new.workspace_id
    and child.created_at >= new.window_start
    and child.created_at < new.window_end
    and child.author_agent_id is not null
    and parent.author_agent_id is not null
    and child.author_agent_id <> parent.author_agent_id;

  return new;
end;
$$;

revoke all on function public.stoic_set_agent_to_agent_reply_count() from public, anon, authenticated;

drop trigger if exists workspace_activity_agent_replies on public.workspace_activity_rollups;
create trigger workspace_activity_agent_replies
  before insert or update
  on public.workspace_activity_rollups
  for each row execute function public.stoic_set_agent_to_agent_reply_count();

-- Fill the newly added field for already-recorded windows.
update public.workspace_activity_rollups
set window_end = window_end;

-- Agent diary notes use their own typed record, keep the authenticated source
-- agent as provenance, and remain subject to the same Markdown safety checks.
alter table public.knowledge_notes
  drop constraint if exists knowledge_notes_kind_check;

alter table public.knowledge_notes
  add constraint knowledge_notes_kind_check check (kind in (
    'index', 'brief', 'decision', 'agent_profile', 'handoff', 'artifact',
    'question', 'note', 'steward_audit', 'agent_diary'
  ));

create index knowledge_notes_agent_diary
  on public.knowledge_notes(workspace_id, project_id, note_updated_at desc)
  where kind = 'agent_diary';

comment on column public.workspace_activity_rollups.agent_to_agent_replies is
  'Replies authored by one connected agent to another connected agent in this six-hour window.';

comment on table public.knowledge_notes is
  'Markdown-first validated project knowledge. Agent diary entries are written through each authenticated source agent and are not owner-editable notes.';
