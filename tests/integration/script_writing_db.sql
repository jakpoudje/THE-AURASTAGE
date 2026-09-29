-- Integration test for migration 0030 (AuraScript writing jobs: queue, rate limit, worker claim/progress/complete/fail,
-- writer-saved outline, mark as used). Rolled back (the final raise aborts). People: O owns the studio; W is a Casting Director
-- (script: view only) on project A; X is an outsider.
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
declare o public.organizations; a uuid; v public.script_versions;
begin
  o := public.create_organization('T','t-writing');
  insert into public.projects(org_id,title) values (o.id,'A') returning id into a;
  v := public.save_script_version(a, null, 'INT. FLAT - NIGHT', '[]'::jsonb, 'p', 'first');
  insert into ids values ('org', o.id), ('a', a), ('v', v.id);
end $$;
reset role;
insert into public.org_members(org_id, user_id, role) select v, '33333333-3333-3333-3333-333333333333', 'member' from ids where k = 'org';
insert into public.project_members(project_id, org_id, user_id, role) select (select v from ids where k = 'a'), v, '33333333-3333-3333-3333-333333333333', 'casting_director' from ids where k = 'org';
set local role authenticated;

select pg_temp.as_user('O');
do $$
declare a uuid := (select v from ids where k = 'a'); g public.script_generations; u public.script_generations; i int;
begin
  g := public.request_script_generation(a, 'develop_story', null, 'make it tense', '{"brief":{}}', null, '1.0.0');
  insert into ids values ('dev', g.id);
  insert into r(step, ok) values ('queued with a job', g.status || ' / ' || (g.job_id is not null)::text || ' / ' || g.source);
  begin perform public.request_script_generation(a, 'outline', gen_random_uuid(), '', '{}', null, '1.0.0'); insert into r(step, ok) values ('unknown parent refused', 'NO');
  exception when others then insert into r(step, ok) values ('unknown parent refused', sqlerrm); end;
  begin perform public.request_script_generation(a, 'write_script', g.id, '', '{}', null, '1.0.0', 'user', '{"scenes":[]}'); insert into r(step, ok) values ('only a story or an outline can be saved by hand', 'NO');
  exception when others then insert into r(step, ok) values ('only a story or an outline can be saved by hand', sqlerrm); end;
  u := public.request_script_generation(a, 'develop_story', null, '', '{}', null, '1.1.0', 'user', '{"characters":[{"name":"Amara"}]}');
  insert into r(step, ok) values ('writer-saved story is done at once (0033)', u.status || ' / ' || u.provider || ' / ' || (u.job_id is null)::text);
  u := public.request_script_generation(a, 'outline', g.id, '', '{}', null, '1.0.0', 'user', '{"scenes":[{"number":1}]}');
  insert into r(step, ok) values ('writer-saved outline is done at once, no job', u.status || ' / ' || u.provider || ' / ' || (u.job_id is null)::text);
  for i in 1..5 loop perform public.request_script_generation(a, 'outline', g.id, '', '{}', null, '1.0.0'); end loop;
  begin perform public.request_script_generation(a, 'outline', g.id, '', '{}', null, '1.0.0'); insert into r(step, ok) values ('rate limit', 'NO');
  exception when others then insert into r(step, ok) values ('rate limit', sqlerrm); end;
end $$;

select pg_temp.as_user('W');
do $$
declare a uuid := (select v from ids where k = 'a');
begin
  begin perform public.request_script_generation(a, 'develop_story', null, '', '{}', null, '1.0.0'); insert into r(step, ok) values ('casting director can''t request writing', 'NO');
  exception when others then insert into r(step, ok) values ('casting director can''t request writing', split_part(sqlerrm, '.', 1)); end;
  insert into r(step, ok) values ('casting director sees the jobs', (select count(*) from public.script_generations where project_id = a)::text);
end $$;
select pg_temp.as_user('X');
do $$
declare a uuid := (select v from ids where k = 'a');
begin
  begin perform public.mark_script_generation((select v from ids where k = 'dev'), '{}', null); insert into r(step, ok) values ('outsider can''t mark', 'NO');
  exception when others then insert into r(step, ok) values ('outsider can''t mark', split_part(sqlerrm, '.', 1)); end;
  insert into r(step, ok) values ('outsider sees nothing', (select count(*) from public.script_generations where project_id = a)::text);
end $$;

