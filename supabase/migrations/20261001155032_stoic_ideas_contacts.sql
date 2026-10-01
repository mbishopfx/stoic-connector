-- Persistent, workspace-scoped daily ideas and a compact contact CRM.
-- Product access remains server-mediated; only service_role can read or write
-- these tables or invoke the mutation functions below.

alter table public.workspaces
  add column ideas_timezone text;

create unique index if not exists artifacts_workspace_id_id
  on public.artifacts(workspace_id, id);

create table public.idea_generation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  local_date date not null,
  timezone text not null default 'UTC',
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  input_fingerprint text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, local_date)
);
create index idea_generation_runs_due
  on public.idea_generation_runs(workspace_id, local_date, status, started_at desc);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  run_id uuid not null,
  title text not null check (char_length(title) between 3 and 160),
  summary text not null check (char_length(summary) between 10 and 4000),
  why_now text not null check (char_length(why_now) between 5 and 2000),
  next_step text not null check (char_length(next_step) between 5 and 2000),
  evidence_ids text[] not null check (cardinality(evidence_ids) between 1 and 8),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'archived')),
  accepted_handoff_id uuid,
  accepted_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id) on delete cascade,
  foreign key (workspace_id, run_id) references public.idea_generation_runs(workspace_id, id) on delete cascade,
  foreign key (workspace_id, accepted_handoff_id) references public.handoffs(workspace_id, id),
  check ((status = 'accepted') = (accepted_handoff_id is not null)),
  check ((status = 'archived') = (archived_at is not null))
);
create index ideas_workspace_status_created
  on public.ideas(workspace_id, status, created_at desc);
create index ideas_project_created
  on public.ideas(workspace_id, project_id, created_at desc);
create unique index ideas_one_handoff
  on public.ideas(workspace_id, accepted_handoff_id)
  where accepted_handoff_id is not null;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  full_name text not null check (char_length(full_name) between 2 and 160),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 60),
  company text check (company is null or char_length(company) <= 160),
  job_title text check (job_title is null or char_length(job_title) <= 160),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'customer', 'archived')),
  notes text not null default '' check (char_length(notes) <= 10000),
  dedupe_key text not null check (char_length(dedupe_key) between 3 and 400),
  created_by_agent_id uuid,
  created_by_user_id uuid references auth.users(id),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(full_name, '') || ' ' || coalesce(email, '') || ' ' ||
      coalesce(phone, '') || ' ' || coalesce(company, '') || ' ' ||
      coalesce(job_title, '') || ' ' || coalesce(notes, ''))
  ) stored,
  unique (workspace_id, id),
  unique (workspace_id, dedupe_key),
  foreign key (workspace_id, project_id) references public.projects(workspace_id, id),
  foreign key (workspace_id, created_by_agent_id) references public.agents(workspace_id, id),
  check ((created_by_agent_id is null) <> (created_by_user_id is null))
);
create index contacts_workspace_created on public.contacts(workspace_id, created_at desc);
create index contacts_workspace_status on public.contacts(workspace_id, status, updated_at desc);
create index contacts_search on public.contacts using gin(search_document);

create table public.contact_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null,
  source_key text not null check (char_length(source_key) between 8 and 240),
  source_label text not null check (char_length(source_label) between 2 and 180),
  source_url text check (source_url is null or char_length(source_url) <= 2000),
  notes text not null default '' check (char_length(notes) <= 5000),
  artifact_id uuid,
  created_by_agent_id uuid,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, contact_id) references public.contacts(workspace_id, id) on delete cascade,
  foreign key (workspace_id, artifact_id) references public.artifacts(workspace_id, id),
  foreign key (workspace_id, created_by_agent_id) references public.agents(workspace_id, id),
  unique (workspace_id, source_key),
  check ((created_by_agent_id is null) <> (created_by_user_id is null))
);
create index contact_sources_contact on public.contact_sources(workspace_id, contact_id, created_at desc);

create table public.contact_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  actor_key text not null,
  artifact_id uuid,
  file_name text not null check (char_length(file_name) between 1 and 180),
  content_fingerprint text not null check (char_length(content_fingerprint) = 64),
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  last_error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, artifact_id) references public.artifacts(workspace_id, id)
);
create index contact_imports_workspace_started on public.contact_imports(workspace_id, started_at desc);

