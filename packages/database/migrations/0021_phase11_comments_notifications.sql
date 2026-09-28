-- Phase 11b: comments, mentions, notifications, review tasks and the activity feed
-- (SRS §13.2; engines commentEngine, timecodeCommentEngine, mentionNotificationEngine,
-- taskWorkflowEngine, reviewWorkflowEngine, activityFeedEngine). Canonical owner: Team & Collaboration.
--
-- * Comments are version-aware: each records the exact version/revision of the object it was
--   made on (object_version) and an optional anchor (e.g. a timeline frame). They are never
--   rewritten by upstream changes; the UI compares object_version with the current one.
-- * Writing a comment needs the module's "comment" permission (every project member has it).
-- * Notifications are private to their recipient and are only created by these functions.
-- * The activity feed reads the immutable audit trail of one project.

-- Org-level events (studio people changes) never belong to a project, even when an earlier
-- statement in the same transaction passed through gate_write.
create or replace function public.audit_fill_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.object_type in ('OrgMember', 'Organization') then
    return new;
  end if;
  if new.project_id is null then
    new.project_id := nullif(current_setting('aura.project_id', true), '')::uuid;
  end if;
  if new.project_id is null then
    new.project_id := public.audit_project_of(new.object_type, new.object_id);
  end if;
  return new;
end;
$$;

-- Where a module lives in the web app (for notification links).
create or replace function public.module_path(p_module text) returns text
language sql immutable set search_path = public as $$
  select case p_module when 'script' then 'scriptwriter' when 'casting' then 'casting' when 'dialogue' then 'dialogue'
    when 'scene_dna' then 'scene-dna' when 'shots' then 'storyboard' when 'generation' then 'visual' when 'audio' then 'audio'
    when 'editorial' then 'editorial' when 'delivery' then 'export' else 'team' end;
$$;

create or replace function public.module_label(p_module text) returns text
language sql immutable set search_path = public as $$
  select case p_module when 'script' then 'Scriptwriter' when 'casting' then 'Casting & Characters' when 'dialogue' then 'Dialogue Intelligence'
    when 'scene_dna' then 'Scene DNA' when 'shots' then 'Storyboard & Shots' when 'generation' then 'Visual Generation'
    when 'audio' then 'Audio Studio' when 'editorial' then 'Editorial & Timeline' when 'delivery' then 'Export & Deliver'
    when 'assets' then 'Assets Library' when 'settings' then 'Project Settings' else 'Team & Collaboration' end;
$$;

-- ---------------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  module text not null check (module = any(public.permission_modules())),
  object_type text not null check (object_type ~ '^[A-Za-z]{2,40}$'),
  object_id uuid not null,
  object_version text check (char_length(object_version) <= 80),
  anchor jsonb not null default '{}'::jsonb check (jsonb_typeof(anchor) = 'object' and pg_column_size(anchor) <= 2000),
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  mentions uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);
create index if not exists idx_comments_object on public.comments(project_id, module, object_type, object_id, created_at);
create index if not exists idx_comments_parent on public.comments(parent_id);
alter table public.comments enable row level security;
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select using (project_id = any ((select public.my_project_ids())::uuid[]));

-- ---------------------------------------------------------------------------------
-- Notifications (private to the recipient)
-- ---------------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind text not null check (kind in ('mention','reply','task_assigned','review_requested','task_done')),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 300),
  link text check (link ~ '^/[A-Za-z0-9/_?=&#.-]*$'),
  source_type text not null,
  source_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(user_id) where read_at is null;
alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select using (user_id = (select auth.uid()));

-- Internal: notify one person, only if they can still see the project and aren't the actor.
create or replace function public.notify(p_user uuid, p_project uuid, p_kind text, p_title text, p_body text, p_link text, p_source_type text, p_source uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  select org_id into v_org from public.projects where id = p_project;
  if v_org is null then return; end if;
  -- The recipient must still be able to see the project (studio full-rights role or project member).
  if not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = p_user and m.role in ('owner','admin','producer'))
     and not exists (select 1 from public.project_members pm join public.org_members m on m.org_id = pm.org_id and m.user_id = pm.user_id
                     where pm.project_id = p_project and pm.user_id = p_user) then
    return;
  end if;
  insert into public.notifications(user_id, org_id, project_id, kind, title, body, link, source_type, source_id, actor_id)
  values (p_user, v_org, p_project, p_kind, left(p_title, 200), left(p_body, 300), p_link, p_source_type, p_source, auth.uid());
end;
$$;

create or replace function public.add_comment(p_project uuid, p_module text, p_object_type text, p_object_id uuid, p_object_version text,
  p_anchor jsonb, p_body text, p_parent uuid, p_mentions uuid[])
