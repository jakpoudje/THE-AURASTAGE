"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Organization, Project } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { apiGet, apiPost } from "@/lib/apiClient";
import type { NewProjectInput } from "../components/NewProjectForm";

export function useDashboardData() {
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(null);
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
      try {
        const email = data.session.user.email ?? "My Studio";
        const bootstrapped = await apiPost<Organization>("/api/organizations/bootstrap", {
          name: `${email.split("@")[0]}'s Studio`,
        });
        if (cancelled) return;
        setOrg(bootstrapped);
        await refreshProjects(bootstrapped.id);
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

  async function createProject(input: NewProjectInput) {
    if (!org) return;
    await apiPost("/api/projects", { org_id: org.id, ...input });
    await refreshProjects(org.id);
  }

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    router.replace("/");
  }

  return { org, projects, loading, error, createProject, signOut };
}
