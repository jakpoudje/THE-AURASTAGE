-- Phase 8: Audio Studio (SRS §11).
-- Canonical owners: Audio Studio (audio_* tables, apps/api/src/modules/audio) and
-- Assets Library (assets; register_asset is the Assets domain's write path).
--
-- audio_sessions          one per scene; stamped with the approved shot plan
--                         version it was spotted from (rule 10); `revision`
--                         changes on every edit so measurements can prove they
--                         were taken from the mix exactly as saved
-- audio_tracks / clips    the working session (clips are planned `cue`s or real
--                         `asset` audio from the Assets Library)
-- audio_measurements      BS.1770-4 loudness of the rendered mix, per revision
-- audio_session_versions  immutable approved snapshots
-- Re-spotting replaces planned cues only; recordings are never removed (rule 11).

-- ---- Assets Library write path -------------------------------------------
create or replace function public.register_asset(p_project_id uuid, p_type text, p_name text, p_storage_path text,
  p_checksum text, p_metadata jsonb)
returns public.assets
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v public.assets;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-AST-403: not allowed to add assets to this project' using errcode = '42501';
  end if;
  if p_type not in ('audio','image','video','document','reference') then raise exception 'AURA-AST-400: unknown asset type' using errcode = 'P0400'; end if;
  if char_length(coalesce(p_name, '')) not between 1 and 200 then raise exception 'AURA-AST-400: asset name must be 1-200 characters' using errcode = 'P0400'; end if;
  insert into public.assets(org_id, project_id, type, name, storage_path, checksum, metadata, created_by)
  values (v_org, p_project_id, p_type, p_name, p_storage_path, p_checksum, coalesce(p_metadata, '{}'::jsonb), auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'AssetRegistered', 'Asset', v.id, jsonb_build_object('type', p_type, 'name', p_name, 'size', p_metadata->'size_bytes'));
  return v;
end;
$$;

-- ---- Audio Studio ----------------------------------------------------------
create table if not exists public.audio_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid not null unique references public.scenes(id) on delete cascade,
  shot_plan_version_id uuid not null references public.shot_plan_versions(id),
  scene_seconds numeric not null check (scene_seconds > 0),
  status text not null default 'draft' check (status in ('draft','approved')),
  review_state text not null default 'current' check (review_state in ('current','review_required','stale')),
  review_reason text,
  revision uuid not null default gen_random_uuid(),
  approved_version_id uuid,
  engine_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_audio_sessions_project on public.audio_sessions(project_id);
drop trigger if exists trg_audio_sessions_updated_at on public.audio_sessions;
create trigger trg_audio_sessions_updated_at before update on public.audio_sessions for each row execute function public.set_updated_at();

create table if not exists public.audio_tracks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null references public.audio_sessions(id) on delete cascade,
  key text not null,
  ordinal int not null,
  name text not null check (char_length(name) between 1 and 80),
  family text not null check (family in ('DX','ADR','VO','FOLEY','FX','WALLA','BG','MX','SCORE')),
  gain_db numeric not null default 0 check (gain_db between -60 and 12),
  pan numeric not null default 0 check (pan between -1 and 1),
  mute boolean not null default false,
  solo boolean not null default false,
  unique (session_id, key)
);
create index if not exists idx_audio_tracks_session on public.audio_tracks(session_id);

create table if not exists public.audio_clips (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null references public.audio_sessions(id) on delete cascade,
  track_id uuid not null references public.audio_tracks(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  kind text not null default 'cue' check (kind in ('cue','asset')),
  asset_id uuid references public.assets(id),
  start_seconds numeric not null check (start_seconds >= 0),
  duration_seconds numeric not null check (duration_seconds > 0),
  offset_seconds numeric not null default 0 check (offset_seconds >= 0),
  gain_db numeric not null default 0 check (gain_db between -60 and 12),
  fade_in_seconds numeric not null default 0 check (fade_in_seconds >= 0),
  fade_out_seconds numeric not null default 0 check (fade_out_seconds >= 0),
  source jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audio_clips_kind_asset check ((kind = 'asset') = (asset_id is not null))
);
create index if not exists idx_audio_clips_session on public.audio_clips(session_id);
drop trigger if exists trg_audio_clips_updated_at on public.audio_clips;
create trigger trg_audio_clips_updated_at before update on public.audio_clips for each row execute function public.set_updated_at();

create table if not exists public.audio_measurements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null references public.audio_sessions(id) on delete cascade,
  session_revision uuid not null,
  integrated_lufs numeric,
  true_peak_dbtp numeric,
  lra_lu numeric,
  duration_seconds numeric not null,
  clip_count int not null,
  engine_version text not null,
  measured_by uuid references auth.users(id),
  measured_at timestamptz not null default now()
);
create index if not exists idx_audio_measurements_session on public.audio_measurements(session_id, measured_at desc);

