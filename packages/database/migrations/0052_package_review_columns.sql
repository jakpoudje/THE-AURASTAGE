-- 0052_package_review_columns.sql
-- Big films (owner report 2026-10-02, 884 shots): the Visual page's shot list needs only three small fields of each
-- compiled package to decide whether it needs review (the project look it was compiled with, the Locations & Props
-- revisions it used, and the location/props it named). Reading them out of the prompt content forced Postgres to
-- de-TOAST ~10 MB per page load (1.9 s on its own, timeouts under load). Stored generated columns keep them next to
-- the row; nothing writes them by hand and the content stays the single source of truth.
alter table public.generation_packages
  add column if not exists review_look text generated always as (content->'project'->>'look') stored,
  add column if not exists review_world_revisions jsonb generated always as (content->'provenance'->'world_revisions') stored,
  add column if not exists review_world jsonb generated always as (content->'world') stored;

create index if not exists idx_generation_packages_project_created on public.generation_packages (project_id, created_at desc);
