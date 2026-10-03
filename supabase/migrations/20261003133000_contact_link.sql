-- Append a verified interaction to an existing workspace contact without creating a second person.
-- Only the Stoic service role can invoke this; the application checks agent artifact visibility.
create or replace function public.stoic_link_contact(
  p_workspace_id uuid,
  p_actor_agent_id uuid,
  p_actor_user_id uuid,
  p_contact_id uuid,
  p_source jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  contact_row public.contacts%rowtype;
  v_source_key text;
  v_source_label text;
  v_source_url text;
  v_notes text;
  v_email text;
  v_phone text;
  v_company text;
  v_title text;
  v_artifact_id uuid;
  v_dedupe_key text;
  linked_contact_id uuid;
begin
  if (p_actor_agent_id is null) = (p_actor_user_id is null) then raise exception 'invalid_actor'; end if;
  if not exists (select 1 from public.workspaces where id = p_workspace_id and plan = 'pro') then
    raise exception 'subscription_required';
  end if;
  if p_actor_user_id is not null and not exists (
    select 1 from public.workspaces where id = p_workspace_id and owner_id = p_actor_user_id
  ) then raise exception 'forbidden'; end if;
  if p_actor_agent_id is not null and not exists (
    select 1 from public.agents where id = p_actor_agent_id and workspace_id = p_workspace_id and status = 'connected'
  ) then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_source) is distinct from 'object' then raise exception 'invalid_contact_source'; end if;

  v_source_key := trim(coalesce(p_source->>'source_key', ''));
  v_source_label := trim(coalesce(p_source->>'source_label', ''));
  v_source_url := nullif(trim(coalesce(p_source->>'source_url', '')), '');
  v_notes := trim(coalesce(p_source->>'notes', ''));
  v_email := nullif(lower(trim(coalesce(p_source->>'email', ''))), '');
  v_phone := nullif(trim(coalesce(p_source->>'phone', '')), '');
  v_company := nullif(trim(coalesce(p_source->>'company', '')), '');
  v_title := nullif(trim(coalesce(p_source->>'job_title', '')), '');
  if char_length(v_source_key) not between 8 and 240 or char_length(v_source_label) not between 2 and 180
    or char_length(v_notes) > 5000 or char_length(coalesce(v_source_url, '')) > 2000
    or char_length(coalesce(v_email, '')) > 254 or char_length(coalesce(v_phone, '')) > 60
    or char_length(coalesce(v_company, '')) > 160 or char_length(coalesce(v_title, '')) > 160
    or (v_source_url is not null and v_source_url !~* '^https?://[^[:space:]]+$')
    or (v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    then raise exception 'invalid_contact_source'; end if;

  select * into contact_row from public.contacts
    where workspace_id = p_workspace_id and id = p_contact_id for update;
  if not found then raise exception 'contact_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':source:' || v_source_key, 741));
  select contact_id into linked_contact_id from public.contact_sources
    where workspace_id = p_workspace_id and source_key = v_source_key;
  if linked_contact_id is not null then
    if linked_contact_id <> p_contact_id then raise exception 'source_key_conflict'; end if;
    return jsonb_build_object('contactId', p_contact_id, 'updated', false, 'alreadyLinked', true);
  end if;

  v_artifact_id := nullif(p_source->>'artifact_id', '')::uuid;
  if v_artifact_id is not null and not exists (
    select 1 from public.artifacts a where a.workspace_id = p_workspace_id and a.id = v_artifact_id
      and a.status = 'ready' and (contact_row.project_id is null or a.project_id = contact_row.project_id)
  ) then raise exception 'artifact_not_found'; end if;
  if v_email is not null and contact_row.email is not null and lower(contact_row.email) <> v_email then
    raise exception 'contact_identity_conflict';
  end if;
  if v_phone is not null and contact_row.phone is not null and
    regexp_replace(contact_row.phone, '[^0-9]', '', 'g') <> regexp_replace(v_phone, '[^0-9]', '', 'g') then
    raise exception 'contact_identity_conflict';
  end if;

  v_email := coalesce(contact_row.email, v_email);
  v_phone := coalesce(contact_row.phone, v_phone);
  v_company := coalesce(contact_row.company, v_company);
  v_title := coalesce(contact_row.job_title, v_title);
  if v_email is not null then
    v_dedupe_key := 'email:' || lower(v_email);
  elsif v_phone is not null and char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) >= 7 then
    v_dedupe_key := 'phone:' || regexp_replace(v_phone, '[^0-9]', '', 'g');
  else
    v_dedupe_key := 'name_company:' || lower(regexp_replace(contact_row.full_name || '|' || coalesce(v_company, ''), '[^[:alnum:]]+', '', 'g'));
  end if;
  if v_dedupe_key <> contact_row.dedupe_key and exists (
    select 1 from public.contacts where workspace_id = p_workspace_id and dedupe_key = v_dedupe_key and id <> p_contact_id
  ) then raise exception 'contact_identity_conflict'; end if;

  update public.contacts set email = v_email, phone = v_phone, company = v_company,
    job_title = v_title, dedupe_key = v_dedupe_key,
    notes = case when v_notes = '' then contact_row.notes
      when contact_row.notes = '' then v_notes
      else left(contact_row.notes || E'\n\n' || v_notes, 10000) end,
    last_seen_at = now(), updated_at = now()
    where workspace_id = p_workspace_id and id = p_contact_id;
  insert into public.contact_sources(workspace_id, contact_id, source_key, source_label, source_url, notes,
    artifact_id, created_by_agent_id, created_by_user_id)
  values (p_workspace_id, p_contact_id, v_source_key, v_source_label, v_source_url, v_notes,
    v_artifact_id, p_actor_agent_id, p_actor_user_id);
  insert into public.audit_events(workspace_id, actor_key, action, object_id, details)
  values (p_workspace_id, case when p_actor_agent_id is not null then 'agent:' || p_actor_agent_id
    else 'user:' || p_actor_user_id end, 'contact.linked', p_contact_id,
    jsonb_build_object('artifactLinked', v_artifact_id is not null));
  return jsonb_build_object('contactId', p_contact_id, 'updated', true, 'alreadyLinked', false);
end $$;
revoke all on function public.stoic_link_contact(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.stoic_link_contact(uuid, uuid, uuid, uuid, jsonb) to service_role;