returns public.comments
language plpgsql security definer set search_path = public as $$
declare c public.comments; v_org uuid; parent public.comments; v_actor text; u uuid; v_link text;
begin
  perform public.gate_write(p_project, p_module, 'comment');
  select org_id into v_org from public.projects where id = p_project;
  if v_org is null then raise exception 'AURA-COL-404: project not found' using errcode = 'P0404'; end if;
  if p_parent is not null then
    select * into parent from public.comments where id = p_parent and project_id = p_project;
    if parent.id is null then raise exception 'AURA-COL-404: the comment you replied to is gone' using errcode = 'P0404'; end if;
    if parent.parent_id is not null then raise exception 'AURA-COL-400: reply to the first comment in the thread' using errcode = 'P0400'; end if;
  end if;
  insert into public.comments(org_id, project_id, module, object_type, object_id, object_version, anchor, parent_id, body, mentions, created_by)
  values (v_org, p_project, coalesce(parent.module, p_module), coalesce(parent.object_type, p_object_type), coalesce(parent.object_id, p_object_id),
    coalesce(p_object_version, parent.object_version), coalesce(p_anchor, '{}'::jsonb), p_parent, trim(p_body),
    coalesce((select array_agg(distinct x) from unnest(coalesce(p_mentions, '{}')) x), '{}'), auth.uid())
  returning * into c;
  select email into v_actor from auth.users where id = auth.uid();
  v_link := '/projects/' || p_project || '/' || public.module_path(c.module) || '?comment=' || coalesce(c.parent_id, c.id);
  foreach u in array c.mentions loop
    perform public.notify(u, p_project, 'mention', coalesce(v_actor, 'Someone') || ' mentioned you in ' || public.module_label(c.module),
      left(c.body, 300), v_link, 'Comment', c.id);
  end loop;
  if parent.id is not null and not (parent.created_by = any(c.mentions)) then
    perform public.notify(parent.created_by, p_project, 'reply', coalesce(v_actor, 'Someone') || ' replied to your comment in ' || public.module_label(c.module),
      left(c.body, 300), v_link, 'Comment', c.id);
  end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (v_org, auth.uid(), case when p_parent is null then 'CommentAdded' else 'CommentReplied' end, 'Comment', c.id,
    jsonb_build_object('module', c.module, 'object_type', c.object_type, 'object_id', c.object_id, 'object_version', c.object_version,
      'anchor', c.anchor, 'mentions', array_length(c.mentions, 1)), p_project);
  return c;
end;
$$;

-- Resolve/reopen a thread: its author, or anyone who can edit that workspace.
create or replace function public.resolve_comment(p_comment uuid, p_resolved boolean)
returns public.comments
language plpgsql security definer set search_path = public as $$
declare c public.comments;
begin
  select * into c from public.comments where id = p_comment for update;
  if c.id is null or c.deleted_at is not null then raise exception 'AURA-COL-404: comment not found' using errcode = 'P0404'; end if;
  if c.parent_id is not null then raise exception 'AURA-COL-400: resolve the thread from its first comment' using errcode = 'P0400'; end if;
  if c.created_by is distinct from auth.uid() then perform public.gate_write(c.project_id, c.module, 'edit');
  else perform public.gate_write(c.project_id, c.module, 'comment'); end if;
  update public.comments set resolved_at = case when p_resolved then now() end, resolved_by = case when p_resolved then auth.uid() end
    where id = p_comment returning * into c;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (c.org_id, auth.uid(), case when p_resolved then 'CommentResolved' else 'CommentReopened' end, 'Comment', c.id, jsonb_build_object('module', c.module), c.project_id);
  return c;
end;
$$;

-- Edit or delete: authors only (deleting keeps the row so replies and the audit trail stay intact).
create or replace function public.edit_comment(p_comment uuid, p_body text, p_delete boolean)
returns public.comments
language plpgsql security definer set search_path = public as $$
declare c public.comments;
begin
  select * into c from public.comments where id = p_comment for update;
  if c.id is null or c.deleted_at is not null then raise exception 'AURA-COL-404: comment not found' using errcode = 'P0404'; end if;
  perform public.gate_write(c.project_id, c.module, 'comment');
  if c.created_by is distinct from auth.uid() then
    raise exception 'AURA-COL-403: only the person who wrote a comment can change it' using errcode = '42501';
  end if;
  if p_delete then
    update public.comments set deleted_at = now(), body = '(deleted)', mentions = '{}' where id = p_comment returning * into c;
  else
    update public.comments set body = trim(p_body), edited_at = now() where id = p_comment returning * into c;
  end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (c.org_id, auth.uid(), case when p_delete then 'CommentDeleted' else 'CommentEdited' end, 'Comment', c.id, jsonb_build_object('module', c.module), c.project_id);
  return c;
