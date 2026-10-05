import { create } from "zustand";
import { currentUser } from "../../lib/api/client";

type Mode = "login" | "register" | "settings";
export const useAccount = create<{ open: boolean; mode: Mode; show: (mode: Mode) => void; close: () => void }>(set => ({
  open: false, mode: "login", show: mode => set({ open: true, mode }), close: () => set({ open: false }),
}));
let waiting: ((value: boolean) => void)[] = [];
export function resolveLogin(value: boolean) { waiting.forEach(fn => fn(value)); waiting = []; useAccount.getState().close(); }
export function requireLogin() {
  if (currentUser()) return Promise.resolve(true);
  useAccount.getState().show("login");
  return new Promise<boolean>(resolve => waiting.push(resolve));
}
