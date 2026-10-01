\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');
do $$
declare
  provisioned_id uuid;
begin
  if (select count(*) from public.workspaces where owner_id in (
    '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'
  )) <> 2 then raise exception 'signup did not provision one workspace per user'; end if;
  if (select count(*) from public.projects p join public.workspaces w on w.id = p.workspace_id where w.owner_id in (
    '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'
  )) <> 2 then raise exception 'signup did not provision a first project'; end if;
  provisioned_id := public.stoic_provision_workspace('10000000-0000-0000-0000-000000000001', 'Another name');
  if provisioned_id is null then raise exception 'workspace provisioning was not idempotent'; end if;
  if (select count(*) from public.projects where workspace_id = provisioned_id) <> 1 then
    raise exception 'workspace provisioning duplicated the first project';
  end if;
end
$$;

insert into stoic_private.mcp_oauth_clients(client_id, enabled) values
  ('stoic-test-oauth-client', true),
  ('stoic-test-disabled-client', false);

set role supabase_auth_admin;
do $$
declare
  oauth_event jsonb := jsonb_build_object(
    'user_id', '10000000-0000-0000-0000-000000000001',
    'authentication_method', 'oauth',
    'claims', jsonb_build_object(
      'sub', '10000000-0000-0000-0000-000000000001',
      'aud', 'authenticated',
      'client_id', 'stoic-test-oauth-client',
      'role', 'authenticated',
      'email', 'pilot@example.test'
    )
  );
  mapped_event jsonb;
  unmapped_event jsonb := jsonb_build_object(
    'authentication_method', 'oauth',
    'claims', jsonb_build_object('aud', 'authenticated', 'client_id', 'other-oauth-client')
  );
  disabled_event jsonb := jsonb_build_object(
    'authentication_method', 'oauth',
    'claims', jsonb_build_object('aud', 'authenticated', 'client_id', 'stoic-test-disabled-client')
  );
  password_event jsonb := jsonb_build_object(
    'authentication_method', 'password',
    'claims', jsonb_build_object('aud', 'authenticated', 'sub', '10000000-0000-0000-0000-000000000001')
  );
begin
  mapped_event := stoic_private.custom_access_token_hook(oauth_event);
  if mapped_event #>> '{claims,aud}' is distinct from 'https://stoic.bishoptech.dev/api/mcp' then
    raise exception 'enabled OAuth client did not receive the Stoic MCP audience';
  end if;
  if (mapped_event - 'claims') is distinct from (oauth_event - 'claims')
    or ((mapped_event -> 'claims') - 'aud') is distinct from ((oauth_event -> 'claims') - 'aud') then
    raise exception 'OAuth hook changed claims other than aud';
  end if;
  if stoic_private.custom_access_token_hook(unmapped_event) is distinct from unmapped_event then
    raise exception 'unmapped OAuth client event was modified';
  end if;
  if stoic_private.custom_access_token_hook(disabled_event) is distinct from disabled_event then
    raise exception 'disabled OAuth client event was modified';
  end if;
  if stoic_private.custom_access_token_hook(password_event) is distinct from password_event then
    raise exception 'non-OAuth event was modified';
  end if;

  if not has_schema_privilege('supabase_auth_admin', 'stoic_private', 'USAGE')
    or has_schema_privilege('anon', 'stoic_private', 'USAGE')
    or has_schema_privilege('authenticated', 'stoic_private', 'USAGE')
    or has_schema_privilege('service_role', 'stoic_private', 'USAGE') then
    raise exception 'Stoic OAuth hook schema permissions are not least-privilege';
  end if;
  if not has_table_privilege('supabase_auth_admin', 'stoic_private.mcp_oauth_clients', 'SELECT')
    or has_table_privilege('supabase_auth_admin', 'stoic_private.mcp_oauth_clients', 'INSERT')
    or has_table_privilege('anon', 'stoic_private.mcp_oauth_clients', 'SELECT')
    or has_table_privilege('authenticated', 'stoic_private.mcp_oauth_clients', 'SELECT')
    or has_table_privilege('service_role', 'stoic_private.mcp_oauth_clients', 'SELECT') then
    raise exception 'OAuth client registry table permissions are not least-privilege';
  end if;
  if not has_function_privilege('supabase_auth_admin', 'stoic_private.custom_access_token_hook(jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'stoic_private.custom_access_token_hook(jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'stoic_private.custom_access_token_hook(jsonb)', 'EXECUTE')
    or has_function_privilege('service_role', 'stoic_private.custom_access_token_hook(jsonb)', 'EXECUTE') then
    raise exception 'OAuth hook function permissions are not least-privilege';
  end if;
end
$$;
reset role;
delete from public.workspaces where owner_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'
);
insert into public.workspaces(id, owner_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Alpha'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Beta');
insert into public.agents(id, workspace_id, name, platform, status, oauth_client_id) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Boss', 'codex', 'connected', 'shared-client'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Worker', 'hermes', 'connected', null),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'Worker Two', 'openclaw', 'connected', null),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Other boss', 'openclaw', 'connected', 'shared-client');
do $$
begin
  if exists (select 1 from public.agents where harness_name is null or char_length(btrim(harness_name)) not between 2 and 60) then
    raise exception 'agent harness name default or validation failed';
  end if;
end
$$;
update public.workspaces set boss_agent_id = '30000000-0000-0000-0000-000000000001' where id = '20000000-0000-0000-0000-000000000001';
update public.workspaces set boss_agent_id = '30000000-0000-0000-0000-000000000003' where id = '20000000-0000-0000-0000-000000000002';
insert into public.projects(id, workspace_id, name) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Project A'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Project B');

