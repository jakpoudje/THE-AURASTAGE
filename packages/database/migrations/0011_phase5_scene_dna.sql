-- Phase 5: Scene DNA + production-graph invalidation (SRS §8, §14).
-- Canonical owner: Scene DNA (apps/api/src/modules/scene-dna). Reads Scriptwriter,
-- Casting and Dialogue; never writes them.
--
-- scene_dna           one working record per scene: the fields a person edits,
--                     plus status / review_state / drift evidence
-- scene_dna_versions  immutable approved snapshots: full content + the exact
--                     upstream dependency refs (type, id, fingerprint) frozen
--                     at approval (CLAUDE.md rule 10)
-- Upstream changes mark the record review_required / stale with evidence
-- (packages/production-graph computeDrift); nothing is deleted (rule 11).

create table if not exists public.scene_dna (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid not null unique references public.scenes(id) on delete cascade,
  purpose text check (purpose is null or char_length(purpose) <= 1000),
  stakes text check (stakes is null or char_length(stakes) <= 1000),
  story_time text check (story_time is null or char_length(story_time) <= 200),
  mood text[] not null default '{}' check (cardinality(mood) <= 8),
  weather text check (weather is null or char_length(weather) <= 200),
  atmosphere text check (atmosphere is null or char_length(atmosphere) <= 500),
  lighting_intent text check (lighting_intent is null or char_length(lighting_intent) <= 1000),
  sound_intent text check (sound_intent is null or char_length(sound_intent) <= 1000),
  camera_energy text check (camera_energy is null or camera_energy in ('calm','measured','dynamic','frenetic')),
  silent_scene boolean not null default false,
  wardrobe jsonb not null default '{}'::jsonb,
  notes text check (notes is null or char_length(notes) <= 4000),
  status text not null default 'draft' check (status in ('draft','approved')),
  review_state text not null default 'current' check (review_state in ('current','review_required','stale')),
  approved_version_id uuid,
  drift jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_scene_dna_project on public.scene_dna(project_id);
drop trigger if exists trg_scene_dna_updated_at on public.scene_dna;
create trigger trg_scene_dna_updated_at before update on public.scene_dna
  for each row execute function public.set_updated_at();

create table if not exists public.scene_dna_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_dna_id uuid not null references public.scene_dna(id) on delete cascade,
  version_number int not null,
  content jsonb not null,
  dependencies jsonb not null,
  engine_version text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (scene_dna_id, version_number)
);
alter table public.scene_dna drop constraint if exists scene_dna_approved_version_fk;
alter table public.scene_dna add constraint scene_dna_approved_version_fk
  foreign key (approved_version_id) references public.scene_dna_versions(id) on delete set null;

alter table public.scene_dna enable row level security;
alter table public.scene_dna_versions enable row level security;
drop policy if exists scene_dna_select on public.scene_dna;
create policy scene_dna_select on public.scene_dna for select using (public.is_org_member(org_id));
drop policy if exists scene_dna_versions_select on public.scene_dna_versions;
create policy scene_dna_versions_select on public.scene_dna_versions for select using (public.is_org_member(org_id));

-- Internal guard: caller is a member and the scene belongs to the project. Returns org_id.
create or replace function public.scene_dna_assert(p_project_id uuid, p_scene_id uuid) returns uuid
language plpgsql security definer stable set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-SDNA-403: not allowed to change this project''s Scene DNA' using errcode = '42501';
  end if;
  if not exists (select 1 from public.scenes where id = p_scene_id and project_id = p_project_id) then
    raise exception 'AURA-SDNA-404: scene not found in this project' using errcode = 'P0404';
  end if;
  return v_org;
end;
$$;

-- Save the editable draft. Editing after approval reopens it (status draft);
-- the approved version stays in history until the next approval.
create or replace function public.save_scene_dna(p_project_id uuid, p_scene_id uuid, p_patch jsonb)
returns public.scene_dna
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_d public.scene_dna;
begin
  v_org := public.scene_dna_assert(p_project_id, p_scene_id);
  insert into public.scene_dna(org_id, project_id, scene_id) values (v_org, p_project_id, p_scene_id)
    on conflict (scene_id) do nothing;
  update public.scene_dna set
    purpose = case when p_patch ? 'purpose' then nullif(p_patch->>'purpose', '') else purpose end,
    stakes = case when p_patch ? 'stakes' then nullif(p_patch->>'stakes', '') else stakes end,
    story_time = case when p_patch ? 'story_time' then nullif(p_patch->>'story_time', '') else story_time end,
    mood = case when p_patch ? 'mood' then coalesce(array(select jsonb_array_elements_text(p_patch->'mood')), '{}') else mood end,
    weather = case when p_patch ? 'weather' then nullif(p_patch->>'weather', '') else weather end,
    atmosphere = case when p_patch ? 'atmosphere' then nullif(p_patch->>'atmosphere', '') else atmosphere end,
    lighting_intent = case when p_patch ? 'lighting_intent' then nullif(p_patch->>'lighting_intent', '') else lighting_intent end,
    sound_intent = case when p_patch ? 'sound_intent' then nullif(p_patch->>'sound_intent', '') else sound_intent end,
    camera_energy = case when p_patch ? 'camera_energy' then nullif(p_patch->>'camera_energy', '') else camera_energy end,
    silent_scene = case when p_patch ? 'silent_scene' then (p_patch->>'silent_scene')::boolean else silent_scene end,
    wardrobe = case when p_patch ? 'wardrobe' then coalesce(p_patch->'wardrobe', '{}'::jsonb) else wardrobe end,
    notes = case when p_patch ? 'notes' then nullif(p_patch->>'notes', '') else notes end,
    status = 'draft'
  where scene_id = p_scene_id returning * into v_d;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'SceneDNAUpdated', 'SceneDNA', v_d.id, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return v_d;