alter table public.idea_generation_runs enable row level security;
alter table public.ideas enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_sources enable row level security;
alter table public.contact_imports enable row level security;
revoke all on table public.idea_generation_runs, public.ideas, public.contacts, public.contact_sources, public.contact_imports from public, anon, authenticated;
grant all on table public.idea_generation_runs, public.ideas, public.contacts, public.contact_sources, public.contact_imports to service_role;

comment on table public.idea_generation_runs is 'One idempotent morning idea-generation run per workspace-local calendar day.';
comment on table public.ideas is 'Append-only daily suggestions; owners can accept one into a handoff or archive it.';
comment on table public.contacts is 'Workspace-private contact records. All access is mediated by the Stoic application and agent identity.';
comment on table public.contact_sources is 'Append-only provenance trail for contacts and CSV imports.';

create or replace function public.stoic_claim_due_idea_runs(p_now timestamptz default now(), p_limit integer default 4)
returns table (run_id uuid, workspace_id uuid, local_date date, timezone text)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  candidate record;
  local_time timestamp;
  local_day date;
  existing public.idea_generation_runs%rowtype;
begin
  if p_limit < 1 or p_limit > 20 then raise exception 'invalid_limit'; end if;
  for candidate in
    select w.id, coalesce(nullif(w.ideas_timezone, ''), 'UTC') as tz, w.created_at
      from public.workspaces w
      where w.plan = 'pro'
        and exists (select 1 from public.projects p where p.workspace_id = w.id and p.archived_at is null)
        and extract(hour from (p_now at time zone coalesce(nullif(w.ideas_timezone, ''), 'UTC'))) >= 8
        and not exists (
          select 1 from public.idea_generation_runs r
          where r.workspace_id = w.id
            and r.local_date = (p_now at time zone coalesce(nullif(w.ideas_timezone, ''), 'UTC'))::date
            and r.status = 'completed'
        )
        and not exists (
          select 1 from public.idea_generation_runs r
          where r.workspace_id = w.id
            and r.local_date = (p_now at time zone coalesce(nullif(w.ideas_timezone, ''), 'UTC'))::date
            and r.status = 'running'
            and r.started_at > p_now - interval '20 minutes'
        )
      order by w.created_at, w.id
      limit p_limit
      for update of w skip locked
  loop
    local_time := p_now at time zone candidate.tz;
    local_day := local_time::date;
    if local_time::time < time '08:00' then continue; end if;
    perform pg_advisory_xact_lock(hashtextextended(candidate.id::text || ':' || local_day::text, 731));
    select * into existing from public.idea_generation_runs r
      where r.workspace_id = candidate.id and r.local_date = local_day for update;
    if found then
      if existing.status = 'completed' then continue; end if;
      if existing.status = 'running' and existing.started_at > p_now - interval '20 minutes' then continue; end if;
      update public.idea_generation_runs r
        set status = 'running', timezone = candidate.tz, attempt_count = r.attempt_count + 1,
            started_at = p_now, completed_at = null, last_error = null
        where r.id = existing.id returning r.* into existing;
    else
      insert into public.idea_generation_runs(workspace_id, local_date, timezone, started_at)
        values (candidate.id, local_day, candidate.tz, p_now)
        returning * into existing;
    end if;
    run_id := existing.id;
    workspace_id := candidate.id;
    local_date := local_day;
    timezone := candidate.tz;
    return next;
  end loop;
