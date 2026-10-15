import { env } from "./env.ts";
import { getSupabase } from "./supabase.ts";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, orgId?: string, body?: unknown): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const response = await fetch(`${env.apiUrl}/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      ...(orgId ? { "x-org-id": orgId } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(
      typeof error.error === "string" ? error.error : `Request failed (${response.status})`,
      response.status,
      error,
    );
  }
  return response.json() as Promise<T>;
}

export async function downloadOrgFile(
  orgId: string,
  path: string,
  filename: string,
  body?: unknown,
) {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new Error("Logg inn før nedlasting");
  const response = await fetch(`${env.apiUrl}/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "x-org-id": orgId,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(String(body.error ?? "Kunne ikke laste ned filen"), response.status, body);
  }
  const url = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
export async function readOrgText(orgId: string, path: string): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new Error("Logg inn før eksport");
  const response = await fetch(`${env.apiUrl}/v1${path}`, {
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "x-org-id": orgId,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(
      String(body.error ?? "Kunne ikke lese kontaktloggen"),
      response.status,
      body,
    );
  }
  return response.text();
}
export async function readOrgBlob(orgId: string, path: string): Promise<Blob> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new Error("Logg inn før forhåndsvisning");
  const response = await fetch(`${env.apiUrl}/v1${path}`, {
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "x-org-id": orgId,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(
      String(body.error ?? "Kunne ikke vise forhåndsvisning"),
      response.status,
      body,
    );
  }
  return response.blob();
}
export async function uploadFile(orgId: string, file: File): Promise<{ id: string }> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new Error("Sign in before uploading");
  const form = new FormData();
  form.set("file", file);
  const response = await fetch(`${env.apiUrl}/v1/org/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session.access_token}`, "x-org-id": orgId },
    body: form,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Upload failed");
  }
  return response.json() as Promise<{ id: string }>;
}

export function profileAvatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "");
  return `${base}/storage/v1/object/public/profile-avatars/${path}`;
}

export async function uploadProfileAvatar(file: File): Promise<{ avatarPath: string }> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new Error("Sign in before uploading a photo");
  const form = new FormData();
  form.set("file", file);
  const response = await fetch(`${env.apiUrl}/v1/profile/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session.access_token}` },
    body: form,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Photo upload failed");
  }
  return response.json() as Promise<{ avatarPath: string }>;
}
