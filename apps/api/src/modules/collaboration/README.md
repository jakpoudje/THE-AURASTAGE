# Collaboration (backend domain) — Team & Collaboration

## Purpose
Who can work on what (SRS §13.2, §18): studios, their people, project teams with film roles,
extra per-person permissions, and invites. Every workspace's writes are checked against these
permissions **in the database**.

## Canonical owner
Team & Collaboration. Canonical objects: Organization, OrgMember, ProjectMember, ProjectRole, Invite.

## How permissions work (migration 0019)
- Studio roles: `owner`, `admin`, `producer` have full production rights on every project in the studio;
  owners/admins also manage the studio's people. `member` only sees projects they were added to.
- Project roles (`public.project_roles`, the only copy of the matrix): Producer, Director, Writer, Script Editor,
  Casting Director, Dialogue Editor, Cinematographer, Storyboard Artist, Production Designer, Costume / Wardrobe,
  Sound Designer, ADR Editor, Composer, Re-recording Mixer, Editor, Colorist, VFX, QC / Delivery, Reviewer.
  Each grants actions per module; everyone on a project can view and comment everywhere.
- Extra grants: `module:action` strings on a project member (e.g. `script:approve`).
- Modules: script, casting, dialogue, scene_dna, shots, generation, audio, editorial, delivery, assets, settings, team.
  Actions: view, comment, create, edit, generate, approve, lock, administer.
- **Writes:** every user-callable write function is a thin wrapper that calls
  `public.gate_write(project, module, action)` and then the unchanged body in schema `app_private`
  (not exposed). Refusals are `AURA-COL-403: your role (Writer) can't approve in Scriptwriter. …`.
  Every module passes that reason to the screen (`infrastructure/permissions.ts`).
- **Reads:** RLS policies use `project_id = any(my_project_ids())`.
- **New write functions must call `gate_write`**; `tests/integration/team_db.sql` fails otherwise.
- Object-level scope (e.g. one scene) is deferred — it needs per-object ACLs in every domain.

## API endpoints
- `GET /api/organizations`, `POST /api/organizations/bootstrap`
- `GET /api/organizations/:id/team` (owners/admins/producers), `POST /api/organizations/:id/invites`,
  `PATCH|DELETE /api/organizations/:id/members/:userId`
- `GET /api/projects/:id/access`, `GET /api/projects/:id/team`,
  `POST /api/projects/:id/team/members`, `DELETE /api/projects/:id/team/members/:userId`
- `DELETE /api/invites/:id`, `POST /api/invites/preview`, `POST /api/invites/accept`
  (invite tokens travel only in request bodies and the URL fragment `/invite#token`, never in logged URLs;
  the database stores only their SHA-256)

### Comments, tasks, notifications, activity (11b, migration 0021)
- `GET|POST /api/projects/:id/comments` (filters `module`, `object_type`, `object_id`), `POST /api/comments/:id/resolve`,
  `PATCH|DELETE /api/comments/:id` — comments record the exact `object_version` they were made on and an optional
  `anchor` (Editorial: `{ frame, timecode }`); upstream changes never move or delete them. Writing needs the module's
  `comment` permission; resolving someone else's thread needs `edit` there; only authors edit/delete (deleted = kept as "(deleted)").
- `GET|POST /api/projects/:id/tasks`, `GET /api/tasks/mine`, `PATCH /api/tasks/:id` — tasks and review requests;
  assignees must be on the project; the assignee, creator or a team administrator moves them.
- `GET /api/notifications` (latest 30 + unread count), `POST /api/notifications/read` — private to each person;
  created only by the database (mentions, replies, review requests/assignments, finished tasks), and only for people
  who can still see the project.
- `GET /api/projects/:id/activity` — the project's audit trail, described by `engines/collaboration/activityFeedEngine`.

## Database objects
Tables `project_roles`, `project_members`, `invites`, `comments`, `tasks`, `notifications`; `audit_events.project_id` (filled by trigger).
Functions `project_can`, `project_access`, `my_project_ids`, `my_admin_org_ids`, `org_role`, `can_view_project`,
`gate_write`, `project_team`, `org_team`, `set_project_member`, `remove_project_member`, `set_org_member_role`,
`remove_org_member`, `create_invite`, `revoke_invite`, `invite_preview`, `accept_invite`, `add_comment`, `resolve_comment`,
`edit_comment`, `list_comments`, `create_task`, `set_task_status`, `list_tasks`, `mark_notifications_read`, `project_activity`
(internal: `notify`, `module_path`, `module_label`).

## Events emitted
Written to `audit_events` in the same transaction: InviteCreated, InviteRevoked, InviteAccepted,
ProjectMemberAdded/Changed/Removed, OrgRoleChanged, OrgMemberRemoved, OrgMemberLeft, CommentAdded/Replied/Resolved/
Reopened/Edited/Deleted, TaskCreated, ReviewRequested, TaskStatusChanged.

## Invariants
A studio always keeps at least one owner. Only owners change owners. An invite works once, only for its
email address, and expires after 14 days. Removing someone from the studio removes all their project access.

## Tests
`./tests/routes.test.ts`, `./tests/comments.test.ts` (API), `tests/integration/team_db.sql` and `comments_db.sql` (database),
`tests/e2e/team/run.cjs` and `tests/e2e/comments/run.cjs` (browser),
live checks in `tests/live/smoke.ts` and `tests/live/browser/run.mjs`.

## Known operational error codes
AURA-COL-400 invalid input · 401 not signed in · 403 not allowed (with the reason) · 404 not found ·
409 conflict (last owner, already used) · 410 invite expired or cancelled · 500 unexpected.