reset role;
set local role anon;
do $$
declare c jsonb; dev uuid := (select v from ids where k = 'dev'); n int := 0;
begin
  begin perform public.worker_claim_script_generation('wrong-token-0123456789abcdef0123456789'); insert into r(step, ok) values ('bad worker token refused', 'NO');
  exception when others then insert into r(step, ok) values ('bad worker token refused', sqlerrm); end;
  c := public.worker_claim_script_generation('wd-token-0123456789abcdef0123456789abcdef');
  insert into r(step, ok) values ('worker claims the oldest queued job', ((c->>'id')::uuid = dev)::text || ' / ' || (c->>'status') || ' / ' || (c->>'attempt'));
  perform public.worker_progress_script_generation('wd-token-0123456789abcdef0123456789abcdef', dev, '{"done":1,"total":2}', '{"scenes":[{"number":1}]}');
  perform public.worker_complete_script_generation('wd-token-0123456789abcdef0123456789abcdef', dev, '{"logline":"x"}', '[{"id":"c","ok":true}]', 'test', 'test-writer', true, '{"calls":1}');
  perform public.worker_complete_script_generation('wd-token-0123456789abcdef0123456789abcdef', dev, '{"logline":"overwritten"}', '[]', 'test', 'test-writer', true, '{}');
  insert into ids values ('dev_done', dev);
  c := public.worker_claim_script_generation('wd-token-0123456789abcdef0123456789abcdef');
  perform public.worker_fail_script_generation('wd-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid, 'backend down');
  insert into ids values ('failed', (c->>'id')::uuid);
end $$;
reset role;
set local role authenticated;
select pg_temp.as_user('O');
do $$
declare a uuid := (select v from ids where k = 'a'); g public.script_generations; f public.script_generations; m public.script_generations;
begin
  select * into g from public.script_generations where id = (select v from ids where k = 'dev_done');
  insert into r(step, ok) values ('completed once, never overwritten', g.status || ' / ' || (g.output->>'logline') || ' / ' || (g.progress->>'done') || ' / ' || g.test_output::text || ' / ' || (select status from public.jobs where id = g.job_id));
  select * into f from public.script_generations where id = (select v from ids where k = 'failed');
  insert into r(step, ok) values ('failure recorded on the job too', f.status || ' / ' || f.error || ' / ' || (select status from public.jobs where id = f.job_id));
  begin perform public.mark_script_generation(g.id, null, gen_random_uuid()); insert into r(step, ok) values ('mark with a version from elsewhere refused', 'NO');
  exception when others then insert into r(step, ok) values ('mark with a version from elsewhere refused', sqlerrm); end;
  m := public.mark_script_generation(g.id, '{"fields":["logline"]}', (select v from ids where k = 'v'));
  insert into r(step, ok) values ('marked as used with the draft version', (m.accepted->'fields'->>0) || ' / ' || (m.result_version_id = (select v from ids where k = 'v'))::text);
  insert into r(step, ok) values ('audit trail', (select string_agg(distinct action, ',' order by action) from public.audit_events where action like 'Script%Writ%' or action in ('ScriptOutlineEdited','ScriptStoryEdited')));
end $$;

do $x$ begin raise exception 'RESULTS: %', (select string_agg(step || ' => ' || ok, ' || ' order by n) from r); end $x$;

-- Expected (live, 2026-09-29):
-- queued with a job                          | queued / true / model
-- unknown parent refused                     | AURA-SCR-404: that earlier step isn't in this project
-- only a story or an outline can be saved by hand | AURA-SCR-400: only a story or an outline can be saved by hand (0033)
-- writer-saved story is done at once         | succeeded / writer / true
-- writer-saved outline is done at once       | succeeded / writer / true
-- rate limit                                 | AURA-SCR-429: that's a lot of writing requests in a minute — give it a moment
-- casting director can't request writing     | AURA-COL-403: your role (Casting Director) can't edit in Scriptwriter
-- casting director sees the jobs             | 8
-- outsider can't mark                        | AURA-COL-403: you don't have access to this project
-- outsider sees nothing                      | 0
-- bad worker token refused                   | AURA-GEN-401: worker not authorised
-- worker claims the oldest queued job        | true / running / 1
-- completed once, never overwritten          | succeeded / x / 1 / true / completed
-- failure recorded on the job too            | failed / backend down / failed
-- mark with a version from elsewhere refused | AURA-SCR-400: that script version isn't in this project
-- marked as used with the draft version      | logline / true
-- audit trail                                | ScriptOutlineEdited,ScriptStoryEdited,ScriptWritingCompleted,ScriptWritingRequested,ScriptWritingUsed (0033)
