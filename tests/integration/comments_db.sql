-- Integration test for migration 0021 (comments, mentions, notifications, tasks, activity). Rolled back; expected results at the bottom.
-- People: O owns the studio; W is a Writer and R a Reviewer on project A; X is an outsider.
begin;
insert into auth.users(id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111','owner@aurastage.invalid','authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','writer@aurastage.invalid','authenticated','authenticated'),
  ('44444444-4444-4444-4444-444444444444','reviewer@aurastage.invalid','authenticated','authenticated');
create temp table r(n serial, step text, ok text);
create temp table ids(k text primary key, v uuid);
grant all on r, ids to authenticated;
grant usage on sequence r_n_seq to authenticated;
create or replace function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', case p when 'O' then '11111111-1111-1111-1111-111111111111'
    when 'X' then '22222222-2222-2222-2222-222222222222' when 'W' then '33333333-3333-3333-3333-333333333333' else '44444444-4444-4444-4444-444444444444' end,
    'role', 'authenticated')::text, true);
$$;
set local role authenticated;
select pg_temp.as_user('O');
do $$
declare o public.organizations; a uuid;
begin
  o := public.create_organization('T','t-comments');
  insert into public.projects(org_id,title) values (o.id,'A') returning id into a;
  insert into ids values ('org', o.id), ('a', a);
end $$;
reset role;
insert into public.org_members(org_id, user_id, role) select v, '33333333-3333-3333-3333-333333333333', 'member' from ids where k = 'org';
insert into public.org_members(org_id, user_id, role) select v, '44444444-4444-4444-4444-444444444444', 'member' from ids where k = 'org';
insert into public.project_members(project_id, org_id, user_id, role) select (select v from ids where k = 'a'), v, '33333333-3333-3333-3333-333333333333', 'writer' from ids where k = 'org';
insert into public.project_members(project_id, org_id, user_id, role) select (select v from ids where k = 'a'), v, '44444444-4444-4444-4444-444444444444', 'reviewer' from ids where k = 'org';
set local role authenticated;

-- Reviewer comments on the script, mentioning the owner, the writer and an outsider.
select pg_temp.as_user('R');
do $$
declare a uuid := (select v from ids where k = 'a'); c public.comments;
begin
  c := public.add_comment(a, 'script', 'Workspace', a, 'v3', '{}', '  Scene 2 drags — can we tighten it?  ', null,
    array['11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333']::uuid[]);
  insert into ids values ('c1', c.id);
  insert into r(step, ok) values ('reviewer comments (trimmed, mentions de-duplicated)', c.body || ' / ' || array_length(c.mentions, 1) || ' mentions / on ' || c.object_version);
  begin perform public.add_comment(a, 'script', 'Workspace', a, null, '{}', '', null, '{}'); insert into r(step, ok) values ('empty comment refused', 'NO');
  exception when others then insert into r(step, ok) values ('empty comment refused', sqlstate); end;
end $$;

select pg_temp.as_user('W');
do $$
declare a uuid := (select v from ids where k = 'a'); c public.comments;
begin
  insert into r(step, ok) values ('writer was notified', (select kind || ': ' || title || ' -> ' || link from public.notifications));
  c := public.add_comment(a, 'script', 'Workspace', a, null, '{}', 'Trimmed in v4.', (select v from ids where k = 'c1'), '{}');
  insert into ids values ('c2', c.id);
  insert into r(step, ok) values ('reply inherits the thread''s object and version', c.module || '/' || c.object_type || '/' || c.object_version);
  begin perform public.add_comment(a, 'script', 'Workspace', a, null, '{}', 'x', c.id, '{}'); insert into r(step, ok) values ('no replies to replies', 'NO');
  exception when others then insert into r(step, ok) values ('no replies to replies', sqlerrm); end;
  begin perform public.edit_comment((select v from ids where k = 'c1'), 'hacked', false); insert into r(step, ok) values ('only authors edit', 'NO');
  exception when others then insert into r(step, ok) values ('only authors edit', sqlerrm); end;
  -- A Writer can edit the script, so may reopen/resolve anyone's script thread.
  perform public.resolve_comment((select v from ids where k = 'c1'), true);
  insert into r(step, ok) values ('writer resolves the reviewer''s script thread', (select (resolved_at is not null)::text from public.comments where id = (select v from ids where k = 'c1')));
  c := public.add_comment(a, 'editorial', 'Timeline', a, 'rev-7', '{"frame": 48, "timecode": "00:00:02:00"}', 'Cut earlier here', null, '{}');
  insert into ids values ('c3', c.id);
end $$;