end $$;
revoke all on function public.stoic_claim_due_idea_runs(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.stoic_claim_due_idea_runs(timestamptz, integer) to service_role;

create or replace function public.stoic_complete_idea_run(p_workspace_id uuid, p_run_id uuid, p_ideas jsonb)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  run_row public.idea_generation_runs%rowtype;
  item jsonb;
  project_id uuid;
  title text;
  idea_count integer := 0;
begin
  if jsonb_typeof(p_ideas) <> 'array' or jsonb_array_length(p_ideas) <> 3 then
    raise exception 'exactly_three_ideas_required';
  end if;
  select * into run_row from public.idea_generation_runs r
    where r.workspace_id = p_workspace_id and r.id = p_run_id for update;
  if not found then raise exception 'idea_run_not_found'; end if;
  if run_row.status = 'completed' then
    return jsonb_build_object('runId', run_row.id, 'status', run_row.status,
      'ideas', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at, i.id)
        from public.ideas i where i.workspace_id = p_workspace_id and i.run_id = p_run_id), '[]'::jsonb));
  end if;
  if run_row.status <> 'running' then raise exception 'idea_run_not_claimed'; end if;
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.plan = 'pro') then
    raise exception 'subscription_required';
  end if;

  for item in select value from jsonb_array_elements(p_ideas) loop
    begin project_id := (item->>'projectId')::uuid; exception when others then raise exception 'invalid_idea_project'; end;
    title := trim(coalesce(item->>'title', ''));
    if char_length(title) not between 3 and 160
      or char_length(trim(coalesce(item->>'summary', ''))) not between 10 and 4000
      or char_length(trim(coalesce(item->>'whyNow', ''))) not between 5 and 2000
      or char_length(trim(coalesce(item->>'nextStep', ''))) not between 5 and 2000
      or jsonb_typeof(item->'evidenceIds') is distinct from 'array'
      or jsonb_array_length(item->'evidenceIds') < 1
      or jsonb_array_length(item->'evidenceIds') > 8 then
      raise exception 'invalid_idea_content';
    end if;
    if not exists (select 1 from public.projects p where p.workspace_id = p_workspace_id and p.id = project_id and p.archived_at is null) then
      raise exception 'idea_project_not_found';
    end if;
    insert into public.ideas(workspace_id, project_id, run_id, title, summary, why_now, next_step, evidence_ids)
      values (p_workspace_id, project_id, p_run_id, title, trim(item->>'summary'), trim(item->>'whyNow'), trim(item->>'nextStep'),
        array(select jsonb_array_elements_text(item->'evidenceIds')));
    idea_count := idea_count + 1;
  end loop;

  if idea_count <> 3 then raise exception 'exactly_three_ideas_required'; end if;
  update public.idea_generation_runs set status = 'completed', completed_at = now(), last_error = null
    where workspace_id = p_workspace_id and id = p_run_id;
  return jsonb_build_object('runId', p_run_id, 'status', 'completed',
    'ideas', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at, i.id)
      from public.ideas i where i.workspace_id = p_workspace_id and i.run_id = p_run_id), '[]'::jsonb));
