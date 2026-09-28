-- Phase 11: Team & Collaboration permissions (SRS §13.2, §18). Canonical owner: Team & Collaboration.
--
-- Authorization hierarchy: Organization -> Project -> Module/action.
--   * Organization roles: owner, admin, producer have full production rights on every
--     project in the organization. owner/admin also manage the organization's people.
--     "member" sees only the projects they were added to.
--   * Project roles (the SRS role list: Director, Writer, Editor, ...) grant actions per
--     module (view, comment, create, edit, generate, approve, lock, administer). Every
--     project member can view and comment everywhere in that project.
--   * A member can be given extra "module:action" grants on top of their role.
--
-- Enforcement is server-side in the database:
--   * every user-callable write function now sits behind public.gate_write(project, module,
--     action). The original function bodies moved unchanged to schema app_private (not
--     exposed through the API) and are only reachable through their gate. The regression
--     test tests/integration/team_db.sql fails if a user-callable function has no gate.
--   * read policies use public.my_project_ids(), so a member only sees their projects.
-- Object-level scope (e.g. a single scene) is deferred: it needs per-object ACLs in every
-- domain; tracked in docs/architecture/MODULE_REGISTRY.md.

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------
-- 1. Role definitions (the only copy of the role -> permission matrix)
-- ---------------------------------------------------------------------------------
create or replace function public.permission_modules() returns text[]
language sql immutable set search_path = public as $$
  select array['script','casting','dialogue','scene_dna','shots','generation','audio','editorial','delivery','assets','settings','team'];
$$;
create or replace function public.permission_actions() returns text[]
language sql immutable set search_path = public as $$
  select array['view','comment','create','edit','generate','approve','lock','administer'];
$$;
create or replace function public.valid_permission_grants(p text[]) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(bool_and(split_part(g, ':', 1) = any(public.permission_modules()) and split_part(g, ':', 2) = any(public.permission_actions())
    and array_length(string_to_array(g, ':'), 1) = 2), true)
  from unnest(p) g;
$$;

create table if not exists public.project_roles (
  id text primary key,
  label text not null,
  department text not null,
  description text not null,
  permissions jsonb not null,
  sort int not null
);
alter table public.project_roles enable row level security;
drop policy if exists project_roles_select on public.project_roles;
create policy project_roles_select on public.project_roles for select to authenticated using (true);

insert into public.project_roles(id, label, department, description, permissions, sort) values
 ('producer','Producer','Production','Runs the project: every action in every workspace, and manages the project team.',
   '{"*":["view","comment","create","edit","generate","approve","lock","administer"]}', 1),
 ('director','Director','Creative','Approves the script, casting, dialogue and shots; locks Scene DNA and the picture.',
   '{"script":["approve"],"casting":["create","edit","approve"],"dialogue":["edit","approve"],"scene_dna":["edit","lock"],"shots":["create","edit","approve"],"generation":["create","edit","generate","approve"],"audio":["approve"],"editorial":["create","edit","lock"],"delivery":["create"],"assets":["create","edit"]}', 2),
 ('writer','Writer','Story','Writes and revises the screenplay.',
   '{"script":["create","edit"],"dialogue":["edit"]}', 3),
 ('script_editor','Script Editor','Story','Edits the screenplay and dialogue.',
   '{"script":["create","edit"],"dialogue":["edit"]}', 4),
 ('casting_director','Casting Director','Casting','Builds and approves the cast.',
   '{"casting":["create","edit","approve"],"generation":["generate"],"assets":["create"]}', 5),
 ('dialogue_editor','Dialogue Editor','Performance','Annotates and approves dialogue.',
   '{"dialogue":["edit","approve"]}', 6),
 ('cinematographer','Cinematographer','Camera','Plans and approves shots and approves generated takes.',
   '{"scene_dna":["edit"],"shots":["create","edit","approve"],"generation":["create","edit","generate","approve"],"assets":["create"]}', 7),
 ('storyboard_artist','Storyboard Artist','Camera','Draws up shots and generates storyboard takes.',
   '{"shots":["create","edit"],"generation":["create","edit","generate"],"assets":["create"]}', 8),
 ('production_designer','Production Designer','Art','Shapes the look of each scene.',
   '{"scene_dna":["edit"],"generation":["create","edit","generate"],"assets":["create","edit"]}', 9),
 ('costume_wardrobe','Costume / Wardrobe','Art','Manages wardrobe looks.',
   '{"casting":["edit"],"assets":["create","edit"]}', 10),
 ('sound_designer','Sound Designer','Sound','Builds scene sound: effects and ambience.',
   '{"audio":["create","edit"],"assets":["create","edit"]}', 11),
 ('adr_editor','ADR Editor','Sound','Records and places replacement dialogue.',
   '{"audio":["create","edit"],"dialogue":["edit"],"assets":["create"]}', 12),
 ('composer','Composer','Sound','Places music.',
   '{"audio":["create","edit"],"assets":["create"]}', 13),
 ('rerecording_mixer','Re-recording Mixer','Sound','Mixes and approves scene sound.',
   '{"audio":["create","edit","approve"],"delivery":["create"]}', 14),
 ('editor','Editor','Post','Cuts the film.',
   '{"editorial":["create","edit"],"delivery":["create"]}', 15),
 ('colorist','Colorist','Post','Grades clips on the timeline.',
   '{"editorial":["edit"]}', 16),
 ('vfx','VFX','Post','Generates and replaces visual effects shots.',
   '{"generation":["create","edit","generate"],"editorial":["edit"],"assets":["create"]}', 17),
 ('qc_delivery','QC / Delivery','Post','Makes and checks deliverables.',
   '{"delivery":["create","edit"]}', 18),
 ('reviewer','Reviewer','Review','Views everything and leaves comments.',
   '{}', 19)