select pg_temp.as_user('R');
do $$
declare a uuid := (select v from ids where k = 'a'); t public.tasks;
begin
  insert into r(step, ok) values ('reviewer got a reply notification', (select string_agg(kind, ',') from public.notifications));
  begin perform public.resolve_comment((select v from ids where k = 'c3'), true); insert into r(step, ok) values ('reviewer can''t resolve someone else''s editorial thread', 'NO');
  exception when others then insert into r(step, ok) values ('reviewer can''t resolve someone else''s editorial thread', sqlerrm); end;
  perform public.edit_comment((select v from ids where k = 'c1'), null, true);
  insert into r(step, ok) values ('author deletes: kept as (deleted), replies stay', (select body from public.comments where id = (select v from ids where k = 'c1')) || ' / '
    || (select count(*) from public.comments where parent_id = (select v from ids where k = 'c1')));
  insert into r(step, ok) values ('timecode comment keeps its anchor and version',
    (select anchor->>'timecode' || ' @ ' || object_version from public.list_comments(a, 'editorial', 'Timeline', a)));
  t := public.create_task(a, 'script', 'Workspace', a, 'review', 'Review the new scene 2', '33333333-3333-3333-3333-333333333333', '2026-10-01');
  insert into ids values ('t1', t.id);
  begin perform public.create_task(a, 'script', null, null, 'task', 'x', '22222222-2222-2222-2222-222222222222', null); insert into r(step, ok) values ('tasks only for people on the project', 'NO');
  exception when others then insert into r(step, ok) values ('tasks only for people on the project', sqlerrm); end;
end $$;

select pg_temp.as_user('X');
do $$
declare a uuid := (select v from ids where k = 'a');
begin
  begin perform public.add_comment(a, 'script', 'Workspace', a, null, '{}', 'hi', null, '{}'); insert into r(step, ok) values ('outsider can''t comment', 'NO');
  exception when others then insert into r(step, ok) values ('outsider can''t comment', sqlerrm); end;
  begin perform public.list_comments(a, null, null, null); insert into r(step, ok) values ('outsider can''t read comments', 'NO');
  exception when others then insert into r(step, ok) values ('outsider can''t read comments', sqlerrm); end;
  insert into r(step, ok) values ('outsider sees comments/tasks/notifications', (select count(*) from public.comments) || '/' || (select count(*) from public.tasks) || '/' || (select count(*) from public.notifications));
  begin perform public.set_task_status((select v from ids where k = 't1'), 'done'); insert into r(step, ok) values ('outsider can''t close tasks', 'NO');
  exception when others then insert into r(step, ok) values ('outsider can''t close tasks', sqlerrm); end;
end $$;

select pg_temp.as_user('W');
do $$
begin
  insert into r(step, ok) values ('my tasks', (select string_agg(kind || ':' || title || ':' || status || ':' || creator_email, ',') from public.list_tasks(null, true)));
  perform public.set_task_status((select v from ids where k = 't1'), 'done');
  insert into r(step, ok) values ('writer marks all read', public.mark_notifications_read(null)::text);
  insert into r(step, ok) values ('writer has nothing unread', (select count(*)::text from public.notifications where read_at is null));
end $$;

select pg_temp.as_user('R');
do $$ begin
  insert into r(step, ok) values ('the requester hears it is done', (select title from public.notifications where kind = 'task_done'));
end $$;

select pg_temp.as_user('O');
do $$
declare a uuid := (select v from ids where k = 'a');
begin
  insert into r(step, ok) values ('owner was mentioned', (select count(*)::text from public.notifications where kind = 'mention'));
  insert into r(step, ok) values ('activity feed', (select string_agg(action || ':' || coalesce(split_part(actor_email, '@', 1), '-'), ',' order by created_at) from public.project_activity(a, null, 50)));
  insert into r(step, ok) values ('project rows are not shipped to the feed', (select (metadata = '{}'::jsonb)::text from public.project_activity(a, null, 50) where object_type = 'Project'));
end $$;

do $x$ begin raise exception 'RESULTS: %', (select string_agg(step || ' => ' || ok, ' || ' order by n) from r); end $x$;

-- Expected:
-- reviewer comments (trimmed, mentions de-duplicated) | Scene 2 drags — can we tighten it? / 3 mentions / on v3
-- empty comment refused                     | 23514
-- writer was notified                       | mention: reviewer@aurastage.invalid mentioned you in Scriptwriter -> /projects/<a>/scriptwriter?comment=<c1>
-- reply inherits the thread's object and version | script/Workspace/v3
-- no replies to replies                     | AURA-COL-400: reply to the first comment in the thread
-- only authors edit                         | AURA-COL-403: only the person who wrote a comment can change it
-- writer resolves the reviewer's script thread | true
-- reviewer got a reply notification         | reply
-- reviewer can't resolve someone else's editorial thread | AURA-COL-403: your role (Reviewer) can't edit in Editorial & Timeline. ...
-- author deletes: kept as (deleted), replies stay | (deleted) / 1
-- timecode comment keeps its anchor and version | 00:00:02:00 @ rev-7
-- tasks only for people on the project      | AURA-COL-400: that person isn't on this project
-- outsider can't comment                    | AURA-COL-403: you don't have access to this project
-- outsider can't read comments              | AURA-COL-404: project not found
-- outsider sees comments/tasks/notifications | 0/0/0
-- outsider can't close tasks                | AURA-COL-403: you don't have access to this project
-- my tasks                                  | review:Review the new scene 2:open:reviewer@aurastage.invalid
-- writer marks all read                     | 2
-- writer has nothing unread                 | 0
-- the requester hears it is done            | writer@aurastage.invalid finished: Review the new scene 2
-- owner was mentioned                       | 1
-- activity feed                             | ProjectCreated:owner,CommentAdded:reviewer,CommentReplied:writer,CommentResolved:writer,CommentAdded:writer,CommentDeleted:reviewer,ReviewRequested:reviewer,TaskStatusChanged:writer
-- project rows are not shipped to the feed  | true