end;
$$;

-- A thread with author emails (auth.users isn't readable directly).
create or replace function public.list_comments(p_project uuid, p_module text, p_object_type text, p_object_id uuid)
returns table(id uuid, parent_id uuid, module text, object_type text, object_id uuid, object_version text, anchor jsonb, body text,
  mentions uuid[], mention_emails text[], created_by uuid, author_email text, created_at timestamptz, edited_at timestamptz,
  resolved_at timestamptz, resolved_by_email text, deleted_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.can_view_project(p_project) then
    raise exception 'AURA-COL-404: project not found' using errcode = 'P0404';
  end if;
  return query
    select c.id, c.parent_id, c.module, c.object_type, c.object_id, c.object_version, c.anchor, c.body, c.mentions,
      coalesce((select array_agg(u2.email::text order by u2.email) from auth.users u2 where u2.id = any(c.mentions)), '{}'),
      c.created_by, u.email::text, c.created_at, c.edited_at, c.resolved_at, r.email::text, c.deleted_at
    from public.comments c
    left join auth.users u on u.id = c.created_by
    left join auth.users r on r.id = c.resolved_by
    where c.project_id = p_project
      and (p_module is null or c.module = p_module)
      and (p_object_type is null or c.object_type = p_object_type)
      and (p_object_id is null or c.object_id = p_object_id)
    order by (select rc.created_at from public.comments rc where rc.id = coalesce(c.parent_id, c.id)), coalesce(c.parent_id, c.id),
      c.parent_id nulls first, c.created_at
    limit 1000;
end;
$$;

-- ---------------------------------------------------------------------------------
-- Tasks and review requests
-- ---------------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  module text not null check (module = any(public.permission_modules())),
  object_type text check (object_type ~ '^[A-Za-z]{2,40}$'),
  object_id uuid,
  kind text not null default 'task' check (kind in ('task','review')),
  title text not null check (char_length(title) between 1 and 200),
  assignee uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  due_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_tasks_project on public.tasks(project_id, status, due_date);
create index if not exists idx_tasks_assignee on public.tasks(assignee, status);
alter table public.tasks enable row level security;
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select using (project_id = any ((select public.my_project_ids())::uuid[]));

-- Anyone who can comment in a workspace can ask someone on the project for a review or a task.
create or replace function public.create_task(p_project uuid, p_module text, p_object_type text, p_object_id uuid, p_kind text,
  p_title text, p_assignee uuid, p_due date)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks; v_org uuid; v_actor text;
begin
  perform public.gate_write(p_project, p_module, 'comment');
  select org_id into v_org from public.projects where id = p_project;
  if p_assignee is not null
     and not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = p_assignee and m.role in ('owner','admin','producer'))
     and not exists (select 1 from public.project_members pm where pm.project_id = p_project and pm.user_id = p_assignee) then
    raise exception 'AURA-COL-400: that person isn''t on this project' using errcode = 'P0400';
  end if;
  insert into public.tasks(org_id, project_id, module, object_type, object_id, kind, title, assignee, due_date, created_by)
  values (v_org, p_project, p_module, p_object_type, p_object_id, coalesce(p_kind, 'task'), trim(p_title), p_assignee, p_due, auth.uid())
  returning * into t;
  select email into v_actor from auth.users where id = auth.uid();
  perform public.notify(p_assignee, p_project, case when t.kind = 'review' then 'review_requested' else 'task_assigned' end,
    coalesce(v_actor, 'Someone') || case when t.kind = 'review' then ' asked you to review ' else ' assigned you a task in ' end || public.module_label(p_module),
    t.title, '/projects/' || p_project || '/' || public.module_path(p_module), 'Task', t.id);
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (v_org, auth.uid(), case when t.kind = 'review' then 'ReviewRequested' else 'TaskCreated' end, 'Task', t.id,
    jsonb_build_object('module', p_module, 'title', t.title, 'assignee', p_assignee, 'due_date', p_due), p_project);
  return t;
end;
$$;

-- Move a task along: its assignee, its creator, or the project's team administrators.
create or replace function public.set_task_status(p_task uuid, p_status text)
returns public.tasks
language plpgsql security definer set search_path = public as $$
declare t public.tasks; v_actor text;
begin
  select * into t from public.tasks where id = p_task for update;
  if t.id is null then raise exception 'AURA-COL-404: task not found' using errcode = 'P0404'; end if;
  if p_status not in ('open','in_progress','done','cancelled') then raise exception 'AURA-COL-400: unknown status' using errcode = 'P0400'; end if;
  if auth.uid() is distinct from t.assignee and auth.uid() is distinct from t.created_by then
    perform public.gate_write(t.project_id, 'team', 'administer');
  else
    perform public.gate_write(t.project_id, t.module, 'comment');
  end if;
  update public.tasks set status = p_status, updated_at = now(), completed_at = case when p_status = 'done' then now() end
    where id = p_task returning * into t;
  if p_status = 'done' then
    select email into v_actor from auth.users where id = auth.uid();
    perform public.notify(t.created_by, t.project_id, 'task_done', coalesce(v_actor, 'Someone') || ' finished: ' || t.title, null,
      '/projects/' || t.project_id || '/' || public.module_path(t.module), 'Task', t.id);
  end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata, project_id)
  values (t.org_id, auth.uid(), 'TaskStatusChanged', 'Task', t.id, jsonb_build_object('status', p_status, 'title', t.title), t.project_id);
  return t;
