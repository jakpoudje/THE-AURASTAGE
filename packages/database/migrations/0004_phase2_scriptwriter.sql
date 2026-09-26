-- Phase 2: Scriptwriter canonical storage (SRS §3, §5).
-- Canonical owner of scripts / script_versions / scenes: Scriptwriter
-- (apps/api/src/modules/screenplay). Other domains read these rows by ID;
-- they never write them (CLAUDE.md rule 4).
--
-- Versioning (CLAUDE.md rule 10): script_versions are immutable. Every save
-- appends a new version; approval pins one exact version, and every scene row
-- records the source_version_id it was derived from.
--
-- Invalidation (CLAUDE.md rule 11): re-approval never deletes scenes. Scenes
-- that disappear from the newly approved version are marked 'omitted', and
-- scenes whose content changed get review_state = 'review_required' so
-- downstream Scene DNA work (Phase 5) can see they need another look.

-- 1. Story-setup fields owned by Scriptwriter on the Project root ------------
alter table public.projects add column if not exists tone text;
alter table public.projects add column if not exists audience text;
alter table public.projects add column if not exists opening_style text;
alter table public.projects add column if not exists ending_style text;

-- 2. Scripts (one canonical screenplay per project) --------------------------
create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','approved')),
  current_version_id uuid,
  approved_version_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_scripts_org on public.scripts(org_id);

drop trigger if exists trg_scripts_updated_at on public.scripts;
create trigger trg_scripts_updated_at before update on public.scripts
  for each row execute function public.set_updated_at();

-- 3. Script versions (immutable) ---------------------------------------------
create table if not exists public.script_versions (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  version_number int not null,
  source_text text not null,
  elements jsonb not null default '[]'::jsonb,
  parser_version text not null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (script_id, version_number)
);
create index if not exists idx_script_versions_script on public.script_versions(script_id);

alter table public.scripts
  drop constraint if exists scripts_current_version_fk,
  add constraint scripts_current_version_fk foreign key (current_version_id)
    references public.script_versions(id) on delete set null;
alter table public.scripts
  drop constraint if exists scripts_approved_version_fk,
  add constraint scripts_approved_version_fk foreign key (approved_version_id)
    references public.script_versions(id) on delete set null;

-- 4. Scenes (narrative/production anchor; derived from the approved version) -
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  script_id uuid not null references public.scripts(id) on delete cascade,
  number int not null,
  heading text not null,
  int_ext text not null check (int_ext in ('INT','EXT','INT/EXT','UNKNOWN')),
  location text not null,
  time_of_day text,
  speaking_characters text[] not null default '{}',
  estimated_seconds int not null default 0,
  element_start int not null,
  element_end int not null,
  content_hash text not null,
  source_version_id uuid not null references public.script_versions(id),
  status text not null default 'active' check (status in ('active','omitted')),
  review_state text not null default 'current' check (review_state in ('current','review_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (script_id, number)
);
create index if not exists idx_scenes_project on public.scenes(project_id);

drop trigger if exists trg_scenes_updated_at on public.scenes;
create trigger trg_scenes_updated_at before update on public.scenes
  for each row execute function public.set_updated_at();

-- 5. Row Level Security ------------------------------------------------------
alter table public.scripts enable row level security;
alter table public.script_versions enable row level security;
alter table public.scenes enable row level security;

drop policy if exists scripts_select on public.scripts;
create policy scripts_select on public.scripts for select
  using (public.is_org_member(org_id));
drop policy if exists script_versions_select on public.script_versions;
create policy script_versions_select on public.script_versions for select
  using (public.is_org_member(org_id));
drop policy if exists scenes_select on public.scenes;
create policy scenes_select on public.scenes for select
  using (public.is_org_member(org_id));
-- No direct insert/update/delete policies: every write goes through the two
-- functions below, which enforce membership, concurrency and versioning in a
-- single transaction.

-- 6. Save a new immutable version (optimistic concurrency) -------------------
create or replace function public.save_script_version(
  p_project_id uuid,
  p_base_version_id uuid,
  p_source_text text,
  p_elements jsonb,
  p_parser_version text,
  p_note text
) returns public.script_versions
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_script public.scripts;
  v_next int;
  v_version public.script_versions;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-SCR-403: not allowed to edit this project' using errcode = '42501';
  end if;

  insert into public.scripts(org_id, project_id, created_by)
  values (v_org, p_project_id, auth.uid())
  on conflict (project_id) do nothing;

  select * into v_script from public.scripts where project_id = p_project_id for update;

  if v_script.current_version_id is distinct from p_base_version_id then
    raise exception 'AURA-SCR-409: script changed since you opened it' using errcode = 'P0409';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
  from public.script_versions where script_id = v_script.id;

  insert into public.script_versions(script_id, org_id, version_number, source_text, elements, parser_version, note, created_by)
  values (v_script.id, v_org, v_next, p_source_text, p_elements, p_parser_version, p_note, auth.uid())
  returning * into v_version;

  update public.scripts set current_version_id = v_version.id where id = v_script.id;

  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'ScriptVersionSaved', 'ScriptVersion', v_version.id,
          jsonb_build_object('project_id', p_project_id, 'script_id', v_script.id,
                             'version_number', v_next, 'base_version_id', p_base_version_id,
                             'parser_version', p_parser_version));
  return v_version;
