-- Integration test for migration 0017 (Editorial & Timeline). Rolled back; expected results at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
create temp table r(step text, ok text);
create temp table ids(k text primary key, v uuid);
grant all on r, ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
declare o public.organizations; p uuid; v1 public.script_versions; sc uuid; dv public.scene_dna_versions; pv public.shot_plan_versions;
  s public.audio_sessions; av public.audio_session_versions; pkg public.generation_packages; tk uuid; sh1 uuid; sh2 uuid;
begin
  o := public.create_organization('T','t-edit');
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
update public.takes set status = 'succeeded', storage_key = 'k', media_type = 'image/svg+xml' where id = (select v from ids where k = 'tk');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
declare p uuid := (select v from ids where k = 'p'); sc uuid := (select v from ids where k = 'sc'); sh1 uuid := (select v from ids where k = 'sh1');
  sh2 uuid := (select v from ids where k = 'sh2'); tk uuid := (select v from ids where k = 'tk'); av uuid := (select v from ids where k = 'av');
  t public.timelines; rev uuid; l public.picture_locks; ver public.timeline_versions; clips jsonb; good jsonb;
  c_take jsonb; c_slug jsonb; c_mix jsonb;
begin
  c_take := jsonb_build_object('id', gen_random_uuid(), 'track', 'V1', 'kind', 'take', 'record_in', 0, 'duration', 48, 'source_in', 0, 'source_frames', null, 'scene_id', sc, 'shot_id', sh1, 'take_id', tk, 'label', 'Shot 1');
  c_slug := jsonb_build_object('id', gen_random_uuid(), 'track', 'V1', 'kind', 'slug', 'record_in', 48, 'duration', 48, 'source_in', 0, 'scene_id', sc, 'shot_id', sh2, 'label', 'Shot 2 — no approved take');
  c_mix := jsonb_build_object('id', gen_random_uuid(), 'track', 'A1', 'kind', 'audio_mix', 'record_in', 0, 'duration', 96, 'source_in', 0, 'source_frames', 96, 'scene_id', sc, 'audio_session_version_id', av, 'label', 'Scene 1 mix v1');
  t := public.save_timeline(p, null, jsonb_build_array(c_take, c_slug, c_mix), 'assemble', 'first assembly', 'asm@1', false, null);
  insert into r select 'first assembly saved', count(*) || ' clips / ' || t.status from public.timeline_clips where timeline_id = t.id;
  rev := t.revision;
  begin perform public.save_timeline(p, gen_random_uuid(), '[]', 'edit', 'x', 'e', false, null); insert into r values ('stale revision refused', 'NO');
  exception when others then insert into r values ('stale revision refused', sqlerrm); end;
  begin perform public.save_timeline(p, rev, jsonb_build_array(c_take || jsonb_build_object('take_id', gen_random_uuid())), 'edit', 'x', 'e', false, null); insert into r values ('unknown take refused', 'NO');
  exception when others then insert into r values ('unknown take refused', sqlerrm); end;
  begin perform public.save_timeline(p, rev, jsonb_build_array(c_take || jsonb_build_object('shot_id', sh2)), 'edit', 'x', 'e', false, null); insert into r values ('take of another shot refused', 'NO');
  exception when others then insert into r values ('take of another shot refused', sqlerrm); end;
  begin perform public.save_timeline(p, rev, jsonb_build_array(c_mix || jsonb_build_object('audio_session_version_id', gen_random_uuid())), 'edit', 'x', 'e', false, null); insert into r values ('unknown mix refused', 'NO');
  exception when others then insert into r values ('unknown mix refused', sqlerrm); end;
  begin perform public.save_timeline(p, rev, jsonb_build_array(c_take, c_slug || jsonb_build_object('record_in', 40)), 'edit', 'x', 'e', false, null); insert into r values ('overlap refused', 'NO');
  exception when others then insert into r values ('overlap refused', sqlerrm); end;
  begin perform public.save_timeline(p, rev, jsonb_build_array(c_mix || jsonb_build_object('duration', 200)), 'edit', 'x', 'e', false, null); insert into r values ('past end of source refused', 'NO');
  exception when others then insert into r values ('past end of source refused', sqlerrm); end;
  select revision into rev from public.timelines where id = t.id;
  insert into r values ('refusals changed nothing', (rev = t.revision)::text || ' / ' || (select count(*) from public.timeline_clips where timeline_id = t.id));
  begin perform public.lock_picture(p, rev, '{"ready_for_lock":false}'); insert into r values ('lock needs passing checks', 'NO');
  exception when others then insert into r values ('lock needs passing checks', sqlerrm); end;
  begin perform public.lock_picture(p, rev, '{"ready_for_lock":true}'); insert into r values ('lock re-checks offline media', 'NO');
  exception when others then insert into r values ('lock re-checks offline media', sqlerrm); end;
  good := jsonb_build_array(c_take || '{"duration":96}'::jsonb, c_mix);
  t := public.save_timeline(p, rev, good, 'extract', 'removed slug', 'e@1', false, null);
  l := public.lock_picture(p, t.revision, '{"ready_for_lock":true}');
  select * into t from public.timelines where id = t.id;
  select * into ver from public.timeline_versions where id = l.version_id;
  insert into r values ('picture locked', t.status || ' / lock ' || l.lock_number || ' / ' || ver.kind || ' / ' || jsonb_array_length(ver.clips) || ' clips / ' || ver.duration_frames || 'f');
  begin perform public.save_timeline(p, t.revision, good, 'trim', 'x', 'e', false, null); insert into r values ('locked picture refuses silent edits', 'NO');
  exception when others then insert into r values ('locked picture refuses silent edits', sqlerrm); end;
  t := public.save_timeline(p, t.revision, jsonb_build_array(c_take || '{"duration":90}'::jsonb, c_mix), 'trim', 'trim end', 'e@1', true, '[{"label":"Scene 1","change":"retimed"}]');
  select * into l from public.picture_locks where id = l.id;
  insert into r values ('break is recorded with impact', t.status || ' / broken ' || (l.broken_at is not null)::text || ' / ' || (l.impact->0->>'change'));
  ver := public.save_timeline_version(p, 'Director''s cut', 'manual', '{}');
  insert into r values ('named version', ver.version_number || ' ' || ver.label || ' / ' || ver.duration_frames || 'f');
  t := public.set_timeline_review(p, 'review_required', 'A newer take was approved for Shot 1');
  insert into r values ('review flag', t.review_state || ' / cut untouched ' || ((select count(*) from public.timeline_clips where timeline_id = t.id) = 2)::text);
  insert into r select 'audit', string_agg(distinct action, ',' order by action) from public.audit_events where object_type = 'Timeline' and object_id = t.id;
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  insert into r select 'outsider sees', count(*)::text from public.timeline_clips where project_id = p;
  begin perform public.save_timeline(p, t.revision, '[]', 'x', 'x', 'e', true, null); insert into r values ('outsider edit blocked', 'NO');
  exception when others then insert into r values ('outsider edit blocked', sqlerrm); end;
  begin perform public.lock_picture(p, t.revision, '{"ready_for_lock":true}'); insert into r values ('outsider lock blocked', 'NO');
  exception when others then insert into r values ('outsider lock blocked', sqlerrm); end;
