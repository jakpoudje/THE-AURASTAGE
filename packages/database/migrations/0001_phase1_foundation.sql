-- Phase 1 foundation: Organization, Project, Audit, Jobs (MOS), Assets
-- See docs/architecture/DATA_AUTHORITY.md for canonical ownership.
-- Applied to the live aurastage Supabase project (ref wczporjnmgdqmxqxvbhm) on 2026-09-26.

create extension if not exists pgcrypto;

-- 1. Organizations -----------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','producer','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- 2. Projects (root object; story fields canonically owned by Scriptwriter,
--    technical/provider policy by Project Settings — see DATA_AUTHORITY.md) --
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  type text not null default 'feature_film' check (type in ('feature_film','short_film','series','documentary','animation')),
  genre text,
  subgenre text,
  setting text,
  time_period text,
  logline text,
  target_runtime_minutes int,
  status text not null default 'draft' check (status in ('draft','in_production','completed','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

-- 3. Audit log (platform canonical authority, immutable) ----------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  object_type text not null,
  object_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 4. Jobs / EngineRun (MOS execution state — see docs/architecture) -----
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  engine_id text not null,
  engine_version text not null,
  idempotency_key text,
  status text not null default 'queued' check (status in ('queued','running','waiting','completed','failed','cancelled')),
  input_snapshot jsonb not null default '{}'::jsonb,
  output_refs jsonb not null default '{}'::jsonb,
  error jsonb,
  attempt int not null default 0,
  provider_request_id text,
  cost_estimated numeric,
  cost_actual numeric,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists idx_jobs_org on public.jobs(org_id);
create index if not exists idx_jobs_project on public.jobs(project_id);
create unique index if not exists uq_jobs_idempotency on public.jobs(engine_id, idempotency_key) where idempotency_key is not null;

-- 5. Assets (Assets Library canonical authority) -------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  type text not null,
  name text not null,
  storage_path text,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_assets_project on public.assets(project_id);

-- 6. Helper: membership check (security definer avoids RLS recursion) ---
create or replace function public.is_org_member(check_org_id uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = check_org_id and m.user_id = auth.uid()
  );
$$;

-- 7. Atomic org creation (bootstraps owner membership in one transaction) --
create or replace function public.create_organization(org_name text, org_slug text) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  new_org public.organizations;
begin
  insert into public.organizations(name, slug) values (org_name, org_slug) returning * into new_org;
  insert into public.org_members(org_id, user_id, role) values (new_org.id, auth.uid(), 'owner');
  return new_org;
end;
$$;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;

-- 8. Row Level Security ---------------------------------------------------
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.projects enable row level security;
alter table public.audit_events enable row level security;
alter table public.jobs enable row level security;
alter table public.assets enable row level security;

create policy org_select_members on public.organizations for select
  using (public.is_org_member(id));

create policy org_members_select on public.org_members for select
  using (user_id = auth.uid() or public.is_org_member(org_id));

create policy projects_select on public.projects for select
  using (public.is_org_member(org_id));
create policy projects_insert on public.projects for insert
  with check (public.is_org_member(org_id));
create policy projects_update on public.projects for update
  using (public.is_org_member(org_id));
create policy projects_delete on public.projects for delete
  using (public.is_org_member(org_id));

create policy audit_events_select on public.audit_events for select
  using (public.is_org_member(org_id));

create policy jobs_select on public.jobs for select
  using (public.is_org_member(org_id));

create policy assets_select on public.assets for select
  using (public.is_org_member(org_id));
create policy assets_insert on public.assets for insert
  with check (public.is_org_member(org_id));
