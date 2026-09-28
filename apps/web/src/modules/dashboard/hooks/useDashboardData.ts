"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Organization, Project } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet, apiPost } from "@/lib/apiClient";
import type { NewProjectInput } from "../components/NewProjectForm";

type Membership = { org_id: string; role: "owner" | "admin" | "producer" | "member"; organization: Organization };
const ORG_KEY = "aura.org";

export function useDashboardData() {
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async (orgId: string) => {
    const rows = await apiGet<Project[]>(`/api/projects?org_id=${orgId}`);
    setProjects(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) {
        router.replace("/sign-in");
        return;
      }
      setMe(data.session.user.id);
      try {
        const email = data.session.user.email ?? "My Studio";
        const bootstrapped = await apiPost<Organization>("/api/organizations/bootstrap", {
          name: `${email.split("@")[0]}'s Studio`,
        });
        // People invited to other studios belong to several: remember the last one chosen.
        const mine = await apiGet<Membership[]>("/api/organizations");
        if (cancelled) return;
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(ORG_KEY);
        } catch {
          saved = null;
        }
        const chosen = mine.find((m) => m.org_id === saved)?.organization ?? bootstrapped;
        setMemberships(mine);
        setOrg(chosen);
        await refreshProjects(chosen.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router, refreshProjects]);

  async function switchOrg(orgId: string) {
    const m = memberships.find((x) => x.org_id === orgId);
    if (!m) return;
    try {
      localStorage.setItem(ORG_KEY, orgId);
    } catch {
      /* per-browser convenience only */
    }
    setOrg(m.organization);
    await refreshProjects(orgId);
  }

  const role = memberships.find((m) => m.org_id === org?.id)?.role ?? null;

  async function createProject(input: NewProjectInput) {
    if (!org) return;
    await apiPost("/api/projects", { org_id: org.id, ...input });
    await refreshProjects(org.id);
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    router.replace("/");
  }

  return { org, role, memberships, projects, loading, error, createProject, switchOrg, signOut, me };
}
