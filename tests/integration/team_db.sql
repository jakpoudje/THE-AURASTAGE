-- Integration test for migration 0019 (Team & Collaboration permissions). Rolled back; expected results at the bottom.
-- People: O owns the studio; W is invited as Writer on project A; R as Reviewer on A; X is an outsider.
begin;
insert into auth.users(id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111','owner@aurastage.invalid','authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','outsider@aurastage.invalid','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','writer@aurastage.invalid','authenticated','authenticated'),
  ('44444444-4444-4444-4444-444444444444','reviewer@aurastage.invalid','authenticated','authenticated');
create temp table r(n serial, step text, ok text);
create temp table ids(k text primary key, v uuid);
create temp table tok(k text primary key, v text);
grant all on r, ids, tok to authenticated;
grant usage on sequence r_n_seq to authenticated;
create or replace function pg_temp.as_user(p text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', case p when 'O' then '11111111-1111-1111-1111-111111111111'
    when 'X' then '22222222-2222-2222-2222-222222222222' when 'W' then '33333333-3333-3333-3333-333333333333' else '44444444-4444-4444-4444-444444444444' end,
    'role', 'authenticated', 'email', case p when 'O' then 'owner@aurastage.invalid' when 'X' then 'outsider@aurastage.invalid'
    when 'W' then 'writer@aurastage.invalid' else 'reviewer@aurastage.invalid' end)::text, true);
$$;
set local role authenticated;


-- Owner sets up the studio, two projects and two invites.
select pg_temp.as_user('O');
do $$
declare o public.organizations; a uuid; b uuid; inv jsonb;
begin
  o := public.create_organization('T','t-team');
  insert into public.projects(org_id,title) values (o.id,'A') returning id into a;
  insert into public.projects(org_id,title) values (o.id,'B') returning id into b;
  perform public.save_script_version(a, null, 'x', '[]'::jsonb, 'p', null);
  inv := public.create_invite(o.id, 'Writer@AuraStage.invalid', 'member', a, 'writer', '{}');
  insert into tok values ('w', inv->>'token');
  insert into r(step, ok) values ('invite stores only a hash', ((select count(*) from public.invites where token_hash = inv->>'token') = 0)::text || ' / ' || (inv->'invite'->>'email'));
  inv := public.create_invite(o.id, 'reviewer@aurastage.invalid', 'member', a, 'reviewer', '{}');
  insert into tok values ('r', inv->>'token');
  begin perform public.create_invite(o.id, 'z@aurastage.invalid', 'member', null, null, '{}'); insert into r(step, ok) values ('member invite needs a project and role', 'NO');
  exception when others then insert into r(step, ok) values ('member invite needs a project and role', sqlerrm); end;
  insert into ids values ('org', o.id), ('a', a), ('b', b);
end $$;

-- The outsider can't use the writer's invite.
select pg_temp.as_user('X');
do $$ begin
  insert into r(step, ok) values ('preview shows who it is for', (select (p->>'status') || ' / ' || (p->>'project') || ' / ' || (p->>'project_role_label') || ' / matches ' || (p->>'email_matches')
    from (select public.invite_preview((select v from tok where k = 'w')) p) s));
  begin perform public.accept_invite((select v from tok where k = 'w')); insert into r(step, ok) values ('wrong email refused', 'NO');
  exception when others then insert into r(step, ok) values ('wrong email refused', sqlerrm); end;
  insert into r(step, ok) values ('outsider sees projects', (select count(*)::text from public.projects));
end $$;

