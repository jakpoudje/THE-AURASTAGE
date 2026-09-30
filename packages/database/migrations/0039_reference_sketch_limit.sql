-- Casting "Generate all character looks" (2026-09-30) queues the standard views for the whole cast at once. The per-minute
-- limit counted free built-in sketches like paid images (40), so a cast of more than five stopped partway (seen live).
-- Same function as 0035, with separate limits: built-in sketches 400 a minute, paid providers still 40.
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
  -- Paid providers: at most 40 a minute per person (a safety net against accidental spend). The built-in sketch is free
  -- and quick, so it allows 400 — enough for "Generate all character looks" on a large cast in one click.
  -- Keyed on the provider (what the worker actually calls), not the caller-supplied execution label.
  if p_provider = 'aurastage-sketch' then
    if (select count(*) from public.character_reference_images where created_by = auth.uid() and provider = 'aurastage-sketch' and created_at > now() - interval '1 minute') >= 400 then
      raise exception 'AURA-CHR-429: that''s a lot of sketches in a minute — give it a moment' using errcode = 'P0429';
    end if;
  elsif (select count(*) from public.character_reference_images where created_by = auth.uid() and provider <> 'aurastage-sketch' and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'AURA-CHR-429: that''s a lot of paid images in a minute — give it a moment' using errcode = 'P0429';
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
revoke execute on function public.request_character_reference(uuid, uuid, text, text, text, text, text[], text, text, text, text, int, jsonb, text, uuid) from public, anon;
grant execute on function public.request_character_reference(uuid, uuid, text, text, text, text, text[], text, text, text, text, int, jsonb, text, uuid) to authenticated;
