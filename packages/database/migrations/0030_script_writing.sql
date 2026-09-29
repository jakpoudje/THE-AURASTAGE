-- AuraScript (INTELLIGENCE_PLAN Phase 2; owner, 2026-09-29: "still cannot generate the complete script yet").
-- Scriptwriter owns the writing jobs: story development → scene outline → full script (written scene by scene) and
-- single-scene rewrites. The API freezes the task (story bible, outline, request) into `input`; the generation worker
-- asks the reasoning backend from the Provider Gateway, checks the answer with scriptWritingEngine and records it with
-- the provider, model and whether it is labelled TEST OUTPUT (rule 12). Progress is real: scenes written / total.
-- Nothing here touches the script: the writer opens a result as a NEW draft version (through save_script_version, with
-- its own base-version check) and approves it themselves (rules 10–11).

create table if not exists public.script_generations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('develop_story','outline','write_script','rewrite_scene')),
  -- The record this one builds on (development → outline → script), for provenance.
  parent_id uuid references public.script_generations(id) on delete set null,
  request text not null default '' check (char_length(request) <= 2000),
  input jsonb not null check (jsonb_typeof(input) = 'object' and octet_length(input::text) <= 400000),
  -- 'user' when the writer edited an outline by hand (saved as its own record, never overwriting the model's).
  source text not null default 'model' check (source in ('model','user')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  progress jsonb not null default '{}'::jsonb,
  output jsonb,
  checks jsonb not null default '[]'::jsonb,
  provider text, model text, test_output boolean,
  usage jsonb not null default '{}'::jsonb,
  engine_version text not null,
  error text,
  -- The script version the job read (rewrites, scripts) and the draft version created from the result.
  base_version_id uuid,
  result_version_id uuid,
  accepted jsonb,
  job_id uuid references public.jobs(id) on delete set null,
  attempt int not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists idx_script_generations_project on public.script_generations(project_id, created_at desc);
create index if not exists idx_script_generations_queue on public.script_generations(status, created_at) where status in ('queued','running');
alter table public.script_generations enable row level security;
drop policy if exists script_generations_select on public.script_generations;
create policy script_generations_select on public.script_generations for select using (project_id = any ((select public.my_project_ids())::uuid[]));

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
  if p_source = 'user' and (p_kind <> 'outline' or p_output is null) then
    raise exception 'AURA-SCR-400: only an outline can be saved by hand' using errcode = 'P0400';
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
  values (v_org, auth.uid(), case when p_source = 'user' then 'ScriptOutlineEdited' else 'ScriptWritingRequested' end, 'ScriptGeneration', v.id, jsonb_build_object('kind', p_kind));
  return v;
end;
$$;

-- The writer accepted parts of a result (e.g. story fields applied) or opened it as a draft version.
create or replace function public.mark_script_generation(p_id uuid, p_accepted jsonb, p_result_version uuid)
returns public.script_generations
language plpgsql security definer set search_path = public as $$
declare v public.script_generations;
begin
  select * into v from public.script_generations where id = p_id;
  if v.id is null then raise exception 'AURA-SCR-404: writing result not found' using errcode = 'P0404'; end if;
  perform public.gate_write(v.project_id, 'script', 'edit');
  if p_result_version is not null and not exists (select 1 from public.script_versions sv join public.scripts s on s.id = sv.script_id where sv.id = p_result_version and s.project_id = v.project_id) then
    raise exception 'AURA-SCR-400: that script version isn''t in this project' using errcode = 'P0400';
  end if;
  update public.script_generations set accepted = coalesce(p_accepted, accepted), result_version_id = coalesce(p_result_version, result_version_id) where id = p_id returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v.org_id, auth.uid(), 'ScriptWritingUsed', 'ScriptGeneration', v.id, jsonb_build_object('kind', v.kind, 'result_version_id', p_result_version));
  return v;
end;
$$;

create or replace function public.worker_claim_script_generation(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.script_generations;
begin
  perform public.worker_check(p_token);
  select * into v from public.script_generations
    where source = 'model' and (status = 'queued' or (status = 'running' and started_at < now() - interval '30 minutes' and attempt < 3))
    order by created_at limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.script_generations set status = 'running', attempt = attempt + 1, started_at = now() where id = v.id returning * into v;
  update public.jobs set status = 'running', attempt = v.attempt, started_at = now() where id = v.job_id;
  return to_jsonb(v);
end;
$$;

-- Partial results as scenes are written (so a long script shows real progress and survives a restart).
create or replace function public.worker_progress_script_generation(p_token text, p_id uuid, p_progress jsonb, p_output jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.worker_check(p_token);
  update public.script_generations set progress = coalesce(p_progress, progress), output = coalesce(p_output, output) where id = p_id and status = 'running';
end;
$$;

create or replace function public.worker_complete_script_generation(p_token text, p_id uuid, p_output jsonb, p_checks jsonb, p_provider text, p_model text,
  p_test_output boolean, p_usage jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.script_generations;
begin
  perform public.worker_check(p_token);
  update public.script_generations set status = 'succeeded', output = p_output, checks = coalesce(p_checks, '[]'), provider = p_provider, model = p_model,
    test_output = p_test_output, usage = coalesce(p_usage, '{}'), completed_at = now(), error = null
  where id = p_id and status = 'running' returning * into v;
  if v.id is null then return; end if;
  update public.jobs set status = 'completed', completed_at = now(), output_refs = jsonb_build_object('script_generation_id', v.id) where id = v.job_id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v.org_id, v.created_by, 'ScriptWritingCompleted', 'ScriptGeneration', v.id, jsonb_build_object('kind', v.kind, 'provider', p_provider, 'test_output', p_test_output));
end;
$$;

create or replace function public.worker_fail_script_generation(p_token text, p_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.script_generations;
begin
  perform public.worker_check(p_token);
  update public.script_generations set status = 'failed', error = left(coalesce(p_error, 'Writing failed'), 1000), completed_at = now()
    where id = p_id and status = 'running' returning * into v;
  if v.id is null then return; end if;
  update public.jobs set status = 'failed', completed_at = now(), error = jsonb_build_object('message', left(p_error, 500)) where id = v.job_id;
end;
$$;

revoke execute on function public.request_script_generation(uuid, text, uuid, text, jsonb, uuid, text, text, jsonb), public.mark_script_generation(uuid, jsonb, uuid) from public, anon;
grant execute on function public.request_script_generation(uuid, text, uuid, text, jsonb, uuid, text, text, jsonb), public.mark_script_generation(uuid, jsonb, uuid) to authenticated;
revoke execute on function public.worker_claim_script_generation(text), public.worker_progress_script_generation(text, uuid, jsonb, jsonb),
  public.worker_complete_script_generation(text, uuid, jsonb, jsonb, text, text, boolean, jsonb), public.worker_fail_script_generation(text, uuid, text) from public, authenticated;
grant execute on function public.worker_claim_script_generation(text), public.worker_progress_script_generation(text, uuid, jsonb, jsonb),
  public.worker_complete_script_generation(text, uuid, jsonb, jsonb, text, text, boolean, jsonb), public.worker_fail_script_generation(text, uuid, text) to anon;