-- The writer accepts and works in project A only.
select pg_temp.as_user('W');
do $$
declare a uuid := (select v from ids where k = 'a'); b uuid := (select v from ids where k = 'b'); res jsonb; ver public.script_versions;
begin
  res := public.accept_invite((select v from tok where k = 'w'));
  res := public.accept_invite((select v from tok where k = 'w'));
  insert into r(step, ok) values ('accept (twice is fine)', ((res->>'project_id')::uuid = a)::text);
  insert into r(step, ok) values ('writer sees only project A', (select string_agg(title, ',' order by title) from public.projects));
  ver := public.save_script_version(a, (select sv.id from public.script_versions sv join public.scripts s on s.id = sv.script_id where s.project_id = a order by sv.version_number desc limit 1), 'y', '[]'::jsonb, 'p', null);
  insert into r(step, ok) values ('writer saves a script version', 'v' || ver.version_number);
  begin perform public.approve_script_version(a, ver.id, '[{"number":1,"heading":"EXT. HARBOUR","int_ext":"EXT","location":"HARBOUR","time_of_day":"NIGHT","speaking_characters":[],"estimated_seconds":4,"element_start":0,"element_end":1,"content_hash":"h"}]', 'e');
    insert into r(step, ok) values ('writer cannot approve', 'NO');
  exception when others then insert into r(step, ok) values ('writer cannot approve', sqlerrm); end;
  begin perform public.save_script_version(b, null, 'x', '[]'::jsonb, 'p', null); insert into r(step, ok) values ('writer cannot touch project B', 'NO');
  exception when others then insert into r(step, ok) values ('writer cannot touch project B', sqlerrm); end;
  begin insert into public.projects(org_id, title) values ((select v from ids where k = 'org'), 'C'); insert into r(step, ok) values ('members cannot create projects', 'NO');
  exception when others then insert into r(step, ok) values ('members cannot create projects', sqlerrm); end;
  begin perform public.set_project_member(a, '33333333-3333-3333-3333-333333333333', 'producer', '{}'); insert into r(step, ok) values ('writer cannot promote themself', 'NO');
  exception when others then insert into r(step, ok) values ('writer cannot promote themself', sqlerrm); end;
  insert into r(step, ok) values ('writer access (script)', (select (x->>'project_role') || ' / ' || (x->'modules'->'script')::text from (select public.project_access(a) x) s));
  begin perform public.project_access(b); insert into r(step, ok) values ('writer access to B', 'NO');
  exception when others then insert into r(step, ok) values ('writer access to B', sqlerrm); end;
end $$;

-- The reviewer accepts: can read, can't write.
select pg_temp.as_user('R');
do $$
declare a uuid := (select v from ids where k = 'a');
begin
  perform public.accept_invite((select v from tok where k = 'r'));
  insert into r(step, ok) values ('reviewer reads script versions', (select count(*)::text from public.script_versions sv join public.scripts s on s.id = sv.script_id where s.project_id = a));
  begin perform public.save_script_version(a, null, 'x', '[]'::jsonb, 'p', null); insert into r(step, ok) values ('reviewer cannot write', 'NO');
  exception when others then insert into r(step, ok) values ('reviewer cannot write', sqlerrm); end;
  insert into r(step, ok) values ('reviewer sees the team', (select string_agg(email || ':' || coalesce(project_role, org_role), ',' order by email) from public.project_team(a)));
  begin perform public.org_team((select v from ids where k = 'org')); insert into r(step, ok) values ('reviewer cannot list the studio', 'NO');
  exception when others then insert into r(step, ok) values ('reviewer cannot list the studio', sqlerrm); end;
end $$;

-- The owner grants the writer approval, then removes them from the studio.
select pg_temp.as_user('O');
do $$
declare a uuid := (select v from ids where k = 'a'); o uuid := (select v from ids where k = 'org');
begin
  perform public.set_project_member(a, '33333333-3333-3333-3333-333333333333', 'writer', array['script:approve']);
  begin perform public.set_project_member(a, '33333333-3333-3333-3333-333333333333', 'writer', array['script:fly']); insert into r(step, ok) values ('unknown permission refused', 'NO');
  exception when others then insert into r(step, ok) values ('unknown permission refused', sqlerrm); end;
  begin perform public.set_project_member(a, '22222222-2222-2222-2222-222222222222', 'writer', '{}'); insert into r(step, ok) values ('non-member must be invited first', 'NO');
  exception when others then insert into r(step, ok) values ('non-member must be invited first', sqlerrm); end;
  begin perform public.set_org_member_role(o, '11111111-1111-1111-1111-111111111111', 'admin'); insert into r(step, ok) values ('last owner kept', 'NO');
  exception when others then insert into r(step, ok) values ('last owner kept', sqlerrm); end;
  insert into r(step, ok) values ('owner lists the studio', (select string_agg(email || ':' || org_role || ':' || projects, ',' order by email) from public.org_team(o)));
end $$;

select pg_temp.as_user('W');
do $$
declare a uuid := (select v from ids where k = 'a'); ver uuid;
begin
  select sv.id into ver from public.script_versions sv join public.scripts s on s.id = sv.script_id where s.project_id = a order by sv.version_number desc limit 1;
  perform public.approve_script_version(a, ver, '[{"number":1,"heading":"EXT. HARBOUR","int_ext":"EXT","location":"HARBOUR","time_of_day":"NIGHT","speaking_characters":[],"estimated_seconds":4,"element_start":0,"element_end":1,"content_hash":"h"}]', 'e');
  insert into r(step, ok) values ('extra grant lets the writer approve', (select (approved_version_id = ver)::text from public.scripts where project_id = a));
