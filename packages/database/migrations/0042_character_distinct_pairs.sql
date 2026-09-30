-- Characters named twice (owner report 2026-09-30): Casting now points out likely duplicates ("AMARA" / "AMARA BELLO")
-- for a one-click merge (the existing merge_characters). When a person says two characters are NOT the same, that
-- answer is kept here so the suggestion never comes back. Owned by Casting; written only through the gated function.
alter table public.characters add column if not exists distinct_from uuid[] not null default '{}';

create or replace function app_private.mark_characters_distinct(p_a uuid, p_b uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_a public.characters; v_b public.characters;
begin
  if p_a = p_b then raise exception 'AURA-CHR-400: choose two different characters' using errcode = 'P0400'; end if;
  select * into v_a from public.characters where id = p_a for update;
  select * into v_b from public.characters where id = p_b for update;
  if v_a.id is null or v_b.id is null or v_a.project_id <> v_b.project_id then
    raise exception 'AURA-CHR-404: characters not found in the same project' using errcode = 'P0404';
  end if;
  perform public.casting_assert_member(v_a.project_id);
  update public.characters set distinct_from = array(select distinct unnest(distinct_from || p_b)) where id = p_a;
  update public.characters set distinct_from = array(select distinct unnest(distinct_from || p_a)) where id = p_b;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_a.org_id, auth.uid(), 'CharactersMarkedDistinct', 'Character', v_a.id, jsonb_build_object('other_id', v_b.id, 'names', jsonb_build_array(v_a.name, v_b.name)));
end;
$$;
revoke all on function app_private.mark_characters_distinct(uuid, uuid) from public, anon, authenticated;

create or replace function public.mark_characters_distinct(p_a uuid, p_b uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.gate_write((select project_id from public.characters where id = p_a), 'casting', 'edit');
  perform app_private.mark_characters_distinct(p_a, p_b);
end;
$$;
revoke all on function public.mark_characters_distinct(uuid, uuid) from public, anon;
grant execute on function public.mark_characters_distinct(uuid, uuid) to authenticated;
