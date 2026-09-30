-- A writing job interrupted by a worker restart goes straight back to the queue with everything written so far, so
-- the next writing lane resumes it at once (instead of waiting 30 minutes for the stale-claim rule). Seen live on
-- 2026-09-30: a redeploy during the owner's 63-scene script. Token-checked like every worker function.
create or replace function public.worker_release_script_generation(p_token text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.worker_check(p_token);
  update public.script_generations set status = 'queued', attempt = greatest(attempt - 1, 0),
    progress = coalesce(progress, '{}'::jsonb) || jsonb_build_object('stage', 'Paused for a moment while AuraStage restarted — continuing where it left off')
  where id = p_id and status = 'running';
  update public.jobs set status = 'queued' where id = (select job_id from public.script_generations where id = p_id) and status = 'running';
end;
$$;
revoke execute on function public.worker_release_script_generation(text, uuid) from public, authenticated;
grant execute on function public.worker_release_script_generation(text, uuid) to anon;
