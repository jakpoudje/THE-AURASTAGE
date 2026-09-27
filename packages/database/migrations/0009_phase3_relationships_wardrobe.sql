-- Phase 3 (part 2): manual characters, relationships, wardrobe looks.
-- Canonical owner: Casting (SRS §3: Character, WardrobeLook). Writes only via
-- the functions below; tables are read-only through RLS.

-- 1. Manual character creation (UI_REFERENCE §4 "+ Add Character").
create or replace function public.create_character(p_project_id uuid, p_name text, p_normalized text, p_role text, p_kind text)
returns public.characters
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_c public.characters;
begin
  v_org := public.casting_assert_member(p_project_id);
  if exists (select 1 from public.character_aliases where project_id = p_project_id and normalized = p_normalized) then
    raise exception 'AURA-CHR-409: a character with that name already exists' using errcode = 'P0409';
  end if;
  insert into public.characters(org_id, project_id, name, role, kind, created_by)
  values (v_org, p_project_id, p_name, coalesce(p_role, 'minor'), coalesce(p_kind, 'individual'), auth.uid())
  returning * into v_c;
  insert into public.character_aliases(org_id, project_id, character_id, alias, normalized, source)
  values (v_org, p_project_id, v_c.id, p_name, p_normalized, 'name');
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'CharacterCreated', 'Character', v_c.id, jsonb_build_object('source', 'user'));
  return v_c;
end;
$$;

-- 2. Relationships (undirected pair + type label, e.g. "Sister", "Rival").
create table if not exists public.character_relationships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  character_a uuid not null references public.characters(id) on delete cascade,
  character_b uuid not null references public.characters(id) on delete cascade,
  relationship text not null check (char_length(relationship) between 1 and 80),
  description text check (description is null or char_length(description) <= 2000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (character_a < character_b),
  unique (character_a, character_b)
);
create index if not exists idx_character_relationships_project on public.character_relationships(project_id);
drop trigger if exists trg_character_relationships_updated_at on public.character_relationships;
create trigger trg_character_relationships_updated_at before update on public.character_relationships
  for each row execute function public.set_updated_at();
alter table public.character_relationships enable row level security;
drop policy if exists character_relationships_select on public.character_relationships;
create policy character_relationships_select on public.character_relationships for select using (public.is_org_member(org_id));

-- Upsert: one relationship per pair; saving again updates its label/description.
create or replace function public.set_character_relationship(p_a uuid, p_b uuid, p_relationship text, p_description text)
returns public.character_relationships
language plpgsql security definer set search_path = public as $$
declare v_a public.characters; v_b public.characters; v_lo uuid; v_hi uuid; v_r public.character_relationships;
begin
  if p_a = p_b then raise exception 'AURA-CHR-400: a character cannot have a relationship with themselves' using errcode = 'P0400'; end if;
  select * into v_a from public.characters where id = p_a;
  select * into v_b from public.characters where id = p_b;
  if v_a.id is null or v_b.id is null or v_a.project_id <> v_b.project_id then
    raise exception 'AURA-CHR-404: characters not found in the same project' using errcode = 'P0404';
  end if;
  if v_a.merged_into is not null or v_b.merged_into is not null then
    raise exception 'AURA-CHR-409: one of these characters was merged into another' using errcode = 'P0409';
  end if;
  perform public.casting_assert_member(v_a.project_id);
  v_lo := least(p_a, p_b); v_hi := greatest(p_a, p_b);
  insert into public.character_relationships(org_id, project_id, character_a, character_b, relationship, description, created_by)
  values (v_a.org_id, v_a.project_id, v_lo, v_hi, p_relationship, p_description, auth.uid())
  on conflict (character_a, character_b) do update set relationship = excluded.relationship, description = excluded.description
  returning * into v_r;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_a.org_id, auth.uid(), 'CharacterRelationshipSet', 'CharacterRelationship', v_r.id,
          jsonb_build_object('character_a', v_lo, 'character_b', v_hi, 'relationship', p_relationship));
  return v_r;
end;
$$;

