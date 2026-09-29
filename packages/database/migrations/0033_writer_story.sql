-- The writer can complete Story Development themselves (owner, 2026-09-29: "users may choose to complete any of the
-- stages themselves and will be passed and updated downstream"). A story the writer writes or edits is saved as its own
-- record (source 'user', like an edited outline since 0030) and becomes the current story every later step uses.

-- Queue a writing job (or, with p_source = 'user', record a writer-edited outline as succeeded straight away).
create or replace function public.request_script_generation(p_project uuid, p_kind text, p_parent uuid, p_request text, p_input jsonb,
  p_base_version uuid, p_engine_version text, p_source text default 'model', p_output jsonb default null)
returns public.script_generations
language plpgsql security definer set search_path = public as $$
declare v public.script_generations; v_org uuid; v_job uuid;
begin
  perform public.gate_write(p_project, 'script', 'edit');
  select org_id into v_org from public.projects where id = p_project;
  if p_parent is not null and not exists (select 1 from public.script_generations where id = p_parent and project_id = p_project) then
    raise exception 'AURA-SCR-404: that earlier step isn''t in this project' using errcode = 'P0404';
  end if;
  if p_source = 'user' and (p_kind not in ('outline', 'develop_story') or p_output is null) then
    raise exception 'AURA-SCR-400: only a story or an outline can be saved by hand' using errcode = 'P0400';
  end if;
  if p_source = 'model' and (select count(*) from public.script_generations where created_by = auth.uid() and source = 'model' and created_at > now() - interval '1 minute') >= 6 then
    raise exception 'AURA-SCR-429: that''s a lot of writing requests in a minute — give it a moment' using errcode = 'P0429';
  end if;
  if p_source = 'model' then
    insert into public.jobs(org_id, project_id, engine_id, engine_version, input_snapshot)
    values (v_org, p_project, 'story.scriptWritingEngine.' || p_kind, p_engine_version, jsonb_build_object('kind', p_kind, 'parent_id', p_parent, 'base_version_id', p_base_version))
    returning id into v_job;
  end if;
  insert into public.script_generations(org_id, project_id, kind, parent_id, request, input, source, status, output, engine_version, base_version_id, job_id, created_by, completed_at, provider)
  values (v_org, p_project, p_kind, p_parent, left(coalesce(p_request, ''), 2000), p_input, coalesce(p_source, 'model'),
    case when p_source = 'user' then 'succeeded' else 'queued' end, case when p_source = 'user' then p_output end, p_engine_version, p_base_version, v_job, auth.uid(),
    case when p_source = 'user' then now() end, case when p_source = 'user' then 'writer' end)
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), case when p_source = 'user' then (case when p_kind = 'outline' then 'ScriptOutlineEdited' else 'ScriptStoryEdited' end) else 'ScriptWritingRequested' end, 'ScriptGeneration', v.id, jsonb_build_object('kind', p_kind));
  return v;
end;
$$;

