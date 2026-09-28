-- Integration test for migration 0010 (Dialogue Intelligence). Rolled back; expected results at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(step text, ok text) on commit drop;
do $$
declare o public.organizations; p uuid; v1 public.script_versions; v2 public.script_versions; s jsonb; l public.dialogue_lines; sc uuid; n int;
  scenes jsonb := '[{"number":1,"heading":"INT. A","int_ext":"INT","location":"A","time_of_day":null,"speaking_characters":[],"estimated_seconds":1,"element_start":0,"element_end":9,"content_hash":"h1"}]';
begin
  o := public.create_organization('T','t-dialogue');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v1.id, scenes, 'e');
  s := public.sync_dialogue_lines(p, v1.id, '[
    {"scene_number":1,"ordinal":1,"speaker_name":"TUNDE","speaker_key":"TUNDE","extensions":[],"text":"They buried it.","text_hash":"a1","element_index":1,"estimated_seconds":1.2,"listener_ids":[]},
    {"scene_number":1,"ordinal":2,"speaker_name":"AMARA","speaker_key":"AMARA","extensions":["V.O."],"text":"You came.","text_hash":"b1","element_index":3,"estimated_seconds":0.8,"listener_ids":[]},
    {"scene_number":1,"ordinal":3,"speaker_name":"TUNDE","speaker_key":"TUNDE","extensions":[],"text":"I always do.","text_hash":"c1","element_index":5,"estimated_seconds":1.2,"listener_ids":[]}]', 'd@1');
  insert into r values ('first sync', (s->>'created') || ' created');
  select id into sc from public.scenes where project_id = p and number = 1;
  -- Annotate line 1 (Tunde), approve line 2, leave line 3 alone.
  select * into l from public.dialogue_lines where project_id = p and text_hash = 'a1';
  l := public.update_dialogue_line(l.id, '{"intention":"confess","emotion":"tension","intensity":7}');
  insert into r values ('annotate', l.intention || '/' || l.emotion || '/' || l.intensity || '/' || l.approval);
  select * into l from public.dialogue_lines where project_id = p and text_hash = 'b1';
  l := public.update_dialogue_line(l.id, '{"approval":"approved"}');
  begin perform public.update_dialogue_line(l.id, '{"emotion":"rage"}'); insert into r values ('bad emotion refused', 'NO');
  exception when others then insert into r values ('bad emotion refused', 'yes'); end;
  -- v2: line 1 edited, line 2 unchanged (moved to ordinal 3), line 3 removed, a new line inserted.
  v2 := public.save_script_version(p, v1.id, 'y', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v2.id, scenes, 'e');
  begin perform public.sync_dialogue_lines(p, v1.id, '[]', 'd@1'); insert into r values ('stale version refused', 'NO');
  exception when others then insert into r values ('stale version refused', sqlerrm); end;
  s := public.sync_dialogue_lines(p, v2.id, '[
    {"scene_number":1,"ordinal":1,"speaker_name":"TUNDE","speaker_key":"TUNDE","extensions":[],"text":"They buried it deep.","text_hash":"a2","element_index":1,"estimated_seconds":1.6,"listener_ids":[]},
    {"scene_number":1,"ordinal":2,"speaker_name":"RAMOS","speaker_key":"RAMOS","extensions":[],"text":"Freeze.","text_hash":"n1","element_index":3,"estimated_seconds":0.4,"listener_ids":[]},
    {"scene_number":1,"ordinal":3,"speaker_name":"AMARA","speaker_key":"AMARA","extensions":["V.O."],"text":"You came.","text_hash":"b1","element_index":5,"estimated_seconds":0.8,"listener_ids":[]}]', 'd@1');
  insert into r values ('second sync', s::text);
  insert into r select 'after v2', string_agg(speaker_name || ':' || status || ':' || review_state || ':' || approval || ':' || coalesce(intention,'-') || ':' || coalesce(previous_text,'-'), ' | ' order by status, ordinal)
    from public.dialogue_lines where project_id = p;
  -- Acknowledge the review; approve the scene.
  select * into l from public.dialogue_lines where project_id = p and text_hash = 'a2';
  l := public.update_dialogue_line(l.id, '{"acknowledge_review":true}');
  insert into r values ('acknowledge review', l.review_state || ':' || coalesce(l.previous_text, '-'));
  n := public.approve_scene_dialogue(p, sc);
  insert into r select 'approve scene', n::text || ' lines; ' || string_agg(approval, ',' order by ordinal) from public.dialogue_lines where project_id = p and status = 'active';
  insert into r select 'audit', string_agg(distinct action, ',') from public.audit_events where org_id = o.id and action like 'Dialogue%' or (org_id = o.id and action = 'SceneDialogueApproved');
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  insert into r select 'outsider sees', count(*)::text from public.dialogue_lines where project_id = p;
  begin perform public.update_dialogue_line(l.id, '{"notes":"x"}'); insert into r values ('outsider edit blocked', 'NO');
  exception when others then insert into r values ('outsider edit blocked', sqlerrm); end;
end $$;
select * from r;
rollback;
-- Expected (verified live 2026-09-27):
-- first sync            | 3 created
-- annotate              | confess/tension/7/draft
-- bad emotion refused   | yes
-- stale version refused | AURA-DLG-409: the approved script changed; reload and sync again
-- second sync           | {"kept": 1, "changed": 1, "created": 1, "omitted": 1, ...}
-- after v2              | TUNDE:active:review_required:draft:confess:They buried it. | RAMOS:active:current:draft:-:- | AMARA:active:current:approved:-:- | TUNDE:omitted:current:draft:-:-
-- acknowledge review    | current:-
-- approve scene         | 3 lines; approved,approved,approved
-- audit                 | DialogueLineApproved,DialogueLineUpdated,DialogueSynced,SceneDialogueApproved
-- outsider sees         | 0
-- outsider edit blocked | AURA-COL-403: you don't have access to this project (permission gate, migration 0019)
