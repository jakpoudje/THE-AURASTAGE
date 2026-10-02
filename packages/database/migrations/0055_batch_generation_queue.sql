-- Whole-film generation without "that's a lot of generations in a minute" (owner report 2026-10-02).
-- The per-minute cap (migration 0026) is for clicks; a whole-film run is different work and is now bounded by how much
-- of it is waiting in the queue instead: at most 48 sounds / 96 takes of one project's runs are queued or being made at
-- a time, and the run adds more as they finish (the API reports "waiting for the generator" and the page carries on).
-- Workers always take a person's own request before batch work, so a run never holds up someone clicking "Generate".
alter table public.audio_generations add column if not exists batch boolean not null default false;
alter table public.takes add column if not exists batch boolean not null default false;
create index if not exists idx_audio_generations_batch_open on public.audio_generations(project_id) where batch and status in ('queued','running');
create index if not exists idx_takes_batch_open on public.takes(project_id) where batch and status in ('queued','running');

create or replace function public.request_audio_generation(p_project uuid, p_scene uuid, p_clip uuid, p_kind text, p_description text,
  p_duration numeric, p_mood text[], p_provider text, p_model text, p_execution text, p_seed int, p_params jsonb, p_engine_version text)
returns public.audio_generations
language plpgsql security definer set search_path = public as $$
declare v public.audio_generations; v_org uuid; v_session uuid; v_job uuid; v_batch boolean := coalesce(p_params->>'batch', '') = 'true'; v_open int;
begin
  perform public.gate_write(p_project, 'audio', 'generate');
  select org_id into v_org from public.scenes where id = p_scene and project_id = p_project;
  if v_org is null then raise exception 'AURA-AUD-404: scene not found in this project' using errcode = 'P0404'; end if;
  select id into v_session from public.audio_sessions where scene_id = p_scene;
  if p_clip is not null and not exists (select 1 from public.audio_clips where id = p_clip and session_id = v_session) then
    raise exception 'AURA-AUD-404: that cue isn''t in this scene''s session' using errcode = 'P0404';
  end if;
  if v_batch then
    select count(*) into v_open from public.audio_generations where project_id = p_project and batch and status in ('queued','running');
    if v_open >= 48 then
      raise exception 'AURA-AUD-429: the generator is still making % sounds from this run — the rest are added as they finish', v_open using errcode = 'P0429';
    end if;
  elsif (select count(*) from public.audio_generations where created_by = auth.uid() and not batch and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'AURA-AUD-429: that''s a lot of generations in a minute — give it a moment' using errcode = 'P0429';
  end if;
  insert into public.jobs(org_id, project_id, engine_id, engine_version, input_snapshot)
  values (v_org, p_project, 'audio.generate', p_engine_version, jsonb_build_object('kind', p_kind, 'provider', p_provider, 'clip_id', p_clip, 'batch', v_batch))
  returning id into v_job;
  insert into public.audio_generations(org_id, project_id, scene_id, session_id, clip_id, kind, description, duration_seconds, mood, provider, model,
    execution, seed, params, engine_version, job_id, created_by, batch)
  values (v_org, p_project, p_scene, v_session, p_clip, p_kind, left(trim(p_description), 500), p_duration, coalesce(p_mood, '{}'), p_provider, p_model,
    p_execution, coalesce(p_seed, 1), coalesce(p_params, '{}'), p_engine_version, v_job, auth.uid(), v_batch)
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'AudioGenerationRequested', 'AudioGeneration', v.id, jsonb_build_object('kind', p_kind, 'provider', p_provider, 'execution', p_execution, 'batch', v_batch));
  return v;
end;
$$;

create or replace function public.worker_claim_audio_generation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.audio_generations;
begin
  perform public.worker_check(p_token);
  select * into v from public.audio_generations
    where status = 'queued' or (status = 'running' and started_at < now() - interval '15 minutes' and attempt < 3)
    order by batch, created_at limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.audio_generations set status = 'running', attempt = attempt + 1, started_at = now() where id = v.id returning * into v;
  update public.jobs set status = 'running', attempt = v.attempt, started_at = now() where id = v.job_id;
  return to_jsonb(v);
end;
$$;

create or replace function app_private.request_takes(p_package_id uuid, p_provider text, p_model text, p_capability text, p_params jsonb,
  p_seed bigint, p_variations integer, p_source_take_id uuid, p_idempotency_key text)
returns setof public.takes
language plpgsql security definer set search_path = public as $$
declare v_pkg public.generation_packages; v_org uuid; v_plan public.shot_plans; v_n int; v_job uuid; v public.takes; i int;
  v_batch boolean := coalesce(p_params->>'batch', '') = 'true'; v_open int;
