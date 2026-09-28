-- AI Phase 1 (docs/architecture/INTELLIGENCE_PLAN.md): durable record of every "Ask AuraStage" request.
-- request -> intent -> context snapshot (canonical ids + versions) -> planning job (worker, rule 8) -> plan ->
-- user approval -> results (what changed, with the before values for undo) -> provenance.
-- The assistant never writes production tables: applying a plan runs the Tool Registry through each domain's own
-- gated functions (rule 4). This table only records the conversation and its outcome.

create table if not exists public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  module text not null check (module = any(public.permission_modules())),
  object_type text,
  object_id uuid,
  object_version text,
  request text not null check (char_length(request) between 3 and 4000),
  mode text not null default 'suggest' check (mode in ('assist','suggest','generate')),
  intent jsonb not null default '{}'::jsonb,
  -- What the planner saw: the context bundle (ids + versions) and the prompt, frozen for provenance.
  snapshot jsonb not null default '{}'::jsonb check (pg_column_size(snapshot) <= 400000),
  status text not null default 'queued' check (status in ('queued','planning','proposed','applying','applied','rejected','failed','undone')),
  job_id uuid references public.jobs(id) on delete set null,
  provider text,
  model text,
  engine_version text not null,
  test_output boolean not null default false,
  plan jsonb,
  results jsonb,
  error text,
  provider_request_id text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  planned_at timestamptz,
  applied_at timestamptz,
  undone_at timestamptz
);
create index if not exists idx_ai_proposals_project on public.ai_proposals(project_id, created_at desc);
create index if not exists idx_ai_proposals_queue on public.ai_proposals(status, created_at) where status in ('queued','planning');
alter table public.ai_proposals enable row level security;
drop policy if exists ai_proposals_select on public.ai_proposals;
-- People see their own requests; project admins see everyone's (audit).
create policy ai_proposals_select on public.ai_proposals for select
  using (project_id = any ((select public.my_project_ids())::uuid[]) and (created_by = (select auth.uid()) or org_id = any ((select public.my_admin_org_ids())::uuid[])));

create or replace function public.request_ai_proposal(p_project uuid, p_module text, p_object_type text, p_object_id uuid, p_object_version text,
  p_request text, p_mode text, p_intent jsonb, p_snapshot jsonb, p_engine_version text)