on conflict (id) do update set label = excluded.label, department = excluded.department, description = excluded.description,
  permissions = excluded.permissions, sort = excluded.sort;

-- ---------------------------------------------------------------------------------
-- 2. Project members and invites
-- ---------------------------------------------------------------------------------
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null references public.project_roles(id),
  grants text[] not null default '{}' check (public.valid_permission_grants(grants)),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index if not exists idx_project_members_user on public.project_members(user_id);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  org_role text not null default 'member' check (org_role in ('admin','producer','member')),
  project_role text references public.project_roles(id),
  grants text[] not null default '{}' check (public.valid_permission_grants(grants)),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check (org_role <> 'member' or (project_id is not null and project_role is not null))
);
create index if not exists idx_invites_org on public.invites(org_id, created_at desc);

-- ---------------------------------------------------------------------------------
-- 3. Permission predicates
-- ---------------------------------------------------------------------------------
create or replace function public.org_role(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.org_members where org_id = p_org and user_id = auth.uid();
$$;

-- Organizations where the caller has full production rights (owner/admin/producer).
create or replace function public.my_admin_org_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(org_id), '{}') from public.org_members
  where user_id = auth.uid() and role in ('owner','admin','producer');
$$;

-- Every project the caller may see: all projects of their full-rights organizations, plus
-- projects they were added to while still an organization member.
create or replace function public.my_project_ids() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from (
    select p.id from public.projects p
      join public.org_members m on m.org_id = p.org_id and m.user_id = auth.uid() and m.role in ('owner','admin','producer')
    union
    select pm.project_id from public.project_members pm
      join public.org_members m on m.org_id = pm.org_id and m.user_id = pm.user_id
      where pm.user_id = auth.uid()
  ) s;
$$;

create or replace function public.can_view_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_project = any(public.my_project_ids());
$$;