create or replace function public.delete_character_relationship(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_r public.character_relationships;
begin
  select * into v_r from public.character_relationships where id = p_id;
  if v_r.id is null then raise exception 'AURA-CHR-404: relationship not found' using errcode = 'P0404'; end if;
  perform public.casting_assert_member(v_r.project_id);
  delete from public.character_relationships where id = p_id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_r.org_id, auth.uid(), 'CharacterRelationshipDeleted', 'CharacterRelationship', v_r.id,
          jsonb_build_object('character_a', v_r.character_a, 'character_b', v_r.character_b, 'relationship', v_r.relationship));
end;
$$;

-- 3. Wardrobe looks (SRS §3: WardrobeLook, canonical owner Casting).
create table if not exists public.wardrobe_looks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (description is null or char_length(description) <= 2000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (character_id, name)
);
create index if not exists idx_wardrobe_looks_project on public.wardrobe_looks(project_id);
drop trigger if exists trg_wardrobe_looks_updated_at on public.wardrobe_looks;
create trigger trg_wardrobe_looks_updated_at before update on public.wardrobe_looks
  for each row execute function public.set_updated_at();
alter table public.wardrobe_looks enable row level security;
drop policy if exists wardrobe_looks_select on public.wardrobe_looks;
create policy wardrobe_looks_select on public.wardrobe_looks for select using (public.is_org_member(org_id));

-- Create (p_id null) or update a look.
create or replace function public.save_wardrobe_look(p_id uuid, p_character_id uuid, p_name text, p_description text)
returns public.wardrobe_looks
language plpgsql security definer set search_path = public as $$
declare v_c public.characters; v_l public.wardrobe_looks;
begin
  select * into v_c from public.characters where id = p_character_id;
  if v_c.id is null then raise exception 'AURA-CHR-404: character not found' using errcode = 'P0404'; end if;
  perform public.casting_assert_member(v_c.project_id);
  if v_c.merged_into is not null then
    raise exception 'AURA-CHR-409: this character was merged into another; add looks there' using errcode = 'P0409';
  end if;
  if exists (select 1 from public.wardrobe_looks where character_id = p_character_id and lower(name) = lower(p_name) and id is distinct from p_id) then
    raise exception 'AURA-CHR-409: this character already has a look with that name' using errcode = 'P0409';
  end if;
  if p_id is null then
    insert into public.wardrobe_looks(org_id, project_id, character_id, name, description, created_by)
    values (v_c.org_id, v_c.project_id, v_c.id, p_name, p_description, auth.uid())
    returning * into v_l;
  else
    update public.wardrobe_looks set name = p_name, description = p_description
      where id = p_id and character_id = p_character_id returning * into v_l;
    if v_l.id is null then raise exception 'AURA-CHR-404: look not found' using errcode = 'P0404'; end if;
  end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_c.org_id, auth.uid(), 'WardrobeLookSaved', 'WardrobeLook', v_l.id, jsonb_build_object('character_id', v_c.id, 'name', p_name));
  return v_l;
end;
$$;

create or replace function public.delete_wardrobe_look(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_l public.wardrobe_looks;
begin
  select * into v_l from public.wardrobe_looks where id = p_id;
  if v_l.id is null then raise exception 'AURA-CHR-404: look not found' using errcode = 'P0404'; end if;
  perform public.casting_assert_member(v_l.project_id);
  delete from public.wardrobe_looks where id = p_id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_l.org_id, auth.uid(), 'WardrobeLookDeleted', 'WardrobeLook', v_l.id, jsonb_build_object('character_id', v_l.character_id, 'name', v_l.name));
end;
$$;

-- 4. Merges also move wardrobe looks and relationships to the surviving character.
-- (Undoing a merge restores the identity and its name; looks/relationships stay
-- with the survivor and can be re-added.)
create or replace function public.merge_characters(p_source_id uuid, p_target_id uuid)
returns public.characters
language plpgsql security definer set search_path = public as $$
declare
  v_s public.characters; v_t public.characters;
  v_name_alias uuid;
  v_app public.character_appearances;