end $$;
select * from r;
rollback;
-- Expected (verified live 2026-09-28):
-- first assembly saved                 | 3 clips / draft
-- stale revision refused               | AURA-EDT-409: the timeline changed — reload and try again
-- unknown take refused                 | insert or update on table "timeline_clips" violates foreign key constraint "timeline_clips_take_id_fkey"  (API maps 23503 -> 400)
-- take of another shot refused         | AURA-EDT-400: “Shot 1” needs a finished take of its shot from this project
-- unknown mix refused                  | ... violates foreign key constraint "timeline_clips_audio_session_version_id_fkey"
-- overlap refused                      | AURA-EDT-400: “Shot 2 — no approved take” overlaps the clip before it
-- past end of source refused           | new row for relation "timeline_clips" violates check constraint "timeline_clips_source"  (API maps 23514 -> 400)
-- refusals changed nothing             | true / 3
-- lock needs passing checks            | AURA-EDT-412: the timeline checks must pass before Picture Lock
-- lock re-checks offline media         | AURA-EDT-412: every shot needs an approved take before Picture Lock
-- picture locked                       | locked / lock 1 / picture_lock / 2 clips / 96f
-- locked picture refuses silent edits  | AURA-EDT-423: the picture is locked — breaking the lock needs confirmation
-- break is recorded with impact        | draft / broken true / retimed
-- named version                        | 2 Director's cut / 96f
-- review flag                          | review_required / cut untouched true
-- audit                                | PictureLockBroken,PictureLocked,TimelineEdited,TimelineVersionSaved,UpstreamVersionChanged
-- outsider sees                        | 0
-- outsider edit blocked                | AURA-EDT-403: not allowed to edit this project's timeline
-- outsider lock blocked                | AURA-EDT-403: not allowed to edit this project's timeline
