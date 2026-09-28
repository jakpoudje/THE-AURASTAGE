// Comments, tasks, notifications and activity (apps/api/src/modules/collaboration, migration 0021).
import type { ActivityItem, Comment, CreateCommentInput, CreateTaskInput, Notification, Task } from "@aurastage/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient";

export const collabApi = {
  comments: (projectId: string, f: { module: string; object_type: string; object_id: string }) =>
    apiGet<Comment[]>(`/api/projects/${projectId}/comments?module=${f.module}&object_type=${f.object_type}&object_id=${f.object_id}`),
  addComment: (projectId: string, c: Partial<CreateCommentInput> & Pick<CreateCommentInput, "module" | "object_type" | "object_id" | "body">) =>
    apiPost<{ id: string }>(`/api/projects/${projectId}/comments`, c),
  resolve: (commentId: string, resolved: boolean) => apiPost<{ ok: true }>(`/api/comments/${commentId}/resolve`, { resolved }),
  edit: (commentId: string, body: string) => apiPatch<{ ok: true }>(`/api/comments/${commentId}`, { body }),
  remove: (commentId: string) => apiDelete<{ ok: true }>(`/api/comments/${commentId}`),
  tasks: (projectId: string) => apiGet<Task[]>(`/api/projects/${projectId}/tasks`),
  myTasks: () => apiGet<Task[]>("/api/tasks/mine"),
  createTask: (projectId: string, t: Partial<CreateTaskInput> & Pick<CreateTaskInput, "module" | "title">) => apiPost<{ id: string }>(`/api/projects/${projectId}/tasks`, t),
  setTaskStatus: (taskId: string, status: Task["status"]) => apiPatch<{ ok: true }>(`/api/tasks/${taskId}`, { status }),
  notifications: () => apiGet<{ unread: number; items: Notification[] }>("/api/notifications"),
  markRead: (ids: string[] | null) => apiPost<{ marked: number }>("/api/notifications/read", { ids }),
  activity: (projectId: string) => apiGet<{ items: ActivityItem[]; engine_version: string }>(`/api/projects/${projectId}/activity`),
};
