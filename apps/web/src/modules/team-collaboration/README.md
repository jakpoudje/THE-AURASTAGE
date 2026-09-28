# Team & Collaboration (web workspace)

Route: `/projects/[id]/team` (sidebar → Team & Collaboration) and `/invite#<token>`.

- **People on this project** — studio-wide people (owner/admin/producer) and project members with their film role,
  extra permissions and last sign-in. Producers of the project and studio owners/admins can change roles, add extra
  permissions (module × action grid; what the role already gives is shown fixed) and remove people.
- **Invite someone** — to this project with a role, or (owners/admins) to the whole studio as admin/producer.
  Produces a private link to send; it works once, only for that email, and expires in 14 days.
- **Everyone in the studio** — owners/admins change studio roles; a studio always keeps an owner.
- **What each role can do** — read straight from the role definitions the database enforces.
- The shell shows your role on every page and a **View only** note in workspaces your role can't change
  (`lib/useProjectAccess.ts`). The database is the authority; refusals come back with a plain-language reason.

- **Comments** (every workspace, top bar → Comments): threads on what the page shows, with @mentions, replies,
  resolve/reopen, edit/delete your own, and *Request review*. In Editorial a comment can be pinned to the playhead's
  timecode and clicking ⏱ jumps there. Comments made on an older version say so and are never moved. A notification
  link (`?comment=<id>`) opens the drawer at that thread.
- **Notifications** (bell in every workspace and on the dashboard): mentions, replies, review requests, assigned and
  finished tasks — read from the server, marked read when opened.
- **Tasks & reviews** and **Recent activity** on the Team page; **My tasks** on the dashboard.

Backend: `apps/api/src/modules/collaboration`. Tests: `tests/e2e/team/run.cjs`, `tests/e2e/comments/run.cjs`.
