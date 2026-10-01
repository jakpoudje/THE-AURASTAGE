-- Storyboard variations (owner request 2026-10-01): a frame can be made as 1, 2, 4, 6, 8 or 13 variations to choose from
-- (was 1–4). Same function as before (0013/0019) with only the variation check changed; the project's monthly paid-take
-- limit in public.request_takes still counts every variation.
create or replace function app_private.request_takes(p_package_id uuid, p_provider text, p_model text, p_capability text, p_params jsonb, p_seed bigint,
  p_variations integer, p_source_take_id uuid, p_idempotency_key text)
returns setof public.takes
language plpgsql security definer set search_path = public as $function$
declare v_pkg public.generation_packages; v_org uuid; v_plan public.shot_plans; v_n int; v_job uuid; v public.takes; i int;
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
  perform 1 from public.generation_packages where shot_id = v_pkg.shot_id for update;
  select coalesce(max(take_number), 0) into v_n from public.takes where shot_id = v_pkg.shot_id;
  for i in 1..p_variations loop
    insert into public.jobs(org_id, project_id, engine_id, engine_version, idempotency_key, status, input_snapshot)
    values (v_org, v_pkg.project_id, 'generation.take', v_pkg.engine_version,
            case when p_idempotency_key is null then null else p_idempotency_key || ':' || i end, 'queued',
            jsonb_build_object('package_id', v_pkg.id, 'provider', p_provider, 'model', p_model, 'capability', p_capability))
    returning id into v_job;
    insert into public.takes(org_id, project_id, scene_id, shot_id, package_id, take_number, provider, model, capability, params, seed,
      source_take_id, job_id, created_by)
    values (v_org, v_pkg.project_id, v_pkg.scene_id, v_pkg.shot_id, v_pkg.id, v_n + i, p_provider, p_model, p_capability,
      coalesce(p_params, '{}'::jsonb), case when p_seed is null then null else p_seed + i - 1 end, p_source_take_id, v_job, auth.uid())
    returning * into v;
    return next v;
  end loop;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'TakesRequested', 'GenerationPackage', v_pkg.id,
          jsonb_build_object('provider', p_provider, 'model', p_model, 'variations', p_variations));
  return;
end;
$function$;
