-- Phase 10: Export & Deliver (SRS §12). Canonical owner: Rendering / Delivery.
-- A render is made only from the CURRENT Picture Lock. Its manifest is immutable
-- (checksummed) and names every source version. The heavy work runs in the
-- render worker through the MOS jobs table (rule 8); the worker authenticates with
-- its own token (worker_credentials) and never holds a service key.

create table if not exists public.renders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  picture_lock_id uuid not null references public.picture_locks(id),
  lock_number int not null,
  profile_id text not null check (char_length(profile_id) between 1 and 60),
  profile_version text not null,
  options jsonb not null default '{}'::jsonb,
  manifest jsonb not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  engine_version text not null,
  job_id uuid references public.jobs(id),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  progress numeric not null default 0 check (progress between 0 and 100),
  stage text,
  cancel_requested boolean not null default false,
  error text,
  attempt int not null default 0,
  outputs jsonb not null default '[]'::jsonb,
  qc jsonb,
  qc_passed boolean,
  review_state text not null default 'current' check (review_state in ('current','stale')),
  review_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists idx_renders_project on public.renders(project_id, created_at desc);
create index if not exists idx_renders_queue on public.renders(status, created_at) where status in ('queued','running');

alter table public.renders enable row level security;
drop policy if exists renders_select on public.renders;
create policy renders_select on public.renders for select using (public.is_org_member(org_id));

create or replace function public.render_assert(p_project_id uuid) returns uuid
language plpgsql security definer stable set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-EXP-403: not allowed to deliver this project' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

-- Queue one deliverable from the current Picture Lock (API compiles the manifest; DB re-checks the lock).
create or replace function public.create_render(p_project_id uuid, p_picture_lock_id uuid, p_profile_id text, p_profile_version text,
  p_options jsonb, p_manifest jsonb, p_manifest_sha256 text, p_engine_version text)
returns public.renders
language plpgsql security definer set search_path = public as $$
declare v_org uuid; t public.timelines; l public.picture_locks; v_job uuid; r public.renders;
begin
  v_org := public.render_assert(p_project_id);
  select * into t from public.timelines where project_id = p_project_id;
  if t.id is null or t.status <> 'locked' or t.current_lock_id is distinct from p_picture_lock_id then
    raise exception 'AURA-EXP-412: renders are made from the current Picture Lock — lock the picture in Editorial first' using errcode = 'P0412';
  end if;
  select * into l from public.picture_locks where id = p_picture_lock_id;
  if (p_manifest->'picture_lock'->>'id') is distinct from p_picture_lock_id::text then
    raise exception 'AURA-EXP-400: the manifest was not compiled from this Picture Lock' using errcode = 'P0400';
  end if;
  insert into public.jobs(org_id, project_id, engine_id, engine_version, status, input_snapshot)
  values (v_org, p_project_id, 'rendering.render', p_engine_version, 'queued',
    jsonb_build_object('profile_id', p_profile_id, 'profile_version', p_profile_version, 'picture_lock_id', p_picture_lock_id, 'manifest_sha256', p_manifest_sha256))
  returning id into v_job;
  insert into public.renders(org_id, project_id, timeline_id, picture_lock_id, lock_number, profile_id, profile_version, options, manifest, manifest_sha256, engine_version, job_id, created_by)
  values (v_org, p_project_id, t.id, l.id, l.lock_number, p_profile_id, p_profile_version, coalesce(p_options, '{}'::jsonb), p_manifest, p_manifest_sha256, p_engine_version, v_job, auth.uid())
  returning * into r;
  update public.jobs set input_snapshot = input_snapshot || jsonb_build_object('render_id', r.id) where id = v_job;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'RenderRequested', 'Render', r.id, jsonb_build_object('profile_id', p_profile_id, 'lock_number', l.lock_number, 'manifest_sha256', p_manifest_sha256));
  return r;
end;
$$;

create or replace function public.cancel_render(p_render_id uuid)
returns public.renders
language plpgsql security definer set search_path = public as $$
declare r public.renders;
begin
  select * into r from public.renders where id = p_render_id for update;
  if r.id is null then raise exception 'AURA-EXP-404: render not found' using errcode = 'P0404'; end if;
  perform public.render_assert(r.project_id);
  if r.status = 'queued' then
    update public.renders set status = 'cancelled', completed_at = now(), stage = 'Cancelled' where id = r.id returning * into r;
    update public.jobs set status = 'cancelled', completed_at = now() where id = r.job_id;
  elsif r.status = 'running' then
    update public.renders set cancel_requested = true, stage = 'Cancelling…' where id = r.id returning * into r;
  else
    raise exception 'AURA-EXP-409: only a waiting or running render can be cancelled' using errcode = 'P0409';
  end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (r.org_id, auth.uid(), 'RenderCancelRequested', 'Render', r.id, jsonb_build_object('status', r.status));
  return r;
end;
$$;

