-- Transitions on picture clips (Editorial, 2026-09-30): a dissolve blends in from the last frame of the picture before,
-- a fade goes from/to black — over the clip's own first/last frames, so no timing changes and sound stays in sync.
-- Snapshots (timeline_versions.clips) copy every clip column, so versions and Picture Locks carry the transition.
-- The body lives in app_private (migration 0019 put the permission gate in the public wrapper).
alter table public.timeline_clips add column if not exists transition jsonb not null default '{"in":"cut","out":"cut","frames":12}'::jsonb;

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
    scene_id, shot_id, take_id, audio_session_version_id, label, grade, transition)
  select x.id, v_org, p_project_id, t.id, x.track, x.kind, x.record_in, x.duration, x.source_in, x.source_frames,
    x.scene_id, x.shot_id, x.take_id, x.audio_session_version_id, x.label, coalesce(x.grade, '{"exposure":0,"contrast":0,"saturation":0,"temperature":0}'::jsonb),
    coalesce(x.transition, '{"in":"cut","out":"cut","frames":12}'::jsonb)
  from jsonb_to_recordset(coalesce(p_clips, '[]'::jsonb)) as x(id uuid, track text, kind text, record_in int, duration int, source_in int, source_frames int,
    scene_id uuid, shot_id uuid, take_id uuid, audio_session_version_id uuid, label text, grade jsonb, transition jsonb);

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
  select b.label into bad from (
    select label, record_in, lag(record_in + duration) over (partition by track order by record_in) as prev_end
    from public.timeline_clips where timeline_id = t.id) b where b.record_in < b.prev_end limit 1;
  if bad is not null then raise exception 'AURA-EDT-400: “%” overlaps the clip before it', bad using errcode = 'P0400'; end if;
  select c.label into bad from public.timeline_clips c where c.timeline_id = t.id and (
    coalesce(c.transition->>'in', 'cut') not in ('cut', 'dissolve', 'fade_from_black') or coalesce(c.transition->>'out', 'cut') not in ('cut', 'fade_to_black')
    or jsonb_typeof(c.transition->'frames') is distinct from 'number' or (c.transition->>'frames')::numeric not between 2 and 96
    or (c.track = 'A1' and (c.transition->>'in' <> 'cut' or c.transition->>'out' <> 'cut'))
    or ((case when c.transition->>'in' <> 'cut' then 1 else 0 end) + (case when c.transition->>'out' <> 'cut' then 1 else 0 end)) * (c.transition->>'frames')::int > c.duration) limit 1;
  if bad is not null then raise exception 'AURA-EDT-400: “%” has a transition that doesn''t fit it', bad using errcode = 'P0400'; end if;

  update public.timelines set revision = gen_random_uuid(), engine_version = p_engine_version where id = t.id returning * into t;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'TimelineEdited', 'Timeline', t.id, jsonb_build_object('action', p_action, 'summary', p_summary,
    'clips', (select count(*) from public.timeline_clips where timeline_id = t.id)));
  return t;
end;
$$;
