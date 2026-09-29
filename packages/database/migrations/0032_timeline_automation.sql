-- Volume automation on the final assembly (owner, 2026-09-29: "timelines should offer capability to set or draw
-- automation in final assembly"). The cut's sound (A1: the approved scene mixes) gets a volume curve drawn or set on the
-- timeline: points { frame, db } joined by straight lines in dB. It is sound, not picture, so it can be changed after
-- Picture Lock without breaking the lock (mixing happens after picture lock). It has its own revision (stale → 409),
-- every saved or locked version keeps a copy (restore brings it back), and each render records the exact automation and
-- revision it used in its manifest (rule 10).

alter table public.timelines add column if not exists automation jsonb not null default '{}'::jsonb;
alter table public.timelines add column if not exists automation_revision uuid not null default gen_random_uuid();
alter table public.timeline_versions add column if not exists automation jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.timelines add constraint timelines_automation_shape check (jsonb_typeof(automation) = 'object' and octet_length(automation::text) <= 131072);
exception when duplicate_object then null; end $$;

-- Every version (manual, automatic, Picture Lock) snapshots the automation it was taken with.
create or replace function app_private.snapshot_timeline_automation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.automation := coalesce((select automation from public.timelines where id = new.timeline_id), '{}'::jsonb);
  return new;
end;
$$;
revoke all on function app_private.snapshot_timeline_automation() from public, anon, authenticated;
drop trigger if exists trg_timeline_versions_automation on public.timeline_versions;
create trigger trg_timeline_versions_automation before insert on public.timeline_versions
  for each row execute function app_private.snapshot_timeline_automation();

-- Save the automation. Shape: { "A1": [ { "frame": int >= 0, "db": -60..12 }, ... ] } sorted by frame, ≤ 2000 points.
create or replace function public.save_timeline_automation(p_project_id uuid, p_automation jsonb, p_base_revision uuid)
returns public.timelines
language plpgsql security definer set search_path = public as $$
declare v_org uuid; t public.timelines; lane text; n int;
begin
  perform public.gate_write(p_project_id, 'editorial', 'edit');
  v_org := public.editorial_assert(p_project_id);
  select * into t from public.timelines where project_id = p_project_id for update;
  if t.id is null then raise exception 'AURA-EDT-412: build the first assembly first' using errcode = 'P0412'; end if;
  if p_base_revision is null or t.automation_revision <> p_base_revision then
    raise exception 'AURA-EDT-409: the automation changed — reload and try again' using errcode = 'P0409';
  end if;
  if p_automation is null or jsonb_typeof(p_automation) <> 'object' then
    raise exception 'AURA-EDT-400: automation must be an object of lanes' using errcode = 'P0400';
  end if;
  for lane in select jsonb_object_keys(p_automation) loop
    if lane <> 'A1' then raise exception 'AURA-EDT-400: unknown automation lane %', lane using errcode = 'P0400'; end if;
    if jsonb_typeof(p_automation->lane) <> 'array' then raise exception 'AURA-EDT-400: lane % must be a list of points', lane using errcode = 'P0400'; end if;
    n := jsonb_array_length(p_automation->lane);
    if n > 2000 then raise exception 'AURA-EDT-400: at most 2000 points per lane' using errcode = 'P0400'; end if;
    if exists (select 1 from jsonb_array_elements(p_automation->lane) p
               where jsonb_typeof(p->'frame') <> 'number' or jsonb_typeof(p->'db') <> 'number'
                  or (p->>'frame')::numeric < 0 or (p->>'frame')::numeric <> floor((p->>'frame')::numeric)
                  or (p->>'db')::numeric < -60 or (p->>'db')::numeric > 12) then
      raise exception 'AURA-EDT-400: each point needs a whole frame (≥ 0) and a level between -60 and +12 dB' using errcode = 'P0400';
    end if;
    if exists (select 1 from (select (p->>'frame')::int f, lag((p->>'frame')::int) over (order by ord) prev
                              from jsonb_array_elements(p_automation->lane) with ordinality as x(p, ord)) s where s.f <= s.prev) then
      raise exception 'AURA-EDT-400: points must be in time order, one per frame' using errcode = 'P0400';
    end if;
  end loop;
  update public.timelines set automation = p_automation, automation_revision = gen_random_uuid() where id = t.id returning * into t;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'TimelineAutomationSaved', 'Timeline', t.id,
    jsonb_build_object('points', coalesce(jsonb_array_length(p_automation->'A1'), 0), 'locked', t.status = 'locked'));
  return t;
end;
$$;
revoke execute on function public.save_timeline_automation(uuid, jsonb, uuid) from public, anon;
grant execute on function public.save_timeline_automation(uuid, jsonb, uuid) to authenticated;
