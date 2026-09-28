-- Integration test for migration 0011 (Scene DNA). Rolled back; expected results at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(step text, ok text) on commit drop;
do $$
declare o public.organizations; p uuid; p2 uuid; v1 public.script_versions; sc uuid; d public.scene_dna; v public.scene_dna_versions;
begin
  o := public.create_organization('T','t-scenedna');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  insert into public.projects(org_id,title) values (o.id,'Other') returning id into p2;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v1.id, '[{"number":1,"heading":"INT. A","int_ext":"INT","location":"A","time_of_day":"DAY","speaking_characters":[],"estimated_seconds":1,"element_start":0,"element_end":1,"content_hash":"h"}]', 'e');
  select id into sc from public.scenes where project_id = p and number = 1;
  d := public.save_scene_dna(p, sc, '{"purpose":"Tunde commits","mood":["tense","wet"],"camera_energy":"measured"}');
  insert into r values ('save draft', d.status || ' / ' || d.purpose || ' / ' || array_to_string(d.mood, ','));
  begin perform public.save_scene_dna(p, sc, '{"camera_energy":"wild"}'); insert into r values ('bad camera energy refused', 'NO');
  exception when others then insert into r values ('bad camera energy refused', 'yes'); end;
  begin perform public.save_scene_dna(p2, sc, '{"purpose":"x"}'); insert into r values ('scene from another project refused', 'NO');
  exception when others then insert into r values ('scene from another project refused', sqlerrm); end;
  v := public.approve_scene_dna(p, sc, '{"purpose":"Tunde commits"}', '[{"type":"scene","id":"s","fingerprint":"h","strength":"hard","label":"Scene 1"}]', 'sdna@1');
  select * into d from public.scene_dna where scene_id = sc;
  insert into r values ('approve v1', d.status || ' / v' || v.version_number || ' / ' || (d.approved_version_id = v.id)::text);
  d := public.set_scene_dna_drift(d.id, 'review_required', '[{"type":"character","id":"c","label":"Tunde","kind":"changed","effect":"review_required","message":"Tunde (character) changed since approval."}]');
  insert into r values ('drift persisted', d.review_state || ' / ' || jsonb_array_length(d.drift));
  d := public.set_scene_dna_drift(d.id, 'review_required', d.drift);
  insert into r select 'drift idempotent (one audit row)', count(*)::text from public.audit_events where object_id = d.id and action = 'UpstreamVersionChanged';
  d := public.save_scene_dna(p, sc, '{"purpose":"Tunde commits, finally"}');
  insert into r values ('edit after approval reopens draft', d.status || ' / approved version kept: ' || (d.approved_version_id is not null)::text);
  v := public.approve_scene_dna(p, sc, '{"purpose":"Tunde commits, finally"}', '[]', 'sdna@1');
  select * into d from public.scene_dna where scene_id = sc;
  insert into r values ('re-approve v2 clears drift', d.status || ' / v' || v.version_number || ' / ' || d.review_state || ' / ' || jsonb_array_length(d.drift));
  insert into r select 'versions immutable history', count(*)::text from public.scene_dna_versions where scene_dna_id = d.id;
  insert into r select 'audit + mos job', (select string_agg(distinct action, ',') from public.audit_events where object_id = d.id) || ' | jobs ' || (select count(*) from public.jobs where project_id = p and engine_id = 'scene-dna.sceneDnaAssemblyEngine');
  -- Simulate Scriptwriter cutting the scene (owner-level write, as approve_script_version would).
  reset role;
  update public.scenes set status = 'omitted' where id = sc;
  set local role authenticated;
  begin perform public.approve_scene_dna(p, sc, '{}', '[]', 'sdna@1'); insert into r values ('cut scene cannot be approved', 'NO');
  exception when others then insert into r values ('cut scene cannot be approved', sqlerrm); end;
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  insert into r select 'outsider sees', count(*)::text from public.scene_dna where project_id = p;
  begin perform public.save_scene_dna(p, sc, '{"purpose":"hack"}'); insert into r values ('outsider edit blocked', 'NO');
  exception when others then insert into r values ('outsider edit blocked', sqlerrm); end;
end $$;
select * from r;
rollback;
-- Expected (verified live 2026-09-27):
-- save draft                         | draft / Tunde commits / tense,wet
-- bad camera energy refused          | yes
-- scene from another project refused | AURA-SDNA-404: scene not found in this project
-- approve v1                         | approved / v1 / true
-- drift persisted                    | review_required / 1
-- drift idempotent (one audit row)   | 1
-- edit after approval reopens draft  | draft / approved version kept: true
-- re-approve v2 clears drift         | approved / v2 / current / 0
-- versions immutable history         | 2
-- audit + mos job                    | SceneDNAApproved,SceneDNAUpdated,UpstreamVersionChanged | jobs 2
-- cut scene cannot be approved       | AURA-SDNA-409: this scene is no longer in the approved script
-- outsider sees                      | 0
-- outsider edit blocked              | AURA-COL-403: you don't have access to this project (permission gate, migration 0019)
