-- Story-driven aging (owner, 2026-09-29: flashbacks and time jumps must show each character at the right age).
-- Casting owns a character's ages ("Flashback, 1995 — age 10: braided hair, no scar yet"); reference views can be made
-- for each age; Scene DNA chooses the age a character is in each scene (scene_dna.ages, like wardrobe), so prompts and
-- reference images follow it. A changed or removed age flags the Scene DNA that uses it (drift), never silently.

create table if not exists public.character_age_states (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  age text not null check (char_length(age) between 1 and 40),
  description text check (description is null or char_length(description) <= 2000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_character_age_states_label on public.character_age_states(character_id, lower(label));
create index if not exists idx_character_age_states_project on public.character_age_states(project_id);
drop trigger if exists trg_character_age_states_updated_at on public.character_age_states;
create trigger trg_character_age_states_updated_at before update on public.character_age_states
  for each row execute function public.set_updated_at();
alter table public.character_age_states enable row level security;
drop policy if exists character_age_states_select on public.character_age_states;
create policy character_age_states_select on public.character_age_states for select
  using (project_id = any ((select public.my_project_ids())::uuid[]));

alter table public.character_reference_images add column if not exists age_state_id uuid references public.character_age_states(id) on delete set null;
alter table public.scene_dna add column if not exists ages jsonb not null default '{}'::jsonb;

-- Create (p_id null) or update an age.
create or replace function public.save_character_age_state(p_id uuid, p_character_id uuid, p_label text, p_age text, p_description text)
returns public.character_age_states
language plpgsql security definer set search_path = public as $$
declare v_c public.characters; v public.character_age_states;
begin
  select * into v_c from public.characters where id = p_character_id;
  if v_c.id is null then raise exception 'AURA-CHR-404: character not found' using errcode = 'P0404'; end if;
  perform public.gate_write(v_c.project_id, 'casting', 'edit');
  if v_c.merged_into is not null then
    raise exception 'AURA-CHR-409: this character was merged into another; add ages there' using errcode = 'P0409';
  end if;
  if coalesce(trim(p_label), '') = '' or coalesce(trim(p_age), '') = '' then
    raise exception 'AURA-CHR-400: an age needs a name and an age' using errcode = 'P0400';
  end if;
  if exists (select 1 from public.character_age_states where character_id = p_character_id and lower(label) = lower(trim(p_label)) and id is distinct from p_id) then
    raise exception 'AURA-CHR-409: this character already has an age with that name' using errcode = 'P0409';
  end if;
  if p_id is null then
    if (select count(*) from public.character_age_states where character_id = p_character_id) >= 12 then
      raise exception 'AURA-CHR-400: a character can have up to 12 ages' using errcode = 'P0400';
    end if;
    insert into public.character_age_states(org_id, project_id, character_id, label, age, description, created_by)
    values (v_c.org_id, v_c.project_id, v_c.id, trim(p_label), trim(p_age), nullif(trim(p_description), ''), auth.uid())
    returning * into v;
  else
    update public.character_age_states set label = trim(p_label), age = trim(p_age), description = nullif(trim(p_description), '')
      where id = p_id and character_id = p_character_id returning * into v;
    if v.id is null then raise exception 'AURA-CHR-404: age not found' using errcode = 'P0404'; end if;
  end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_c.org_id, auth.uid(), 'CharacterAgeSaved', 'CharacterAgeState', v.id, jsonb_build_object('character_id', v_c.id, 'label', v.label, 'age', v.age));
  return v;
end;
$$;

-- Removing an age keeps its reference views (their age is cleared) and flags any Scene DNA that used it.
create or replace function public.delete_character_age_state(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.character_age_states;
begin
  select * into v from public.character_age_states where id = p_id;
  if v.id is null then raise exception 'AURA-CHR-404: age not found' using errcode = 'P0404'; end if;
  perform public.gate_write(v.project_id, 'casting', 'edit');
  delete from public.character_age_states where id = p_id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v.org_id, auth.uid(), 'CharacterAgeDeleted', 'CharacterAgeState', v.id, jsonb_build_object('character_id', v.character_id, 'label', v.label));
end;
$$;

-- Reference views for an age: same request as before plus the age (the signature gains one trailing parameter).
drop function if exists public.request_character_reference(uuid, uuid, text, text, text, text, text[], text, text, text, text, int, jsonb, text);
create or replace function public.request_character_reference(p_character uuid, p_look uuid, p_angle text, p_size text, p_aspect text,
  p_prompt text, p_negative text[], p_identity_hash text, p_provider text, p_model text, p_execution text, p_seed int, p_sketch jsonb, p_engine_version text,
  p_age_state uuid default null)
returns public.character_reference_images
language plpgsql security definer set search_path = public as $$
declare v public.character_reference_images; c public.characters; v_job uuid;
begin
  select * into c from public.characters where id = p_character;
  if c.id is null then raise exception 'AURA-CHR-404: character not found' using errcode = 'P0404'; end if;
  perform public.gate_write(c.project_id, 'casting', 'edit');
  if p_look is not null and not exists (select 1 from public.wardrobe_looks where id = p_look and character_id = p_character) then
    raise exception 'AURA-CHR-400: that wardrobe look isn''t this character''s' using errcode = 'P0400';
  end if;
  if p_age_state is not null and not exists (select 1 from public.character_age_states where id = p_age_state and character_id = p_character) then
    raise exception 'AURA-CHR-400: that age isn''t this character''s' using errcode = 'P0400';
  end if;
  if (select count(*) from public.character_reference_images where created_by = auth.uid() and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'AURA-CHR-429: that''s a lot of images in a minute — give it a moment' using errcode = 'P0429';
  end if;
  insert into public.jobs(org_id, project_id, engine_id, engine_version, input_snapshot)
  values (c.org_id, c.project_id, 'character.reference', p_engine_version, jsonb_build_object('character_id', p_character, 'angle', p_angle, 'size', p_size, 'provider', p_provider, 'age_state_id', p_age_state))
  returning id into v_job;
  insert into public.character_reference_images(org_id, project_id, character_id, look_id, age_state_id, angle, size, aspect_ratio, prompt, negative, identity_hash,
    provider, model, execution, seed, sketch, engine_version, job_id, created_by)
  values (c.org_id, c.project_id, p_character, p_look, p_age_state, p_angle, p_size, p_aspect, p_prompt, coalesce(p_negative, '{}'), p_identity_hash,
    p_provider, p_model, p_execution, coalesce(p_seed, 1), coalesce(p_sketch, '{}'), p_engine_version, v_job, auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (c.org_id, auth.uid(), 'CharacterReferenceRequested', 'Character', p_character, jsonb_build_object('angle', p_angle, 'size', p_size, 'provider', p_provider, 'age_state_id', p_age_state));
  return v;
end;
$$;

-- Scene DNA: the age each character is in this scene (character_id -> age_state_id), saved like wardrobe.
create or replace function app_private.save_scene_dna(p_project_id uuid, p_scene_id uuid, p_patch jsonb)
returns public.scene_dna
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_d public.scene_dna;
begin
  v_org := public.scene_dna_assert(p_project_id, p_scene_id);
  if p_patch ? 'ages' and jsonb_typeof(p_patch->'ages') is distinct from 'object' and p_patch->'ages' <> 'null'::jsonb then
    raise exception 'AURA-SDNA-400: ages must map characters to ages' using errcode = 'P0400';
  end if;
  insert into public.scene_dna(org_id, project_id, scene_id) values (v_org, p_project_id, p_scene_id)
    on conflict (scene_id) do nothing;
  update public.scene_dna set
    purpose = case when p_patch ? 'purpose' then nullif(p_patch->>'purpose', '') else purpose end,
    stakes = case when p_patch ? 'stakes' then nullif(p_patch->>'stakes', '') else stakes end,
    story_time = case when p_patch ? 'story_time' then nullif(p_patch->>'story_time', '') else story_time end,
    mood = case when p_patch ? 'mood' then coalesce(array(select jsonb_array_elements_text(p_patch->'mood')), '{}') else mood end,
    weather = case when p_patch ? 'weather' then nullif(p_patch->>'weather', '') else weather end,
    atmosphere = case when p_patch ? 'atmosphere' then nullif(p_patch->>'atmosphere', '') else atmosphere end,
    lighting_intent = case when p_patch ? 'lighting_intent' then nullif(p_patch->>'lighting_intent', '') else lighting_intent end,
    sound_intent = case when p_patch ? 'sound_intent' then nullif(p_patch->>'sound_intent', '') else sound_intent end,
    camera_energy = case when p_patch ? 'camera_energy' then nullif(p_patch->>'camera_energy', '') else camera_energy end,
    silent_scene = case when p_patch ? 'silent_scene' then (p_patch->>'silent_scene')::boolean else silent_scene end,
    wardrobe = case when p_patch ? 'wardrobe' then coalesce(p_patch->'wardrobe', '{}'::jsonb) else wardrobe end,
    ages = case when p_patch ? 'ages' then coalesce(nullif(p_patch->'ages', 'null'::jsonb), '{}'::jsonb) else ages end,
    notes = case when p_patch ? 'notes' then nullif(p_patch->>'notes', '') else notes end,
    status = 'draft'
  where scene_id = p_scene_id returning * into v_d;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'SceneDNAUpdated', 'SceneDNA', v_d.id, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return v_d;
end;
$$;

revoke execute on function public.save_character_age_state(uuid, uuid, text, text, text), public.delete_character_age_state(uuid),
  public.request_character_reference(uuid, uuid, text, text, text, text, text[], text, text, text, text, int, jsonb, text, uuid) from public, anon;
grant execute on function public.save_character_age_state(uuid, uuid, text, text, text), public.delete_character_age_state(uuid),
  public.request_character_reference(uuid, uuid, text, text, text, text, text[], text, text, text, text, int, jsonb, text, uuid) to authenticated;
revoke all on function app_private.save_scene_dna(uuid, uuid, jsonb) from public, anon, authenticated;
