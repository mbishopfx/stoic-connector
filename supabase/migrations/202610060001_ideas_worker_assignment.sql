create or replace function public.stoic_assign_idea(
  p_workspace_id uuid,
  p_owner_id uuid,
  p_idea_id uuid,
  p_agent_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  workspace_row public.workspaces%rowtype;
  idea_row public.ideas%rowtype;
  handoff_json jsonb;
  goal_text text;
  constraint_text text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  select * into workspace_row from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = p_owner_id for update;
  if not found then raise exception 'forbidden'; end if;
  if workspace_row.plan <> 'pro' then raise exception 'subscription_required'; end if;
  if workspace_row.delegation_level = 'observe' then raise exception 'forbidden'; end if;

  select * into idea_row from public.ideas i
    where i.workspace_id = p_workspace_id and i.id = p_idea_id for update;
  if not found then raise exception 'idea_not_found'; end if;
  if idea_row.status = 'accepted' then
    select to_jsonb(h) into handoff_json from public.handoffs h
      where h.workspace_id = p_workspace_id and h.id = idea_row.accepted_handoff_id;
    return jsonb_build_object('idea', to_jsonb(idea_row), 'handoff', handoff_json, 'alreadyAssigned', true);
  end if;
  if idea_row.status <> 'pending' then raise exception 'idea_not_pending'; end if;
  perform p.id from public.projects p
    where p.workspace_id = p_workspace_id and p.id = idea_row.project_id and p.archived_at is null for share;
  if not found then raise exception 'project_not_found'; end if;
  perform a.id from public.agents a
    where a.workspace_id = p_workspace_id and a.id = p_agent_id and a.status = 'connected'
      and a.id is distinct from workspace_row.boss_agent_id and a.platform <> 'muse' for share;
  if not found then raise exception 'worker_not_eligible'; end if;

  goal_text := left(idea_row.summary || E'\n\nWhy now: ' || idea_row.why_now || E'\n\nNext step: ' || idea_row.next_step, 10000);
  constraint_text := left('Owner assigned this idea to the selected worker. Evidence IDs: ' || array_to_string(idea_row.evidence_ids, ', ') ||
    '. Keep external actions, outreach, publishing, spending, and deletion behind explicit owner approval. A worker receives this handoff on its next successful inbox check; Stoic does not wake offline agents.', 10000);
  handoff_json := public.relay_create_handoff(
    p_workspace_id, idea_row.project_id, p_agent_id, null, p_owner_id, idea_row.title, goal_text, constraint_text,
    'stoic-idea-' || idea_row.id::text
  );
  update public.ideas set status = 'accepted', accepted_handoff_id = (handoff_json->>'id')::uuid,
    accepted_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and id = p_idea_id returning * into idea_row;
  insert into public.audit_events(workspace_id, actor_key, action, object_id, details)
    values (p_workspace_id, 'user:' || p_owner_id, 'idea.assigned', p_idea_id,
      jsonb_build_object('agentId', p_agent_id, 'handoffId', handoff_json->>'id'));
  return jsonb_build_object('idea', to_jsonb(idea_row), 'handoff', handoff_json, 'alreadyAssigned', false);
end $$;
revoke all on function public.stoic_assign_idea(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.stoic_assign_idea(uuid, uuid, uuid, uuid) to service_role;