returns public.ai_proposals
language plpgsql security definer set search_path = public as $$
declare v public.ai_proposals; v_org uuid; v_job uuid;
begin
  -- Asking is open to anyone who can see the workspace; each change is gated again when it is applied.
  perform public.gate_write(p_project, p_module, 'view');
  select org_id into v_org from public.projects where id = p_project;
  if (select count(*) from public.ai_proposals where created_by = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'AURA-AI-429: that''s a lot of requests in a minute — give AuraStage a moment' using errcode = 'P0429';
  end if;
  insert into public.jobs(org_id, project_id, engine_id, engine_version, input_snapshot)
  values (v_org, p_project, 'assistant.plan', p_engine_version, jsonb_build_object('module', p_module, 'object_id', p_object_id))
  returning id into v_job;
  insert into public.ai_proposals(org_id, project_id, module, object_type, object_id, object_version, request, mode, intent, snapshot, job_id, engine_version, created_by)
  values (v_org, p_project, p_module, p_object_type, p_object_id, p_object_version, trim(p_request), coalesce(p_mode, 'suggest'), coalesce(p_intent, '{}'),
          coalesce(p_snapshot, '{}'), v_job, p_engine_version, auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'AIProposalRequested', 'AIProposal', v.id, jsonb_build_object('module', p_module, 'operation', p_intent->>'operation'));
  return v;
end;
$$;

-- The requester records the outcome after the Tool Registry ran (or they declined / undid it).
create or replace function public.set_ai_proposal_outcome(p_id uuid, p_status text, p_results jsonb, p_error text)
returns public.ai_proposals
language plpgsql security definer set search_path = public as $$
declare v public.ai_proposals;
begin
  select * into v from public.ai_proposals where id = p_id for update;
  if v.id is null or v.created_by <> auth.uid() then raise exception 'AURA-AI-404: request not found' using errcode = 'P0404'; end if;
  perform public.gate_write(v.project_id, v.module, 'view');
  if not (
    (p_status in ('applying','rejected') and v.status = 'proposed') or
    (p_status in ('applied','failed') and v.status = 'applying') or
    (p_status = 'undone' and v.status = 'applied')
  ) then
    raise exception 'AURA-AI-409: this request is %; it can''t become %', v.status, p_status using errcode = 'P0409';
  end if;
  update public.ai_proposals set status = p_status, results = coalesce(p_results, results), error = p_error,
    applied_at = case when p_status = 'applied' then now() else applied_at end,
    undone_at = case when p_status = 'undone' then now() else undone_at end
  where id = p_id returning * into v;
  if p_status in ('applied','rejected','undone','failed') then
    insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
    values (v.org_id, auth.uid(), case p_status when 'applied' then 'AIProposalApplied' when 'rejected' then 'AIProposalRejected'
      when 'undone' then 'AIProposalUndone' else 'AIProposalFailed' end, 'AIProposal', v.id,
      jsonb_build_object('module', v.module, 'provider', v.provider, 'test_output', v.test_output, 'calls', jsonb_array_length(coalesce(v.plan->'calls', '[]'))));
  end if;
  return v;
end;
$$;

-- ---- Planning worker (token-checked, like the take and render workers) ----
create or replace function public.worker_claim_ai_proposal(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.ai_proposals;
begin
  perform public.worker_check(p_token);
  select * into v from public.ai_proposals
    where status = 'queued' or (status = 'planning' and planned_at is null and created_at < now() - interval '10 minutes')
    order by created_at limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.ai_proposals set status = 'planning' where id = v.id returning * into v;
  update public.jobs set status = 'running', attempt = attempt + 1, started_at = now() where id = v.job_id;
  return jsonb_build_object('id', v.id, 'module', v.module, 'request', v.request, 'mode', v.mode, 'intent', v.intent, 'snapshot', v.snapshot);
end;
$$;

create or replace function public.worker_complete_ai_proposal(p_token text, p_id uuid, p_plan jsonb, p_provider text, p_model text,
  p_test_output boolean, p_request_id text, p_cost numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.ai_proposals;
begin
  perform public.worker_check(p_token);
  update public.ai_proposals set status = 'proposed', plan = p_plan, provider = p_provider, model = p_model, test_output = coalesce(p_test_output, false),
    provider_request_id = p_request_id, planned_at = now(), error = null
    where id = p_id and status = 'planning' returning * into v;
  if v.id is null then return; end if; -- idempotent
  update public.jobs set status = 'completed', completed_at = now(), provider_request_id = p_request_id, cost_actual = p_cost,
    output_refs = jsonb_build_object('proposal_id', v.id, 'calls', jsonb_array_length(coalesce(p_plan->'calls', '[]'))) where id = v.job_id;
end;
$$;

create or replace function public.worker_fail_ai_proposal(p_token text, p_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.ai_proposals;
begin
  perform public.worker_check(p_token);
  update public.ai_proposals set status = 'failed', error = left(coalesce(p_error, 'Planning failed'), 1000), planned_at = now()
    where id = p_id and status = 'planning' returning * into v;
  if v.id is null then return; end if;
  update public.jobs set status = 'failed', completed_at = now(), error = jsonb_build_object('message', left(p_error, 500)) where id = v.job_id;
end;
$$;

revoke execute on function public.request_ai_proposal(uuid, text, text, uuid, text, text, text, jsonb, jsonb, text), public.set_ai_proposal_outcome(uuid, text, jsonb, text) from public, anon;
grant execute on function public.request_ai_proposal(uuid, text, text, uuid, text, text, text, jsonb, jsonb, text), public.set_ai_proposal_outcome(uuid, text, jsonb, text) to authenticated;
revoke execute on function public.worker_claim_ai_proposal(text), public.worker_complete_ai_proposal(text, uuid, jsonb, text, text, boolean, text, numeric),
  public.worker_fail_ai_proposal(text, uuid, text) from public, authenticated;
-- The worker calls with the anon key + its token; the token check is inside each function.
grant execute on function public.worker_claim_ai_proposal(text), public.worker_complete_ai_proposal(text, uuid, jsonb, text, text, boolean, text, numeric),
  public.worker_fail_ai_proposal(text, uuid, text) to anon;
