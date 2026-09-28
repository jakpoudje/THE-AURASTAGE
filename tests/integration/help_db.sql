-- Integration test for migration 0022 (Help & Support, account security). Rolled back; expected results at the bottom.
begin;
insert into auth.users(id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111','user@aurastage.invalid','authenticated','authenticated'),
  ('22222222-2222-2222-2222-222222222222','other@aurastage.invalid','authenticated','authenticated'),
  ('33333333-3333-3333-3333-333333333333','staff@aurastage.invalid','authenticated','authenticated');
insert into public.platform_staff(user_id) values ('33333333-3333-3333-3333-333333333333');
insert into public.worker_credentials(name, token_hash) values ('hb-test', encode(extensions.digest('hb-token-0123456789abcdef0123456789abcdef', 'sha256'), 'hex'));
insert into auth.sessions(id, user_id, created_at, updated_at, user_agent) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', now(), now(), 'Laptop'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', now(), now(), 'Phone'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', '22222222-2222-2222-2222-222222222222', now(), now(), 'Other');
create temp table r(n serial, step text, ok text);
create temp table ids(k text primary key, v uuid);
grant all on r, ids to authenticated, anon;
grant usage on sequence r_n_seq to authenticated, anon;
set local role anon;
do $$ begin
  perform public.worker_render_progress('hb-token-0123456789abcdef0123456789abcdef', gen_random_uuid(), 0, 'heartbeat test');
end $$;
reset role;
insert into r(step, ok) select 'worker heartbeat recorded', (last_seen_at is not null)::text from public.worker_credentials where name = 'hb-test';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"}', true);
do $$
declare t public.support_tickets; t2 public.support_tickets; s jsonb;
begin
  s := public.platform_status();
  insert into r(step, ok) values ('platform status has workers and jobs', (s ? 'workers')::text || '/' || (s ? 'jobs_24h')::text || '/' || (jsonb_typeof(s->'workers')) || ' / ' || (s->'workers')::text);
  t := public.create_ticket(null, 'editorial', 'Render stuck', 'My render has been queued for an hour.', false, '{"jobs": 3}');
  insert into ids values ('t1', t.id);
  insert into r(step, ok) values ('no consent, no diagnostics', coalesce(t.diagnostics::text, 'null'));
  t2 := public.create_ticket(null, null, 'Audio question', 'How do I export stems?', true, '{"module":"audio"}');
  insert into r(step, ok) values ('with consent, diagnostics kept', t2.diagnostics::text);
  begin perform public.create_ticket(null, null, 'x', 'y', false, null); insert into r(step, ok) values ('subject too short', 'NO');
  exception when others then insert into r(step, ok) values ('subject too short', sqlstate); end;
  insert into r(step, ok) values ('my sessions', (select string_agg(user_agent || ':' || current::text, ',' order by user_agent) from public.my_sessions()));
  insert into r(step, ok) values ('sign out other devices', public.revoke_sessions(null)::text);
  insert into r(step, ok) values ('current session kept', (select string_agg(user_agent, ',') from public.my_sessions()));
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$ begin
  insert into r(step, ok) values ('others see my tickets', (select count(*)::text from public.support_tickets) || '/' || (select count(*)::text from public.list_tickets(true)));
  begin perform public.reply_ticket((select v from ids where k = 't1'), 'hi'); insert into r(step, ok) values ('others can''t reply', 'NO');
  exception when others then insert into r(step, ok) values ('others can''t reply', sqlerrm); end;
  insert into r(step, ok) values ('others'' sessions untouched', (select count(*)::text from public.my_sessions()));
end $$;
select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
do $$ begin
  insert into r(step, ok) values ('staff inbox', (select count(*)::text from public.list_tickets(true)));
  perform public.reply_ticket((select v from ids where k = 't1'), 'Looking into it — the render worker was restarting.');
  insert into r(step, ok) values ('staff reply marks answered', (select status from public.support_tickets where id = (select v from ids where k = 't1')));
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$ begin
  insert into r(step, ok) values ('author sees the answer', (select (messages->1->>'from_staff') || ': ' || (messages->1->>'body') from public.list_tickets(false) where id = (select v from ids where k = 't1')));
  perform public.close_ticket((select v from ids where k = 't1'));
  insert into r(step, ok) values ('closed', (select status from public.support_tickets where id = (select v from ids where k = 't1')));
end $$;
do $x$ begin raise exception 'RESULTS: %', (select string_agg(step || ' => ' || ok, ' || ' order by n) from r); end $x$;

-- Expected:
-- worker heartbeat recorded           | true
-- platform status has workers and jobs | true/true/array / [the real workers with recent last_seen_at]
-- no consent, no diagnostics          | null
-- with consent, diagnostics kept      | {"module": "audio"}
-- subject too short                   | 23514
-- my sessions                         | Laptop:true,Phone:false
-- sign out other devices              | 1
-- current session kept                | Laptop
-- others see my tickets               | 0/0
-- others can't reply                  | AURA-HLP-404: ticket not found
-- others' sessions untouched          | 1
-- staff inbox                         | 2
-- staff reply marks answered          | answered
-- author sees the answer              | true: Looking into it — the render worker was restarting.
-- closed                              | closed
