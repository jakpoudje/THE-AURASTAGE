-- Phase 4: Dialogue Intelligence canonical storage (SRS §7).
-- Canonical owner: Dialogue Intelligence (apps/api/src/modules/dialogue).
-- Reads scripts/scenes (Scriptwriter) and characters (Casting); never writes them.
--
-- One row per spoken line of the approved script. Annotations (intention,
-- subtext, emotion, intensity, notes) and approval belong to Dialogue. When the
-- approved script changes, sync carries annotations to the same words, marks
-- edited annotated/approved lines REVIEW_REQUIRED (keeping the previous text),
-- and marks vanished lines omitted — never deleted (CLAUDE.md rule 11).

create table if not exists public.dialogue_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  scene_id uuid not null references public.scenes(id) on delete cascade,
  scene_number int not null,
  ordinal int not null,
  character_id uuid references public.characters(id) on delete set null,
  speaker_name text not null,
  speaker_key text not null,
  extensions text[] not null default '{}',
  parenthetical text,
  text text not null,
  text_hash text not null,
  listener_ids uuid[] not null default '{}',
  estimated_seconds numeric not null default 0,
  element_index int not null,
  source_version_id uuid not null references public.script_versions(id),
  intention text check (intention is null or char_length(intention) <= 200),
  subtext text check (subtext is null or char_length(subtext) <= 2000),
  emotion text check (emotion is null or emotion in ('neutral','joy','sadness','anger','fear','surprise','disgust','trust','anticipation','tension','love','contempt','resignation','determination')),
  intensity int check (intensity is null or intensity between 0 and 10),
  notes text check (notes is null or char_length(notes) <= 4000),
  status text not null default 'active' check (status in ('active','omitted')),
  approval text not null default 'draft' check (approval in ('draft','approved')),
  review_state text not null default 'current' check (review_state in ('current','review_required')),
  previous_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dialogue_lines_project on public.dialogue_lines(project_id);
create index if not exists idx_dialogue_lines_scene on public.dialogue_lines(scene_id);
drop trigger if exists trg_dialogue_lines_updated_at on public.dialogue_lines;
create trigger trg_dialogue_lines_updated_at before update on public.dialogue_lines
  for each row execute function public.set_updated_at();
alter table public.dialogue_lines enable row level security;
drop policy if exists dialogue_lines_select on public.dialogue_lines;
create policy dialogue_lines_select on public.dialogue_lines for select using (public.is_org_member(org_id));

-- Internal guard (same pattern as casting_assert_member).
create or replace function public.dialogue_assert_member(p_project_id uuid) returns uuid
language plpgsql security definer stable set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'AURA-DLG-403: not allowed to change this project''s dialogue' using errcode = '42501';
  end if;
  return v_org;
end;
$$;

