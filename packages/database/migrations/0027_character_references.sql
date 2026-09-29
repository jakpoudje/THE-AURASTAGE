-- Character look panel (owner request 2026-09-28): reference views of each character (front / three-quarter / profile /
-- back × close-up … full) built from the Casting profile, wardrobe look and project style (characterLookEngine), made by
-- an image backend from the Provider Gateway in the generation worker, and kept as Assets linked to the character.
-- Casting owns the request records; the Assets domain registers the files. Each record keeps the identity hash it was
-- made from, so a later profile change marks it "profile changed" instead of silently replacing it (rules 10, 11).

-- ---- Assets domain: register a generated file linked to any object it belongs to -----------------------------------
create or replace function app_private.register_generated_asset_linked(p_project uuid, p_created_by uuid, p_type text, p_name text,
  p_storage_path text, p_checksum text, p_metadata jsonb, p_note text, p_category text, p_link_type text, p_link_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from public.projects where id = p_project;
  if v_org is null then raise exception 'AURA-AST-404: project not found' using errcode = 'P0404'; end if;
  insert into public.assets(org_id, project_id, type, name, storage_path, checksum, metadata, created_by, description, tags, category)
  values (v_org, p_project, p_type, left(p_name, 200), p_storage_path, p_checksum, coalesce(p_metadata, '{}'::jsonb), p_created_by,
          left(coalesce(p_note, ''), 2000), array['generated'], p_category)
  returning id into v_id;
  update public.asset_versions set note = left(coalesce(p_note, 'Generated'), 500) where asset_id = v_id and version_number = 1;
  if p_link_type is not null and p_link_id is not null then
    insert into public.asset_links(org_id, project_id, asset_id, object_type, object_id, created_by)
    values (v_org, p_project, v_id, p_link_type, p_link_id, p_created_by) on conflict do nothing;
  end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, p_created_by, 'AssetRegistered', 'Asset', v_id, jsonb_build_object('type', p_type, 'name', p_name, 'generated', true, 'size', p_metadata->'size_bytes'));
  return v_id;
end;
$$;
revoke all on function app_private.register_generated_asset_linked(uuid, uuid, text, text, text, text, jsonb, text, text, text, uuid) from public, anon, authenticated;

