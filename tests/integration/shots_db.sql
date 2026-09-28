-- Integration test for migration 0012 (Storyboard & Shots). Rolled back; expected results at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(step text, ok text) on commit drop;
do $$
declare o public.organizations; p uuid; v1 public.script_versions; sc uuid; dv public.scene_dna_versions; dv2 public.scene_dna_versions;
  pl public.shot_plans; s public.shots; s2 public.shots; pv public.shot_plan_versions; n int;
  shot1 jsonb := '{"purpose":"establishing","size":"WS","duration_seconds":4,"description":"Wide of the harbour","story_start":0,"story_end":4}';
  shot2 jsonb := '{"purpose":"dialogue","size":"MCU","lens_mm":50,"duration_seconds":3,"description":"Tunde: You came.","story_start":4,"story_end":7,"character_ids":["55555555-5555-4555-8555-555555555555"]}';
begin
  o := public.create_organization('T','t-shots');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v1.id, '[{"number":1,"heading":"EXT. HARBOUR","int_ext":"EXT","location":"HARBOUR","time_of_day":"NIGHT","speaking_characters":[],"estimated_seconds":7,"element_start":0,"element_end":1,"content_hash":"h"}]', 'e');
  select id into sc from public.scenes where project_id = p and number = 1;
  begin perform public.generate_shot_plan(p, sc, gen_random_uuid(), jsonb_build_array(shot1), 'shot@1'); insert into r values ('refused before Scene DNA lock', 'NO');
  exception when others then insert into r values ('refused before Scene DNA lock', sqlerrm); end;
  dv := public.approve_scene_dna(p, sc, '{}', '[]', 'sdna@1');
  pl := public.generate_shot_plan(p, sc, dv.id, jsonb_build_array(shot1, shot2), 'shot@1');
  insert into r select 'generate', pl.status || ' / ' || count(*) || ' shots / from locked version: ' || (pl.scene_dna_version_id = dv.id)::text from public.shots where plan_id = pl.id;
  begin perform public.generate_shot_plan(p, sc, dv.id, jsonb_build_array(shot1), 'shot@1'); insert into r values ('regenerate needs confirmation', 'NO');
  exception when others then insert into r values ('regenerate needs confirmation', sqlerrm); end;
  begin perform public.add_shot(p, sc, '{"purpose":"dialogue","size":"HUGE","duration_seconds":1,"description":"x","story_start":0,"story_end":1}'); insert into r values ('bad size refused', 'NO');
  exception when others then insert into r values ('bad size refused', 'yes'); end;
  s := public.add_shot(p, sc, '{"purpose":"insert","size":"INSERT","duration_seconds":1,"description":"Phone screen","story_start":5,"story_end":6}', 1);
  insert into r select 'insert after shot 1', string_agg(ordinal || ':' || size, ',' order by ordinal) from public.shots where plan_id = pl.id;
  s := public.move_shot(s.id, 1);
  insert into r select 'move down', string_agg(ordinal || ':' || size, ',' order by ordinal) from public.shots where plan_id = pl.id;
  s := public.update_shot(s.id, '{"angle":"high","notes":"Cell glow only"}');
  insert into r values ('update', s.angle || ' / ' || s.notes);
  pv := public.approve_shot_plan(p, sc, '{"coverage":1,"engine_version":"1.0.0"}');
  select * into pl from public.shot_plans where id = pl.id;
  insert into r values ('approve v1', pl.status || ' / v' || pv.version_number || ' / ' || jsonb_array_length(pv.shots) || ' shots snapshotted');
  n := public.delete_shot(s.id);
  select * into pl from public.shot_plans where id = pl.id;
  insert into r select 'delete reopens draft, snapshot kept', pl.status || ' / ' || count(*) || ' live / snapshot ' || (select jsonb_array_length(shots) from public.shot_plan_versions where id = pv.id) from public.shots where plan_id = pl.id;
  pl := public.set_shot_plan_review(pl.id, 'stale', 'Scene DNA locked again as version 2');
  pl := public.set_shot_plan_review(pl.id, 'stale', 'Scene DNA locked again as version 2');
  insert into r select 'review state idempotent', pl.review_state || ' / audit rows ' || count(*) from public.audit_events where object_id = pl.id and action = 'UpstreamVersionChanged';
  dv2 := public.approve_scene_dna(p, sc, '{}', '[]', 'sdna@1');
  begin perform public.approve_shot_plan(p, sc, '{}'); insert into r values ('approve refused after Scene DNA re-lock', 'NO');
  exception when others then insert into r values ('approve refused after Scene DNA re-lock', sqlerrm); end;
  pl := public.generate_shot_plan(p, sc, dv2.id, jsonb_build_array(shot1), 'shot@1', true);
  insert into r select 'regenerate from v2 (confirmed)', pl.review_state || ' / ' || count(*) || ' shots / versions kept ' || (select count(*) from public.shot_plan_versions where plan_id = pl.id) from public.shots where plan_id = pl.id;
  insert into r select 'audit + jobs', (select string_agg(distinct action, ',') from public.audit_events where org_id = o.id and (action like 'Shot%')) || ' | jobs ' || (select count(*) from public.jobs where project_id = p and engine_id like 'cinematography.%');
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  insert into r select 'outsider sees', count(*)::text from public.shots where project_id = p;
  begin perform public.add_shot(p, sc, shot1); insert into r values ('outsider add blocked', 'NO');
  exception when others then insert into r values ('outsider add blocked', sqlerrm); end;
end $$;
select * from r;
rollback;
-- Expected (verified live 2026-09-27):
-- refused before Scene DNA lock          | AURA-SHOT-412: lock this scene's Scene DNA first — shots are planned from a locked version
-- generate                               | draft / 2 shots / from locked version: true
-- regenerate needs confirmation          | AURA-SHOT-409: this scene already has 2 shots — confirm to replace them
-- bad size refused                       | yes
-- insert after shot 1                    | 1:WS,2:INSERT,3:MCU
-- move down                              | 1:WS,2:MCU,3:INSERT
-- update                                 | high / Cell glow only
-- approve v1                             | approved / v1 / 3 shots snapshotted
-- delete reopens draft, snapshot kept    | draft / 2 live / snapshot 3
-- review state idempotent                | stale / audit rows 1
-- approve refused after Scene DNA re-lock| AURA-SHOT-412: Scene DNA changed since these shots were planned — review them first
-- regenerate from v2 (confirmed)         | current / 1 shots / versions kept 1
-- audit + jobs                           | ShotAdded,ShotDeleted,ShotMoved,ShotPlanApproved,ShotPlanGenerated,ShotUpdated | jobs 3
-- outsider sees                          | 0
-- outsider add blocked                   | AURA-COL-403: you don't have access to this project (permission gate, migration 0019)
