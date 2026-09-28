-- Make simultaneous retries return the original message.
create or replace function public.stoic_post_board_message(
  p_workspace_id uuid, p_project_id uuid, p_actor_agent_id uuid, p_actor_user_id uuid,
  p_kind text, p_body text, p_parent_id uuid, p_idempotency_key text
) returns public.board_messages language plpgsql security definer set search_path = public as $$
declare w public.workspaces%rowtype; result public.board_messages%rowtype; actor text;
begin
  select * into w from public.workspaces where id = p_workspace_id for share;
  if not found or w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  if (p_actor_agent_id is null) = (p_actor_user_id is null) then raise exception 'forbidden'; end if;
  if p_actor_agent_id is not null then
    if not exists (select 1 from public.agents where id = p_actor_agent_id and workspace_id = w.id and status = 'connected') then raise exception 'forbidden'; end if;
    actor := 'agent:' || p_actor_agent_id;
  else
    if p_actor_user_id <> w.owner_id then raise exception 'forbidden'; end if;
    actor := 'user:' || p_actor_user_id;
  end if;
  if p_kind not in ('message','run_report','suggestion') or char_length(p_body) not between 1 and 12000 or char_length(p_idempotency_key) not between 8 and 128 then raise exception 'invalid_message'; end if;
  if p_kind = 'suggestion' and p_actor_agent_id is not null then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.projects where workspace_id = w.id and id = p_project_id and archived_at is null) then raise exception 'project_not_found'; end if;
  if p_parent_id is not null and not exists (select 1 from public.board_messages where workspace_id = w.id and project_id = p_project_id and id = p_parent_id) then raise exception 'parent_not_found'; end if;
  select * into result from public.board_messages where workspace_id = w.id and author_key = actor and idempotency_key = p_idempotency_key;
  if found then
    if result.project_id <> p_project_id or result.kind <> p_kind or result.body <> p_body or result.parent_id is distinct from p_parent_id then raise exception 'idempotency_conflict'; end if;
    return result;
  end if;
  insert into public.board_messages(workspace_id,project_id,parent_id,author_agent_id,author_user_id,author_key,kind,body,idempotency_key)
    values(w.id,p_project_id,p_parent_id,p_actor_agent_id,p_actor_user_id,actor,p_kind,p_body,p_idempotency_key)
    on conflict (workspace_id,author_key,idempotency_key) do nothing returning * into result;
  if not found then
    select * into result from public.board_messages where workspace_id = w.id and author_key = actor and idempotency_key = p_idempotency_key;
    if result.project_id <> p_project_id or result.kind <> p_kind or result.body <> p_body or result.parent_id is distinct from p_parent_id then raise exception 'idempotency_conflict'; end if;
    return result;
  end if;
  insert into public.audit_events(workspace_id,actor_key,action,object_id) values(w.id,actor,'board.' || p_kind,result.id);
  return result;
end $$;
revoke all on function public.stoic_post_board_message(uuid,uuid,uuid,uuid,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.stoic_post_board_message(uuid,uuid,uuid,uuid,text,text,uuid,text) to service_role;