-- ---- Casting: reference image requests ----------------------------------------------------------------------------
create table if not exists public.character_reference_images (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  look_id uuid references public.wardrobe_looks(id) on delete set null,
  angle text not null check (angle in ('front','three_quarter','profile','back')),
  size text not null check (size in ('CU','MCU','MS','FULL')),
  aspect_ratio text not null check (aspect_ratio in ('1:1','9:16')),
  prompt text not null check (char_length(prompt) between 1 and 4000),
  negative text[] not null default '{}',
  -- characterLookEngine identity hash at request time (what the image depicts).
  identity_hash text not null,
  provider text not null,
  model text not null,
  execution text not null check (execution in ('native','local','external','test')),
  seed int not null default 1,
  sketch jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  asset_id uuid references public.assets(id) on delete set null,
  error text,
  engine_version text not null,
  job_id uuid references public.jobs(id) on delete set null,
  provider_request_id text,
  cost_usd numeric,
  attempt int not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists idx_char_refs_character on public.character_reference_images(character_id, created_at desc);
create index if not exists idx_char_refs_queue on public.character_reference_images(status, created_at) where status in ('queued','running');
alter table public.character_reference_images enable row level security;
drop policy if exists character_reference_images_select on public.character_reference_images;
create policy character_reference_images_select on public.character_reference_images for select
  using (project_id = any ((select public.my_project_ids())::uuid[]));

-- One request per view; the caller passes the engine's output (prompt, identity hash) so the record says exactly what
-- was asked for (rule 10).
create or replace function public.request_character_reference(p_character uuid, p_look uuid, p_angle text, p_size text, p_aspect text,
  p_prompt text, p_negative text[], p_identity_hash text, p_provider text, p_model text, p_execution text, p_seed int, p_sketch jsonb, p_engine_version text)
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
  if (select count(*) from public.character_reference_images where created_by = auth.uid() and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'AURA-CHR-429: that''s a lot of images in a minute — give it a moment' using errcode = 'P0429';
  end if;
  insert into public.jobs(org_id, project_id, engine_id, engine_version, input_snapshot)
  values (c.org_id, c.project_id, 'character.reference', p_engine_version, jsonb_build_object('character_id', p_character, 'angle', p_angle, 'size', p_size, 'provider', p_provider))
  returning id into v_job;
  insert into public.character_reference_images(org_id, project_id, character_id, look_id, angle, size, aspect_ratio, prompt, negative, identity_hash,
    provider, model, execution, seed, sketch, engine_version, job_id, created_by)
  values (c.org_id, c.project_id, p_character, p_look, p_angle, p_size, p_aspect, p_prompt, coalesce(p_negative, '{}'), p_identity_hash,
    p_provider, p_model, p_execution, coalesce(p_seed, 1), coalesce(p_sketch, '{}'), p_engine_version, v_job, auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (c.org_id, auth.uid(), 'CharacterReferenceRequested', 'Character', p_character, jsonb_build_object('angle', p_angle, 'size', p_size, 'provider', p_provider));
  return v;
end;
$$;

create or replace function public.worker_claim_character_reference(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.character_reference_images;
begin
  perform public.worker_check(p_token);
  select * into v from public.character_reference_images
    where status = 'queued' or (status = 'running' and started_at < now() - interval '15 minutes' and attempt < 3)
    order by created_at limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.character_reference_images set status = 'running', attempt = attempt + 1, started_at = now() where id = v.id returning * into v;
  update public.jobs set status = 'running', attempt = v.attempt, started_at = now() where id = v.job_id;
  return to_jsonb(v);
end;
$$;

create or replace function public.worker_complete_character_reference(p_token text, p_id uuid, p_storage_key text, p_checksum text,
  p_metadata jsonb, p_request_id text, p_cost numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v public.character_reference_images; v_asset uuid; v_name text;
begin
  perform public.worker_check(p_token);
  select * into v from public.character_reference_images where id = p_id and status = 'running' for update;
  if v.id is null then return (select asset_id from public.character_reference_images where id = p_id); end if; -- idempotent
  perform set_config('aura.project_id', v.project_id::text, true);
  select name || ' — ' || case v.angle when 'three_quarter' then '¾' else initcap(v.angle) end || ' ' || v.size || ' reference' into v_name
    from public.characters where id = v.character_id;
  v_asset := app_private.register_generated_asset_linked(v.project_id, v.created_by, 'image', v_name, p_storage_key, p_checksum,
    p_metadata || jsonb_build_object('generated', jsonb_build_object('reference_id', v.id, 'provider', v.provider, 'model', v.model, 'execution', v.execution,
      'engine_version', v.engine_version, 'identity_hash', v.identity_hash, 'angle', v.angle, 'size', v.size)),
    'Generated by ' || v.provider || ' (' || v.model || ') from the Casting profile — ' || left(v.prompt, 400), 'characters', 'character', v.character_id);
  update public.character_reference_images set status = 'succeeded', asset_id = v_asset, completed_at = now(), provider_request_id = p_request_id,
    cost_usd = p_cost, error = null where id = v.id;
  update public.jobs set status = 'completed', completed_at = now(), provider_request_id = p_request_id, cost_actual = p_cost,
    output_refs = jsonb_build_object('asset_id', v_asset) where id = v.job_id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v.org_id, v.created_by, 'CharacterReferenceGenerated', 'Character', v.character_id, jsonb_build_object('asset_id', v_asset, 'angle', v.angle, 'size', v.size, 'provider', v.provider));
  return v_asset;
end;
$$;

create or replace function public.worker_fail_character_reference(p_token text, p_id uuid, p_error text, p_request_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.character_reference_images;
begin
  perform public.worker_check(p_token);
  update public.character_reference_images set status = 'failed', error = left(coalesce(p_error, 'Generation failed'), 1000), completed_at = now(), provider_request_id = p_request_id
    where id = p_id and status = 'running' returning * into v;
  if v.id is null then return; end if;
  update public.jobs set status = 'failed', completed_at = now(), error = jsonb_build_object('message', left(p_error, 500)) where id = v.job_id;
end;
$$;

revoke execute on function public.request_character_reference(uuid, uuid, text, text, text, text, text[], text, text, text, text, int, jsonb, text) from public, anon;
grant execute on function public.request_character_reference(uuid, uuid, text, text, text, text, text[], text, text, text, text, int, jsonb, text) to authenticated;
revoke execute on function public.worker_claim_character_reference(text), public.worker_complete_character_reference(text, uuid, text, text, jsonb, text, numeric),
  public.worker_fail_character_reference(text, uuid, text, text) from public, authenticated;
grant execute on function public.worker_claim_character_reference(text), public.worker_complete_character_reference(text, uuid, text, text, jsonb, text, numeric),
  public.worker_fail_character_reference(text, uuid, text, text) to anon;
