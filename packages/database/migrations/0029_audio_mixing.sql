-- Studio mixing (owner, 2026-09-29: "dialogue, music, SFX mixing needs more tools for proper mixing, like an advanced
-- studio"). Each track gets a channel strip (high-pass filter, 3-band EQ, compressor, reverb/delay sends, volume
-- automation) and each scene's session gets routing (department buses, shared reverb and delay, master with limiter).
-- Values are validated by the API against the shared contract (TrackFxSchema / SessionMixSchema); the database keeps
-- them as bounded JSON objects. Any change bumps the session revision, so the loudness measurement goes stale and the
-- mix must be measured again before approval (rule 12). Approved versions snapshot the strips and the routing (rule 10).

alter table public.audio_tracks add column if not exists fx jsonb not null default '{}'::jsonb;
alter table public.audio_sessions add column if not exists mix jsonb not null default '{}'::jsonb;
alter table public.audio_session_versions add column if not exists mix jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.audio_tracks add constraint audio_tracks_fx_shape check (jsonb_typeof(fx) = 'object' and octet_length(fx::text) <= 32768);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.audio_sessions add constraint audio_sessions_mix_shape check (jsonb_typeof(mix) = 'object' and octet_length(mix::text) <= 8192);
exception when duplicate_object then null; end $$;

-- Track edits: the channel strip joins the other track fields (implementation behind the permission wrapper from 0019).
create or replace function app_private.update_audio_track(p_track_id uuid, p_patch jsonb)
returns public.audio_tracks
language plpgsql security definer set search_path = public as $$
declare v public.audio_tracks;
begin
  select * into v from public.audio_tracks where id = p_track_id for update;
  if v.id is null then raise exception 'AURA-AUD-404: track not found' using errcode = 'P0404'; end if;
  perform public.audio_assert(v.project_id, null);
  if p_patch ? 'fx' and jsonb_typeof(p_patch->'fx') <> 'object' then raise exception 'AURA-AUD-400: fx must be an object' using errcode = 'P0400'; end if;
  update public.audio_tracks set
    name = coalesce(p_patch->>'name', name),
    gain_db = coalesce((p_patch->>'gain_db')::numeric, gain_db),
    pan = coalesce((p_patch->>'pan')::numeric, pan),
    mute = coalesce((p_patch->>'mute')::boolean, mute),
    solo = coalesce((p_patch->>'solo')::boolean, solo),
    fx = coalesce(p_patch->'fx', fx)
  where id = v.id returning * into v;
  perform public.audio_touch(v.session_id, 'AudioTrackUpdated', v.id, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return v;
end;
$$;
revoke all on function app_private.update_audio_track(uuid, jsonb) from public, anon, authenticated;

-- Session routing: buses, reverb, delay, master. The caller sends the revision it is editing (stale → 409).
create or replace function public.update_audio_mix(p_session_id uuid, p_mix jsonb, p_revision uuid)
returns public.audio_sessions
language plpgsql security definer set search_path = public as $$
declare s public.audio_sessions;
begin
  select * into s from public.audio_sessions where id = p_session_id for update;
  if s.id is null then raise exception 'AURA-AUD-404: audio session not found' using errcode = 'P0404'; end if;
  perform public.gate_write(s.project_id, 'audio', 'edit');
  if jsonb_typeof(p_mix) <> 'object' then raise exception 'AURA-AUD-400: mix must be an object' using errcode = 'P0400'; end if;
  if s.revision <> p_revision then raise exception 'AURA-AUD-409: the mix changed since you opened it — reload to see the latest' using errcode = 'P0409'; end if;
  update public.audio_sessions set mix = p_mix where id = s.id;
  perform public.audio_touch(s.id, 'AudioMixUpdated', s.id, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_mix) k)));
  select * into s from public.audio_sessions where id = p_session_id;
  return s;
end;
$$;
revoke execute on function public.update_audio_mix(uuid, jsonb, uuid) from public, anon;
grant execute on function public.update_audio_mix(uuid, jsonb, uuid) to authenticated;

-- Approval snapshots the routing too (tracks already carry their strips via to_jsonb).
create or replace function app_private.approve_audio_session(p_project_id uuid, p_scene_id uuid)
returns public.audio_session_versions
language plpgsql security definer set search_path = public as $$
declare v_org uuid; s public.audio_sessions; v_plan public.shot_plans; m public.audio_measurements; n int; v public.audio_session_versions;
begin
  v_org := public.audio_assert(p_project_id, p_scene_id);
  select * into s from public.audio_sessions where scene_id = p_scene_id for update;
  if s.id is null then raise exception 'AURA-AUD-412: spot this scene''s audio first' using errcode = 'P0412'; end if;
  select * into v_plan from public.shot_plans where scene_id = p_scene_id;
  if v_plan.approved_version_id is distinct from s.shot_plan_version_id or v_plan.review_state <> 'current' or v_plan.status <> 'approved' then
    raise exception 'AURA-AUD-412: the shot plan changed since this audio was spotted — re-spot first' using errcode = 'P0412';
  end if;
  select * into m from public.audio_measurements where session_id = s.id order by measured_at desc limit 1;
  if m.id is null or m.session_revision <> s.revision then
    raise exception 'AURA-AUD-412: measure the mix loudness after your last change' using errcode = 'P0412';
  end if;
  select coalesce(max(version_number), 0) + 1 into n from public.audio_session_versions where session_id = s.id;
  insert into public.audio_session_versions(org_id, project_id, session_id, version_number, shot_plan_version_id, tracks, clips, measurement, mix, created_by)
  values (v_org, p_project_id, s.id, n, s.shot_plan_version_id,
    (select coalesce(jsonb_agg(to_jsonb(t) - 'org_id' order by t.ordinal), '[]') from public.audio_tracks t where t.session_id = s.id),
    (select coalesce(jsonb_agg(to_jsonb(c) - 'org_id' - 'created_by' order by c.start_seconds), '[]') from public.audio_clips c where c.session_id = s.id),
    to_jsonb(m) - 'org_id', s.mix, auth.uid())
  returning * into v;
  update public.audio_sessions set status = 'approved', review_state = 'current', review_reason = null, approved_version_id = v.id where id = s.id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'AudioSessionApproved', 'AudioSession', s.id, jsonb_build_object('version_number', n, 'integrated_lufs', m.integrated_lufs));
  return v;
end;
$$;
revoke all on function app_private.approve_audio_session(uuid, uuid) from public, anon, authenticated;
