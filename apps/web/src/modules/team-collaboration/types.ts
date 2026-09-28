// Team & Collaboration view types (shapes come from @aurastage/contracts).
import type { Invite, ProjectAccess, ProjectRole, TeamMember } from "@aurastage/contracts";

export type ProjectTeam = {
  project: { id: string; title: string; org_id: string };
  access: ProjectAccess;
  can_manage: boolean;
  can_manage_studio: boolean;
  roles: ProjectRole[];
  members: TeamMember[];
  invites: Invite[];
};

export type StudioMember = {
  user_id: string;
  email: string;
  org_role: "owner" | "admin" | "producer" | "member";
  projects: number;
  joined_at: string;
  last_sign_in_at: string | null;
};

export type StudioTeam = { members: StudioMember[]; invites: Invite[]; projects: { id: string; title: string }[] };

export const MODULE_LABELS: Record<string, string> = {
  script: "Scriptwriter",
  casting: "Casting",
  dialogue: "Dialogue",
  scene_dna: "Scene DNA",
  shots: "Storyboard",
  generation: "Visual Gen",
  audio: "Audio",
  editorial: "Editorial",
  delivery: "Export",
  assets: "Assets",
  settings: "Settings",
  team: "Team",
};

export const STUDIO_ROLE_HELP: Record<string, string> = {
  owner: "Everything, including the studio's people and owners",
  admin: "Everything, including the studio's people",
  producer: "Full production rights on every project",
  member: "Only the projects they're added to, with their project role",
};
