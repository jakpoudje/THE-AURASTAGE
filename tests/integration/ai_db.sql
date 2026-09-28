-- Integration test for migration 0025 (Ask AuraStage proposals: request, planning worker, outcome, privacy). Rolled back.
-- People: O owns the studio; W is a Writer on project A; X is an outsider.
begin;
insert into auth.users(id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111','owner@aurastage.invalid','authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','writer@aurastage.invalid','authenticated','authenticated');
insert into public.worker_credentials(name, token_hash) values ('ai-test', encode(extensions.digest('ai-token-0123456789abcdef0123456789abcdef', 'sha256'), 'hex'));
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
declare o public.organizations; a uuid;
begin
  o := public.create_organization('T','t-ai');
  insert into public.projects(org_id,title) values (o.id,'A') returning id into a;
  insert into ids values ('org', o.id), ('a', a);
end $$;
reset role;
insert into public.org_members(org_id, user_id, role) select v, '33333333-3333-3333-3333-333333333333', 'member' from ids where k = 'org';
insert into public.project_members(project_id, org_id, user_id, role) select (select v from ids where k = 'a'), v, '33333333-3333-3333-3333-333333333333', 'writer' from ids where k = 'org';
set local role authenticated;

select pg_temp.as_user('O');
do $$
declare a uuid := (select v from ids where k = 'a'); p public.ai_proposals;
begin
  p := public.request_ai_proposal(a, 'scene_dna', null, null, null, '  Make scene 2 night  ', 'suggest', '{"operation":"MODIFY_SCENE"}', '{"prompt":"P"}', '1.0.0');
  insert into ids values ('p1', p.id);
  insert into r(step, ok) values ('request is queued with a planning job', p.status || ' / ' || p.request || ' / ' || (select engine_id || ' ' || status from public.jobs where id = p.job_id));
  begin perform public.request_ai_proposal(a, 'nowhere', null, null, null, 'Make it night', 'suggest', '{}', '{}', '1.0.0'); insert into r(step, ok) values ('unknown workspace refused', 'NO');
  exception when others then insert into r(step, ok) values ('unknown workspace refused', 'refused'); end;
  begin perform public.set_ai_proposal_outcome(p.id, 'applying', null, null); insert into r(step, ok) values ('can''t apply before it is planned', 'NO');
  exception when others then insert into r(step, ok) values ('can''t apply before it is planned', sqlerrm); end;
end $$;

-- The writer asks too (they can see the project); the outsider can't.
select pg_temp.as_user('W');
do $$
declare p public.ai_proposals;
begin
  p := public.request_ai_proposal((select v from ids where k = 'a'), 'script', null, null, null, 'Change the title to Tide', 'suggest', '{}', '{}', '1.0.0');
  insert into ids values ('p2', p.id);
  insert into r(step, ok) values ('writer sees only their own request', (select count(*)::text from public.ai_proposals));
  begin perform public.set_ai_proposal_outcome((select v from ids where k = 'p1'), 'rejected', null, null); insert into r(step, ok) values ('writer can''t decide the owner''s request', 'NO');
  exception when others then insert into r(step, ok) values ('writer can''t decide the owner''s request', sqlerrm); end;
end $$;
select pg_temp.as_user('X');
do $$ begin
  begin perform public.request_ai_proposal((select v from ids where k = 'a'), 'script', null, null, null, 'Change the title', 'suggest', '{}', '{}', '1.0.0'); insert into r(step, ok) values ('outsider can''t ask', 'NO');
  exception when others then insert into r(step, ok) values ('outsider can''t ask', sqlerrm); end;
  insert into r(step, ok) values ('outsider sees nothing', (select count(*)::text from public.ai_proposals));
end $$;

-- The planning worker: token-checked, oldest first, idempotent completion.
reset role;
set local role anon;
do $$
declare c jsonb; c2 jsonb;
begin
  begin perform public.worker_claim_ai_proposal('wrong-token-0123456789abcdef0123456789'); insert into r(step, ok) values ('bad worker token refused', 'NO');
  exception when others then insert into r(step, ok) values ('bad worker token refused', sqlerrm); end;
  c := public.worker_claim_ai_proposal('ai-token-0123456789abcdef0123456789abcdef');
  insert into r(step, ok) values ('worker claims the oldest with its frozen snapshot', ((c->>'id')::uuid = (select v from ids where k = 'p1'))::text || ' / ' || (c->'snapshot'->>'prompt'));
  perform public.worker_complete_ai_proposal('ai-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid,
    '{"summary":"Night","operation":"MODIFY_SCENE","calls":[{"tool":"updateSceneDNA","input_json":"{}","reason":"r"}],"not_possible":[],"questions":[]}', 'aurastage-test', 'aurastage-test-planner-1.0.0', true, null, null);
  perform public.worker_complete_ai_proposal('ai-token-0123456789abcdef0123456789abcdef', (c->>'id')::uuid, '{"summary":"again"}', 'x', 'x', false, null, null);
  c2 := public.worker_claim_ai_proposal('ai-token-0123456789abcdef0123456789abcdef');
  perform public.worker_fail_ai_proposal('ai-token-0123456789abcdef0123456789abcdef', (c2->>'id')::uuid, 'Claude is busy');
  insert into r(step, ok) values ('queue is empty afterwards', coalesce(public.worker_claim_ai_proposal('ai-token-0123456789abcdef0123456789abcdef')::text, 'empty'));
end $$;
reset role;
insert into r(step, ok) select 'plan recorded once, labelled test output; job completed',
  p.status || ' / ' || (p.plan->>'summary') || ' / ' || p.test_output || ' / ' || j.status || ' ' || (j.output_refs->>'calls')
  from public.ai_proposals p join public.jobs j on j.id = p.job_id where p.id = (select v from ids where k = 'p1');
insert into r(step, ok) select 'failed plan keeps the reason', p.status || ' / ' || p.error || ' / ' || j.status
  from public.ai_proposals p join public.jobs j on j.id = p.job_id where p.id = (select v from ids where k = 'p2');

set local role authenticated;
select pg_temp.as_user('O');
do $$
declare p uuid := (select v from ids where k = 'p1'); x public.ai_proposals;
begin
  x := public.set_ai_proposal_outcome(p, 'applying', null, null);
  x := public.set_ai_proposal_outcome(p, 'applied', '{"results":[1]}', null);
  begin perform public.set_ai_proposal_outcome(p, 'rejected', null, null); insert into r(step, ok) values ('applied can''t be rejected', 'NO');
  exception when others then insert into r(step, ok) values ('applied can''t be rejected', sqlerrm); end;
  x := public.set_ai_proposal_outcome(p, 'undone', null, null);
  insert into r(step, ok) values ('applied then undone; results kept', x.status || ' / ' || (x.results->'results')::text || ' / ' || (x.applied_at is not null and x.undone_at is not null)::text);
  insert into r(step, ok) values ('audit trail', (select string_agg(action, ',' order by created_at, action) from public.audit_events where object_type = 'AIProposal'));
  insert into r(step, ok) values ('audit rows carry the project', (select bool_and(project_id = (select v from ids where k = 'a'))::text from public.audit_events where object_type = 'AIProposal'));
end $$;

do $x$ begin raise exception 'RESULTS: %', (select string_agg(step || ' => ' || ok, ' || ' order by n) from r); end $x$;

-- Expected:
-- request is queued with a planning job                 | queued / Make scene 2 night / assistant.plan queued
-- unknown workspace refused                             | refused
-- can't apply before it is planned                      | AURA-AI-409: this request is queued; it can't become applying
-- writer sees only their own request                    | 1
-- writer can't decide the owner's request               | AURA-AI-404: request not found
-- outsider can't ask                                    | AURA-COL-403: you don't have access to this project
-- outsider sees nothing                                 | 0
-- bad worker token refused                              | AURA-GEN-401: worker not authorised
-- worker claims the oldest with its frozen snapshot     | true / P
-- queue is empty afterwards                             | empty
-- plan recorded once, labelled test output; job completed | proposed / Night / true / completed 1
-- failed plan keeps the reason                          | failed / Claude is busy / failed
-- applied can't be rejected                             | AURA-AI-409: this request is applied; it can't become rejected
-- applied then undone; results kept                     | undone / [1] / true
-- audit trail (same transaction: alphabetical)          | AIProposalApplied,AIProposalRequested,AIProposalRequested,AIProposalUndone
-- audit rows carry the project                          | true
