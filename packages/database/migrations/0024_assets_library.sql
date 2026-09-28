-- Completion pass 12b: Assets Library (SRS §13.3, UI_REFERENCE §13).
-- * Every asset keeps its versions: replacing a file adds a version with its own stored file and checksum;
--   earlier files are never overwritten or deleted (rule 11). Queued renders already froze the storage key
--   they use (RenderManifest), and Audio Studio flags approved mixes whose recordings changed afterwards.
-- * Library metadata: category, description, tags, archived.
-- * Manual links from an asset to the scenes / characters it belongs to ("Add to Scene").
-- Writes go through gated functions (gate_write 'assets'); reads are project-scoped by RLS.

alter table public.assets add column if not exists category text;
alter table public.assets add column if not exists description text not null default '';
alter table public.assets add column if not exists tags text[] not null default '{}';
alter table public.assets add column if not exists current_version int not null default 1;
alter table public.assets add column if not exists version_updated_at timestamptz;
alter table public.assets add column if not exists archived_at timestamptz;
alter table public.assets add column if not exists updated_at timestamptz not null default now();

create or replace function public.asset_categories() returns text[]
language sql immutable set search_path = '' as $$
  select array['characters','locations','props','wardrobe','vehicles','environments','visual_references','audio','music_sound',
               'documents','graphics_titles','luts_presets'];
$$;

update public.assets set category = case type when 'audio' then 'audio' when 'document' then 'documents' else 'visual_references' end where category is null;
update public.assets set version_updated_at = created_at where version_updated_at is null;
alter table public.assets alter column category set not null;
alter table public.assets alter column version_updated_at set not null;
alter table public.assets alter column version_updated_at set default now();
do $$ begin
  alter table public.assets add constraint assets_category_check check (category = any(public.asset_categories()));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.assets add constraint assets_description_len check (char_length(description) <= 4000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.assets add constraint assets_tags_len check (cardinality(tags) <= 30);
exception when duplicate_object then null; end $$;

create or replace function public.asset_default_category() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.category is null then
    new.category := case new.type when 'audio' then 'audio' when 'document' then 'documents' else 'visual_references' end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_assets_default_category on public.assets;
create trigger trg_assets_default_category before insert on public.assets for each row execute function public.asset_default_category();
drop trigger if exists trg_assets_updated_at on public.assets;
create trigger trg_assets_updated_at before update on public.assets for each row execute function public.set_updated_at();

-- ---- Versions -------------------------------------------------------------------
create table if not exists public.asset_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  version_number int not null check (version_number >= 1),
  storage_path text,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (asset_id, version_number)
);
create index if not exists idx_asset_versions_asset on public.asset_versions(asset_id, version_number desc);
alter table public.asset_versions enable row level security;
drop policy if exists asset_versions_select on public.asset_versions;
create policy asset_versions_select on public.asset_versions for select
  using (project_id = any ((select public.my_project_ids())::uuid[]) or (project_id is null and public.is_org_member(org_id)));

insert into public.asset_versions(org_id, project_id, asset_id, version_number, storage_path, checksum, metadata, note, created_by, created_at)
select a.org_id, a.project_id, a.id, 1, a.storage_path, a.checksum, a.metadata, 'Original upload', a.created_by, a.created_at
from public.assets a
where not exists (select 1 from public.asset_versions v where v.asset_id = a.id);

-- Version 1 is written for every new asset, whichever path inserted it.
create or replace function public.asset_first_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.asset_versions(org_id, project_id, asset_id, version_number, storage_path, checksum, metadata, note, created_by, created_at)
  values (new.org_id, new.project_id, new.id, 1, new.storage_path, new.checksum, new.metadata, 'Original upload', new.created_by, new.created_at)
  on conflict (asset_id, version_number) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_assets_first_version on public.assets;
create trigger trg_assets_first_version after insert on public.assets for each row execute function public.asset_first_version();

-- ---- Links ("Add to Scene") -----------------------------------------------------
create table if not exists public.asset_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  object_type text not null check (object_type in ('scene','character')),
  object_id uuid not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (asset_id, object_type, object_id)
);
create index if not exists idx_asset_links_project on public.asset_links(project_id);
alter table public.asset_links enable row level security;
drop policy if exists asset_links_select on public.asset_links;
create policy asset_links_select on public.asset_links for select using (project_id = any ((select public.my_project_ids())::uuid[]));

