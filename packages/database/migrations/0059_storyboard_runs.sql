-- 0059 — Storyboard & Shots in production runs (owner request 2026-10-03: "its too repetitive and boring to plan or
-- replan every single shot … a single click should help do this while it plans every single shot sequentially in the
-- background"). A third area, 'storyboard': `storyboard.film` plans every locked scene that has no shots yet, one scene
-- after another in short rounds, then approves every plan that passes its checks; `storyboard.replan` also re-plans the
-- scenes whose plan was flagged by a Scene DNA change (the person confirms it first; approved versions stay in history).
-- The work itself is the same permission-checked writes as the page's buttons (generate_shot_plan, approve_shot_plan);
-- running one needs Storyboard & Shots edit rights, as planning a scene by hand does.

do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.production_runs'::regclass and contype = 'c'
    and (pg_get_constraintdef(oid) like '%area%' or pg_get_constraintdef(oid) like '%visual.approve%') loop
    execute format('alter table public.production_runs drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.production_runs add constraint production_runs_area_check check (area in ('audio', 'visual', 'storyboard'));
alter table public.production_runs add constraint production_runs_kind_check check (kind in ('audio.film', 'audio.spot', 'audio.generate',
  'audio.place', 'visual.film', 'visual.compile', 'visual.sketch', 'visual.approve', 'storyboard.film', 'storyboard.replan'));

create or replace function app_private.run_module(p_area text) returns text language sql immutable as $$
  select case p_area when 'audio' then 'audio' when 'storyboard' then 'shots' else 'generation' end
$$;
-- The right a run needs in its area: making sound or pictures is 'generate'; planning shots is 'edit'.
create or replace function app_private.run_action(p_area text) returns text language sql immutable as $$
  select case p_area when 'storyboard' then 'edit' else 'generate' end
$$;
revoke all on function app_private.run_action(text) from public, anon;

-- Start a run, or join the one already running in that area (returns it with joined = true).
create or replace function public.start_production_run(p_project uuid, p_kind text, p_scene uuid default null)
returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare v_area text := split_part(coalesce(p_kind, ''), '.', 1); v_org uuid; r public.production_runs;
begin
  if v_area not in ('audio', 'visual', 'storyboard') then raise exception 'AURA-RUN-400: unknown kind of run' using errcode = 'P0400'; end if;
  perform public.gate_write(p_project, app_private.run_module(v_area), app_private.run_action(v_area));
  select org_id into v_org from public.projects where id = p_project;
  if p_scene is not null and not exists (select 1 from public.scenes where id = p_scene and project_id = p_project) then
    raise exception 'AURA-RUN-404: scene not found in this project' using errcode = 'P0404';
  end if;
  select * into r from public.production_runs where project_id = p_project and area = v_area and status in ('running', 'paused') for update;
  if r.id is not null then return jsonb_build_object('run', to_jsonb(r), 'joined', true); end if;
  insert into public.production_runs(org_id, project_id, area, kind, scene_id, started_by, started_by_label, log)
  values (v_org, p_project, v_area, p_kind, p_scene, auth.uid(),
    (select split_part(email::text, '@', 1) from auth.users where id = auth.uid()),
    jsonb_build_array(jsonb_build_object('at', now(), 'text', 'Started')))
  returning * into r;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'ProductionRunStarted', 'ProductionRun', r.id, jsonb_build_object('kind', p_kind, 'scene_id', p_scene));
  return jsonb_build_object('run', to_jsonb(r), 'joined', false);
end;
$$;

-- Take the run's lease for one round (true), unless another page is driving it right now (false).
create or replace function public.lease_production_run(p_run uuid, p_seconds int default 45)
returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.production_runs;
begin
  select * into r from public.production_runs where id = p_run for update;
  if r.id is null then raise exception 'AURA-RUN-404: run not found' using errcode = 'P0404'; end if;
  perform public.gate_write(r.project_id, app_private.run_module(r.area), app_private.run_action(r.area));
  if r.status <> 'running' then return false; end if;
  if r.lease_until is not null and r.lease_until > now() and r.lease_by is distinct from auth.uid() then return false; end if;
  update public.production_runs set lease_until = now() + make_interval(secs => least(greatest(coalesce(p_seconds, 45), 5), 120)), lease_by = auth.uid()
   where id = p_run;
  return true;
end;
$$;

-- Record one round: phase, status, message, totals, and a log line (the last 30 are kept). The lease is released.
create or replace function public.save_production_run(p_run uuid, p_phase text, p_status text, p_message text, p_progress jsonb, p_log text)
returns public.production_runs
language plpgsql security definer set search_path = public as $$
declare r public.production_runs; v_log jsonb;
begin
  select * into r from public.production_runs where id = p_run for update;
  if r.id is null then raise exception 'AURA-RUN-404: run not found' using errcode = 'P0404'; end if;
  perform public.gate_write(r.project_id, app_private.run_module(r.area), app_private.run_action(r.area));
  if r.status not in ('running', 'paused') then return r; end if; -- finished runs stay as they ended
  if p_status not in ('running', 'paused', 'completed', 'failed') then raise exception 'AURA-RUN-400: unknown status' using errcode = 'P0400'; end if;
  v_log := r.log;
  if nullif(trim(coalesce(p_log, '')), '') is not null then
    v_log := v_log || jsonb_build_array(jsonb_build_object('at', now(), 'text', left(p_log, 300)));
    if jsonb_array_length(v_log) > 30 then
      v_log := (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(v_log) with ordinality as x(e, i) where i > jsonb_array_length(v_log) - 30);
    end if;
  end if;
  update public.production_runs set phase = left(coalesce(nullif(p_phase, ''), phase), 40),
    status = case when status = 'paused' and p_status = 'running' then 'paused' else p_status end,
    message = left(p_message, 600), progress = coalesce(p_progress, progress), log = v_log, rounds = rounds + 1,
    lease_until = null, lease_by = null, updated_at = now(),
    finished_at = case when p_status in ('completed', 'failed') then now() else finished_at end
  where id = p_run returning * into r;
  if r.status in ('completed', 'failed') then
    insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
    values (r.org_id, auth.uid(), case r.status when 'completed' then 'ProductionRunCompleted' else 'ProductionRunFailed' end, 'ProductionRun', r.id,
      jsonb_build_object('kind', r.kind, 'message', left(r.message, 300)));
  end if;
  return r;
end;
$$;

-- Pause, resume or stop a run (anyone on the project who may run it). Work already done stays.
create or replace function public.control_production_run(p_run uuid, p_action text)
returns public.production_runs
language plpgsql security definer set search_path = public as $$
declare r public.production_runs; v_who text;
begin
  select * into r from public.production_runs where id = p_run for update;
  if r.id is null then raise exception 'AURA-RUN-404: run not found' using errcode = 'P0404'; end if;
  perform public.gate_write(r.project_id, app_private.run_module(r.area), app_private.run_action(r.area));
  select split_part(email::text, '@', 1) into v_who from auth.users where id = auth.uid();
  if p_action = 'pause' and r.status = 'running' then
    update public.production_runs set status = 'paused', lease_until = null, lease_by = null, updated_at = now(),
      log = log || jsonb_build_array(jsonb_build_object('at', now(), 'text', 'Paused by ' || coalesce(v_who, 'a team member'))) where id = p_run returning * into r;
  elsif p_action = 'resume' and r.status = 'paused' then
    update public.production_runs set status = 'running', updated_at = now(),
      log = log || jsonb_build_array(jsonb_build_object('at', now(), 'text', 'Resumed by ' || coalesce(v_who, 'a team member'))) where id = p_run returning * into r;
  elsif p_action = 'stop' and r.status in ('running', 'paused') then
    update public.production_runs set status = 'cancelled', lease_until = null, lease_by = null, updated_at = now(), finished_at = now(),
      message = 'Stopped by ' || coalesce(v_who, 'a team member') || '. Everything already made is kept.',
      log = log || jsonb_build_array(jsonb_build_object('at', now(), 'text', 'Stopped by ' || coalesce(v_who, 'a team member'))) where id = p_run returning * into r;
  elsif p_action not in ('pause', 'resume', 'stop') then
    raise exception 'AURA-RUN-400: unknown action' using errcode = 'P0400';
  end if;
  return r;
end;
$$;