end;
$$;

-- 7. Approve a version and derive scenes idempotently (SRS §5.2) -------------
-- p_scenes: array of {number, heading, int_ext, location, time_of_day,
-- speaking_characters[], estimated_seconds, element_start, element_end,
-- content_hash}, computed by story.sceneBoundaryEngine from that exact version.
create or replace function public.approve_script_version(
  p_project_id uuid,
  p_version_id uuid,
  p_scenes jsonb,
  p_engine_version text
) returns public.scripts
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_script public.scripts;
  v_scene jsonb;
  v_count int := 0;
  v_created int := 0;
  v_changed int := 0;
  v_omitted int := 0;
  v_existing public.scenes;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-SCR-403: not allowed to approve this script' using errcode = '42501';
  end if;

  select * into v_script from public.scripts where project_id = p_project_id for update;
  if v_script.id is null then
    raise exception 'AURA-SCR-404: this project has no script yet' using errcode = 'P0404';
  end if;
  if not exists (select 1 from public.script_versions where id = p_version_id and script_id = v_script.id) then
    raise exception 'AURA-SCR-404: version does not belong to this script' using errcode = 'P0404';
  end if;

  -- Idempotent: approving the already-approved version is a no-op.
  if v_script.approved_version_id = p_version_id then
    return v_script;
  end if;

  for v_scene in select * from jsonb_array_elements(p_scenes) loop
    v_count := v_count + 1;
    select * into v_existing from public.scenes
      where script_id = v_script.id and number = (v_scene->>'number')::int;

    if v_existing.id is null then
      insert into public.scenes(org_id, project_id, script_id, number, heading, int_ext, location,
        time_of_day, speaking_characters, estimated_seconds, element_start, element_end,
        content_hash, source_version_id)
      values (v_org, p_project_id, v_script.id, (v_scene->>'number')::int, v_scene->>'heading',
        v_scene->>'int_ext', v_scene->>'location', v_scene->>'time_of_day',
        coalesce(array(select jsonb_array_elements_text(v_scene->'speaking_characters')), '{}'),
        (v_scene->>'estimated_seconds')::int, (v_scene->>'element_start')::int,
        (v_scene->>'element_end')::int, v_scene->>'content_hash', p_version_id);
      v_created := v_created + 1;
    else
      update public.scenes set
        heading = v_scene->>'heading',
        int_ext = v_scene->>'int_ext',
        location = v_scene->>'location',
        time_of_day = v_scene->>'time_of_day',
        speaking_characters = coalesce(array(select jsonb_array_elements_text(v_scene->'speaking_characters')), '{}'),
        estimated_seconds = (v_scene->>'estimated_seconds')::int,
        element_start = (v_scene->>'element_start')::int,
        element_end = (v_scene->>'element_end')::int,
        content_hash = v_scene->>'content_hash',
        source_version_id = p_version_id,
        status = 'active',
        review_state = case
          when v_existing.content_hash <> v_scene->>'content_hash' or v_existing.status = 'omitted'
            then 'review_required' else v_existing.review_state end
      where id = v_existing.id;
      if v_existing.content_hash <> v_scene->>'content_hash' or v_existing.status = 'omitted' then
        v_changed := v_changed + 1;
      end if;
    end if;
  end loop;

  -- Scenes no longer present are marked omitted, never deleted.
  update public.scenes set status = 'omitted', review_state = 'review_required'
    where script_id = v_script.id and number > v_count and status <> 'omitted';
  get diagnostics v_omitted = row_count;

  update public.scripts set status = 'approved', approved_version_id = p_version_id
    where id = v_script.id returning * into v_script;

  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'ScriptApproved', 'Script', v_script.id,
          jsonb_build_object('project_id', p_project_id, 'version_id', p_version_id,
                             'engine_version', p_engine_version, 'scene_count', v_count,
                             'scenes_created', v_created, 'scenes_review_required', v_changed,
                             'scenes_omitted', v_omitted));
  return v_script;
end;
$$;

revoke execute on function public.save_script_version(uuid, uuid, text, jsonb, text, text) from public, anon;
revoke execute on function public.approve_script_version(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.save_script_version(uuid, uuid, text, jsonb, text, text) to authenticated;
grant execute on function public.approve_script_version(uuid, uuid, jsonb, text) to authenticated;
