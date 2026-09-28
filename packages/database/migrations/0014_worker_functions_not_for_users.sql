-- Hardening after the Phase 7 security advisor run: signed-in users never need the
-- generation-worker functions (the worker calls them with the anon key + its token).
revoke execute on function public.worker_claim_take(text) from authenticated;
revoke execute on function public.worker_complete_take(text, uuid, text, text, text, numeric) from authenticated;
revoke execute on function public.worker_fail_take(text, uuid, text, text) from authenticated;