create table if not exists public.audio_session_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid not null references public.audio_sessions(id) on delete cascade,
  version_number int not null,
  shot_plan_version_id uuid not null references public.shot_plan_versions(id),
  tracks jsonb not null,
  clips jsonb not null,
  measurement jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (session_id, version_number)
);
alter table public.audio_sessions drop constraint if exists audio_sessions_approved_version_fk;
alter table public.audio_sessions add constraint audio_sessions_approved_version_fk
  foreign key (approved_version_id) references public.audio_session_versions(id) on delete set null;

alter table public.audio_sessions enable row level security;
alter table public.audio_tracks enable row level security;
alter table public.audio_clips enable row level security;
alter table public.audio_measurements enable row level security;
alter table public.audio_session_versions enable row level security;
drop policy if exists audio_sessions_select on public.audio_sessions;
create policy audio_sessions_select on public.audio_sessions for select using (public.is_org_member(org_id));
drop policy if exists audio_tracks_select on public.audio_tracks;
create policy audio_tracks_select on public.audio_tracks for select using (public.is_org_member(org_id));
drop policy if exists audio_clips_select on public.audio_clips;
create policy audio_clips_select on public.audio_clips for select using (public.is_org_member(org_id));
drop policy if exists audio_measurements_select on public.audio_measurements;
create policy audio_measurements_select on public.audio_measurements for select using (public.is_org_member(org_id));
drop policy if exists audio_session_versions_select on public.audio_session_versions;
create policy audio_session_versions_select on public.audio_session_versions for select using (public.is_org_member(org_id));

create or replace function public.audio_assert(p_project_id uuid, p_scene_id uuid) returns uuid
language plpgsql security definer stable set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-AUD-403: not allowed to change this project''s audio' using errcode = '42501';
  end if;
  if p_scene_id is not null and not exists (select 1 from public.scenes where id = p_scene_id and project_id = p_project_id) then
    raise exception 'AURA-AUD-404: scene not found in this project' using errcode = 'P0404';
  end if;
  return v_org;
end;
$$;

-- Every edit gets a new revision and reopens an approved session as draft.
create or replace function public.audio_touch(p_session_id uuid, p_action text, p_object uuid, p_meta jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v public.audio_sessions;
begin
  update public.audio_sessions set revision = gen_random_uuid(), status = 'draft' where id = p_session_id returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v.org_id, auth.uid(), p_action, 'AudioSession', coalesce(p_object, v.id), coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('session_id', v.id));
end;
$$;

