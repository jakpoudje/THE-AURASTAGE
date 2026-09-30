-- On-screen text per scene (owner request "titles, texts and credits", 2026-09-30): a caption such as "LAGOS — 1995" or
-- "Three years later", shown over the start of the scene in video deliverables (renderManifest 1.5.0). Owned by Scene DNA,
-- saved through the same gated function as every other Scene DNA field. Changing only the text keeps a locked scene locked.
alter table public.scene_dna add column if not exists on_screen_text text check (on_screen_text is null or char_length(on_screen_text) <= 200);
alter table public.scene_dna add column if not exists on_screen_position text not null default 'lower_third'
  check (on_screen_position in ('lower_third', 'top', 'center'));

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
    on_screen_text = case when p_patch ? 'on_screen_text' then nullif(btrim(p_patch->>'on_screen_text'), '') else on_screen_text end,
    on_screen_position = case when p_patch ? 'on_screen_position' then coalesce(nullif(p_patch->>'on_screen_position', ''), 'lower_third') else on_screen_position end,
    -- On-screen text is a finishing touch: changing only it keeps a locked scene locked (nothing it shapes upstream of the
    -- edit changes); any other field opens the blueprint for editing again, as before.
    status = case when not exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('on_screen_text', 'on_screen_position')) then status else 'draft' end
  where scene_id = p_scene_id returning * into v_d;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'SceneDNAUpdated', 'SceneDNA', v_d.id, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
  return v_d;
end;
$$;