begin
  select * into v_pkg from public.generation_packages where id = p_package_id;
  if v_pkg.id is null then raise exception 'AURA-GEN-404: package not found' using errcode = 'P0404'; end if;
  v_org := public.generation_assert(v_pkg.project_id);
  select * into v_plan from public.shot_plans where scene_id = v_pkg.scene_id;
  if v_pkg.review_state <> 'current' or v_plan.approved_version_id is distinct from v_pkg.shot_plan_version_id
     or v_plan.review_state <> 'current' or v_plan.status <> 'approved' then
    raise exception 'AURA-GEN-412: the shot plan changed since this was compiled — approve it and compile again' using errcode = 'P0412';
  end if;
  if p_variations is null or p_variations not in (1, 2, 4, 6, 8, 13) then
    raise exception 'AURA-GEN-400: choose 1, 2, 4, 6, 8 or 13 variations' using errcode = 'P0400';
  end if;
  if p_source_take_id is not null and not exists (select 1 from public.takes where id = p_source_take_id and shot_id = v_pkg.shot_id and status = 'succeeded') then
    raise exception 'AURA-GEN-400: the starting frame must be a finished take of this shot' using errcode = 'P0400';
  end if;
  if p_idempotency_key is not null and exists (select 1 from public.jobs where engine_id = 'generation.take' and idempotency_key = p_idempotency_key || ':1') then
    return query select t.* from public.takes t join public.jobs j on j.id = t.job_id
      where j.engine_id = 'generation.take' and j.idempotency_key like p_idempotency_key || ':%' order by t.take_number;
    return;
  end if;
  if v_batch then
    select count(*) into v_open from public.takes where project_id = v_pkg.project_id and batch and status in ('queued','running');
    if v_open >= 96 then
      raise exception 'AURA-GEN-429: the generator is still making % takes from this run — the rest are added as they finish', v_open using errcode = 'P0429';
    end if;
  end if;
  perform 1 from public.generation_packages where shot_id = v_pkg.shot_id for update;
  select coalesce(max(take_number), 0) into v_n from public.takes where shot_id = v_pkg.shot_id;
  for i in 1..p_variations loop
    insert into public.jobs(org_id, project_id, engine_id, engine_version, idempotency_key, status, input_snapshot)
    values (v_org, v_pkg.project_id, 'generation.take', v_pkg.engine_version,
            case when p_idempotency_key is null then null else p_idempotency_key || ':' || i end, 'queued',
            jsonb_build_object('package_id', v_pkg.id, 'provider', p_provider, 'model', p_model, 'capability', p_capability, 'batch', v_batch))
    returning id into v_job;
    insert into public.takes(org_id, project_id, scene_id, shot_id, package_id, take_number, provider, model, capability, params, seed,
      source_take_id, job_id, created_by, batch)
    values (v_org, v_pkg.project_id, v_pkg.scene_id, v_pkg.shot_id, v_pkg.id, v_n + i, p_provider, p_model, p_capability,
      coalesce(p_params, '{}'::jsonb), case when p_seed is null then null else p_seed + i - 1 end, p_source_take_id, v_job, auth.uid(), v_batch)
    returning * into v;
    return next v;
  end loop;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'TakesRequested', 'GenerationPackage', v_pkg.id,
          jsonb_build_object('provider', p_provider, 'model', p_model, 'variations', p_variations, 'batch', v_batch));
  return;
end;
$$;
revoke all on function app_private.request_takes(uuid, text, text, text, jsonb, bigint, integer, uuid, text) from public, anon, authenticated;

create or replace function public.worker_claim_take(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.takes; v_pkg public.generation_packages; v_src public.takes; v_refs jsonb;
begin
  perform public.worker_check(p_token);
  select * into v from public.takes
    where status = 'queued' or (status = 'running' and started_at < now() - interval '15 minutes' and attempt < 3)
    order by batch, created_at limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.takes set status = 'running', attempt = attempt + 1, started_at = now() where id = v.id returning * into v;
  update public.jobs set status = 'running', attempt = v.attempt, started_at = now() where id = v.job_id;
  select * into v_pkg from public.generation_packages where id = v.package_id;
  if v.source_take_id is not null then select * into v_src from public.takes where id = v.source_take_id; end if;
  select coalesce(jsonb_agg(r.ref || jsonb_build_object('asset',
           case when a.id is null then null else jsonb_build_object(
             'storage_path', a.storage_path,
             'media_type', a.metadata->>'media_type',
             'size_bytes', case when (a.metadata->>'size_bytes') ~ '^[0-9]+$' then (a.metadata->>'size_bytes')::bigint end,
             'version', a.current_version) end) order by r.ord), '[]'::jsonb)
    into v_refs
    from jsonb_array_elements(coalesce(v_pkg.content->'references', '[]'::jsonb)) with ordinality as r(ref, ord)
    left join public.assets a
      on a.id = case when (r.ref->>'asset_id') ~ '^[0-9a-f-]{36}$' then (r.ref->>'asset_id')::uuid end
     and a.project_id = v.project_id and a.archived_at is null;
  return jsonb_build_object('take', to_jsonb(v), 'package', v_pkg.content,
    'source', case when v_src.id is null then null else jsonb_build_object('storage_key', v_src.storage_key, 'media_type', v_src.media_type) end,
    'references', v_refs);
end;
$$;
