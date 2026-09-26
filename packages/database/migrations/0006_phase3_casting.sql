-- Phase 3: Casting & Characters canonical storage (SRS §3, §6).
-- Canonical owner: Casting (apps/api/src/modules/characters). Scriptwriter
-- tables are only read here (CLAUDE.md rule 4).
--
-- characters          canonical identity (one row per real person/group)
-- character_aliases   every name the project uses for a character; the unique
--                     (project_id, normalized) index is what prevents duplicate
--                     canonical characters (characterNameEnforcer, SRS §15)
-- character_appearances  derived presence evidence per approved scene, stamped
--                     with the exact script version it came from (rule 10)
--
-- Writes go only through the functions below (membership, versioning, audit
-- in one transaction). Merges are reversible administrative actions (SRS §6.2).

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  role text not null default 'minor' check (role in ('lead','supporting','minor','extra')),
  kind text not null default 'individual' check (kind in ('individual','group')),
  status text not null default 'draft' check (status in ('draft','approved')),
  age text, gender text, nationality text, occupation text,
  description text, personality text, backstory text, motivation text,
  fears text, strengths text, weaknesses text, arc text,
  merged_into uuid references public.characters(id) on delete set null,
  created_from_version_id uuid references public.script_versions(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_characters_project on public.characters(project_id);

drop trigger if exists trg_characters_updated_at on public.characters;
create trigger trg_characters_updated_at before update on public.characters
  for each row execute function public.set_updated_at();

create table if not exists public.character_aliases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  alias text not null,
  normalized text not null,
  source text not null check (source in ('name','script','user','merge')),
  created_at timestamptz not null default now(),
  unique (project_id, normalized)
);
create index if not exists idx_character_aliases_character on public.character_aliases(character_id);

create table if not exists public.character_appearances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  scene_number int not null,
  source_version_id uuid not null references public.script_versions(id),
  speaking boolean not null,
  voice_only boolean not null,
  line_count int not null default 0,
  confidence numeric not null,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (character_id, scene_id)
);
create index if not exists idx_character_appearances_project on public.character_appearances(project_id);

alter table public.characters enable row level security;
alter table public.character_aliases enable row level security;
alter table public.character_appearances enable row level security;

drop policy if exists characters_select on public.characters;
create policy characters_select on public.characters for select using (public.is_org_member(org_id));
drop policy if exists character_aliases_select on public.character_aliases;
create policy character_aliases_select on public.character_aliases for select using (public.is_org_member(org_id));
drop policy if exists character_appearances_select on public.character_appearances;
create policy character_appearances_select on public.character_appearances for select using (public.is_org_member(org_id));

-- Shared guard: caller must be a member of the project's org. Returns org_id.
create or replace function public.casting_assert_member(p_project_id uuid) returns uuid
language plpgsql security definer stable set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-CHR-403: not allowed to change this project''s characters' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

