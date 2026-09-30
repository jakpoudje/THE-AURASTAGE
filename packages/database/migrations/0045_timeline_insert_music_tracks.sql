-- Editorial insert and music tracks (BUILD_PLAN §8 item 9, 2026-09-30). V2 = an approved take shown over the picture
-- while it lasts (inserts, cutaways); A2 = music that runs across scenes: an audio file from the Assets Library at its own
-- level. Both ride along with the cut on every ripple edit, are part of every timeline version and Picture Lock
-- (snapshots copy every clip column) and reach the render (renderManifest 1.7.0). An asset on the music track counts as
-- "in use" for the Assets Library's delete warning.
alter table public.timeline_clips drop constraint if exists timeline_clips_track_check;
alter table public.timeline_clips add constraint timeline_clips_track_check check (track in ('V1', 'V2', 'A1', 'A2'));
alter table public.timeline_clips drop constraint if exists timeline_clips_kind_check;
alter table public.timeline_clips add constraint timeline_clips_kind_check check (kind in ('take', 'slug', 'audio_mix', 'music'));
alter table public.timeline_clips drop constraint if exists timeline_clips_kind_track;
alter table public.timeline_clips add constraint timeline_clips_kind_track check (
  (track = 'A1' and kind = 'audio_mix') or (track = 'A2' and kind = 'music') or (track = 'V1' and kind in ('take', 'slug')) or (track = 'V2' and kind = 'take'));
alter table public.timeline_clips add column if not exists asset_id uuid references public.assets(id) on delete restrict;
alter table public.timeline_clips add column if not exists gain_db numeric not null default 0 check (gain_db between -60 and 12);
alter table public.timeline_clips drop constraint if exists timeline_clips_music_asset;
alter table public.timeline_clips add constraint timeline_clips_music_asset check ((kind = 'music') = (asset_id is not null));
create index if not exists timeline_clips_asset_idx on public.timeline_clips(asset_id) where asset_id is not null;

create or replace function app_private.save_timeline(p_project_id uuid, p_base_revision uuid, p_clips jsonb, p_action text, p_summary text,
  p_engine_version text, p_break_lock boolean, p_impact jsonb)
returns public.timelines
language plpgsql security definer set search_path = public as $$
declare v_org uuid; t public.timelines; bad text;
begin
  v_org := public.editorial_assert(p_project_id);
  select * into t from public.timelines where project_id = p_project_id for update;
  if t.id is null then
    if p_base_revision is not null then raise exception 'AURA-EDT-409: the timeline changed — reload and try again' using errcode = 'P0409'; end if;
    insert into public.timelines(org_id, project_id) values (v_org, p_project_id) returning * into t;
  elsif p_base_revision is null or t.revision <> p_base_revision then
    raise exception 'AURA-EDT-409: the timeline changed — reload and try again' using errcode = 'P0409';
  end if;
  if t.status = 'locked' then
    if not coalesce(p_break_lock, false) then
      raise exception 'AURA-EDT-423: the picture is locked — breaking the lock needs confirmation' using errcode = 'P0423';
    end if;
    update public.picture_locks set broken_at = now(), broken_by = auth.uid(), impact = coalesce(p_impact, '[]'::jsonb) where id = t.current_lock_id;
    insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
    values (v_org, auth.uid(), 'PictureLockBroken', 'Timeline', t.id, jsonb_build_object('lock_id', t.current_lock_id, 'impact', coalesce(p_impact, '[]'::jsonb), 'action', p_action));
    update public.timelines set status = 'draft', current_lock_id = null where id = t.id;
  end if;

  delete from public.timeline_clips where timeline_id = t.id;
  insert into public.timeline_clips(id, org_id, project_id, timeline_id, track, kind, record_in, duration, source_in, source_frames,
    scene_id, shot_id, take_id, audio_session_version_id, label, grade, transition, asset_id, gain_db)
  select x.id, v_org, p_project_id, t.id, x.track, x.kind, x.record_in, x.duration, x.source_in, x.source_frames,
    x.scene_id, x.shot_id, x.take_id, x.audio_session_version_id, x.label, coalesce(x.grade, '{"exposure":0,"contrast":0,"saturation":0,"temperature":0}'::jsonb),
    coalesce(x.transition, '{"in":"cut","out":"cut","frames":12}'::jsonb), x.asset_id, coalesce(x.gain_db, 0)
  from jsonb_to_recordset(coalesce(p_clips, '[]'::jsonb)) as x(id uuid, track text, kind text, record_in int, duration int, source_in int, source_frames int,
    scene_id uuid, shot_id uuid, take_id uuid, audio_session_version_id uuid, label text, grade jsonb, transition jsonb, asset_id uuid, gain_db numeric);

  -- References must belong to this project and be usable.
  select c.label into bad from public.timeline_clips c where c.timeline_id = t.id and c.scene_id is not null
    and not exists (select 1 from public.scenes s where s.id = c.scene_id and s.project_id = p_project_id) limit 1;
  if bad is not null then raise exception 'AURA-EDT-400: “%” refers to a scene outside this project', bad using errcode = 'P0400'; end if;
  select c.label into bad from public.timeline_clips c where c.timeline_id = t.id and c.kind = 'take'
    and not exists (select 1 from public.takes k where k.id = c.take_id and k.project_id = p_project_id and k.status = 'succeeded' and k.shot_id = c.shot_id) limit 1;
  if bad is not null then raise exception 'AURA-EDT-400: “%” needs a finished take of its shot from this project', bad using errcode = 'P0400'; end if;
  select c.label into bad from public.timeline_clips c where c.timeline_id = t.id and c.kind = 'audio_mix'
    and not exists (select 1 from public.audio_session_versions v join public.audio_sessions s on s.id = v.session_id
      where v.id = c.audio_session_version_id and v.project_id = p_project_id and s.scene_id = c.scene_id) limit 1;
  if bad is not null then raise exception 'AURA-EDT-400: “%” needs an approved mix of its scene from this project', bad using errcode = 'P0400'; end if;
  select c.label into bad from public.timeline_clips c where c.timeline_id = t.id and c.kind = 'music'
    and not exists (select 1 from public.assets a where a.id = c.asset_id and a.project_id = p_project_id and a.type = 'audio' and a.archived_at is null) limit 1;
  if bad is not null then raise exception 'AURA-EDT-400: “%” needs an audio file from this project''s Assets Library', bad using errcode = 'P0400'; end if;
  select b.label into bad from (
    select label, record_in, lag(record_in + duration) over (partition by track order by record_in) as prev_end
    from public.timeline_clips where timeline_id = t.id) b where b.record_in < b.prev_end limit 1;
  if bad is not null then raise exception 'AURA-EDT-400: “%” overlaps the clip before it', bad using errcode = 'P0400'; end if;
  select c.label into bad from public.timeline_clips c where c.timeline_id = t.id and (
    coalesce(c.transition->>'in', 'cut') not in ('cut', 'dissolve', 'fade_from_black') or coalesce(c.transition->>'out', 'cut') not in ('cut', 'fade_to_black')
    or jsonb_typeof(c.transition->'frames') is distinct from 'number' or (c.transition->>'frames')::numeric not between 2 and 96
    or (c.track <> 'V1' and (c.transition->>'in' <> 'cut' or c.transition->>'out' <> 'cut'))
    or ((case when c.transition->>'in' <> 'cut' then 1 else 0 end) + (case when c.transition->>'out' <> 'cut' then 1 else 0 end)) * (c.transition->>'frames')::int > c.duration) limit 1;
  if bad is not null then raise exception 'AURA-EDT-400: “%” has a transition that doesn''t fit it', bad using errcode = 'P0400'; end if;

  update public.timelines set revision = gen_random_uuid(), engine_version = p_engine_version where id = t.id returning * into t;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'TimelineEdited', 'Timeline', t.id, jsonb_build_object('action', p_action, 'summary', p_summary,
    'clips', (select count(*) from public.timeline_clips where timeline_id = t.id)));
  return t;
