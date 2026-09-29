-- Integration test for migration 0027 (character reference views: request, worker, generated asset linked to the character). Rolled back.
-- People: O owns the studio; W is a Writer (casting: view only) on project A; X is an outsider.
begin;
insert into auth.users(id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111','owner@aurastage.invalid','authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','writer@aurastage.invalid','authenticated','authenticated');
insert into public.worker_credentials(name, token_hash) values ('cr-test', encode(extensions.digest('cr-token-0123456789abcdef0123456789abcdef', 'sha256'), 'hex'));
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
  o := public.create_organization('T','t-char-refs');
  insert into public.projects(org_id,title) values (o.id,'A') returning id into a;
  v := public.save_script_version(a, null, 'x', '[]'::jsonb, 'p', 'first');
  s := public.approve_script_version(a, v.id, '[{"number":1,"heading":"EXT. HARBOUR - DAWN","int_ext":"EXT","location":"HARBOUR","time_of_day":"DAWN","speaking_characters":[],"estimated_seconds":20,"element_start":0,"element_end":2,"content_hash":"h1"}]', 'e@1');
  insert into ids values ('org', o.id), ('a', a), ('scene', (select id from public.scenes where project_id = a));
end $$;
reset role;
insert into public.characters(org_id, project_id, name, age, gender) select (select v from ids where k = 'org'), v, 'Amara Bello', '32', 'Woman' from ids where k = 'a';
insert into ids select 'amara', id from public.characters where name = 'Amara Bello' and project_id = (select v from ids where k = 'a');
insert into public.characters(org_id, project_id, name) select (select v from ids where k = 'org'), v, 'Tunde' from ids where k = 'a';
insert into public.wardrobe_looks(org_id, project_id, character_id, name) select (select v from ids where k = 'org'), (select v from ids where k = 'a'), id, 'Suit' from public.characters where name = 'Tunde' and project_id = (select v from ids where k = 'a');
insert into ids select 'tunde_look', w.id from public.wardrobe_looks w where w.name = 'Suit' and w.project_id = (select v from ids where k = 'a');
insert into public.org_members(org_id, user_id, role) select v, '33333333-3333-3333-3333-333333333333', 'member' from ids where k = 'org';
insert into public.project_members(project_id, org_id, user_id, role) select (select v from ids where k = 'a'), v, '33333333-3333-3333-3333-333333333333', 'writer' from ids where k = 'org';
set local role authenticated;

select pg_temp.as_user('O');
do $$
declare ch uuid := (select v from ids where k = 'amara'); g public.character_reference_images;
begin
  g := public.request_character_reference(ch, null, 'front', 'CU', '1:1', 'Character reference sheet image, close-up… Amara Bello — Woman, aged 32.', array['a different person'], 'abc123', 'aurastage-sketch', 'sketch-v1', 'native', 3, '{"title":"Amara Bello"}', '1.0.0');
  insert into ids values ('r1', g.id);
  insert into r(step, ok) values ('request queued with a job', g.status || ' / ' || g.angle || ' ' || g.size || ' / ' || (select engine_id || ' ' || status from public.jobs where id = g.job_id));
  g := public.request_character_reference(ch, null, 'back', 'FULL', '9:16', 'Back view', '{}', 'abc123', 'aurastage-sketch', 'sketch-v1', 'native', 3, '{}', '1.0.0');
  insert into ids values ('r2', g.id);
  begin perform public.request_character_reference(ch, (select v from ids where k = 'tunde_look'), 'front', 'CU', '1:1', 'x', '{}', 'h', 'aurastage-sketch', 'sketch-v1', 'native', 1, '{}', '1.0.0'); insert into r(step, ok) values ('another character''s look refused', 'NO');
  exception when others then insert into r(step, ok) values ('another character''s look refused', sqlerrm); end;
  begin perform public.request_character_reference(ch, null, 'upside_down', 'CU', '1:1', 'x', '{}', 'h', 'aurastage-sketch', 'sketch-v1', 'native', 1, '{}', '1.0.0'); insert into r(step, ok) values ('unknown angle refused', 'NO');
  exception when others then insert into r(step, ok) values ('unknown angle refused', 'refused'); end;
end $$;

select pg_temp.as_user('W');
do $$ begin
  begin perform public.request_character_reference((select v from ids where k = 'amara'), null, 'front', 'CU', '1:1', 'x', '{}', 'h', 'aurastage-sketch', 'sketch-v1', 'native', 1, '{}', '1.0.0'); insert into r(step, ok) values ('writer can''t generate references', 'NO');
  exception when others then insert into r(step, ok) values ('writer can''t generate references', sqlerrm); end;
  insert into r(step, ok) values ('writer sees them', (select count(*)::text from public.character_reference_images));
end $$;
select pg_temp.as_user('X');
do $$ begin
  begin perform public.request_character_reference((select v from ids where k = 'amara'), null, 'front', 'CU', '1:1', 'x', '{}', 'h', 'aurastage-sketch', 'sketch-v1', 'native', 1, '{}', '1.0.0'); insert into r(step, ok) values ('outsider refused', 'NO');
  exception when others then insert into r(step, ok) values ('outsider refused', sqlerrm); end;
  insert into r(step, ok) values ('outsider sees nothing', (select count(*)::text from public.character_reference_images));
end $$;

reset role;
set local role anon;
do $$
declare c jsonb; a1 uuid; a2 uuid;
begin
  begin perform public.worker_claim_character_reference('wrong-token-0123456789abcdef0123456789'); insert into r(step, ok) values ('bad worker token refused', 'NO');
  exception when others then insert into r(step, ok) values ('bad worker token refused', sqlerrm); end;
  c := public.worker_claim_character_reference('cr-token-0123456789abcdef0123456789abcdef');
  insert into r(step, ok) values ('worker claims the oldest with its prompt and sketch hints', ((c->>'id')::uuid = (select v from ids where k = 'r1'))::text || ' / ' || (c->'sketch'->>'title') || ' / ' || left(c->>'prompt', 32));
  a1 := public.worker_complete_character_reference('cr-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid, 'o/p/assets/x.svg', repeat('a', 64), '{"media_type":"image/svg+xml","size_bytes":900}', null, 0);
  a2 := public.worker_complete_character_reference('cr-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid, 'o/p/assets/y.svg', repeat('b', 64), '{}', null, 0);
  insert into r(step, ok) values ('completing twice returns the same asset', (a1 = a2)::text);
  c := public.worker_claim_character_reference('cr-token-0123456789abcdef0123456789abcdef');
  perform public.worker_fail_character_reference('cr-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid, 'Provider busy', null);
  insert into r(step, ok) values ('queue empty afterwards', coalesce(public.worker_claim_character_reference('cr-token-0123456789abcdef0123456789abcdef')::text, 'empty'));
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('O');
do $$
declare g public.character_reference_images; x public.assets;
begin
  select * into g from public.character_reference_images where id = (select v from ids where k = 'r1');
  select * into x from public.assets where id = g.asset_id;
  insert into r(step, ok) values ('reference is an image asset in Characters, linked to the character',
    g.status || ' / ' || x.type || ' / ' || x.category || ' / ' || x.name || ' / ' || array_to_string(x.tags, ',') || ' / ' ||
    (select count(*) from public.asset_links where asset_id = x.id and object_type = 'character' and object_id = g.character_id)::text);
  insert into r(step, ok) values ('provenance on the file', (x.metadata->'generated'->>'provider') || ' ' || (x.metadata->'generated'->>'identity_hash') || ' ' || (x.metadata->'generated'->>'angle'));
  insert into r(step, ok) values ('failed keeps the reason', (select status || ' / ' || error from public.character_reference_images where id = (select v from ids where k = 'r2')));
  insert into r(step, ok) values ('audit trail', (select string_agg(action, ',' order by action) from public.audit_events where action like 'CharacterReference%' or (object_type = 'Asset' and action = 'AssetRegistered')));
  insert into r(step, ok) values ('audit rows carry the project', (select bool_and(project_id = (select v from ids where k = 'a'))::text from public.audit_events where action like 'CharacterReference%' or object_type = 'Asset'));
end $$;

do $x$ begin raise exception 'RESULTS: %', (select string_agg(step || ' => ' || ok, ' || ' order by n) from r); end $x$;

-- Expected:
-- request queued with a job                        | queued / front CU / character.reference queued
-- another character's look refused                 | AURA-CHR-400: that wardrobe look isn't this character's
-- unknown angle refused                            | refused
-- writer can't generate references                 | AURA-COL-403: your role (Writer) can't edit in Casting & Characters. ...
-- writer sees them                                 | 2
-- outsider refused                                 | AURA-COL-403: you don't have access to this project
-- outsider sees nothing                            | 0
-- bad worker token refused                         | AURA-GEN-401: worker not authorised
-- worker claims the oldest with its prompt ...     | true / Amara Bello / Character reference sheet image,
-- completing twice returns the same asset          | true
-- queue empty afterwards                           | empty
-- reference is an image asset in Characters ...    | succeeded / image / characters / Amara Bello — Front CU reference / generated / 1
-- provenance on the file                           | aurastage-sketch abc123 front
-- failed keeps the reason                          | failed / Provider busy
-- audit trail                                      | AssetRegistered,CharacterReferenceGenerated,CharacterReferenceRequested,CharacterReferenceRequested
-- audit rows carry the project                     | true
