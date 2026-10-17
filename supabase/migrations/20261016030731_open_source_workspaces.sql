-- Historical RPCs use the legacy 'pro' value as an enabled-workspace marker.
-- Every self-hosted workspace is enabled, with no subscription or payment record.
update public.workspaces set plan = 'pro' where plan <> 'pro';
alter table public.workspaces alter column plan set default 'pro';
alter table public.workspaces drop constraint if exists workspaces_plan_check;
alter table public.workspaces add constraint workspaces_plan_enabled_check check (plan = 'pro');

alter table public.workspaces drop column if exists stripe_customer_id;
alter table public.workspaces drop column if exists stripe_subscription_id;
drop table if exists public.stripe_events;

-- The public Auth API cannot create arbitrary workspace owners. Operators add
-- an email to this private allowlist before creating an owner in Supabase Auth.
create table public.stoic_allowed_owner_emails (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);
alter table public.stoic_allowed_owner_emails enable row level security;
revoke all on public.stoic_allowed_owner_emails from public, anon, authenticated;
grant select, insert, delete on public.stoic_allowed_owner_emails to service_role;
insert into public.stoic_allowed_owner_emails(email)
  select distinct lower(trim(email)) from auth.users where email is not null and trim(email) <> ''
  on conflict do nothing;

create function public.stoic_require_owner_invitation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.email is null or not exists (
    select 1 from public.stoic_allowed_owner_emails where email = lower(trim(new.email))
  ) then
    raise exception 'owner_invitation_required';
  end if;
  return new;
end $$;
revoke all on function public.stoic_require_owner_invitation() from public, anon, authenticated;
create trigger stoic_require_owner_invitation_before_signup
  before insert on auth.users for each row execute function public.stoic_require_owner_invitation();
