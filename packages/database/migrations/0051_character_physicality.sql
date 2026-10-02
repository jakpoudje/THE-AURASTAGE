-- Physicality & mannerisms (realism programme R1, owner request 2026-10-01): how a character moves and carries
-- themselves — posture, gait, gestures, habits, tics ("rubs his thumb over his ring when he lies"). Casting owns it; the
-- prompt compiler puts it into every shot the character is in, so performance looks like the same person throughout.
-- Writes keep going through update_character (gate_write 'casting' 'edit'); this only adds the field to it.
alter table public.characters add column if not exists physicality text check (physicality is null or char_length(physicality) <= 2000);

create or replace function app_private.update_character(p_character_id uuid, p_patch jsonb, p_normalized_name text)
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
    accent = case when p_patch ? 'accent' then p_patch->>'accent' else accent end,
    languages = case when p_patch ? 'languages' then p_patch->>'languages' else languages end,
    pronunciation = case when p_patch ? 'pronunciation' then p_patch->>'pronunciation' else pronunciation end,
    physicality = case when p_patch ? 'physicality' then p_patch->>'physicality' else physicality end,
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
