alter table public.agents add column harness_name text;

update public.agents
set harness_name = case platform
  when 'codex' then 'Codex'
  when 'hermes' then 'Hermes'
  when 'openclaw' then 'OpenClaw'
  when 'grok' then 'Grok Bot'
  when 'muse' then 'Muse'
  else 'Another MCP client'
end;

alter table public.agents alter column harness_name set default 'Other / custom';
alter table public.agents alter column harness_name set not null;
alter table public.agents
  add constraint agents_harness_name_length_check
  check (char_length(btrim(harness_name)) between 2 and 60);
