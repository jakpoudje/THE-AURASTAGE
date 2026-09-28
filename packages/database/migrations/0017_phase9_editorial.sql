-- Phase 9: Editorial & Timeline (SRS §12). Canonical owner: Editorial.
-- One timeline per project (V1 picture, A1 scene mixes). Clips reference approved
-- Takes and approved audio session versions by id; media is never copied.
-- Every edit replaces the clip list atomically against a revision (optimistic
-- concurrency). Named versions and Picture Locks are immutable snapshots.
-- Editing a locked picture requires an explicit break, recorded with its impact.

create table if not exists public.timelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  fps int not null default 24 check (fps between 1 and 120),
  status text not null default 'draft' check (status in ('draft','locked')),
  current_lock_id uuid,
  review_state text not null default 'current' check (review_state in ('current','review_required')),
  review_reason text,
  revision uuid not null default gen_random_uuid(),
  engine_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_timelines_updated_at on public.timelines;
create trigger trg_timelines_updated_at before update on public.timelines for each row execute function public.set_updated_at();

create table if not exists public.timeline_clips (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  track text not null check (track in ('V1','A1')),
  kind text not null check (kind in ('take','slug','audio_mix')),
  record_in int not null check (record_in >= 0),
  duration int not null check (duration >= 1),
  source_in int not null default 0 check (source_in >= 0),
  source_frames int check (source_frames is null or source_frames >= 1),
  scene_id uuid references public.scenes(id) on delete set null,
  shot_id uuid,
  take_id uuid references public.takes(id) on delete set null,
  audio_session_version_id uuid references public.audio_session_versions(id) on delete set null,
  label text not null check (char_length(label) between 1 and 200),
  grade jsonb not null default '{"exposure":0,"contrast":0,"saturation":0,"temperature":0}'::jsonb,
  constraint timeline_clips_kind_track check ((kind = 'audio_mix') = (track = 'A1')),
  constraint timeline_clips_source check (source_frames is null or source_in + duration <= source_frames)
);
create index if not exists idx_timeline_clips_timeline on public.timeline_clips(timeline_id, track, record_in);

create table if not exists public.timeline_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  version_number int not null,
  label text not null check (char_length(label) between 1 and 120),
  kind text not null check (kind in ('manual','auto','picture_lock')),
  fps int not null,
  clips jsonb not null,
  qc jsonb not null default '{}'::jsonb,
  duration_frames int not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (timeline_id, version_number)
);

create table if not exists public.picture_locks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  version_id uuid not null references public.timeline_versions(id),
  lock_number int not null,
  locked_by uuid references auth.users(id),
  locked_at timestamptz not null default now(),
  broken_at timestamptz,
  broken_by uuid references auth.users(id),
  impact jsonb,
  unique (timeline_id, lock_number)
);
alter table public.timelines drop constraint if exists timelines_current_lock_fk;
alter table public.timelines add constraint timelines_current_lock_fk foreign key (current_lock_id) references public.picture_locks(id) on delete set null;

alter table public.timelines enable row level security;
alter table public.timeline_clips enable row level security;
alter table public.timeline_versions enable row level security;
alter table public.picture_locks enable row level security;
drop policy if exists timelines_select on public.timelines;
create policy timelines_select on public.timelines for select using (public.is_org_member(org_id));
drop policy if exists timeline_clips_select on public.timeline_clips;
create policy timeline_clips_select on public.timeline_clips for select using (public.is_org_member(org_id));
drop policy if exists timeline_versions_select on public.timeline_versions;
create policy timeline_versions_select on public.timeline_versions for select using (public.is_org_member(org_id));
drop policy if exists picture_locks_select on public.picture_locks;
create policy picture_locks_select on public.picture_locks for select using (public.is_org_member(org_id));

-- Internal guard. Returns org_id.
create or replace function public.editorial_assert(p_project_id uuid) returns uuid
language plpgsql security definer stable set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-EDT-403: not allowed to edit this project''s timeline' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

-- Replace the whole clip list (one edit) against the revision it was made on.
create or replace function public.save_timeline(p_project_id uuid, p_base_revision uuid, p_clips jsonb, p_action text, p_summary text,
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
    scene_id, shot_id, take_id, audio_session_version_id, label, grade)
  select x.id, v_org, p_project_id, t.id, x.track, x.kind, x.record_in, x.duration, x.source_in, x.source_frames,
    x.scene_id, x.shot_id, x.take_id, x.audio_session_version_id, x.label, coalesce(x.grade, '{"exposure":0,"contrast":0,"saturation":0,"temperature":0}'::jsonb)
  from jsonb_to_recordset(coalesce(p_clips, '[]'::jsonb)) as x(id uuid, track text, kind text, record_in int, duration int, source_in int, source_frames int,
    scene_id uuid, shot_id uuid, take_id uuid, audio_session_version_id uuid, label text, grade jsonb);

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

  update public.timelines set revision = gen_random_uuid(), engine_version = p_engine_version where id = t.id returning * into t;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'TimelineEdited', 'Timeline', t.id, jsonb_build_object('action', p_action, 'summary', p_summary,
    'clips', (select count(*) from public.timeline_clips where timeline_id = t.id)));
  return t;
end;
$$;

