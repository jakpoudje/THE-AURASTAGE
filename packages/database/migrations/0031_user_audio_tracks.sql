-- Tracks added by hand (owner, 2026-09-29: "can user add new tracks?"). Until now every Audio Studio track came from
-- spotting the approved shot plan, and re-spotting dropped empty tracks it no longer proposed. A person can now add a
-- track of any department (dialogue, ADR, VO, Foley, effects, walla, backgrounds, music, score), rename it, reorder it
-- and remove it. Tracks added by hand are never removed by re-spotting (rule 11) and keep their place after the
-- spotted tracks. Removing a track that still holds clips is refused — move or delete the clips first — so no recording
-- is ever dropped silently. Bug fix: re-spotting also used to delete clips a person placed by hand (still without a
-- recording); only the planned cues are replaced now.

alter table public.audio_tracks add column if not exists added_by_hand boolean not null default false;

-- Re-spotting keeps tracks added by hand (and puts them after the spotted ones, in their own order).
create or replace function app_private.spot_audio_session(p_project_id uuid, p_scene_id uuid, p_shot_plan_version_id uuid,
  p_scene_seconds numeric, p_tracks jsonb, p_clips jsonb, p_engine_version text)
returns public.audio_sessions
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_plan public.shot_plans; v public.audio_sessions; t jsonb; c jsonb; i int := 0; v_track uuid; v_kept int;
begin
  v_org := public.audio_assert(p_project_id, p_scene_id);
  select * into v_plan from public.shot_plans where scene_id = p_scene_id;
  if v_plan.id is null or v_plan.status <> 'approved' or v_plan.review_state <> 'current' or v_plan.approved_version_id is distinct from p_shot_plan_version_id then
    raise exception 'AURA-AUD-412: approve this scene''s shot plan first — audio is spotted from the approved version' using errcode = 'P0412';
  end if;
  select * into v from public.audio_sessions where scene_id = p_scene_id for update;
  if v.id is null then
    insert into public.audio_sessions(org_id, project_id, scene_id, shot_plan_version_id, scene_seconds, engine_version)
    values (v_org, p_project_id, p_scene_id, p_shot_plan_version_id, p_scene_seconds, p_engine_version) returning * into v;
  else
    update public.audio_sessions set shot_plan_version_id = p_shot_plan_version_id, scene_seconds = p_scene_seconds, engine_version = p_engine_version,
      review_state = 'current', review_reason = null where id = v.id returning * into v;
    -- Only planned cues are replaced; a clip a person placed by hand is kept (bug fix: re-spotting used to drop it).
    delete from public.audio_clips where session_id = v.id and kind = 'cue' and coalesce((source->>'added_by_hand')::boolean, false) = false;
  end if;
  for t in select * from jsonb_array_elements(p_tracks) loop
    i := i + 1;
    insert into public.audio_tracks(org_id, project_id, session_id, key, ordinal, name, family)
    values (v_org, p_project_id, v.id, t->>'key', i, t->>'name', t->>'family')
    on conflict (session_id, key) do update set ordinal = excluded.ordinal;
  end loop;
  for c in select * from jsonb_array_elements(p_clips) loop
    continue when c->'source'->>'dialogue_line_id' is not null and exists (
      select 1 from public.audio_clips x where x.session_id = v.id and x.kind = 'asset' and x.source->>'dialogue_line_id' = c->'source'->>'dialogue_line_id');
    select id into v_track from public.audio_tracks where session_id = v.id and key = c->>'track_key';
    insert into public.audio_clips(org_id, project_id, session_id, track_id, label, kind, start_seconds, duration_seconds, source, created_by)
    values (v_org, p_project_id, v.id, v_track, left(c->>'label', 200), 'cue', (c->>'start_seconds')::numeric, (c->>'duration_seconds')::numeric,
            coalesce(c->'source', '{}'::jsonb), auth.uid());
  end loop;
  -- Drop tracks left empty that the new spotting no longer proposes — never a track a person added.
  delete from public.audio_tracks tr where tr.session_id = v.id and not tr.added_by_hand
    and not exists (select 1 from public.audio_clips cl where cl.track_id = tr.id)
    and not exists (select 1 from jsonb_array_elements(p_tracks) x where x->>'key' = tr.key);
  update public.audio_tracks tr set ordinal = i + o.rn
    from (select id, row_number() over (order by ordinal, name) rn from public.audio_tracks where session_id = v.id and added_by_hand) o
    where tr.id = o.id;
  select count(*) into v_kept from public.audio_clips where session_id = v.id and kind = 'asset';
  perform public.audio_touch(v.id, 'AudioSessionSpotted', null, jsonb_build_object('cues', jsonb_array_length(p_clips), 'recordings_kept', v_kept, 'shot_plan_version_id', p_shot_plan_version_id));
  insert into public.jobs(org_id, project_id, engine_id, engine_version, status, input_snapshot, output_refs, attempt, started_at, completed_at)
  values (v_org, p_project_id, 'audio.audioSpottingEngine', p_engine_version, 'completed',
          jsonb_build_object('scene_id', p_scene_id, 'shot_plan_version_id', p_shot_plan_version_id),
          jsonb_build_object('session_id', v.id, 'cues', jsonb_array_length(p_clips)), 1, now(), now());
  select * into v from public.audio_sessions where id = v.id;
  return v;
end;
$$;
revoke all on function app_private.spot_audio_session(uuid, uuid, uuid, numeric, jsonb, jsonb, text) from public, anon, authenticated;

