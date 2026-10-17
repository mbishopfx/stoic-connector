\set ON_ERROR_STOP on

do $$
declare
  w1 uuid := '20000000-0000-0000-0000-000000000001';
  p1 uuid := '40000000-0000-0000-0000-000000000001';
  boss uuid := '30000000-0000-0000-0000-000000000001';
  worker uuid := '30000000-0000-0000-0000-000000000002';
  worker2 uuid := '30000000-0000-0000-0000-000000000004';
  queue_handoff jsonb;
  routed_handoff jsonb;
  routed_id uuid;
  root public.board_messages%rowtype;
  repeated public.board_messages%rowtype;
  reply public.board_messages%rowtype;
  late_reply public.board_messages%rowtype;
begin
  update public.agents set status = 'connected' where id = worker;
  update public.workspaces set delegation_level = 'delegate' where id = w1;
  queue_handoff := public.relay_create_team_handoff(
    w1, p1, boss, null, 'Older open team task', 'Confirm live worker eligibility', '', 'fresh-open-queue'
  );
  delete from public.handoff_eligible_agents
    where workspace_id = w1 and handoff_id = (queue_handoff->>'id')::uuid and agent_id = worker;
  if not exists (select 1 from public.relay_agent_handoff_page(w1, worker, null, 0)
      where id = (queue_handoff->>'id')::uuid) then
    raise exception 'stale eligibility snapshot still hid an open team handoff';
  end if;
  perform public.relay_handoff_action((queue_handoff->>'id')::uuid, worker, null, 'claim', '', 'fresh-queue-claim');
  if (select assigned_agent_id from public.handoffs where id = (queue_handoff->>'id')::uuid) <> worker then
    raise exception 'new worker could not claim old team work';
  end if;

  routed_handoff := public.relay_create_handoff(
    w1, p1, worker2, boss, null, 'Routed but still open', 'Prepare an authorized draft', '', 'routed-open-key'
  );
  routed_id := (routed_handoff->>'id')::uuid;
  perform public.relay_handoff_action(routed_id, worker, null, 'claim', '', 'routed-takeover');
  if (select assigned_agent_id from public.handoffs where id = routed_id) <> worker
    or (select status from public.handoffs where id = routed_id) <> 'claimed' then
    raise exception 'open routed handoff did not transfer atomically';
  end if;
  begin
    perform public.relay_handoff_action(routed_id, worker2, null, 'claim', '', 'competing-takeover');
    raise exception 'already claimed handoff was taken by another worker';
  exception when others then
    if sqlerrm <> 'invalid_transition' then raise; end if;
  end;
  perform public.relay_handoff_action(routed_id, worker, null, 'block', 'Missing source input', 'routed-blocked');
  perform public.relay_handoff_action(routed_id, worker2, null, 'claim', '', 'blocked-takeover');
  if (select assigned_agent_id from public.handoffs where id = routed_id) <> worker2
    or (select status from public.handoffs where id = routed_id) <> 'claimed' then
    raise exception 'blocked handoff could not be taken by another worker';
  end if;
  root := public.stoic_start_agent_discussion(
    w1, p1, boss, 'AI visibility ranking strategies for 2027',
    'Compare source-backed tactics and identify owner decisions.', array[boss,worker,worker2], 'discussion-2027-key'
  );
  repeated := public.stoic_start_agent_discussion(
    w1, p1, boss, 'AI visibility ranking strategies for 2027',
    'Compare source-backed tactics and identify owner decisions.', array[boss,worker,worker2], 'discussion-2027-key'
  );
  if root.id <> repeated.id or root.parent_id is not null
    or left(root.body, length('[stoic-agent-discussion:v2]')) <> '[stoic-agent-discussion:v2]' then
    raise exception 'focused discussion kickoff was not a stable root';
  end if;
  reply := public.stoic_post_board_message(
    w1, p1, worker, null, 'message', 'We should compare the source citations first.', root.id, 'discussion-reply-key'
  );
  if not exists (select 1 from public.stoic_discussion_messages_page(w1, worker2, p1, root.id, 0)
      where id = reply.id) then
    raise exception 'invited agent could not read the discussion reply';
  end if;
  if not exists (select 1 from public.stoic_group_discussion_roots_page(w1, worker2, p1, 0)
      where id = root.id) then
    raise exception 'new agent discussion was absent from the group index';
  end if;
  if not exists (select 1 from public.stoic_agent_unread_board_page(w1, worker2, 0)
      where id = reply.id) then
    raise exception 'new discussion reply was absent from the unread feed';
  end if;
  update public.board_messages set created_at = now() - interval '2 days' where id = root.id;
  late_reply := public.stoic_post_board_message(
    w1, p1, worker2, null, 'message', 'I found an additional source to compare.', root.id, 'discussion-late-reply-key'
  );
  if late_reply.id is null then raise exception 'ongoing discussion closed before the next agent pass'; end if;
  perform public.stoic_ack_board_message(w1, worker2, p1, reply.id);
  if exists (select 1 from public.stoic_agent_unread_board_page(w1, worker2, 0)
      where id = reply.id) then
    raise exception 'acknowledged discussion reply stayed unread';
  end if;
end $$;
