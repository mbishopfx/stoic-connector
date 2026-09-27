\set ON_ERROR_STOP on

insert into auth.users(id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');
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
  boss uuid := '30000000-0000-0000-0000-000000000001';
  worker uuid := '30000000-0000-0000-0000-000000000002';
  other_boss uuid := '30000000-0000-0000-0000-000000000003';
  h jsonb;
  again jsonb;
  a jsonb;
  i integer;
begin
  h := public.relay_create_handoff(w1, p1, worker, boss, null, 'Research market', 'Find three concrete market examples', '', 'first-task-key');
  again := public.relay_create_handoff(w1, p1, worker, boss, null, 'Research market', 'Find three concrete market examples', '', 'first-task-key');
  if h->>'id' <> again->>'id' then raise exception 'handoff retry created a duplicate'; end if;
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
  if (select count(*) from public.task_events where handoff_id = (h->>'id')::uuid and event_type = 'claim') <> 1
    then raise exception 'action retry created duplicate event'; end if;
  a := public.relay_request_approval((h->>'id')::uuid, worker, 'Publish the final report to a public site', 'approval-key-one');
  again := public.relay_request_approval((h->>'id')::uuid, worker, 'Publish the final report to a public site', 'approval-key-one');
  if a->>'id' <> again->>'id' then raise exception 'approval retry created a duplicate'; end if;
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

  for i in 1..49 loop
    perform public.relay_create_handoff(w1, p1, worker, boss, null, 'Additional task ' || i, 'Complete another bounded research task', '', 'extra-task-' || i);
  end loop;
  begin
    perform public.relay_create_handoff(w1, p1, worker, boss, null, 'Over quota task', 'This would exceed the monthly handoff quota', '', 'over-quota-key');
    raise exception 'handoff quota was bypassed';
  exception when others then
    if sqlerrm <> 'handoff_quota_reached' then raise; end if;
  end;

  for i in 1..4 loop
    perform public.relay_reserve_artifact(w1, p1, null, boss, null, 'file' || i || '.pdf', 'application/pdf', 26214400);
  end loop;
  begin
    perform public.relay_reserve_artifact(w1, p1, null, boss, null, 'extra.pdf', 'application/pdf', 1);
    raise exception 'storage quota was bypassed';
  exception when others then
    if sqlerrm <> 'storage_quota_reached' then raise; end if;
  end;
  begin
    perform public.relay_reserve_artifact(w2, p1, null, other_boss, null, 'foreign.pdf', 'application/pdf', 1);
    raise exception 'cross-workspace file reservation succeeded';
  exception when others then
    if sqlerrm <> 'project_not_found' then raise; end if;
  end;

  update public.agents set status = 'revoked' where id = worker;
  begin
    perform public.relay_handoff_action((h->>'id')::uuid, worker, null, 'update', 'Should be denied', 'revoked-key');
    raise exception 'revoked agent acted';
  exception when others then
    if sqlerrm <> 'forbidden' then raise; end if;
  end;
  if has_table_privilege('authenticated', 'public.handoffs', 'SELECT')
    then raise exception 'authenticated role can read handoff table'; end if;
  if has_function_privilege('authenticated', 'public.relay_create_handoff(uuid,uuid,uuid,uuid,uuid,text,text,text,text)', 'EXECUTE')
    then raise exception 'authenticated role can execute task RPC'; end if;
  if (public.relay_workspace_usage(w1)->>'handoffs')::integer <> 50 then raise exception 'handoff usage mismatch'; end if;
  if (public.relay_workspace_usage(w1)->>'storageBytes')::bigint <> 104857600 then raise exception 'storage usage mismatch'; end if;
  if not public.relay_rate_limit('test-agent', 1) then raise exception 'first rate-limited request failed'; end if;
  if public.relay_rate_limit('test-agent', 1) then raise exception 'rate limit was bypassed'; end if;
  raise notice 'Relay SQL integration checks passed';
end $$;
