"use client";

import { apiGet, apiGetBytes, apiPatch, apiPost, apiUpload } from "@/lib/apiClient";
import type { AssetDetail, BulkDeleteResult, Filters, Library, VideoEditParams } from "../types";

const qs = (f: Filters) => {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.category) p.set("category", f.category);
  if (f.type) p.set("type", f.type);
  if (f.usage !== "any") p.set("usage", f.usage);
  if (f.scene_id) p.set("scene_id", f.scene_id);
  if (f.archived) p.set("archived", "1");
  if (f.sort !== "newest") p.set("sort", f.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
};
const meta = (m: Record<string, string | number | null | undefined>) =>
  Object.entries(m).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

export const assetsApi = {
  library: (projectId: string, f: Filters) => apiGet<Library>(`/api/projects/${projectId}/library${qs(f)}`),
  detail: (assetId: string) => apiGet<AssetDetail>(`/api/assets/${assetId}`),
  upload: (projectId: string, file: File, m: Record<string, string | number | null | undefined>) =>
    apiUpload<AssetDetail>(`/api/projects/${projectId}/library?${meta(m)}`, file, contentTypeOf(file)),
  replace: (assetId: string, file: File, m: Record<string, string | number | null | undefined>) =>
    apiUpload<AssetDetail>(`/api/assets/${assetId}/versions?${meta(m)}`, file, contentTypeOf(file)),
  remove: (assetId: string, confirm: boolean) =>
    apiPost<{ deleted: true; name: string; files_removed: number; files_left: number }>(`/api/assets/${assetId}/delete`, { confirm }),
  /** Deletes up to 25 assets in one call (the page batches larger selections and shows progress). */
  removeMany: (projectId: string, body: { asset_ids: string[]; confirm: boolean; remove_from_clips: boolean }) =>
    apiPost<BulkDeleteResult>(`/api/projects/${projectId}/library/delete`, body),
  update: (assetId: string, patch: Record<string, unknown>) => apiPatch<AssetDetail>(`/api/assets/${assetId}`, patch),
  link: (assetId: string, object_type: "scene" | "character", object_id: string, linked: boolean) =>
    apiPost<AssetDetail>(`/api/assets/${assetId}/links`, { object_type, object_id, linked }),
  /** Queues a trim / mute / speed edit of a video; the render worker saves it as a new version (migration 0050). */
  videoEdit: (assetId: string, body: VideoEditParams & { note: string }) => apiPost<{ id: string }>(`/api/assets/${assetId}/video-edit`, body),
  bytes: (assetId: string, version?: number) => apiGetBytes(`/api/assets/${assetId}/content${version ? `?version=${version}` : ""}`),
};

/** Browsers leave some types blank (e.g. .cube LUTs); fill those from the extension. */
export function contentTypeOf(file: File) {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ({ cube: "application/x-cube", csv: "text/csv", txt: "text/plain", wav: "audio/wav", mov: "video/quicktime" } as Record<string, string>)[ext ?? ""] ?? "application/octet-stream";
}

/** Reads width/height (images) or duration (audio/video) in the browser, so the library can show specs. */
export async function readFileSpecs(file: File): Promise<Record<string, number | null>> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) {
      const img = new Image();
      await new Promise((ok, no) => ((img.onload = ok), (img.onerror = no), (img.src = url)));
      return { width: img.naturalWidth, height: img.naturalHeight };
    }
    if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
      const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
      el.preload = "metadata";
      await new Promise((ok, no) => ((el.onloadedmetadata = ok), (el.onerror = no), (el.src = url)));
      const out: Record<string, number | null> = { duration: Number.isFinite(el.duration) ? Math.round(el.duration * 1000) / 1000 : null };
      if (el instanceof HTMLVideoElement) Object.assign(out, { width: el.videoWidth || null, height: el.videoHeight || null });
      return out;
    }
  } catch {
    // Specs are a convenience; the upload still works without them.
  } finally {
    URL.revokeObjectURL(url);
  }
  return {};
}
