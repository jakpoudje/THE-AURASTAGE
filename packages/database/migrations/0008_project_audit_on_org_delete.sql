-- Fix: deleting an organization failed. The org delete cascades to projects,
-- whose audit trigger then tried to insert an audit_events row for the org that
-- is being deleted (FK violation 23503). When the org is gone, its audit trail
-- goes with it (audit_events cascade on org), so there is nothing to log.
create or replace function public.log_project_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations where id = old.org_id) then
    return old;
  end if;
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
revoke execute on function public.log_project_audit() from public, anon, authenticated;

-- Internal helper: only called from inside SECURITY DEFINER casting functions
-- (which run as the owner), so no API role needs to call it directly.
revoke execute on function public.casting_assert_member(uuid) from public, anon, authenticated;
