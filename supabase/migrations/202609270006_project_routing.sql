alter table public.projects add column default_agent_id uuid;
alter table public.projects add constraint projects_default_agent_fk
  foreign key (workspace_id, default_agent_id) references public.agents(workspace_id, id);
