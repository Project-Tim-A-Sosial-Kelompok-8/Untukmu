import { PrayerAdmin } from "../prayers/PrayerAdmin";
import { ProductMetrics } from "./ProductMetrics";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { api, currentUser, invalidate } from "../../lib/api/client";
import { store } from "../../lib/api/store";
import { requireLogin } from "../account/state";

type Mode = "report" | "block" | "admin" | "blocks";
interface Review { id: string; public_body: string; moderation_status: string; review_token: string; flags: string[]; reports: { id: string; reason: string }[] }
const useSocial = create<{ mode: Mode | null; id: string }>(() => ({ mode: null, id: "" }));
export async function openSocial(mode: Mode, id = "") {
  if (mode !== "report" && !currentUser() && !await requireLogin()) return;
  if (mode === "admin" && currentUser()?.role !== "admin") { window.UM.ui.toast("Akses administrator diperlukan."); return; }
  useSocial.setState({ mode, id });
}
export function SocialScreens() {
  const { mode, id } = useSocial();
  const [reason, setReason] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [offset, setOffset] = useState(0);
  const queue = useQuery({ queryKey: ["moderation", offset], queryFn: () => api<Review[]>(`/admin/moderation/queue?offset=${offset}&limit=50`), enabled: mode === "admin", refetchInterval: mode === "admin" ? 15000 : false });
  const blocks = useQuery({ queryKey: ["blocks"], queryFn: () => api<{ id: string; created_at: string }[]>("/users/blocks"), enabled: mode === "blocks" });
  if (!mode) return null;
  const close = () => { useSocial.setState({ mode: null }); setReason(""); setError(""); };
  async function run(task: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await task(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Permintaan gagal."); }
    finally { setBusy(false); }
  }
  const title = { report: "Laporkan pesan", block: "Blokir pengirim", admin: "Peninjauan konten", blocks: "Daftar pemblokiran" }[mode];
  return <div className="um-screen on z-top" style={{ zIndex: 70 }}><div className={`um-wrap ${mode === "admin" ? "wide" : "narrow"}`} role="dialog" aria-modal="true" aria-labelledby="um-social-title">
    <div className="um-head"><div className="um-h1" id="um-social-title">{title}</div><button className="um-close" aria-label="Tutup" disabled={busy} onClick={close}>×</button></div>
    {(error || queue.error || blocks.error) && <p className="um-error" role="alert">{error || queue.error?.message || blocks.error?.message}</p>}
    {(mode === "report" || mode === "block") && <form className="um-card" onSubmit={event => { event.preventDefault(); void run(async () => { if (mode === "report") await store.report(id, reason); else await store.block(id); close(); window.UM.ui.toast(mode === "report" ? "Laporan tersimpan untuk ditinjau moderator." : "Pengirim telah diblokir."); window.UM.ui.bukaJelajah(); }); }}>
      {mode === "report" ? <div className="um-field"><label className="um-label" htmlFor="um-report-reason">Alasan laporan</label><textarea id="um-report-reason" className="um-textarea" required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></div> : <p className="um-p">Pesan publik dari pengirim ini akan disembunyikan. Pemblokiran dapat dibatalkan melalui pengaturan akun.</p>}
      <div className="um-btn-row end"><button className="um-btn ghost" type="button" onClick={close}>Batal</button><button className="um-btn primary" disabled={busy}>{busy ? "Menyimpan…" : mode === "report" ? "Kirim laporan" : "Blokir"}</button></div>
    </form>}
    {mode === "admin" && <>
      <PrayerAdmin />
      <ProductMetrics />
      <p className="um-muted">Antrean pesan publik anonim dan laporan pengguna.</p>
      <div className="um-field"><label className="um-label" htmlFor="um-review-note">Catatan keputusan</label><input id="um-review-note" className="um-input" value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></div>
      {queue.isPending && <p className="um-muted">Memuat antrean…</p>}
      {queue.data?.map(item => <article className="um-card" key={item.id}>
        <div className="um-muted">{item.moderation_status} · {item.flags.length ? item.flags.join(", ") : "Tanpa penanda otomatis"}</div>
        <p className="um-p" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.public_body}</p>
        {item.reports.map(report => <p className="um-note" key={report.id}>Laporan: {report.reason}</p>)}
        <div className="um-btn-row">{([['approve','Setujui'],['reject','Tolak'],['remove','Tarik dari publik']] as const).map(([decision,label]) => <button key={decision} className={`um-btn ${decision === "approve" ? "primary" : decision === "remove" ? "danger" : ""}`} disabled={busy} onClick={() => void run(async () => { await api(`/admin/moderation/${item.id}/decision`, { method: "POST", body: JSON.stringify({ decision, reason, review_token: item.review_token }) }); setReason(""); await invalidate(); await queue.refetch(); })}>{label}</button>)}</div>
      </article>)}
      {queue.data?.length === 0 && <div className="um-empty">Tidak ada pesan yang menunggu peninjauan.</div>}
      <div className="um-btn-row between"><button className="um-btn" disabled={!offset} onClick={() => setOffset(Math.max(0,offset-50))}>Sebelumnya</button><button className="um-btn" disabled={(queue.data?.length || 0) < 50} onClick={() => setOffset(offset+50)}>Berikutnya</button></div>
    </>}
    {mode === "blocks" && <div className="um-card">
      {blocks.isPending && <p className="um-muted">Memuat…</p>}
      {blocks.data?.length === 0 && <p className="um-muted">Belum ada pengirim yang diblokir.</p>}
      {blocks.data?.map((item,index) => <div key={item.id} className="um-item"><p className="um-p">Pengirim anonim {index+1} · {new Date(item.created_at).toLocaleDateString("id-ID")}</p><button className="um-btn small" disabled={busy} onClick={() => void run(async () => { await api(`/users/blocks/${item.id}`, { method: "DELETE" }); await invalidate(); await blocks.refetch(); })}>Batalkan blokir</button></div>)}
    </div>}
  </div></div>;
}