-- Spot (or re-spot) a scene from the APPROVED shot plan version. Replaces planned
-- cues only; tracks holding recordings and their asset clips are kept.
create or replace function public.spot_audio_session(p_project_id uuid, p_scene_id uuid, p_shot_plan_version_id uuid,
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
    delete from public.audio_clips where session_id = v.id and kind = 'cue';
  end if;
  for t in select * from jsonb_array_elements(p_tracks) loop
    i := i + 1;
    insert into public.audio_tracks(org_id, project_id, session_id, key, ordinal, name, family)
    values (v_org, p_project_id, v.id, t->>'key', i, t->>'name', t->>'family')
    on conflict (session_id, key) do update set ordinal = excluded.ordinal;
  end loop;
  for c in select * from jsonb_array_elements(p_clips) loop
    -- A line that already has a recording doesn't get a planned cue on top of it.
    continue when c->'source'->>'dialogue_line_id' is not null and exists (
      select 1 from public.audio_clips x where x.session_id = v.id and x.kind = 'asset' and x.source->>'dialogue_line_id' = c->'source'->>'dialogue_line_id');
    select id into v_track from public.audio_tracks where session_id = v.id and key = c->>'track_key';
    insert into public.audio_clips(org_id, project_id, session_id, track_id, label, kind, start_seconds, duration_seconds, source, created_by)
    values (v_org, p_project_id, v.id, v_track, left(c->>'label', 200), 'cue', (c->>'start_seconds')::numeric, (c->>'duration_seconds')::numeric,
            coalesce(c->'source', '{}'::jsonb), auth.uid());
  end loop;
  -- Drop tracks left empty that the new spotting no longer proposes.
  delete from public.audio_tracks tr where tr.session_id = v.id
    and not exists (select 1 from public.audio_clips cl where cl.track_id = tr.id)
    and not exists (select 1 from jsonb_array_elements(p_tracks) x where x->>'key' = tr.key);
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

create or replace function public.update_audio_track(p_track_id uuid, p_patch jsonb)
returns public.audio_tracks
language plpgsql security definer set search_path = public as $$
declare v public.audio_tracks;
begin
  select * into v from public.audio_tracks where id = p_track_id for update;
  if v.id is null then raise exception 'AURA-AUD-404: track not found' using errcode = 'P0404'; end if;
  perform public.audio_assert(v.project_id, null);
  update public.audio_tracks set
    name = coalesce(p_patch->>'name', name),
    gain_db = coalesce((p_patch->>'gain_db')::numeric, gain_db),
    pan = coalesce((p_patch->>'pan')::numeric, pan),
    mute = coalesce((p_patch->>'mute')::boolean, mute),
    solo = coalesce((p_patch->>'solo')::boolean, solo)
  where id = v.id returning * into v;
  perform public.audio_touch(v.session_id, 'AudioTrackUpdated', v.id, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return v;
end;
$$;

-- Create (p_clip_id null) or update a clip. Setting asset_id turns a cue into real audio.
create or replace function public.save_audio_clip(p_session_id uuid, p_clip_id uuid, p_patch jsonb)
returns public.audio_clips
language plpgsql security definer set search_path = public as $$
declare s public.audio_sessions; v public.audio_clips; v_track uuid; v_asset uuid;
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
    insert into public.audio_clips(org_id, project_id, session_id, track_id, label, kind, asset_id, start_seconds, duration_seconds, offset_seconds,
      gain_db, fade_in_seconds, fade_out_seconds, source, created_by)
    values (s.org_id, s.project_id, s.id, v_track, coalesce(p_patch->>'label', 'New clip'),
      case when v_asset is null then 'cue' else 'asset' end, v_asset,
      coalesce((p_patch->>'start_seconds')::numeric, 0), coalesce((p_patch->>'duration_seconds')::numeric, 1),
      coalesce((p_patch->>'offset_seconds')::numeric, 0), coalesce((p_patch->>'gain_db')::numeric, 0),
      coalesce((p_patch->>'fade_in_seconds')::numeric, 0), coalesce((p_patch->>'fade_out_seconds')::numeric, 0),
      jsonb_build_object('added_by_hand', true), auth.uid())
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
      fade_out_seconds = coalesce((p_patch->>'fade_out_seconds')::numeric, fade_out_seconds)
    where id = v.id returning * into v;
  end if;
  perform public.audio_touch(s.id, 'AudioClipSaved', v.id, jsonb_build_object('kind', v.kind));
  return v;
end;
$$;

create or replace function public.delete_audio_clip(p_clip_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.audio_clips;
begin
  select * into v from public.audio_clips where id = p_clip_id for update;
  if v.id is null then raise exception 'AURA-AUD-404: clip not found' using errcode = 'P0404'; end if;
  perform public.audio_assert(v.project_id, null);
  delete from public.audio_clips where id = v.id;
  perform public.audio_touch(v.session_id, 'AudioClipDeleted', v.id, jsonb_build_object('label', v.label, 'asset_id', v.asset_id));
end;
$$;

-- Loudness of the rendered mix. Refused if the session changed since it was rendered.
create or replace function public.record_audio_measurement(p_session_id uuid, p_m jsonb)
returns public.audio_measurements
language plpgsql security definer set search_path = public as $$
declare s public.audio_sessions; v public.audio_measurements;
begin
  select * into s from public.audio_sessions where id = p_session_id;
  if s.id is null then raise exception 'AURA-AUD-404: audio session not found' using errcode = 'P0404'; end if;
  perform public.audio_assert(s.project_id, null);
  if (p_m->>'session_revision')::uuid is distinct from s.revision then
    raise exception 'AURA-AUD-409: the mix changed since it was measured — measure again' using errcode = 'P0409';
  end if;
  insert into public.audio_measurements(org_id, project_id, session_id, session_revision, integrated_lufs, true_peak_dbtp, lra_lu,
    duration_seconds, clip_count, engine_version, measured_by)
  values (s.org_id, s.project_id, s.id, s.revision, (p_m->>'integrated_lufs')::numeric, (p_m->>'true_peak_dbtp')::numeric,
    (p_m->>'lra_lu')::numeric, (p_m->>'duration_seconds')::numeric, (p_m->>'clip_count')::int, p_m->>'engine_version', auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (s.org_id, auth.uid(), 'AudioMixMeasured', 'AudioSession', s.id, jsonb_build_object('integrated_lufs', v.integrated_lufs, 'true_peak_dbtp', v.true_peak_dbtp));
  return v;
end;
$$;

-- Approve & lock (API checks readiness first; DB re-checks the plan and that the
-- latest measurement is of the current revision).
create or replace function public.approve_audio_session(p_project_id uuid, p_scene_id uuid)
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
  insert into public.audio_session_versions(org_id, project_id, session_id, version_number, shot_plan_version_id, tracks, clips, measurement, created_by)
  values (v_org, p_project_id, s.id, n, s.shot_plan_version_id,
    (select coalesce(jsonb_agg(to_jsonb(t) - 'org_id' order by t.ordinal), '[]') from public.audio_tracks t where t.session_id = s.id),
    (select coalesce(jsonb_agg(to_jsonb(c) - 'org_id' - 'created_by' order by c.start_seconds), '[]') from public.audio_clips c where c.session_id = s.id),
    to_jsonb(m) - 'org_id', auth.uid())
  returning * into v;
  update public.audio_sessions set status = 'approved', review_state = 'current', review_reason = null, approved_version_id = v.id where id = s.id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'AudioSessionApproved', 'AudioSession', s.id, jsonb_build_object('version_number', n, 'integrated_lufs', m.integrated_lufs));
  return v;
end;
$$;

create or replace function public.set_audio_review(p_session_id uuid, p_state text, p_reason text)
returns public.audio_sessions
language plpgsql security definer set search_path = public as $$
declare v public.audio_sessions;
begin
  select * into v from public.audio_sessions where id = p_session_id for update;
  if v.id is null then raise exception 'AURA-AUD-404: audio session not found' using errcode = 'P0404'; end if;
  perform public.audio_assert(v.project_id, null);
  if p_state not in ('current','review_required','stale') then raise exception 'AURA-AUD-400: invalid review state' using errcode = 'P0400'; end if;
  if v.review_state = p_state and v.review_reason is not distinct from p_reason then return v; end if;
  update public.audio_sessions set review_state = p_state, review_reason = p_reason where id = v.id returning * into v;
  if p_state <> 'current' then
    insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
    values (v.org_id, auth.uid(), 'UpstreamVersionChanged', 'AudioSession', v.id, jsonb_build_object('state', p_state, 'reason', p_reason));
  end if;
  return v;
end;
$$;

revoke execute on function public.audio_assert(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.audio_touch(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.register_asset(uuid, text, text, text, text, jsonb) from public, anon;
revoke execute on function public.spot_audio_session(uuid, uuid, uuid, numeric, jsonb, jsonb, text) from public, anon;
revoke execute on function public.update_audio_track(uuid, jsonb) from public, anon;
revoke execute on function public.save_audio_clip(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.delete_audio_clip(uuid) from public, anon;
revoke execute on function public.record_audio_measurement(uuid, jsonb) from public, anon;
revoke execute on function public.approve_audio_session(uuid, uuid) from public, anon;
revoke execute on function public.set_audio_review(uuid, text, text) from public, anon;
grant execute on function public.register_asset(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.spot_audio_session(uuid, uuid, uuid, numeric, jsonb, jsonb, text) to authenticated;
grant execute on function public.update_audio_track(uuid, jsonb) to authenticated;
grant execute on function public.save_audio_clip(uuid, uuid, jsonb) to authenticated;
grant execute on function public.delete_audio_clip(uuid) to authenticated;
grant execute on function public.record_audio_measurement(uuid, jsonb) to authenticated;
grant execute on function public.approve_audio_session(uuid, uuid) to authenticated;
grant execute on function public.set_audio_review(uuid, text, text) to authenticated;
