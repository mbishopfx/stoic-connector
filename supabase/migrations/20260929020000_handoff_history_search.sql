alter table public.handoffs
  add column search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(goal, '')), 'B')
  ) stored;

create index handoffs_workspace_history
  on public.handoffs (workspace_id, created_at desc, id desc);

create index handoffs_search_document
  on public.handoffs using gin (search_document);