-- Upstream drift marker: the Picture Lock a deliverable was made from is no longer current. Files are kept (rule 11).
create or replace function public.set_render_review(p_render_id uuid, p_state text, p_reason text)
returns public.renders
language plpgsql security definer set search_path = public as $$
declare r public.renders;
begin
  select * into r from public.renders where id = p_render_id for update;
  if r.id is null then raise exception 'AURA-EXP-404: render not found' using errcode = 'P0404'; end if;
  perform public.render_assert(r.project_id);
  if p_state not in ('current','stale') then raise exception 'AURA-EXP-400: invalid review state' using errcode = 'P0400'; end if;
  if r.review_state = p_state and r.review_reason is not distinct from p_reason then return r; end if;
  update public.renders set review_state = p_state, review_reason = p_reason where id = r.id returning * into r;
  if p_state <> 'current' then
    insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
    values (r.org_id, auth.uid(), 'UpstreamVersionChanged', 'Render', r.id, jsonb_build_object('reason', p_reason));
  end if;
  return r;
end;
$$;

-- ---- Render worker (token-authenticated; anon key only) ----
-- Claims the oldest waiting render, or one stuck running > 30 min (max 3 attempts).
create or replace function public.worker_claim_render(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.renders;
begin
  perform public.worker_check(p_token);
  select * into r from public.renders
    where (status = 'queued' or (status = 'running' and started_at < now() - interval '30 minutes' and attempt < 3)) and not cancel_requested
    order by created_at limit 1 for update skip locked;
  if r.id is null then return null; end if;
  update public.renders set status = 'running', attempt = attempt + 1, started_at = now(), progress = 0, stage = 'Starting' where id = r.id returning * into r;
  update public.jobs set status = 'running', attempt = r.attempt, started_at = now() where id = r.job_id;
  return jsonb_build_object('render', jsonb_build_object('id', r.id, 'org_id', r.org_id, 'project_id', r.project_id, 'profile_id', r.profile_id, 'attempt', r.attempt), 'manifest', r.manifest);
end;
$$;

-- Progress heartbeat; returns true when the person asked to cancel.
create or replace function public.worker_render_progress(p_token text, p_render_id uuid, p_progress numeric, p_stage text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.renders;
begin
  perform public.worker_check(p_token);
  update public.renders set progress = greatest(0, least(100, p_progress)), stage = left(p_stage, 120), started_at = now()
    where id = p_render_id and status = 'running' returning * into r;
  return coalesce(r.cancel_requested, true);
end;
$$;

create or replace function public.worker_complete_render(p_token text, p_render_id uuid, p_outputs jsonb, p_qc jsonb, p_qc_passed boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.renders;
begin
  perform public.worker_check(p_token);
  update public.renders set status = 'succeeded', progress = 100, stage = case when p_qc_passed then 'QC passed' else 'QC failed' end,
    outputs = p_outputs, qc = p_qc, qc_passed = p_qc_passed, error = null, completed_at = now()
    where id = p_render_id and status = 'running' returning * into r;
  if r.id is null then return; end if; -- idempotent
  update public.jobs set status = 'completed', completed_at = now(), output_refs = jsonb_build_object('render_id', r.id, 'files', jsonb_array_length(p_outputs)) where id = r.job_id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (r.org_id, null, 'RenderCompleted', 'Render', r.id, jsonb_build_object('qc_passed', p_qc_passed, 'files', jsonb_array_length(p_outputs)));
end;
$$;

create or replace function public.worker_fail_render(p_token text, p_render_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.renders;
begin
  perform public.worker_check(p_token);
  update public.renders set status = case when cancel_requested then 'cancelled' else 'failed' end,
    stage = case when cancel_requested then 'Cancelled' else 'Failed' end, error = left(p_error, 2000), completed_at = now()
    where id = p_render_id and status = 'running' returning * into r;
  if r.id is null then return; end if;
  update public.jobs set status = case when r.status = 'cancelled' then 'cancelled' else 'failed' end, completed_at = now(),
    error = jsonb_build_object('message', left(p_error, 2000)) where id = r.job_id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (r.org_id, null, case when r.status = 'cancelled' then 'RenderCancelled' else 'RenderFailed' end, 'Render', r.id, jsonb_build_object('error', left(p_error, 500)));
end;
$$;

revoke execute on function public.render_assert(uuid) from public, anon, authenticated;
revoke execute on function public.create_render(uuid, uuid, text, text, jsonb, jsonb, text, text) from public, anon;
revoke execute on function public.cancel_render(uuid) from public, anon;
revoke execute on function public.set_render_review(uuid, text, text) from public, anon;
grant execute on function public.create_render(uuid, uuid, text, text, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.cancel_render(uuid) to authenticated;
grant execute on function public.set_render_review(uuid, text, text) to authenticated;
revoke execute on function public.worker_claim_render(text) from public, authenticated;
revoke execute on function public.worker_render_progress(text, uuid, numeric, text) from public, authenticated;
revoke execute on function public.worker_complete_render(text, uuid, jsonb, jsonb, boolean) from public, authenticated;
revoke execute on function public.worker_fail_render(text, uuid, text) from public, authenticated;
-- The worker calls with the anon key + its token; the token check is inside each function.
grant execute on function public.worker_claim_render(text) to anon;
grant execute on function public.worker_render_progress(text, uuid, numeric, text) to anon;
grant execute on function public.worker_complete_render(text, uuid, jsonb, jsonb, boolean) to anon;
grant execute on function public.worker_fail_render(text, uuid, text) to anon;
