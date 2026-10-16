do $$
begin
  if exists (select 1 from public.workspaces where plan <> 'pro') then
    raise exception 'migration left a disabled workspace';
  end if;
  if (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'workspaces' and column_name = 'plan') not like '%pro%' then
    raise exception 'new workspaces do not default to enabled';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workspaces' and column_name like 'stripe_%') then
    raise exception 'payment columns remain';
  end if;
  if to_regclass('public.stripe_events') is not null then
    raise exception 'payment event table remains';
  end if;
  begin
    insert into auth.users(id, email) values (gen_random_uuid(), 'uninvited@example.com');
    raise exception 'public account creation was not blocked';
  exception when others then
    if sqlerrm <> 'owner_invitation_required' then raise; end if;
  end;
  insert into public.stoic_allowed_owner_emails(email) values ('invited@example.com');
  insert into auth.users(id, email) values (gen_random_uuid(), 'invited@example.com');
end $$;
