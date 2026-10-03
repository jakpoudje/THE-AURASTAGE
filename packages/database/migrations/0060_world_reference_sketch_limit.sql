-- 0060 — Locations & Props "Make reference pictures for every place and prop" stopped with "that's a lot of images in a
-- minute" (owner report 2026-10-03): the per-minute limit counted free built-in sketches like paid images (40), the way
-- Casting did before 0039. Same function as 0028, with separate limits: built-in sketches 400 a minute, paid providers
-- still 40 (a safety net against accidental spend). Keyed on the provider the worker actually calls.
create or replace function public.request_world_reference(p_type text, p_id uuid, p_view text, p_aspect text, p_prompt text, p_negative text[],
  p_identity_hash text, p_provider text, p_model text, p_execution text, p_seed integer, p_sketch jsonb, p_engine_version text)
returns public.world_reference_images
language plpgsql security definer set search_path = public as $$
declare v public.world_reference_images; v_project uuid; v_org uuid; v_job uuid;
begin
  if p_type = 'location' then select project_id, org_id into v_project, v_org from public.locations where id = p_id;
  elsif p_type = 'prop' then select project_id, org_id into v_project, v_org from public.props where id = p_id;
  else raise exception 'AURA-WLD-400: unknown kind' using errcode = 'P0400'; end if;
  if v_project is null then raise exception 'AURA-WLD-404: % not found', p_type using errcode = 'P0404'; end if;
  perform public.gate_write(v_project, 'scene_dna', 'edit');
  if p_provider = 'aurastage-sketch' then
    if (select count(*) from public.world_reference_images where created_by = auth.uid() and provider = 'aurastage-sketch' and created_at > now() - interval '1 minute') >= 400 then
      raise exception 'AURA-WLD-429: that''s a lot of sketches in a minute — give it a moment' using errcode = 'P0429';
    end if;
  elsif (select count(*) from public.world_reference_images where created_by = auth.uid() and provider <> 'aurastage-sketch' and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'AURA-WLD-429: that''s a lot of paid images in a minute — give it a moment' using errcode = 'P0429';
  end if;
  insert into public.jobs(org_id, project_id, engine_id, engine_version, input_snapshot)
  values (v_org, v_project, 'world.reference', p_engine_version, jsonb_build_object('object_type', p_type, 'object_id', p_id, 'view', p_view, 'provider', p_provider))
  returning id into v_job;
  insert into public.world_reference_images(org_id, project_id, object_type, object_id, view_key, aspect_ratio, prompt, negative, identity_hash,
    provider, model, execution, seed, sketch, engine_version, job_id, created_by)
  values (v_org, v_project, p_type, p_id, p_view, p_aspect, p_prompt, coalesce(p_negative, '{}'), p_identity_hash,
    p_provider, p_model, p_execution, coalesce(p_seed, 1), coalesce(p_sketch, '{}'), p_engine_version, v_job, auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'WorldReferenceRequested', initcap(p_type), p_id, jsonb_build_object('view', p_view, 'provider', p_provider));
  return v;
end;
$$;
