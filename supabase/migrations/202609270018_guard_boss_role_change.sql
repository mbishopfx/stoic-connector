-- Serialize boss changes with handoff creation so a worker cannot become
-- the reviewer of their own unfinished assignments.
create or replace function public.stoic_set_workspace_policy(
  p_workspace_id uuid,
  p_owner_id uuid,
  p_boss_agent_id uuid,
  p_delegation_level text
) returns public.workspaces
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w public.workspaces%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  select * into w from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'workspace_not_found'; end if;
  if w.owner_id <> p_owner_id then raise exception 'forbidden'; end if;
  if w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  if p_delegation_level not in ('observe', 'propose', 'delegate') then raise exception 'invalid_delegation_level'; end if;
  if p_boss_agent_id is not null then
    if not exists (select 1 from public.agents where id = p_boss_agent_id and workspace_id = w.id and status = 'connected')
      then raise exception 'boss_agent_not_found'; end if;
    if exists (
      select 1 from public.handoffs
      where workspace_id = w.id and assigned_agent_id = p_boss_agent_id
        and status not in ('accepted', 'canceled')
    ) then raise exception 'boss_has_active_handoffs'; end if;
  end if;
  update public.workspaces set boss_agent_id = p_boss_agent_id, delegation_level = p_delegation_level
    where id = w.id returning * into w;
  if p_boss_agent_id is not null then
    update public.projects set default_agent_id = null
      where workspace_id = w.id and default_agent_id = p_boss_agent_id;
  end if;
  insert into public.audit_events(workspace_id, actor_key, action, object_id)
    values (w.id, 'user:' || p_owner_id, 'workspace.policy_updated', w.id);
  return w;
end $$;
revoke all on function public.stoic_set_workspace_policy(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.stoic_set_workspace_policy(uuid,uuid,uuid,text) to service_role;