-- Immutable snapshot of the current cut.
create or replace function public.save_timeline_version(p_project_id uuid, p_label text, p_kind text, p_qc jsonb)
returns public.timeline_versions
language plpgsql security definer set search_path = public as $$
declare v_org uuid; t public.timelines; n int; v public.timeline_versions;
begin
  v_org := public.editorial_assert(p_project_id);
  if p_kind not in ('manual','auto') then raise exception 'AURA-EDT-400: invalid version kind' using errcode = 'P0400'; end if;
  select * into t from public.timelines where project_id = p_project_id;
  if t.id is null then raise exception 'AURA-EDT-412: build the first assembly first' using errcode = 'P0412'; end if;
  select coalesce(max(version_number), 0) + 1 into n from public.timeline_versions where timeline_id = t.id;
  insert into public.timeline_versions(org_id, project_id, timeline_id, version_number, label, kind, fps, clips, qc, duration_frames, created_by)
  values (v_org, p_project_id, t.id, n, p_label, p_kind, t.fps,
    (select coalesce(jsonb_agg(to_jsonb(c) - 'org_id' - 'project_id' - 'timeline_id' order by c.track desc, c.record_in), '[]') from public.timeline_clips c where c.timeline_id = t.id),
    coalesce(p_qc, '{}'::jsonb),
    (select coalesce(max(record_in + duration), 0) from public.timeline_clips where timeline_id = t.id), auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'TimelineVersionSaved', 'Timeline', t.id, jsonb_build_object('version_number', n, 'label', p_label, 'kind', p_kind));
  return v;
end;
$$;

-- Picture Lock: a formal approved version. The API runs editorial QC first; the
-- database re-checks the revision, online media and that QC passed.
create or replace function public.lock_picture(p_project_id uuid, p_base_revision uuid, p_qc jsonb)
returns public.picture_locks
language plpgsql security definer set search_path = public as $$
declare v_org uuid; t public.timelines; n int; v public.timeline_versions; l public.picture_locks;
begin
  v_org := public.editorial_assert(p_project_id);
  select * into t from public.timelines where project_id = p_project_id for update;
  if t.id is null then raise exception 'AURA-EDT-412: build the first assembly first' using errcode = 'P0412'; end if;
  if t.revision <> p_base_revision then raise exception 'AURA-EDT-409: the timeline changed — reload and try again' using errcode = 'P0409'; end if;
  if t.status = 'locked' then raise exception 'AURA-EDT-409: the picture is already locked' using errcode = 'P0409'; end if;
  if coalesce((p_qc->>'ready_for_lock')::boolean, false) is not true then
    raise exception 'AURA-EDT-412: the timeline checks must pass before Picture Lock' using errcode = 'P0412';
  end if;
  if exists (select 1 from public.timeline_clips where timeline_id = t.id and track = 'V1' and kind = 'slug')
     or not exists (select 1 from public.timeline_clips where timeline_id = t.id and track = 'V1' and kind = 'take') then
    raise exception 'AURA-EDT-412: every shot needs an approved take before Picture Lock' using errcode = 'P0412';
  end if;
  select coalesce(max(lock_number), 0) + 1 into n from public.picture_locks where timeline_id = t.id;
  insert into public.timeline_versions(org_id, project_id, timeline_id, version_number, label, kind, fps, clips, qc, duration_frames, created_by)
  values (v_org, p_project_id, t.id, (select coalesce(max(version_number), 0) + 1 from public.timeline_versions where timeline_id = t.id),
    'Picture Lock ' || n, 'picture_lock', t.fps,
    (select coalesce(jsonb_agg(to_jsonb(c) - 'org_id' - 'project_id' - 'timeline_id' order by c.track desc, c.record_in), '[]') from public.timeline_clips c where c.timeline_id = t.id),
    p_qc, (select coalesce(max(record_in + duration), 0) from public.timeline_clips where timeline_id = t.id), auth.uid())
  returning * into v;
  insert into public.picture_locks(org_id, project_id, timeline_id, version_id, lock_number, locked_by)
  values (v_org, p_project_id, t.id, v.id, n, auth.uid()) returning * into l;
  update public.timelines set status = 'locked', current_lock_id = l.id where id = t.id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'PictureLocked', 'Timeline', t.id, jsonb_build_object('lock_number', n, 'version_id', v.id, 'duration_frames', v.duration_frames));
  return l;
end;
$$;

-- Upstream drift marker (never edits the cut; rule 11).
create or replace function public.set_timeline_review(p_project_id uuid, p_state text, p_reason text)
returns public.timelines
language plpgsql security definer set search_path = public as $$
declare v_org uuid; t public.timelines;
begin
  v_org := public.editorial_assert(p_project_id);
  if p_state not in ('current','review_required') then raise exception 'AURA-EDT-400: invalid review state' using errcode = 'P0400'; end if;
  select * into t from public.timelines where project_id = p_project_id for update;
  if t.id is null then raise exception 'AURA-EDT-404: no timeline yet' using errcode = 'P0404'; end if;
  if t.review_state = p_state and t.review_reason is not distinct from p_reason then return t; end if;
  update public.timelines set review_state = p_state, review_reason = p_reason where id = t.id returning * into t;
  if p_state <> 'current' then
    insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
    values (v_org, auth.uid(), 'UpstreamVersionChanged', 'Timeline', t.id, jsonb_build_object('reason', p_reason));
  end if;
  return t;
end;
$$;

revoke execute on function public.editorial_assert(uuid) from public, anon, authenticated;
revoke execute on function public.save_timeline(uuid, uuid, jsonb, text, text, text, boolean, jsonb) from public, anon;
revoke execute on function public.save_timeline_version(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.lock_picture(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.set_timeline_review(uuid, text, text) from public, anon;
grant execute on function public.save_timeline(uuid, uuid, jsonb, text, text, text, boolean, jsonb) to authenticated;
grant execute on function public.save_timeline_version(uuid, text, text, jsonb) to authenticated;
grant execute on function public.lock_picture(uuid, uuid, jsonb) to authenticated;
grant execute on function public.set_timeline_review(uuid, text, text) to authenticated;
