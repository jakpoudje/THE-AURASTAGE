-- Worker heartbeat never waits on a lock (2026-10-02 incident: pages not loading, sign-in hanging). Every worker lane's
-- claim called worker_check, which updated the same worker_credentials row every 30 s; ~10 lanes queued on that row's
-- lock inside their claim transactions and hit the statement timeout, adding to the load that starved Supabase Auth.
-- Now the heartbeat is written only when no other lane holds the row (FOR UPDATE SKIP LOCKED); the check itself is unchanged.
create or replace function public.worker_check(p_token text)
returns void
language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
begin
  if p_token is null or length(p_token) < 32 or not exists (select 1 from public.worker_credentials where token_hash = v_hash) then
    raise exception 'AURA-GEN-401: worker not authorised' using errcode = '42501';
  end if;
  -- Heartbeat (for Help → system status) only when no other lane is already writing it: never wait on that row's lock.
  update public.worker_credentials set last_seen_at = now()
   where token_hash = v_hash and (last_seen_at is null or last_seen_at < now() - interval '30 seconds')
     and ctid = (select ctid from public.worker_credentials where token_hash = v_hash for update skip locked limit 1);
end;
$function$;
