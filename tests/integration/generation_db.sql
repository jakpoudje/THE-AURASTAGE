-- Integration test for migration 0013 (Visual Generation). Rolled back; expected results at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
insert into public.worker_credentials(name, token_hash) values ('test-worker', encode(extensions.digest('test-worker-token-0123456789abcdef0123456789', 'sha256'), 'hex'));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(step text, ok text) on commit drop;
grant all on r to anon;
do $$
declare o public.organizations; p uuid; v1 public.script_versions; sc uuid; dv public.scene_dna_versions; pl public.shot_plans;
  pv public.shot_plan_versions; shot uuid; pkg public.generation_packages; t public.takes; t2 public.takes; n int; claim jsonb;
begin
  o := public.create_organization('T','t-gen');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v1.id, '[{"number":1,"heading":"EXT. HARBOUR","int_ext":"EXT","location":"HARBOUR","time_of_day":"NIGHT","speaking_characters":[],"estimated_seconds":4,"element_start":0,"element_end":1,"content_hash":"h"}]', 'e');
  select id into sc from public.scenes where project_id = p and number = 1;
  dv := public.approve_scene_dna(p, sc, '{}', '[]', 'sdna@1');
  pl := public.generate_shot_plan(p, sc, dv.id, '[{"purpose":"establishing","size":"WS","duration_seconds":4,"description":"Wide of the harbour","story_start":0,"story_end":4}]', 'shot@1');
  select id into shot from public.shots where plan_id = pl.id;
  begin perform public.create_generation_package(p, sc, shot, dv.id, '{}', 'gen@1'); insert into r values ('refused before shot plan approval', 'NO');
  exception when others then insert into r values ('refused before shot plan approval', sqlerrm); end;
  pv := public.approve_shot_plan(p, sc, '{"coverage":1}');
  begin perform public.create_generation_package(p, sc, gen_random_uuid(), pv.id, '{}', 'gen@1'); insert into r values ('unknown shot refused', 'NO');
  exception when others then insert into r values ('unknown shot refused', sqlerrm); end;
  pkg := public.create_generation_package(p, sc, shot, pv.id, '{"prompt":"Wide of the harbour"}', 'gen@1');
  insert into r values ('package compiled from approved versions', (pkg.shot_plan_version_id = pv.id and pkg.scene_dna_version_id = dv.id)::text);
  select count(*) into n from public.request_takes(pkg.id, 'aurastage-sketch', 'sketch-v1', 'image', '{"aspect_ratio":"16:9"}', 7, 2, null, 'k1');
  insert into r values ('two takes queued', n::text);
  select count(*) into n from public.request_takes(pkg.id, 'aurastage-sketch', 'sketch-v1', 'image', '{}', 7, 2, null, 'k1');
  insert into r select 'same idempotency key does not duplicate', n || ' returned / ' || count(*) || ' total' from public.takes where shot_id = shot;
  insert into r select 'seeds + numbers', string_agg(take_number || ':' || seed, ',' order by take_number) from public.takes where shot_id = shot;
  select * into t from public.takes where shot_id = shot and take_number = 1;
  begin perform public.set_take_approval(t.id, 'approved'); insert into r values ('cannot approve unfinished', 'NO');
  exception when others then insert into r values ('cannot approve unfinished', sqlerrm); end;
  select * into t2 from public.takes where shot_id = shot and take_number = 2;
  t2 := public.cancel_take(t2.id);
  insert into r select 'cancel waiting take', t2.status || ' / job ' || (select status from public.jobs where id = t2.job_id);
  -- worker side (anon + token)
  reset role; set local role anon;
  begin perform public.worker_claim_take('wrong-token-wrong-token-wrong-token-xx'); insert into r values ('bad worker token refused', 'NO');
  exception when others then insert into r values ('bad worker token refused', sqlerrm); end;
  claim := public.worker_claim_take('test-worker-token-0123456789abcdef0123456789');
  insert into r values ('worker claims oldest waiting take', (claim->'take'->>'take_number') || ' / ' || (claim->'take'->>'status') || ' / prompt ' || (claim->'package'->>'prompt'));
  perform public.worker_complete_take('test-worker-token-0123456789abcdef0123456789', t.id, 'takes/x.svg', 'image/svg+xml', 'req-1', 0);
  perform public.worker_complete_take('test-worker-token-0123456789abcdef0123456789', t.id, 'takes/other.svg', 'image/svg+xml', 'req-2', 0);
  insert into r values ('nothing left to claim', coalesce(public.worker_claim_take('test-worker-token-0123456789abcdef0123456789')::text, 'null'));
  reset role; set local role authenticated;
  select * into t from public.takes where id = t.id;
  insert into r select 'complete is idempotent', t.status || ' / ' || t.storage_key || ' / job ' || (select status from public.jobs where id = t.job_id);
  t := public.set_take_approval(t.id, 'approved');
  select * into t2 from public.request_takes(pkg.id, 'aurastage-sketch', 'sketch-v1', 'image', '{}', null, 1, null, null);
  reset role; set local role anon;
  claim := public.worker_claim_take('test-worker-token-0123456789abcdef0123456789');
  perform public.worker_fail_take('test-worker-token-0123456789abcdef0123456789', t2.id, 'Provider said no', 'req-3');
  reset role; set local role authenticated;
  select * into t2 from public.takes where id = t2.id;
  insert into r values ('failure recorded with reason', t2.status || ' / ' || t2.error);
  perform public.request_takes(pkg.id, 'aurastage-sketch', 'sketch-v1', 'image', '{}', null, 1, null, null);
  reset role; set local role anon;
  claim := public.worker_claim_take('test-worker-token-0123456789abcdef0123456789');
  perform public.worker_complete_take('test-worker-token-0123456789abcdef0123456789', (claim->'take'->>'id')::uuid, 'takes/y.svg', 'image/svg+xml', null, 0);
  reset role; set local role authenticated;
  perform public.set_take_approval((claim->'take'->>'id')::uuid, 'approved');
  insert into r select 'approving another supersedes (kept)', string_agg(take_number || ':' || approval, ',' order by take_number) from public.takes where shot_id = shot;
  -- upstream change: shot plan edited -> package can't be used until recompiled
  perform public.update_shot(shot, '{"angle":"low"}');
  begin perform public.request_takes(pkg.id, 'aurastage-sketch', 'sketch-v1', 'image', '{}', null, 1, null, null); insert into r values ('stale package refused', 'NO');
  exception when others then insert into r values ('stale package refused', sqlerrm); end;
  insert into r select 'audit', string_agg(distinct action, ',') from public.audit_events where org_id = o.id and (action like 'Take%' or action like 'Generation%');
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  insert into r select 'outsider sees', count(*)::text from public.takes where project_id = p;
  begin perform public.set_take_approval(t.id, 'rejected'); insert into r values ('outsider approval blocked', 'NO');
  exception when others then insert into r values ('outsider approval blocked', sqlerrm); end;
