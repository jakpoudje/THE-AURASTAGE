-- Integration test for migration 0032 (volume automation on the final assembly). Rolled back; expected at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(n serial, step text, ok text) on commit drop;
create temp table ids(k text primary key, v uuid) on commit drop;
do $$
declare o public.organizations; p uuid; t public.timelines; rev uuid; v public.timeline_versions;
begin
  o := public.create_organization('T','t-automation');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  insert into ids values ('p', p);
  begin perform public.save_timeline_automation(p, '{"A1":[]}', gen_random_uuid()); insert into r(step, ok) values ('no timeline yet', 'NO');
  exception when others then insert into r(step, ok) values ('no timeline yet', sqlerrm); end;
  t := public.save_timeline(p, null, '[]', 'assemble', 'empty', 'e@1', false, null);
  rev := t.automation_revision;
  t := public.save_timeline_automation(p, '{"A1":[{"frame":0,"db":0},{"frame":48,"db":-12},{"frame":96,"db":-3.5}]}', rev);
  insert into r(step, ok) values ('saved; revision moves; the picture revision does not', jsonb_array_length(t.automation->'A1') || ' / ' || (t.automation_revision <> rev)::text);
  begin perform public.save_timeline_automation(p, '{"A1":[]}', rev); insert into r(step, ok) values ('stale revision refused', 'NO');
  exception when others then insert into r(step, ok) values ('stale revision refused', sqlerrm); end;
  begin perform public.save_timeline_automation(p, '{"A1":[{"frame":10,"db":0},{"frame":5,"db":0}]}', t.automation_revision); insert into r(step, ok) values ('out of order refused', 'NO');
  exception when others then insert into r(step, ok) values ('out of order refused', sqlerrm); end;
  begin perform public.save_timeline_automation(p, '{"A1":[{"frame":1.5,"db":0}]}', t.automation_revision); insert into r(step, ok) values ('half frame refused', 'NO');
  exception when others then insert into r(step, ok) values ('half frame refused', sqlerrm); end;
  begin perform public.save_timeline_automation(p, '{"A1":[{"frame":1,"db":40}]}', t.automation_revision); insert into r(step, ok) values ('level out of range refused', 'NO');
  exception when others then insert into r(step, ok) values ('level out of range refused', sqlerrm); end;
  begin perform public.save_timeline_automation(p, '{"V1":[]}', t.automation_revision); insert into r(step, ok) values ('unknown lane refused', 'NO');
  exception when others then insert into r(step, ok) values ('unknown lane refused', sqlerrm); end;
  v := public.save_timeline_version(p, 'Mix pass 1', 'manual', '{}');
  insert into r(step, ok) values ('a saved version keeps the automation', jsonb_array_length(v.automation->'A1')::text || ' / ' || (v.automation->'A1'->1->>'db'));
  -- Locked picture: automation is sound, so it can still be changed and the lock stays.
  reset role;
  update public.timelines set status = 'locked' where project_id = p;
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  t := public.save_timeline_automation(p, '{"A1":[{"frame":0,"db":-6}]}', t.automation_revision);
  insert into r(step, ok) values ('changed after Picture Lock without breaking it', t.status || ' / ' || (t.automation->'A1'->0->>'db'));
  insert into r(step, ok) values ('audit', (select string_agg(distinct action, ',') from public.audit_events where org_id = o.id and action like 'TimelineAutomation%'));
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  begin perform public.save_timeline_automation(p, '{"A1":[]}', t.automation_revision); insert into r(step, ok) values ('outsider refused', 'NO');
  exception when others then insert into r(step, ok) values ('outsider refused', split_part(sqlerrm, '.', 1)); end;
end $$;
select step, ok from r order by n;
rollback;
-- Expected (verified live 2026-09-29):
-- no timeline yet                                        | AURA-EDT-412: build the first assembly first
-- saved; revision moves; the picture revision does not   | 3 / true
-- stale revision refused                                 | AURA-EDT-409: the automation changed — reload and try again
-- out of order refused                                   | AURA-EDT-400: points must be in time order, one per frame
-- half frame refused                                     | AURA-EDT-400: each point needs a whole frame (≥ 0) and a level between -60 and +12 dB
-- level out of range refused                             | (same)
-- unknown lane refused                                   | AURA-EDT-400: unknown automation lane V1
-- a saved version keeps the automation                   | 3 / -12
-- changed after Picture Lock without breaking it         | locked / -6
-- audit                                                  | TimelineAutomationSaved
-- outsider refused                                       | AURA-COL-403: you don't have access to this project
