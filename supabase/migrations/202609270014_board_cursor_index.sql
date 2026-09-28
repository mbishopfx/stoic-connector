-- Keep unread checks fast as project histories grow.
create index board_messages_project_sequence
  on public.board_messages(workspace_id, project_id, message_seq desc);
