-- 0053_audio_clip_mute.sql
-- Owner report 2026-10-02: after splitting a clip there was no way to remove a part and bring it back later. A clip can
-- now be muted (kept on the timeline, silent in playback, measurement, export and the final film) and un-muted. A
-- deleted clip can be restored with Undo: the insert path accepts its original `source` (e.g. the dialogue line it
-- belongs to) and `muted`, so the restored clip is the same cue, not a hand-made copy.
alter table public.audio_clips add column if not exists muted boolean not null default false;

create or replace function app_private.save_audio_clip(p_session_id uuid, p_clip_id uuid, p_patch jsonb)
returns public.audio_clips
language plpgsql security definer set search_path = public as $$
declare s public.audio_sessions; v public.audio_clips; v_track uuid; v_asset uuid; v_source jsonb;
begin
  select * into s from public.audio_sessions where id = p_session_id;
  if s.id is null then raise exception 'AURA-AUD-404: audio session not found' using errcode = 'P0404'; end if;
  perform public.audio_assert(s.project_id, null);
  v_track := coalesce((p_patch->>'track_id')::uuid, (select track_id from public.audio_clips where id = p_clip_id));
  if not exists (select 1 from public.audio_tracks where id = v_track and session_id = s.id) then
    raise exception 'AURA-AUD-400: that track is not in this session' using errcode = 'P0400';
  end if;
  if p_patch ? 'asset_id' and p_patch->>'asset_id' is not null then
    v_asset := (p_patch->>'asset_id')::uuid;
    if not exists (select 1 from public.assets where id = v_asset and project_id = s.project_id and type = 'audio') then
      raise exception 'AURA-AUD-400: that recording is not an audio asset of this project' using errcode = 'P0400';
    end if;
  end if;
  if p_clip_id is null then
    v_source := case when jsonb_typeof(p_patch->'source') = 'object' then p_patch->'source' else jsonb_build_object('added_by_hand', true) end;
    insert into public.audio_clips(org_id, project_id, session_id, track_id, label, kind, asset_id, start_seconds, duration_seconds, offset_seconds,
      gain_db, fade_in_seconds, fade_out_seconds, source, muted, created_by)
    values (s.org_id, s.project_id, s.id, v_track, coalesce(p_patch->>'label', 'New clip'),
      case when v_asset is null then 'cue' else 'asset' end, v_asset,
      coalesce((p_patch->>'start_seconds')::numeric, 0), coalesce((p_patch->>'duration_seconds')::numeric, 1),
      coalesce((p_patch->>'offset_seconds')::numeric, 0), coalesce((p_patch->>'gain_db')::numeric, 0),
      coalesce((p_patch->>'fade_in_seconds')::numeric, 0), coalesce((p_patch->>'fade_out_seconds')::numeric, 0),
      v_source, coalesce((p_patch->>'muted')::boolean, false), auth.uid())
    returning * into v;
  else
    select * into v from public.audio_clips where id = p_clip_id and session_id = s.id for update;
    if v.id is null then raise exception 'AURA-AUD-404: clip not found' using errcode = 'P0404'; end if;
    update public.audio_clips set
      track_id = v_track,
      label = coalesce(p_patch->>'label', label),
      asset_id = case when p_patch ? 'asset_id' then v_asset else asset_id end,
      kind = case when p_patch ? 'asset_id' then (case when v_asset is null then 'cue' else 'asset' end) else kind end,
      start_seconds = coalesce((p_patch->>'start_seconds')::numeric, start_seconds),
      duration_seconds = coalesce((p_patch->>'duration_seconds')::numeric, duration_seconds),
      offset_seconds = coalesce((p_patch->>'offset_seconds')::numeric, offset_seconds),
      gain_db = coalesce((p_patch->>'gain_db')::numeric, gain_db),
      fade_in_seconds = coalesce((p_patch->>'fade_in_seconds')::numeric, fade_in_seconds),
      fade_out_seconds = coalesce((p_patch->>'fade_out_seconds')::numeric, fade_out_seconds),
      muted = coalesce((p_patch->>'muted')::boolean, muted)
    where id = v.id returning * into v;
  end if;
  perform public.audio_touch(s.id, 'AudioClipSaved', v.id, jsonb_build_object('kind', v.kind, 'muted', v.muted));
  return v;
end;
$$;
