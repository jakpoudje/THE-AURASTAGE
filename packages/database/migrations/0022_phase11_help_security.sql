-- Phase 11c: Help & Support and account security (SRS §13.4, §18, §20).
-- * Worker heartbeats: every authorised worker call records when the worker was last seen
--   (at most every 30 s), so System Status reports real liveness, never a hardcoded "Operational".
-- * platform_status(): worker liveness + the last 24 h of MOS job outcomes (aggregate counts only).
-- * Support tickets with optional, user-approved diagnostics; replies from platform staff.
-- * Sessions: people can see where they're signed in and sign other devices out.

-- ---------------------------------------------------------------------------------
-- Worker heartbeats
-- ---------------------------------------------------------------------------------
alter table public.worker_credentials add column if not exists last_seen_at timestamptz;

create or replace function public.worker_check(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
begin
  if p_token is null or length(p_token) < 32 or not exists (select 1 from public.worker_credentials where token_hash = v_hash) then
    raise exception 'AURA-GEN-401: worker not authorised' using errcode = '42501';
  end if;
  update public.worker_credentials set last_seen_at = now()
    where token_hash = v_hash and (last_seen_at is null or last_seen_at < now() - interval '30 seconds');
end;
$$;
revoke execute on function public.worker_check(text) from public, anon, authenticated;

create or replace function public.platform_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'checked_at', now(),
    'workers', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'last_seen_at', last_seen_at) order by name) from public.worker_credentials
                          where name not like 'it-%'), '[]'::jsonb),
    'jobs_24h', coalesce((select jsonb_agg(j order by j->>'engine_id') from (
        select jsonb_build_object(
          'engine_id', engine_id,
          'completed', count(*) filter (where status = 'completed'),
          'failed', count(*) filter (where status = 'failed'),
          'cancelled', count(*) filter (where status = 'cancelled'),
          'running', count(*) filter (where status = 'running'),
          'queued', count(*) filter (where status = 'queued'),
          'oldest_queued_seconds', extract(epoch from now() - min(created_at) filter (where status = 'queued'))::int) j
        from public.jobs where created_at > now() - interval '24 hours' or status in ('queued','running')
        group by engine_id) s), '[]'::jsonb));
$$;

-- ---------------------------------------------------------------------------------
-- Support tickets
-- ---------------------------------------------------------------------------------
create table if not exists public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.platform_staff enable row level security; -- no policies: read through is_platform_staff()

create or replace function public.is_platform_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_staff where user_id = auth.uid());
$$;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  module text check (module is null or module = any(public.permission_modules())),
  subject text not null check (char_length(subject) between 3 and 200),
  body text not null check (char_length(body) between 1 and 8000),
  status text not null default 'open' check (status in ('open','answered','closed')),
  consent_diagnostics boolean not null default false,
  diagnostics jsonb check (diagnostics is null or pg_column_size(diagnostics) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (consent_diagnostics or diagnostics is null)
);
create index if not exists idx_tickets_user on public.support_tickets(user_id, updated_at desc);
create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  from_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index if not exists idx_ticket_messages on public.ticket_messages(ticket_id, created_at);
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select using (user_id = (select auth.uid()) or (select public.is_platform_staff()));
drop policy if exists ticket_messages_select on public.ticket_messages;
create policy ticket_messages_select on public.ticket_messages for select
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = (select auth.uid()) or (select public.is_platform_staff()))));

