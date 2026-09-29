-- Integration test for migration 0034 (reference images sent to providers). Rolled back; expected results at the bottom.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into public.worker_credentials(name, token_hash) values ('test-worker', encode(extensions.digest('test-worker-token-0123456789abcdef0123456789', 'sha256'), 'hex'));
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(n serial, step text, ok text) on commit drop;
grant all on r to anon;
grant all on r_n_seq to anon;
do $$
declare o public.organizations; p uuid; p2 uuid; v1 public.script_versions; sc uuid; dv public.scene_dna_versions; pl public.shot_plans;
  pv public.shot_plan_versions; shot uuid; pkg public.generation_packages; t public.takes; claim jsonb;
  a_ok uuid; a_other uuid; a_arch uuid; ch uuid := gen_random_uuid(); loc uuid := gen_random_uuid();
  tok text := 'test-worker-token-0123456789abcdef0123456789';
begin
  o := public.create_organization('T','t-take-refs');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  insert into public.projects(org_id,title) values (o.id,'Other') returning id into p2;
  v1 := public.save_script_version(p, null, 'x', '[]'::jsonb, 'p', null);
  perform public.approve_script_version(p, v1.id, '[{"number":1,"heading":"EXT. HARBOUR","int_ext":"EXT","location":"HARBOUR","time_of_day":"NIGHT","speaking_characters":[],"estimated_seconds":4,"element_start":0,"element_end":1,"content_hash":"h"}]', 'e');
  select id into sc from public.scenes where project_id = p and number = 1;
  dv := public.approve_scene_dna(p, sc, '{}', '[]', 'sdna@1');
  pl := public.generate_shot_plan(p, sc, dv.id, '[{"purpose":"establishing","size":"WS","duration_seconds":4,"description":"Wide","story_start":0,"story_end":4}]', 'shot@1');
  select id into shot from public.shots where plan_id = pl.id;
  pv := public.approve_shot_plan(p, sc, '{"coverage":1}');
  reset role;
  insert into public.assets(org_id, project_id, type, name, storage_path, metadata, category)
    values (o.id, p, 'image', 'Amara front', 'o/p/assets/amara.png', '{"media_type":"image/png","size_bytes":1234}', 'visual_references') returning id into a_ok;
  insert into public.assets(org_id, project_id, type, name, storage_path, metadata, category)
    values (o.id, p2, 'image', 'Someone else''s', 'o/p2/assets/x.png', '{"media_type":"image/png"}', 'visual_references') returning id into a_other;
  insert into public.assets(org_id, project_id, type, name, storage_path, metadata, category, archived_at)
    values (o.id, p, 'image', 'Archived', 'o/p/assets/old.png', '{"media_type":"image/png"}', 'visual_references', now()) returning id into a_arch;
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  pkg := public.create_generation_package(p, sc, shot, pv.id, jsonb_build_object('prompt', 'Wide', 'references', jsonb_build_array(
    jsonb_build_object('kind','character','object_id',ch,'name','Amara','view','front:MCU','asset_id',a_ok),
    jsonb_build_object('kind','location','object_id',loc,'name','HARBOUR','view','wide:NIGHT','asset_id',a_other),
    jsonb_build_object('kind','prop','object_id',loc,'name','Old','view','hero','asset_id',a_arch))), 'gen@1');
  select * into t from public.request_takes(pkg.id, 'aurastage-sketch', 'sketch-v1', 'image', '{}', 1, 1, null, null);

  reset role; set local role anon;
  claim := public.worker_claim_take(tok);
  insert into r(step, ok) values ('claim lists every reference in order', (select string_agg(x->>'name', ',' order by i) from jsonb_array_elements(claim->'references') with ordinality as e(x, i)));
  insert into r(step, ok) values ('own-project asset: path, type, size, version',
    (claim->'references'->0->'asset'->>'storage_path') || ' / ' || (claim->'references'->0->'asset'->>'media_type') || ' / ' ||
    (claim->'references'->0->'asset'->>'size_bytes') || ' / v' || (claim->'references'->0->'asset'->>'version'));
  insert into r(step, ok) values ('another project''s asset is never returned', coalesce(claim->'references'->1->>'asset', 'null'));
  insert into r(step, ok) values ('an archived asset is not returned', coalesce(claim->'references'->2->>'asset', 'null'));
  begin perform public.worker_note_take_references('wrong-token-wrong-token-wrong-token-xx', t.id, '[]'); insert into r(step, ok) values ('bad token refused', 'NO');
  exception when others then insert into r(step, ok) values ('bad token refused', sqlerrm); end;
  begin perform public.worker_note_take_references(tok, t.id, '{}'); insert into r(step, ok) values ('not a list refused', 'NO');
  exception when others then insert into r(step, ok) values ('not a list refused', sqlerrm); end;
  perform public.worker_note_take_references(tok, t.id, jsonb_build_array(jsonb_build_object('name','Amara','sent',true,'asset_version',1)));
  perform public.worker_complete_take(tok, t.id, 'takes/x.svg', 'image/svg+xml', null, 0);
  perform public.worker_note_take_references(tok, t.id, '[]');
  reset role; set local role authenticated;
  select * into t from public.takes where id = t.id;
  insert into r(step, ok) values ('recorded on the take; a finished take is not changed', (t.references_used->0->>'name') || ' sent=' || (t.references_used->0->>'sent') || ' / ' || jsonb_array_length(t.references_used));
end $$;
reset role;
select string_agg(n || '. ' || step || ': ' || ok, E'\n' order by n) as results from r;
rollback;
-- Expected:
-- 1. claim lists every reference in order: Amara,HARBOUR,Old
-- 2. own-project asset: path, type, size, version: o/p/assets/amara.png / image/png / 1234 / v1
-- 3. another project's asset is never returned: null
-- 4. an archived asset is not returned: null
-- 5. bad token refused: AURA-GEN-401: worker not authorised
-- 6. not a list refused: AURA-GEN-400: references must be a list
-- 7. recorded on the take; a finished take is not changed: Amara sent=true / 1
