import { useEffect, useRef } from "react";

declare global {
  interface Window { turnstile?: {
    render: (el: HTMLElement, config: { sitekey: string; action: string; callback: (token: string) => void; "expired-callback": () => void; "error-callback": () => void; theme: string }) => string;
    remove: (id: string) => void;
  } }
}
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
export function Turnstile({ onToken, action = "register" }: { onToken: (token: string) => void; action?: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey) return;
    let id: string | null = null;
    const render = () => {
      if (host.current && window.turnstile && !id) id = window.turnstile.render(host.current, {
        sitekey: siteKey, action, callback: onToken, "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""), theme: "dark",
      });
    };
    let script = document.querySelector<HTMLScriptElement>("#um-turnstile-script");
    if (!script) { script = document.createElement("script"); script.id = "um-turnstile-script"; script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true; document.head.append(script); }
    script.addEventListener("load", render); render();
    return () => { script?.removeEventListener("load", render); if (id) window.turnstile?.remove(id); };
  }, [onToken, action]);
  return <div ref={host} />;
}
