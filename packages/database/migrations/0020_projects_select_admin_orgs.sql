-- Regression fix for 0019: creating a project returns the new row (insert ... returning), which must
-- pass the select policy. my_project_ids() is computed before the row exists, so also allow rows in
-- the caller's full-rights organizations (the same set that may insert).
-- Regression check: tests/integration/team_db.sql (owner creates projects A and B).
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (org_id = any ((select public.my_admin_org_ids())::uuid[]) or id = any ((select public.my_project_ids())::uuid[]));
