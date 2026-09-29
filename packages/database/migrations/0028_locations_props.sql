-- Locations & Props (SRS: Location and Prop are canonical "Scene/Asset domain" entities; owner, 2026-09-28: the look panel
-- "goes with environments and props too"). One canonical record per place and per prop, found in the approved script by
-- worldExtractionEngine (the API passes the engine's output with the approved version id it read) or added by hand.
-- Script facts (INT/EXT, times of day, sub-areas, the scenes and lines they appear on) refresh on every sync; the name,
-- description and status are the person's and are never overwritten. Something no longer in the script is flagged, never
-- deleted (rule 11). Reference views work like the character look panel (0027): requests here, images made by the
-- generation worker, files registered by the Assets domain under Locations / Props / Vehicles and linked to the item.
-- Writes are gated like Scene DNA edits (the Scene domain owns these records).

-- ---- Canonical records ------------------------------------------------------------------------------------------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 160),
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  int_ext text[] not null default '{}',
  times_of_day text[] not null default '{}',
  areas text[] not null default '{}',
  source text not null check (source in ('script','manual')),
  status text not null default 'detected' check (status in ('detected','confirmed')),
  -- The approved script version in which a script-found item was no longer found (flag, never a deletion).
  missing_since_version_id uuid,
  last_script_version_id uuid,
  archived_at timestamptz,
  revision int not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key)
);
create table if not exists public.props (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 160),
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null default 'prop' check (category in ('prop','vehicle')),
  descriptors text[] not null default '{}',
  confidence text not null default 'medium' check (confidence in ('high','medium','manual')),
  reason text not null default '',
  source text not null check (source in ('script','manual')),
  status text not null default 'detected' check (status in ('detected','confirmed')),
  missing_since_version_id uuid,
  last_script_version_id uuid,
  archived_at timestamptz,
  revision int not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key)
);
-- Where each one is used, with the source line (evidence). Script rows are rebuilt on sync; manual rows are kept.
create table if not exists public.world_appearances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  object_type text not null check (object_type in ('location','prop')),
  object_id uuid not null,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  scene_number int not null,
  line int,
  evidence text not null default '' check (char_length(evidence) <= 400),
  source text not null check (source in ('script','manual')),
  script_version_id uuid,
  created_at timestamptz not null default now(),
  unique (object_type, object_id, scene_id)
);
create index if not exists idx_world_appearances_project on public.world_appearances(project_id, object_type);
create index if not exists idx_locations_project on public.locations(project_id);
create index if not exists idx_props_project on public.props(project_id);
alter table public.locations enable row level security;
alter table public.props enable row level security;
alter table public.world_appearances enable row level security;
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations for select using (project_id = any ((select public.my_project_ids())::uuid[]));
drop policy if exists props_select on public.props;
create policy props_select on public.props for select using (project_id = any ((select public.my_project_ids())::uuid[]));
drop policy if exists world_appearances_select on public.world_appearances;
create policy world_appearances_select on public.world_appearances for select using (project_id = any ((select public.my_project_ids())::uuid[]));