end;
$$;

-- The Assets Library's delete names the music track too (migration 0043 + this check).
create or replace function public.delete_asset(p_asset uuid, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.assets; v_paths text[]; v_scenes text; v_uses int;
begin
  select * into a from public.assets where id = p_asset for update;
  if a.id is null or a.project_id is null then raise exception 'AURA-AST-404: asset not found' using errcode = 'P0404'; end if;
  perform public.gate_write(a.project_id, 'assets', 'edit');

  select string_agg(distinct 'Scene ' || s.number, ', ') into v_scenes
    from public.audio_clips c join public.audio_sessions se on se.id = c.session_id join public.scenes s on s.id = se.scene_id
   where c.asset_id = a.id;
  if v_scenes is not null then
    raise exception 'AURA-AST-409: “%” is placed on Audio Studio clips in % — remove it from those clips first (or archive it to hide it)', a.name, v_scenes
      using errcode = 'P0409';
  end if;

  -- Music on the cut's A2 track (migration 0045): the cut would lose it, so the timeline edit comes first.
  if exists (select 1 from public.timeline_clips where asset_id = a.id) then
    raise exception 'AURA-AST-409: “%” is on the music track of the cut in Editorial — remove it from the timeline first (or archive it to hide it)', a.name
      using errcode = 'P0409';
  end if;

  select (select count(*) from public.asset_links where asset_id = a.id)
       + (select count(*) from public.character_reference_images where asset_id = a.id)
       + (select count(*) from public.world_reference_images where asset_id = a.id)
       + (select count(*) from public.renders r where r.project_id = a.project_id and r.manifest::text like '%' || a.id::text || '%')
    into v_uses;
  if v_uses > 0 and not coalesce(p_confirm, false) then
    raise exception 'AURA-AST-409: “%” is in use in this project — confirm to delete it anyway', a.name using errcode = 'P0409';
  end if;

  select array_remove(array_agg(distinct p), null) into v_paths
    from (select a.storage_path as p union all select storage_path from public.asset_versions where asset_id = a.id) x;
  delete from public.assets where id = a.id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (a.org_id, auth.uid(), 'AssetDeleted', 'Asset', a.id, jsonb_build_object('name', a.name, 'uses', v_uses, 'files', coalesce(array_length(v_paths, 1), 0)));
  return jsonb_build_object('name', a.name, 'storage_paths', to_jsonb(coalesce(v_paths, '{}')));
end;
$$;
revoke all on function public.delete_asset(uuid, boolean) from public, anon;
grant execute on function public.delete_asset(uuid, boolean) to authenticated;
