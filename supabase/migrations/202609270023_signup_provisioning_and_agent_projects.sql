-- Use one shared schema and private Storage bucket. Each account owns a workspace,
-- and every product row and artifact path is scoped by that workspace ID.

create or replace function public.stoic_provision_workspace(p_owner_id uuid, p_name text default 'My Workspace')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  workspace_name text;
begin
  if p_owner_id is null then raise exception 'owner_required'; end if;
  workspace_name := left(coalesce(nullif(trim(p_name), ''), 'My Workspace'), 80);
  if char_length(workspace_name) < 2 then workspace_name := 'My Workspace'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 11));
  insert into public.workspaces(owner_id, name)
    values (p_owner_id, workspace_name)
    on conflict (owner_id) do nothing;
  select id into v_workspace_id from public.workspaces where owner_id = p_owner_id;
  if v_workspace_id is null then raise exception 'workspace_provision_failed'; end if;

  insert into public.projects(workspace_id, name)
    select v_workspace_id, 'First project'
    where not exists (select 1 from public.projects where projects.workspace_id = v_workspace_id);
  return v_workspace_id;
end
$$;
revoke all on function public.stoic_provision_workspace(uuid, text) from public, anon, authenticated;
grant execute on function public.stoic_provision_workspace(uuid, text) to service_role;

create or replace function public.stoic_provision_signup_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.stoic_provision_workspace(
    new.id,
    coalesce(new.raw_user_meta_data ->> 'workspace_name', 'My Workspace')
  );
  return new;
end
$$;
revoke all on function public.stoic_provision_signup_workspace() from public, anon, authenticated;

drop trigger if exists stoic_provision_workspace_after_signup on auth.users;
create trigger stoic_provision_workspace_after_signup
  after insert on auth.users
  for each row execute function public.stoic_provision_signup_workspace();

alter table public.projects
  add column if not exists created_by_agent_id uuid references public.agents(id),
  add column if not exists idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 128);
create unique index if not exists projects_agent_idempotency
  on public.projects(workspace_id, created_by_agent_id, idempotency_key)
  where created_by_agent_id is not null and idempotency_key is not null;

create or replace function public.stoic_create_agent_project(
  p_workspace_id uuid,
  p_agent_id uuid,
  p_name text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w public.workspaces%rowtype;
  project_row public.projects%rowtype;
begin
  select * into w from public.workspaces where id = p_workspace_id;
  if not found then raise exception 'workspace_not_found'; end if;
  if w.plan <> 'pro' then raise exception 'subscription_required'; end if;
  if w.delegation_level = 'observe' then raise exception 'forbidden'; end if;
  if p_agent_id is null or p_agent_id <> w.boss_agent_id or not exists (
    select 1 from public.agents where id = p_agent_id and workspace_id = w.id and status = 'connected'
  ) then raise exception 'forbidden'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 100 then raise exception 'invalid_project_name'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 128 then raise exception 'invalid_idempotency_key'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 12));
  select * into project_row from public.projects
    where workspace_id = w.id and created_by_agent_id = p_agent_id and idempotency_key = p_idempotency_key;
  if found then return to_jsonb(project_row); end if;

  insert into public.projects(workspace_id, name, created_by_agent_id, idempotency_key)
    values (w.id, trim(p_name), p_agent_id, p_idempotency_key)
    returning * into project_row;
  insert into public.audit_events(workspace_id, actor_key, action, object_id)
    values (w.id, 'agent:' || p_agent_id, 'project.created', project_row.id);
  return to_jsonb(project_row);
end
$$;
revoke all on function public.stoic_create_agent_project(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.stoic_create_agent_project(uuid, uuid, text, text) to service_role;