-- ---- Sync from the approved script ------------------------------------------------------------------------------
-- p_locations: [{key, name, int_ext[], times_of_day[], areas[], scenes:[{scene_number, line, text}]}]
-- p_props:     [{key, name, category, descriptors[], confidence, reason, scenes:[...]}]
create or replace function public.sync_world(p_project uuid, p_version uuid, p_locations jsonb, p_props jsonb, p_engine_version text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_script public.scripts; v_org uuid; it jsonb; ev jsonb; v_id uuid; v_scene uuid; v_new_l int := 0; v_new_p int := 0; v_flag int := 0; v_keys text[]; v_summary jsonb; v_ins boolean;
begin
  perform public.gate_write(p_project, 'scene_dna', 'edit');
  select * into v_script from public.scripts where project_id = p_project;
  if v_script.id is null or v_script.approved_version_id is distinct from p_version then
    raise exception 'AURA-WLD-409: the approved script changed; reload and find them again' using errcode = 'P0409';
  end if;
  select org_id into v_org from public.projects where id = p_project;
  if jsonb_array_length(coalesce(p_locations, '[]')) > 500 or jsonb_array_length(coalesce(p_props, '[]')) > 1000 then
    raise exception 'AURA-WLD-400: too many items in one sync' using errcode = 'P0400';
  end if;
  delete from public.world_appearances where project_id = p_project and source = 'script';

  v_keys := '{}';
  for it in select * from jsonb_array_elements(coalesce(p_locations, '[]')) loop
    insert into public.locations(org_id, project_id, key, name, int_ext, times_of_day, areas, source, last_script_version_id, created_by)
    values (v_org, p_project, left(it->>'key', 160), left(it->>'name', 160), array(select jsonb_array_elements_text(it->'int_ext')),
      array(select jsonb_array_elements_text(it->'times_of_day')), array(select jsonb_array_elements_text(it->'areas')), 'script', p_version, auth.uid())
    on conflict (project_id, key) do update set
      int_ext = excluded.int_ext, times_of_day = excluded.times_of_day, areas = excluded.areas,
      last_script_version_id = p_version, missing_since_version_id = null, updated_at = now()
    returning id, (xmax = 0) into v_id, v_ins;
    if v_ins then v_new_l := v_new_l + 1; end if;
    v_keys := v_keys || (it->>'key');
    for ev in select * from jsonb_array_elements(coalesce(it->'scenes', '[]')) loop
      select id into v_scene from public.scenes where script_id = v_script.id and number = (ev->>'scene_number')::int and status = 'active';
      if v_scene is null then continue; end if;
      insert into public.world_appearances(org_id, project_id, object_type, object_id, scene_id, scene_number, line, evidence, source, script_version_id)
      values (v_org, p_project, 'location', v_id, v_scene, (ev->>'scene_number')::int, (ev->>'line')::int, left(coalesce(ev->>'text', ''), 400), 'script', p_version)
      on conflict (object_type, object_id, scene_id) do nothing;
    end loop;
  end loop;
  update public.locations set missing_since_version_id = p_version, updated_at = now()
    where project_id = p_project and source = 'script' and archived_at is null and missing_since_version_id is null and not (key = any(v_keys));
  get diagnostics v_flag = row_count;

  v_keys := '{}';
  for it in select * from jsonb_array_elements(coalesce(p_props, '[]')) loop
    insert into public.props(org_id, project_id, key, name, category, descriptors, confidence, reason, source, last_script_version_id, created_by)
    values (v_org, p_project, left(it->>'key', 160), left(it->>'name', 160), coalesce(it->>'category', 'prop'),
      array(select jsonb_array_elements_text(coalesce(it->'descriptors', '[]'))), coalesce(it->>'confidence', 'medium'), left(coalesce(it->>'reason', ''), 300),
      'script', p_version, auth.uid())
    on conflict (project_id, key) do update set
      descriptors = excluded.descriptors, confidence = case when public.props.confidence = 'manual' then 'manual' else excluded.confidence end,
      reason = excluded.reason, last_script_version_id = p_version, missing_since_version_id = null, updated_at = now()
    returning id, (xmax = 0) into v_id, v_ins;
    if v_ins then v_new_p := v_new_p + 1; end if;
    v_keys := v_keys || (it->>'key');
    for ev in select * from jsonb_array_elements(coalesce(it->'scenes', '[]')) loop
      select id into v_scene from public.scenes where script_id = v_script.id and number = (ev->>'scene_number')::int and status = 'active';
      if v_scene is null then continue; end if;
      insert into public.world_appearances(org_id, project_id, object_type, object_id, scene_id, scene_number, line, evidence, source, script_version_id)
      values (v_org, p_project, 'prop', v_id, v_scene, (ev->>'scene_number')::int, (ev->>'line')::int, left(coalesce(ev->>'text', ''), 400), 'script', p_version)
      on conflict (object_type, object_id, scene_id) do nothing;
    end loop;
  end loop;
  update public.props set missing_since_version_id = p_version, updated_at = now()
    where project_id = p_project and source = 'script' and archived_at is null and missing_since_version_id is null and not (key = any(v_keys));
  v_summary := jsonb_build_object('new_locations', v_new_l, 'new_props', v_new_p,
    'flagged', v_flag + (select count(*) from public.props where project_id = p_project and missing_since_version_id = p_version),
    'locations', jsonb_array_length(coalesce(p_locations, '[]')), 'props', jsonb_array_length(coalesce(p_props, '[]')));
  insert into public.jobs(org_id, project_id, engine_id, engine_version, status, input_snapshot, output_refs, attempt, started_at, completed_at)
  values (v_org, p_project, 'world.worldExtractionEngine', p_engine_version, 'completed', jsonb_build_object('script_version_id', p_version), v_summary, 1, now(), now());
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'WorldSynced', 'Project', p_project, v_summary || jsonb_build_object('script_version_id', p_version));
  return v_summary;
