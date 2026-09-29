-- Integration test for migration 0028 (Locations & Props: sync, edit, flags, references, asset links). Rolled back.
-- People: O owns the studio; W is a Writer (scene_dna: view only) on project A; X is an outsider.
begin;
insert into auth.users(id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111','owner@aurastage.invalid','authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','writer@aurastage.invalid','authenticated','authenticated');
insert into public.worker_credentials(name, token_hash) values ('wd-test', encode(extensions.digest('wd-token-0123456789abcdef0123456789abcdef', 'sha256'), 'hex'));
create temp table r(n serial, step text, ok text);
create temp table ids(k text primary key, v uuid);
grant all on r, ids to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', case p when 'O' then '11111111-1111-1111-1111-111111111111'
    when 'X' then '22222222-2222-2222-2222-222222222222' else '33333333-3333-3333-3333-333333333333' end, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;
select pg_temp.as_user('O');
do $$
declare o public.organizations; a uuid; v public.script_versions; s public.scripts;
begin
  o := public.create_organization('T','t-world');
  insert into public.projects(org_id,title) values (o.id,'A') returning id into a;
  v := public.save_script_version(a, null, 'x', '[]'::jsonb, 'p', 'first');
  s := public.approve_script_version(a, v.id, '[{"number":1,"heading":"INT. FLAT - NIGHT","int_ext":"INT","location":"FLAT","time_of_day":"NIGHT","speaking_characters":[],"estimated_seconds":20,"element_start":0,"element_end":2,"content_hash":"h1"},{"number":2,"heading":"EXT. HARBOUR - DAWN","int_ext":"EXT","location":"HARBOUR","time_of_day":"DAWN","speaking_characters":[],"estimated_seconds":20,"element_start":3,"element_end":4,"content_hash":"h2"}]', 'e@1');
  insert into ids values ('org', o.id), ('a', a), ('v', v.id);
end $$;
reset role;
insert into public.org_members(org_id, user_id, role) select v, '33333333-3333-3333-3333-333333333333', 'member' from ids where k = 'org';
insert into public.project_members(project_id, org_id, user_id, role) select (select v from ids where k = 'a'), v, '33333333-3333-3333-3333-333333333333', 'writer' from ids where k = 'org';
set local role authenticated;

select pg_temp.as_user('O');
do $$
declare a uuid := (select v from ids where k = 'a'); ver uuid := (select v from ids where k = 'v'); j jsonb; l jsonb; p jsonb; loc public.locations; x public.world_reference_images;
begin
  begin perform public.sync_world(a, gen_random_uuid(), '[]', '[]', '1.0.0'); insert into r(step, ok) values ('sync against a stale script refused', 'NO');
  exception when others then insert into r(step, ok) values ('sync against a stale script refused', sqlerrm); end;
  j := public.sync_world(a, ver,
    '[{"key":"FLAT","name":"Flat","int_ext":["INT"],"times_of_day":["NIGHT"],"areas":["Kitchen"],"scenes":[{"scene_number":1,"line":1,"text":"INT. FLAT - NIGHT"}]},
      {"key":"HARBOUR","name":"Harbour","int_ext":["EXT"],"times_of_day":["DAWN"],"areas":[],"scenes":[{"scene_number":2,"line":4,"text":"EXT. HARBOUR - DAWN"}]}]',
    '[{"key":"notebook","name":"Notebook","category":"prop","descriptors":["battered"],"confidence":"high","reason":"caps","scenes":[{"scene_number":1,"line":2,"text":"a battered NOTEBOOK"}]},
      {"key":"danfo","name":"Danfo","category":"vehicle","descriptors":[],"confidence":"medium","reason":"object","scenes":[{"scene_number":2,"line":5,"text":"a yellow danfo"}]}]', '1.0.0');
  insert into r(step, ok) values ('first sync creates items with evidence', (j->>'new_locations') || ' / ' || (j->>'new_props') || ' / ' ||
    (select count(*) from public.world_appearances where project_id = a)::text || ' / ' || (select status || ' ' || source from public.locations where key = 'FLAT'));
  -- The person names and describes the flat; a re-sync must not overwrite it.
  select * into loc from public.locations where project_id = a and key = 'FLAT';
  l := public.save_world_item(a, 'location', loc.id, loc.revision, '{"name":"Tunde''s flat","description":"Cramped, one window","status":"confirmed"}');
  insert into ids values ('flat', loc.id);
  begin perform public.save_world_item(a, 'location', loc.id, loc.revision, '{"description":"stale"}'); insert into r(step, ok) values ('stale edit refused', 'NO');
  exception when others then insert into r(step, ok) values ('stale edit refused', sqlerrm); end;
  begin perform public.save_world_item(a, 'location', null, null, '{"name":"harbour"}'); insert into r(step, ok) values ('duplicate name refused', 'NO');
  exception when others then insert into r(step, ok) values ('duplicate name refused', sqlerrm); end;
  p := public.save_world_item(a, 'prop', null, null, '{"name":"Brass key","description":"Old, green with age"}');
  insert into ids values ('key', (p->>'id')::uuid);
  -- Re-sync: the harbour and the danfo are gone from the script; the flat gains DAY.
  j := public.sync_world(a, ver,
    '[{"key":"FLAT","name":"Flat","int_ext":["INT"],"times_of_day":["NIGHT","DAY"],"areas":["Kitchen"],"scenes":[{"scene_number":1,"line":1,"text":"INT. FLAT - NIGHT"}]}]',
    '[{"key":"notebook","name":"Notebook","category":"prop","descriptors":["battered"],"confidence":"high","reason":"caps","scenes":[{"scene_number":1,"line":2,"text":"a battered NOTEBOOK"}]}]', '1.0.0');
  insert into r(step, ok) values ('re-sync keeps the person''s name/description, refreshes script facts',
    (select name || ' / ' || description || ' / ' || status || ' / ' || array_to_string(times_of_day, ',') || ' / rev ' || revision from public.locations where id = loc.id));
  insert into r(step, ok) values ('gone from the script: flagged, never deleted',
    (select string_agg(name || ':' || (missing_since_version_id is not null)::text, ', ' order by name) from (select name, missing_since_version_id from public.locations where project_id = a union all select name, missing_since_version_id from public.props where project_id = a) q));
  insert into r(step, ok) values ('the prop added by hand is untouched by sync', (select source || ' / ' || confidence || ' / ' || (missing_since_version_id is null)::text from public.props where id = (select v from ids where k = 'key')));
  x := public.request_world_reference('location', loc.id, 'wide:NIGHT', '16:9', 'Location reference image, wide', '{}', 'h1', 'aurastage-sketch', 'sketch-v1', 'native', 3, '{}', '1.0.0');
  insert into ids values ('ref', x.id);
  begin perform public.request_world_reference('location', loc.id, 'Wide Night', '16:9', 'x', '{}', 'h1', 'aurastage-sketch', 'sketch-v1', 'native', 3, '{}', '1.0.0'); insert into r(step, ok) values ('bad view key refused', 'NO');
  exception when others then insert into r(step, ok) values ('bad view key refused', 'refused'); end;
