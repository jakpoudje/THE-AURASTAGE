-- Supabase advisor 0028: 0002 revoked EXECUTE from `anon`, but Postgres grants
-- EXECUTE on new functions to PUBLIC by default, so anon still inherited it.
-- Signed-out callers must not reach these SECURITY DEFINER functions.
revoke execute on function public.create_organization(text, text) from public, anon;
revoke execute on function public.is_org_member(uuid) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;

-- Trigger-only function: nobody should call it over the REST API.
revoke execute on function public.log_project_audit() from public, anon, authenticated;
