"use client";

// Tasks and review requests for this project (SRS taskWorkflowEngine / reviewWorkflowEngine).

import { useCallback, useEffect, useState } from "react";
import { PERMISSION_MODULES, type PermissionModule, type Task, type TeamMember } from "@aurastage/contracts";
import { collabApi } from "../api/collabApi";
import { MODULE_LABELS } from "../types";

const STATUS: Record<Task["status"], string> = { open: "Open", in_progress: "In progress", done: "Done", cancelled: "Cancelled" };

export function TaskRow({ t, me, onStatus, showProject }: { t: Task; me: string | null; onStatus: (id: string, s: Task["status"]) => void; showProject?: boolean }) {
  const mine = t.assignee === me || t.created_by === me;
  const overdue = t.due_date && t.status !== "done" && t.status !== "cancelled" && t.due_date < new Date().toISOString().slice(0, 10);
  return (
    <li className="flex items-center gap-3 border-t border-aura-border py-2 text-sm" data-testid={`task-${t.title}`}>
      <input type="checkbox" aria-label={`Done: ${t.title}`} checked={t.status === "done"} disabled={!mine}
        onChange={(e) => onStatus(t.id, e.target.checked ? "done" : "open")} className="accent-[#d4a64a]" />
      <div className="min-w-0 flex-1">
        <div className={t.status === "done" ? "text-white/40 line-through" : ""}>
          {t.kind === "review" && <span className="mr-1 rounded bg-aura-gold/15 px-1.5 text-[10px] uppercase text-aura-gold">Review</span>}
          {t.title}
        </div>
        <div className="text-[11px] text-white/50">
          {showProject ? `${t.project_title} · ` : ""}{MODULE_LABELS[t.module] ?? t.module} · {t.assignee_email ? `for ${t.assignee_email}` : "unassigned"}
          {t.due_date && <span className={overdue ? " text-red-300" : ""}> · due {t.due_date}</span>}
        </div>
      </div>
      <span className="text-[11px] text-white/50">{STATUS[t.status]}</span>
      {mine && t.status === "open" && (
        <button onClick={() => onStatus(t.id, "in_progress")} className="rounded-md border border-aura-border px-2 py-0.5 text-[11px]">Start</button>
      )}
    </li>
  );
}

export function ReviewQueue({ projectId, members, me }: { projectId: string; members: TeamMember[]; me: string | null }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [module, setModule] = useState<PermissionModule>("script");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => collabApi.tasks(projectId).then(setTasks).catch((e) => setError(e.message)), [projectId]);
  useEffect(() => void load(), [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
      return false;
    }
  }

  return (
    <div className="rounded-lg border border-aura-border bg-aura-panel p-4">
      <h2 className="font-display text-lg">Tasks & reviews</h2>
      <form className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="New task"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act(() => collabApi.createTask(projectId, { module, title, assignee: assignee || null, due_date: due || null, kind: "task" }))) {
            setTitle("");
            setDue("");
          }
        }}>
        <input aria-label="Task title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?"
          className="min-w-[12rem] flex-1 rounded-md border border-aura-border bg-black/40 px-2 py-1.5" />
        <select aria-label="Assign to" value={assignee} onChange={(e) => setAssignee(e.target.value)} className="rounded-md border border-aura-border bg-black/40 px-2 py-1.5">
          <option value="">Unassigned</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
        </select>
        <select aria-label="Workspace" value={module} onChange={(e) => setModule(e.target.value as PermissionModule)} className="rounded-md border border-aura-border bg-black/40 px-2 py-1.5">
          {PERMISSION_MODULES.map((m) => <option key={m} value={m}>{MODULE_LABELS[m]}</option>)}
        </select>
        <input type="date" aria-label="Due" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-md border border-aura-border bg-black/40 px-2 py-1.5" />
        <button type="submit" className="rounded-md bg-aura-gold px-3 py-1.5 text-black">Add task</button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      <ul className="mt-2" aria-label="Tasks">
        {!tasks.length && <li className="py-3 text-xs text-white/50">No tasks yet. Ask for a review from any workspace's Comments panel, or add one here.</li>}
        {tasks.map((t) => <TaskRow key={t.id} t={t} me={me} onStatus={(id, s) => act(() => collabApi.setTaskStatus(id, s))} />)}
      </ul>
    </div>
  );
}

/** Everything assigned to me across projects (dashboard). */
export function MyTasks({ me }: { me: string | null }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const load = useCallback(() => collabApi.myTasks().then(setTasks).catch(() => setTasks([])), []);
  useEffect(() => void load(), [load]);
  const open = (tasks ?? []).filter((t) => t.status !== "done" && t.status !== "cancelled");
  return (
    <div className="rounded-lg border border-aura-border bg-aura-panel p-4" data-testid="my-tasks">
      <h2 className="font-display text-lg">My tasks</h2>
      <ul className="mt-1">
        {tasks && !open.length && <li className="py-3 text-xs text-white/50">Nothing assigned to you right now.</li>}
        {open.map((t) => <TaskRow key={t.id} t={t} me={me} showProject onStatus={(id, s) => collabApi.setTaskStatus(id, s).then(load)} />)}
      </ul>
    </div>
  );
}
