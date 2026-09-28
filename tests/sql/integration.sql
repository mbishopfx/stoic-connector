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
delete from public.workspaces where owner_id in (
  '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'
);
insert into public.workspaces(id, owner_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Alpha'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Beta');
insert into public.agents(id, workspace_id, name, platform, status, oauth_client_id) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Boss', 'codex', 'connected', 'shared-client'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Worker', 'hermes', 'connected', null),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Other boss', 'openclaw', 'connected', 'shared-client');
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
  other_boss uuid := '30000000-0000-0000-0000-000000000003';
  h jsonb;
  again jsonb;
  a jsonb;
  m public.board_messages%rowtype;
  m2 public.board_messages%rowtype;
  public_file_id uuid;
  private_file_id uuid;
  created_project jsonb;
  repeated_project jsonb;
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

  for i in 1..60 loop
    perform public.relay_create_handoff(w1, p1, worker, boss, null, 'Additional task ' || i, 'Complete another bounded research task', '', 'extra-task-' || i);
  end loop;
  if (select count(*) from public.handoffs where workspace_id = w1) <> 61 then raise exception 'handoff count was capped'; end if;

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
  if has_function_privilege('authenticated', 'public.stoic_ack_board_message(uuid,uuid,uuid,uuid)', 'EXECUTE')
    then raise exception 'authenticated role can acknowledge board directly'; end if;
  if has_function_privilege('authenticated', 'public.relay_create_handoff(uuid,uuid,uuid,uuid,uuid,text,text,text,text)', 'EXECUTE')
    then raise exception 'authenticated role can execute task RPC'; end if;
  if (public.relay_workspace_usage(w1)->>'handoffs')::integer <> 61 then raise exception 'handoff usage mismatch'; end if;
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
  if has_table_privilege('authenticated', 'public.knowledge_notes', 'SELECT')
    or has_table_privilege('authenticated', 'public.knowledge_settings', 'SELECT')
    or has_table_privilege('authenticated', 'public.knowledge_refresh_runs', 'SELECT')
    then raise exception 'authenticated role can read knowledge tables directly'; end if;
  raise notice 'Stoic SQL integration checks passed';
end $$;
