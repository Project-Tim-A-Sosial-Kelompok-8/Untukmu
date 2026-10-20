import { afterEach, beforeEach, expect, it, vi } from "vitest";

const accountKey = "untukmu.account.v1";
const owner = {
  id: "owner-a",
  email: "owner@example.com",
  display_name: "Pemilik",
  role: "user",
  recovery_ready: true,
  encryption_record: {},
  default_message_visibility: "private",
  profile_visibility: "private",
  preferences: {},
};
const other = { ...owner, id: "owner-b", email: "other@example.com" };
const fetchMock = vi.fn<typeof fetch>();
const dispatchEvent = vi.fn((event: Event) => Boolean(event));
const reload = vi.fn();
const toast = vi.fn();
let storage: Storage;
let lockDepth = 0;
const lockQueues = new Map<string, Promise<unknown>>();
const requestLock = vi.fn((name: string, task: () => Promise<unknown>) => {
  const previous = lockQueues.get(name) || Promise.resolve();
  const next = previous.then(async () => {
    lockDepth++;
    try {
      return await task();
    } finally {
      lockDepth--;
    }
  });
  lockQueues.set(
    name,
    next.catch(() => undefined),
  );
  return next;
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock.mockReset();
  lockDepth = 0;
  lockQueues.clear();
  const values = new Map<string, string>();
  storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("window", {
    sessionStorage: storage,
    dispatchEvent,
    location: { reload },
    UM: { ui: { toast } },
  });
  vi.stubGlobal("location", { reload });
  vi.stubGlobal("navigator", { locks: { request: requestLock } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("pengunjung tanpa cookie tetap anonim tanpa refresh atau putaran reload", async () => {
  fetchMock.mockResolvedValueOnce(json({ authenticated: false }));
  const client = await import("../src/lib/api/client");

  expect(await client.restore()).toBeNull();
  expect(client.currentUser()).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/status");
  expect(dispatchEvent).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});

it("restore bersamaan hanya memutar cookie sekali dan memakai identitas serta token hasil restore", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ authenticated: true }))
    .mockResolvedValueOnce(json({ access_token: "restored-token" }))
    .mockResolvedValueOnce(json(owner));
  const client = await import("../src/lib/api/client");

  const restored = await Promise.all([client.restore(), client.restore(), client.restore()]);
  expect(restored).toEqual([owner, owner, owner]);
  expect(client.currentUser()).toEqual(owner);
  expect(storage.getItem(accountKey)).toBe(owner.id);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/api/v1/auth/status",
    "/api/v1/auth/refresh",
    "/api/v1/users/me",
  ]);
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", credentials: "same-origin" });
  expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get("Authorization")).toBe(
    "Bearer restored-token",
  );

  fetchMock.mockResolvedValueOnce(json([]));
  await client.api("/constellations");
  expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get("Authorization")).toBe(
    "Bearer restored-token",
  );
  expect(dispatchEvent).not.toHaveBeenCalled();
});

it("cookie yang kedaluwarsa saat startup menjadi tamu tanpa event keluar atau retry berulang", async () => {
  storage.setItem(accountKey, owner.id);
  fetchMock
    .mockResolvedValueOnce(json({ authenticated: true }))
    .mockResolvedValueOnce(json({ detail: "Sesi sudah berakhir." }, 401));
  const client = await import("../src/lib/api/client");

  expect(await client.restore()).toBeNull();
  expect(client.currentUser()).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(dispatchEvent).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});