end $$;
reset role;
select * from r;
rollback;
-- Expected (verified live 2026-09-28):
-- refused before shot plan approval        | AURA-GEN-412: approve this scene's shot plan first — generation uses the approved version
-- unknown shot refused                     | AURA-GEN-404: that shot is not in the approved shot plan
-- package compiled from approved versions  | true
-- two takes queued                         | 2
-- same idempotency key does not duplicate  | 2 returned / 2 total
-- seeds + numbers                          | 1:7,2:8
-- cannot approve unfinished                | AURA-GEN-409: only a finished take can be approved
-- cancel waiting take                      | cancelled / job cancelled
-- bad worker token refused                 | AURA-GEN-401: worker not authorised
-- worker claims oldest waiting take        | 1 / running / prompt Wide of the harbour
-- nothing left to claim                    | null
-- complete is idempotent                   | succeeded / takes/x.svg / job completed
-- failure recorded with reason             | failed / Provider said no
-- approving another supersedes (kept)      | 1:superseded,2:pending,3:pending,4:approved
-- stale package refused                    | AURA-GEN-412: the shot plan changed since this was compiled — approve it and compile again
--   (regression: first run allowed takes after the plan was edited back to draft; fixed in 0013 request_takes)
-- audit                                    | GenerationPackageCompiled,TakeApproved,TakeFailed,TakeGenerated,TakesRequested
-- outsider sees                            | 0
-- outsider approval blocked                | AURA-COL-403: you don't have access to this project (permission gate, migration 0019)
