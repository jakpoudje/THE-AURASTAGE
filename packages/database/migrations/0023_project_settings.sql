-- Project Settings (SRS §13.1). Canonical owner: Project Settings.
-- Versioned production-wide policy (the shape is packages/contracts ProjectSettingsSchema; the API
-- validates it). Saving needs settings:edit, uses optimistic concurrency (revision) and keeps every
-- version. Changes apply to new work: nothing approved is rewritten (rule 11); the one downstream
-- effect — a changed visual style — marks compiled shot prompts for review in Visual Generation.
-- The monthly cap on paid generations is enforced here, in front of request_takes.

create table if not exists public.project_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  version_number int not null default 0,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 20000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.project_settings_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  version_number int not null,
  settings jsonb not null,
  changed text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);
alter table public.project_settings enable row level security;
alter table public.project_settings_versions enable row level security;
drop policy if exists project_settings_select on public.project_settings;
create policy project_settings_select on public.project_settings for select using (project_id = any ((select public.my_project_ids())::uuid[]));
drop policy if exists project_settings_versions_select on public.project_settings_versions;
create policy project_settings_versions_select on public.project_settings_versions for select using (project_id = any ((select public.my_project_ids())::uuid[]));

create or replace function public.save_project_settings(p_project uuid, p_base_revision uuid, p_settings jsonb, p_changed text[])
returns public.project_settings
language plpgsql security definer set search_path = public as $$
declare cur public.project_settings; v_org uuid; s public.project_settings;
begin
  perform public.gate_write(p_project, 'settings', 'edit');
  select org_id into v_org from public.projects where id = p_project;
  if v_org is null then raise exception 'AURA-SET-404: project not found' using errcode = 'P0404'; end if;
  select * into cur from public.project_settings where project_id = p_project for update;
  if cur.project_id is not null and cur.revision is distinct from p_base_revision then
    raise exception 'AURA-SET-409: someone changed the settings since you opened them — reload to see their version' using errcode = 'P0409';
  end if;
  if cur.project_id is null and p_base_revision is not null then
    raise exception 'AURA-SET-409: someone changed the settings since you opened them — reload to see their version' using errcode = 'P0409';
  end if;
  insert into public.project_settings(project_id, org_id, revision, version_number, settings, updated_by, updated_at)
  values (p_project, v_org, gen_random_uuid(), coalesce(cur.version_number, 0) + 1, coalesce(p_settings, '{}'::jsonb), auth.uid(), now())
  on conflict (project_id) do update set revision = excluded.revision, version_number = excluded.version_number, settings = excluded.settings,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into s;
  insert into public.project_settings_versions(project_id, org_id, version_number, settings, changed, created_by)
  values (p_project, v_org, s.version_number, s.settings, coalesce(p_changed, '{}'), auth.uid());
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (v_org, auth.uid(), 'ProjectSettingsChanged', 'ProjectSettings', p_project, jsonb_build_object('version', s.version_number, 'changed', to_jsonb(coalesce(p_changed, '{}'))), p_project);
  return s;
end;
$$;

-- Paid takes this calendar month (anything but the built-in Sketch provider).
create or replace function public.paid_takes_this_month(p_project uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.takes
  where project_id = p_project and provider <> 'aurastage-sketch' and created_at >= date_trunc('month', now())
    and public.can_view_project(p_project);
$$;

-- request_takes keeps its permission gate and gains the monthly cap from Project Settings.
create or replace function public.request_takes(p_package_id uuid, p_provider text, p_model text, p_capability text, p_params jsonb, p_seed bigint,
  p_variations integer, p_source_take_id uuid, p_idempotency_key text)
returns setof public.takes
language plpgsql security definer set search_path = public as $$
declare v_project uuid := (select project_id from public.generation_packages where id = p_package_id); v_limit int; v_used int;
begin
  perform public.gate_write(v_project, 'generation', 'generate');
  if v_project is not null and p_provider <> 'aurastage-sketch' then
    select nullif(settings #>> '{generation,monthly_paid_take_limit}', '')::int into v_limit from public.project_settings where project_id = v_project;
    if v_limit is not null then
      v_used := public.paid_takes_this_month(v_project);
      if v_used + greatest(coalesce(p_variations, 1), 1) > v_limit then
        raise exception 'AURA-GEN-402: this project''s monthly limit of % paid takes is reached (% used this month). Raise it in Project Settings, or use AuraStage Sketch.', v_limit, v_used
          using errcode = 'P0402';
      end if;
    end if;
  end if;
  return query select * from app_private.request_takes(p_package_id, p_provider, p_model, p_capability, p_params, p_seed, p_variations, p_source_take_id, p_idempotency_key);
end;
$$;

revoke execute on function public.save_project_settings(uuid, uuid, jsonb, text[]), public.paid_takes_this_month(uuid) from public, anon;
grant execute on function public.save_project_settings(uuid, uuid, jsonb, text[]), public.paid_takes_this_month(uuid) to authenticated;
revoke execute on function public.request_takes(uuid, text, text, text, jsonb, bigint, integer, uuid, text) from public, anon;
grant execute on function public.request_takes(uuid, text, text, text, jsonb, bigint, integer, uuid, text) to authenticated;
