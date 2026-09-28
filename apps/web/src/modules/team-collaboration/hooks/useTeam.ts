"use client";

// Loads the project team (and, for studio owners/admins, the studio's people) and runs
// team changes. Every change is re-read from the server afterwards: the database is the
// authority and may refuse with a reason, which is shown as-is.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet } from "@/lib/apiClient";
import { invalidateProjectAccess } from "@/lib/useProjectAccess";
import { inviteLink, teamApi } from "../api/teamApi";
import type { ProjectTeam, StudioTeam } from "../types";

export type NewInvite = { email: string; scope: "project" | "studio"; project_role: string; studio_role: "admin" | "producer"; grants: string[] };

export function useTeam(projectId: string) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [team, setTeam] = useState<ProjectTeam | null>(null);
  const [studio, setStudio] = useState<StudioTeam | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const t = await teamApi.projectTeam(projectId);
    if (!alive.current) return t;
    setTeam(t);
    if (t.can_manage_studio) setStudio(await teamApi.studioTeam(t.project.org_id));
    invalidateProjectAccess(projectId);
    return t;
  }, [projectId]);

  useEffect(() => {
    alive.current = true;
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) {
        router.replace("/sign-in");
        return;
      }
      setMe(data.session.user.id);
      try {
        const [p] = await Promise.all([apiGet<Project>(`/api/projects/${projectId}`), reload()]);
        if (alive.current) setProject(p);
      } catch (err) {
        if (alive.current) setError(err instanceof Error ? err.message : "Could not load the team");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [projectId, router, reload]);

  async function run(kind: string, fn: () => Promise<unknown>, message: string) {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await reload();
      setNotice(message);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return {
    project, team, studio, me, loading, busy, error, notice, link,
    clearLink: () => setLink(null),
    invite: (i: NewInvite) =>
      run("invite", async () => {
        if (!team) return;
        const r = await teamApi.invite(team.project.org_id, i.scope === "project"
          ? { email: i.email, org_role: "member", project_id: projectId, project_role: i.project_role, grants: i.grants }
          : { email: i.email, org_role: i.studio_role });
        setLink({ email: r.invite.email, url: inviteLink(r.token) });
      }, `Invite ready for ${i.email.trim().toLowerCase()}. Copy the link below and send it to them.`),
    setMember: (userId: string, role: string, grants: string[]) =>
      run(`member:${userId}`, () => teamApi.setMember(projectId, { user_id: userId, role, grants }), "Role saved."),
    removeMember: (userId: string, email: string) =>
      run(`member:${userId}`, () => teamApi.removeMember(projectId, userId), `${email} no longer has access to this project.`),
    revokeInvite: (inviteId: string, email: string) => run(`invite:${inviteId}`, () => teamApi.revokeInvite(inviteId), `Invite for ${email} cancelled.`),
    setStudioRole: (userId: string, role: string) =>
      run(`studio:${userId}`, () => teamApi.setStudioRole(team!.project.org_id, userId, role), "Studio role saved."),
    removeFromStudio: (userId: string, email: string) =>
      run(`studio:${userId}`, () => teamApi.removeFromStudio(team!.project.org_id, userId), `${email} was removed from the studio.`),
  };
}