end;
$$;

-- ---- Edit / add by hand -------------------------------------------------------------------------------------------
-- p_id null = add by hand. p_revision must match (optimistic concurrency, 409 otherwise). Only the person's fields change.
create or replace function public.save_world_item(p_project uuid, p_type text, p_id uuid, p_revision int, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_key text; v_row jsonb; v_rev int; v_proj uuid;
begin
  if p_type not in ('location','prop') then raise exception 'AURA-WLD-400: unknown kind' using errcode = 'P0400'; end if;
  perform public.gate_write(p_project, 'scene_dna', 'edit');
  select org_id into v_org from public.projects where id = p_project;
  v_name := nullif(regexp_replace(trim(coalesce(p_patch->>'name', '')), '\s+', ' ', 'g'), '');
  if p_patch ? 'name' and (v_name is null or char_length(v_name) > 160) then raise exception 'AURA-WLD-400: give it a name (up to 160 characters)' using errcode = 'P0400'; end if;
  if char_length(coalesce(p_patch->>'description', '')) > 2000 then raise exception 'AURA-WLD-400: the description is too long (2000 characters max)' using errcode = 'P0400'; end if;
  if p_patch ? 'category' and p_patch->>'category' not in ('prop','vehicle') then raise exception 'AURA-WLD-400: category is prop or vehicle' using errcode = 'P0400'; end if;
  if p_patch ? 'status' and p_patch->>'status' not in ('detected','confirmed') then raise exception 'AURA-WLD-400: bad status' using errcode = 'P0400'; end if;
  v_key := case when v_name is null then null when p_type = 'location' then upper(v_name) else lower(v_name) end;

  if p_type = 'location' then
    if v_key is not null and exists (select 1 from public.locations where project_id = p_project and (key = v_key or upper(name) = upper(v_name)) and id is distinct from p_id) then
      raise exception 'AURA-WLD-409: there''s already a location called %', v_name using errcode = 'P0409';
    end if;
    if p_id is null then
      if v_name is null then raise exception 'AURA-WLD-400: give it a name' using errcode = 'P0400'; end if;
      insert into public.locations(org_id, project_id, key, name, description, int_ext, source, status, created_by)
      values (v_org, p_project, v_key, v_name, coalesce(p_patch->>'description', ''), array(select jsonb_array_elements_text(coalesce(p_patch->'int_ext', '[]'))), 'manual', 'confirmed', auth.uid())
      returning to_jsonb(locations.*) into v_row;
    else
      select project_id, revision into v_proj, v_rev from public.locations where id = p_id for update;
      if v_proj is distinct from p_project then raise exception 'AURA-WLD-404: location not found' using errcode = 'P0404'; end if;
      if v_rev <> p_revision then raise exception 'AURA-WLD-409: someone changed this location since you opened it — reload to see their changes' using errcode = 'P0409'; end if;
      update public.locations set name = coalesce(v_name, name), description = coalesce(p_patch->>'description', description), status = coalesce(p_patch->>'status', status),
        archived_at = case when p_patch ? 'archived' then case when (p_patch->>'archived')::boolean then coalesce(archived_at, now()) else null end else archived_at end,
        revision = revision + 1, updated_at = now()
      where id = p_id returning to_jsonb(locations.*) into v_row;
    end if;
  else
    if v_key is not null and exists (select 1 from public.props where project_id = p_project and (key = v_key or lower(name) = lower(v_name)) and id is distinct from p_id) then
      raise exception 'AURA-WLD-409: there''s already a prop called %', v_name using errcode = 'P0409';
    end if;
    if p_id is null then
      if v_name is null then raise exception 'AURA-WLD-400: give it a name' using errcode = 'P0400'; end if;
      insert into public.props(org_id, project_id, key, name, description, category, confidence, reason, source, status, created_by)
      values (v_org, p_project, v_key, v_name, coalesce(p_patch->>'description', ''), coalesce(p_patch->>'category', 'prop'), 'manual', 'Added by hand', 'manual', 'confirmed', auth.uid())
      returning to_jsonb(props.*) into v_row;
    else
      select project_id, revision into v_proj, v_rev from public.props where id = p_id for update;
      if v_proj is distinct from p_project then raise exception 'AURA-WLD-404: prop not found' using errcode = 'P0404'; end if;
      if v_rev <> p_revision then raise exception 'AURA-WLD-409: someone changed this prop since you opened it — reload to see their changes' using errcode = 'P0409'; end if;
      update public.props set name = coalesce(v_name, name), description = coalesce(p_patch->>'description', description), status = coalesce(p_patch->>'status', status),
        category = coalesce(p_patch->>'category', category),
        archived_at = case when p_patch ? 'archived' then case when (p_patch->>'archived')::boolean then coalesce(archived_at, now()) else null end else archived_at end,
        revision = revision + 1, updated_at = now()
      where id = p_id returning to_jsonb(props.*) into v_row;
    end if;
  end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), case when p_id is null then 'WorldItemCreated' else 'WorldItemUpdated' end, initcap(p_type), (v_row->>'id')::uuid,
    jsonb_build_object('name', v_row->>'name', 'fields', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(p_patch) k)));
  return v_row;
