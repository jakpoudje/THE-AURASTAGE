-- Reference images sent to providers (owner, 2026-09-29: the same faces and places in every shot). The prompt compiler
-- (1.2.0) lists each shot's references as Assets Library ids; the generation worker now receives each file's storage
-- path, type, size and version with the take, sends what the provider accepts, and records on the take exactly which
-- references (and which asset versions) were sent or not sent, with the reason (rule 10). Only assets in the take's
-- own project are ever returned.

alter table public.takes add column if not exists references_used jsonb;

create or replace function public.worker_claim_take(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.takes; v_pkg public.generation_packages; v_src public.takes; v_refs jsonb;
begin
  perform public.worker_check(p_token);
  select * into v from public.takes
    where status = 'queued' or (status = 'running' and started_at < now() - interval '15 minutes' and attempt < 3)
    order by created_at limit 1 for update skip locked;
  if v.id is null then return null; end if;
  update public.takes set status = 'running', attempt = attempt + 1, started_at = now() where id = v.id returning * into v;
  update public.jobs set status = 'running', attempt = v.attempt, started_at = now() where id = v.job_id;
  select * into v_pkg from public.generation_packages where id = v.package_id;
  if v.source_take_id is not null then select * into v_src from public.takes where id = v.source_take_id; end if;
  select coalesce(jsonb_agg(r.ref || jsonb_build_object('asset',
           case when a.id is null then null else jsonb_build_object(
             'storage_path', a.storage_path,
             'media_type', a.metadata->>'media_type',
             'size_bytes', case when (a.metadata->>'size_bytes') ~ '^[0-9]+$' then (a.metadata->>'size_bytes')::bigint end,
             'version', a.current_version) end) order by r.ord), '[]'::jsonb)
    into v_refs
    from jsonb_array_elements(coalesce(v_pkg.content->'references', '[]'::jsonb)) with ordinality as r(ref, ord)
    left join public.assets a
      on a.id = case when (r.ref->>'asset_id') ~ '^[0-9a-f-]{36}$' then (r.ref->>'asset_id')::uuid end
     and a.project_id = v.project_id and a.archived_at is null;
  return jsonb_build_object('take', to_jsonb(v), 'package', v_pkg.content,
    'source', case when v_src.id is null then null else jsonb_build_object('storage_key', v_src.storage_key, 'media_type', v_src.media_type) end,
    'references', v_refs);
end;
$$;

-- What the worker actually sent for a running take (idempotent: only while the take is running).
create or replace function public.worker_note_take_references(p_token text, p_take_id uuid, p_refs jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.worker_check(p_token);
  if coalesce(jsonb_typeof(p_refs), '') <> 'array' or (case when jsonb_typeof(p_refs) = 'array' then jsonb_array_length(p_refs) else 0 end) > 50 then
    raise exception 'AURA-GEN-400: references must be a list' using errcode = 'P0400';
  end if;
  update public.takes set references_used = p_refs where id = p_take_id and status = 'running';
end;
$$;

revoke execute on function public.worker_claim_take(text), public.worker_note_take_references(text, uuid, jsonb) from public, authenticated;
grant execute on function public.worker_claim_take(text), public.worker_note_take_references(text, uuid, jsonb) to anon;