-- Sync characters from the approved script (SRS §5.2 -> §6).
-- p_items: [{decision:'create', name, kind, role, age, description, aliases[], appearances[]}
--          |{decision:'match', character_id, aliases[], appearances[]}]
-- appearances: [{scene_number, speaking, voice_only, line_count, confidence, evidence}]
create or replace function public.sync_script_characters(
  p_project_id uuid,
  p_version_id uuid,
  p_items jsonb,
  p_engine_version text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_script public.scripts;
  v_item jsonb;
  v_app jsonb;
  v_alias jsonb;
  v_char uuid;
  v_scene uuid;
  v_created int := 0;
  v_matched int := 0;
  v_apps int := 0;
  v_summary jsonb;
begin
  v_org := public.casting_assert_member(p_project_id);
  select * into v_script from public.scripts where project_id = p_project_id;
  if v_script.id is null or v_script.approved_version_id is distinct from p_version_id then
    raise exception 'AURA-CHR-409: the approved script changed; reload and sync again' using errcode = 'P0409';
  end if;

  -- Serialise syncs per project.
  perform 1 from public.scripts where id = v_script.id for update;

  -- Appearances are derived evidence: recomputed in full from this exact version.
  delete from public.character_appearances where project_id = p_project_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_char := null;
    if v_item->>'decision' = 'match' then
      select coalesce(merged_into, id) into v_char from public.characters
        where id = (v_item->>'character_id')::uuid and project_id = p_project_id;
      if v_char is null then continue; end if;
      v_matched := v_matched + 1;
    else
      -- Race safety: if the name already belongs to someone, attach to them instead of duplicating.
      select character_id into v_char from public.character_aliases
        where project_id = p_project_id and normalized = v_item->>'normalized';
      if v_char is null then
        insert into public.characters(org_id, project_id, name, role, kind, age, description, created_from_version_id, created_by)
        values (v_org, p_project_id, v_item->>'name', coalesce(v_item->>'role','minor'), coalesce(v_item->>'kind','individual'),
                v_item->>'age', v_item->>'description', p_version_id, auth.uid())
        returning id into v_char;
        insert into public.character_aliases(org_id, project_id, character_id, alias, normalized, source)
        values (v_org, p_project_id, v_char, v_item->>'name', v_item->>'normalized', 'name');
        v_created := v_created + 1;
      else
        select coalesce(merged_into, id) into v_char from public.characters where id = v_char;
        v_matched := v_matched + 1;
      end if;
    end if;

    for v_alias in select * from jsonb_array_elements(coalesce(v_item->'aliases', '[]'::jsonb)) loop
      insert into public.character_aliases(org_id, project_id, character_id, alias, normalized, source)
      values (v_org, p_project_id, v_char, v_alias->>'alias', v_alias->>'normalized', 'script')
      on conflict (project_id, normalized) do nothing;
    end loop;

    for v_app in select * from jsonb_array_elements(coalesce(v_item->'appearances', '[]'::jsonb)) loop
      select id into v_scene from public.scenes
        where script_id = v_script.id and number = (v_app->>'scene_number')::int and status = 'active';
      if v_scene is null then continue; end if;
      insert into public.character_appearances(org_id, project_id, character_id, scene_id, scene_number, source_version_id,
        speaking, voice_only, line_count, confidence, evidence)
      values (v_org, p_project_id, v_char, v_scene, (v_app->>'scene_number')::int, p_version_id,
        (v_app->>'speaking')::boolean, (v_app->>'voice_only')::boolean, (v_app->>'line_count')::int,
        (v_app->>'confidence')::numeric, coalesce(v_app->'evidence', '[]'::jsonb))
      on conflict (character_id, scene_id) do update set
        speaking = character_appearances.speaking or excluded.speaking,
        voice_only = character_appearances.voice_only and excluded.voice_only,
        line_count = character_appearances.line_count + excluded.line_count,
        confidence = greatest(character_appearances.confidence, excluded.confidence),
        evidence = character_appearances.evidence || excluded.evidence;
      v_apps := v_apps + 1;
    end loop;
  end loop;

  v_summary := jsonb_build_object('version_id', p_version_id, 'created', v_created, 'matched', v_matched, 'appearances', v_apps);

  -- MOS execution record (SRS §14): which engine/version produced this, from which input.
  insert into public.jobs(org_id, project_id, engine_id, engine_version, status, input_snapshot, output_refs, attempt, started_at, completed_at)
  values (v_org, p_project_id, 'character.characterCandidateExtractionEngine', p_engine_version, 'completed',
          jsonb_build_object('script_version_id', p_version_id), v_summary, 1, now(), now());

  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'CharactersSynced', 'Script', v_script.id, v_summary || jsonb_build_object('engine_version', p_engine_version));
  return v_summary;
end;
$$;

-- Edit a character's identity/profile. Renames keep the old name as an alias so
-- the script still resolves to the same person.
create or replace function public.update_character(p_character_id uuid, p_patch jsonb, p_normalized_name text)
returns public.characters
language plpgsql security definer set search_path = public as $$
declare
  v_c public.characters;
  v_owner uuid;
begin
  select * into v_c from public.characters where id = p_character_id for update;
  if v_c.id is null then raise exception 'AURA-CHR-404: character not found' using errcode = 'P0404'; end if;
  perform public.casting_assert_member(v_c.project_id);
  if v_c.merged_into is not null then
    raise exception 'AURA-CHR-409: this character was merged into another; edit that one instead' using errcode = 'P0409';
  end if;

  if p_patch ? 'name' and p_normalized_name is not null then
    select character_id into v_owner from public.character_aliases
      where project_id = v_c.project_id and normalized = p_normalized_name;
    if v_owner is not null and v_owner <> v_c.id then
      raise exception 'AURA-CHR-409: another character already uses that name' using errcode = 'P0409';
    end if;
    update public.character_aliases set source = 'user' where character_id = v_c.id and source = 'name';
    insert into public.character_aliases(org_id, project_id, character_id, alias, normalized, source)
    values (v_c.org_id, v_c.project_id, v_c.id, p_patch->>'name', p_normalized_name, 'name')
    on conflict (project_id, normalized) do update set source = 'name', alias = excluded.alias;
  end if;

  update public.characters set
    name = case when p_patch ? 'name' then p_patch->>'name' else name end,
    role = case when p_patch ? 'role' then p_patch->>'role' else role end,
    kind = case when p_patch ? 'kind' then p_patch->>'kind' else kind end,
    status = case when p_patch ? 'status' then p_patch->>'status' else status end,
    age = case when p_patch ? 'age' then p_patch->>'age' else age end,
    gender = case when p_patch ? 'gender' then p_patch->>'gender' else gender end,
    nationality = case when p_patch ? 'nationality' then p_patch->>'nationality' else nationality end,
    occupation = case when p_patch ? 'occupation' then p_patch->>'occupation' else occupation end,
    description = case when p_patch ? 'description' then p_patch->>'description' else description end,
    personality = case when p_patch ? 'personality' then p_patch->>'personality' else personality end,
    backstory = case when p_patch ? 'backstory' then p_patch->>'backstory' else backstory end,
    motivation = case when p_patch ? 'motivation' then p_patch->>'motivation' else motivation end,
    fears = case when p_patch ? 'fears' then p_patch->>'fears' else fears end,
    strengths = case when p_patch ? 'strengths' then p_patch->>'strengths' else strengths end,
    weaknesses = case when p_patch ? 'weaknesses' then p_patch->>'weaknesses' else weaknesses end,
    arc = case when p_patch ? 'arc' then p_patch->>'arc' else arc end
  where id = v_c.id returning * into v_c;

  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_c.org_id, auth.uid(), 'CharacterUpdated', 'Character', v_c.id, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return v_c;
