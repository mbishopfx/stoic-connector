-- Owners can describe an agent's existing capabilities without sharing credentials.
-- These notes are declarations for routing, not proof that access still works.
alter table public.agents add column access_notes text not null default ''
  check (char_length(access_notes) <= 2000);
