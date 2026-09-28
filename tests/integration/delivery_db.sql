-- Integration test for migration 0018 (Export & Deliver). Rolled back; expected results at the bottom.
-- Setup reuses the editorial fixture: one scene, an approved take for shot 1, an approved mix.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
create temp table r(step text, ok text);
create temp table ids(k text primary key, v uuid);
grant all on r, ids to authenticated, anon;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
declare o public.organizations; p uuid; v1 public.script_versions; sc uuid; dv public.scene_dna_versions; pv public.shot_plan_versions;
  s public.audio_sessions; av public.audio_session_versions; pkg public.generation_packages; tk uuid; sh1 uuid; sh2 uuid;
begin
  o := public.create_organization('T','t-deliver');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v1.id, '[{"number":1,"heading":"EXT. HARBOUR","int_ext":"EXT","location":"HARBOUR","time_of_day":"NIGHT","speaking_characters":[],"estimated_seconds":4,"element_start":0,"element_end":1,"content_hash":"h"}]', 'e');
  select id into sc from public.scenes where project_id = p;
  dv := public.approve_scene_dna(p, sc, '{}', '[]', 'sdna@1');
  perform public.generate_shot_plan(p, sc, dv.id, '[{"purpose":"establishing","size":"WS","duration_seconds":2,"description":"Wide","story_start":0,"story_end":2},{"purpose":"reaction","size":"CU","duration_seconds":2,"description":"Close","story_start":2,"story_end":4}]', 'shot@1');
  pv := public.approve_shot_plan(p, sc, '{"coverage":1}');
  select id into sh1 from public.shots where scene_id = sc and ordinal = 1;
  select id into sh2 from public.shots where scene_id = sc and ordinal = 2;
  pkg := public.create_generation_package(p, sc, sh1, pv.id, '{"prompt":"Wide"}', 'gen@1');
  select id into tk from public.request_takes(pkg.id, 'aurastage-sketch', 'sketch-v1', 'image', '{}', 1, 1, null, null);
  s := public.spot_audio_session(p, sc, pv.id, 4, '[{"key":"bg","name":"BG","family":"BG"}]', '[{"track_key":"bg","label":"Amb","start_seconds":0,"duration_seconds":4,"source":{}}]', 'aud@1');
  perform public.record_audio_measurement(s.id, jsonb_build_object('session_revision', (select revision from public.audio_sessions where id = s.id), 'integrated_lufs', -23, 'duration_seconds', 4, 'clip_count', 0, 'engine_version', '1.0.0'));
  av := public.approve_audio_session(p, sc);
  insert into ids values ('p', p), ('sc', sc), ('sh1', sh1), ('sh2', sh2), ('tk', tk), ('av', av.id);
end $$;
reset role;
insert into public.worker_credentials(name, token_hash) values ('it-render', encode(extensions.digest('it-render-token-0123456789abcdef0123456789', 'sha256'), 'hex'));
update public.takes set status = 'succeeded', storage_key = 'k', media_type = 'image/svg+xml' where id = (select v from ids where k = 'tk');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
declare p uuid := (select v from ids where k = 'p'); sc uuid := (select v from ids where k = 'sc'); sh1 uuid := (select v from ids where k = 'sh1');
  tk uuid := (select v from ids where k = 'tk'); av uuid := (select v from ids where k = 'av');
  t public.timelines; l public.picture_locks; rr public.renders; rr2 public.renders; claim jsonb; cancel boolean; m jsonb;
  TOKEN text := 'it-render-token-0123456789abcdef0123456789'; SHA text := repeat('a', 64);
