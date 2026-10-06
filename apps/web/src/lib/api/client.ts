import { QueryClient } from "@tanstack/react-query";
import type { KeyRecord } from "../crypto/types";

export interface User {
  recovery_ready: boolean; id: string; email: string; display_name: string; role: "user" | "admin";
  encryption_record: KeyRecord; default_message_visibility: "private" | "public_anon" | "unlisted";
  profile_visibility: "private" | "public"; preferences: { galaxy_background?: boolean };
}
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10000 } } });
let accessToken: string | null = null;
let user: User | null = null;
let refreshing: Promise<boolean> | null = null;
export const currentUser = () => user;
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

function errorMessage(data: unknown) {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = data.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item: { msg?: string }) => item.msg || "Input tidak valid.").join(" ");
  }
  return "Permintaan gagal. Silakan coba kembali.";
}

async function renew(): Promise<boolean> {
  const send = async () => {
    const result = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
    if (!result.ok) { endSession(); return false; }
    const value: { access_token: string } = await result.json();
    const identity = await fetch("/api/v1/users/me", { headers: { Authorization: `Bearer ${value.access_token}` }, credentials: "same-origin", cache: "no-store" });
    if (!identity.ok || (await identity.json() as User).id !== user?.id) {
      // Another tab may have logged into a different account sharing this cookie.
      // Never reuse its token with the previous account's cache or encryption key.
      endSession(); return false;
    }
    accessToken = value.access_token;
    return true;
  };
  // Serializes refresh rotations across tabs sharing the same HttpOnly cookie.
  return navigator.locks ? navigator.locks.request("untukmu-refresh", send) : send();
}
async function refresh() {
  if (!refreshing) refreshing = renew().finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const result = await fetch(`/api/v1${path}`, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  if (result.status === 401 && retry && accessToken && !path.startsWith("/auth/")) {
    if (await refresh()) return api<T>(path, init, false);
  }
  if (!result.ok) {
    const message = errorMessage(await result.json().catch(() => null));
    throw new ApiError(message, result.status);
  }
  if (result.status === 204) return undefined as T;
  return result.json() as Promise<T>;
}

export async function restore() {
  // A new application document always asks for credentials. Refresh rotation
  // only extends a session that was explicitly opened in this document.
  return user;
}
export async function authenticate(mode: "login" | "register" | "recovery/finish", input: Record<string, unknown>) {
  const value = await api<{ access_token: string }>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(input) });
  accessToken = value.access_token;
  user = await api<User>("/users/me");
  queryClient.clear();
  return user;
}
export async function logout() {
  await api("/auth/logout", { method: "POST" });
  clearAccount();
}
export function clearAccount() { accessToken = null; user = null; queryClient.clear(); }
function endSession() { clearAccount(); window.dispatchEvent(new Event("untukmu-session-ended")); }
export async function updateUser(settings: { default_message_visibility: "private" | "public_anon" | "unlisted"; profile_visibility: "private" | "public"; galaxy_background: boolean }) {
  user = await api<User>("/users/me/settings", { method: "PATCH", body: JSON.stringify(settings) });
  return user;
}
export function cached<T>(path: string) {
  return queryClient.fetchQuery({ queryKey: ["api", path, user?.id], queryFn: () => api<T>(path) });
}
export async function allPages<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await cached<T[]>(`${path}?offset=${offset}&limit=200`);
    rows.push(...page);
    if (page.length < 200) return rows;
  }
}
export function invalidate() { return queryClient.invalidateQueries({ queryKey: ["api"] }); }
