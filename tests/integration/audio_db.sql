-- Integration test for migration 0015 (Audio Studio + register_asset). Rolled back; expected results at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(step text, ok text) on commit drop;
do $$
declare o public.organizations; p uuid; p2 uuid; v1 public.script_versions; sc uuid; dv public.scene_dna_versions; pl public.shot_plans; pv public.shot_plan_versions;
  s public.audio_sessions; a public.assets; a2 public.assets; c public.audio_clips; dx uuid; m public.audio_measurements; av public.audio_session_versions; rev uuid;
begin
  o := public.create_organization('T','t-audio');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  insert into public.projects(org_id,title) values (o.id,'Other') returning id into p2;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v1.id, '[{"number":1,"heading":"EXT. HARBOUR","int_ext":"EXT","location":"HARBOUR","time_of_day":"NIGHT","speaking_characters":[],"estimated_seconds":8,"element_start":0,"element_end":1,"content_hash":"h"}]', 'e');
  select id into sc from public.scenes where project_id = p;
  dv := public.approve_scene_dna(p, sc, '{}', '[]', 'sdna@1');
  pl := public.generate_shot_plan(p, sc, dv.id, '[{"purpose":"establishing","size":"WS","duration_seconds":8,"description":"Wide","story_start":0,"story_end":8}]', 'shot@1');
  begin perform public.spot_audio_session(p, sc, gen_random_uuid(), 8, '[]', '[]', 'aud@1'); insert into r values ('refused before shot plan approval', 'NO');
  exception when others then insert into r values ('refused before shot plan approval', sqlerrm); end;
  pv := public.approve_shot_plan(p, sc, '{"coverage":1}');
  s := public.spot_audio_session(p, sc, pv.id, 8,
    '[{"key":"dx:t","name":"DX — Tunde","family":"DX"},{"key":"bg","name":"BG — Ambience","family":"BG"}]',
    '[{"track_key":"dx:t","label":"TUNDE: You came.","start_seconds":4,"duration_seconds":1,"source":{"dialogue_line_id":"l1"}},{"track_key":"bg","label":"Harbour ambience","start_seconds":0,"duration_seconds":8,"source":{"cue":"ambience"}}]',
    'aud@1');
  insert into r select 'spotted', count(*) || ' tracks / ' || (select count(*) from public.audio_clips where session_id = s.id) || ' cues' from public.audio_tracks where session_id = s.id;
  a := public.register_asset(p, 'audio', 'tunde_line1.wav', 'o/p/assets/x.wav', 'sha', '{"duration_seconds":1.2,"size_bytes":1000}');
  a2 := public.register_asset(p2, 'audio', 'other.wav', 'o/p2/assets/y.wav', 'sha2', '{}');
  begin perform public.register_asset(p, 'virus', 'x', 'k', null, '{}'); insert into r values ('unknown asset type refused', 'NO');
  exception when others then insert into r values ('unknown asset type refused', sqlerrm); end;
  select id into dx from public.audio_tracks where session_id = s.id and key = 'dx:t';
  select * into c from public.audio_clips where track_id = dx;
  c := public.save_audio_clip(s.id, c.id, jsonb_build_object('asset_id', a.id, 'gain_db', -3));
  insert into r values ('cue becomes a recording', c.kind || ' / gain ' || c.gain_db);
  begin perform public.save_audio_clip(s.id, c.id, jsonb_build_object('asset_id', a2.id)); insert into r values ('other project''s asset refused', 'NO');
  exception when others then insert into r values ('other project''s asset refused', sqlerrm); end;
  begin perform public.save_audio_clip(s.id, null, '{"track_id":"00000000-0000-4000-8000-000000000000"}'); insert into r values ('clip on a foreign track refused', 'NO');
  exception when others then insert into r values ('clip on a foreign track refused', sqlerrm); end;
  -- re-spot keeps recordings, replaces cues
  s := public.spot_audio_session(p, sc, pv.id, 8,
    '[{"key":"dx:t","name":"DX — Tunde","family":"DX"},{"key":"fx","name":"FX","family":"FX"}]',
    '[{"track_key":"dx:t","label":"TUNDE: You came.","start_seconds":4,"duration_seconds":1,"source":{"dialogue_line_id":"l1"}},{"track_key":"fx","label":"Rain","start_seconds":0,"duration_seconds":2,"source":{}}]',
    'aud@1');
  insert into r select 're-spot keeps recordings', string_agg(t.key || ':' || cl.kind, ',' order by t.key, cl.kind)
    from public.audio_clips cl join public.audio_tracks t on t.id = cl.track_id where cl.session_id = s.id;
  insert into r select 'emptied track removed', string_agg(key, ',' order by key) from public.audio_tracks where session_id = s.id;
  begin perform public.record_audio_measurement(s.id, jsonb_build_object('session_revision', gen_random_uuid(), 'integrated_lufs', -23, 'duration_seconds', 8, 'clip_count', 3, 'engine_version', '1.0.0'));
    insert into r values ('stale measurement refused', 'NO');
  exception when others then insert into r values ('stale measurement refused', sqlerrm); end;
  begin perform public.record_audio_measurement(s.id, jsonb_build_object('session_revision', 'an-old-revision', 'integrated_lufs', -23, 'duration_seconds', 8, 'clip_count', 3, 'engine_version', '1.0.0'));
    insert into r values ('non-uuid revision refused as 409', 'NO');
  exception when others then insert into r values ('non-uuid revision refused as 409', sqlerrm); end;
  begin perform public.approve_audio_session(p, sc); insert into r values ('approve needs a measurement', 'NO');
  exception when others then insert into r values ('approve needs a measurement', sqlerrm); end;
  select revision into rev from public.audio_sessions where id = s.id;
  m := public.record_audio_measurement(s.id, jsonb_build_object('session_revision', rev, 'integrated_lufs', -23.4, 'true_peak_dbtp', -2.1, 'lra_lu', 5.2, 'duration_seconds', 8, 'clip_count', 3, 'engine_version', '1.0.0'));
  av := public.approve_audio_session(p, sc);
  select * into s from public.audio_sessions where id = s.id;
  insert into r values ('approve v1 snapshots tracks, clips, measurement', s.status || ' / v' || av.version_number || ' / ' || jsonb_array_length(av.clips) || ' clips / ' || (av.measurement->>'integrated_lufs'));
  perform public.update_audio_track(dx, '{"gain_db":-6,"mute":true}');
  select * into s from public.audio_sessions where id = s.id;
  insert into r values ('edit reopens draft with a new revision', s.status || ' / revision changed: ' || (s.revision <> rev)::text);
  begin perform public.approve_audio_session(p, sc); insert into r values ('old measurement no longer counts', 'NO');
  exception when others then insert into r values ('old measurement no longer counts', sqlerrm); end;
  perform public.update_shot((select id from public.shots where plan_id = pl.id limit 1), '{"angle":"low"}');
  begin perform public.approve_audio_session(p, sc); insert into r values ('shot plan edit blocks approval', 'NO');
  exception when others then insert into r values ('shot plan edit blocks approval', sqlerrm); end;
  insert into r select 'audit', string_agg(distinct action, ',') from public.audit_events where org_id = o.id and (action like 'Audio%' or action = 'AssetRegistered');
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  insert into r select 'outsider sees', count(*)::text from public.audio_clips where project_id = p;
  begin perform public.delete_audio_clip(c.id); insert into r values ('outsider delete blocked', 'NO');
  exception when others then insert into r values ('outsider delete blocked', sqlerrm); end;
  begin perform public.register_asset(p, 'audio', 'x.wav', 'k', null, '{}'); insert into r values ('outsider asset blocked', 'NO');
  exception when others then insert into r values ('outsider asset blocked', sqlerrm); end;
