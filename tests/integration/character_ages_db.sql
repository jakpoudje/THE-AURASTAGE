-- Integration test for migration 0035 (character ages: Casting age states, reference views per age, age per scene in
-- Scene DNA). Rolled back; expected results at the bottom.
-- People: O owns the studio; W is a Writer (casting: view only) on project A; X is an outsider.
begin;
insert into auth.users(id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111','owner@aurastage.invalid','authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','writer@aurastage.invalid','authenticated','authenticated');
create temp table r(n serial, step text, ok text);
create temp table ids(k text primary key, v uuid);
grant all on r, ids to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
create or replace function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', case p when 'O' then '11111111-1111-1111-1111-111111111111'
    when 'X' then '22222222-2222-2222-2222-222222222222' else '33333333-3333-3333-3333-333333333333' end, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;
select pg_temp.as_user('O');
do $$
declare o public.organizations; a uuid; v public.script_versions; s public.scripts;
begin
  o := public.create_organization('T','t-char-ages');
  insert into public.projects(org_id,title) values (o.id,'A') returning id into a;
  v := public.save_script_version(a, null, 'x', '[]'::jsonb, 'p', 'first');
  s := public.approve_script_version(a, v.id, '[{"number":1,"heading":"EXT. YARD - DAY (FLASHBACK)","int_ext":"EXT","location":"YARD","time_of_day":"DAY","speaking_characters":[],"estimated_seconds":20,"element_start":0,"element_end":2,"content_hash":"h1"}]', 'e@1');
  insert into ids values ('org', o.id), ('a', a), ('scene', (select id from public.scenes where project_id = a));
end $$;
reset role;
insert into public.characters(org_id, project_id, name, age) select (select v from ids where k = 'org'), v, 'Amara Bello', '32' from ids where k = 'a';
insert into ids select 'amara', id from public.characters where name = 'Amara Bello' and project_id = (select v from ids where k = 'a');
insert into public.characters(org_id, project_id, name) select (select v from ids where k = 'org'), v, 'Tunde' from ids where k = 'a';
insert into ids select 'tunde', id from public.characters where name = 'Tunde' and project_id = (select v from ids where k = 'a');
insert into public.org_members(org_id, user_id, role) select v, '33333333-3333-3333-3333-333333333333', 'member' from ids where k = 'org';
insert into public.project_members(project_id, org_id, user_id, role) select (select v from ids where k = 'a'), v, '33333333-3333-3333-3333-333333333333', 'writer' from ids where k = 'org';
set local role authenticated;

select pg_temp.as_user('O');
do $$
declare ch uuid := (select v from ids where k = 'amara'); st public.character_age_states; t_st public.character_age_states; g public.character_reference_images; d public.scene_dna;
begin
  st := public.save_character_age_state(null, ch, ' Flashback, 1995 ', '10', 'Braided hair, no scar yet');
  insert into ids values ('st', st.id);
  insert into r(step, ok) values ('age saved (trimmed)', st.label || ' / ' || st.age || ' / ' || st.description);
  st := public.save_character_age_state(st.id, ch, 'Flashback, 1995', '11', '');
  insert into r(step, ok) values ('age edited; empty description cleared', st.age || ' / ' || coalesce(st.description, 'null'));
  begin perform public.save_character_age_state(null, ch, 'flashback, 1995', '9', null); insert into r(step, ok) values ('same name refused', 'NO');
  exception when others then insert into r(step, ok) values ('same name refused', sqlerrm); end;
  begin perform public.save_character_age_state(null, ch, 'Older', ' ', null); insert into r(step, ok) values ('empty age refused', 'NO');
  exception when others then insert into r(step, ok) values ('empty age refused', sqlerrm); end;
  t_st := public.save_character_age_state(null, (select v from ids where k = 'tunde'), 'Young', '12', null);
  insert into ids values ('t_st', t_st.id);
  g := public.request_character_reference(ch, null, 'front', 'CU', '1:1', 'Amara at 11', '{}', 'h', 'aurastage-sketch', 'sketch-v1', 'native', 1, '{}', '1.1.0', st.id);
  insert into ids values ('ref', g.id);
  insert into r(step, ok) values ('reference view for that age', (g.age_state_id = st.id)::text || ' / job ' || ((select input_snapshot->>'age_state_id' from public.jobs where id = g.job_id) = st.id::text)::text);
  g := public.request_character_reference(ch, null, 'front', 'MS', '1:1', 'Amara now', '{}', 'h', 'aurastage-sketch', 'sketch-v1', 'native', 1, '{}', '1.1.0');
  insert into r(step, ok) values ('without an age it is the profile age (old call still works)', coalesce(g.age_state_id::text, 'null'));
  begin perform public.request_character_reference(ch, null, 'front', 'CU', '1:1', 'x', '{}', 'h', 'aurastage-sketch', 'sketch-v1', 'native', 1, '{}', '1.1.0', t_st.id); insert into r(step, ok) values ('another character''s age refused', 'NO');
  exception when others then insert into r(step, ok) values ('another character''s age refused', sqlerrm); end;
  d := public.save_scene_dna((select v from ids where k = 'a'), (select v from ids where k = 'scene'), jsonb_build_object('ages', jsonb_build_object(ch, st.id)));
  insert into r(step, ok) values ('Scene DNA keeps the age for the scene', ((d.ages->>ch::text) = st.id::text)::text || ' / ' || d.status);
  d := public.save_scene_dna((select v from ids where k = 'a'), (select v from ids where k = 'scene'), '{"purpose":"Where it began"}');
  insert into r(step, ok) values ('other edits leave the ages alone', (d.ages ? ch::text)::text);
  begin perform public.save_scene_dna((select v from ids where k = 'a'), (select v from ids where k = 'scene'), '{"ages":["x"]}'); insert into r(step, ok) values ('ages that aren''t a map refused', 'NO');
  exception when others then insert into r(step, ok) values ('ages that aren''t a map refused', sqlerrm); end;
end $$;

select pg_temp.as_user('W');
do $$ begin
  begin perform public.save_character_age_state(null, (select v from ids where k = 'amara'), 'Old', '80', null); insert into r(step, ok) values ('writer can''t add ages', 'NO');
  exception when others then insert into r(step, ok) values ('writer can''t add ages', sqlerrm); end;
  insert into r(step, ok) values ('writer sees the ages', (select count(*)::text from public.character_age_states));
end $$;
select pg_temp.as_user('X');
do $$ begin
  begin perform public.delete_character_age_state((select v from ids where k = 'st')); insert into r(step, ok) values ('outsider can''t remove an age', 'NO');
  exception when others then insert into r(step, ok) values ('outsider can''t remove an age', sqlerrm); end;
  insert into r(step, ok) values ('outsider sees nothing', (select count(*)::text from public.character_age_states));
end $$;

select pg_temp.as_user('O');
do $$ begin
  perform public.delete_character_age_state((select v from ids where k = 'st'));
  insert into r(step, ok) values ('removing an age keeps its reference view', (select coalesce(age_state_id::text, 'age cleared') from public.character_reference_images where id = (select v from ids where k = 'ref')));
  insert into r(step, ok) values ('audit', (select string_agg(distinct action, ',' order by action) from public.audit_events where org_id = (select v from ids where k = 'org') and action like 'CharacterAge%'));
end $$;
reset role;
select string_agg(n || '. ' || step || ': ' || ok, E'\n' order by n) as results from r;
rollback;
-- Expected:
-- 1. age saved (trimmed): Flashback, 1995 / 10 / Braided hair, no scar yet
-- 2. age edited; empty description cleared: 11 / null
-- 3. same name refused: AURA-CHR-409: this character already has an age with that name
-- 4. empty age refused: AURA-CHR-400: an age needs a name and an age
-- 5. reference view for that age: true / job true
-- 6. without an age it is the profile age (old call still works): null
-- 7. another character's age refused: AURA-CHR-400: that age isn't this character's
-- 8. Scene DNA keeps the age for the scene: true / draft
-- 9. other edits leave the ages alone: true
-- 10. ages that aren't a map refused: AURA-SDNA-400: ages must map characters to ages
-- 11. writer can't add ages: AURA-COL-403: your role (Writer) can't edit in Casting & Characters. Ask the project's producer for access.
-- 12. writer sees the ages: 2
-- 13. outsider can't remove an age: AURA-COL-403: you don't have access to this project
-- 14. outsider sees nothing: 0
-- 15. removing an age keeps its reference view: age cleared
-- 16. audit: CharacterAgeDeleted,CharacterAgeSaved
