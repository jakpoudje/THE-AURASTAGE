-- 0016: record_audio_measurement compared the revision after casting it to uuid, so a
-- malformed/unknown revision raised 22P02 (API 500) instead of the intended 409.
-- Found by the live smoke test; regression check in tests/integration/audio_db.sql.
create or replace function public.record_audio_measurement(p_session_id uuid, p_m jsonb)
returns public.audio_measurements
language plpgsql security definer set search_path = public as $$
declare s public.audio_sessions; v public.audio_measurements;
begin
  select * into s from public.audio_sessions where id = p_session_id;
  if s.id is null then raise exception 'AURA-AUD-404: audio session not found' using errcode = 'P0404'; end if;
  perform public.audio_assert(s.project_id, null);
  if (p_m->>'session_revision') is distinct from s.revision::text then
    raise exception 'AURA-AUD-409: the mix changed since it was measured — measure again' using errcode = 'P0409';
  end if;
  insert into public.audio_measurements(org_id, project_id, session_id, session_revision, integrated_lufs, true_peak_dbtp, lra_lu,
    duration_seconds, clip_count, engine_version, measured_by)
  values (s.org_id, s.project_id, s.id, s.revision, (p_m->>'integrated_lufs')::numeric, (p_m->>'true_peak_dbtp')::numeric,
    (p_m->>'lra_lu')::numeric, (p_m->>'duration_seconds')::numeric, (p_m->>'clip_count')::int, p_m->>'engine_version', auth.uid())
  returning * into v;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (s.org_id, auth.uid(), 'AudioMixMeasured', 'AudioSession', s.id, jsonb_build_object('integrated_lufs', v.integrated_lufs, 'true_peak_dbtp', v.true_peak_dbtp));
  return v;
end;
$$;
