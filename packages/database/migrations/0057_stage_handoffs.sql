-- Production hand-offs (owner request 2026-10-02: "if a step needed to be completed for another member to work on their
-- parts … assigned team members get a notification on the completed stage which allows them to now work on their section").
--
-- How it works, following how a production office runs department hand-offs:
--   * Each stage has owners (Team page → Stage owners): e.g. the editor owns Editorial, the sound designer Audio Studio.
--     With no owner set, the project's members whose role works on that stage are told instead (never the whole studio).
--   * When a scene clears a stage, the owners of the stage(s) that now can start on it are notified, with a link:
--       script approved            → Casting, Locations & Props, Dialogue (the whole film)
--       a scene's dialogue approved → Scene DNA
--       a scene's Scene DNA locked → Storyboard & Shots
--       a scene's shot plan approved → Visual Generation and Audio Studio (sound is spotted from the shot timing)
--       every shot of a scene has an approved take → Editorial (picture)
--       a scene's mix approved     → Editorial (sound)
--       Picture Lock               → Export & Deliver (the whole film)
--   * Hand-offs are grouped: while a person hasn't read it, one notification per stage collects the scenes
--     ("Scenes 3, 4 and 7 are ready for Visual Generation"), so a one-click run over 69 scenes is one message, not 69.
--   * The person who did the work is never notified about their own work. A notification never blocks the work: if one
--     can't be written, the approval still goes through (a warning is logged).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('mention','reply','task_assigned','review_requested','task_done','stage_ready'));
alter table public.notifications add column if not exists meta jsonb;

-- One row per stage: its owners, as a list (assigning replaces the list).
create table if not exists public.project_stage_owners (
  project_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  stage text not null check (stage in ('casting','world','dialogue','scene_dna','storyboard','visual','audio','editorial','delivery')),
  user_ids uuid[] not null default '{}' check (cardinality(user_ids) <= 20),
  assigned_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (project_id, stage)
);
alter table public.project_stage_owners enable row level security;
create policy project_stage_owners_select on public.project_stage_owners for select to authenticated using (public.can_view_project(project_id));
revoke all on public.project_stage_owners from anon, authenticated;
grant select on public.project_stage_owners to authenticated;

create or replace function app_private.stage_info(p_stage text, out label text, out module text, out path text)
language sql immutable as $$
  select x.label, x.module, x.path from (values
    ('casting', 'Casting & Characters', 'casting', 'casting'), ('world', 'Locations & Props', 'scene_dna', 'world'),
    ('dialogue', 'Dialogue Intelligence', 'dialogue', 'dialogue'), ('scene_dna', 'Scene DNA', 'scene_dna', 'scene-dna'),
    ('storyboard', 'Storyboard & Shots', 'shots', 'storyboard'), ('visual', 'Visual Generation', 'generation', 'visual'),
    ('audio', 'Audio Studio', 'audio', 'audio'), ('editorial', 'Editorial & Timeline', 'editorial', 'editorial'),
    ('delivery', 'Export & Deliver', 'delivery', 'export')) x(stage, label, module, path)
  where x.stage = p_stage
$$;

-- Who hears that a stage can start: its owners, or else the project's members whose role edits that stage.
create or replace function app_private.stage_recipients(p_project uuid, p_stage text)
returns setof uuid language sql stable security definer set search_path = public as $$
  with owners as (select unnest(user_ids) as user_id from public.project_stage_owners where project_id = p_project and stage = p_stage)
  select user_id from owners
  union
  select pm.user_id from public.project_members pm
    join public.project_roles r on r.id = pm.role
    join public.org_members om on om.org_id = pm.org_id and om.user_id = pm.user_id
   where pm.project_id = p_project and not exists (select 1 from owners)
     and (coalesce(r.permissions->(app_private.stage_info(p_stage)).module, '[]'::jsonb) ? 'edit'
          or coalesce(r.permissions->'*', '[]'::jsonb) ? 'edit'
          or ((app_private.stage_info(p_stage)).module || ':edit') = any(pm.grants))
$$;

-- One grouped "ready for you" notification per person and stage (scene numbers collected while it is unread).
create or replace function app_private.notify_stage(p_project uuid, p_actor uuid, p_stage text, p_scene int, p_what text, p_source uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; s record; u uuid; n public.notifications; v_scenes int[]; v_title text; v_list text; v_who text;
begin
  select org_id into v_org from public.projects where id = p_project;
  if v_org is null then return; end if;
  s := app_private.stage_info(p_stage);
  if s.label is null then return; end if;
  select split_part(email::text, '@', 1) into v_who from auth.users where id = p_actor;
  for u in select * from app_private.stage_recipients(p_project, p_stage) loop
    continue when u = p_actor;
    -- Still able to see the project (studio full-rights role or project member).
    continue when not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = u and m.role in ('owner','admin','producer'))
      and not exists (select 1 from public.project_members pm join public.org_members m on m.org_id = pm.org_id and m.user_id = pm.user_id where pm.project_id = p_project and pm.user_id = u);
    select * into n from public.notifications where user_id = u and project_id = p_project and kind = 'stage_ready' and source_type = 'Stage:' || p_stage
      and read_at is null and created_at > now() - interval '12 hours' order by created_at desc limit 1 for update;
    v_scenes := case when p_scene is null then coalesce(array(select jsonb_array_elements_text(n.meta->'scenes')::int), '{}')
      else (select array_agg(distinct x order by x) from unnest(coalesce(array(select jsonb_array_elements_text(n.meta->'scenes')::int), '{}') || p_scene) x) end;
    v_list := case when coalesce(array_length(v_scenes, 1), 0) = 0 then null
      when array_length(v_scenes, 1) = 1 then 'Scene ' || v_scenes[1] || ' is'
      when array_length(v_scenes, 1) <= 8 then 'Scenes ' || array_to_string(v_scenes[1:array_length(v_scenes, 1) - 1], ', ') || ' and ' || v_scenes[array_length(v_scenes, 1)] || ' are'
      else array_length(v_scenes, 1) || ' scenes (' || array_to_string(v_scenes[1:6], ', ') || ' …) are' end;
    v_title := left(coalesce(v_list || ' ready for ' || s.label, s.label || ' can start'), 200);
    if n.id is not null then
      update public.notifications set title = v_title, body = left(p_what || coalesce(' — by ' || v_who, ''), 300), created_at = now(), actor_id = p_actor,
        meta = jsonb_build_object('stage', p_stage, 'scenes', to_jsonb(v_scenes)) where id = n.id;
    else
      insert into public.notifications(user_id, org_id, project_id, kind, title, body, link, source_type, source_id, actor_id, meta)
      values (u, v_org, p_project, 'stage_ready', v_title, left(p_what || coalesce(' — by ' || v_who, ''), 300), '/projects/' || p_project || '/' || s.path,
        'Stage:' || p_stage, p_source, p_actor, jsonb_build_object('stage', p_stage, 'scenes', to_jsonb(v_scenes)));
    end if;
  end loop;
end;
$$;

-- The production events that hand work on to the next stage.
create or replace function app_private.on_audit_handoff() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_project uuid := new.project_id; v_scene uuid; v_num int; v_shots int; v_approved int; v_pv uuid;
begin
  begin
    if new.action = 'ScriptApproved' then
      if v_project is null then select project_id into v_project from public.scripts where id = new.object_id; end if;
      perform app_private.notify_stage(v_project, new.actor_id, st, null, 'The script is approved — your stage can start', new.object_id)
        from unnest(array['casting', 'world', 'dialogue']) st;
    elsif new.action = 'SceneDialogueApproved' then
      select project_id, number into v_project, v_num from public.scenes where id = new.object_id;
      perform app_private.notify_stage(v_project, new.actor_id, 'scene_dna', v_num, 'Dialogue approved', new.object_id);
    elsif new.action = 'SceneDNAApproved' then
      select s.project_id, s.number into v_project, v_num from public.scene_dna d join public.scenes s on s.id = d.scene_id where d.id = new.object_id;
      perform app_private.notify_stage(v_project, new.actor_id, 'storyboard', v_num, 'Scene DNA locked', new.object_id);
    elsif new.action = 'ShotPlanApproved' then
      select s.project_id, s.number into v_project, v_num from public.shot_plans p join public.scenes s on s.id = p.scene_id where p.id = new.object_id;
      perform app_private.notify_stage(v_project, new.actor_id, st, v_num, 'Shot plan approved', new.object_id) from unnest(array['visual', 'audio']) st;
    elsif new.action = 'TakeApproved' then
      select t.scene_id, s.project_id, s.number into v_scene, v_project, v_num from public.takes t join public.scenes s on s.id = t.scene_id where t.id = new.object_id;
      select approved_version_id into v_pv from public.shot_plans where scene_id = v_scene;
      select jsonb_array_length(coalesce(shots, '[]'::jsonb)) into v_shots from public.shot_plan_versions where id = v_pv;
      select count(distinct t.shot_id) into v_approved from public.takes t
        where t.scene_id = v_scene and t.approval = 'approved'
          and t.shot_id in (select (x->>'id')::uuid from public.shot_plan_versions v, jsonb_array_elements(v.shots) x where v.id = v_pv);
      if coalesce(v_shots, 0) > 0 and v_approved >= v_shots then
        perform app_private.notify_stage(v_project, new.actor_id, 'editorial', v_num, 'Every shot has an approved take', v_scene);
      end if;
    elsif new.action = 'AudioSessionApproved' then
      select s.project_id, s.number into v_project, v_num from public.audio_sessions a join public.scenes s on s.id = a.scene_id where a.id = new.object_id;
      perform app_private.notify_stage(v_project, new.actor_id, 'editorial', v_num, 'Scene mix approved', new.object_id);
    elsif new.action = 'PictureLocked' then
      if v_project is null then select project_id into v_project from public.timelines where id = new.object_id; end if;
      perform app_private.notify_stage(v_project, new.actor_id, 'delivery', null, 'Picture Lock ' || coalesce(new.metadata->>'lock_number', '') || ' — the cut is ready to render and deliver', new.object_id);
    end if;
  exception when others then
    raise warning 'AURA-COL-HANDOFF: hand-off notification skipped for % %: %', new.action, new.object_id, sqlerrm;
  end;
  return null;
end;
$$;
create trigger trg_audit_handoff after insert on public.audit_events
  for each row when (new.action in ('ScriptApproved','SceneDialogueApproved','SceneDNAApproved','ShotPlanApproved','TakeApproved','AudioSessionApproved','PictureLocked'))
  execute function app_private.on_audit_handoff();

-- Assign a stage's owners (Team page): the new list replaces the old one. Team administrators decide; owners must be on
-- the project. An empty list hands the stage back to "members whose role edits it".
create or replace function public.set_stage_owners(p_project uuid, p_stage text, p_users uuid[])
returns uuid[] language plpgsql security definer set search_path = public as $$
declare v_org uuid; u uuid; v uuid[] := array(select distinct x from unnest(coalesce(p_users, '{}')) x);
begin
  perform public.gate_write(p_project, 'team', 'administer');
  select org_id into v_org from public.projects where id = p_project;
  if (app_private.stage_info(p_stage)).label is null then raise exception 'AURA-COL-400: unknown stage' using errcode = 'P0400'; end if;
  foreach u in array v loop
    if not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = u and m.role in ('owner','admin','producer'))
       and not exists (select 1 from public.project_members pm where pm.project_id = p_project and pm.user_id = u) then
      raise exception 'AURA-COL-400: that person isn''t on this project' using errcode = 'P0400';
    end if;
  end loop;
  insert into public.project_stage_owners(project_id, org_id, stage, user_ids, assigned_by, updated_at)
  values (p_project, v_org, p_stage, v, auth.uid(), now())
  on conflict (project_id, stage) do update set user_ids = excluded.user_ids, assigned_by = excluded.assigned_by, updated_at = now();
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'StageOwnersSet', 'Project', p_project, jsonb_build_object('stage', p_stage, 'owners', cardinality(v)));
  return v;
end;
$$;
revoke execute on function public.set_stage_owners(uuid, text, uuid[]) from public, anon;
grant execute on function public.set_stage_owners(uuid, text, uuid[]) to authenticated;
revoke all on function app_private.stage_info(text), app_private.stage_recipients(uuid, text), app_private.notify_stage(uuid, uuid, text, int, text, uuid) from public, anon, authenticated;
