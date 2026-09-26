-- Harden Phase 1 functions per Supabase advisor findings (mutable search_path).
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.create_organization(text, text) from anon;
revoke execute on function public.is_org_member(uuid) from anon;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
