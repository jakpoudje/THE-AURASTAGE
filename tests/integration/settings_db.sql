-- Integration test for migration 0023 (Project Settings + monthly paid-take cap). Rolled back; expected results at the bottom.
begin;
insert into auth.users(id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111','owner@aurastage.invalid','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','writer@aurastage.invalid','authenticated','authenticated');
create temp table r(n serial, step text, ok text);
create temp table ids(k text primary key, v uuid);
grant all on r, ids to authenticated;
grant usage on sequence r_n_seq to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
declare o public.organizations; p uuid; v1 public.script_versions; sc uuid; dv public.scene_dna_versions; pv public.shot_plan_versions; sh1 uuid;
  pkg public.generation_packages; s public.project_settings; s2 public.project_settings;
begin
  o := public.create_organization('T','t-settings');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v1.id, '[{"number":1,"heading":"EXT. HARBOUR","int_ext":"EXT","location":"HARBOUR","time_of_day":"NIGHT","speaking_characters":[],"estimated_seconds":4,"element_start":0,"element_end":1,"content_hash":"h"}]', 'e');
  select id into sc from public.scenes where project_id = p;
  dv := public.approve_scene_dna(p, sc, '{}', '[]', 'sdna@1');
  perform public.generate_shot_plan(p, sc, dv.id, '[{"purpose":"establishing","size":"WS","duration_seconds":2,"description":"Wide","story_start":0,"story_end":2}]', 'shot@1');
  pv := public.approve_shot_plan(p, sc, '{"coverage":1}');
  select id into sh1 from public.shots where scene_id = sc and ordinal = 1;
  pkg := public.create_generation_package(p, sc, sh1, pv.id, '{"prompt":"Wide"}', 'gen@1');
  insert into ids values ('org', o.id), ('p', p), ('pkg', pkg.id);

  s := public.save_project_settings(p, null, '{"generation":{"monthly_paid_take_limit":1}}', array['generation.monthly_paid_take_limit']);
  insert into r(step, ok) values ('first save is version 1', s.version_number::text);
  begin perform public.save_project_settings(p, null, '{}', '{}'); insert into r(step, ok) values ('stale save refused', 'NO');
  exception when others then insert into r(step, ok) values ('stale save refused', sqlerrm); end;
  s2 := public.save_project_settings(p, s.revision, '{"generation":{"monthly_paid_take_limit":1},"technical":{"loudness_standard":"streaming"}}', array['technical.loudness_standard']);
  insert into r(step, ok) values ('versions kept', (select string_agg(version_number || ':' || array_to_string(changed, ','), ' | ' order by version_number) from public.project_settings_versions where project_id = p));
  perform public.request_takes(pkg.id, 'aurastage-sketch', 'sketch-v1', 'image', '{}', 1, 1, null, null);
  insert into r(step, ok) values ('sketch takes are never capped', public.paid_takes_this_month(p)::text || ' paid used');
end $$;
reset role;
-- One paid take already this month (as if made by the worker).
insert into public.takes(org_id, project_id, scene_id, package_id, shot_id, take_number, provider, model, capability, params, status)
select g.org_id, g.project_id, g.scene_id, g.id, g.shot_id, 99, 'runway', 'gen4', 'image', '{}', 'succeeded' from public.generation_packages g where g.id = (select v from ids where k = 'pkg');
insert into public.org_members(org_id, user_id, role) select v, '33333333-3333-3333-3333-333333333333', 'member' from ids where k = 'org';
insert into public.project_members(project_id, org_id, user_id, role) select (select v from ids where k = 'p'), v, '33333333-3333-3333-3333-333333333333', 'writer' from ids where k = 'org';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  begin perform public.request_takes((select v from ids where k = 'pkg'), 'runway', 'gen4', 'image', '{}', 1, 1, null, null); insert into r(step, ok) values ('paid take over the cap refused', 'NO');
  exception when others then insert into r(step, ok) values ('paid take over the cap refused', sqlerrm); end;
end $$;
select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$ begin
  insert into r(step, ok) values ('a Writer reads the settings', (select settings #>> '{technical,loudness_standard}' from public.project_settings where project_id = (select v from ids where k = 'p')));
  begin perform public.save_project_settings((select v from ids where k = 'p'), (select revision from public.project_settings where project_id = (select v from ids where k = 'p')), '{}', '{}');
    insert into r(step, ok) values ('a Writer can''t change them', 'NO');
  exception when others then insert into r(step, ok) values ('a Writer can''t change them', sqlerrm); end;
end $$;
do $x$ begin raise exception 'RESULTS: %', (select string_agg(step || ' => ' || ok, ' || ' order by n) from r); end $x$;

-- Expected:
-- first save is version 1               | 1
-- stale save refused                    | AURA-SET-409: someone changed the settings since you opened them — reload to see their version
-- versions kept                         | 1:generation.monthly_paid_take_limit | 2:technical.loudness_standard
-- sketch takes are never capped         | 0 paid used
-- paid take over the cap refused        | AURA-GEN-402: this project's monthly limit of 1 paid takes is reached (1 used this month). ...
-- a Writer reads the settings           | streaming
-- a Writer can't change them            | AURA-COL-403: your role (Writer) can't edit in Project Settings. ...