it("startup menolak cookie akun lain tanpa mengganti pin identitas atau memicu loop reload", async () => {
  storage.setItem(accountKey, owner.id);
  fetchMock
    .mockResolvedValueOnce(json({ authenticated: true }))
    .mockResolvedValueOnce(json({ access_token: "other-token" }))
    .mockResolvedValueOnce(json(other));
  const client = await import("../src/lib/api/client");
  client.queryClient.setQueryData(["private"], { body: "Data akun sebelumnya" });

  expect(await client.restore()).toBeNull();
  expect(client.currentUser()).toBeNull();
  expect(storage.getItem(accountKey)).toBe(owner.id);
  expect(client.queryClient.getQueryData(["private"])).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(dispatchEvent).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();

  fetchMock.mockResolvedValueOnce(json([]));
  await client.api("/explore/messages");
  expect(new Headers(fetchMock.mock.calls[3][1]?.headers).has("Authorization")).toBe(false);
});

it("refresh runtime menolak akun lain, membersihkan cache, dan mengakhiri sesi hanya sekali", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ authenticated: true }))
    .mockResolvedValueOnce(json({ access_token: "owner-token" }))
    .mockResolvedValueOnce(json(owner));
  const client = await import("../src/lib/api/client");
  await client.restore();
  client.queryClient.setQueryData(["private"], { body: "Data akun sebelumnya" });
  fetchMock.mockImplementation(async (url) => {
    if (url === "/api/v1/auth/refresh") return json({ access_token: "other-token" });
    if (url === "/api/v1/users/me") return json(other);
    return json({ detail: "Sesi sudah berakhir." }, 401);
  });

  const requests = await Promise.allSettled([client.api("/private-a"), client.api("/private-b")]);
  expect(requests.map((request) => request.status)).toEqual(["rejected", "rejected"]);
  expect(client.currentUser()).toBeNull();
  expect(client.queryClient.getQueryData(["private"])).toBeUndefined();
  expect(storage.getItem(accountKey)).toBe(owner.id);
  expect(dispatchEvent).toHaveBeenCalledTimes(1);
  expect(dispatchEvent.mock.calls[0][0]).toMatchObject({ type: "untukmu-session-ended" });
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/v1/auth/refresh")).toHaveLength(2);
  await expect(client.api("/private-c")).rejects.toMatchObject({ status: 401 });
  expect(dispatchEvent).toHaveBeenCalledTimes(1);
});

it.each(["status", "refresh", "identity"] as const)(
  "gangguan server saat %s tidak dianggap logout dan restore dapat dicoba ulang",
  async (stage) => {
    storage.setItem(accountKey, owner.id);
    let failed = false;
    const failingPath = {
      status: "/api/v1/auth/status",
      refresh: "/api/v1/auth/refresh",
      identity: "/api/v1/users/me",
    }[stage];
    fetchMock.mockImplementation(async (url) => {
      if (url === failingPath && !failed) {
        failed = true;
        return json({ detail: "Layanan sementara tidak tersedia." }, 500);
      }
      if (url === "/api/v1/auth/status") return json({ authenticated: true });
      if (url === "/api/v1/auth/refresh") return json({ access_token: "restored-token" });
      return json(owner);
    });
    const client = await import("../src/lib/api/client");

    await expect(client.restore()).rejects.toThrow("Layanan sementara tidak tersedia.");
    expect(client.currentUser()).toBeNull();
    expect(storage.getItem(accountKey)).toBe(owner.id);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(await client.restore()).toEqual(owner);
  },
);

it("login dan logout memakai lock cookie yang sama dengan restore", async () => {
  fetchMock.mockImplementation(async (url) => {
    if (["/api/v1/auth/refresh", "/api/v1/auth/login", "/api/v1/auth/logout"].includes(String(url)))
      expect(lockDepth).toBe(1);
    if (url === "/api/v1/auth/status") return json({ authenticated: true });
    if (url === "/api/v1/users/me") return json(owner);
    if (url === "/api/v1/auth/logout") return new Response(null, { status: 204 });
    return json({ access_token: "account-token" });
  });
  const client = await import("../src/lib/api/client");

  await client.restore();
  await client.authenticate("login", { email: owner.email, password: "credential" });
  expect(client.currentUser()).toEqual(owner);
  expect(storage.getItem(accountKey)).toBe(owner.id);
  await client.logout();
  expect(client.currentUser()).toBeNull();
  expect(storage.getItem(accountKey)).toBeNull();
  expect(requestLock).toHaveBeenCalledTimes(3);
  expect(new Set(requestLock.mock.calls.map(([name]) => name)).size).toBe(1);
  expect(dispatchEvent).not.toHaveBeenCalled();
});

