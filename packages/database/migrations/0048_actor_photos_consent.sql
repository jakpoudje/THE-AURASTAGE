-- Actor photos as a character's reference (BUILD_PLAN §8 item 14, 2026-10-01). A real performer's photos may replace the
-- generated reference views for the character they play — only with a consent record: who the performer is, the consent
-- statement they agreed to, who recorded it and when. Photos are uploaded through the Assets Library (which owns files)
-- and linked here as reference views (execution 'upload'), exactly where a generated view would be, so prompts and
-- providers use them the same way. Withdrawing consent stops every photo under it from being used at once (the files
-- stay in the Assets Library for the record; they're no longer a reference). The Assets Library sees the photo's use through
-- character_reference_images, as for generated views (Casting never writes Assets tables). Writes: gate_write(project, 'casting', 'edit').
create table if not exists public.performer_consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  performer_name text not null check (char_length(performer_name) between 1 and 120),
  statement text not null check (char_length(statement) between 20 and 2000),
  recorded_by uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);
create index if not exists idx_performer_consents_character on public.performer_consents(character_id, recorded_at desc);
alter table public.performer_consents enable row level security;
drop policy if exists performer_consents_select on public.performer_consents;
create policy performer_consents_select on public.performer_consents for select using (project_id = any ((select public.my_project_ids())::uuid[]));
revoke insert, update, delete on public.performer_consents from anon, authenticated;
grant select on public.performer_consents to authenticated;

alter table public.character_reference_images drop constraint if exists character_reference_images_execution_check;
alter table public.character_reference_images add constraint character_reference_images_execution_check check (execution in ('native','local','external','test','upload'));
-- 'withdrawn': a photo whose consent was withdrawn (not a failed generation — readiness evidence never counts it).
alter table public.character_reference_images drop constraint if exists character_reference_images_status_check;
alter table public.character_reference_images add constraint character_reference_images_status_check check (status in ('queued','running','succeeded','failed','withdrawn'));
alter table public.character_reference_images add column if not exists consent_id uuid references public.performer_consents(id) on delete restrict;
create index if not exists idx_char_refs_consent on public.character_reference_images(consent_id) where consent_id is not null;
alter table public.character_reference_images drop constraint if exists character_reference_images_upload_consent;
alter table public.character_reference_images add constraint character_reference_images_upload_consent check ((execution = 'upload') = (consent_id is not null));

create or replace function public.record_performer_consent(p_character uuid, p_performer text, p_statement text)
returns public.performer_consents
language plpgsql security definer set search_path = public as $$
declare c public.characters; v public.performer_consents;
begin
  select * into c from public.characters where id = p_character;
  if c.id is null then raise exception 'AURA-CHR-404: character not found' using errcode = 'P0404'; end if;
  perform public.gate_write(c.project_id, 'casting', 'edit');
  insert into public.performer_consents(org_id, project_id, character_id, performer_name, statement, recorded_by)
  values (c.org_id, c.project_id, c.id, trim(p_performer), trim(p_statement), auth.uid()) returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (c.org_id, auth.uid(), 'PerformerConsentRecorded', 'Character', c.id, jsonb_build_object('consent_id', v.id, 'performer', v.performer_name));
  return v;
end;
$$;

create or replace function public.add_actor_photo(p_character uuid, p_consent uuid, p_asset uuid, p_angle text, p_size text, p_look uuid, p_age_state uuid, p_identity_hash text, p_engine_version text)
returns public.character_reference_images
language plpgsql security definer set search_path = public as $$
declare c public.characters; k public.performer_consents; a public.assets; v public.character_reference_images;
begin
  select * into c from public.characters where id = p_character;
  if c.id is null then raise exception 'AURA-CHR-404: character not found' using errcode = 'P0404'; end if;
  perform public.gate_write(c.project_id, 'casting', 'edit');
  select * into k from public.performer_consents where id = p_consent;
  if k.id is null or k.character_id <> c.id then raise exception 'AURA-CHR-400: record the performer''s consent for this character first' using errcode = 'P0400'; end if;
  if k.revoked_at is not null then raise exception 'AURA-CHR-409: that consent was withdrawn — photos can''t be used under it' using errcode = 'P0409'; end if;
  if p_look is not null and not exists (select 1 from public.wardrobe_looks where id = p_look and character_id = c.id) then
    raise exception 'AURA-CHR-400: that wardrobe look isn''t this character''s' using errcode = 'P0400'; end if;
  if p_age_state is not null and not exists (select 1 from public.character_age_states where id = p_age_state and character_id = c.id) then
    raise exception 'AURA-CHR-400: that age isn''t this character''s' using errcode = 'P0400'; end if;
  select * into a from public.assets where id = p_asset;
  if a.id is null or a.project_id <> c.project_id or a.type <> 'image' then raise exception 'AURA-CHR-400: the photo must be an image in this project''s Assets Library' using errcode = 'P0400'; end if;
  insert into public.character_reference_images(org_id, project_id, character_id, look_id, age_state_id, angle, size, aspect_ratio, prompt, identity_hash, provider, model, execution, status, asset_id, engine_version, completed_at, consent_id, created_by)
  values (c.org_id, c.project_id, c.id, p_look, p_age_state, p_angle, p_size, case when p_size = 'FULL' then '9:16' else '1:1' end,
    left('Photo of ' || k.performer_name || ' (performer, with consent) as ' || c.name, 4000), p_identity_hash, 'performer', 'photo', 'upload', 'succeeded', a.id, p_engine_version, now(), k.id, auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (c.org_id, auth.uid(), 'ActorPhotoAdded', 'Character', c.id, jsonb_build_object('consent_id', k.id, 'asset_id', a.id, 'view', p_angle || ':' || p_size));
  return v;
end;
$$;

create or replace function public.revoke_performer_consent(p_consent uuid)
returns public.performer_consents
language plpgsql security definer set search_path = public as $$
declare k public.performer_consents; n int;
begin
  select * into k from public.performer_consents where id = p_consent for update;
  if k.id is null then raise exception 'AURA-CHR-404: consent not found' using errcode = 'P0404'; end if;
  perform public.gate_write(k.project_id, 'casting', 'edit');
  if k.revoked_at is null then
    update public.performer_consents set revoked_at = now(), revoked_by = auth.uid() where id = k.id returning * into k;
    update public.character_reference_images set status = 'withdrawn', error = 'Consent withdrawn — this photo is no longer used' where consent_id = k.id and status = 'succeeded';
    get diagnostics n = row_count;
    insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
    values (k.org_id, auth.uid(), 'PerformerConsentWithdrawn', 'Character', k.character_id, jsonb_build_object('consent_id', k.id, 'photos_withdrawn', n));
  end if;
  return k;
end;
$$;
revoke all on function public.record_performer_consent(uuid, text, text), public.add_actor_photo(uuid, uuid, uuid, text, text, uuid, uuid, text, text), public.revoke_performer_consent(uuid) from public, anon;
grant execute on function public.record_performer_consent(uuid, text, text), public.add_actor_photo(uuid, uuid, uuid, text, text, uuid, uuid, text, text), public.revoke_performer_consent(uuid) to authenticated;
