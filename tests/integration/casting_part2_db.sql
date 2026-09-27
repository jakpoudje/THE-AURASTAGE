-- Integration test for migration 0009 (manual characters, relationships, wardrobe looks,
-- merge carrying them over). Runs in a rolled-back transaction.
begin;
insert into auth.users(id, email, aud, role) values ('11111111-1111-1111-1111-111111111111','e2e-test@aurastage.invalid','authenticated','authenticated');
insert into auth.users(id, email, aud, role) values ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
create temp table r(step text, ok text) on commit drop;
do $$
declare o public.organizations; p uuid; t public.characters; a public.characters; d public.characters; rel public.character_relationships; l public.wardrobe_looks;
begin
  o := public.create_organization('T','t-casting2');
  insert into public.projects(org_id,title) values (o.id,'X') returning id into p;
  t := public.create_character(p, 'Tunde Okafor', 'TUNDE OKAFOR', 'lead', 'individual');
  a := public.create_character(p, 'Amara Bello', 'AMARA BELLO', 'lead', 'individual');
  d := public.create_character(p, 'Tunde (dup)', 'TUNDE DUP', 'minor', 'individual');
  insert into r values ('manual create', t.name || ' / ' || t.role);
  begin perform public.create_character(p, 'tunde okafor', 'TUNDE OKAFOR', null, null); insert into r values ('duplicate name refused', 'NO');
  exception when others then insert into r values ('duplicate name refused', sqlerrm); end;
  rel := public.set_character_relationship(a.id, t.id, 'Love interest', null);
  rel := public.set_character_relationship(t.id, a.id, 'Partner', 'Met at the paper');
  insert into r select 'relationship upsert (one per pair)', count(*)::text || ' / ' || max(relationship) from public.character_relationships where project_id = p;
  begin perform public.set_character_relationship(t.id, t.id, 'Self', null); insert into r values ('self relationship refused', 'NO');
  exception when others then insert into r values ('self relationship refused', sqlerrm); end;
  l := public.save_wardrobe_look(null, t.id, 'Field outfit', 'Khaki jacket');
  l := public.save_wardrobe_look(l.id, t.id, 'Field outfit', 'Khaki jacket, press badge');
  perform public.save_wardrobe_look(null, d.id, 'Field outfit', 'dup look');
  perform public.set_character_relationship(d.id, a.id, 'Colleague', null);
  begin perform public.save_wardrobe_look(null, t.id, 'FIELD OUTFIT', 'x'); insert into r values ('duplicate look name refused', 'NO');
  exception when others then insert into r values ('duplicate look name refused', sqlerrm); end;
  -- Merge the duplicate into Tunde: looks move (renamed on clash), duplicate relationship dropped.
  perform public.merge_characters(d.id, t.id);
  insert into r select 'looks after merge', string_agg(name, ' | ' order by name) from public.wardrobe_looks where character_id = t.id;
  insert into r select 'relationships after merge', count(*)::text || ' / ' || string_agg(relationship, ',') from public.character_relationships where project_id = p;
  delete from r where false;
  perform public.delete_wardrobe_look(l.id);
  perform public.delete_character_relationship(rel.id);
  insert into r select 'deletes', (select count(*) from public.wardrobe_looks where character_id = t.id)::text || ' looks, ' || (select count(*) from public.character_relationships where project_id = p)::text || ' rels';
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  begin perform public.create_character(p, 'Hack', 'HACK', null, null); insert into r values ('outsider create blocked', 'NO');
  exception when others then insert into r values ('outsider create blocked', sqlerrm); end;
  insert into r select 'outsider sees looks', count(*)::text from public.wardrobe_looks where project_id = p;
end $$;
select * from r;
rollback;
-- Expected (verified live 2026-09-27):
-- manual create                      | Tunde Okafor / lead
-- duplicate name refused             | AURA-CHR-409: a character with that name already exists
-- relationship upsert (one per pair) | 1 / Partner
-- self relationship refused          | AURA-CHR-400: a character cannot have a relationship with themselves
-- duplicate look name refused        | AURA-CHR-409: this character already has a look with that name
-- looks after merge                  | Field outfit | Field outfit (Tunde (dup))
-- relationships after merge          | 1 / Partner
-- deletes                            | 1 looks, 0 rels
-- outsider create blocked            | AURA-CHR-403: not allowed to change this project's characters
-- outsider sees looks                | 0
