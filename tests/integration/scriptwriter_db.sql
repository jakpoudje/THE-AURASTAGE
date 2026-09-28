-- Integration test for migration 0004 (save_script_version / approve_script_version).
-- Run against a database with migrations 0001-0005 applied (e.g. the Supabase SQL
-- editor or `psql -f`). Everything runs inside a transaction that is rolled back,
-- so it leaves no data behind. Expected results are listed at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(step text, ok text) on commit drop;
do $$
declare o public.organizations; p uuid; v1 public.script_versions; v2 public.script_versions; s public.scripts;
begin
  o := public.create_organization('Test Studio','test-studio-e2e');
  insert into public.projects(org_id,title,tone) values (o.id,'Shadows of Lagos','tense') returning id into p;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'story.screenplayFormatEngine@1.0.0', 'first');
  insert into r values ('v1 number', v1.version_number::text);
  begin
    perform public.save_script_version(p, null, 'y', '[]'::jsonb, 'p', null);
    insert into r values ('stale save rejected', 'NO');
  exception when others then insert into r values ('stale save rejected', sqlerrm); end;
  v2 := public.save_script_version(p, v1.id, 'z', '[]'::jsonb, 'p', null);
  insert into r values ('v2 number', v2.version_number::text);
  s := public.approve_script_version(p, v1.id, '[{"number":1,"heading":"INT. A - NIGHT","int_ext":"INT","location":"A","time_of_day":"NIGHT","speaking_characters":["TUNDE"],"estimated_seconds":30,"element_start":0,"element_end":3,"content_hash":"h1"},{"number":2,"heading":"EXT. B - DAY","int_ext":"EXT","location":"B","time_of_day":"DAY","speaking_characters":[],"estimated_seconds":20,"element_start":4,"element_end":6,"content_hash":"h2"}]', 'e@1');
  insert into r values ('approved v1', (s.approved_version_id = v1.id)::text);
  insert into r select 'after v1', string_agg(number||':'||status||':'||review_state, ',' order by number) from public.scenes where project_id = p;
  s := public.approve_script_version(p, v1.id, '[]', 'e@1');
  insert into r values ('re-approve same is no-op', (select count(*)::text from public.scenes where project_id=p));
  s := public.approve_script_version(p, v2.id, '[{"number":1,"heading":"INT. A - NIGHT","int_ext":"INT","location":"A","time_of_day":"NIGHT","speaking_characters":["TUNDE"],"estimated_seconds":30,"element_start":0,"element_end":3,"content_hash":"h1-changed"}]', 'e@1');
  insert into r select 'after v2', string_agg(number||':'||status||':'||review_state||':'||(source_version_id=v2.id), ',' order by number) from public.scenes where project_id = p;
  insert into r select 'audit', string_agg(action, ',' order by created_at, action) from public.audit_events where org_id = o.id;
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  insert into r select 'outsider sees scenes', count(*)::text from public.scenes where project_id = p;
  begin
    perform public.save_script_version(p, v2.id, 'hack', '[]'::jsonb, 'p', null);
    insert into r values ('outsider save blocked', 'NO');
  exception when others then insert into r values ('outsider save blocked', sqlerrm); end;
  begin
    insert into public.scenes(org_id,project_id,script_id,number,heading,int_ext,location,element_start,element_end,content_hash,source_version_id) values (o.id,p,s.id,9,'x','INT','x',0,0,'x',v2.id);
    insert into r values ('direct scene insert blocked', 'NO');
  exception when others then insert into r values ('direct scene insert blocked', sqlerrm); end;
end $$;
select * from r;
rollback;

-- Expected (verified against the live project on 2026-09-26):
-- v1 number                    | 1
-- stale save rejected          | AURA-SCR-409: script changed since you opened it
-- v2 number                    | 2
-- approved v1                  | true
-- after v1                     | 1:active:current,2:active:current
-- re-approve same is no-op     | 2
-- after v2                     | 1:active:review_required:true,2:omitted:review_required:false
-- audit                        | ProjectCreated,ScriptApproved,ScriptApproved,ScriptVersionSaved,ScriptVersionSaved
-- outsider sees scenes         | 0
-- outsider save blocked        | AURA-COL-403: you don't have access to this project (permission gate, migration 0019)
-- direct scene insert blocked  | new row violates row-level security policy for table "scenes"