-- Sync lines from the approved script version.
-- p_items: [{scene_number, ordinal, speaker_name, speaker_key, character_id?, extensions[],
--            parenthetical?, text, text_hash, element_index, estimated_seconds, listener_ids[]}]
create or replace function public.sync_dialogue_lines(p_project_id uuid, p_version_id uuid, p_items jsonb, p_engine_version text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_script public.scripts;
  v_item jsonb;
  v_scene uuid;
  v_line public.dialogue_lines;
  v_seen uuid[] := '{}';
  v_created int := 0; v_kept int := 0; v_changed int := 0; v_omitted int := 0;
  v_annotated boolean;
  v_summary jsonb;
begin
  v_org := public.dialogue_assert_member(p_project_id);
  select * into v_script from public.scripts where project_id = p_project_id;
  if v_script.id is null or v_script.approved_version_id is distinct from p_version_id then
    raise exception 'AURA-DLG-409: the approved script changed; reload and sync again' using errcode = 'P0409';
  end if;
  perform 1 from public.scripts where id = v_script.id for update;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select id into v_scene from public.scenes
      where script_id = v_script.id and number = (v_item->>'scene_number')::int and status = 'active';
    if v_scene is null then continue; end if;

    -- 1) Same words, same scene: carry everything over.
    select * into v_line from public.dialogue_lines
      where project_id = p_project_id and scene_id = v_scene and text_hash = v_item->>'text_hash'
        and not (id = any(v_seen))
      order by (status = 'active') desc, abs(ordinal - (v_item->>'ordinal')::int) limit 1;
    if v_line.id is not null then
      update public.dialogue_lines set
        scene_number = (v_item->>'scene_number')::int, ordinal = (v_item->>'ordinal')::int,
        character_id = nullif(v_item->>'character_id', '')::uuid, speaker_name = v_item->>'speaker_name',
        extensions = coalesce(array(select jsonb_array_elements_text(v_item->'extensions')), '{}'),
        parenthetical = v_item->>'parenthetical',
        listener_ids = coalesce(array(select (jsonb_array_elements_text(v_item->'listener_ids'))::uuid), '{}'),
        estimated_seconds = (v_item->>'estimated_seconds')::numeric, element_index = (v_item->>'element_index')::int,
        source_version_id = p_version_id,
        -- A line coming back after being omitted needs another look.
        review_state = case when status = 'omitted' then 'review_required' else review_state end,
        status = 'active'
      where id = v_line.id;
      v_seen := v_seen || v_line.id; v_kept := v_kept + 1;
      continue;
    end if;

    -- 2) Same speaker, same position, different words: the line was edited.
    select * into v_line from public.dialogue_lines
      where project_id = p_project_id and scene_id = v_scene and speaker_key = v_item->>'speaker_key'
        and ordinal = (v_item->>'ordinal')::int and status = 'active' and not (id = any(v_seen))
      limit 1;
    if v_line.id is not null then
      v_annotated := v_line.approval = 'approved' or coalesce(v_line.intention, v_line.subtext, v_line.emotion, v_line.notes) is not null or v_line.intensity is not null;
      update public.dialogue_lines set
        text = v_item->>'text', text_hash = v_item->>'text_hash',
        previous_text = case when v_annotated then coalesce(previous_text, v_line.text) else null end,
        character_id = nullif(v_item->>'character_id', '')::uuid, speaker_name = v_item->>'speaker_name',
        extensions = coalesce(array(select jsonb_array_elements_text(v_item->'extensions')), '{}'),
        parenthetical = v_item->>'parenthetical',
        listener_ids = coalesce(array(select (jsonb_array_elements_text(v_item->'listener_ids'))::uuid), '{}'),
        estimated_seconds = (v_item->>'estimated_seconds')::numeric, element_index = (v_item->>'element_index')::int,
        source_version_id = p_version_id,
        review_state = case when v_annotated then 'review_required' else review_state end
      where id = v_line.id;
      v_seen := v_seen || v_line.id; v_changed := v_changed + 1;
      continue;
    end if;

    -- 3) New line.
    insert into public.dialogue_lines(org_id, project_id, scene_id, scene_number, ordinal, character_id, speaker_name, speaker_key,
      extensions, parenthetical, text, text_hash, listener_ids, estimated_seconds, element_index, source_version_id)
    values (v_org, p_project_id, v_scene, (v_item->>'scene_number')::int, (v_item->>'ordinal')::int,
      nullif(v_item->>'character_id', '')::uuid, v_item->>'speaker_name', v_item->>'speaker_key',
      coalesce(array(select jsonb_array_elements_text(v_item->'extensions')), '{}'), v_item->>'parenthetical',
      v_item->>'text', v_item->>'text_hash',
      coalesce(array(select (jsonb_array_elements_text(v_item->'listener_ids'))::uuid), '{}'),
      (v_item->>'estimated_seconds')::numeric, (v_item->>'element_index')::int, p_version_id)
    returning * into v_line;
    v_seen := v_seen || v_line.id; v_created := v_created + 1;
  end loop;

  -- Lines no longer in the approved script: omitted, never deleted.
  update public.dialogue_lines set status = 'omitted',
    review_state = case when approval = 'approved' or coalesce(intention, subtext, emotion, notes) is not null or intensity is not null
                        then 'review_required' else review_state end
    where project_id = p_project_id and status = 'active' and not (id = any(v_seen));
  get diagnostics v_omitted = row_count;

  v_summary := jsonb_build_object('version_id', p_version_id, 'created', v_created, 'kept', v_kept, 'changed', v_changed, 'omitted', v_omitted);
  insert into public.jobs(org_id, project_id, engine_id, engine_version, status, input_snapshot, output_refs, attempt, started_at, completed_at)
  values (v_org, p_project_id, 'dialogue.dialogueExtractionEngine', p_engine_version, 'completed',
          jsonb_build_object('script_version_id', p_version_id), v_summary, 1, now(), now());
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'DialogueSynced', 'Script', v_script.id, v_summary || jsonb_build_object('engine_version', p_engine_version));
  return v_summary;
