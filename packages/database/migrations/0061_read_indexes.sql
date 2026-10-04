-- 0061_read_indexes.sql — BUILD_PLAN item 50 (database slowdowns under heavy use, 2026-10-03).
-- Every page reads its records by project (and some by scene, session, asset or character). These tables had no index
-- on that column, so each read scanned the whole table (pg_stat_user_tables: 5k–55k sequential scans each). Under a
-- whole-film run those scans pile up and the free tier starts cancelling statements (57014). Indexes only: no data or
-- behaviour changes. Also: the org_members read policy now evaluates auth.uid() once per statement (Supabase advisor).

create index if not exists idx_shot_plan_versions_project on public.shot_plan_versions (project_id);
create index if not exists idx_scene_dna_versions_project on public.scene_dna_versions (project_id);
create index if not exists idx_audio_clips_project on public.audio_clips (project_id, start_seconds, id);
create index if not exists idx_audio_clips_asset on public.audio_clips (asset_id);
create index if not exists idx_audio_session_versions_project on public.audio_session_versions (project_id);
create index if not exists idx_audio_tracks_project on public.audio_tracks (project_id);
create index if not exists idx_audio_measurements_project on public.audio_measurements (project_id, measured_at desc);
create index if not exists idx_audio_generations_session on public.audio_generations (session_id);
create index if not exists idx_audio_generations_asset on public.audio_generations (asset_id);
create index if not exists idx_takes_scene on public.takes (scene_id);
create index if not exists idx_notifications_project on public.notifications (project_id);
create index if not exists idx_world_reference_images_project on public.world_reference_images (project_id);
create index if not exists idx_world_reference_images_asset on public.world_reference_images (asset_id);
create index if not exists idx_character_reference_images_project on public.character_reference_images (project_id);
create index if not exists idx_character_reference_images_asset on public.character_reference_images (asset_id);
create index if not exists idx_dialogue_lines_character on public.dialogue_lines (character_id);
create index if not exists idx_renders_timeline on public.renders (timeline_id);
create index if not exists idx_timeline_clips_project on public.timeline_clips (project_id);
create index if not exists idx_timeline_clips_scene on public.timeline_clips (scene_id);
create index if not exists idx_video_edits_project on public.video_edits (project_id);
create index if not exists idx_shots_scene on public.shots (scene_id);
create index if not exists idx_character_appearances_scene on public.character_appearances (scene_id);
create index if not exists idx_picture_locks_project on public.picture_locks (project_id);
create index if not exists idx_invites_project on public.invites (project_id);
create index if not exists idx_asset_versions_project on public.asset_versions (project_id);
create index if not exists idx_generation_packages_scene on public.generation_packages (scene_id);
create index if not exists idx_world_appearances_scene on public.world_appearances (scene_id);
create index if not exists idx_timeline_versions_project on public.timeline_versions (project_id);

alter policy org_members_select on public.org_members
  using (user_id = (select auth.uid()) or public.is_org_member(org_id));

-- The "that's a lot in a minute" limits count the caller's own recent requests on every request; index that count.
create index if not exists idx_audio_generations_user_recent on public.audio_generations (created_by, created_at desc) where not batch;
create index if not exists idx_ai_proposals_user_recent on public.ai_proposals (created_by, created_at desc);
create index if not exists idx_world_reference_images_user_recent on public.world_reference_images (created_by, created_at desc);
create index if not exists idx_character_reference_images_user_recent on public.character_reference_images (created_by, created_at desc);
create index if not exists idx_script_generations_user_recent on public.script_generations (created_by, created_at desc);