do $$
declare
  w1 uuid := '20000000-0000-0000-0000-000000000001';
  w2 uuid := '20000000-0000-0000-0000-000000000002';
  p1 uuid := '40000000-0000-0000-0000-000000000001';
  p2 uuid := '40000000-0000-0000-0000-000000000002';
  boss uuid := '30000000-0000-0000-0000-000000000001';
  worker uuid := '30000000-0000-0000-0000-000000000002';
  worker2 uuid := '30000000-0000-0000-0000-000000000004';
  other_boss uuid := '30000000-0000-0000-0000-000000000003';
  h jsonb;
  again jsonb;
  a jsonb;
  m public.board_messages%rowtype;
  m2 public.board_messages%rowtype;
  public_file_id uuid;
  attachment_file_id uuid;
  private_file_id uuid;
  created_project jsonb;
  repeated_project jsonb;
  team_handoff jsonb;
  repeated_team_handoff jsonb;
  attach_handoff jsonb;
  competing_handoff jsonb;
  attached_count integer;
  i integer;
begin
  begin
    perform public.relay_create_handoff(w2, p2, other_boss, other_boss, null, 'Unpaid task', 'This workspace has no active subscription', '', 'unpaid-task-key');
    raise exception 'unpaid workspace created a handoff';
  exception when others then
    if sqlerrm <> 'subscription_required' then raise; end if;
  end;
  begin
    perform public.relay_reserve_artifact(w2, p2, null, other_boss, null, 'unpaid.pdf', 'application/pdf', 1);
    raise exception 'unpaid workspace reserved a file';
  exception when others then
    if sqlerrm <> 'subscription_required' then raise; end if;
  end;
  update public.workspaces set plan = 'pro' where id in (w1, w2);
  if (select count(*) from public.stoic_next_synthesis_projects('2026-09-27', 4)) <> 2
    then raise exception 'synthesis queue omitted paid projects'; end if;
  insert into public.synthesis_runs(workspace_id, project_id, run_date, status)
    values(w1, p1, '2026-09-27', 'completed');
  if (select count(*) from public.stoic_next_synthesis_projects('2026-09-27', 4)) <> 1
    then raise exception 'synthesis queue repeated a project the same day'; end if;
  if not exists (select 1 from public.stoic_next_synthesis_projects('2026-09-27', 4) where id = p2)
    then raise exception 'synthesis queue did not advance to next project'; end if;

  created_project := public.stoic_create_agent_project(w1, boss, 'Boss-created project', 'boss-create-project-1');
  repeated_project := public.stoic_create_agent_project(w1, boss, 'Boss-created project', 'boss-create-project-1');
  if created_project ->> 'id' is distinct from repeated_project ->> 'id' then
    raise exception 'agent project creation did not return the idempotent project';
  end if;
  if (select count(*) from public.projects where workspace_id = w1 and created_by_agent_id = boss and idempotency_key = 'boss-create-project-1') <> 1 then
    raise exception 'agent project retry duplicated a project';
  end if;
  begin
    perform public.stoic_create_agent_project(w1, worker, 'Worker project', 'worker-create-project-1');
    raise exception 'worker created a project without boss permission';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;

  begin
    perform public.relay_create_handoff(w1, p1, boss, boss, null, 'Self-assigned task', 'The boss should not assign itself worker work', '', 'self-assigned-key');
    raise exception 'boss created a self-assigned handoff';
  exception when others then
    if sqlerrm <> 'boss_cannot_be_assignee' then raise; end if;
  end;
  begin
    perform public.relay_create_handoff(w1, p1, boss, null, '10000000-0000-0000-0000-000000000001', 'Owner assignment', 'The owner should select a separate worker', '', 'owner-to-boss-key');
    raise exception 'owner assigned worker work to the boss';
  exception when others then
    if sqlerrm <> 'boss_cannot_be_assignee' then raise; end if;
  end;

  h := public.relay_create_handoff(w1, p1, worker, boss, null, 'Research market', 'Find three concrete market examples', '', 'first-task-key');
  if not exists (
    select 1 from public.handoffs
    where id = (h->>'id')::uuid
      and search_document @@ websearch_to_tsquery('simple', 'market examples')
  ) then raise exception 'handoff search document did not index the title and goal'; end if;
  begin
    perform public.stoic_set_workspace_policy(w1, '10000000-0000-0000-0000-000000000001', worker, 'delegate');
    raise exception 'worker with an open handoff became boss';
  exception when others then
    if sqlerrm <> 'boss_has_active_handoffs' then raise; end if;
  end;
  begin
    perform public.stoic_set_workspace_policy(w1, '10000000-0000-0000-0000-000000000002', boss, 'delegate');
    raise exception 'foreign owner changed team policy';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  update public.workspaces set plan = 'free' where id = w1;
  begin
    perform public.relay_handoff_action((h->>'id')::uuid, worker, null, 'claim', '', 'unpaid-claim-key');
    raise exception 'unpaid workspace changed a handoff';
  exception when others then
    if sqlerrm <> 'subscription_required' then raise; end if;
  end;
  update public.workspaces set plan = 'pro' where id = w1;
  m := public.stoic_post_board_message(w1,p1,worker,null,'run_report','Research started',null,'board-first-key');
  m2 := public.stoic_post_board_message(w1,p1,worker,null,'run_report','Research started',null,'board-first-key');
  if m.id <> m2.id or (select count(*) from public.board_messages where project_id = p1) <> 1 then raise exception 'board retry created duplicate'; end if;
  m2 := public.stoic_post_board_message(w1,p1,boss,null,'message','Please cite the source',m.id,'board-reply-key');
  if m2.parent_id <> m.id then raise exception 'board reply missing parent'; end if;
  if not exists (select 1 from public.stoic_unread_board_projects(w1,worker) where project_id = p1)
    then raise exception 'worker inbox did not flag boss reply'; end if;
  if not exists (select 1 from public.stoic_unread_board_projects(w1,worker) where project_id = p1)
    then raise exception 'repeated inbox check consumed unread board'; end if;
  perform public.stoic_ack_board_message(w1,worker,p1,m2.id);
  if exists (select 1 from public.stoic_unread_board_projects(w1,worker) where project_id = p1)
    then raise exception 'acknowledged board remained unread'; end if;
  perform public.stoic_ack_board_message(w1,worker,p1,m.id);
  if (select last_read_id from public.board_read_cursors where workspace_id = w1 and agent_id = worker and project_id = p1) <> m2.id
    then raise exception 'older ack rewound board cursor'; end if;
  if not exists (select 1 from public.stoic_unread_board_projects(w1,boss) where project_id = p1)
    then raise exception 'boss inbox did not flag worker report'; end if;
  begin
    perform public.stoic_ack_board_message(w1,worker,p2,m2.id);
    raise exception 'cross-workspace board ack succeeded';
  exception when others then
    if sqlerrm <> 'project_not_found' then raise; end if;
  end;
  begin
    perform public.stoic_unread_board_projects(w1,other_boss);
    raise exception 'foreign agent read board inbox';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  begin
    perform public.stoic_post_board_message(w1,p1,worker,null,'run_report','Different body',null,'board-first-key');
    raise exception 'board idempotency conflict was accepted';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
  begin
    perform public.stoic_post_board_message(w1,p2,worker,null,'message','Foreign project',null,'board-foreign-project');
    raise exception 'cross-workspace board post succeeded';
  exception when others then
    if sqlerrm <> 'project_not_found' then raise; end if;
  end;
  begin
    perform public.stoic_post_board_message(w1,p1,other_boss,null,'message','Foreign agent',null,'board-foreign-agent');
    raise exception 'foreign agent posted';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  again := public.relay_create_handoff(w1, p1, worker, boss, null, 'Research market', 'Find three concrete market examples', '', 'first-task-key');
  if h->>'id' <> again->>'id' then raise exception 'handoff retry created a duplicate'; end if;
  begin
    perform public.relay_create_handoff(w1, p1, worker, boss, null, 'Changed research', 'Find three concrete market examples', '', 'first-task-key');
    raise exception 'changed handoff retry was accepted';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
  if (select count(*) from public.handoffs where workspace_id = w1) <> 1 then raise exception 'handoff count mismatch'; end if;

  begin
    perform public.relay_create_handoff(w1, p1, worker, worker, null, 'Forbidden task', 'Worker tries to assign a task', '', 'worker-task-key');
    raise exception 'worker obtained boss permission';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  begin
    perform public.relay_handoff_action((h->>'id')::uuid, other_boss, null, 'claim', '', 'foreign-claim-key');
    raise exception 'cross-workspace action succeeded';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;

  perform public.relay_handoff_action((h->>'id')::uuid, worker, null, 'claim', '', 'claim-task-key');
  perform public.relay_handoff_action((h->>'id')::uuid, worker, null, 'claim', '', 'claim-task-key');
  begin
    perform public.relay_handoff_action((h->>'id')::uuid, worker, null, 'update', 'Changed meaning', 'claim-task-key');
    raise exception 'changed task action retry was accepted';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
  if (select count(*) from public.task_events where handoff_id = (h->>'id')::uuid and event_type = 'claim') <> 1
    then raise exception 'action retry created duplicate event'; end if;
  a := public.relay_request_approval((h->>'id')::uuid, worker, 'Publish the final report to a public site', 'approval-key-one');
  again := public.relay_request_approval((h->>'id')::uuid, worker, 'Publish the final report to a public site', 'approval-key-one');
  if a->>'id' <> again->>'id' then raise exception 'approval retry created a duplicate'; end if;
  begin
    perform public.relay_request_approval((h->>'id')::uuid, worker, 'Send the report to a different public site', 'approval-key-one');
    raise exception 'changed approval retry was accepted';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
  begin
    perform public.relay_request_approval((h->>'id')::uuid, other_boss, 'Publish the final report to a public site', 'foreign-approval');
    raise exception 'cross-workspace approval succeeded';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  perform public.relay_handoff_action((h->>'id')::uuid, worker, null, 'submit', 'Three examples attached', 'submit-task-key');
  perform public.relay_handoff_action((h->>'id')::uuid, boss, null, 'accept', '', 'accept-task-key');
  if (select status from public.handoffs where id = (h->>'id')::uuid) <> 'accepted'
    then raise exception 'handoff did not complete'; end if;
  perform public.stoic_set_workspace_policy(w1, '10000000-0000-0000-0000-000000000001', worker, 'delegate');
  if (select boss_agent_id from public.workspaces where id = w1) <> worker
    then raise exception 'completed worker could not become boss'; end if;
  perform public.stoic_set_workspace_policy(w1, '10000000-0000-0000-0000-000000000001', boss, 'delegate');

  update public.workspaces set delegation_level = 'propose' where id = w1;
  team_handoff := public.relay_create_team_handoff(w1, p1, boss, null, 'Shared research', 'Find three useful examples for the launch brief', '', 'team-queue-key');
  repeated_team_handoff := public.relay_create_team_handoff(w1, p1, boss, null, 'Shared research', 'Find three useful examples for the launch brief', '', 'team-queue-key');
  if team_handoff->>'id' is distinct from repeated_team_handoff->>'id'
    then raise exception 'team handoff retry created a duplicate'; end if;
  if team_handoff->>'status' <> 'proposed' or team_handoff->>'assigned_agent_id' is not null
    then raise exception 'propose-mode team handoff was not left unassigned for review'; end if;
  if (select count(*) from public.handoff_eligible_agents where workspace_id = w1 and handoff_id = (team_handoff->>'id')::uuid) <> 2
    then raise exception 'team handoff did not snapshot all connected workers'; end if;
  if exists (select 1 from public.relay_agent_handoff_page(w1, worker, null, 0) where id = (team_handoff->>'id')::uuid)
    or exists (select 1 from public.relay_agent_handoff_page(w1, worker2, null, 0) where id = (team_handoff->>'id')::uuid)
    then raise exception 'workers saw a proposed team handoff before owner approval'; end if;
  perform public.relay_handoff_action((team_handoff->>'id')::uuid, null, '10000000-0000-0000-0000-000000000001', 'approve_assignment', '', 'approve-team-queue-key');
  if not exists (select 1 from public.relay_agent_handoff_page(w1, worker, null, 0) where id = (team_handoff->>'id')::uuid)
    or not exists (select 1 from public.relay_agent_handoff_page(w1, worker2, null, 0) where id = (team_handoff->>'id')::uuid)
    then raise exception 'approved team handoff was not visible to all eligible workers'; end if;
  perform public.relay_handoff_action((team_handoff->>'id')::uuid, worker2, null, 'claim', '', 'claim-team-queue-key');
  if (select assigned_agent_id from public.handoffs where id = (team_handoff->>'id')::uuid) <> worker2
    or (select status from public.handoffs where id = (team_handoff->>'id')::uuid) <> 'claimed'
    then raise exception 'first team-queue claimant did not become the sole assignee'; end if;
  if exists (select 1 from public.relay_agent_handoff_page(w1, worker, null, 0) where id = (team_handoff->>'id')::uuid)
    then raise exception 'non-claiming worker continued to see another worker assignment'; end if;
  begin
    perform public.relay_handoff_action((team_handoff->>'id')::uuid, worker, null, 'claim', '', 'claim-team-queue-second-key');
    raise exception 'second worker claimed an already assigned team handoff';
  exception when others then
    if sqlerrm <> 'invalid_transition' then raise; end if;
  end;
  update public.workspaces set delegation_level = 'delegate' where id = w1;

  update public.workspaces set delegation_level = 'propose' where id = w2;
  begin
    perform public.relay_create_team_handoff(w2, p2, null, '10000000-0000-0000-0000-000000000002', 'No worker', 'This should not be queueable', '', 'no-workers-key');
    raise exception 'team handoff succeeded without connected workers';
  exception when others then
    if sqlerrm <> 'no_workers_available' then raise; end if;
  end;
  update public.workspaces set delegation_level = 'delegate' where id = w2;

  for i in 1..60 loop
    perform public.relay_create_handoff(w1, p1, worker, boss, null, 'Additional task ' || i, 'Complete another bounded research task', '', 'extra-task-' || i);
  end loop;
  if (select count(*) from public.handoffs where workspace_id = w1) <> 62 then raise exception 'handoff count was capped'; end if;

  for i in 1..5 loop
    perform public.relay_reserve_artifact(w1, p1, null, boss, null, 'file' || i || '.pdf', 'application/pdf', 26214400);
  end loop;
  if (select coalesce(sum(size_bytes), 0) from public.artifacts where workspace_id = w1) <= 104857600 then raise exception 'storage was capped at 100 MB'; end if;
  begin
    perform public.relay_reserve_artifact(w2, p1, null, other_boss, null, 'foreign.pdf', 'application/pdf', 1);
    raise exception 'cross-workspace file reservation succeeded';
  exception when others then
    if sqlerrm <> 'project_not_found' then raise; end if;
  end;

  update public.agents set status = 'revoked' where id = worker;
  begin
    perform public.stoic_post_board_message(w1,p1,worker,null,'message','After revoke',null,'board-after-revoke');
    raise exception 'revoked agent posted to board';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  begin
    perform public.stoic_ack_board_message(w1,worker,p1,m2.id);
    raise exception 'revoked agent acknowledged board';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  begin
    perform public.relay_handoff_action((h->>'id')::uuid, worker, null, 'update', 'Should be denied', 'revoked-key');
    raise exception 'revoked agent acted';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  if has_table_privilege('authenticated', 'public.handoffs', 'SELECT')
    then raise exception 'authenticated role can read handoff table'; end if;
  if has_table_privilege('authenticated', 'public.board_messages', 'SELECT')
    then raise exception 'authenticated role can read board table'; end if;
  if has_table_privilege('authenticated', 'public.board_read_cursors', 'SELECT')
    then raise exception 'authenticated role can read board cursors'; end if;
  if has_table_privilege('authenticated', 'public.handoff_eligible_agents', 'SELECT')
    then raise exception 'authenticated role can read team-queue recipient table'; end if;
  if has_function_privilege('authenticated', 'public.stoic_ack_board_message(uuid,uuid,uuid,uuid)', 'EXECUTE')
    then raise exception 'authenticated role can acknowledge board directly'; end if;
  if has_function_privilege('authenticated', 'public.relay_create_handoff(uuid,uuid,uuid,uuid,uuid,text,text,text,text)', 'EXECUTE')
    then raise exception 'authenticated role can execute task RPC'; end if;
  if has_function_privilege('authenticated', 'public.relay_create_team_handoff(uuid,uuid,uuid,uuid,text,text,text,text)', 'EXECUTE')
    then raise exception 'authenticated role can execute team handoff RPC'; end if;
  if has_function_privilege('authenticated', 'public.relay_agent_handoff_page(uuid,uuid,uuid,integer)', 'EXECUTE')
    then raise exception 'authenticated role can execute scoped handoff reader directly'; end if;
  if (public.relay_workspace_usage(w1)->>'handoffs')::integer <> 62 then raise exception 'handoff usage mismatch'; end if;
  if (public.relay_workspace_usage(w1)->>'storageBytes')::bigint <> 131072000 then raise exception 'storage usage mismatch'; end if;
  a := public.stoic_reserve_artifact_v2(w1,p1,null,boss,null,'retry.txt','text/plain',1,'artifact-retry-key',null);
  again := public.stoic_reserve_artifact_v2(w1,p1,null,boss,null,'retry.txt','text/plain',1,'artifact-retry-key',null);
  if a->>'id' <> again->>'id' or again->>'idempotent_replay' <> 'true'
    then raise exception 'artifact retry created a duplicate'; end if;
  begin
    perform public.stoic_reserve_artifact_v2(w1,p1,null,boss,null,'changed.txt','text/plain',1,'artifact-retry-key',null);
    raise exception 'artifact idempotency conflict was accepted';
  exception when others then
    if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
  if has_function_privilege('authenticated', 'public.stoic_reserve_artifact_v2(uuid,uuid,uuid,uuid,uuid,text,text,bigint,text,text)', 'EXECUTE')
    then raise exception 'authenticated role can reserve artifacts directly'; end if;
  update public.artifacts set status = 'ready' where id = (a->>'id')::uuid;
  public_file_id := (a->>'id')::uuid;
  m := public.stoic_announce_project_artifact((a->>'id')::uuid);
  m2 := public.stoic_announce_project_artifact((a->>'id')::uuid);
  if m.id <> m2.id or m.kind <> 'artifact' or
    (select count(*) from public.board_messages where kind = 'artifact' and idempotency_key = 'artifact-ready:' || (a->>'id')) <> 1
    then raise exception 'project file announcement was duplicated or mislabeled'; end if;
  again := public.stoic_reserve_artifact_v2(w1,p1,(h->>'id')::uuid,boss,null,'private.txt','text/plain',1,'handoff-artifact-key',null);
  private_file_id := (again->>'id')::uuid;
  update public.artifacts set status = 'ready' where id = (again->>'id')::uuid;
  begin
    perform public.stoic_announce_project_artifact((again->>'id')::uuid);
    raise exception 'handoff file was announced to the project';
  exception when others then
    if sqlerrm <> 'handoff_artifact_not_public' then raise; end if;
  end;
  if has_function_privilege('authenticated', 'public.stoic_announce_project_artifact(uuid)', 'EXECUTE')
    then raise exception 'authenticated role can announce an artifact directly'; end if;
  begin
    perform public.stoic_mark_artifact_deleted(w1, '10000000-0000-0000-0000-000000000002', public_file_id);
    raise exception 'foreign owner deleted a file';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  a := public.stoic_mark_artifact_deleted(w1, '10000000-0000-0000-0000-000000000001', public_file_id);
  again := public.stoic_mark_artifact_deleted(w1, '10000000-0000-0000-0000-000000000001', public_file_id);
  if a->>'status' <> 'deleted' or again->>'alreadyDeleted' <> 'true'
    or (select count(*) from public.board_messages where kind = 'artifact' and idempotency_key = 'artifact-deleted:' || public_file_id::text) <> 1
    then raise exception 'project file deletion was not idempotent or announced'; end if;
  if exists (select 1 from public.artifacts where id = public_file_id and status = 'ready')
    then raise exception 'deleted project file remained readable'; end if;
  again := public.stoic_reserve_artifact_v2(w1,p1,null,boss,null,'intake-attachment.txt','text/plain',1,'intake-attachment-file-key',null);
  attachment_file_id := (again->>'id')::uuid;
  update public.artifacts set status = 'ready' where id = attachment_file_id;
  perform public.stoic_announce_project_artifact(attachment_file_id);
  attach_handoff := public.relay_create_team_handoff(
    w1, p1, null, '10000000-0000-0000-0000-000000000001',
    'Review the owner intake file', 'Read the attached source file and report its key points', '', 'intake-attach-first-key'
  );
  competing_handoff := public.relay_create_team_handoff(
    w1, p1, null, '10000000-0000-0000-0000-000000000001',
    'Review another source file', 'Read the source file and report its key points', '', 'intake-attach-second-key'
  );
  attached_count := public.stoic_attach_intake_artifacts_to_handoff(
    w1, '10000000-0000-0000-0000-000000000001', p1, (attach_handoff->>'id')::uuid, array[attachment_file_id]
  );
  if attached_count <> 1 or (select handoff_id from public.artifacts where id = attachment_file_id) <> (attach_handoff->>'id')::uuid
    then raise exception 'approved intake file was not scoped to its handoff'; end if;
  perform public.stoic_attach_intake_artifacts_to_handoff(
    w1, '10000000-0000-0000-0000-000000000001', p1, (attach_handoff->>'id')::uuid, array[attachment_file_id]
  );
  if (select count(*) from public.task_events where handoff_id = (attach_handoff->>'id')::uuid and event_type = 'artifact_attached') <> 1
    then raise exception 'intake file attachment retry duplicated task history'; end if;
  if exists (select 1 from public.artifacts where id = attachment_file_id and handoff_id is null)
    then raise exception 'attached intake file remained project-wide'; end if;
  begin
    perform public.stoic_attach_intake_artifacts_to_handoff(
      w1, '10000000-0000-0000-0000-000000000001', p1, (competing_handoff->>'id')::uuid, array[attachment_file_id]
    );
    raise exception 'an artifact already attached to another handoff was reassigned';
  exception when others then
    if sqlerrm <> 'artifact_not_attachable' then raise; end if;
  end;
  begin
    perform public.stoic_attach_intake_artifacts_to_handoff(
      w2, '10000000-0000-0000-0000-000000000002', p2, (attach_handoff->>'id')::uuid, array[attachment_file_id]
    );
    raise exception 'cross-workspace artifact attachment succeeded';
  exception when others then
    if sqlerrm <> 'handoff_not_found' then raise; end if;
  end;
  if has_function_privilege('authenticated', 'public.stoic_attach_intake_artifacts_to_handoff(uuid,uuid,uuid,uuid,uuid[])', 'EXECUTE')
    then raise exception 'authenticated role can attach artifacts directly'; end if;
  perform public.stoic_mark_artifact_deleted(w1, '10000000-0000-0000-0000-000000000001', private_file_id);
  if exists (select 1 from public.board_messages where idempotency_key = 'artifact-deleted:' || private_file_id::text)
    then raise exception 'private file deletion leaked to project board'; end if;
  if not exists (select 1 from public.task_events where handoff_id = (h->>'id')::uuid and event_type = 'artifact_deleted' and body like '%private.txt%')
    then raise exception 'private file deletion omitted handoff history'; end if;
  begin
    delete from public.handoffs where id = (h->>'id')::uuid;
    raise exception 'handoff deletion exposed its private file';
  exception when foreign_key_violation then null; end;
  if (select handoff_id from public.artifacts where id = private_file_id) <> (h->>'id')::uuid
    then raise exception 'private file lost its handoff scope'; end if;
  if has_function_privilege('authenticated', 'public.stoic_mark_artifact_deleted(uuid,uuid,uuid)', 'EXECUTE')
    then raise exception 'authenticated role can delete file metadata directly'; end if;

  insert into public.knowledge_notes(
    workspace_id, project_id, id, path, kind, title, status, confidence,
    note_created_at, note_updated_at, source_agent, source_user,
    supersedes, related, evidence, metadata, body, markdown, updated_by_user_id
  ) values (
    w1, p1, 'project-brief', 'index.md', 'brief', 'Current project brief', 'active', 'verified',
    '2026-09-27T12:00:00Z', '2026-09-27T13:00:00Z', 'agent-source', 'user-source',
    '{}', '{}', array['brief:version-1'], jsonb_build_object('contract_version', 1, 'id', 'project-brief'),
    'The validated project direction is stored in Markdown.',
    E'---\ncontract_version: 1\nid: "project-brief"\nproject_id: "40000000-0000-0000-0000-000000000001"\nkind: "brief"\ntitle: "Current project brief"\nstatus: "active"\ncreated_at: "2026-09-27T12:00:00Z"\nupdated_at: "2026-09-27T13:00:00Z"\nconfidence: "verified"\nsupersedes: []\nrelated: []\nevidence: ["brief:version-1"]\nsource_agent: "agent-source"\nsource_user: "user-source"\n---\n\nThe validated project direction is stored in Markdown.\n',
    '10000000-0000-0000-0000-000000000001'
  );
  if (select count(*) from public.knowledge_notes where workspace_id = w1 and project_id = p1) <> 1
    then raise exception 'knowledge note was not stored'; end if;
  begin
    insert into public.knowledge_notes(
      workspace_id, project_id, id, path, kind, title, status, confidence,
      note_created_at, note_updated_at, body, markdown
    ) values (
      w1, p2, 'foreign-note', 'foreign.md', 'note', 'Foreign note', 'active', 'uncertain',
      now(), now(), 'This must be rejected.', 'not a validated note'
    );
    raise exception 'cross-workspace knowledge note was stored';
  exception when foreign_key_violation then null; end;
  insert into public.knowledge_settings(workspace_id, project_id, enabled, timezone, updated_by_user_id)
    values(w1, p1, false, 'America/Chicago', '10000000-0000-0000-0000-000000000001');
  update public.knowledge_settings set enabled = true where workspace_id = w1 and project_id = p1;
  if not (select enabled from public.knowledge_settings where workspace_id = w1 and project_id = p1)
    or (select settings_revision from public.knowledge_settings where workspace_id = w1 and project_id = p1) <> 2
    then raise exception 'knowledge settings trigger did not preserve revision state'; end if;
  insert into public.knowledge_refresh_runs(
    workspace_id, project_id, scheduled_slot, source_scope_revision, input_fingerprint,
    status, started_at, completed_at, output_counts
  ) values (w1, p1, '08:00', 1, '1234567890abcdef', 'completed', now(), now(), '{"notes": 1}'::jsonb);
  begin
    insert into public.knowledge_refresh_runs(
      workspace_id, project_id, scheduled_slot, source_scope_revision, input_fingerprint,
      status, started_at
    ) values (w1, p1, '08:00', 1, '1234567890abcdef', 'completed', now());
    raise exception 'duplicate knowledge refresh run was stored';
  exception when unique_violation then null; end;
  insert into public.knowledge_refresh_runs(
    workspace_id, project_id, scheduled_slot, scheduled_local_date, source_scope_revision, input_fingerprint,
    status, started_at
  ) values (w1, p1, '08:00', current_date + 1, 1, '2234567890abcdef', 'running', now());
  insert into public.knowledge_refresh_runs(
    workspace_id, project_id, scheduled_slot, scheduled_local_date, trigger_kind, source_scope_revision, input_fingerprint,
    status, started_at
  ) values
    (w1, p1, '08:00', current_date, 'manual', 1, '3234567890abcdef', 'running', now()),
    (w1, p1, '08:00', current_date, 'manual', 1, '4234567890abcdef', 'running', now());
  if (select count(*) from public.knowledge_refresh_runs where workspace_id = w1 and project_id = p1 and trigger_kind = 'manual') <> 2
    then raise exception 'manual refresh runs were incorrectly subject to scheduled-slot deduplication'; end if;
  if has_table_privilege('authenticated', 'public.knowledge_notes', 'SELECT')
    or has_table_privilege('authenticated', 'public.knowledge_settings', 'SELECT')
    or has_table_privilege('authenticated', 'public.knowledge_refresh_runs', 'SELECT')
    then raise exception 'authenticated role can read knowledge tables directly'; end if;
  insert into public.intake_threads(id, workspace_id, project_id, title)
    values('90000000-0000-0000-0000-000000000001', w1, p1, 'Owner intake');
  begin
    insert into public.intake_threads(workspace_id, project_id, title)
      values(w1, p2, 'Foreign project');
    raise exception 'cross-workspace intake thread was stored';
  exception when foreign_key_violation then null; end;
  insert into public.intake_turns(workspace_id, thread_id, owner_id, request_key, prompt, proposal_status)
    values(w1, '90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'intake-retry-key', 'Assign the research work', 'creating');
  begin
    insert into public.intake_turns(workspace_id, thread_id, owner_id, request_key, prompt)
      values(w1, '90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'intake-retry-key', 'Duplicate');
    raise exception 'duplicate intake request key was stored';
  exception when unique_violation then null; end;
  begin
    insert into public.intake_turns(workspace_id, thread_id, owner_id, request_key, prompt)
      values(w2, '90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'foreign-intake-key', 'Foreign');
    raise exception 'cross-workspace intake turn was stored';
  exception when foreign_key_violation then null; end;
  if has_table_privilege('authenticated', 'public.intake_threads', 'SELECT')
    or has_table_privilege('authenticated', 'public.intake_turns', 'SELECT')
    then raise exception 'authenticated role can read owner intake tables directly'; end if;
  raise notice 'Stoic SQL integration checks passed';
end $$;

do $$
declare
  w1 uuid := '20000000-0000-0000-0000-000000000001';
  w2 uuid := '20000000-0000-0000-0000-000000000002';
  p1 uuid := '40000000-0000-0000-0000-000000000001';
  owner1 uuid := '10000000-0000-0000-0000-000000000001';
  owner2 uuid := '10000000-0000-0000-0000-000000000002';
  v_run_id uuid;
  v_run2_id uuid;
  v_run3_id uuid;
  v_idea_id uuid;
  v_idea2_id uuid;
  v_result jsonb;
  v_ideas jsonb;
begin
  update public.workspaces set plan = 'pro', delegation_level = 'delegate', ideas_timezone = 'America/Chicago' where id = w1;
  update public.workspaces set plan = 'pro', ideas_timezone = 'Pacific/Honolulu' where id = w2;

  if (select count(*) from public.stoic_claim_due_idea_runs('2026-09-28 12:59:00+00', 20)) <> 0
    then raise exception 'daily ideas ran before 8 AM in the workspace timezone'; end if;
  select r.run_id into v_run_id from public.stoic_claim_due_idea_runs('2026-09-28 13:00:00+00', 20) r where r.workspace_id = w1;
  if v_run_id is null or (select count(*) from public.idea_generation_runs where workspace_id = w1 and local_date = '2026-09-28') <> 1
    then raise exception 'daily ideas did not respect the workspace-local 8 AM boundary'; end if;
  if (select count(*) from public.stoic_claim_due_idea_runs('2026-09-28 13:00:00+00', 20)) <> 0
    then raise exception 'the same workspace-local day was claimed twice'; end if;
  select r.run_id into v_run2_id from public.stoic_claim_due_idea_runs('2026-09-28 18:00:00+00', 20) r where r.workspace_id = w2;
  if v_run2_id is null or (select count(*) from public.idea_generation_runs where workspace_id = w2 and local_date = '2026-09-28') <> 1
    then raise exception 'a different workspace timezone did not get its own daily run'; end if;

  v_ideas := jsonb_build_array(
    jsonb_build_object('projectId', p1, 'title', 'Clarify the first step', 'summary', 'Write one small action that moves the current project forward.', 'whyNow', 'The brief already records the direction, but not the immediate next step.', 'nextStep', 'Add a single owner-reviewed next step to the project brief.', 'evidenceIds', jsonb_build_array('brief:' || p1::text || ':v1')),
    jsonb_build_object('projectId', p1, 'title', 'Close the open question', 'summary', 'Resolve the outstanding question documented in the team discussion.', 'whyNow', 'A clear answer will make the next scheduled agent run more useful.', 'nextStep', 'Ask the owner to confirm the current decision.', 'evidenceIds', jsonb_build_array('brief:' || p1::text || ':v1')),
    jsonb_build_object('projectId', p1, 'title', 'Review recent task history', 'summary', 'Compare the current handoff state with the project goal and note any missing context.', 'whyNow', 'A concise review can reduce repeated work across agents.', 'nextStep', 'Summarize the verified gap in the shared brief.', 'evidenceIds', jsonb_build_array('brief:' || p1::text || ':v1'))
  );
  v_result := public.stoic_complete_idea_run(w1, v_run_id, v_ideas);
  if v_result->>'status' <> 'completed' or jsonb_array_length(v_result->'ideas') <> 3
    then raise exception 'daily idea run did not save exactly three ideas'; end if;
  if jsonb_array_length((public.stoic_complete_idea_run(w1, v_run_id, v_ideas))->'ideas') <> 3
    then raise exception 'retrying idea completion duplicated or lost its ideas'; end if;

  select r.run_id into v_run3_id from public.stoic_claim_due_idea_runs('2026-09-29 13:00:00+00', 20) r where r.workspace_id = w1;
  if v_run3_id is null then raise exception 'a later workspace-local day did not claim a new idea run'; end if;
  v_ideas := jsonb_build_array(
    jsonb_build_object('projectId', p1, 'title', 'Create a focused checklist', 'summary', 'Turn the existing project requirements into a short review checklist.', 'whyNow', 'A checklist can make the next review more consistent.', 'nextStep', 'Draft a short checklist from the current project brief.', 'evidenceIds', jsonb_build_array('brief:' || p1::text || ':v1')),
    jsonb_build_object('projectId', p1, 'title', 'Capture the decision source', 'summary', 'Record where the current project decision came from for future agents.', 'whyNow', 'New agents can avoid revisiting settled questions.', 'nextStep', 'Add the source and date to the shared project notes.', 'evidenceIds', jsonb_build_array('brief:' || p1::text || ':v1')),
    jsonb_build_object('projectId', p1, 'title', 'Review contact provenance', 'summary', 'Check that any project contacts retain their source and context.', 'whyNow', 'Reliable provenance helps the owner assess new CRM entries.', 'nextStep', 'Review one recent contact source before taking follow-up action.', 'evidenceIds', jsonb_build_array('brief:' || p1::text || ':v1'))
  );
  perform public.stoic_complete_idea_run(w1, v_run3_id, v_ideas);
  if (select count(*) from public.ideas where workspace_id = w1) <> 6
    or (select count(*) from public.ideas where workspace_id = w1 and run_id = v_run_id) <> 3
    or (select count(*) from public.ideas where workspace_id = w1 and run_id = v_run3_id) <> 3 then
    raise exception 'a later daily idea run replaced or duplicated the earlier ideas';
  end if;
  select id into v_idea_id from public.ideas where workspace_id = w1 and title = 'Clarify the first step';
  select id into v_idea2_id from public.ideas where workspace_id = w1 and title = 'Close the open question';

  begin
    perform public.stoic_accept_idea(w1, owner2, v_idea_id);
    raise exception 'another workspace owner accepted this idea';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  v_result := public.stoic_accept_idea(w1, owner1, v_idea_id);
  if v_result->'idea'->>'status' <> 'accepted' or (v_result->'handoff'->>'assigned_agent_id') is not null
    then raise exception 'owner acceptance did not create a team queue handoff'; end if;
  if (public.stoic_accept_idea(w1, owner1, v_idea_id))->>'alreadyAccepted' <> 'true'
    then raise exception 'accepting the same idea twice was not idempotent'; end if;
  if (select count(*) from public.handoffs where workspace_id = w1 and idempotency_key = 'stoic-idea-' || v_idea_id::text) <> 1
    then raise exception 'idea acceptance duplicated its handoff'; end if;

  perform public.stoic_archive_idea(w1, owner1, v_idea2_id);
  if (select status from public.ideas where workspace_id = w1 and id = v_idea2_id) <> 'archived'
    then raise exception 'owner could not archive a pending idea'; end if;
  begin
    perform public.stoic_archive_idea(w1, owner1, v_idea_id);
    raise exception 'accepted idea was archived';
  exception when others then
    if sqlerrm <> 'accepted_idea_cannot_be_archived' then raise; end if;
  end;
  if has_table_privilege('authenticated', 'public.idea_generation_runs', 'SELECT')
    or has_table_privilege('authenticated', 'public.ideas', 'SELECT')
    then raise exception 'authenticated users can access idea tables directly'; end if;

  v_result := public.stoic_upsert_contacts(w1, null, owner1, p1, null, jsonb_build_array(jsonb_build_object(
    'full_name', 'Ada Lovelace', 'email', 'Ada@example.com', 'phone', '555-1000', 'company', 'Engines',
    'notes', 'Met at conference', 'source_label', 'Conference 2026', 'source_url', 'https://example.com/ada', 'source_key', 'user:owner1:source:contact-001'
  )));
  if (v_result->>'created')::integer <> 1 or (v_result->>'updated')::integer <> 0
    then raise exception 'new contact was not created'; end if;
  v_result := public.stoic_upsert_contacts(w1, null, owner1, p1, null, jsonb_build_array(jsonb_build_object(
    'full_name', 'Ada Lovelace', 'email', 'ada@example.com', 'company', 'Analytical Engines',
    'notes', 'Confirmed company spelling', 'source_label', 'Project research', 'source_url', 'https://example.com/project', 'source_key', 'user:owner1:source:contact-002'
  )));
  if (v_result->>'created')::integer <> 0 or (v_result->>'updated')::integer <> 1
    then raise exception 'contact deduplication did not update an existing record'; end if;
  if (select count(*) from public.contacts where workspace_id = w1 and lower(email) = 'ada@example.com') <> 1
    or (select count(*) from public.contact_sources s join public.contacts c on c.id = s.contact_id where c.workspace_id = w1 and lower(c.email) = 'ada@example.com') <> 2
    then raise exception 'contact upsert did not preserve its source history'; end if;
  v_result := public.stoic_upsert_contacts(w1, null, owner1, p1, null, jsonb_build_array(jsonb_build_object(
    'full_name', 'Ada Lovelace', 'email', 'ada@example.com', 'source_label', 'Conference 2026', 'source_key', 'user:owner1:source:contact-001'
  )));
  if (v_result->>'skipped')::integer <> 1 or (select count(*) from public.contacts where workspace_id = w2 and lower(email) = 'ada@example.com') <> 0
    then raise exception 'contact source retry or workspace isolation failed'; end if;
  begin
    perform public.stoic_upsert_contacts(w1, null, owner2, p1, null, '[]'::jsonb);
    raise exception 'a foreign owner wrote workspace contacts';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  if has_table_privilege('authenticated', 'public.contacts', 'SELECT')
    or has_table_privilege('authenticated', 'public.contact_sources', 'SELECT')
    or has_table_privilege('authenticated', 'public.contact_imports', 'SELECT')
    then raise exception 'authenticated users can access contact tables directly'; end if;
  raise notice 'Stoic ideas and contact integration checks passed';
end $$;