end;
$$;

create or replace function public.add_character_alias(p_character_id uuid, p_alias text, p_normalized text)
returns public.character_aliases
language plpgsql security definer set search_path = public as $$
declare v_c public.characters; v_a public.character_aliases; v_owner uuid;
begin
  select * into v_c from public.characters where id = p_character_id;
  if v_c.id is null then raise exception 'AURA-CHR-404: character not found' using errcode = 'P0404'; end if;
  perform public.casting_assert_member(v_c.project_id);
  select character_id into v_owner from public.character_aliases where project_id = v_c.project_id and normalized = p_normalized;
  if v_owner is not null and v_owner <> v_c.id then
    raise exception 'AURA-CHR-409: another character already uses that name — merge them instead' using errcode = 'P0409';
  end if;
  insert into public.character_aliases(org_id, project_id, character_id, alias, normalized, source)
  values (v_c.org_id, v_c.project_id, v_c.id, p_alias, p_normalized, 'user')
  on conflict (project_id, normalized) do update set alias = public.character_aliases.alias
  returning * into v_a;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_c.org_id, auth.uid(), 'CharacterAliasAdded', 'Character', v_c.id, jsonb_build_object('alias', p_alias));
  return v_a;
end;
$$;

-- Merge duplicate characters (e.g. "DET. RAMOS" and "RAMOS"). Reversible.
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

  update public.characters set merged_into = v_t.id where id = v_s.id returning * into v_s;

  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_s.org_id, auth.uid(), 'CharacterMerged', 'Character', v_s.id,
          jsonb_build_object('target_id', v_t.id, 'source_name', v_s.name, 'target_name', v_t.name, 'name_alias_id', v_name_alias));
  return v_t;
end;
$$;

-- Undo a merge: aliases that came from the source go back to it. Appearances
-- are re-derived by the next sync (the page runs one straight after).
create or replace function public.unmerge_character(p_source_id uuid)
returns public.characters
language plpgsql security definer set search_path = public as $$
declare v_s public.characters; v_alias uuid;
begin
  select * into v_s from public.characters where id = p_source_id for update;
  if v_s.id is null or v_s.merged_into is null then
    raise exception 'AURA-CHR-404: that character is not merged' using errcode = 'P0404';
  end if;
  perform public.casting_assert_member(v_s.project_id);
  -- The alias that was the source's own name (recorded at merge time) goes back to it.
  -- Script aliases are reassigned by the next sync (the page runs one straight after).
  select (metadata->>'name_alias_id')::uuid into v_alias from public.audit_events
    where object_id = v_s.id and action = 'CharacterMerged' order by created_at desc limit 1;
  update public.character_aliases set character_id = v_s.id, source = 'name'
    where id = v_alias and character_id = v_s.merged_into;
  update public.characters set merged_into = null where id = v_s.id returning * into v_s;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_s.org_id, auth.uid(), 'CharacterUnmerged', 'Character', v_s.id, '{}'::jsonb);
  return v_s;
end;
$$;

revoke execute on function public.casting_assert_member(uuid) from public, anon;
revoke execute on function public.sync_script_characters(uuid, uuid, jsonb, text) from public, anon;
revoke execute on function public.update_character(uuid, jsonb, text) from public, anon;
revoke execute on function public.add_character_alias(uuid, text, text) from public, anon;
revoke execute on function public.merge_characters(uuid, uuid) from public, anon;
revoke execute on function public.unmerge_character(uuid) from public, anon;
grant execute on function public.casting_assert_member(uuid) to authenticated;
grant execute on function public.sync_script_characters(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.update_character(uuid, jsonb, text) to authenticated;
grant execute on function public.add_character_alias(uuid, text, text) to authenticated;
grant execute on function public.merge_characters(uuid, uuid) to authenticated;
grant execute on function public.unmerge_character(uuid) to authenticated;
