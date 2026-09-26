"use client";

import { getSupabaseClient } from "./supabaseClient";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error?.message ?? `POST ${path} failed: ${res.status}`);
  }
  return res.json();
}