it("login yang dimulai sesudah logout tetap berhasil ketika respons logout datang belakangan", async () => {
  fetchMock
    .mockResolvedValueOnce(json({ authenticated: true }))
    .mockResolvedValueOnce(json({ access_token: "owner-token" }))
    .mockResolvedValueOnce(json(owner));
  const client = await import("../src/lib/api/client");
  await client.restore();
  let finishLogout!: () => void;
  const logoutFinished = new Promise<void>((resolve) => {
    finishLogout = resolve;
  });
  const order: string[] = [];
  fetchMock.mockImplementation(async (url) => {
    expect(lockDepth).toBe(1);
    order.push(String(url));
    if (url === "/api/v1/auth/logout") {
      await logoutFinished;
      return new Response(null, { status: 204 });
    }
    if (url === "/api/v1/auth/login") return json({ access_token: "other-token" });
    return json(other);
  });

  const loggingOut = client.logout();
  await vi.waitFor(() => expect(order).toEqual(["/api/v1/auth/logout"]));
  const loggingIn = client.authenticate("login", { email: other.email, password: "credential" });
  expect(order).toEqual(["/api/v1/auth/logout"]);
  finishLogout();
  await loggingOut;
  expect(await loggingIn).toEqual(other);
  expect(order).toEqual(["/api/v1/auth/logout", "/api/v1/auth/login", "/api/v1/users/me"]);
  expect(client.currentUser()).toEqual(other);
  expect(storage.getItem(accountKey)).toBe(other.id);
  expect(dispatchEvent).not.toHaveBeenCalled();
});

it("klik fitur saat startup menunggu restore bersama tanpa menampilkan formulir login", async () => {
  let finishStatus!: (response: Response) => void;
  const statusFinished = new Promise<Response>((resolve) => {
    finishStatus = resolve;
  });
  fetchMock
    .mockReturnValueOnce(statusFinished)
    .mockResolvedValueOnce(json({ access_token: "restored-token" }))
    .mockResolvedValueOnce(json(owner));
  const client = await import("../src/lib/api/client");
  const account = await import("../src/features/account/state");

  const restoring = client.restore();
  const enteringFeature = account.requireLogin();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(account.useAccount.getState().open).toBe(false);
  expect(client.currentUser()).toBeNull();
  expect(toast).not.toHaveBeenCalled();

  finishStatus(json({ authenticated: true }));
  expect(await restoring).toEqual(owner);
  expect(await enteringFeature).toBe(true);
  expect(account.useAccount.getState().open).toBe(false);
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/v1/auth/refresh")).toHaveLength(1);
  expect(toast).not.toHaveBeenCalled();
  expect(dispatchEvent).not.toHaveBeenCalled();
});

it.each(["server", "network"] as const)(
  "kegagalan %s ketika memulihkan sesi menampilkan toast tanpa membuka formulir login",
  async (failure) => {
    const message =
      failure === "server" ? "Layanan sementara tidak tersedia." : "Jaringan terputus.";
    if (failure === "server") fetchMock.mockResolvedValueOnce(json({ detail: message }, 500));
    else fetchMock.mockRejectedValueOnce(new TypeError(message));
    const client = await import("../src/lib/api/client");
    const account = await import("../src/features/account/state");

    expect(await account.requireLogin()).toBe(false);
    expect(account.useAccount.getState().open).toBe(false);
    expect(client.currentUser()).toBeNull();
    expect(toast).toHaveBeenCalledExactlyOnceWith(message);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  },
);
