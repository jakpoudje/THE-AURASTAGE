-- Editorial Undo (2026-10-02, owner: "no means of … reinstating the parts I didn't want … must be considered even for
-- video editing timelines"). Every edit already replaces the whole clip list against a revision (save_timeline); now the
-- cut as it was just before each edit is kept (last 30 per timeline). Undo puts that cut back through the same save —
-- same permission gate, same checks, same picture-lock rule — and gives the timeline back the exact revision it had, so
-- several Undos in a row walk back one edit at a time. Undo entries are history, never canonical clips. The history is a
-- ring of 30 slots per timeline (the oldest slot is overwritten); an entry that has been undone is marked, not removed.
create table if not exists public.timeline_undo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  before_revision uuid not null,
  after_revision uuid not null,
  before_clips jsonb not null,
  action text not null,
  summary text,
  slot int not null check (slot between 0 and 29),
  undone_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (timeline_id, slot)
);
create index if not exists timeline_undo_timeline_idx on public.timeline_undo(timeline_id, created_at desc);
create index if not exists timeline_undo_after_idx on public.timeline_undo(timeline_id, after_revision) where undone_at is null;
create index if not exists timeline_undo_project_idx on public.timeline_undo(project_id);
alter table public.timeline_undo enable row level security;
create policy timeline_undo_select on public.timeline_undo for select to authenticated using (public.can_view_project(project_id));
revoke all on public.timeline_undo from anon, authenticated;
grant select on public.timeline_undo to authenticated;

-- The save itself is unchanged; a thin layer in front records the cut it replaced.
do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app_private' and p.proname = 'save_timeline_core') then
    alter function app_private.save_timeline(uuid, uuid, jsonb, text, text, text, boolean, jsonb) rename to save_timeline_core;
  end if;
end $$;
revoke all on function app_private.save_timeline_core(uuid, uuid, jsonb, text, text, text, boolean, jsonb) from public, anon, authenticated;

create or replace function app_private.save_timeline(p_project_id uuid, p_base_revision uuid, p_clips jsonb, p_action text, p_summary text,
  p_engine_version text, p_break_lock boolean, p_impact jsonb)
returns public.timelines
language plpgsql security definer set search_path = public as $$
declare before public.timelines; v_clips jsonb; t public.timelines; v_slot int;
begin
  select * into before from public.timelines where project_id = p_project_id for update;
  if before.id is not null then
    select coalesce(jsonb_agg(to_jsonb(c) - 'org_id' - 'project_id' - 'timeline_id' - 'created_at' - 'updated_at' order by c.track, c.record_in), '[]'::jsonb)
      into v_clips from public.timeline_clips c where c.timeline_id = before.id;
  end if;
  t := app_private.save_timeline_core(p_project_id, p_base_revision, p_clips, p_action, p_summary, p_engine_version, p_break_lock, p_impact);
  if before.id is not null and coalesce(p_action, '') <> 'undo' then
    -- A free slot first, then the oldest one.
    select s into v_slot from generate_series(0, 29) s
      where not exists (select 1 from public.timeline_undo u where u.timeline_id = t.id and u.slot = s) order by s limit 1;
    if v_slot is null then
      select slot into v_slot from public.timeline_undo where timeline_id = t.id order by created_at asc, id asc limit 1;
    end if;
    insert into public.timeline_undo(org_id, project_id, timeline_id, slot, before_revision, after_revision, before_clips, action, summary, created_by)
    values (t.org_id, p_project_id, t.id, v_slot, before.revision, t.revision, v_clips, coalesce(p_action, 'edit'), p_summary, auth.uid())
    on conflict (timeline_id, slot) do update set id = gen_random_uuid(), before_revision = excluded.before_revision,
      after_revision = excluded.after_revision, before_clips = excluded.before_clips, action = excluded.action, summary = excluded.summary,
      undone_at = null, created_by = excluded.created_by, created_at = now();
  end if;
  return t;
end;
$$;
revoke all on function app_private.save_timeline(uuid, uuid, jsonb, text, text, text, boolean, jsonb) from public, anon, authenticated;

-- Undo the newest edit made on the revision the editor is looking at.
create or replace function app_private.undo_timeline(p_project_id uuid, p_base_revision uuid, p_break_lock boolean)
returns public.timelines
language plpgsql security definer set search_path = public as $$
declare t public.timelines; u public.timeline_undo;
begin
  select * into t from public.timelines where project_id = p_project_id for update;
  if t.id is null then raise exception 'AURA-EDT-404: there is nothing to undo yet' using errcode = 'P0404'; end if;
  if p_base_revision is null or t.revision <> p_base_revision then
    raise exception 'AURA-EDT-409: the timeline changed — reload and try again' using errcode = 'P0409';
  end if;
  select * into u from public.timeline_undo where timeline_id = t.id and after_revision = t.revision and undone_at is null order by created_at desc, id desc limit 1;
  if u.id is null then raise exception 'AURA-EDT-404: there is nothing to undo' using errcode = 'P0404'; end if;
  t := app_private.save_timeline_core(p_project_id, p_base_revision, u.before_clips, 'undo', 'Undo: ' || coalesce(u.summary, u.action),
    t.engine_version, p_break_lock, '[]'::jsonb);
  -- The cut is exactly what it was at that revision again, so it gets that revision back (the next Undo matches on it).
  update public.timelines set revision = u.before_revision where id = t.id returning * into t;
  update public.timeline_undo set undone_at = now() where id = u.id;
  return t;
end;
$$;
revoke all on function app_private.undo_timeline(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.undo_timeline(p_project_id uuid, p_base_revision uuid, p_break_lock boolean default false)
returns public.timelines
language plpgsql security definer set search_path = public as $$
begin
  perform public.gate_write(p_project_id, 'editorial', case when coalesce(p_break_lock, false) then 'lock' else 'edit' end);
  return app_private.undo_timeline(p_project_id, p_base_revision, p_break_lock);
end;
$$;
revoke execute on function public.undo_timeline(uuid, uuid, boolean) from public, anon;
grant execute on function public.undo_timeline(uuid, uuid, boolean) to authenticated;
