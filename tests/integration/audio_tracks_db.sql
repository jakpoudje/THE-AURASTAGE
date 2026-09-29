-- Integration test for migration 0031 (tracks added by hand). Rolled back; expected results at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(n serial, step text, ok text) on commit drop;
do $$
declare o public.organizations; p uuid; v1 public.script_versions; sc uuid; dv public.scene_dna_versions; pl public.shot_plans; pv public.shot_plan_versions;
  s public.audio_sessions; radio public.audio_tracks; walla public.audio_tracks; c public.audio_clips; rev uuid; bg uuid;
begin
  o := public.create_organization('T','t-audio-tracks');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v1.id, '[{"number":1,"heading":"EXT. HARBOUR","int_ext":"EXT","location":"HARBOUR","time_of_day":"NIGHT","speaking_characters":[],"estimated_seconds":8,"element_start":0,"element_end":1,"content_hash":"h"}]', 'e');
  select id into sc from public.scenes where project_id = p;
  dv := public.approve_scene_dna(p, sc, '{}', '[]', 'sdna@1');
  pl := public.generate_shot_plan(p, sc, dv.id, '[{"purpose":"establishing","size":"WS","duration_seconds":8,"description":"Wide","story_start":0,"story_end":8}]', 'shot@1');
  pv := public.approve_shot_plan(p, sc, '{"coverage":1}');
  s := public.spot_audio_session(p, sc, pv.id, 8, '[{"key":"dx:t","name":"DX — Tunde","family":"DX"},{"key":"bg","name":"BG — Ambience","family":"BG"}]',
    '[{"track_key":"dx:t","label":"TUNDE: You came.","start_seconds":4,"duration_seconds":1,"source":{}}]', 'aud@1');
  rev := s.revision;
  radio := public.add_audio_track(s.id, '  Radio  ', 'FX');
  insert into r(step, ok) values ('added last, trimmed, marked', radio.name || ' / ' || radio.family || ' / ' || radio.ordinal || ' / ' || radio.added_by_hand::text);
  insert into r(step, ok) values ('adding changes the revision', ((select revision from public.audio_sessions where id = s.id) <> rev)::text);
  select id into bg from public.audio_tracks where session_id = s.id and key = 'dx:t';
  walla := public.add_audio_track(s.id, 'Market walla', 'WALLA', bg);
  insert into r(step, ok) select 'inserted after a chosen track', string_agg(name, ' | ' order by ordinal) from public.audio_tracks where session_id = s.id;
  begin perform public.add_audio_track(s.id, 'radio', 'FX'); insert into r(step, ok) values ('duplicate name refused', 'NO');
  exception when others then insert into r(step, ok) values ('duplicate name refused', sqlerrm); end;
  begin perform public.add_audio_track(s.id, 'Odd', 'KAZOO'); insert into r(step, ok) values ('unknown department refused', 'NO');
  exception when others then insert into r(step, ok) values ('unknown department refused', sqlerrm); end;
  begin perform public.add_audio_track(s.id, '   ', 'FX'); insert into r(step, ok) values ('empty name refused', 'NO');
  exception when others then insert into r(step, ok) values ('empty name refused', sqlerrm); end;
  perform public.move_audio_track(radio.id, -1);
  insert into r(step, ok) select 'moved up one place', string_agg(name, ' | ' order by ordinal) from public.audio_tracks where session_id = s.id;
  c := public.save_audio_clip(s.id, null, jsonb_build_object('track_id', radio.id, 'label', 'Radio news', 'start_seconds', 1, 'duration_seconds', 3));
  -- Re-spot proposes neither added track nor BG: the empty BG goes, both added tracks stay (after the spotted ones), and
  -- the clip placed by hand on Radio is kept (regression: re-spotting used to delete hand-placed clips).
  s := public.spot_audio_session(p, sc, pv.id, 8, '[{"key":"dx:t","name":"DX — Tunde","family":"DX"}]', '[]', 'aud@1');
  insert into r(step, ok) select 're-spot keeps tracks added by hand', string_agg(name, ' | ' order by ordinal) from public.audio_tracks where session_id = s.id;
  insert into r(step, ok) select 're-spot keeps the clip placed by hand', count(*)::text || ' / ' || min(label) from public.audio_clips where id = c.id;
  begin perform public.delete_audio_track(radio.id); insert into r(step, ok) values ('removing a track with clips refused', 'NO');
  exception when others then insert into r(step, ok) values ('removing a track with clips refused', sqlerrm); end;
  begin perform public.delete_audio_track(bg); insert into r(step, ok) values ('spotted track can''t be removed', 'NO');
  exception when others then insert into r(step, ok) values ('spotted track can''t be removed', sqlerrm); end;
  perform public.delete_audio_track(walla.id);
  insert into r(step, ok) select 'empty added track removed', string_agg(name, ' | ' order by ordinal) from public.audio_tracks where session_id = s.id;
  insert into r(step, ok) select 'audit', string_agg(distinct action, ',' order by action) from public.audit_events where org_id = o.id and action like 'AudioTrack%';
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  begin perform public.add_audio_track(s.id, 'Mine', 'FX'); insert into r(step, ok) values ('outsider refused', 'NO');
  exception when others then insert into r(step, ok) values ('outsider refused', split_part(sqlerrm, '.', 1)); end;
  begin perform public.move_audio_track(radio.id, 1); insert into r(step, ok) values ('outsider can''t move', 'NO');
  exception when others then insert into r(step, ok) values ('outsider can''t move', split_part(sqlerrm, '.', 1)); end;
end $$;
select step, ok from r order by n;
rollback;
-- Expected (verified live 2026-09-29):
-- added last, trimmed, marked            | Radio / FX / 3 / true
-- adding changes the revision            | true
-- inserted after a chosen track          | DX — Tunde | Market walla | BG — Ambience | Radio
-- duplicate name refused                 | AURA-AUD-409: there's already a track called radio
-- unknown department refused             | AURA-AUD-400: choose what the track is for (...)
-- empty name refused                     | AURA-AUD-400: give the track a name (up to 80 characters)
-- moved up one place                     | DX — Tunde | Market walla | Radio | BG — Ambience
-- re-spot keeps tracks added by hand     | DX — Tunde | Market walla | Radio
-- re-spot keeps the clip placed by hand  | 1 / Radio news
-- removing a track with clips refused    | AURA-AUD-409: this track still holds 1 clip(s) — move or delete them first
-- spotted track can't be removed         | AURA-AUD-400: tracks from spotting can't be removed — mute it instead
-- empty added track removed              | DX — Tunde | Radio
-- audit                                  | AudioTrackAdded,AudioTrackMoved,AudioTrackRemoved
-- outsider refused                       | AURA-COL-403: you don't have access to this project
-- outsider can't move                    | AURA-AUD-404: track not found
