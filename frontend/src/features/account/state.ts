import { create } from "zustand";
import { currentUser, restore } from "../../lib/api/client";

type Mode = "login" | "register" | "settings" | "delete";
export const useAccount = create<{
  open: boolean;
  required: boolean;
  mode: Mode;
  show: (mode: Mode) => void;
  close: () => void;
}>((set) => ({
  open: false,
  required: false,
  mode: "login",
  show: (mode) => set({ open: true, mode }),
  close: () => set({ open: false }),
}));
let waiting: ((value: boolean) => void)[] = [];
export function resolveLogin(value: boolean) {
  if (!value && useAccount.getState().required) return;
  waiting.forEach((fn) => fn(value));
  waiting = [];
  useAccount.setState({ open: false, required: false });
}
export async function requireLogin() {
  if (!currentUser()) {
    try {
      await restore();
    } catch (error) {
      window.UM.ui.toast(
        error instanceof Error ? error.message : "Sesi belum berhasil dipulihkan.",
      );
      return false;
    }
  }
  if (currentUser()) return true;
  useAccount.getState().show("login");
  return new Promise<boolean>((resolve) => waiting.push(resolve));
}
