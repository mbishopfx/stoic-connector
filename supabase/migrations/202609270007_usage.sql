create or replace function public.relay_workspace_usage(p_workspace_id uuid)
returns jsonb language sql security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'handoffs', (
      select count(*) from public.handoffs
      where workspace_id = p_workspace_id and created_at >= date_trunc('month', now())
    ),
    'storageBytes', (
      select coalesce(sum(size_bytes), 0) from public.artifacts
      where workspace_id = p_workspace_id and (status = 'ready' or (status = 'pending' and expires_at > now()))
    )
  )
$$;
revoke all on function public.relay_workspace_usage(uuid) from public, anon, authenticated;
grant execute on function public.relay_workspace_usage(uuid) to service_role;