end $$;
select * from r;
rollback;
-- Expected (verified live 2026-09-28):
-- refused before shot plan approval                | AURA-AUD-412: approve this scene's shot plan first — audio is spotted from the approved version
-- spotted                                          | 2 tracks / 2 cues
-- unknown asset type refused                       | AURA-AST-400: unknown asset type
-- cue becomes a recording                          | asset / gain -3
-- other project's asset refused                    | AURA-AUD-400: that recording is not an audio asset of this project
-- clip on a foreign track refused                  | AURA-AUD-400: that track is not in this session
-- re-spot keeps recordings                         | dx:t:asset,fx:cue   (regression: first version also re-added a cue for the recorded line)
-- emptied track removed                            | dx:t,fx
-- stale measurement refused                        | AURA-AUD-409: the mix changed since it was measured — measure again
-- non-uuid revision refused as 409                 | AURA-AUD-409: the mix changed since it was measured — measure again   (regression: was 22P02 -> API 500; fixed in 0016)
-- approve needs a measurement                      | AURA-AUD-412: measure the mix loudness after your last change
-- approve v1 snapshots tracks, clips, measurement  | approved / v1 / 2 clips / -23.4
-- edit reopens draft with a new revision           | draft / revision changed: true
-- old measurement no longer counts                 | AURA-AUD-412: measure the mix loudness after your last change
-- shot plan edit blocks approval                   | AURA-AUD-412: the shot plan changed since this audio was spotted — re-spot first
-- audit                                            | AssetRegistered,AudioClipSaved,AudioMixMeasured,AudioSessionApproved,AudioSessionSpotted,AudioTrackUpdated
-- outsider sees                                    | 0
-- outsider delete blocked                          | AURA-AUD-403: not allowed to change this project's audio
-- outsider asset blocked                           | AURA-AST-403: not allowed to add assets to this project
