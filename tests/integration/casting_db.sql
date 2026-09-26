-- Integration test for migration 0006 (Casting). Runs in a rolled-back transaction.
-- Expected results are listed at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(step text, ok text) on commit drop;
do $$
declare o public.organizations; p uuid; v1 public.script_versions; v2 public.script_versions; s jsonb; t uuid; ramos uuid; det uuid; c public.characters;
begin
  o := public.create_organization('Test Studio','test-studio-casting');
  insert into public.projects(org_id,title) values (o.id,'Shadows of Lagos') returning id into p;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v1.id, '[{"number":1,"heading":"INT. A","int_ext":"INT","location":"A","time_of_day":null,"speaking_characters":["TUNDE"],"estimated_seconds":30,"element_start":0,"element_end":3,"content_hash":"h1"},{"number":2,"heading":"EXT. B","int_ext":"EXT","location":"B","time_of_day":null,"speaking_characters":[],"estimated_seconds":20,"element_start":4,"element_end":6,"content_hash":"h2"}]', 'e@1');
  s := public.sync_script_characters(p, v1.id, '[
    {"decision":"create","name":"Tunde Okafor","normalized":"TUNDE OKAFOR","role":"lead","kind":"individual","age":"35","aliases":[{"alias":"Tunde","normalized":"TUNDE"}],
     "appearances":[{"scene_number":1,"speaking":true,"voice_only":false,"line_count":2,"confidence":0.99,"evidence":[{"type":"cue","line":3,"text":"TUNDE"}]},{"scene_number":2,"speaking":false,"voice_only":false,"line_count":0,"confidence":0.75,"evidence":[]}]},
    {"decision":"create","name":"Ramos","normalized":"RAMOS","role":"minor","kind":"individual","aliases":[],"appearances":[{"scene_number":2,"speaking":true,"voice_only":false,"line_count":1,"confidence":0.99,"evidence":[]}]},
    {"decision":"create","name":"Detective Ramos","normalized":"DETECTIVE RAMOS","role":"minor","kind":"individual","aliases":[],"appearances":[{"scene_number":2,"speaking":false,"voice_only":false,"line_count":0,"confidence":0.7,"evidence":[]}]},
    {"decision":"create","name":"Ghost","normalized":"GHOST","appearances":[{"scene_number":99,"speaking":true,"voice_only":false,"line_count":1,"confidence":0.99,"evidence":[]}]}
  ]', 'c@1');
  insert into r values ('first sync', s::text);
  select id into t from public.characters where project_id = p and name = 'Tunde Okafor';
  insert into r select 'tunde aliases', string_agg(alias||':'||source, ',' order by alias) from public.character_aliases where character_id = t;
  -- Re-sync with a "create" for an existing name must attach, never duplicate.
  s := public.sync_script_characters(p, v1.id, '[{"decision":"create","name":"TUNDE","normalized":"TUNDE","appearances":[{"scene_number":1,"speaking":true,"voice_only":false,"line_count":2,"confidence":0.99,"evidence":[]}]},
    {"decision":"create","name":"Ramos","normalized":"RAMOS","appearances":[{"scene_number":2,"speaking":true,"voice_only":false,"line_count":1,"confidence":0.99,"evidence":[]}]},
    {"decision":"create","name":"Detective Ramos","normalized":"DETECTIVE RAMOS","appearances":[{"scene_number":2,"speaking":false,"voice_only":false,"line_count":0,"confidence":0.7,"evidence":[]}]}]', 'c@1');
  insert into r values ('resync no duplicate', (select count(*)::text from public.characters where project_id = p) || ' chars / ' || s::text);
  -- Rename keeps old name as alias; name collision refused.
  c := public.update_character(t, '{"name":"Tunde A. Okafor","occupation":"Journalist"}', 'TUNDE A OKAFOR');
  insert into r select 'rename', c.name || ' / ' || string_agg(alias||':'||source, ',' order by alias) from public.character_aliases where character_id = t;
  begin perform public.update_character(t, '{"name":"Ramos"}', 'RAMOS'); insert into r values ('rename collision refused', 'NO');
  exception when others then insert into r values ('rename collision refused', sqlerrm); end;
  -- Merge Ramos into Detective Ramos, then undo.
  select id into ramos from public.characters where project_id = p and name = 'Ramos';
  select id into det from public.characters where project_id = p and name = 'Detective Ramos';
  perform public.merge_characters(ramos, det);
  insert into r select 'after merge', string_agg(a.alias||':'||a.source, ',' order by a.alias) || ' | apps ' ||
    coalesce((select string_agg(scene_number||':'||speaking||':'||line_count, ',') from public.character_appearances where character_id = det), 'none')
    from public.character_aliases a where a.character_id = det;
  begin perform public.update_character(ramos, '{"age":"40"}', null); insert into r values ('edit merged refused', 'NO');
  exception when others then insert into r values ('edit merged refused', sqlerrm); end;
  perform public.unmerge_character(ramos);
  insert into r select 'after unmerge', (select merged_into is null from public.characters where id = ramos)::text || ' | ' ||
    (select string_agg(alias||':'||source, ',') from public.character_aliases where character_id = ramos);
  -- Syncing from a version that is not the approved one is refused.
  v2 := public.save_script_version(p, v1.id, 'y', '[]'::jsonb, 'p', null);
  begin perform public.sync_script_characters(p, v2.id, '[]', 'c@1'); insert into r values ('stale sync refused', 'NO');
  exception when others then insert into r values ('stale sync refused', sqlerrm); end;
  insert into r select 'mos job + audit', (select count(*)::text from public.jobs where project_id = p and status = 'completed') || ' jobs; ' ||
    (select string_agg(distinct action, ',') from public.audit_events where org_id = o.id and action like 'Character%');
  -- Outsider.
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  insert into r select 'outsider sees', count(*)::text from public.characters where project_id = p;
  begin perform public.update_character(t, '{"age":"99"}', null); insert into r values ('outsider edit blocked', 'NO');
  exception when others then insert into r values ('outsider edit blocked', sqlerrm); end;
  begin insert into public.characters(org_id, project_id, name) values (o.id, p, 'Hack'); insert into r values ('direct insert blocked', 'NO');
  exception when others then insert into r values ('direct insert blocked', sqlerrm); end;
end $$;
select * from r;
rollback;

-- Expected (verified against the live project on 2026-09-26):
-- first sync               | {"created": 4, "matched": 0, "appearances": 4, ...}   (Ghost's unknown scene 99 is skipped)
-- tunde aliases            | Tunde:script,Tunde Okafor:name
-- resync no duplicate      | 4 chars / {"created": 0, "matched": 3, "appearances": 3, ...}
-- rename                   | Tunde A. Okafor / Tunde:script,Tunde A. Okafor:name,Tunde Okafor:user
-- rename collision refused | AURA-CHR-409: another character already uses that name
-- after merge              | Detective Ramos:name,Ramos:merge | apps 2:true:1
-- edit merged refused      | AURA-CHR-409: this character was merged into another; edit that one instead
-- after unmerge            | true | Ramos:name
-- stale sync refused       | AURA-CHR-409: the approved script changed; reload and sync again
-- mos job + audit          | 2 jobs; CharacterMerged,CharactersSynced,CharacterUnmerged,CharacterUpdated
-- outsider sees            | 0
-- outsider edit blocked    | AURA-CHR-403: not allowed to change this project's characters
-- direct insert blocked    | new row violates row-level security policy for table "characters"
