import { useCallback } from "react";
import { create } from "zustand";
import { Turnstile } from "./Turnstile";
const useChallenge = create<{ action: string | null }>(() => ({ action: null }));
let pending: { resolve: (token: string | null) => void; reject: (error: Error) => void } | null = null;
export function requestChallenge(action: string): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return Promise.resolve(null);
  if (pending) return Promise.reject(new Error("Selesaikan verifikasi sebelumnya."));
  useChallenge.setState({ action });
  return new Promise((resolve, reject) => { pending = { resolve, reject }; });
}
export function Challenge() {
  const action = useChallenge(state => state.action);
  const receive = useCallback((token: string) => { if (token) { pending?.resolve(token); pending = null; useChallenge.setState({ action: null }); } }, []);
  if (!action) return null;
  return <div className="um-screen on z-top" style={{ zIndex: 90 }}><div className="um-wrap narrow" role="dialog" aria-modal="true" aria-labelledby="um-challenge-title">
    <div className="um-head"><div id="um-challenge-title" className="um-h1">Verifikasi keamanan</div><button className="um-close" aria-label="Batal" onClick={() => { pending?.reject(new Error("Verifikasi dibatalkan.")); pending = null; useChallenge.setState({ action: null }); }}>×</button></div>
    <div className="um-card"><Turnstile action={action} onToken={receive} /></div>
  </div></div>;
}
