create table public.rate_counters (
  actor_hash text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (actor_hash, window_start)
);
alter table public.rate_counters enable row level security;
revoke all on public.rate_counters from anon, authenticated;
grant all on public.rate_counters to service_role;

create or replace function public.relay_rate_limit(p_actor_hash text, p_limit integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare current_hits integer;
begin
  insert into public.rate_counters(actor_hash, window_start, hits)
    values (p_actor_hash, date_trunc('minute', now()), 1)
    on conflict (actor_hash, window_start) do update set hits = public.rate_counters.hits + 1
    returning hits into current_hits;
  return current_hits <= p_limit;
end $$;
revoke all on function public.relay_rate_limit(text,integer) from public, anon, authenticated;
grant execute on function public.relay_rate_limit(text,integer) to service_role;