create or replace function public.project_can(p_project uuid, p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when exists (select 1 from public.projects p join public.org_members m on m.org_id = p.org_id and m.user_id = auth.uid()
                 where p.id = p_project and m.role in ('owner','admin','producer')) then true
    else coalesce((
      select p_action in ('view','comment')
        or coalesce(r.permissions->'*', '[]'::jsonb) ? p_action
        or coalesce(r.permissions->p_module, '[]'::jsonb) ? p_action
        or (p_module || ':' || p_action) = any(pm.grants)
      from public.project_members pm
      join public.project_roles r on r.id = pm.role
      join public.org_members om on om.org_id = pm.org_id and om.user_id = pm.user_id
      where pm.project_id = p_project and pm.user_id = auth.uid()), false)
  end;
$$;

-- What the caller can do in a project, for the UI (the database still checks every write).
create or replace function public.project_access(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v_org_role text; pm public.project_members; r public.project_roles; v_mods jsonb := '{}'::jsonb; m text; a text; acts jsonb;
begin
  select org_id into v_org from public.projects where id = p_project;
  if v_org is null or not public.can_view_project(p_project) then
    raise exception 'AURA-COL-404: project not found' using errcode = 'P0404';
  end if;
  v_org_role := public.org_role(v_org);
  select * into pm from public.project_members where project_id = p_project and user_id = auth.uid();
  if pm.role is not null then select * into r from public.project_roles where id = pm.role; end if;
  foreach m in array public.permission_modules() loop
    acts := '[]'::jsonb;
    foreach a in array public.permission_actions() loop
      if public.project_can(p_project, m, a) then acts := acts || to_jsonb(a); end if;
    end loop;
    v_mods := v_mods || jsonb_build_object(m, acts);
  end loop;
  return jsonb_build_object(
    'project_id', p_project, 'org_id', v_org, 'org_role', v_org_role,
    'project_role', pm.role, 'project_role_label', r.label, 'grants', to_jsonb(coalesce(pm.grants, '{}')),
    'source', case when v_org_role in ('owner','admin','producer') then 'organization' else 'project' end,
    'modules', v_mods);
end;
$$;

-- The single write gate. Raises AURA-COL-403 in plain language; records the project so the
-- audit trail can be filtered per project.
create or replace function public.gate_write(p_project uuid, p_module text, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text; v_label text;
begin
  if p_project is null then return; end if; -- unknown object: the function itself reports "not found"
  if not public.project_can(p_project, p_module, p_action) then
    if not public.can_view_project(p_project) then
      raise exception 'AURA-COL-403: you don''t have access to this project' using errcode = '42501';
    end if;
    select pm.role, r.label into v_role, v_label from public.project_members pm join public.project_roles r on r.id = pm.role
      where pm.project_id = p_project and pm.user_id = auth.uid();
    raise exception 'AURA-COL-403: your role (%) can''t % in %. Ask the project''s producer for access.',
      coalesce(v_label, 'none'), p_action,
      case p_module when 'script' then 'Scriptwriter' when 'casting' then 'Casting & Characters' when 'dialogue' then 'Dialogue Intelligence'
        when 'scene_dna' then 'Scene DNA' when 'shots' then 'Storyboard & Shots' when 'generation' then 'Visual Generation'
        when 'audio' then 'Audio Studio' when 'editorial' then 'Editorial & Timeline' when 'delivery' then 'Export & Deliver'
        when 'assets' then 'the Assets Library' when 'settings' then 'Project Settings' else 'Team & Collaboration' end
      using errcode = '42501';
  end if;
  perform set_config('aura.project_id', p_project::text, true);
end;
$$;

-- ---------------------------------------------------------------------------------
-- 4. Audit trail per project (activity feed) — immutable events gain their project
-- ---------------------------------------------------------------------------------
alter table public.audit_events add column if not exists project_id uuid; -- no FK: events outlive deleted projects
create index if not exists idx_audit_project on public.audit_events(project_id, created_at desc);

create or replace function public.audit_project_of(p_type text, p_id uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if p_id is null then return null; end if;
  return case
    when p_type = 'Project' then p_id
    when p_type = 'Script' then (select project_id from public.scripts where id = p_id)
    when p_type = 'ScriptVersion' then (select s.project_id from public.script_versions v join public.scripts s on s.id = v.script_id where v.id = p_id)
    when p_type = 'Scene' then (select project_id from public.scenes where id = p_id)
    when p_type = 'Character' then (select project_id from public.characters where id = p_id)
    when p_type = 'CharacterRelationship' then (select project_id from public.character_relationships where id = p_id)
    when p_type = 'WardrobeLook' then (select project_id from public.wardrobe_looks where id = p_id)
    when p_type = 'DialogueLine' then (select project_id from public.dialogue_lines where id = p_id)
    when p_type = 'SceneDNA' then coalesce((select project_id from public.scene_dna where id = p_id), (select project_id from public.scenes where id = p_id))
    when p_type = 'ShotPlan' then (select project_id from public.shot_plans where id = p_id)
    when p_type like 'Shot%' then (select project_id from public.shots where id = p_id)
    when p_type = 'GenerationPackage' then (select project_id from public.generation_packages where id = p_id)
    when p_type = 'Take' then (select project_id from public.takes where id = p_id)
    when p_type = 'AudioSession' then (select project_id from public.audio_sessions where id = p_id)
    when p_type like 'AudioClip%' then (select project_id from public.audio_clips where id = p_id)
    when p_type like 'AudioTrack%' then (select project_id from public.audio_tracks where id = p_id)
    when p_type = 'Timeline' then (select project_id from public.timelines where id = p_id)
    when p_type = 'Render' then (select project_id from public.renders where id = p_id)
    when p_type = 'Asset' then (select project_id from public.assets where id = p_id)
    else null end;
exception when undefined_column or undefined_table then return null;
end;
$$;

create or replace function public.audit_fill_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is null then
    new.project_id := nullif(current_setting('aura.project_id', true), '')::uuid;
  end if;
  if new.project_id is null then
    new.project_id := public.audit_project_of(new.object_type, new.object_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_audit_fill_project on public.audit_events;
create trigger trg_audit_fill_project before insert on public.audit_events
  for each row execute function public.audit_fill_project();

update public.audit_events set project_id = public.audit_project_of(object_type, object_id) where project_id is null;

-- ---------------------------------------------------------------------------------
-- 5. Read scoping: members see only their projects
-- ---------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['audio_clips','audio_measurements','audio_session_versions','audio_sessions','audio_tracks',
    'character_aliases','character_appearances','character_relationships','characters','dialogue_lines','generation_packages',
    'picture_locks','renders','scene_dna','scene_dna_versions','scenes','scripts','shot_plan_versions',
    'shot_plans','shots','takes','timeline_clips','timeline_versions','timelines','wardrobe_looks'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (project_id = any ((select public.my_project_ids())::uuid[]))', t || '_select', t);
  end loop;
end $$;

drop policy if exists script_versions_select on public.script_versions;
create policy script_versions_select on public.script_versions for select
  using (exists (select 1 from public.scripts s where s.id = script_versions.script_id and s.project_id = any ((select public.my_project_ids())::uuid[])));

drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets for select
  using (project_id = any ((select public.my_project_ids())::uuid[]) or (project_id is null and public.is_org_member(org_id)));
drop policy if exists assets_insert on public.assets;
create policy assets_insert on public.assets for insert
  with check (case when project_id is null then public.is_org_member(org_id) else public.project_can(project_id, 'assets', 'create') end);

drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs for select
  using (project_id = any ((select public.my_project_ids())::uuid[]) or (project_id is null and org_id = any ((select public.my_admin_org_ids())::uuid[])));

drop policy if exists audit_events_select on public.audit_events;
create policy audit_events_select on public.audit_events for select
  using (org_id = any ((select public.my_admin_org_ids())::uuid[]) or project_id = any ((select public.my_project_ids())::uuid[]));

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select using (id = any ((select public.my_project_ids())::uuid[]));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert with check (org_id = any ((select public.my_admin_org_ids())::uuid[]));
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update using (public.project_can(id, 'settings', 'edit'));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete using (public.org_role(org_id) in ('owner','admin'));

alter table public.project_members enable row level security;
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members for select using (project_id = any ((select public.my_project_ids())::uuid[]));

alter table public.invites enable row level security;
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites for select
  using (public.org_role(org_id) in ('owner','admin') or (project_id is not null and public.project_can(project_id, 'team', 'administer')));

-- ---------------------------------------------------------------------------------
-- 6. Managing people (every change is audited)
-- ---------------------------------------------------------------------------------
-- People with access to a project (organization-wide roles + project members), with emails.
create or replace function public.project_team(p_project uuid)
returns table(user_id uuid, email text, org_role text, project_role text, grants text[], source text, joined_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project;
  if v_org is null or not public.can_view_project(p_project) then
    raise exception 'AURA-COL-404: project not found' using errcode = 'P0404';
  end if;
  return query
    select m.user_id, u.email::text, m.role, pm.role, coalesce(pm.grants, '{}'::text[]),
      case when m.role in ('owner','admin','producer') then 'organization' else 'project' end,
      coalesce(pm.created_at, m.created_at), u.last_sign_in_at
    from public.org_members m
    join auth.users u on u.id = m.user_id
    left join public.project_members pm on pm.project_id = p_project and pm.user_id = m.user_id
    where m.org_id = v_org and (m.role in ('owner','admin','producer') or pm.user_id is not null)
    order by case m.role when 'owner' then 0 when 'admin' then 1 when 'producer' then 2 else 3 end, u.email;
end;
$$;

-- Everyone in the organization (people managers only).
create or replace function public.org_team(p_org uuid)
returns table(user_id uuid, email text, org_role text, projects int, joined_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if coalesce(public.org_role(p_org), '') not in ('owner','admin','producer') then
    raise exception 'AURA-COL-403: only the studio''s owners, admins and producers can see everyone in the studio' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role,
      (select count(*)::int from public.project_members pm where pm.org_id = p_org and pm.user_id = m.user_id),
      m.created_at, u.last_sign_in_at
    from public.org_members m join auth.users u on u.id = m.user_id
    where m.org_id = p_org
    order by case m.role when 'owner' then 0 when 'admin' then 1 when 'producer' then 2 else 3 end, u.email;
end;
$$;

create or replace function public.set_project_member(p_project uuid, p_user uuid, p_role text, p_grants text[])
returns public.project_members
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_target_role text; pm public.project_members; v_before jsonb;
begin
  perform public.gate_write(p_project, 'team', 'administer');
  select org_id into v_org from public.projects where id = p_project;
  if v_org is null then raise exception 'AURA-COL-404: project not found' using errcode = 'P0404'; end if;
  select role into v_target_role from public.org_members where org_id = v_org and user_id = p_user;
  if v_target_role is null then raise exception 'AURA-COL-404: that person isn''t in this studio yet — invite them first' using errcode = 'P0404'; end if;
  if v_target_role in ('owner','admin','producer') then
    raise exception 'AURA-COL-400: that person already has full access through their studio role' using errcode = 'P0400';
  end if;
  if not exists (select 1 from public.project_roles where id = p_role) then raise exception 'AURA-COL-400: unknown role' using errcode = 'P0400'; end if;
  if not public.valid_permission_grants(coalesce(p_grants, '{}')) then raise exception 'AURA-COL-400: unknown permission' using errcode = 'P0400'; end if;
  select to_jsonb(x) into v_before from public.project_members x where project_id = p_project and user_id = p_user;
  insert into public.project_members(project_id, org_id, user_id, role, grants, added_by)
    values (p_project, v_org, p_user, p_role, coalesce(p_grants, '{}'), auth.uid())
  on conflict (project_id, user_id) do update set role = excluded.role, grants = excluded.grants, updated_at = now()
  returning * into pm;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (v_org, auth.uid(), case when v_before is null then 'ProjectMemberAdded' else 'ProjectMemberChanged' end, 'ProjectMember', p_user,
    jsonb_build_object('role', p_role, 'grants', to_jsonb(pm.grants), 'before', v_before -> 'role'), p_project);
  return pm;
end;
$$;

create or replace function public.remove_project_member(p_project uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare pm public.project_members;
begin
  if p_user <> auth.uid() then perform public.gate_write(p_project, 'team', 'administer'); end if;
  delete from public.project_members where project_id = p_project and user_id = p_user returning * into pm;
  if pm.user_id is null then raise exception 'AURA-COL-404: that person isn''t on this project' using errcode = 'P0404'; end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (pm.org_id, auth.uid(), 'ProjectMemberRemoved', 'ProjectMember', p_user, jsonb_build_object('role', pm.role), p_project);
end;
$$;

create or replace function public.set_org_member_role(p_org uuid, p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me text := public.org_role(p_org); v_old text;
begin
  if p_role not in ('owner','admin','producer','member') then raise exception 'AURA-COL-400: unknown studio role' using errcode = 'P0400'; end if;
  select role into v_old from public.org_members where org_id = p_org and user_id = p_user for update;
  if v_old is null then raise exception 'AURA-COL-404: that person isn''t in this studio' using errcode = 'P0404'; end if;
  if coalesce(v_me, '') not in ('owner','admin') or ((p_role = 'owner' or v_old = 'owner') and v_me <> 'owner') then
    raise exception 'AURA-COL-403: only studio owners can change owners, and only owners and admins can change studio roles' using errcode = '42501';
  end if;
  if v_old = 'owner' and p_role <> 'owner' and (select count(*) from public.org_members where org_id = p_org and role = 'owner') = 1 then
    raise exception 'AURA-COL-409: a studio needs at least one owner — make someone else an owner first' using errcode = 'P0409';
  end if;
  update public.org_members set role = p_role where org_id = p_org and user_id = p_user;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (p_org, auth.uid(), 'OrgRoleChanged', 'OrgMember', p_user, jsonb_build_object('from', v_old, 'to', p_role));
end;
$$;

create or replace function public.remove_org_member(p_org uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me text := public.org_role(p_org); v_old text;
begin
  select role into v_old from public.org_members where org_id = p_org and user_id = p_user for update;
  if v_old is null then raise exception 'AURA-COL-404: that person isn''t in this studio' using errcode = 'P0404'; end if;
  if p_user <> auth.uid() and (coalesce(v_me, '') not in ('owner','admin') or (v_old = 'owner' and v_me <> 'owner')) then
    raise exception 'AURA-COL-403: only studio owners and admins can remove people' using errcode = '42501';
  end if;
  if v_old = 'owner' and (select count(*) from public.org_members where org_id = p_org and role = 'owner') = 1 then
    raise exception 'AURA-COL-409: a studio needs at least one owner' using errcode = 'P0409';
  end if;
  delete from public.project_members where org_id = p_org and user_id = p_user;
  delete from public.org_members where org_id = p_org and user_id = p_user;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (p_org, auth.uid(), case when p_user = auth.uid() then 'OrgMemberLeft' else 'OrgMemberRemoved' end, 'OrgMember', p_user, jsonb_build_object('role', v_old));
end;
$$;

-- Invites: the plain token is returned once and only its SHA-256 is stored.
create or replace function public.create_invite(p_org uuid, p_email text, p_org_role text, p_project uuid, p_project_role text, p_grants text[])
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_me text := public.org_role(p_org); v_token text; i public.invites; v_email text := lower(trim(p_email));
begin
  if v_me is null then raise exception 'AURA-COL-403: you''re not in this studio' using errcode = '42501'; end if;
  if p_project is not null and not exists (select 1 from public.projects where id = p_project and org_id = p_org) then
    raise exception 'AURA-COL-404: project not found' using errcode = 'P0404';
  end if;
  if coalesce(p_org_role, 'member') <> 'member' then
    if v_me not in ('owner','admin') then
      raise exception 'AURA-COL-403: only studio owners and admins can invite admins or producers' using errcode = '42501';
    end if;
  else
    if p_project is null or p_project_role is null then
      raise exception 'AURA-COL-400: choose the project and role for this person' using errcode = 'P0400';
    end if;
    perform public.gate_write(p_project, 'team', 'administer');
  end if;
  if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = p_org and lower(u.email) = v_email)
     and coalesce(p_org_role, 'member') <> 'member' then
    raise exception 'AURA-COL-409: that person is already in this studio — change their role instead' using errcode = 'P0409';
  end if;
  update public.invites set revoked_at = now()
    where org_id = p_org and lower(email) = v_email and project_id is not distinct from p_project and accepted_at is null and revoked_at is null;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.invites(org_id, project_id, email, org_role, project_role, grants, token_hash, invited_by)
  values (p_org, p_project, v_email, coalesce(p_org_role, 'member'), p_project_role, coalesce(p_grants, '{}'), encode(digest(v_token, 'sha256'), 'hex'), auth.uid())
  returning * into i;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (p_org, auth.uid(), 'InviteCreated', 'Invite', i.id, jsonb_build_object('org_role', i.org_role, 'project_role', i.project_role), p_project);
  return jsonb_build_object('invite', to_jsonb(i) - 'token_hash', 'token', v_token);
end;
$$;

create or replace function public.revoke_invite(p_invite uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare i public.invites;
begin
  select * into i from public.invites where id = p_invite for update;
  if i.id is null then raise exception 'AURA-COL-404: invite not found' using errcode = 'P0404'; end if;
  if coalesce(public.org_role(i.org_id), '') not in ('owner','admin') and not (i.project_id is not null and public.project_can(i.project_id, 'team', 'administer')) then
    raise exception 'AURA-COL-403: you can''t manage this invite' using errcode = '42501';
  end if;
  if i.accepted_at is not null then raise exception 'AURA-COL-409: this invite was already accepted' using errcode = 'P0409'; end if;
  update public.invites set revoked_at = now() where id = p_invite;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (i.org_id, auth.uid(), 'InviteRevoked', 'Invite', i.id, '{}'::jsonb, i.project_id);
end;
$$;

-- What an invite is for (shown before accepting). Needs the secret token.
create or replace function public.invite_preview(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public, auth, extensions as $$
declare i public.invites; v_status text;
begin
  select * into i from public.invites where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if i.id is null then raise exception 'AURA-COL-404: this invite link isn''t valid' using errcode = 'P0404'; end if;
  v_status := case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked'
                   when i.expires_at < now() then 'expired' else 'pending' end;
  return jsonb_build_object(
    'status', v_status, 'email', i.email, 'org_role', i.org_role, 'project_role', i.project_role,
    'project_role_label', (select label from public.project_roles where id = i.project_role),
    'organization', (select name from public.organizations where id = i.org_id),
    'project', (select title from public.projects where id = i.project_id),
    'project_id', i.project_id,
    'invited_by', (select email from auth.users where id = i.invited_by),
    'expires_at', i.expires_at,
    'email_matches', lower(coalesce(auth.jwt() ->> 'email', '')) = i.email);
end;
$$;

create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare i public.invites; v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'AURA-COL-401: sign in first' using errcode = '42501'; end if;
  select * into i from public.invites where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if i.id is null then raise exception 'AURA-COL-404: this invite link isn''t valid' using errcode = 'P0404'; end if;
  if i.accepted_at is not null then
    if i.accepted_by = auth.uid() then return jsonb_build_object('org_id', i.org_id, 'project_id', i.project_id); end if; -- idempotent
    raise exception 'AURA-COL-409: this invite was already used' using errcode = 'P0409';
  end if;
  if i.revoked_at is not null then raise exception 'AURA-COL-410: this invite was cancelled' using errcode = 'P0410'; end if;
  if i.expires_at < now() then raise exception 'AURA-COL-410: this invite has expired — ask for a new one' using errcode = 'P0410'; end if;
  if v_email <> i.email then
    raise exception 'AURA-COL-403: this invite is for %. Sign in with that email to accept it.', i.email using errcode = '42501';
  end if;
  insert into public.org_members(org_id, user_id, role) values (i.org_id, auth.uid(), i.org_role)
  on conflict (org_id, user_id) do update set role = case
    when public.org_members.role in ('owner','admin') then public.org_members.role
    when excluded.role = 'admin' then 'admin'
    when excluded.role = 'producer' or public.org_members.role = 'producer' then 'producer'
    else 'member' end;
  if i.project_id is not null and i.project_role is not null then
    insert into public.project_members(project_id, org_id, user_id, role, grants, added_by)
    values (i.project_id, i.org_id, auth.uid(), i.project_role, i.grants, i.invited_by)
    on conflict (project_id, user_id) do update set role = excluded.role, grants = excluded.grants, updated_at = now();
  end if;
  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = i.id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (i.org_id, auth.uid(), 'InviteAccepted', 'Invite', i.id, jsonb_build_object('org_role', i.org_role, 'project_role', i.project_role), i.project_id);
  return jsonb_build_object('org_id', i.org_id, 'project_id', i.project_id);
end;
$$;

-- ---------------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------------
revoke execute on function public.audit_project_of(text, uuid) from public, anon, authenticated;
revoke execute on function public.audit_fill_project() from public, anon, authenticated;
revoke execute on function public.gate_write(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.org_role(uuid) from public, anon;
revoke execute on function public.my_admin_org_ids() from public, anon;
revoke execute on function public.my_project_ids() from public, anon;
revoke execute on function public.can_view_project(uuid) from public, anon;
revoke execute on function public.project_can(uuid, text, text) from public, anon;
revoke execute on function public.project_access(uuid) from public, anon;
revoke execute on function public.project_team(uuid) from public, anon;
revoke execute on function public.org_team(uuid) from public, anon;
revoke execute on function public.set_project_member(uuid, uuid, text, text[]) from public, anon;
revoke execute on function public.remove_project_member(uuid, uuid) from public, anon;
revoke execute on function public.set_org_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_org_member(uuid, uuid) from public, anon;
revoke execute on function public.create_invite(uuid, text, text, uuid, text, text[]) from public, anon;
revoke execute on function public.revoke_invite(uuid) from public, anon;
revoke execute on function public.invite_preview(text) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
grant execute on function public.org_role(uuid), public.my_admin_org_ids(), public.my_project_ids(), public.can_view_project(uuid),
  public.project_can(uuid, text, text), public.project_access(uuid), public.project_team(uuid), public.org_team(uuid),
  public.set_project_member(uuid, uuid, text, text[]), public.remove_project_member(uuid, uuid), public.set_org_member_role(uuid, uuid, text),
  public.remove_org_member(uuid, uuid), public.create_invite(uuid, text, text, uuid, text, text[]), public.revoke_invite(uuid),
  public.invite_preview(text), public.accept_invite(text) to authenticated;

-- ---------------------------------------------------------------------------------
-- 8. Permission gates in front of every existing user-callable write function.
--    Bodies are unchanged; they moved to app_private and are reachable only here.
-- ---------------------------------------------------------------------------------
--    Each row: function, how to find its project, module, action (an SQL expression over
--    the function's own parameters). The wrapper keeps the exact signature and result.
do $gate$
declare
  s record; f record; v_names text; v_call text; v_body text;
begin
  for s in select * from (values
    ('save_script_version', 'p_project_id', 'script', '''edit'''),
    ('approve_script_version', 'p_project_id', 'script', '''approve'''),
    ('sync_script_characters', 'p_project_id', 'casting', '''edit'''),
    ('create_character', 'p_project_id', 'casting', '''edit'''),
    ('update_character', '(select project_id from public.characters where id = p_character_id)', 'casting', '''edit'''),
    ('add_character_alias', '(select project_id from public.characters where id = p_character_id)', 'casting', '''edit'''),
    ('merge_characters', '(select project_id from public.characters where id = p_target_id)', 'casting', '''edit'''),
    ('unmerge_character', '(select project_id from public.characters where id = p_source_id)', 'casting', '''edit'''),
    ('set_character_relationship', '(select project_id from public.characters where id = p_a)', 'casting', '''edit'''),
    ('delete_character_relationship', '(select project_id from public.character_relationships where id = p_id)', 'casting', '''edit'''),
    ('save_wardrobe_look', '(select project_id from public.characters where id = p_character_id)', 'casting', '''edit'''),
    ('delete_wardrobe_look', '(select project_id from public.wardrobe_looks where id = p_id)', 'casting', '''edit'''),
    ('sync_dialogue_lines', 'p_project_id', 'dialogue', '''edit'''),
    ('update_dialogue_line', '(select project_id from public.dialogue_lines where id = p_id)', 'dialogue', '''edit'''),
    ('approve_scene_dialogue', 'p_project_id', 'dialogue', '''approve'''),
    ('save_scene_dna', 'p_project_id', 'scene_dna', '''edit'''),
    ('approve_scene_dna', 'p_project_id', 'scene_dna', '''lock'''),
    ('set_scene_dna_drift', '(select project_id from public.scene_dna where id = p_scene_dna_id)', 'scene_dna', '''view'''),
    ('generate_shot_plan', 'p_project_id', 'shots', '''edit'''),
    ('add_shot', 'p_project_id', 'shots', '''edit'''),
    ('update_shot', '(select project_id from public.shots where id = p_id)', 'shots', '''edit'''),
    ('move_shot', '(select project_id from public.shots where id = p_id)', 'shots', '''edit'''),
    ('delete_shot', '(select project_id from public.shots where id = p_id)', 'shots', '''edit'''),
    ('approve_shot_plan', 'p_project_id', 'shots', '''approve'''),
    ('set_shot_plan_review', '(select project_id from public.shot_plans where id = p_plan_id)', 'shots', '''view'''),
    ('create_generation_package', 'p_project_id', 'generation', '''edit'''),
    ('request_takes', '(select project_id from public.generation_packages where id = p_package_id)', 'generation', '''generate'''),
    ('cancel_take', '(select project_id from public.takes where id = p_take_id)', 'generation', '''generate'''),
    ('set_take_approval', '(select project_id from public.takes where id = p_take_id)', 'generation', '''approve'''),
    ('set_package_review', '(select project_id from public.generation_packages where id = p_package_id)', 'generation', '''view'''),
    ('register_asset', 'p_project_id', 'assets', '''create'''),
    ('spot_audio_session', 'p_project_id', 'audio', '''edit'''),
    ('save_audio_clip', '(select project_id from public.audio_sessions where id = p_session_id)', 'audio', '''edit'''),
    ('delete_audio_clip', '(select project_id from public.audio_clips where id = p_clip_id)', 'audio', '''edit'''),
    ('update_audio_track', '(select project_id from public.audio_tracks where id = p_track_id)', 'audio', '''edit'''),
    ('record_audio_measurement', '(select project_id from public.audio_sessions where id = p_session_id)', 'audio', '''edit'''),
    ('approve_audio_session', 'p_project_id', 'audio', '''approve'''),
    ('set_audio_review', '(select project_id from public.audio_sessions where id = p_session_id)', 'audio', '''view'''),
    ('save_timeline', 'p_project_id', 'editorial', 'case when coalesce(p_break_lock, false) then ''lock'' else ''edit'' end'),
    ('save_timeline_version', 'p_project_id', 'editorial', '''edit'''),
    ('lock_picture', 'p_project_id', 'editorial', '''lock'''),
    ('set_timeline_review', 'p_project_id', 'editorial', '''view'''),
    ('create_render', 'p_project_id', 'delivery', '''create'''),
    ('cancel_render', '(select project_id from public.renders where id = p_render_id)', 'delivery', '''create'''),
    ('set_render_review', '(select project_id from public.renders where id = p_render_id)', 'delivery', '''view''')
  ) t(fn, proj, module, act) loop
    select p.oid, pg_get_function_arguments(p.oid) as args, pg_get_function_identity_arguments(p.oid) as iargs,
           pg_get_function_result(p.oid) as res, p.proretset
      into f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = s.fn;
    if f.oid is null then raise exception 'gate: public.% not found', s.fn; end if;
    select string_agg(split_part(trim(a), ' ', 1), ', ') into v_names from unnest(string_to_array(f.iargs, ',')) a;
    v_call := format('app_private.%I(%s)', s.fn, v_names);
    v_body := case when f.res = 'void' then format('perform %s;', v_call)
                   when f.proretset then format('return query select * from %s;', v_call)
                   else format('return %s;', v_call) end;
    execute format('alter function public.%I(%s) set schema app_private', s.fn, f.iargs);
    execute format('revoke all on function app_private.%I(%s) from public, anon, authenticated', s.fn, f.iargs);
    execute format($f$create function public.%I(%s) returns %s
language plpgsql security definer set search_path = public as $w$
begin
  perform public.gate_write(%s, %L, %s);
  %s
end;
$w$$f$, s.fn, f.args, f.res, s.proj, s.module, s.act, v_body);
    execute format('revoke execute on function public.%I(%s) from public, anon', s.fn, f.iargs);
    execute format('grant execute on function public.%I(%s) to authenticated', s.fn, f.iargs);
  end loop;
end $gate$;
