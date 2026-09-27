-- Phase 6: Storyboard & Shots (SRS §9, §9.1).
-- Canonical owner: Storyboard & Shots (apps/api/src/modules/shots). Reads the
-- LOCKED Scene DNA version (never writes Scene DNA, Casting or Dialogue).
--
-- shot_plans          one per scene: which locked Scene DNA version it was derived
--                     from (rule 10), draft/approved, review_state + reason
-- shots               the working shot list (Shot DNA fields), ordered
-- shot_plan_versions  immutable approved snapshots (shots + coverage evidence)
-- Upstream Scene DNA changes mark plans review_required / stale; nothing approved
-- is ever deleted (rule 11). Regenerating replaces draft shots only when the
-- person explicitly confirms (p_replace).

create table if not exists public.shot_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid not null unique references public.scenes(id) on delete cascade,
  scene_dna_version_id uuid not null references public.scene_dna_versions(id),
  status text not null default 'draft' check (status in ('draft','approved')),
  review_state text not null default 'current' check (review_state in ('current','review_required','stale')),
  review_reason text check (review_reason is null or char_length(review_reason) <= 500),
  approved_version_id uuid,
  engine_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_shot_plans_project on public.shot_plans(project_id);
drop trigger if exists trg_shot_plans_updated_at on public.shot_plans;
create trigger trg_shot_plans_updated_at before update on public.shot_plans
  for each row execute function public.set_updated_at();

create table if not exists public.shots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  plan_id uuid not null references public.shot_plans(id) on delete cascade,
  ordinal int not null check (ordinal > 0),
  purpose text not null check (purpose in ('establishing','master','dialogue','reaction','action','insert','transition')),
  size text not null check (size in ('EWS','WS','FULL','MWS','COWBOY','MS','MCU','CU','ECU','TWO_SHOT','THREE_SHOT','GROUP','OTS','POV','INSERT','CUTAWAY')),
  angle text not null default 'eye' check (angle in ('eye','high','low','dutch','overhead','birds_eye','worms_eye','ground','hip','shoulder','aerial')),
  movement text not null default 'static' check (movement in ('static','pan','tilt','push_in','pull_out','dolly','truck','pedestal','tracking','arc','crane','gimbal','steadicam','handheld','drone','zoom','dolly_zoom','whip_pan')),
  support text not null default 'tripod' check (support in ('tripod','shoulder','handheld','gimbal','steadicam','dolly','crane','vehicle','drone','virtual')),
  focus text not null default 'deep' check (focus in ('deep','shallow','focus_pull','rack_focus','subject_tracking')),
  lens_mm int check (lens_mm is null or lens_mm between 8 and 600),
  duration_seconds numeric not null check (duration_seconds > 0 and duration_seconds <= 600),
  description text not null check (char_length(description) between 1 and 500),
  composition text check (composition is null or char_length(composition) <= 500),
  lighting text check (lighting is null or char_length(lighting) <= 500),
  transition_in text not null default 'cut' check (transition_in in ('cut','match_cut','dissolve','fade','smash_cut','j_cut','l_cut')),
  notes text check (notes is null or char_length(notes) <= 2000),
  character_ids uuid[] not null default '{}',
  dialogue_line_ids uuid[] not null default '{}',
  story_start numeric not null check (story_start >= 0),
  story_end numeric not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shots_interval check (story_end >= story_start),
  constraint shots_plan_ordinal unique (plan_id, ordinal) deferrable initially deferred
);
create index if not exists idx_shots_project on public.shots(project_id);
drop trigger if exists trg_shots_updated_at on public.shots;
create trigger trg_shots_updated_at before update on public.shots
  for each row execute function public.set_updated_at();

create table if not exists public.shot_plan_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  plan_id uuid not null references public.shot_plans(id) on delete cascade,
  version_number int not null,
  scene_dna_version_id uuid not null references public.scene_dna_versions(id),
  shots jsonb not null,
  coverage jsonb not null,
  engine_version text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (plan_id, version_number)
);
alter table public.shot_plans drop constraint if exists shot_plans_approved_version_fk;
alter table public.shot_plans add constraint shot_plans_approved_version_fk
  foreign key (approved_version_id) references public.shot_plan_versions(id) on delete set null;

