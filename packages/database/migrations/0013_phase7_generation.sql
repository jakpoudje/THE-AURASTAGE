-- Phase 7: Provider Gateway + Visual Generation (SRS §10, §17.2).
-- Canonical owner: Visual Generation (apps/api/src/modules/generation).
--
-- generation_packages  immutable compiled GenerationPackage per shot, stamped
--                      with the approved shot plan version + locked Scene DNA
--                      version it came from (rule 10); review_state when the
--                      shot plan changes afterwards (rule 11)
-- takes                one row per generation attempt; provider/model/params/
--                      seed/cost/request id recorded; media stored in the
--                      private Railway bucket (storage_key); explicit approval
-- worker_credentials   hashed tokens for the generation worker (no service key)
-- Long-running work runs in workers/image-worker via the MOS jobs table (rule 8).

create table if not exists public.generation_packages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  shot_id uuid not null,
  shot_plan_version_id uuid not null references public.shot_plan_versions(id),
  scene_dna_version_id uuid not null references public.scene_dna_versions(id),
  content jsonb not null,
  engine_version text not null,
  review_state text not null default 'current' check (review_state in ('current','review_required','stale')),
  review_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_generation_packages_project on public.generation_packages(project_id);
create index if not exists idx_generation_packages_shot on public.generation_packages(shot_id);

create table if not exists public.takes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  shot_id uuid not null,
  package_id uuid not null references public.generation_packages(id) on delete cascade,
  take_number int not null,
  provider text not null check (provider in ('aurastage-sketch','runway','openai')),
  model text not null check (char_length(model) between 1 and 80),
  capability text not null check (capability in ('image','video')),
  params jsonb not null default '{}'::jsonb,
  seed bigint,
  source_take_id uuid references public.takes(id),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  approval text not null default 'pending' check (approval in ('pending','approved','rejected','superseded')),
  job_id uuid references public.jobs(id),
  storage_key text,
  media_type text,
  error text,
  cost_actual numeric,
  provider_request_id text,
  attempt int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique (shot_id, take_number)
);
create index if not exists idx_takes_project on public.takes(project_id);
create index if not exists idx_takes_queue on public.takes(status, created_at) where status in ('queued','running');

create table if not exists public.worker_credentials (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  token_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.generation_packages enable row level security;
alter table public.takes enable row level security;
alter table public.worker_credentials enable row level security; -- no policies: definer functions only
drop policy if exists generation_packages_select on public.generation_packages;
create policy generation_packages_select on public.generation_packages for select using (public.is_org_member(org_id));
drop policy if exists takes_select on public.takes;
create policy takes_select on public.takes for select using (public.is_org_member(org_id));

-- Internal guard. Returns org_id.
create or replace function public.generation_assert(p_project_id uuid) returns uuid
language plpgsql security definer stable set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-GEN-403: not allowed to generate in this project' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

-- Compile & store a package for a shot of an APPROVED, current shot plan version.
create or replace function public.create_generation_package(p_project_id uuid, p_scene_id uuid, p_shot_id uuid,
  p_shot_plan_version_id uuid, p_content jsonb, p_engine_version text)
returns public.generation_packages
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_plan public.shot_plans; v_ver public.shot_plan_versions; v public.generation_packages;
begin
  v_org := public.generation_assert(p_project_id);
  select * into v_plan from public.shot_plans where scene_id = p_scene_id and project_id = p_project_id;
  select * into v_ver from public.shot_plan_versions where id = p_shot_plan_version_id and plan_id = v_plan.id;
  if v_plan.id is null or v_ver.id is null or v_plan.approved_version_id is distinct from v_ver.id
     or v_plan.status <> 'approved' or v_plan.review_state <> 'current' then
    raise exception 'AURA-GEN-412: approve this scene''s shot plan first — generation uses the approved version' using errcode = 'P0412';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_ver.shots) s where (s->>'id')::uuid = p_shot_id) then
    raise exception 'AURA-GEN-404: that shot is not in the approved shot plan' using errcode = 'P0404';
  end if;
  insert into public.generation_packages(org_id, project_id, scene_id, shot_id, shot_plan_version_id, scene_dna_version_id, content, engine_version, created_by)
  values (v_org, p_project_id, p_scene_id, p_shot_id, v_ver.id, v_ver.scene_dna_version_id, p_content, p_engine_version, auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'GenerationPackageCompiled', 'GenerationPackage', v.id,
          jsonb_build_object('shot_id', p_shot_id, 'shot_plan_version_id', v_ver.id, 'engine_version', p_engine_version));
  return v;
