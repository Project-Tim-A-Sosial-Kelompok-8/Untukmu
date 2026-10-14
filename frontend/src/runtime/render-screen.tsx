import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import parse from "html-react-parser";

// Exact escaped markup from the original controllers, with no added DOM wrapper.
interface Props {
  html: string;
}
function ScreenMarkup({ html }: Props) {
  return <>{parse(html)}</>;
}
const roots = new Map<HTMLElement, Root>();
const revisions = new WeakMap<HTMLElement, number>();
export function renderScreen(host: HTMLElement, value: unknown) {
  if (!host) return;
  // The astronomy engine writes directly into this shared panel. Giving React
  // ownership of the same nodes breaks the next render after an astronomy card.
  if (host.closest("#beacon-panel")) {
    host.innerHTML = String(value ?? "");
    return;
  }
  for (const [node, root] of roots) {
    if (node !== host && (host.contains(node) || !node.isConnected)) {
      flushSync(() => root.unmount());
      roots.delete(node);
    }
  }
  let root = roots.get(host);
  if (!root) {
    root = createRoot(host);
    roots.set(host, root);
  }
  // These controllers expect innerHTML replacement semantics: they also mutate
  // disabled, input values and text directly. Reusing descendants leaves those
  // mutations behind when React's previous props equal the next props.
  const revision = (revisions.get(host) || 0) + 1;
  revisions.set(host, revision);
  flushSync(() => root.render(<ScreenMarkup key={revision} html={String(value ?? "")} />));
}