alter table public.shot_plans enable row level security;
alter table public.shots enable row level security;
alter table public.shot_plan_versions enable row level security;
drop policy if exists shot_plans_select on public.shot_plans;
create policy shot_plans_select on public.shot_plans for select using (public.is_org_member(org_id));
drop policy if exists shots_select on public.shots;
create policy shots_select on public.shots for select using (public.is_org_member(org_id));
drop policy if exists shot_plan_versions_select on public.shot_plan_versions;
create policy shot_plan_versions_select on public.shot_plan_versions for select using (public.is_org_member(org_id));

-- Internal guard: member + scene belongs to project. Returns org_id.
create or replace function public.shots_assert(p_project_id uuid, p_scene_id uuid) returns uuid
language plpgsql security definer stable set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-SHOT-403: not allowed to change this project''s shots' using errcode = '42501';
  end if;
  if not exists (select 1 from public.scenes where id = p_scene_id and project_id = p_project_id) then
    raise exception 'AURA-SHOT-404: scene not found in this project' using errcode = 'P0404';
  end if;
  return v_org;
end;
$$;

-- Internal: shot row from JSON (shared by generate and add).
create or replace function public.shots_insert_from_json(p_org uuid, p_project uuid, p_scene uuid, p_plan uuid, p_ordinal int, s jsonb)
returns public.shots
language plpgsql security definer set search_path = public as $$
declare v public.shots;
begin
  insert into public.shots(org_id, project_id, scene_id, plan_id, ordinal, purpose, size, angle, movement, support, focus,
    lens_mm, duration_seconds, description, composition, lighting, transition_in, notes, character_ids, dialogue_line_ids,
    story_start, story_end, created_by)
  values (p_org, p_project, p_scene, p_plan, p_ordinal, s->>'purpose', s->>'size', coalesce(s->>'angle','eye'),
    coalesce(s->>'movement','static'), coalesce(s->>'support','tripod'), coalesce(s->>'focus','deep'),
    (s->>'lens_mm')::int, (s->>'duration_seconds')::numeric, s->>'description', nullif(s->>'composition',''),
    nullif(s->>'lighting',''), coalesce(s->>'transition_in','cut'), nullif(s->>'notes',''),
    coalesce(array(select jsonb_array_elements_text(s->'character_ids'))::uuid[], '{}'),
    coalesce(array(select jsonb_array_elements_text(s->'dialogue_line_ids'))::uuid[], '{}'),
    (s->>'story_start')::numeric, (s->>'story_end')::numeric, auth.uid())
  returning * into v;
  return v;
end;
$$;

-- Generate/regenerate the draft plan from a LOCKED, current Scene DNA version.
create or replace function public.generate_shot_plan(p_project_id uuid, p_scene_id uuid, p_scene_dna_version_id uuid,
  p_shots jsonb, p_engine_version text, p_replace boolean default false)
