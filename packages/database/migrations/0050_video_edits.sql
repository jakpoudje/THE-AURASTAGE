-- Video editing in the Assets Library (BUILD_PLAN §8 item 34, owner request 2026-10-01: "trimming ability for sounds or
-- videos… all tools needed to edit image, sound, videos"). Images and sound are edited in the browser and saved as new
-- versions (0024); a video edit (trim start/end, mute, speed) is real transcoding, so it is queued here and done by the
-- render worker with ffmpeg (rule 8). The result is a NEW version of the same asset — the earlier file is kept (rule 11).
-- Writes: gate_write(project, 'assets', 'edit'). The worker authenticates with its token (worker_check).
create table if not exists public.video_edits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  -- The version the edit was made from (version-aware, rule 10).
  source_version int not null,
  source_path text not null,
  params jsonb not null,
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  attempt int not null default 0,
  error text,
  result_version int,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists idx_video_edits_asset on public.video_edits(asset_id, created_at desc);
create index if not exists idx_video_edits_queue on public.video_edits(status, created_at) where status in ('queued','running');
alter table public.video_edits enable row level security;
drop policy if exists video_edits_select on public.video_edits;
create policy video_edits_select on public.video_edits for select using (project_id = any ((select public.my_project_ids())::uuid[]));
grant select on public.video_edits to authenticated;

create or replace function public.request_video_edit(p_asset uuid, p_params jsonb, p_note text)
returns public.video_edits
language plpgsql security definer set search_path = public as $$
declare a public.assets; v public.video_edits; s numeric; e numeric; sp numeric;
begin
  select * into a from public.assets where id = p_asset;
  if a.id is null or a.project_id is null then raise exception 'AURA-AST-404: asset not found' using errcode = 'P0404'; end if;
  perform public.gate_write(a.project_id, 'assets', 'edit');
  if a.type <> 'video' then raise exception 'AURA-AST-400: only video files are edited this way' using errcode = 'P0400'; end if;
  if a.archived_at is not null then raise exception 'AURA-AST-409: restore this asset before editing it' using errcode = 'P0409'; end if;
  if a.storage_path is null then raise exception 'AURA-AST-400: this asset has no file' using errcode = 'P0400'; end if;
  s := coalesce((p_params->>'trim_start')::numeric, 0);
  e := nullif(p_params->>'trim_end', '')::numeric;
  sp := coalesce((p_params->>'speed')::numeric, 1);
  if s < 0 or (e is not null and e <= s + 0.1) then raise exception 'AURA-AST-400: the end must come after the start' using errcode = 'P0400'; end if;
  if sp not in (0.5, 0.75, 1, 1.25, 1.5, 2) then raise exception 'AURA-AST-400: speed must be 0.5×, 0.75×, 1×, 1.25×, 1.5× or 2×' using errcode = 'P0400'; end if;
  if exists (select 1 from public.video_edits where asset_id = a.id and status in ('queued','running')) then
    raise exception 'AURA-AST-409: an edit of this video is already being made — wait for it to finish' using errcode = 'P0409';
  end if;
  insert into public.video_edits(org_id, project_id, asset_id, source_version, source_path, params, note, created_by)
  values (a.org_id, a.project_id, a.id, coalesce(a.current_version, 1), a.storage_path,
    jsonb_build_object('trim_start', s, 'trim_end', e, 'mute', coalesce((p_params->>'mute')::boolean, false), 'speed', sp),
    left(trim(coalesce(p_note, '')), 500), auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (a.org_id, auth.uid(), 'VideoEditRequested', 'Asset', a.id, jsonb_build_object('edit_id', v.id, 'params', v.params));
  return v;
end;
$$;

create or replace function public.worker_claim_video_edit(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.video_edits;
begin
  perform public.worker_check(p_token);
  select * into v from public.video_edits
    where status = 'queued' or (status = 'running' and started_at < now() - interval '20 minutes' and attempt < 3)
    order by created_at limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.video_edits set status = 'running', attempt = attempt + 1, started_at = now() where id = v.id returning * into v;
  return to_jsonb(v);
end;
$$;

create or replace function public.worker_complete_video_edit(p_token text, p_id uuid, p_storage_path text, p_checksum text, p_metadata jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare v public.video_edits; a public.assets; n int; ver public.asset_versions;
begin
  perform public.worker_check(p_token);
  select * into v from public.video_edits where id = p_id and status = 'running' for update;
  if v.id is null then return (select result_version from public.video_edits where id = p_id); end if; -- idempotent
  perform set_config('aura.project_id', v.project_id::text, true);
  select * into a from public.assets where id = v.asset_id for update;
  select coalesce(max(version_number), 0) + 1 into n from public.asset_versions where asset_id = a.id;
  insert into public.asset_versions(org_id, project_id, asset_id, version_number, storage_path, checksum, metadata, note, created_by)
  values (a.org_id, a.project_id, a.id, n, p_storage_path, p_checksum, coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('edited_from_version', v.source_version, 'edit', v.params),
    left(coalesce(nullif(v.note, ''), 'Edited video'), 500), v.created_by)
  returning * into ver;
  update public.assets set storage_path = p_storage_path, checksum = p_checksum, metadata = coalesce(p_metadata, '{}'::jsonb),
    current_version = n, version_updated_at = ver.created_at where id = a.id;
  update public.video_edits set status = 'succeeded', result_version = n, completed_at = now(), error = null where id = v.id;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v.org_id, v.created_by, 'AssetVersionAdded', 'Asset', a.id, jsonb_build_object('version', n, 'name', a.name, 'edit_id', v.id));
  return n;
end;
$$;

create or replace function public.worker_fail_video_edit(p_token text, p_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.worker_check(p_token);
  update public.video_edits set status = 'failed', error = left(coalesce(p_error, 'Edit failed'), 1000), completed_at = now()
    where id = p_id and status = 'running';
end;
$$;

revoke execute on function public.request_video_edit(uuid, jsonb, text) from public, anon;
grant execute on function public.request_video_edit(uuid, jsonb, text) to authenticated;
revoke execute on function public.worker_claim_video_edit(text), public.worker_complete_video_edit(text, uuid, text, text, jsonb),
  public.worker_fail_video_edit(text, uuid, text) from public, authenticated;
grant execute on function public.worker_claim_video_edit(text), public.worker_complete_video_edit(text, uuid, text, text, jsonb),
  public.worker_fail_video_edit(text, uuid, text) to anon;
