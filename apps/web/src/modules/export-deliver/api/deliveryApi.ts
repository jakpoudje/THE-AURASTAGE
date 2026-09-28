// Thin client for the Export & Deliver API. No logic here.
import type { CreateRenderInput } from "@aurastage/contracts";
import { apiGet, apiPost } from "@/lib/apiClient";
import type { DeliveryWorkspace } from "../types";

export const deliveryApi = {
  getWorkspace: (projectId: string) => apiGet<DeliveryWorkspace>(`/api/projects/${projectId}/delivery`),
  createRender: (projectId: string, input: CreateRenderInput) => apiPost<{ render_id: string; manifest_sha256: string; files: string[] }>(`/api/projects/${projectId}/delivery/renders`, input),
  cancel: (renderId: string) => apiPost<{ status: string; cancel_requested: boolean }>(`/api/renders/${renderId}/cancel`, {}),
  manifest: (renderId: string) => apiGet<{ manifest_sha256: string; manifest: unknown }>(`/api/renders/${renderId}/manifest`),
};