end;
$$;

-- Queue N takes for a current package; one MOS job per take (idempotent per key).
create or replace function public.request_takes(p_package_id uuid, p_provider text, p_model text, p_capability text,
  p_params jsonb, p_seed bigint, p_variations int, p_source_take_id uuid, p_idempotency_key text)
returns setof public.takes
language plpgsql security definer set search_path = public as $$
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
  if p_variations < 1 or p_variations > 4 then raise exception 'AURA-GEN-400: 1 to 4 variations' using errcode = 'P0400'; end if;
  if p_source_take_id is not null and not exists (select 1 from public.takes where id = p_source_take_id and shot_id = v_pkg.shot_id and status = 'succeeded') then
    raise exception 'AURA-GEN-400: the starting frame must be a finished take of this shot' using errcode = 'P0400';
  end if;
  -- Idempotent retry: same key returns the takes already queued.
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
$$;

-- Explicit approval (SRS §10). Approving supersedes the shot's previous approved take (kept, never deleted).
create or replace function public.set_take_approval(p_take_id uuid, p_approval text)
returns public.takes
language plpgsql security definer set search_path = public as $$
declare v public.takes;
begin
  select * into v from public.takes where id = p_take_id for update;
  if v.id is null then raise exception 'AURA-GEN-404: take not found' using errcode = 'P0404'; end if;
  perform public.generation_assert(v.project_id);
  if p_approval not in ('approved','rejected','pending') then raise exception 'AURA-GEN-400: invalid approval' using errcode = 'P0400'; end if;
  if p_approval = 'approved' and v.status <> 'succeeded' then
    raise exception 'AURA-GEN-409: only a finished take can be approved' using errcode = 'P0409';
  end if;
  if p_approval = 'approved' then
    update public.takes set approval = 'superseded' where shot_id = v.shot_id and approval = 'approved' and id <> v.id;
  end if;
  update public.takes set approval = p_approval where id = v.id returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v.org_id, auth.uid(), case p_approval when 'approved' then 'TakeApproved' when 'rejected' then 'TakeRejected' else 'TakeReopened' end,
          'Take', v.id, jsonb_build_object('shot_id', v.shot_id, 'take_number', v.take_number));
  return v;
end;
$$;

create or replace function public.cancel_take(p_take_id uuid)
returns public.takes
language plpgsql security definer set search_path = public as $$
declare v public.takes;
begin
  select * into v from public.takes where id = p_take_id for update;
  if v.id is null then raise exception 'AURA-GEN-404: take not found' using errcode = 'P0404'; end if;
  perform public.generation_assert(v.project_id);
  if v.status <> 'queued' then raise exception 'AURA-GEN-409: only a waiting take can be cancelled' using errcode = 'P0409'; end if;
  update public.takes set status = 'cancelled', completed_at = now() where id = v.id returning * into v;
  update public.jobs set status = 'cancelled', completed_at = now() where id = v.job_id;
  return v;
end;
$$;

create or replace function public.set_package_review(p_package_id uuid, p_state text, p_reason text)
returns public.generation_packages
language plpgsql security definer set search_path = public as $$
declare v public.generation_packages;
begin
  select * into v from public.generation_packages where id = p_package_id for update;
  if v.id is null then raise exception 'AURA-GEN-404: package not found' using errcode = 'P0404'; end if;
  perform public.generation_assert(v.project_id);
  if p_state not in ('current','review_required','stale') then raise exception 'AURA-GEN-400: invalid review state' using errcode = 'P0400'; end if;
  if v.review_state = p_state and v.review_reason is not distinct from p_reason then return v; end if;
  update public.generation_packages set review_state = p_state, review_reason = p_reason where id = v.id returning * into v;
  if p_state <> 'current' then
    insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
    values (v.org_id, auth.uid(), 'UpstreamVersionChanged', 'GenerationPackage', v.id, jsonb_build_object('state', p_state, 'reason', p_reason));
  end if;
  return v;
end;
$$;

