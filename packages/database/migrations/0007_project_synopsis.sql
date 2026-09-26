-- Scriptwriter-owned long-form story synopsis on the Project root (SRS §3.1:
-- story fields are edited in Scriptwriter). The logline stays a short pitch
-- (<= 500 chars); multi-paragraph outlines belong here.
alter table public.projects add column if not exists synopsis text;
alter table public.projects drop constraint if exists projects_synopsis_len;
alter table public.projects add constraint projects_synopsis_len check (synopsis is null or char_length(synopsis) <= 20000);