-- Add a track by hand, placed after the last track (or right after p_after, a track of the same session).
create or replace function public.add_audio_track(p_session_id uuid, p_name text, p_family text, p_after uuid default null)
returns public.audio_tracks
language plpgsql security definer set search_path = public as $$
declare s public.audio_sessions; v public.audio_tracks; v_pos int; v_name text := btrim(coalesce(p_name, ''));
begin
  select * into s from public.audio_sessions where id = p_session_id for update;
  if s.id is null then raise exception 'AURA-AUD-404: audio session not found' using errcode = 'P0404'; end if;
  perform public.gate_write(s.project_id, 'audio', 'edit');
  perform public.audio_assert(s.project_id, null);
  if char_length(v_name) not between 1 and 80 then raise exception 'AURA-AUD-400: give the track a name (up to 80 characters)' using errcode = 'P0400'; end if;
  if p_family is null or p_family not in ('DX','ADR','VO','FOLEY','FX','WALLA','BG','MX','SCORE') then
    raise exception 'AURA-AUD-400: choose what the track is for (dialogue, ADR, VO, Foley, effects, walla, backgrounds, music or score)' using errcode = 'P0400';
  end if;
  if exists (select 1 from public.audio_tracks where session_id = s.id and lower(name) = lower(v_name)) then
    raise exception 'AURA-AUD-409: there''s already a track called %', v_name using errcode = 'P0409';
  end if;
  if p_after is not null then
    select ordinal into v_pos from public.audio_tracks where id = p_after and session_id = s.id;
    if v_pos is null then raise exception 'AURA-AUD-400: that track is not in this session' using errcode = 'P0400'; end if;
    update public.audio_tracks set ordinal = ordinal + 1 where session_id = s.id and ordinal > v_pos;
    v_pos := v_pos + 1;
  else
    select coalesce(max(ordinal), 0) + 1 into v_pos from public.audio_tracks where session_id = s.id;
  end if;
  insert into public.audio_tracks(org_id, project_id, session_id, key, ordinal, name, family, added_by_hand)
  values (s.org_id, s.project_id, s.id, 'user-' || replace(gen_random_uuid()::text, '-', ''), v_pos, v_name, p_family, true)
  returning * into v;
  perform public.audio_touch(s.id, 'AudioTrackAdded', v.id, jsonb_build_object('name', v.name, 'family', v.family));
  return v;
end;
$$;

-- Move a track up or down one place.
create or replace function public.move_audio_track(p_track_id uuid, p_direction int)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.audio_tracks; o public.audio_tracks;
begin
  select * into v from public.audio_tracks where id = p_track_id for update;
  if v.id is null then raise exception 'AURA-AUD-404: track not found' using errcode = 'P0404'; end if;
  perform public.gate_write(v.project_id, 'audio', 'edit');
  perform public.audio_assert(v.project_id, null);
  if p_direction < 0 then
    select * into o from public.audio_tracks where session_id = v.session_id and (ordinal, id::text) < (v.ordinal, v.id::text) order by ordinal desc, id::text desc limit 1 for update;
  else
    select * into o from public.audio_tracks where session_id = v.session_id and (ordinal, id::text) > (v.ordinal, v.id::text) order by ordinal, id::text limit 1 for update;
  end if;
  if o.id is null then return; end if;
  -- Renumber the whole session first so equal ordinals can't make a swap a no-op.
  update public.audio_tracks tr set ordinal = x.rn from (select id, row_number() over (order by ordinal, id::text) rn from public.audio_tracks where session_id = v.session_id) x
    where tr.id = x.id;
  update public.audio_tracks set ordinal = case when id = v.id then (select ordinal from public.audio_tracks where id = o.id) else (select ordinal from public.audio_tracks where id = v.id) end
    where id in (v.id, o.id);
  perform public.audio_touch(v.session_id, 'AudioTrackMoved', v.id, jsonb_build_object('direction', sign(p_direction)));
end;
$$;

-- Remove a track a person added. Refused while it still holds clips; spotted tracks are muted instead (they come back
-- with the next re-spot anyway).
create or replace function public.delete_audio_track(p_track_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.audio_tracks; n int;
begin
  select * into v from public.audio_tracks where id = p_track_id for update;
  if v.id is null then raise exception 'AURA-AUD-404: track not found' using errcode = 'P0404'; end if;
  perform public.gate_write(v.project_id, 'audio', 'edit');
  perform public.audio_assert(v.project_id, null);
  if not v.added_by_hand then
    raise exception 'AURA-AUD-400: tracks from spotting can''t be removed — mute it instead' using errcode = 'P0400';
  end if;
  select count(*) into n from public.audio_clips where track_id = v.id;
  if n > 0 then
    raise exception 'AURA-AUD-409: this track still holds % clip(s) — move or delete them first', n using errcode = 'P0409';
  end if;
  delete from public.audio_tracks where id = v.id;
  perform public.audio_touch(v.session_id, 'AudioTrackRemoved', v.id, jsonb_build_object('name', v.name));
end;
$$;

revoke execute on function public.add_audio_track(uuid, text, text, uuid), public.move_audio_track(uuid, int), public.delete_audio_track(uuid) from public, anon;
grant execute on function public.add_audio_track(uuid, text, text, uuid), public.move_audio_track(uuid, int), public.delete_audio_track(uuid) to authenticated;
