"use client";

import { getSupabaseClient } from "./supabaseClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Carries the HTTP status and AURA-* error code so screens can react (e.g. 409 = someone saved first). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? await authHeaders() : { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(payload?.error?.message ?? `${method} ${path} failed: ${res.status}`, res.status, payload?.error?.code);
  }
  return res.json();
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body: unknown) => request<T>("POST", path, body);
export const apiPatch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);

/** Sends a file's raw bytes (e.g. an audio recording) with its own content type. */
export async function apiUpload<T>(path: string, body: Blob, contentType: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": contentType, ...(await authHeaders()) }, body });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(payload?.error?.message ?? `Upload failed: ${res.status}`, res.status, payload?.error?.code);
  }
  return res.json();
}

/** Fetches raw bytes a signed-in member is allowed to read (e.g. audio for playback). */
export async function apiGetBytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(payload?.error?.message ?? `Download failed: ${res.status}`, res.status, payload?.error?.code);
  }
  return res.arrayBuffer();
}