returns public.shot_plans
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_dna public.scene_dna; v_plan public.shot_plans; v_i int := 0; s jsonb; v_existing int;
begin
  v_org := public.shots_assert(p_project_id, p_scene_id);
  select * into v_dna from public.scene_dna where scene_id = p_scene_id;
  if v_dna.id is null or v_dna.status <> 'approved' or v_dna.review_state <> 'current'
     or v_dna.approved_version_id is distinct from p_scene_dna_version_id then
    raise exception 'AURA-SHOT-412: lock this scene''s Scene DNA first — shots are planned from a locked version' using errcode = 'P0412';
  end if;
  select * into v_plan from public.shot_plans where scene_id = p_scene_id for update;
  if v_plan.id is not null then
    select count(*) into v_existing from public.shots where plan_id = v_plan.id;
    if v_existing > 0 and not p_replace then
      raise exception 'AURA-SHOT-409: this scene already has % shots — confirm to replace them', v_existing using errcode = 'P0409';
    end if;
    delete from public.shots where plan_id = v_plan.id;
    update public.shot_plans set scene_dna_version_id = p_scene_dna_version_id, status = 'draft', review_state = 'current',
      review_reason = null, engine_version = p_engine_version where id = v_plan.id returning * into v_plan;
  else
    insert into public.shot_plans(org_id, project_id, scene_id, scene_dna_version_id, engine_version)
    values (v_org, p_project_id, p_scene_id, p_scene_dna_version_id, p_engine_version) returning * into v_plan;
  end if;
  for s in select * from jsonb_array_elements(p_shots) loop
    v_i := v_i + 1;
    perform public.shots_insert_from_json(v_org, p_project_id, p_scene_id, v_plan.id, v_i, s);
  end loop;
  insert into public.jobs(org_id, project_id, engine_id, engine_version, status, input_snapshot, output_refs, attempt, started_at, completed_at)
  values (v_org, p_project_id, 'cinematography.shotPlanningEngine', p_engine_version, 'completed',
          jsonb_build_object('scene_id', p_scene_id, 'scene_dna_version_id', p_scene_dna_version_id),
          jsonb_build_object('shot_plan_id', v_plan.id, 'shots', v_i), 1, now(), now());
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'ShotPlanGenerated', 'ShotPlan', v_plan.id,
          jsonb_build_object('shots', v_i, 'replaced', coalesce(v_existing, 0), 'scene_dna_version_id', p_scene_dna_version_id));
  return v_plan;
end;
$$;

-- Internal: any edit reopens the plan as draft (approved version stays in history).
create or replace function public.shots_touch_plan(p_plan_id uuid, p_action text, p_object uuid, p_meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_plan public.shot_plans;
begin
  update public.shot_plans set status = 'draft' where id = p_plan_id returning * into v_plan;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_plan.org_id, auth.uid(), p_action, 'Shot', p_object, p_meta || jsonb_build_object('plan_id', p_plan_id));
end;
$$;

create or replace function public.add_shot(p_project_id uuid, p_scene_id uuid, p_shot jsonb, p_after_ordinal int default null)
returns public.shots
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_plan public.shot_plans; v_pos int; v public.shots;
begin
  v_org := public.shots_assert(p_project_id, p_scene_id);
  select * into v_plan from public.shot_plans where scene_id = p_scene_id for update;
  if v_plan.id is null then
    raise exception 'AURA-SHOT-412: generate a shot plan for this scene first' using errcode = 'P0412';
  end if;
  select coalesce(max(ordinal), 0) + 1 into v_pos from public.shots where plan_id = v_plan.id;
  if p_after_ordinal is not null and p_after_ordinal + 1 < v_pos then
    v_pos := greatest(1, p_after_ordinal + 1);
    update public.shots set ordinal = ordinal + 1 where plan_id = v_plan.id and ordinal >= v_pos;
  end if;
  v := public.shots_insert_from_json(v_org, p_project_id, p_scene_id, v_plan.id, v_pos, p_shot);
  perform public.shots_touch_plan(v_plan.id, 'ShotAdded', v.id, jsonb_build_object('ordinal', v_pos));
  return v;
end;
$$;

