-- Regression (2026-09-27): deleting an organization with projects failed with
-- 23503 from the project audit trigger. Runs in a rolled-back transaction.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(step text, ok text) on commit drop;
do $$
declare o public.organizations;
begin
  o := public.create_organization('Delete Me','delete-me-org');
  insert into public.projects(org_id, title) values (o.id, 'P1');
  reset role;
  delete from public.organizations where id = o.id;
  insert into r values ('org deleted', (not exists (select 1 from public.organizations where id = o.id))::text);
  insert into r values ('no orphan audit rows', (not exists (select 1 from public.audit_events where org_id = o.id))::text);
end $$;
select * from r;
rollback;
-- Expected: org deleted | true ; no orphan audit rows | true
