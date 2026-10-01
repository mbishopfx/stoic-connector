-- Limit MCP-resource audiences to an explicitly enabled Supabase OAuth client.
-- Keep this application-specific schema out of the Supabase Data API surface.
create schema stoic_private;

revoke all on schema stoic_private from public, anon, authenticated, service_role;
grant usage on schema stoic_private to supabase_auth_admin;

create table stoic_private.mcp_oauth_clients (
  client_id text primary key check (length(btrim(client_id)) between 1 and 255),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table stoic_private.mcp_oauth_clients enable row level security;

create policy mcp_oauth_clients_auth_hook_read
  on stoic_private.mcp_oauth_clients
  for select
  to supabase_auth_admin
  using (enabled);

revoke all on table stoic_private.mcp_oauth_clients from public, anon, authenticated, service_role;
grant select on table stoic_private.mcp_oauth_clients to supabase_auth_admin;

create function stoic_private.custom_access_token_hook(p_event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_client_id text;
begin
  v_client_id := p_event #>> '{claims,client_id}';
  if v_client_id is null then
    return p_event;
  end if;

  if exists (
    select 1
    from stoic_private.mcp_oauth_clients as oauth_client
    where oauth_client.client_id = v_client_id
      and oauth_client.enabled
  ) then
    return jsonb_set(
      p_event,
      '{claims,aud}',
      to_jsonb('https://stoic.bishoptech.dev/api/mcp'::text),
      true
    );
  end if;

  return p_event;
end;
$function$;

comment on function stoic_private.custom_access_token_hook(jsonb) is
  'Sets Stoic MCP audience only for explicitly enabled OAuth client IDs; leaves all other Auth events unchanged.';

revoke all on function stoic_private.custom_access_token_hook(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function stoic_private.custom_access_token_hook(jsonb)
  to supabase_auth_admin;