end $$;
revoke all on function public.stoic_complete_idea_run(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stoic_complete_idea_run(uuid, uuid, jsonb) to service_role;

create or replace function public.stoic_accept_idea(p_workspace_id uuid, p_owner_id uuid, p_idea_id uuid)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  workspace_row public.workspaces%rowtype;
  idea_row public.ideas%rowtype;
  handoff_json jsonb;
  goal_text text;
  constraint_text text;
begin
  select * into workspace_row from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = p_owner_id for update;
  if not found then raise exception 'forbidden'; end if;
  if workspace_row.plan <> 'pro' then raise exception 'subscription_required'; end if;
  select * into idea_row from public.ideas i
    where i.workspace_id = p_workspace_id and i.id = p_idea_id for update;
  if not found then raise exception 'idea_not_found'; end if;
  if idea_row.status = 'accepted' then
    select to_jsonb(h) into handoff_json from public.handoffs h
      where h.workspace_id = p_workspace_id and h.id = idea_row.accepted_handoff_id;
    return jsonb_build_object('idea', to_jsonb(idea_row), 'handoff', handoff_json, 'alreadyAccepted', true);
  end if;
  if idea_row.status <> 'pending' then raise exception 'idea_not_pending'; end if;
  goal_text := left(idea_row.summary || E'\n\nWhy now: ' || idea_row.why_now || E'\n\nNext step: ' || idea_row.next_step, 10000);
  constraint_text := left('Owner accepted this idea. Evidence IDs: ' || array_to_string(idea_row.evidence_ids, ', ') ||
    '. Keep external actions, outreach, publishing, spending, and deletion behind explicit owner approval. A worker receives this handoff on its next successful inbox check; Stoic does not wake offline agents.', 10000);
  handoff_json := public.relay_create_team_handoff(
    p_workspace_id, idea_row.project_id, null, p_owner_id, idea_row.title, goal_text, constraint_text,
    'stoic-idea-' || idea_row.id::text
  );
  update public.ideas set status = 'accepted', accepted_handoff_id = (handoff_json->>'id')::uuid,
    accepted_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and id = p_idea_id returning * into idea_row;
  return jsonb_build_object('idea', to_jsonb(idea_row), 'handoff', handoff_json, 'alreadyAccepted', false);
end $$;
revoke all on function public.stoic_accept_idea(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.stoic_accept_idea(uuid, uuid, uuid) to service_role;

create or replace function public.stoic_archive_idea(p_workspace_id uuid, p_owner_id uuid, p_idea_id uuid)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  archived public.ideas%rowtype;
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = p_owner_id and w.plan = 'pro') then
    raise exception 'forbidden';
  end if;
  update public.ideas set status = 'archived', archived_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and id = p_idea_id and status = 'pending'
    returning * into archived;
  if not found then
    select * into archived from public.ideas where workspace_id = p_workspace_id and id = p_idea_id;
    if not found then raise exception 'idea_not_found'; end if;
    if archived.status = 'archived' then return to_jsonb(archived); end if;
    raise exception 'accepted_idea_cannot_be_archived';
  end if;
  return to_jsonb(archived);
end $$;
revoke all on function public.stoic_archive_idea(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.stoic_archive_idea(uuid, uuid, uuid) to service_role;

create or replace function public.stoic_upsert_contacts(
  p_workspace_id uuid,
  p_actor_agent_id uuid,
  p_actor_user_id uuid,
  p_project_id uuid,
  p_artifact_id uuid,
  p_contacts jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  workspace_row public.workspaces%rowtype;
  item jsonb;
  contact_id uuid;
  existing_contact_id uuid;
  v_full_name text;
  v_email text;
  v_phone text;
  v_company text;
  v_title text;
  v_notes text;
  v_source_label text;
  v_source_url text;
  v_source_key text;
  v_dedupe_key text;
  created_count integer := 0;
  updated_count integer := 0;
  skipped_count integer := 0;
begin
  if (p_actor_agent_id is null) = (p_actor_user_id is null) then raise exception 'invalid_actor'; end if;
  if jsonb_typeof(p_contacts) <> 'array' or jsonb_array_length(p_contacts) > 250 then raise exception 'invalid_contact_batch'; end if;
  select * into workspace_row from public.workspaces w where w.id = p_workspace_id;
  if not found then raise exception 'workspace_not_found'; end if;
  if workspace_row.plan <> 'pro' then raise exception 'subscription_required'; end if;
  if p_actor_user_id is not null and workspace_row.owner_id <> p_actor_user_id then raise exception 'forbidden'; end if;
  if p_actor_agent_id is not null and not exists (
    select 1 from public.agents a where a.workspace_id = p_workspace_id and a.id = p_actor_agent_id and a.status = 'connected'
  ) then raise exception 'forbidden'; end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects p where p.workspace_id = p_workspace_id and p.id = p_project_id and p.archived_at is null
  ) then raise exception 'project_not_found'; end if;
  if p_artifact_id is not null and not exists (
    select 1 from public.artifacts a where a.workspace_id = p_workspace_id and a.id = p_artifact_id and a.status = 'ready'
  ) then raise exception 'artifact_not_found'; end if;

  for item in select value from jsonb_array_elements(p_contacts) loop
    v_full_name := left(trim(coalesce(item->>'full_name', '')), 160);
    v_email := nullif(left(trim(coalesce(item->>'email', '')), 254), '');
    v_phone := nullif(left(trim(coalesce(item->>'phone', '')), 60), '');
    v_company := nullif(left(trim(coalesce(item->>'company', '')), 160), '');
    v_title := nullif(left(trim(coalesce(item->>'job_title', '')), 160), '');
    v_notes := left(trim(coalesce(item->>'notes', '')), 5000);
    v_source_label := left(trim(coalesce(item->>'source_label', '')), 180);
    v_source_url := nullif(left(trim(coalesce(item->>'source_url', '')), 2000), '');
    v_source_key := trim(coalesce(item->>'source_key', ''));
    if char_length(v_full_name) < 2 or char_length(v_source_key) not between 8 and 240
      or char_length(v_source_label) < 2 then
      skipped_count := skipped_count + 1;
      continue;
    end if;
    if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      v_email := null;
    end if;
    if v_source_url is not null and v_source_url !~* '^https?://' then v_source_url := null; end if;
    if v_email is not null then
      v_dedupe_key := 'email:' || lower(v_email);
    elsif v_phone is not null and char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) >= 7 then
      v_dedupe_key := 'phone:' || regexp_replace(v_phone, '[^0-9]', '', 'g');
    else
      v_dedupe_key := 'name_company:' || lower(regexp_replace(v_full_name || '|' || coalesce(v_company, ''), '[^[:alnum:]]+', '', 'g'));
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':source:' || v_source_key, 741));
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':contact:' || v_dedupe_key, 742));
    if exists (select 1 from public.contact_sources s where s.workspace_id = p_workspace_id and s.source_key = v_source_key) then
      skipped_count := skipped_count + 1;
      continue;
    end if;
    select c.id into existing_contact_id from public.contacts c
      where c.workspace_id = p_workspace_id and c.dedupe_key = v_dedupe_key for update;
    if existing_contact_id is null then
      insert into public.contacts(workspace_id, project_id, full_name, email, phone, company, job_title, notes,
        dedupe_key, created_by_agent_id, created_by_user_id)
      values (p_workspace_id, p_project_id, v_full_name, v_email, v_phone, v_company, v_title, v_notes,
        v_dedupe_key, p_actor_agent_id, p_actor_user_id)
      on conflict (workspace_id, dedupe_key) do update set
        project_id = coalesce(public.contacts.project_id, excluded.project_id),
        full_name = excluded.full_name,
        email = coalesce(excluded.email, public.contacts.email),
        phone = coalesce(excluded.phone, public.contacts.phone),
        company = coalesce(excluded.company, public.contacts.company),
        job_title = coalesce(excluded.job_title, public.contacts.job_title),
        notes = case when excluded.notes = '' then public.contacts.notes
          when public.contacts.notes = '' then excluded.notes
          else left(public.contacts.notes || E'\n\n' || excluded.notes, 10000) end,
        last_seen_at = now(), updated_at = now()
      returning id into contact_id;
      created_count := created_count + 1;
    else
      contact_id := existing_contact_id;
      update public.contacts c set
        project_id = coalesce(c.project_id, p_project_id),
        full_name = v_full_name,
        email = coalesce(v_email, c.email),
        phone = coalesce(v_phone, c.phone),
        company = coalesce(v_company, c.company),
        job_title = coalesce(v_title, c.job_title),
        notes = case when v_notes = '' then c.notes
          when c.notes = '' then v_notes
          else left(c.notes || E'\n\n' || v_notes, 10000) end,
        last_seen_at = now(), updated_at = now()
        where c.workspace_id = p_workspace_id and c.id = contact_id;
      updated_count := updated_count + 1;
    end if;

    insert into public.contact_sources(workspace_id, contact_id, source_key, source_label, source_url, notes, artifact_id,
      created_by_agent_id, created_by_user_id)
    values (p_workspace_id, contact_id, v_source_key, v_source_label, v_source_url, v_notes, p_artifact_id,
      p_actor_agent_id, p_actor_user_id);
  end loop;

  insert into public.audit_events(workspace_id, actor_key, action, details)
    values (p_workspace_id, case when p_actor_agent_id is not null then 'agent:' || p_actor_agent_id else 'user:' || p_actor_user_id end,
      'contacts.upserted', jsonb_build_object('created', created_count, 'updated', updated_count, 'skipped', skipped_count));
  return jsonb_build_object('created', created_count, 'updated', updated_count, 'skipped', skipped_count,
    'processed', created_count + updated_count + skipped_count);
end $$;
revoke all on function public.stoic_upsert_contacts(uuid, uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stoic_upsert_contacts(uuid, uuid, uuid, uuid, uuid, jsonb) to service_role;