end;
$$;

-- Approve & lock (SRS §8.1 step 10): freeze content + dependency refs as a new
-- immutable version. The API only calls this after blocking readiness passes.
create or replace function public.approve_scene_dna(p_project_id uuid, p_scene_id uuid, p_content jsonb, p_dependencies jsonb, p_engine_version text)
returns public.scene_dna_versions
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_d public.scene_dna; v_n int; v_v public.scene_dna_versions;
begin
  v_org := public.scene_dna_assert(p_project_id, p_scene_id);
  if not exists (select 1 from public.scenes where id = p_scene_id and status = 'active') then
    raise exception 'AURA-SDNA-409: this scene is no longer in the approved script' using errcode = 'P0409';
  end if;
  insert into public.scene_dna(org_id, project_id, scene_id) values (v_org, p_project_id, p_scene_id)
    on conflict (scene_id) do nothing;
  select * into v_d from public.scene_dna where scene_id = p_scene_id for update;
  select coalesce(max(version_number), 0) + 1 into v_n from public.scene_dna_versions where scene_dna_id = v_d.id;
  insert into public.scene_dna_versions(org_id, project_id, scene_dna_id, version_number, content, dependencies, engine_version, created_by)
  values (v_org, p_project_id, v_d.id, v_n, p_content, p_dependencies, p_engine_version, auth.uid())
  returning * into v_v;
  update public.scene_dna set status = 'approved', review_state = 'current', drift = '[]'::jsonb, approved_version_id = v_v.id
    where id = v_d.id;
  insert into public.jobs(org_id, project_id, engine_id, engine_version, status, input_snapshot, output_refs, attempt, started_at, completed_at)
  values (v_org, p_project_id, 'scene-dna.sceneDnaAssemblyEngine', p_engine_version, 'completed',
          jsonb_build_object('scene_id', p_scene_id, 'dependencies', jsonb_array_length(p_dependencies)),
          jsonb_build_object('scene_dna_version_id', v_v.id, 'version_number', v_n), 1, now(), now());
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'SceneDNAApproved', 'SceneDNA', v_d.id,
          jsonb_build_object('version_id', v_v.id, 'version_number', v_n, 'scene_id', p_scene_id, 'engine_version', p_engine_version));
  return v_v;
end;
$$;

-- Persist drift evidence (MOS invalidation step). Idempotent: only writes when the
-- state or evidence actually changes; logs UpstreamVersionChanged when it leaves 'current'.
create or replace function public.set_scene_dna_drift(p_scene_dna_id uuid, p_state text, p_drift jsonb)
returns public.scene_dna
language plpgsql security definer set search_path = public as $$
declare v_d public.scene_dna;
begin
  select * into v_d from public.scene_dna where id = p_scene_dna_id for update;
  if v_d.id is null then raise exception 'AURA-SDNA-404: Scene DNA not found' using errcode = 'P0404'; end if;
  perform public.scene_dna_assert(v_d.project_id, v_d.scene_id);
  if p_state not in ('current','review_required','stale') then
    raise exception 'AURA-SDNA-400: invalid review state' using errcode = 'P0400';
  end if;
  if v_d.approved_version_id is null or (v_d.review_state = p_state and v_d.drift = p_drift) then
    return v_d;
  end if;
  update public.scene_dna set review_state = p_state, drift = p_drift where id = v_d.id returning * into v_d;
  if p_state <> 'current' then
    insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
    values (v_d.org_id, auth.uid(), 'UpstreamVersionChanged', 'SceneDNA', v_d.id,
            jsonb_build_object('state', p_state, 'changes', jsonb_array_length(p_drift), 'approved_version_id', v_d.approved_version_id));
  end if;
  return v_d;
end;
$$;

revoke execute on function public.scene_dna_assert(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.save_scene_dna(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.approve_scene_dna(uuid, uuid, jsonb, jsonb, text) from public, anon;
revoke execute on function public.set_scene_dna_drift(uuid, text, jsonb) from public, anon;
grant execute on function public.save_scene_dna(uuid, uuid, jsonb) to authenticated;
grant execute on function public.approve_scene_dna(uuid, uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.set_scene_dna_drift(uuid, text, jsonb) to authenticated;
