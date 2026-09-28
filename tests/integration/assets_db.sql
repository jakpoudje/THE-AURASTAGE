-- Integration test for migration 0024 (Assets Library: versions, metadata, links, replaced-recording rule). Rolled back.
-- People: O owns the studio; W is a Writer (assets: view only) on project A; X is an outsider.
begin;
insert into auth.users(id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111','owner@aurastage.invalid','authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','writer@aurastage.invalid','authenticated','authenticated');
create temp table r(n serial, step text, ok text);
create temp table ids(k text primary key, v uuid);
grant all on r, ids to authenticated;
grant usage on sequence r_n_seq to authenticated;
create or replace function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', case p when 'O' then '11111111-1111-1111-1111-111111111111'
    when 'X' then '22222222-2222-2222-2222-222222222222' else '33333333-3333-3333-3333-333333333333' end, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;
select pg_temp.as_user('O');
do $$
declare o public.organizations; a uuid; s uuid; b uuid;
begin
  o := public.create_organization('T','t-assets');
  insert into public.projects(org_id,title) values (o.id,'A') returning id into a;
  insert into public.projects(org_id,title) values (o.id,'B') returning id into b;
  insert into ids values ('org', o.id), ('a', a), ('b', b);
end $$;
reset role;
insert into public.org_members(org_id, user_id, role) select v, '33333333-3333-3333-3333-333333333333', 'member' from ids where k = 'org';
insert into public.project_members(project_id, org_id, user_id, role) select (select v from ids where k = 'a'), v, '33333333-3333-3333-3333-333333333333', 'writer' from ids where k = 'org';
insert into public.characters(org_id, project_id, name) select (select v from ids where k = 'org'), v, 'Amara' from ids where k = 'a';
insert into ids select 'char', id from public.characters where name = 'Amara' and project_id = (select v from ids where k = 'a');
insert into public.characters(org_id, project_id, name) select (select v from ids where k = 'org'), v, 'Elsewhere' from ids where k = 'b';
insert into ids select 'other_char', id from public.characters where name = 'Elsewhere';
set local role authenticated;

select pg_temp.as_user('O');
do $$
declare a uuid := (select v from ids where k = 'a'); x public.assets; ver public.asset_versions; n int;
begin
  x := public.register_asset(a, 'image', 'Harbour reference', 'k/1.png', repeat('a', 64), '{"media_type":"image/png","size_bytes":10}');
  insert into ids values ('img', x.id);
  insert into r(step, ok) values ('new asset gets version 1 and a default category',
    (select count(*)::text from public.asset_versions where asset_id = x.id) || ' / v' || x.current_version || ' / ' || (select category from public.assets where id = x.id));
  x := public.update_asset(x.id, '{"category":"locations","description":"Dawn light","tags":["Exterior"," harbour ","exterior",""]}');
  insert into r(step, ok) values ('metadata saved; tags cleaned and de-duplicated', x.category || ' / ' || array_to_string(x.tags, ','));
  begin perform public.update_asset(x.id, '{"category":"spaceships"}'); insert into r(step, ok) values ('unknown category refused', 'NO');
  exception when others then insert into r(step, ok) values ('unknown category refused', sqlerrm); end;
  ver := public.add_asset_version(x.id, 'k/2.png', repeat('b', 64), '{"media_type":"image/png","size_bytes":12}', 'Brighter');
  insert into r(step, ok) values ('replace adds version 2; version 1 kept with its own file',
    'v' || ver.version_number || ' / current ' || (select current_version || ' ' || storage_path from public.assets where id = x.id) || ' / v1 ' || (select storage_path from public.asset_versions where asset_id = x.id and version_number = 1));
  begin perform public.add_asset_version(x.id, 'k/3.png', repeat('b', 64), '{}', ''); insert into r(step, ok) values ('identical file refused', 'NO');
  exception when others then insert into r(step, ok) values ('identical file refused', sqlerrm); end;
  n := public.set_asset_link(x.id, 'character', (select v from ids where k = 'char'), true);
  n := public.set_asset_link(x.id, 'character', (select v from ids where k = 'char'), true);
  insert into r(step, ok) values ('link to a character (idempotent)', n::text);
  begin perform public.set_asset_link(x.id, 'character', (select v from ids where k = 'other_char'), true); insert into r(step, ok) values ('other project''s character refused', 'NO');
  exception when others then insert into r(step, ok) values ('other project''s character refused', sqlerrm); end;
  x := public.update_asset(x.id, '{"archived":true}');
  begin perform public.add_asset_version(x.id, 'k/4.png', repeat('c', 64), '{}', ''); insert into r(step, ok) values ('archived asset can''t be replaced', 'NO');
  exception when others then insert into r(step, ok) values ('archived asset can''t be replaced', sqlerrm); end;
  x := public.update_asset(x.id, '{"archived":false}');
  insert into r(step, ok) values ('restored', (x.archived_at is null)::text);
end $$;

select pg_temp.as_user('W');
do $$
declare a uuid := (select v from ids where k = 'a');
begin
  insert into r(step, ok) values ('writer sees the asset, its versions and links',
    (select count(*) from public.assets) || '/' || (select count(*) from public.asset_versions) || '/' || (select count(*) from public.asset_links));
  begin perform public.update_asset((select v from ids where k = 'img'), '{"name":"Hacked"}'); insert into r(step, ok) values ('writer can''t edit assets', 'NO');
  exception when others then insert into r(step, ok) values ('writer can''t edit assets', sqlerrm); end;
  begin perform public.add_asset_version((select v from ids where k = 'img'), 'k/9.png', repeat('d', 64), '{}', ''); insert into r(step, ok) values ('writer can''t replace', 'NO');
  exception when others then insert into r(step, ok) values ('writer can''t replace', sqlerrm); end;
end $$;

select pg_temp.as_user('X');
do $$
begin
  insert into r(step, ok) values ('outsider sees nothing', (select count(*) from public.assets) || '/' || (select count(*) from public.asset_versions) || '/' || (select count(*) from public.asset_links));
  begin perform public.set_asset_link((select v from ids where k = 'img'), 'character', (select v from ids where k = 'char'), false); insert into r(step, ok) values ('outsider can''t unlink', 'NO');
  exception when others then insert into r(step, ok) values ('outsider can''t unlink', sqlerrm); end;
end $$;

select pg_temp.as_user('O');
do $$ begin
  insert into r(step, ok) values ('audit trail', (select string_agg(action, ',' order by created_at, action) from public.audit_events where object_type = 'Asset'));
  insert into r(step, ok) values ('audit rows carry the project', (select bool_and(project_id = (select v from ids where k = 'a'))::text from public.audit_events where object_type = 'Asset'));
end $$;

do $x$ begin raise exception 'RESULTS: %', (select string_agg(step || ' => ' || ok, ' || ' order by n) from r); end $x$;

-- Expected:
-- new asset gets version 1 and a default category | 1 / v1 / visual_references
-- metadata saved; tags cleaned and de-duplicated   | locations / exterior,harbour
-- unknown category refused                         | AURA-AST-400: unknown category
-- replace adds version 2; version 1 kept ...       | v2 / current 2 k/2.png / v1 k/1.png
-- identical file refused                           | AURA-AST-409: that file is identical to the current version
-- link to a character (idempotent)                     | 1
-- other project's character refused                | AURA-AST-400: that character isn't in this project
-- archived asset can't be replaced                 | AURA-AST-409: restore this asset before replacing its file
-- restored                                         | true
-- writer sees the asset, its versions and links    | 1/2/1
-- writer can't edit assets                         | AURA-COL-403: your role (Writer) can't edit in the Assets Library. ...
-- writer can't replace                             | AURA-COL-403: your role (Writer) can't edit in the Assets Library. ...
-- outsider sees nothing                            | 0/0/0
-- outsider can't unlink                            | AURA-COL-403: you don't have access to this project
-- audit trail (one transaction: same timestamp, so alphabetical) | AssetArchived,AssetLinked,AssetLinked,AssetRegistered,AssetRestored,AssetUpdated,AssetVersionAdded
-- audit rows carry the project                     | true