end $$;

select pg_temp.as_user('O');
do $$ begin perform public.remove_org_member((select v from ids where k = 'org'), '33333333-3333-3333-3333-333333333333'); end $$;
select pg_temp.as_user('W');
do $$ begin
  insert into r(step, ok) values ('removed writer sees projects', (select count(*)::text from public.projects));
  begin perform public.save_script_version((select v from ids where k = 'a'), null, 'x', '[]'::jsonb, 'p', null); insert into r(step, ok) values ('removed writer cannot write', 'NO');
  exception when others then insert into r(step, ok) values ('removed writer cannot write', sqlerrm); end;
end $$;

select pg_temp.as_user('O');
do $$ begin
  insert into r(step, ok) values ('activity is per project', (select string_agg(distinct action, ',' order by action) from public.audit_events where project_id = (select v from ids where k = 'a')));
end $$;

-- Regression guard: every user-callable definer function in public is gated or explicitly read-only/self-checking.
reset role;
insert into r(step, ok)
select 'ungated user-callable functions', coalesce(string_agg(p.proname, ',' order by p.proname), 'none')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
  and p.prosrc not ilike '%gate_write%'
  and p.proname not in ('create_organization','is_org_member','casting_assert_member','org_role','my_admin_org_ids','my_project_ids',
    'can_view_project','project_can','project_access','project_team','org_team','set_org_member_role','remove_org_member',
    'revoke_invite','invite_preview','accept_invite',
    -- 0021: read-only lists, and marking one's own notifications read
    'list_comments','list_tasks','project_activity','mark_notifications_read',
    -- 0022: platform status (aggregates), one's own tickets and sessions (not project writes)
    'platform_status','is_platform_staff','create_ticket','reply_ticket','close_ticket','list_tickets','my_sessions','revoke_sessions');
insert into r(step, ok) values ('bodies are not callable directly',
  (select has_function_privilege('authenticated', 'app_private.save_script_version(uuid,uuid,text,jsonb,text,text)', 'execute')::text));

do $x$ begin raise exception 'RESULTS: %', (select string_agg(step || ' => ' || ok, ' || ' order by n) from r); end $x$;

-- Expected:
-- invite stores only a hash                 | true / writer@aurastage.invalid
-- member invite needs a project and role    | AURA-COL-400: choose the project and role for this person
-- preview shows who it is for               | pending / A / Writer / matches false
-- wrong email refused                       | AURA-COL-403: this invite is for writer@aurastage.invalid. Sign in with that email to accept it.
-- outsider sees projects                    | 0
-- accept (twice is fine)                    | true
-- writer sees only project A                | A
-- writer saves a script version             | v2
-- writer cannot approve                     | AURA-COL-403: your role (Writer) can't approve in Scriptwriter. Ask the project's producer for access.
-- writer cannot touch project B             | AURA-COL-403: you don't have access to this project
-- members cannot create projects            | new row violates row-level security policy for table "projects"
-- writer cannot promote themself            | AURA-COL-403: your role (Writer) can't administer in Team & Collaboration. ...
-- writer access (script)                    | writer / ["view", "comment", "create", "edit"]
-- writer access to B                        | AURA-COL-404: project not found
-- reviewer reads script versions            | 2
-- reviewer cannot write                     | AURA-COL-403: your role (Reviewer) can't edit in Scriptwriter. ...
-- reviewer sees the team                    | owner@…:owner,reviewer@…:reviewer,writer@…:writer
-- reviewer cannot list the studio           | AURA-COL-403: only the studio's owners, admins and producers can see everyone in the studio
-- unknown permission refused                | AURA-COL-400: unknown permission
-- non-member must be invited first          | AURA-COL-404: that person isn't in this studio yet — invite them first
-- last owner kept                           | AURA-COL-409: a studio needs at least one owner — make someone else an owner first
-- owner lists the studio                    | owner@…:owner:0,reviewer@…:member:1,writer@…:member:1
-- extra grant lets the writer approve       | true
-- removed writer sees projects              | 0
-- removed writer cannot write               | AURA-COL-403: you don't have access to this project
-- activity is per project                   | InviteAccepted,InviteCreated,ProjectCreated,ProjectMemberChanged,ScriptApproved,ScriptVersionSaved
-- ungated user-callable functions           | none
-- bodies are not callable directly          | false
