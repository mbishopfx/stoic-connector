-- Allow an owner to promote an agent that currently owns open handoffs by
-- atomically moving that work to another connected worker. The legacy four
-- argument RPC remains available for older application versions and keeps
-- its existing safety check.
create or replace function public.stoic_set_workspace_policy(
  p_workspace_id uuid,
  p_owner_id uuid,
  p_boss_agent_id uuid,
  p_delegation_level text,
  p_reassignment_agent_id uuid
) returns public.workspaces
language plpgsql security definer set search_path = '' as $$
declare
  w public.workspaces%rowtype;
  previous_boss_agent_id uuid;
  target_agent_name text;
  reassignment_agent_name text;
  active_handoff_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  select * into w from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'workspace_not_found'; end if;
  previous_boss_agent_id := w.boss_agent_id;
  if w.owner_id <> p_owner_id then raise exception 'forbidden'; end if;
  if w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  if p_delegation_level not in ('observe', 'propose', 'delegate') then raise exception 'invalid_delegation_level'; end if;

  if p_boss_agent_id is not null then
    select name into target_agent_name from public.agents
      where id = p_boss_agent_id and workspace_id = w.id and status = 'connected' and platform <> 'muse'
      for update;
    if not found then raise exception 'boss_agent_not_found'; end if;

    if p_boss_agent_id is distinct from w.boss_agent_id then
      select count(*)::integer into active_handoff_count from public.handoffs
        where workspace_id = w.id and assigned_agent_id = p_boss_agent_id
          and status not in ('accepted', 'canceled');

      if active_handoff_count > 0 then
        if p_reassignment_agent_id is null then raise exception 'boss_has_active_handoffs'; end if;
        if p_reassignment_agent_id = p_boss_agent_id then raise exception 'invalid_reassignment_agent'; end if;

        select name into reassignment_agent_name from public.agents
          where id = p_reassignment_agent_id and workspace_id = w.id
            and status = 'connected' and platform <> 'muse'
          for update;
        if not found then raise exception 'reassignment_agent_not_found'; end if;

        with moved as (
          update public.handoffs set assigned_agent_id = p_reassignment_agent_id, updated_at = now()
          where workspace_id = w.id and assigned_agent_id = p_boss_agent_id
            and status not in ('accepted', 'canceled')
          returning id
        )
        insert into public.task_events (workspace_id, handoff_id, actor_user_id, actor_key, event_type, body)
          select w.id, moved.id, p_owner_id, 'user:' || p_owner_id,
            'reassigned', format('Assignment moved from %s to %s because %s became the team boss.', target_agent_name, reassignment_agent_name, target_agent_name)
          from moved;
        get diagnostics active_handoff_count = row_count;
      end if;
    end if;
  end if;

  update public.workspaces set boss_agent_id = p_boss_agent_id, delegation_level = p_delegation_level
    where id = w.id returning * into w;
  if p_boss_agent_id is not null then
    update public.projects set default_agent_id = null
      where workspace_id = w.id and default_agent_id = p_boss_agent_id;
  end if;
  insert into public.audit_events(workspace_id, actor_key, action, object_id, details)
    values (w.id, 'user:' || p_owner_id, 'workspace.policy_updated', w.id,
      jsonb_build_object('previous_boss_agent_id', previous_boss_agent_id, 'boss_agent_id', p_boss_agent_id, 'reassigned_handoffs', active_handoff_count));
  return w;
end $$;
revoke all on function public.stoic_set_workspace_policy(uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.stoic_set_workspace_policy(uuid,uuid,uuid,text,uuid) to service_role;