begin
  if p_source_id = p_target_id then raise exception 'AURA-CHR-400: cannot merge a character into itself' using errcode = 'P0400'; end if;
  select * into v_s from public.characters where id = p_source_id for update;
  select * into v_t from public.characters where id = p_target_id for update;
  if v_s.id is null or v_t.id is null or v_s.project_id <> v_t.project_id then
    raise exception 'AURA-CHR-404: characters not found in the same project' using errcode = 'P0404';
  end if;
  perform public.casting_assert_member(v_s.project_id);
  if v_s.merged_into is not null or v_t.merged_into is not null then
    raise exception 'AURA-CHR-409: one of these characters is already merged' using errcode = 'P0409';
  end if;

  select id into v_name_alias from public.character_aliases where character_id = v_s.id and source = 'name' limit 1;
  update public.character_aliases set character_id = v_t.id, source = case when source = 'name' then 'merge' else source end
    where character_id = v_s.id;

  for v_app in select * from public.character_appearances where character_id = v_s.id loop
    if exists (select 1 from public.character_appearances where character_id = v_t.id and scene_id = v_app.scene_id) then
      update public.character_appearances set
        speaking = speaking or v_app.speaking,
        voice_only = voice_only and v_app.voice_only,
        line_count = line_count + v_app.line_count,
        confidence = greatest(confidence, v_app.confidence),
        evidence = evidence || v_app.evidence
      where character_id = v_t.id and scene_id = v_app.scene_id;
      delete from public.character_appearances where id = v_app.id;
    else
      update public.character_appearances set character_id = v_t.id where id = v_app.id;
    end if;
  end loop;

  -- Wardrobe looks move to the surviving character (renamed on a name clash).
  update public.wardrobe_looks w set character_id = v_t.id,
    name = case when exists (select 1 from public.wardrobe_looks x where x.character_id = v_t.id and lower(x.name) = lower(w.name))
                then left(w.name || ' (' || v_s.name || ')', 80) else w.name end
    where w.character_id = v_s.id;

  -- Relationships re-point to the survivor; ones that would duplicate an existing
  -- pair or point at the survivor itself are dropped (recorded in the audit event).
  delete from public.character_relationships r
    where (r.character_a = v_s.id and r.character_b = v_t.id) or (r.character_b = v_s.id and r.character_a = v_t.id);
  delete from public.character_relationships r
    where (r.character_a = v_s.id or r.character_b = v_s.id)
      and exists (select 1 from public.character_relationships x
                  where x.character_a = least(v_t.id, case when r.character_a = v_s.id then r.character_b else r.character_a end)
                    and x.character_b = greatest(v_t.id, case when r.character_a = v_s.id then r.character_b else r.character_a end));
  update public.character_relationships r set
    character_a = least(v_t.id, case when r.character_a = v_s.id then r.character_b else r.character_a end),
    character_b = greatest(v_t.id, case when r.character_a = v_s.id then r.character_b else r.character_a end)
    where r.character_a = v_s.id or r.character_b = v_s.id;

  update public.characters set merged_into = v_t.id where id = v_s.id returning * into v_s;

  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_s.org_id, auth.uid(), 'CharacterMerged', 'Character', v_s.id,
          jsonb_build_object('target_id', v_t.id, 'source_name', v_s.name, 'target_name', v_t.name, 'name_alias_id', v_name_alias));
  return v_t;
end;
$$;


revoke execute on function public.create_character(uuid, text, text, text, text) from public, anon;
revoke execute on function public.set_character_relationship(uuid, uuid, text, text) from public, anon;
revoke execute on function public.delete_character_relationship(uuid) from public, anon;
revoke execute on function public.save_wardrobe_look(uuid, uuid, text, text) from public, anon;
revoke execute on function public.delete_wardrobe_look(uuid) from public, anon;
grant execute on function public.create_character(uuid, text, text, text, text) to authenticated;
grant execute on function public.set_character_relationship(uuid, uuid, text, text) to authenticated;
grant execute on function public.delete_character_relationship(uuid) to authenticated;
grant execute on function public.save_wardrobe_look(uuid, uuid, text, text) to authenticated;
grant execute on function public.delete_wardrobe_look(uuid) to authenticated;