end $$;

select pg_temp.as_user('W');
do $$ begin
  begin perform public.save_world_item((select v from ids where k = 'a'), 'prop', null, null, '{"name":"Pen"}'); insert into r(step, ok) values ('writer can''t edit', 'NO');
  exception when others then insert into r(step, ok) values ('writer can''t edit', sqlerrm); end;
  insert into r(step, ok) values ('writer sees locations and props', (select count(*)::text from public.locations) || ' / ' || (select count(*)::text from public.props));
end $$;
select pg_temp.as_user('X');
do $$ begin
  begin perform public.request_world_reference('location', (select v from ids where k = 'flat'), 'wide:NIGHT', '16:9', 'x', '{}', 'h', 'aurastage-sketch', 'sketch-v1', 'native', 1, '{}', '1.0.0'); insert into r(step, ok) values ('outsider refused', 'NO');
  exception when others then insert into r(step, ok) values ('outsider refused', sqlerrm); end;
  insert into r(step, ok) values ('outsider sees nothing', (select count(*)::text from public.locations) || ' / ' || (select count(*)::text from public.world_reference_images));
end $$;

reset role;
set local role anon;
do $$
declare c jsonb; a1 uuid; a2 uuid;
begin
  begin perform public.worker_claim_world_reference('wrong-token-0123456789abcdef0123456789'); insert into r(step, ok) values ('bad worker token refused', 'NO');
  exception when others then insert into r(step, ok) values ('bad worker token refused', sqlerrm); end;
  c := public.worker_claim_world_reference('wd-token-0123456789abcdef0123456789abcdef');
  insert into r(step, ok) values ('worker claims it', (c->>'view_key') || ' / ' || (c->>'aspect_ratio'));
  a1 := public.worker_complete_world_reference('wd-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid, 'o/p/assets/x.svg', repeat('a', 64), '{"media_type":"image/svg+xml","size_bytes":10}', null, 0);
  a2 := public.worker_complete_world_reference('wd-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid, 'o/p/assets/y.svg', repeat('b', 64), '{}', null, 0);
  insert into r(step, ok) values ('completing twice returns the same asset', (a1 = a2)::text);
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('O');
do $$
declare x public.assets; n int;
begin
  select * into x from public.assets where id = (select asset_id from public.world_reference_images where id = (select v from ids where k = 'ref'));
  insert into r(step, ok) values ('the view is an asset under Locations, linked to the location',
    x.category || ' / ' || x.name || ' / ' || (select count(*) from public.asset_links where asset_id = x.id and object_type = 'location' and object_id = (select v from ids where k = 'flat'))::text);
  n := public.set_asset_link(x.id, 'prop', (select v from ids where k = 'key'), true);
  insert into r(step, ok) values ('an asset can be linked to a prop by hand', n::text);
  insert into r(step, ok) values ('audit trail', (select string_agg(distinct action, ',' order by action) from public.audit_events where action like 'World%'));
end $$;

do $x$ begin raise exception 'RESULTS: %', (select string_agg(step || ' => ' || ok, ' || ' order by n) from r); end $x$;

-- Expected:
-- sync against a stale script refused      | AURA-WLD-409: the approved script changed; reload and find them again
-- first sync creates items with evidence   | 2 / 2 / 4 / detected script
-- stale edit refused                       | AURA-WLD-409: someone changed this location since you opened it — reload to see their changes
-- duplicate name refused                   | AURA-WLD-409: there's already a location called harbour
-- re-sync keeps the person's name/...      | Tunde's flat / Cramped, one window / confirmed / NIGHT,DAY / rev 2
-- gone from the script: flagged, never ... | Danfo:true, Harbour:true, Notebook:false, Tunde's flat:false  (+ Brass key:false)
-- the prop added by hand is untouched      | manual / manual / true
-- bad view key refused                     | refused
-- writer can't edit                        | AURA-COL-403: your role (Writer) can't edit in Scene DNA. ...
-- writer sees locations and props          | 2 / 3
-- outsider refused                         | AURA-COL-403: you don't have access to this project
-- outsider sees nothing                    | 0 / 0
-- bad worker token refused                 | AURA-GEN-401: worker not authorised
-- worker claims it                         | wide:NIGHT / 16:9
-- completing twice returns the same asset  | true
-- the view is an asset under Locations ... | locations / Tunde's flat — Wide · Night reference / 1
-- an asset can be linked to a prop by hand | 2
-- audit trail                              | WorldItemCreated,WorldItemUpdated,WorldReferenceGenerated,WorldReferenceRequested,WorldSynced