create or replace function public.update_shot(p_id uuid, p_patch jsonb)
returns public.shots
language plpgsql security definer set search_path = public as $$
declare v public.shots;
begin
  select * into v from public.shots where id = p_id for update;
  if v.id is null then raise exception 'AURA-SHOT-404: shot not found' using errcode = 'P0404'; end if;
  perform public.shots_assert(v.project_id, v.scene_id);
  update public.shots set
    purpose = coalesce(p_patch->>'purpose', purpose),
    size = coalesce(p_patch->>'size', size),
    angle = coalesce(p_patch->>'angle', angle),
    movement = coalesce(p_patch->>'movement', movement),
    support = coalesce(p_patch->>'support', support),
    focus = coalesce(p_patch->>'focus', focus),
    lens_mm = case when p_patch ? 'lens_mm' then (p_patch->>'lens_mm')::int else lens_mm end,
    duration_seconds = coalesce((p_patch->>'duration_seconds')::numeric, duration_seconds),
    description = coalesce(p_patch->>'description', description),
    composition = case when p_patch ? 'composition' then nullif(p_patch->>'composition','') else composition end,
    lighting = case when p_patch ? 'lighting' then nullif(p_patch->>'lighting','') else lighting end,
    transition_in = coalesce(p_patch->>'transition_in', transition_in),
    notes = case when p_patch ? 'notes' then nullif(p_patch->>'notes','') else notes end,
    character_ids = case when p_patch ? 'character_ids' then coalesce(array(select jsonb_array_elements_text(p_patch->'character_ids'))::uuid[], '{}') else character_ids end,
    dialogue_line_ids = case when p_patch ? 'dialogue_line_ids' then coalesce(array(select jsonb_array_elements_text(p_patch->'dialogue_line_ids'))::uuid[], '{}') else dialogue_line_ids end,
    story_start = coalesce((p_patch->>'story_start')::numeric, story_start),
    story_end = coalesce((p_patch->>'story_end')::numeric, story_end)
  where id = p_id returning * into v;
  perform public.shots_touch_plan(v.plan_id, 'ShotUpdated', v.id, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return v;
end;
$$;

-- Removes a draft shot from the working list. Approved plans keep their snapshot in shot_plan_versions.
create or replace function public.delete_shot(p_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare v public.shots;
begin
  select * into v from public.shots where id = p_id for update;
  if v.id is null then raise exception 'AURA-SHOT-404: shot not found' using errcode = 'P0404'; end if;
  perform public.shots_assert(v.project_id, v.scene_id);
  delete from public.shots where id = p_id;
  update public.shots set ordinal = ordinal - 1 where plan_id = v.plan_id and ordinal > v.ordinal;
  perform public.shots_touch_plan(v.plan_id, 'ShotDeleted', v.id, jsonb_build_object('ordinal', v.ordinal, 'description', v.description));
  return v.ordinal;
end;
$$;

create or replace function public.move_shot(p_id uuid, p_direction int)
returns public.shots
language plpgsql security definer set search_path = public as $$
declare v public.shots; v_target int; v_max int;
begin
  select * into v from public.shots where id = p_id for update;
  if v.id is null then raise exception 'AURA-SHOT-404: shot not found' using errcode = 'P0404'; end if;
  perform public.shots_assert(v.project_id, v.scene_id);
  select max(ordinal) into v_max from public.shots where plan_id = v.plan_id;
  v_target := v.ordinal + sign(p_direction)::int;
  if v_target < 1 or v_target > v_max then return v; end if;
  update public.shots set ordinal = v.ordinal where plan_id = v.plan_id and ordinal = v_target;
  update public.shots set ordinal = v_target where id = p_id returning * into v;
  perform public.shots_touch_plan(v.plan_id, 'ShotMoved', v.id, jsonb_build_object('to', v_target));
  return v;
end;
$$;

-- Approve & lock the plan (API checks coverage readiness first; the DB re-checks
-- that the Scene DNA version it came from is still the locked, current one).
create or replace function public.approve_shot_plan(p_project_id uuid, p_scene_id uuid, p_coverage jsonb)
returns public.shot_plan_versions
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_plan public.shot_plans; v_dna public.scene_dna; v_n int; v_v public.shot_plan_versions; v_shots jsonb;
begin
  v_org := public.shots_assert(p_project_id, p_scene_id);
  select * into v_plan from public.shot_plans where scene_id = p_scene_id for update;
  if v_plan.id is null then raise exception 'AURA-SHOT-412: generate a shot plan for this scene first' using errcode = 'P0412'; end if;
  select * into v_dna from public.scene_dna where scene_id = p_scene_id;
  if v_dna.status <> 'approved' or v_dna.review_state <> 'current' or v_dna.approved_version_id is distinct from v_plan.scene_dna_version_id then
    raise exception 'AURA-SHOT-412: Scene DNA changed since these shots were planned — review them first' using errcode = 'P0412';
  end if;
  select coalesce(jsonb_agg(to_jsonb(s) - 'org_id' - 'created_by' order by s.ordinal), '[]'::jsonb) into v_shots
    from public.shots s where s.plan_id = v_plan.id;
  if jsonb_array_length(v_shots) = 0 then raise exception 'AURA-SHOT-412: add at least one shot' using errcode = 'P0412'; end if;
  select coalesce(max(version_number), 0) + 1 into v_n from public.shot_plan_versions where plan_id = v_plan.id;
  insert into public.shot_plan_versions(org_id, project_id, plan_id, version_number, scene_dna_version_id, shots, coverage, engine_version, created_by)
  values (v_org, p_project_id, v_plan.id, v_n, v_plan.scene_dna_version_id, v_shots, p_coverage, v_plan.engine_version, auth.uid())
  returning * into v_v;
  update public.shot_plans set status = 'approved', review_state = 'current', review_reason = null, approved_version_id = v_v.id where id = v_plan.id;
  insert into public.jobs(org_id, project_id, engine_id, engine_version, status, input_snapshot, output_refs, attempt, started_at, completed_at)
  values (v_org, p_project_id, 'cinematography.coverageMathEngine', coalesce(p_coverage->>'engine_version', 'unknown'), 'completed',
          jsonb_build_object('plan_id', v_plan.id, 'shots', jsonb_array_length(v_shots)),
          jsonb_build_object('shot_plan_version_id', v_v.id, 'coverage', p_coverage->'coverage'), 1, now(), now());
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'ShotPlanApproved', 'ShotPlan', v_plan.id,
          jsonb_build_object('version_id', v_v.id, 'version_number', v_n, 'scene_dna_version_id', v_plan.scene_dna_version_id));
  return v_v;
end;
$$;

-- Persist upstream-change state (MOS invalidation step). Idempotent.
create or replace function public.set_shot_plan_review(p_plan_id uuid, p_state text, p_reason text)
returns public.shot_plans
language plpgsql security definer set search_path = public as $$
declare v public.shot_plans;
begin
  select * into v from public.shot_plans where id = p_plan_id for update;
  if v.id is null then raise exception 'AURA-SHOT-404: shot plan not found' using errcode = 'P0404'; end if;
  perform public.shots_assert(v.project_id, v.scene_id);
  if p_state not in ('current','review_required','stale') then
    raise exception 'AURA-SHOT-400: invalid review state' using errcode = 'P0400';
  end if;
  if v.review_state = p_state and v.review_reason is not distinct from p_reason then return v; end if;
  update public.shot_plans set review_state = p_state, review_reason = p_reason where id = v.id returning * into v;
  if p_state <> 'current' then
    insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
    values (v.org_id, auth.uid(), 'UpstreamVersionChanged', 'ShotPlan', v.id, jsonb_build_object('state', p_state, 'reason', p_reason));
  end if;
  return v;
end;
$$;

revoke execute on function public.shots_assert(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.shots_insert_from_json(uuid, uuid, uuid, uuid, int, jsonb) from public, anon, authenticated;
revoke execute on function public.shots_touch_plan(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.generate_shot_plan(uuid, uuid, uuid, jsonb, text, boolean) from public, anon;
revoke execute on function public.add_shot(uuid, uuid, jsonb, int) from public, anon;
revoke execute on function public.update_shot(uuid, jsonb) from public, anon;
revoke execute on function public.delete_shot(uuid) from public, anon;
revoke execute on function public.move_shot(uuid, int) from public, anon;
revoke execute on function public.approve_shot_plan(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.set_shot_plan_review(uuid, text, text) from public, anon;
grant execute on function public.generate_shot_plan(uuid, uuid, uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.add_shot(uuid, uuid, jsonb, int) to authenticated;
grant execute on function public.update_shot(uuid, jsonb) to authenticated;
grant execute on function public.delete_shot(uuid) to authenticated;
grant execute on function public.move_shot(uuid, int) to authenticated;
grant execute on function public.approve_shot_plan(uuid, uuid, jsonb) to authenticated;
grant execute on function public.set_shot_plan_review(uuid, text, text) to authenticated;
