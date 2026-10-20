import { QueryClient } from "@tanstack/react-query";
import type { KeyRecord } from "../crypto/types";

export interface User {
  recovery_ready: boolean;
  id: string;
  email: string;
  display_name: string;
  role: "user" | "admin";
  encryption_record: KeyRecord;
  default_message_visibility: "private" | "public_anon" | "unlisted";
  profile_visibility: "private" | "public";
  preferences: Record<string, unknown>;
}
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 10000 } },
});
let accessToken: string | null = null;
let user: User | null = null;
let refreshing: Promise<boolean> | null = null;
let restoring: Promise<User | null> | null = null;
let accountGeneration = 0;
const accountStorageKey = "untukmu.account.v1";
export const currentUser = () => user;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function errorMessage(data: unknown) {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = data.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
      return detail.map((item: { msg?: string }) => item.msg || "Input tidak valid.").join(" ");
  }
  return "Permintaan gagal. Silakan coba kembali.";
}

function pinnedAccount() {
  try {
    return sessionStorage.getItem(accountStorageKey);
  } catch {
    return null;
  }
}
function pinAccount(id: string | null) {
  try {
    if (id) sessionStorage.setItem(accountStorageKey, id);
    else sessionStorage.removeItem(accountStorageKey);
  } catch {
    // Cookie sessions still work when tab storage is unavailable.
  }
}
function sessionLock<T>(send: () => Promise<T>) {
  return navigator.locks ? navigator.locks.request("untukmu-refresh", send) : send();
}
async function responseError(response: Response) {
  return new ApiError(errorMessage(await response.json().catch(() => null)), response.status);
}
async function identityFor(token: string): Promise<User> {
  const response = await fetch("/api/v1/users/me", {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<User>;
}
async function renew(startup = false): Promise<boolean> {
  const send = async () => {
    if (startup && user) return true;
    const epoch = accountGeneration;
    const expectedId = user?.id || pinnedAccount();
    if (startup) {
      // Guests do not need a failing refresh request or a login dialog.
      const status = await fetch("/api/v1/auth/status", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!status.ok) throw await responseError(status);
      const state: { authenticated: boolean } = await status.json();
      if (epoch !== accountGeneration) return false;
      if (!state.authenticated) {
        clearAccount();
        return false;
      }
    }
    const result = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (epoch !== accountGeneration) return false;
    if (!result.ok) {
      if (result.status === 401) {
        if (startup) clearAccount();
        else endSession();
        return false;
      }
      throw await responseError(result);
    }
    const value: { access_token: string } = await result.json();
    let identity: User;
    try {
      identity = await identityFor(value.access_token);
    } catch (error) {
      if (epoch !== accountGeneration) return false;
      if (error instanceof ApiError && error.status === 401) {
        if (startup) clearAccount();
        else endSession();
        return false;
      }
      throw error;
    }
    if (epoch !== accountGeneration) return false;
    if (expectedId && identity.id !== expectedId) {
      // A different account may own the shared cookie. Keep this tab's
      // non-secret identity pin so a reload cannot silently switch accounts.
      if (startup) clearAccount(true);
      else endSession();
      return false;
    }
    accessToken = value.access_token;
    if (startup) {
      user = identity;
      pinAccount(identity.id);
      queryClient.clear();
    }
    return true;
  };
  // All cookie rotations, explicit login, and logout share this lock.
  return sessionLock(send);
}
async function refresh() {
  if (!refreshing)
    refreshing = renew().finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const result = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
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
  if (user) return user;
  if (!restoring)
    restoring = renew(true)
      .then(() => user)
      .finally(() => {
        restoring = null;
      });
  return restoring;
}
export async function authenticate(
  mode: "login" | "register" | "recovery/finish",
  input: Record<string, unknown>,
) {
  const epoch = ++accountGeneration;
  return sessionLock(async () => {
    const value = await api<{ access_token: string }>(`/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    const identity = await identityFor(value.access_token);
    if (epoch !== accountGeneration) throw new Error("Proses masuk dibatalkan.");
    accessToken = value.access_token;
    user = identity;
    pinAccount(identity.id);
    queryClient.clear();
    return user;
  });
}
export async function logout() {
  const epoch = ++accountGeneration;
  await sessionLock(async () => {
    await api("/auth/logout", { method: "POST" });
    if (epoch === accountGeneration) clearAccount();
  });
}
export function clearAccount(keepIdentity = false) {
  accountGeneration++;
  accessToken = null;
  user = null;
  if (!keepIdentity) pinAccount(null);
  queryClient.clear();
}
function endSession() {
  clearAccount(true);
  window.dispatchEvent(new Event("untukmu-session-ended"));
}
export async function updateUser(settings: {
  default_message_visibility: "private" | "public_anon" | "unlisted";
  profile_visibility: "private" | "public";
}) {
  user = await api<User>("/users/me/settings", { method: "PATCH", body: JSON.stringify(settings) });
  return user;
}
export function cached<T>(path: string, fresh = false) {
  return queryClient.fetchQuery({
    queryKey: ["api", path, user?.id],
    queryFn: () => api<T>(path),
    ...(fresh ? { staleTime: 0 } : {}),
  });
}
export async function allPages<T>(path: string, fresh = false): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await cached<T[]>(`${path}?offset=${offset}&limit=200`, fresh);
    rows.push(...page);
    if (page.length < 200) return rows;
  }
}
export function invalidate() {
  return queryClient.invalidateQueries({ queryKey: ["api"] });
}