-- ---- Worker side (token-authenticated; the worker has no user session) ----
create or replace function public.worker_check(p_token text) returns void
language plpgsql security definer stable set search_path = public, extensions as $$
begin
  if p_token is null or length(p_token) < 32 or not exists (
    select 1 from public.worker_credentials where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')) then
    raise exception 'AURA-GEN-401: worker not authorised' using errcode = '42501';
  end if;
end;
$$;

-- Claims the oldest waiting take (or one stuck running > 15 min, up to 3 attempts).
create or replace function public.worker_claim_take(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.takes; v_pkg public.generation_packages; v_src public.takes;
begin
  perform public.worker_check(p_token);
  select * into v from public.takes
    where status = 'queued' or (status = 'running' and started_at < now() - interval '15 minutes' and attempt < 3)
    order by created_at limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.takes set status = 'running', attempt = attempt + 1, started_at = now() where id = v.id returning * into v;
  update public.jobs set status = 'running', attempt = v.attempt, started_at = now() where id = v.job_id;
  select * into v_pkg from public.generation_packages where id = v.package_id;
  if v.source_take_id is not null then select * into v_src from public.takes where id = v.source_take_id; end if;
  return jsonb_build_object('take', to_jsonb(v), 'package', v_pkg.content,
    'source', case when v_src.id is null then null else jsonb_build_object('storage_key', v_src.storage_key, 'media_type', v_src.media_type) end);
end;
$$;

create or replace function public.worker_complete_take(p_token text, p_take_id uuid, p_storage_key text, p_media_type text,
  p_provider_request_id text, p_cost numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.takes;
begin
  perform public.worker_check(p_token);
  update public.takes set status = 'succeeded', storage_key = p_storage_key, media_type = p_media_type,
    provider_request_id = p_provider_request_id, cost_actual = p_cost, error = null, completed_at = now()
    where id = p_take_id and status = 'running' returning * into v;
  if v.id is null then return; end if; -- idempotent: already finished or cancelled
  update public.jobs set status = 'completed', completed_at = now(), provider_request_id = p_provider_request_id, cost_actual = p_cost,
    output_refs = jsonb_build_object('take_id', v.id, 'storage_key', p_storage_key) where id = v.job_id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v.org_id, null, 'TakeGenerated', 'Take', v.id, jsonb_build_object('provider', v.provider, 'model', v.model, 'request_id', p_provider_request_id));
end;
$$;

create or replace function public.worker_fail_take(p_token text, p_take_id uuid, p_error text, p_provider_request_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.takes;
begin
  perform public.worker_check(p_token);
  update public.takes set status = 'failed', error = left(p_error, 1000), provider_request_id = coalesce(p_provider_request_id, provider_request_id), completed_at = now()
    where id = p_take_id and status = 'running' returning * into v;
  if v.id is null then return; end if;
  update public.jobs set status = 'failed', completed_at = now(), error = jsonb_build_object('message', left(p_error, 1000)) where id = v.job_id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v.org_id, null, 'TakeFailed', 'Take', v.id, jsonb_build_object('provider', v.provider, 'error', left(p_error, 300)));
end;
$$;

revoke execute on function public.generation_assert(uuid) from public, anon, authenticated;
revoke execute on function public.worker_check(text) from public, anon, authenticated;
revoke execute on function public.create_generation_package(uuid, uuid, uuid, uuid, jsonb, text) from public, anon;
revoke execute on function public.request_takes(uuid, text, text, text, jsonb, bigint, int, uuid, text) from public, anon;
revoke execute on function public.set_take_approval(uuid, text) from public, anon;
revoke execute on function public.cancel_take(uuid) from public, anon;
revoke execute on function public.set_package_review(uuid, text, text) from public, anon;
revoke execute on function public.worker_claim_take(text) from public;
revoke execute on function public.worker_complete_take(text, uuid, text, text, text, numeric) from public;
revoke execute on function public.worker_fail_take(text, uuid, text, text) from public;
grant execute on function public.create_generation_package(uuid, uuid, uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.request_takes(uuid, text, text, text, jsonb, bigint, int, uuid, text) to authenticated;
grant execute on function public.set_take_approval(uuid, text) to authenticated;
grant execute on function public.cancel_take(uuid) to authenticated;
grant execute on function public.set_package_review(uuid, text, text) to authenticated;
-- The worker calls with the anon key + its token; the token check is inside each function.
grant execute on function public.worker_claim_take(text) to anon;
grant execute on function public.worker_complete_take(text, uuid, text, text, text, numeric) to anon;
grant execute on function public.worker_fail_take(text, uuid, text, text) to anon;
