-- Delete an asset for good (owner request 2026-09-30: "all assets should be deletable with warnings ... where it's been
-- used"). Owned by the Assets Library; gated like every other asset write (assets:edit) and audited.
--  * A recording placed on Audio Studio clips can't be deleted (the mix would lose its sound): the error names the
--    scenes; remove it from those clips first, or archive it to hide it.
--  * Anything else it is used for (links to scenes/characters/places, reference views in Casting or Locations & Props,
--    deliverables already made) needs p_confirm = true — the API shows the exact list first. Reference views then count
--    as missing (their asset_id is cleared by the existing ON DELETE SET NULL) and can be made again; delivered files
--    keep their own copy.
-- Returns the storage paths of every version so the API removes the files from the private bucket.
create or replace function public.delete_asset(p_asset uuid, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.assets; v_paths text[]; v_scenes text; v_uses int;
begin
  select * into a from public.assets where id = p_asset for update;
  if a.id is null or a.project_id is null then raise exception 'AURA-AST-404: asset not found' using errcode = 'P0404'; end if;
  perform public.gate_write(a.project_id, 'assets', 'edit');

  select string_agg(distinct 'Scene ' || s.number, ', ') into v_scenes
    from public.audio_clips c join public.audio_sessions se on se.id = c.session_id join public.scenes s on s.id = se.scene_id
   where c.asset_id = a.id;
  if v_scenes is not null then
    raise exception 'AURA-AST-409: “%” is placed on Audio Studio clips in % — remove it from those clips first (or archive it to hide it)', a.name, v_scenes
      using errcode = 'P0409';
  end if;

  select (select count(*) from public.asset_links where asset_id = a.id)
       + (select count(*) from public.character_reference_images where asset_id = a.id)
       + (select count(*) from public.world_reference_images where asset_id = a.id)
       + (select count(*) from public.renders r where r.project_id = a.project_id and r.manifest::text like '%' || a.id::text || '%')
    into v_uses;
  if v_uses > 0 and not coalesce(p_confirm, false) then
    raise exception 'AURA-AST-409: “%” is in use in this project — confirm to delete it anyway', a.name using errcode = 'P0409';
  end if;

  select array_remove(array_agg(distinct p), null) into v_paths
    from (select a.storage_path as p union all select storage_path from public.asset_versions where asset_id = a.id) x;
  delete from public.assets where id = a.id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (a.org_id, auth.uid(), 'AssetDeleted', 'Asset', a.id, jsonb_build_object('name', a.name, 'uses', v_uses, 'files', coalesce(array_length(v_paths, 1), 0)));
  return jsonb_build_object('name', a.name, 'storage_paths', to_jsonb(coalesce(v_paths, '{}')));
end;
$$;
revoke all on function public.delete_asset(uuid, boolean) from public, anon;
grant execute on function public.delete_asset(uuid, boolean) to authenticated;