-- ---- Write functions (gated) ----------------------------------------------------
create or replace function public.update_asset(p_asset uuid, p_patch jsonb)
returns public.assets
language plpgsql security definer set search_path = public as $$
declare a public.assets; v_tags text[];
begin
  select * into a from public.assets where id = p_asset;
  if a.id is null or a.project_id is null then raise exception 'AURA-AST-404: asset not found' using errcode = 'P0404'; end if;
  perform public.gate_write(a.project_id, 'assets', 'edit');
  if p_patch ? 'name' and char_length(trim(coalesce(p_patch->>'name', ''))) not between 1 and 200 then
    raise exception 'AURA-AST-400: the name must be 1-200 characters' using errcode = 'P0400';
  end if;
  if p_patch ? 'category' and not ((p_patch->>'category') = any(public.asset_categories())) then
    raise exception 'AURA-AST-400: unknown category' using errcode = 'P0400';
  end if;
  if p_patch ? 'tags' then
    select coalesce(array_agg(distinct lower(trim(t))) filter (where trim(t) <> ''), '{}') into v_tags
      from jsonb_array_elements_text(p_patch->'tags') t;
    if exists (select 1 from unnest(v_tags) t where char_length(t) > 40) then
      raise exception 'AURA-AST-400: tags must be at most 40 characters' using errcode = 'P0400';
    end if;
  end if;
  update public.assets set
    name = case when p_patch ? 'name' then trim(p_patch->>'name') else name end,
    category = coalesce(p_patch->>'category', category),
    description = case when p_patch ? 'description' then trim(coalesce(p_patch->>'description', '')) else description end,
    tags = case when p_patch ? 'tags' then v_tags else tags end,
    archived_at = case when p_patch ? 'archived' then (case when (p_patch->>'archived')::boolean then coalesce(archived_at, now()) end) else archived_at end
  where id = p_asset returning * into a;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (a.org_id, auth.uid(), case when p_patch ? 'archived' then (case when (p_patch->>'archived')::boolean then 'AssetArchived' else 'AssetRestored' end) else 'AssetUpdated' end,
          'Asset', a.id, jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]') from jsonb_object_keys(p_patch) k)));
  return a;
end;
$$;

-- Replace: a new version with its own file. The previous files stay in storage and in the history.
create or replace function public.add_asset_version(p_asset uuid, p_storage_path text, p_checksum text, p_metadata jsonb, p_note text)
returns public.asset_versions
language plpgsql security definer set search_path = public as $$
declare a public.assets; v public.asset_versions; n int;
begin
  select * into a from public.assets where id = p_asset for update;
  if a.id is null or a.project_id is null then raise exception 'AURA-AST-404: asset not found' using errcode = 'P0404'; end if;
  perform public.gate_write(a.project_id, 'assets', 'edit');
  if a.archived_at is not null then raise exception 'AURA-AST-409: restore this asset before replacing its file' using errcode = 'P0409'; end if;
  if p_storage_path is null or p_checksum is null then raise exception 'AURA-AST-400: no file' using errcode = 'P0400'; end if;
  if p_checksum = a.checksum then raise exception 'AURA-AST-409: that file is identical to the current version' using errcode = 'P0409'; end if;
  select coalesce(max(version_number), 0) + 1 into n from public.asset_versions where asset_id = a.id;
  insert into public.asset_versions(org_id, project_id, asset_id, version_number, storage_path, checksum, metadata, note, created_by)
  values (a.org_id, a.project_id, a.id, n, p_storage_path, p_checksum, coalesce(p_metadata, '{}'::jsonb), left(trim(coalesce(p_note, '')), 500), auth.uid())
  returning * into v;
  update public.assets set storage_path = p_storage_path, checksum = p_checksum, metadata = coalesce(p_metadata, '{}'::jsonb),
    current_version = n, version_updated_at = v.created_at where id = a.id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (a.org_id, auth.uid(), 'AssetVersionAdded', 'Asset', a.id, jsonb_build_object('version', n, 'name', a.name));
  return v;
end;
$$;

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

revoke execute on function public.update_asset(uuid, jsonb), public.add_asset_version(uuid, text, text, jsonb, text),
  public.set_asset_link(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.update_asset(uuid, jsonb), public.add_asset_version(uuid, text, text, jsonb, text),
  public.set_asset_link(uuid, text, uuid, boolean) to authenticated;
revoke execute on function public.asset_first_version() from public, anon, authenticated;

-- ---- Audio Studio: a replaced recording needs a fresh measurement before the mix is approved again ----
-- (The mix revision doesn't change when a recording's file does, so the existing revision check can't see it.)
create or replace function public.approve_audio_session(p_project_id uuid, p_scene_id uuid)
returns public.audio_session_versions
language plpgsql security definer set search_path = public as $$
declare v_measured timestamptz; v_changed timestamptz;
begin
  perform public.gate_write(p_project_id, 'audio', 'approve');
  select max(m.measured_at) into v_measured from public.audio_measurements m join public.audio_sessions s on s.id = m.session_id where s.scene_id = p_scene_id;
  select max(a.version_updated_at) into v_changed from public.audio_clips c join public.audio_sessions s on s.id = c.session_id
    join public.assets a on a.id = c.asset_id where s.scene_id = p_scene_id;
  if v_measured is not null and v_changed is not null and v_changed > v_measured then
    raise exception 'AURA-AUD-412: a recording was replaced in the Assets Library — measure the mix loudness again first' using errcode = 'P0412';
  end if;
  return app_private.approve_audio_session(p_project_id, p_scene_id);
end;
$$;
revoke execute on function public.approve_audio_session(uuid, uuid) from public, anon;
grant execute on function public.approve_audio_session(uuid, uuid) to authenticated;