end;
$$;

-- ---- Assets domain: files may now be linked to a location or a prop -----------------------------------------------
alter table public.asset_links drop constraint if exists asset_links_object_type_check;
alter table public.asset_links add constraint asset_links_object_type_check check (object_type in ('scene','character','location','prop'));
create or replace function public.set_asset_link(p_asset uuid, p_object_type text, p_object_id uuid, p_linked boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare a public.assets; ok boolean;
begin
  select * into a from public.assets where id = p_asset;
  if a.id is null or a.project_id is null then raise exception 'AURA-AST-404: asset not found' using errcode = 'P0404'; end if;
  perform public.gate_write(a.project_id, 'assets', 'edit');
  ok := case p_object_type
    when 'scene' then exists (select 1 from public.scenes where id = p_object_id and project_id = a.project_id)
    when 'character' then exists (select 1 from public.characters where id = p_object_id and project_id = a.project_id)
    when 'location' then exists (select 1 from public.locations where id = p_object_id and project_id = a.project_id)
    when 'prop' then exists (select 1 from public.props where id = p_object_id and project_id = a.project_id)
    else false end;
  if not ok then raise exception 'AURA-AST-400: that % isn''t in this project', coalesce(p_object_type, 'object') using errcode = 'P0400'; end if;
  if coalesce(p_linked, true) then
    insert into public.asset_links(org_id, project_id, asset_id, object_type, object_id, created_by)
    values (a.org_id, a.project_id, a.id, p_object_type, p_object_id, auth.uid()) on conflict do nothing;
  else
    delete from public.asset_links where asset_id = a.id and object_type = p_object_type and object_id = p_object_id;
  end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (a.org_id, auth.uid(), case when coalesce(p_linked, true) then 'AssetLinked' else 'AssetUnlinked' end, 'Asset', a.id,
          jsonb_build_object('object_type', p_object_type, 'object_id', p_object_id));
  return (select count(*)::int from public.asset_links where asset_id = a.id);
end;
$$;

-- ---- Reference views ------------------------------------------------------------------------------------------------
create table if not exists public.world_reference_images (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  object_type text not null check (object_type in ('location','prop')),
  object_id uuid not null,
  view_key text not null check (view_key ~ '^[a-z_]{2,20}(:[A-Z]{2,12})?$'),
  aspect_ratio text not null check (aspect_ratio in ('16:9','1:1')),
  prompt text not null check (char_length(prompt) between 1 and 4000),
  negative text[] not null default '{}',
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
create index if not exists idx_world_refs_object on public.world_reference_images(object_type, object_id, created_at desc);
create index if not exists idx_world_refs_queue on public.world_reference_images(status, created_at) where status in ('queued','running');
alter table public.world_reference_images enable row level security;
drop policy if exists world_reference_images_select on public.world_reference_images;
create policy world_reference_images_select on public.world_reference_images for select using (project_id = any ((select public.my_project_ids())::uuid[]));

create or replace function public.request_world_reference(p_type text, p_id uuid, p_view text, p_aspect text, p_prompt text, p_negative text[],
  p_identity_hash text, p_provider text, p_model text, p_execution text, p_seed int, p_sketch jsonb, p_engine_version text)
returns public.world_reference_images
language plpgsql security definer set search_path = public as $$
declare v public.world_reference_images; v_project uuid; v_org uuid; v_job uuid;
begin
  if p_type = 'location' then select project_id, org_id into v_project, v_org from public.locations where id = p_id;
  elsif p_type = 'prop' then select project_id, org_id into v_project, v_org from public.props where id = p_id;
  else raise exception 'AURA-WLD-400: unknown kind' using errcode = 'P0400'; end if;
  if v_project is null then raise exception 'AURA-WLD-404: % not found', p_type using errcode = 'P0404'; end if;
  perform public.gate_write(v_project, 'scene_dna', 'edit');
  if (select count(*) from public.world_reference_images where created_by = auth.uid() and created_at > now() - interval '1 minute') >= 40 then
    raise exception 'AURA-WLD-429: that''s a lot of images in a minute — give it a moment' using errcode = 'P0429';
  end if;
  insert into public.jobs(org_id, project_id, engine_id, engine_version, input_snapshot)
  values (v_org, v_project, 'world.reference', p_engine_version, jsonb_build_object('object_type', p_type, 'object_id', p_id, 'view', p_view, 'provider', p_provider))
  returning id into v_job;
  insert into public.world_reference_images(org_id, project_id, object_type, object_id, view_key, aspect_ratio, prompt, negative, identity_hash,
    provider, model, execution, seed, sketch, engine_version, job_id, created_by)
  values (v_org, v_project, p_type, p_id, p_view, p_aspect, p_prompt, coalesce(p_negative, '{}'), p_identity_hash,
    p_provider, p_model, p_execution, coalesce(p_seed, 1), coalesce(p_sketch, '{}'), p_engine_version, v_job, auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'WorldReferenceRequested', initcap(p_type), p_id, jsonb_build_object('view', p_view, 'provider', p_provider));
  return v;
end;
$$;

create or replace function public.worker_claim_world_reference(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.world_reference_images;
begin
  perform public.worker_check(p_token);
  select * into v from public.world_reference_images
    where status = 'queued' or (status = 'running' and started_at < now() - interval '15 minutes' and attempt < 3)
    order by created_at limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.world_reference_images set status = 'running', attempt = attempt + 1, started_at = now() where id = v.id returning * into v;
  update public.jobs set status = 'running', attempt = v.attempt, started_at = now() where id = v.job_id;
  return to_jsonb(v);
end;
$$;

create or replace function public.worker_complete_world_reference(p_token text, p_id uuid, p_storage_key text, p_checksum text,
  p_metadata jsonb, p_request_id text, p_cost numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v public.world_reference_images; v_asset uuid; v_name text; v_category text;
begin
  perform public.worker_check(p_token);
  select * into v from public.world_reference_images where id = p_id and status = 'running' for update;
  if v.id is null then return (select asset_id from public.world_reference_images where id = p_id); end if; -- idempotent
  perform set_config('aura.project_id', v.project_id::text, true);
  if v.object_type = 'location' then
    select name, 'locations' into v_name, v_category from public.locations where id = v.object_id;
  else
    select name, case category when 'vehicle' then 'vehicles' else 'props' end into v_name, v_category from public.props where id = v.object_id;
  end if;
  v_name := coalesce(v_name, initcap(v.object_type)) || ' — ' || initcap(replace(replace(v.view_key, '_', ' '), ':', ' · ')) || ' reference';
  v_asset := app_private.register_generated_asset_linked(v.project_id, v.created_by, 'image', v_name, p_storage_key, p_checksum,
    p_metadata || jsonb_build_object('generated', jsonb_build_object('reference_id', v.id, 'provider', v.provider, 'model', v.model, 'execution', v.execution,
      'engine_version', v.engine_version, 'identity_hash', v.identity_hash, 'view', v.view_key)),
    'Generated by ' || v.provider || ' (' || v.model || ') from the ' || v.object_type || ' record — ' || left(v.prompt, 400), v_category, v.object_type, v.object_id);
  update public.world_reference_images set status = 'succeeded', asset_id = v_asset, completed_at = now(), provider_request_id = p_request_id,
    cost_usd = p_cost, error = null where id = v.id;
  update public.jobs set status = 'completed', completed_at = now(), provider_request_id = p_request_id, cost_actual = p_cost,
    output_refs = jsonb_build_object('asset_id', v_asset) where id = v.job_id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v.org_id, v.created_by, 'WorldReferenceGenerated', initcap(v.object_type), v.object_id, jsonb_build_object('asset_id', v_asset, 'view', v.view_key, 'provider', v.provider));
  return v_asset;
end;
$$;

create or replace function public.worker_fail_world_reference(p_token text, p_id uuid, p_error text, p_request_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare v public.world_reference_images;
begin
  perform public.worker_check(p_token);
  update public.world_reference_images set status = 'failed', error = left(coalesce(p_error, 'Generation failed'), 1000), completed_at = now(), provider_request_id = p_request_id
    where id = p_id and status = 'running' returning * into v;
  if v.id is null then return; end if;
  update public.jobs set status = 'failed', completed_at = now(), error = jsonb_build_object('message', left(p_error, 500)) where id = v.job_id;
end;
$$;

revoke execute on function public.sync_world(uuid, uuid, jsonb, jsonb, text), public.save_world_item(uuid, text, uuid, int, jsonb),
  public.request_world_reference(text, uuid, text, text, text, text[], text, text, text, text, int, jsonb, text) from public, anon;
grant execute on function public.sync_world(uuid, uuid, jsonb, jsonb, text), public.save_world_item(uuid, text, uuid, int, jsonb),
  public.request_world_reference(text, uuid, text, text, text, text[], text, text, text, text, int, jsonb, text) to authenticated;
revoke execute on function public.worker_claim_world_reference(text), public.worker_complete_world_reference(text, uuid, text, text, jsonb, text, numeric),
  public.worker_fail_world_reference(text, uuid, text, text) from public, authenticated;
grant execute on function public.worker_claim_world_reference(text), public.worker_complete_world_reference(text, uuid, text, text, jsonb, text, numeric),
  public.worker_fail_world_reference(text, uuid, text, text) to anon;
