-- Select due paid projects across the whole database, oldest synthesis first.
-- The unique project/day key in synthesis_runs remains the claim barrier.
create or replace function public.stoic_next_synthesis_projects(p_date date, p_limit integer default 4)
returns table(id uuid, workspace_id uuid, name text, brief text)
language sql security definer set search_path = public as $$
  select p.id, p.workspace_id, p.name, p.brief
  from public.projects p
  join public.workspaces w on w.id = p.workspace_id and w.plan = 'pro'
  left join lateral (
    select max(s.run_date) as last_run
    from public.synthesis_runs s where s.project_id = p.id
  ) recent on true
  where p.archived_at is null and (recent.last_run is null or recent.last_run < p_date)
  order by recent.last_run asc nulls first, p.created_at asc, p.id asc
  limit least(greatest(p_limit, 1), 4);
$$;
revoke all on function public.stoic_next_synthesis_projects(date,integer) from public, anon, authenticated;
grant execute on function public.stoic_next_synthesis_projects(date,integer) to service_role;