end;
$$;

-- Tasks with people's emails: one project, or (p_project null) everything assigned to me.
create or replace function public.list_tasks(p_project uuid, p_mine boolean)
returns table(id uuid, project_id uuid, project_title text, module text, object_type text, object_id uuid, kind text, title text,
  assignee uuid, assignee_email text, status text, due_date date, created_by uuid, creator_email text, created_at timestamptz, completed_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if p_project is not null and not public.can_view_project(p_project) then
    raise exception 'AURA-COL-404: project not found' using errcode = 'P0404';
  end if;
  return query
    select t.id, t.project_id, p.title, t.module, t.object_type, t.object_id, t.kind, t.title, t.assignee, a.email::text, t.status,
      t.due_date, t.created_by, c.email::text, t.created_at, t.completed_at
    from public.tasks t
    join public.projects p on p.id = t.project_id
    left join auth.users a on a.id = t.assignee
    left join auth.users c on c.id = t.created_by
    where t.project_id = any(public.my_project_ids())
      and (p_project is null or t.project_id = p_project)
      and (not coalesce(p_mine, false) or t.assignee = auth.uid())
    order by (t.status in ('done','cancelled')), t.due_date nulls last, t.created_at desc
    limit 500;
end;
$$;

-- ---------------------------------------------------------------------------------
-- Notifications API
-- ---------------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[])
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.notifications set read_at = now()
    where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------------
-- Activity feed (one project's audit trail, with who did it)
-- ---------------------------------------------------------------------------------
create or replace function public.project_activity(p_project uuid, p_before timestamptz, p_limit int)
returns table(id uuid, action text, object_type text, object_id uuid, metadata jsonb, actor_id uuid, actor_email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.can_view_project(p_project) then
    raise exception 'AURA-COL-404: project not found' using errcode = 'P0404';
  end if;
  return query
    select e.id, e.action, e.object_type, e.object_id,
      -- never ship whole rows (e.g. the project audit trigger stores the full project) to the feed
      case when e.object_type = 'Project' then '{}'::jsonb else e.metadata end,
      e.actor_id, u.email::text, e.created_at
    from public.audit_events e left join auth.users u on u.id = e.actor_id
    where e.project_id = p_project and (p_before is null or e.created_at < p_before)
    order by e.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.notify(uuid, uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.module_path(text), public.module_label(text) from public, anon;
revoke execute on function public.add_comment(uuid, text, text, uuid, text, jsonb, text, uuid, uuid[]) from public, anon;
revoke execute on function public.resolve_comment(uuid, boolean) from public, anon;
revoke execute on function public.edit_comment(uuid, text, boolean) from public, anon;
revoke execute on function public.list_comments(uuid, text, text, uuid) from public, anon;
revoke execute on function public.create_task(uuid, text, text, uuid, text, text, uuid, date) from public, anon;
revoke execute on function public.set_task_status(uuid, text) from public, anon;
revoke execute on function public.list_tasks(uuid, boolean) from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.project_activity(uuid, timestamptz, int) from public, anon;
grant execute on function public.module_path(text), public.module_label(text),
  public.add_comment(uuid, text, text, uuid, text, jsonb, text, uuid, uuid[]), public.resolve_comment(uuid, boolean),
  public.edit_comment(uuid, text, boolean), public.list_comments(uuid, text, text, uuid),
  public.create_task(uuid, text, text, uuid, text, text, uuid, date), public.set_task_status(uuid, text),
  public.list_tasks(uuid, boolean), public.mark_notifications_read(uuid[]), public.project_activity(uuid, timestamptz, int) to authenticated;
