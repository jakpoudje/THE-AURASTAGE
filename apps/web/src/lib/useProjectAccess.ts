"use client";

// What the signed-in person may do in a project (Phase 11 permissions). A UI hint only:
// the database checks every write and refuses with a plain-language reason.

import { useEffect, useState } from "react";
import type { PermissionAction, PermissionModule, ProjectAccess } from "@aurastage/contracts";
import { apiGet } from "./apiClient";

const cache = new Map<string, Promise<ProjectAccess>>();

export function useProjectAccess(projectId: string | undefined) {
  const [access, setAccess] = useState<ProjectAccess | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    let p = cache.get(projectId);
    if (!p) {
      p = apiGet<ProjectAccess>(`/api/projects/${projectId}/access`);
      cache.set(projectId, p);
      p.catch(() => cache.delete(projectId));
    }
    p.then((a) => alive && setAccess(a)).catch(() => null);
    return () => {
      alive = false;
    };
  }, [projectId]);
  return access;
}

/** Forget cached access (e.g. after the team page changes someone's role). */
export function invalidateProjectAccess(projectId: string) {
  cache.delete(projectId);
}

export function can(access: ProjectAccess | null, module: PermissionModule, action: PermissionAction) {
  return !!access && (access.modules[module] ?? []).includes(action);
}

export function roleLabel(access: ProjectAccess | null) {
  if (!access) return null;
  if (access.source === "organization") return access.org_role ? access.org_role[0].toUpperCase() + access.org_role.slice(1) : null;
  return access.project_role_label ?? access.project_role;
}