-- Diagnostics are attached only with consent, and only what the caller could already see.
create or replace function public.create_ticket(p_project uuid, p_module text, p_subject text, p_body text, p_consent boolean, p_diagnostics jsonb)
returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare t public.support_tickets;
begin
  if auth.uid() is null then raise exception 'AURA-HLP-401: sign in first' using errcode = '42501'; end if;
  if p_project is not null and not public.can_view_project(p_project) then
    raise exception 'AURA-HLP-404: project not found' using errcode = 'P0404';
  end if;
  if (select count(*) from public.support_tickets where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'AURA-HLP-429: that''s a lot of tickets in an hour — please add to an existing one' using errcode = 'P0429';
  end if;
  insert into public.support_tickets(user_id, project_id, module, subject, body, consent_diagnostics, diagnostics)
  values (auth.uid(), p_project, p_module, trim(p_subject), trim(p_body), coalesce(p_consent, false), case when coalesce(p_consent, false) then p_diagnostics end)
  returning * into t;
  insert into public.ticket_messages(ticket_id, author_id, from_staff, body) values (t.id, auth.uid(), false, trim(p_body));
  return t;
end;
$$;

create or replace function public.reply_ticket(p_ticket uuid, p_body text)
returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare t public.support_tickets; v_staff boolean := public.is_platform_staff();
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null or (t.user_id <> auth.uid() and not v_staff) then raise exception 'AURA-HLP-404: ticket not found' using errcode = 'P0404'; end if;
  insert into public.ticket_messages(ticket_id, author_id, from_staff, body) values (t.id, auth.uid(), v_staff and t.user_id <> auth.uid(), trim(p_body));
  update public.support_tickets set updated_at = now(),
    status = case when v_staff and t.user_id <> auth.uid() then 'answered' else 'open' end
    where id = p_ticket returning * into t;
  return t;
end;
$$;

create or replace function public.close_ticket(p_ticket uuid)
returns public.support_tickets
language plpgsql security definer set search_path = public as $$
declare t public.support_tickets;
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null or (t.user_id <> auth.uid() and not public.is_platform_staff()) then raise exception 'AURA-HLP-404: ticket not found' using errcode = 'P0404'; end if;
  update public.support_tickets set status = 'closed', updated_at = now() where id = p_ticket returning * into t;
  return t;
end;
$$;

-- My tickets (or, for platform staff with p_all, everyone's) with the author's email and messages.
create or replace function public.list_tickets(p_all boolean)
returns table(id uuid, user_email text, project_id uuid, module text, subject text, status text, consent_diagnostics boolean, diagnostics jsonb,
  created_at timestamptz, updated_at timestamptz, messages jsonb)
language plpgsql stable security definer set search_path = public, auth as $$
declare v_staff boolean := public.is_platform_staff();
begin
  return query
    select t.id, u.email::text, t.project_id, t.module, t.subject, t.status, t.consent_diagnostics, t.diagnostics, t.created_at, t.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from_staff', m.from_staff, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
        from public.ticket_messages m where m.ticket_id = t.id), '[]'::jsonb)
    from public.support_tickets t join auth.users u on u.id = t.user_id
    where t.user_id = auth.uid() or (coalesce(p_all, false) and v_staff)
    order by t.updated_at desc
    limit 200;
end;
$$;

-- ---------------------------------------------------------------------------------
-- Sessions: where am I signed in?
-- ---------------------------------------------------------------------------------
create or replace function public.my_sessions()
returns table(id uuid, created_at timestamptz, last_active_at timestamptz, user_agent text, ip text, current boolean)
language sql stable security definer set search_path = public, auth as $$
  select s.id, s.created_at, coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at), s.user_agent, host(s.ip),
    s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
  from auth.sessions s where s.user_id = auth.uid()
  order by coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at) desc;
$$;

-- Signs out one other device (or all others with p_session null). The current session is kept.
create or replace function public.revoke_sessions(p_session uuid)
returns int
language plpgsql security definer set search_path = public, auth as $$
declare n int; v_current text := coalesce(auth.jwt() ->> 'session_id', '');
begin
  if auth.uid() is null then raise exception 'AURA-HLP-401: sign in first' using errcode = '42501'; end if;
  delete from auth.sessions s where s.user_id = auth.uid() and s.id::text <> v_current and (p_session is null or s.id = p_session);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.platform_status(), public.is_platform_staff(), public.create_ticket(uuid, text, text, text, boolean, jsonb),
  public.reply_ticket(uuid, text), public.close_ticket(uuid), public.list_tickets(boolean), public.my_sessions(), public.revoke_sessions(uuid) from public, anon;
grant execute on function public.platform_status(), public.is_platform_staff(), public.create_ticket(uuid, text, text, text, boolean, jsonb),
  public.reply_ticket(uuid, text), public.close_ticket(uuid), public.list_tickets(boolean), public.my_sessions(), public.revoke_sessions(uuid) to authenticated;