begin
  t := public.save_timeline(p, null, jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'track', 'V1', 'kind', 'take', 'record_in', 0, 'duration', 96, 'source_in', 0, 'scene_id', sc, 'shot_id', sh1, 'take_id', tk, 'label', 'Shot 1'),
    jsonb_build_object('id', gen_random_uuid(), 'track', 'A1', 'kind', 'audio_mix', 'record_in', 0, 'duration', 96, 'source_in', 0, 'source_frames', 96, 'scene_id', sc, 'audio_session_version_id', av, 'label', 'Mix')),
    'assemble', 'x', 'e', false, null);
  m := jsonb_build_object('picture_lock', jsonb_build_object('id', gen_random_uuid()));
  begin perform public.create_render(p, gen_random_uuid(), 'streaming_master', '1.0.0', '{}', m, SHA, 'm@1'); insert into r values ('refused without a Picture Lock', 'NO');
  exception when others then insert into r values ('refused without a Picture Lock', sqlerrm); end;
  l := public.lock_picture(p, t.revision, '{"ready_for_lock":true}');
  begin perform public.create_render(p, l.id, 'streaming_master', '1.0.0', '{}', m, SHA, 'm@1'); insert into r values ('manifest must name the lock', 'NO');
  exception when others then insert into r values ('manifest must name the lock', sqlerrm); end;
  m := jsonb_build_object('picture_lock', jsonb_build_object('id', l.id));
  rr := public.create_render(p, l.id, 'streaming_master', '1.0.0', '{}', m, SHA, 'm@1');
  insert into r values ('queued with a MOS job', rr.status || ' / job ' || (select status from public.jobs where id = rr.job_id) || ' / lock ' || rr.lock_number);
  rr2 := public.create_render(p, l.id, 'subtitles', '1.0.0', '{}', m, SHA, 'm@1');
  rr2 := public.cancel_render(rr2.id);
  insert into r values ('cancel a waiting render', rr2.status || ' / job ' || (select status from public.jobs where id = rr2.job_id));
  begin perform public.cancel_render(rr2.id); insert into r values ('cancel twice refused', 'NO');
  exception when others then insert into r values ('cancel twice refused', sqlerrm); end;
  perform set_config('role', 'anon', true); 
  begin perform public.worker_claim_render('wrong-token-wrong-token-wrong-token-xx'); insert into r values ('worker needs its token', 'NO');
  exception when others then insert into r values ('worker needs its token', sqlerrm); end;
  perform set_config('role', 'authenticated', true);
  begin perform public.worker_claim_render(TOKEN); insert into r values ('signed-in users cannot act as the worker', 'NO');
  exception when others then insert into r values ('signed-in users cannot act as the worker', sqlerrm); end;
  perform set_config('role', 'anon', true); 
  claim := public.worker_claim_render(TOKEN);
  insert into r values ('worker claims the oldest queued render', ((claim->'render'->>'id')::uuid = rr.id)::text || ' / manifest lock ' || (claim->'manifest'->'picture_lock'->>'id' = l.id::text)::text);
  insert into r values ('nothing else to claim', coalesce(public.worker_claim_render(TOKEN)::text, 'null'));
  cancel := public.worker_render_progress(TOKEN, rr.id, 42, 'Encoding picture');
  perform set_config('role', 'authenticated', true);
  insert into r select 'progress heartbeat', progress || ' / ' || stage || ' / cancel ' || cancel::text from public.renders where id = rr.id;
  perform set_config('role', 'anon', true);
  perform public.worker_complete_render(TOKEN, rr.id, '[{"name":"streaming_1080p24.mp4","storage_key":"k","media_type":"video/mp4","bytes":10,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]', '{"checks":[]}', true);
  perform public.worker_complete_render(TOKEN, rr.id, '[]', '{}', false); -- idempotent
  perform set_config('role', 'authenticated', true);
  insert into r select 'completed once (idempotent)', status || ' / ' || stage || ' / ' || jsonb_array_length(outputs) || ' file / job ' || (select status from public.jobs where id = rr.job_id) from public.renders where id = rr.id;
  rr2 := public.create_render(p, l.id, 'review_copy', '1.0.0', '{}', m, SHA, 'm@1');
  perform set_config('role', 'anon', true); claim := public.worker_claim_render(TOKEN); perform set_config('role', 'authenticated', true);
  rr2 := public.cancel_render(rr2.id);
  perform set_config('role', 'anon', true); cancel := public.worker_render_progress(TOKEN, rr2.id, 10, 'x');
  perform public.worker_fail_render(TOKEN, rr2.id, 'cancelled by request'); perform set_config('role', 'authenticated', true);
  insert into r select 'cancel a running render', cancel::text || ' / ' || status from public.renders where id = rr2.id;
  rr := public.set_render_review(rr.id, 'stale', 'Made from Picture Lock 1, which has been broken');
  insert into r values ('stale flag keeps files', rr.review_state || ' / ' || jsonb_array_length(rr.outputs) || ' file');
  insert into r select 'audit', string_agg(distinct action, ',' order by action) from public.audit_events where object_type = 'Render';
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  insert into r select 'outsider sees', count(*)::text from public.renders where project_id = p;
  begin perform public.create_render(p, l.id, 'streaming_master', '1.0.0', '{}', m, SHA, 'm@1'); insert into r values ('outsider render blocked', 'NO');
  exception when others then insert into r values ('outsider render blocked', sqlerrm); end;
  begin perform public.cancel_render(rr.id); insert into r values ('outsider cancel blocked', 'NO');
  exception when others then insert into r values ('outsider cancel blocked', sqlerrm); end;
end $$;
select * from r;
rollback;
-- Expected (verified live 2026-09-28):
-- refused without a Picture Lock            | AURA-EXP-412: renders are made from the current Picture Lock — lock the picture in Editorial first
-- manifest must name the lock               | AURA-EXP-400: the manifest was not compiled from this Picture Lock
-- queued with a MOS job                     | queued / job queued / lock 1
-- cancel a waiting render                   | cancelled / job cancelled
-- cancel twice refused                      | AURA-EXP-409: only a waiting or running render can be cancelled
-- worker needs its token                    | AURA-GEN-401: worker not authorised
-- signed-in users cannot act as the worker  | permission denied for function worker_claim_render
-- worker claims the oldest queued render    | true / manifest lock true
-- nothing else to claim                     | null
-- progress heartbeat                        | 42 / Encoding picture / cancel false
-- completed once (idempotent)               | succeeded / QC passed / 1 file / job completed
-- cancel a running render                   | true / cancelled
-- stale flag keeps files                    | stale / 1 file
-- audit                                     | RenderCancelled,RenderCancelRequested,RenderCompleted,RenderRequested,UpstreamVersionChanged
-- outsider sees                             | 0
-- outsider render blocked                   | AURA-COL-403: you don't have access to this project (permission gate, migration 0019)
-- outsider cancel blocked                   | AURA-COL-403: you don't have access to this project (permission gate, migration 0019)
