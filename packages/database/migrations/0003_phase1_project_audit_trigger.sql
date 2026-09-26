-- Transactionally-coupled audit logging for Project writes (SRS §2.2 event model,
-- simplified outbox for Phase 1 — full domain-event bus/outbox lands with MOS in a later phase).
create or replace function public.log_project_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (
    coalesce(new.org_id, old.org_id),
    auth.uid(),
    case when tg_op = 'INSERT' then 'ProjectCreated'
         when tg_op = 'UPDATE' then 'ProjectUpdated'
         else 'ProjectDeleted' end,
    'Project',
    coalesce(new.id, old.id),
    to_jsonb(coalesce(new, old))
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_projects_audit on public.projects;
create trigger trg_projects_audit after insert or update or delete on public.projects
  for each row execute function public.log_project_audit();
