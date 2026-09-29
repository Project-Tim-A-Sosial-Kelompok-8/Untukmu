import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import parse from "html-react-parser";
import { create } from "zustand";

// Exact escaped markup from the original controllers, with no added DOM wrapper.
interface Props { html: string }
export function EntryScreen({ html }: Props) { return <>{parse(html)}</>; }
export function ComposerScreen({ html }: Props) { return <>{parse(html)}</>; }
export function DashboardScreen({ html }: Props) { return <>{parse(html)}</>; }
export function ExploreScreen({ html }: Props) { return <>{parse(html)}</>; }
export function PrayerScreen({ html }: Props) { return <>{parse(html)}</>; }
export function EncryptionScreen({ html }: Props) { return <>{parse(html)}</>; }
export function SettingsScreen({ html }: Props) { return <>{parse(html)}</>; }
export function GalaxyCard({ html }: Props) { return <>{parse(html)}</>; }
export const useScreenState = create<{ active: string | null }>(() => ({ active: null }));
const roots = new Map<HTMLElement, Root>();
const screens: Record<string, (props: Props) => React.ReactNode> = {
  "um-entry": EntryScreen, "um-comp": ComposerScreen, "um-dash": DashboardScreen,
  "um-exp": ExploreScreen, "um-doa": PrayerScreen, "um-setup": EncryptionScreen, "um-set": SettingsScreen,
};
export function renderPreservedScreen(host: HTMLElement, value: unknown) {
  if (!host) return;
  // The astronomy engine writes directly into this shared panel. Giving React
  // ownership of the same nodes breaks the next render after an astronomy card.
  if (host.closest("#beacon-panel")) {
    host.innerHTML = String(value ?? "");
    return;
  }
  for (const [node, root] of roots) {
    if (node !== host && (host.contains(node) || !node.isConnected)) { flushSync(() => root.unmount()); roots.delete(node); }
  }
  let root = roots.get(host);
  if (!root) { root = createRoot(host); roots.set(host, root); }
  const Screen = screens[host.closest(".um-screen")?.id || ""] || GalaxyCard;
  flushSync(() => root.render(<Screen html={String(value ?? "")} />));
}
export function trackScreen(host: HTMLElement | undefined, opened: boolean) {
  if (host && opened) useScreenState.setState({ active: host.id });
  else if (host?.id === useScreenState.getState().active) useScreenState.setState({ active: null });
}
