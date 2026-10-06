import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { api, authenticate, currentUser, logout, queryClient, updateUser } from "../../lib/api/client";
import * as vault from "../../lib/crypto/vault";
import { clearPrivateMedia } from "../../lib/api/store";
import { requireLogin, resolveLogin, useAccount } from "./state";
import { RecoveryScreen } from "./RecoveryScreen";
import { ExportScreen } from "./ExportScreen";
import { Turnstile } from "./Turnstile";
import { DeleteAccountScreen } from "./DeleteAccountScreen";

async function refreshScene() { await window.UM.galaksi.refresh(); await window.UM.sky.refresh(); window.UM.ui.renderSemua(); }
export async function signOut() {
  await logout(); vault.lock(); clearPrivateMedia(); resolveLogin(false);
  // Reload removes every decrypted DOM node and WebGL texture from the previous session.
  location.reload();
}
export function openAccount(mode: "settings" | "delete" = "settings") {
  if (currentUser()) useAccount.getState().show(mode);
  else void requireLogin();
}

// An exiting modal must release focus and inert state before the composer opens.
function AccountLayer({ children, reducedMotion }: { children: ReactNode; reducedMotion: boolean | null }) {
  const present = useIsPresent();
  return <motion.div className={`um-screen${present ? " on" : ""} z-top`} style={{ zIndex: 60 }}
    initial={{ opacity: reducedMotion ? 1 : 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={{ duration: .15 }} inert={!present}>{children}</motion.div>;
}

export function AccountScreen() {
  const { open, mode, show, required } = useAccount();
  const [recovering, setRecovering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState("");
  const [saved, setSaved] = useState(false);
  const [turnstile, setTurnstile] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<{ id: string; user_agent: string; last_seen_at: string }[]>("/auth/sessions"), enabled: open && mode === "settings", staleTime: 0 });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    return () => { previous?.focus(); };
  }, [open]);

  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)")?.focus();
  }, [open, mode, recovery]);

  useEffect(() => {
    if (!open) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        if (!busy && !recovery && !required && mode !== "delete") resolveLogin(false);
      }
      if (event.key === "Tab" && root.current) {
        const nodes = Array.from(root.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href], select"));
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", keyboard, true);
    return () => { window.removeEventListener("keydown", keyboard, true); };
  }, [open, busy, recovery, required, mode]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if (mode === "register" && password !== repeat) throw new Error("Ulangan kata sandi belum cocok.");
      const credential = await vault.authCredential(password, email);
      if (mode === "register") {
        const out = await vault.setup(password);
        try {
          await authenticate("register", { email: email.trim().toLowerCase(), password: credential,
            encryption_record: out.record, recovery_verifier: await vault.recoveryVerifier(out.recoveryCode, email), turnstile_token: turnstile || null });
        } catch (failure) { vault.lock(); throw failure; }
        setRecovery(out.recoveryCode); setSaved(false);
      } else {
        const user = await authenticate("login", { email: email.trim().toLowerCase(), password: credential });
        try { await vault.unlock(password, user.encryption_record); }
        catch { await logout(); vault.lock(); throw new Error("Kunci tidak berhasil dibuka. Periksa kata sandi dan rekaman akun."); }
      }
      setPassword(""); setRepeat(""); await refreshScene();
      if (mode === "login") resolveLogin(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Akun belum berhasil dibuka."); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setError("");
    try { await api(`/auth/sessions/${id}`, { method: "DELETE" }); await queryClient.invalidateQueries({ queryKey: ["sessions"] }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Sesi gagal dicabut."); }
  }

  if(recovering && open) return <RecoveryScreen onClose={()=>setRecovering(false)} onSuccess={code=>{setRecovery(code);setSaved(false);setRecovering(false);void refreshScene();}} />;

  return <AnimatePresence>{open && <AccountLayer reducedMotion={reducedMotion}>
    <div className="um-wrap narrow" role="dialog" aria-modal="true" aria-labelledby="um-account-title" ref={root}>
      <div className="um-head"><div className="um-h1" id="um-account-title">{recovery ? "Simpan kode pemulihan" : mode === "delete" ? "Hapus akun" : mode === "settings" ? "Pengaturan akun" : mode === "register" ? "Daftar akun Untukmu" : "Masuk ke Untukmu"}</div>
        {!recovery && !required && mode !== "delete" && <button className="um-close" aria-label="Tutup" disabled={busy} onClick={() => { setPassword(""); setRepeat(""); resolveLogin(false); }}>×</button>}</div>
      <div className="um-card">
        {recovery ? <>
          <p className="um-p">Kode ini membuka kunci data jika kata sandi terlupa. Simpan di tempat aman. Kode tidak akan ditampilkan kembali.</p>
          <output className="um-input" style={{ display: "block", overflowWrap: "anywhere", userSelect: "all" }}>{recovery}</output>
          <div className="um-field" style={{ marginTop: 16 }}><label className="um-p"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} /> Kode pemulihan sudah disimpan.</label></div>
          <button className="um-btn primary" disabled={!saved || busy} onClick={() => { setRecovery(""); resolveLogin(true); }}>Lanjutkan</button>
        </> : mode === "delete" ? <DeleteAccountScreen onCancel={() => show("settings")} /> : mode === "settings" ? <>
          <p className="um-p">{currentUser()?.email}</p>
          <div className="um-field"><label className="um-label" htmlFor="um-profile">Visibilitas profil</label>
            <select id="um-profile" className="um-select" defaultValue={currentUser()?.profile_visibility} onChange={async event => {
              try { await updateUser({ default_message_visibility: currentUser()!.default_message_visibility, profile_visibility: event.target.value as "private" | "public" }); }
              catch (failure) { setError(failure instanceof Error ? failure.message : "Pengaturan belum tersimpan."); }
            }}><option value="private">Privat</option><option value="public">Publik</option></select></div>
          <div className="um-field"><label className="um-label" htmlFor="um-default-privacy">Visibilitas pesan baku</label><select id="um-default-privacy" className="um-select" defaultValue={currentUser()?.default_message_visibility} onChange={async event => {
            try { await updateUser({ default_message_visibility: event.target.value as "private" | "public_anon" | "unlisted", profile_visibility: currentUser()!.profile_visibility }); }
            catch (failure) { setError(failure instanceof Error ? failure.message : "Pengaturan gagal disimpan."); }
          }}><option value="private">Privat</option><option value="public_anon">Publik anonim</option><option value="unlisted">Tautan terbatas</option></select></div>
          <div className="um-btn-row"><button className="um-btn" onClick={() => { resolveLogin(false); void window.UM.openSocial("blocks"); }}>Kelola pemblokiran</button>{currentUser()?.role === "admin" && <button className="um-btn" onClick={() => { resolveLogin(false); void window.UM.openSocial("admin"); }}>Panel moderasi</button>}</div>
          <button className="um-btn" onClick={() => { resolveLogin(false); window.UM.ui.bukaSetup(); }}>Kunci enkripsi</button>
          <ExportScreen />
          <button className="um-btn" onClick={()=>setRecovering(true)}>Ganti kata sandi dengan kode pemulihan</button>
          <div className="um-h3" style={{ marginTop: 20 }}>Sesi aktif</div>
          {sessions.isPending && <p className="um-muted">Memuat sesi…</p>}
          {sessions.error && <p className="um-error">{sessions.error.message}</p>}
          {sessions.data?.map(session => <div className="um-item" key={session.id}><div className="um-muted" style={{ overflowWrap: "anywhere" }}>{session.user_agent || "Perangkat tanpa nama"}</div><button className="um-btn small" onClick={() => void revoke(session.id)}>Cabut sesi</button></div>)}
          <p className="um-hint">Ganti akun mengakhiri sesi ini. Akun lama, pesan, dan doanya tetap tersimpan; setelah keluar kamu dapat masuk ke akun lain atau daftar akun baru.</p>
          <div className="um-btn-row" style={{ marginTop: 18 }}><button className="um-btn" disabled={busy} onClick={() => { setBusy(true); void signOut().catch(failure => { setError(String(failure)); setBusy(false); }); }}>Ganti akun</button><button className="um-btn" disabled={busy} onClick={() => { setBusy(true); void signOut().catch(failure => { setError(String(failure)); setBusy(false); }); }}>Keluar</button><button className="um-btn danger" disabled={busy} onClick={() => { setError(""); show("delete"); }}>Hapus akun</button><a className="um-btn" href="/kebijakan-privasi" target="_top">Kebijakan privasi</a></div>
        </> : <form onSubmit={submit}>
          <p className="um-p">{mode === "login" ? "Masuk dengan akun yang sudah ada, atau daftar akun baru untuk memulai." : "Buat akun untuk menyimpan pesan dan doa serta menjelajahi pesan publik bersama."}</p>
          <div className="um-field"><label className="um-label" htmlFor="um-email">Surel</label><input id="um-email" className="um-input" type="email" required maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></div>
          <div className="um-field"><label className="um-label" htmlFor="um-account-password">Kata sandi</label><input id="um-account-password" className="um-input" type="password" minLength={mode === "register" ? 12 : 1} maxLength={256} required autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} /></div>
          {mode === "register" && <><div className="um-field"><label className="um-label" htmlFor="um-repeat">Ulangi kata sandi</label><input id="um-repeat" className="um-input" type="password" minLength={12} maxLength={256} required autoComplete="new-password" value={repeat} onChange={event => setRepeat(event.target.value)} /></div><p className="um-hint">Minimal 12 karakter. Kata sandi asli dan kunci pesan tidak dikirim ke server.</p><Turnstile onToken={setTurnstile} /></>}
          {mode === "login" && <button className="um-btn ghost" type="button" disabled={busy} onClick={()=>setRecovering(true)}>Pulihkan akun</button>}
          <div className="um-btn-row end"><button type="button" className="um-btn ghost" disabled={busy} onClick={() => { setError(""); show(mode === "login" ? "register" : "login"); }}>{mode === "login" ? "Daftar akun" : "Sudah punya akun"}</button><button className="um-btn primary" disabled={busy}>{busy ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"}</button></div>
        </form>}
        {error && <p className="um-error" role="alert">{error}</p>}
      </div>
    </div>
  </AccountLayer>}</AnimatePresence>;
}
