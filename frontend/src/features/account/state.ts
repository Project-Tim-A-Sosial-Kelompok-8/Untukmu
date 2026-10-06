import { create } from "zustand";
import { currentUser } from "../../lib/api/client";

type Mode = "login" | "register" | "settings" | "delete";
export const useAccount = create<{ open: boolean; required: boolean; mode: Mode; show: (mode: Mode) => void; close: () => void }>(set => ({
  open: false, required: false, mode: "login", show: mode => set({ open: true, mode }), close: () => set({ open: false }),
}));
let waiting: ((value: boolean) => void)[] = [];
export function resolveLogin(value: boolean) {
  if (!value && useAccount.getState().required) return;
  waiting.forEach(fn => fn(value)); waiting = [];
  useAccount.setState({ open: false, required: false });
}
export function requireEntryLogin() { useAccount.setState({ open: true, required: true, mode: "login" }); }
export function requireLogin() {
  if (currentUser()) return Promise.resolve(true);
  useAccount.getState().show("login");
  return new Promise<boolean>(resolve => waiting.push(resolve));
}
