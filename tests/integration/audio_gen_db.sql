-- Integration test for migration 0026 (audio generation: request, worker, generated asset). Rolled back.
-- People: O owns the studio; W is a Writer (audio: view only) on project A; X is an outsider.
begin;
insert into auth.users(id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111','owner@aurastage.invalid','authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','writer@aurastage.invalid','authenticated','authenticated');
insert into public.worker_credentials(name, token_hash) values ('ag-test', encode(extensions.digest('ag-token-0123456789abcdef0123456789abcdef', 'sha256'), 'hex'));
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
  o := public.create_organization('T','t-audio-gen');
  insert into public.projects(org_id,title) values (o.id,'A') returning id into a;
  v := public.save_script_version(a, null, 'x', '[]'::jsonb, 'p', 'first');
  s := public.approve_script_version(a, v.id, '[{"number":1,"heading":"EXT. HARBOUR - DAWN","int_ext":"EXT","location":"HARBOUR","time_of_day":"DAWN","speaking_characters":[],"estimated_seconds":20,"element_start":0,"element_end":2,"content_hash":"h1"}]', 'e@1');
  insert into ids values ('org', o.id), ('a', a), ('scene', (select id from public.scenes where project_id = a));
end $$;
reset role;
insert into public.org_members(org_id, user_id, role) select v, '33333333-3333-3333-3333-333333333333', 'member' from ids where k = 'org';
insert into public.project_members(project_id, org_id, user_id, role) select (select v from ids where k = 'a'), v, '33333333-3333-3333-3333-333333333333', 'writer' from ids where k = 'org';
set local role authenticated;

select pg_temp.as_user('O');
do $$
declare a uuid := (select v from ids where k = 'a'); sc uuid := (select v from ids where k = 'scene'); g public.audio_generations;
begin
  g := public.request_audio_generation(a, sc, null, 'ambience', '  Exterior harbour ambience — rain, dawn ', 20, array['tense'], 'aurastage-synth', 'synth-1', 'native', 7, '{}', '1.0.0');
  insert into ids values ('g1', g.id);
  insert into r(step, ok) values ('request queued with a job', g.status || ' / ' || g.description || ' / ' || (select engine_id || ' ' || status from public.jobs where id = g.job_id));
  g := public.request_audio_generation(a, sc, null, 'fx', 'door slams', 2, '{}', 'aurastage-synth', 'synth-1', 'native', 1, '{}', '1.0.0');
  insert into ids values ('g2', g.id);
  begin perform public.request_audio_generation(a, gen_random_uuid(), null, 'fx', 'x', 2, '{}', 'aurastage-synth', 'synth-1', 'native', 1, '{}', '1.0.0'); insert into r(step, ok) values ('unknown scene refused', 'NO');
  exception when others then insert into r(step, ok) values ('unknown scene refused', sqlerrm); end;
  begin perform public.request_audio_generation(a, sc, null, 'fx', 'x', 900, '{}', 'aurastage-synth', 'synth-1', 'native', 1, '{}', '1.0.0'); insert into r(step, ok) values ('too long refused', 'NO');
  exception when others then insert into r(step, ok) values ('too long refused', 'refused'); end;
end $$;

select pg_temp.as_user('W');
do $$ begin
  begin perform public.request_audio_generation((select v from ids where k = 'a'), (select v from ids where k = 'scene'), null, 'fx', 'x', 2, '{}', 'aurastage-synth', 'synth-1', 'native', 1, '{}', '1.0.0'); insert into r(step, ok) values ('writer can''t generate audio', 'NO');
  exception when others then insert into r(step, ok) values ('writer can''t generate audio', sqlerrm); end;
  insert into r(step, ok) values ('writer sees the project''s generations', (select count(*)::text from public.audio_generations));
end $$;
select pg_temp.as_user('X');
do $$ begin
  begin perform public.request_audio_generation((select v from ids where k = 'a'), (select v from ids where k = 'scene'), null, 'fx', 'x', 2, '{}', 'aurastage-synth', 'synth-1', 'native', 1, '{}', '1.0.0'); insert into r(step, ok) values ('outsider refused', 'NO');
  exception when others then insert into r(step, ok) values ('outsider refused', sqlerrm); end;
  insert into r(step, ok) values ('outsider sees nothing', (select count(*)::text from public.audio_generations));
end $$;

reset role;
set local role anon;
do $$
declare c jsonb; a1 uuid; a2 uuid;
begin
  begin perform public.worker_claim_audio_generation('wrong-token-0123456789abcdef0123456789'); insert into r(step, ok) values ('bad worker token refused', 'NO');
  exception when others then insert into r(step, ok) values ('bad worker token refused', sqlerrm); end;
  c := public.worker_claim_audio_generation('ag-token-0123456789abcdef0123456789abcdef');
  insert into r(step, ok) values ('worker claims the oldest', ((c->>'id')::uuid = (select v from ids where k = 'g1'))::text || ' / ' || (c->>'kind') || ' / ' || (c->>'seed'));
  a1 := public.worker_complete_audio_generation('ag-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid, 'o/p/assets/x.wav', repeat('a', 64),
    '{"media_type":"audio/wav","size_bytes":100,"duration_seconds":20}', '{"layers":[{"name":"rain"}]}', null, 0);
  a2 := public.worker_complete_audio_generation('ag-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid, 'o/p/assets/y.wav', repeat('b', 64), '{}', '{}', null, 0);
  insert into r(step, ok) values ('completing twice returns the same asset', (a1 = a2)::text);
  c := public.worker_claim_audio_generation('ag-token-0123456789abcdef0123456789abcdef');
  perform public.worker_fail_audio_generation('ag-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid, 'Provider busy', 'req_1');
  insert into r(step, ok) values ('queue empty afterwards', coalesce(public.worker_claim_audio_generation('ag-token-0123456789abcdef0123456789abcdef')::text, 'empty'));
end $$;
reset role;

set local role authenticated;
select pg_temp.as_user('O');
do $$
declare g public.audio_generations; x public.assets;
begin
  select * into g from public.audio_generations where id = (select v from ids where k = 'g1');
  select * into x from public.assets where id = g.asset_id;
  insert into r(step, ok) values ('generated file is an asset in Audio, linked to the scene, labelled',
    g.status || ' / ' || x.type || ' / ' || x.category || ' / ' || x.name || ' / ' || array_to_string(x.tags, ',') || ' / ' ||
    (select count(*) from public.asset_links where asset_id = x.id and object_type = 'scene')::text || ' / ' || (x.created_by = '11111111-1111-1111-1111-111111111111')::text);
  insert into r(step, ok) values ('version 1 says how it was made', (select note from public.asset_versions where asset_id = x.id and version_number = 1));
  insert into r(step, ok) values ('provenance on the file', (x.metadata->'generated'->>'provider') || ' ' || (x.metadata->'generated'->>'execution'));
  insert into r(step, ok) values ('failed keeps the reason', (select status || ' / ' || error from public.audio_generations where id = (select v from ids where k = 'g2')));
  insert into r(step, ok) values ('audit trail', (select string_agg(action, ',' order by action) from public.audit_events where object_type in ('AudioGeneration','Asset')));
  insert into r(step, ok) values ('audit rows carry the project', (select bool_and(project_id = (select v from ids where k = 'a'))::text from public.audit_events where object_type in ('AudioGeneration','Asset')));
end $$;

do $x$ begin raise exception 'RESULTS: %', (select string_agg(step || ' => ' || ok, ' || ' order by n) from r); end $x$;

-- Expected:
-- request queued with a job                  | queued / Exterior harbour ambience — rain, dawn / audio.generate queued
-- unknown scene refused                      | AURA-AUD-404: scene not found in this project
-- too long refused                           | refused
-- writer can't generate audio                | AURA-COL-403: your role (Writer) can't generate in Audio Studio. ...
-- writer sees the project's generations      | 2
-- outsider refused                           | AURA-COL-403: you don't have access to this project
-- outsider sees nothing                      | 0
-- bad worker token refused                   | AURA-GEN-401: worker not authorised
-- worker claims the oldest                   | true / ambience / 7
-- completing twice returns the same asset    | true
-- queue empty afterwards                     | empty
-- generated file is an asset in Audio ...    | succeeded / audio / audio / Ambience — Exterior harbour ambience — rain, dawn / generated / 1 / true
-- version 1 says how it was made             | Generated by aurastage-synth (synth-1) for: Exterior harbour ambience — rain, dawn
-- provenance on the file                     | aurastage-synth native
-- failed keeps the reason                    | failed / Provider busy
-- audit trail                                | AssetRegistered,AudioGenerated,AudioGenerationRequested,AudioGenerationRequested
-- audit rows carry the project               | true