end;
$$;

-- Annotate / approve one line. Editing an approved line's annotations reopens it (draft) unless
-- the same call approves it.
create or replace function public.update_dialogue_line(p_id uuid, p_patch jsonb)
returns public.dialogue_lines
language plpgsql security definer set search_path = public as $$
declare v_l public.dialogue_lines; v_annot boolean;
begin
  select * into v_l from public.dialogue_lines where id = p_id for update;
  if v_l.id is null then raise exception 'AURA-DLG-404: line not found' using errcode = 'P0404'; end if;
  perform public.dialogue_assert_member(v_l.project_id);
  if v_l.status = 'omitted' and (p_patch ? 'approval') and p_patch->>'approval' = 'approved' then
    raise exception 'AURA-DLG-409: this line is no longer in the approved script' using errcode = 'P0409';
  end if;
  v_annot := p_patch ?| array['intention','subtext','emotion','intensity','notes'];
  update public.dialogue_lines set
    intention = case when p_patch ? 'intention' then nullif(p_patch->>'intention', '') else intention end,
    subtext = case when p_patch ? 'subtext' then nullif(p_patch->>'subtext', '') else subtext end,
    emotion = case when p_patch ? 'emotion' then nullif(p_patch->>'emotion', '') else emotion end,
    intensity = case when p_patch ? 'intensity' then (p_patch->>'intensity')::int else intensity end,
    notes = case when p_patch ? 'notes' then nullif(p_patch->>'notes', '') else notes end,
    approval = case when p_patch ? 'approval' then p_patch->>'approval' when v_annot then 'draft' else approval end,
    review_state = case when (p_patch->>'acknowledge_review')::boolean or (p_patch->>'approval') = 'approved' then 'current' else review_state end,
    previous_text = case when (p_patch->>'acknowledge_review')::boolean or (p_patch->>'approval') = 'approved' then null else previous_text end
  where id = p_id returning * into v_l;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_l.org_id, auth.uid(), case when (p_patch->>'approval') = 'approved' then 'DialogueLineApproved' else 'DialogueLineUpdated' end,
          'DialogueLine', v_l.id, jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k), 'source_version_id', v_l.source_version_id));
  return v_l;
end;
$$;

-- "Approval & Lock" for a whole scene's dialogue.
create or replace function public.approve_scene_dialogue(p_project_id uuid, p_scene_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_n int;
begin
  v_org := public.dialogue_assert_member(p_project_id);
  update public.dialogue_lines set approval = 'approved', review_state = 'current', previous_text = null
    where project_id = p_project_id and scene_id = p_scene_id and status = 'active';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'AURA-DLG-404: no dialogue in that scene' using errcode = 'P0404'; end if;
  insert into public.audit_events(org_id, actor_id, action, object_type, object_id, metadata)
  values (v_org, auth.uid(), 'SceneDialogueApproved', 'Scene', p_scene_id, jsonb_build_object('lines', v_n));
  return v_n;
end;
$$;

revoke execute on function public.dialogue_assert_member(uuid) from public, anon, authenticated;
revoke execute on function public.sync_dialogue_lines(uuid, uuid, jsonb, text) from public, anon;
revoke execute on function public.update_dialogue_line(uuid, jsonb) from public, anon;
revoke execute on function public.approve_scene_dialogue(uuid, uuid) from public, anon;
grant execute on function public.sync_dialogue_lines(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.update_dialogue_line(uuid, jsonb) to authenticated;
grant execute on function public.approve_scene_dialogue(uuid, uuid) to authenticated;
