import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { currentUser } from "../../lib/api/client";
import { store, type Galaxy } from "../../lib/api/store";
import * as vault from "../../lib/crypto/vault";
import { requireLogin } from "../account/state";

const traditions = [
  ["umum", "Umum"], ["islam", "Islam"], ["kristen", "Kristen"],
  ["katolik", "Katolik"], ["hindu", "Hindu"], ["buddha", "Buddha"], ["konghucu", "Konghucu"],
] as const;
type Visibility = "privat" | "publik" | "unlisted";
interface Draft {
  targetId: string | null; name: string; category: string; text: string;
  tradition: string; visibility: Visibility;
  kind: Galaxy["kind"]; color: string; radius: Galaxy["radius"];
}
interface WrittenPrayerState {
  open: boolean; ownerId?: string; preferredId?: string; draft: Draft; created: Galaxy | null;
  busy: boolean; error: string; saved: { name: string; visibility: Visibility } | null;
}
const emptyDraft = (): Draft => ({ targetId: null, name: "", category: "seseorang", text: "", tradition: "umum", visibility: "privat", kind: "spiral", color: "#ffd9a0", radius: 140 });
const useWrittenPrayer = create<WrittenPrayerState>(() => ({
  open: false, draft: emptyDraft(),
  created: null, busy: false, error: "", saved: null,
}));
const updateDraft = (patch: Partial<Draft>) => useWrittenPrayer.setState(state => ({ draft: { ...state.draft, ...patch } }));

export async function openWrittenPrayer(galaxyId?: string) {
  if (useWrittenPrayer.getState().busy || !await requireLogin()) return;
  window.UM.ui.closeAllScreens();
  const ownerId = currentUser()!.id;
  useWrittenPrayer.setState(state => {
    const draft = state.ownerId === ownerId ? state.draft : emptyDraft();
    const keepDraft = !!(draft.text.trim() || draft.name.trim());
    return {
      open: true, ownerId, preferredId: keepDraft ? state.preferredId : galaxyId, error: "", saved: null,
      created: state.ownerId === ownerId ? state.created : null,
      draft: { ...draft, targetId: keepDraft ? draft.targetId : null },
    };
  });
}

export function WrittenPrayerScreen() {
  const { open, preferredId, draft, created, busy, error, saved } = useWrittenPrayer();
  const saving = useRef(false);
  const targets = useQuery({
    queryKey: ["written-prayer-targets", currentUser()?.id], queryFn: store.listGalaksi,
    enabled: open, staleTime: 0, retry: false,
  });
  const galaxies = [...(targets.data || [])];
  if (created && !galaxies.some(galaxy => galaxy.id === created.id)) galaxies.unshift(created);
  const targetId = draft.targetId || (galaxies.some(galaxy => galaxy.id === preferredId) ? preferredId! : "new");
  const selected = galaxies.find(galaxy => galaxy.id === targetId);
  const locked = draft.visibility === "privat" && !vault.unlocked();
  const loadingTargets = targets.isPending || targets.isFetching;

  function close(returnToPrayer = true) {
    if (saving.current) return;
    useWrittenPrayer.setState({ open: false, error: "" });
    if (returnToPrayer) window.UM.ui.bukaDoa();
  }

  async function refreshScene() {
    await Promise.all([window.UM.galaksi.refresh(), window.UM.sky.refresh()]);
    window.UM.ui.renderSemua();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const text = draft.text.trim();
    if (!text) { useWrittenPrayer.setState({ error: "Isi doa wajib diisi." }); return; }
    if (locked) { useWrittenPrayer.setState({ error: "Buka kunci enkripsi untuk menyimpan doa privat." }); return; }
    if (targetId === "new" && !draft.name.trim()) { useWrittenPrayer.setState({ error: "Nama orang yang didoakan wajib diisi." }); return; }
    if (targetId !== "new" && !selected) { useWrittenPrayer.setState({ error: "Tujuan sudah tidak tersedia. Pilih tujuan kembali." }); return; }
    saving.current = true;
    useWrittenPrayer.setState({ busy: true, error: "" });
    try {
      let galaxy = selected;
      if (!galaxy) {
        galaxy = await store.saveGalaksi({ nama: draft.name.trim(), kategori: draft.category, kind: draft.kind, warna: draft.color, radius: draft.radius, count: 8500 });
        // Retain the created target if the message request fails, so Retry
        // saves to the same galaxy instead of creating another one.
        useWrittenPrayer.setState({ created: galaxy });
        updateDraft({ targetId: galaxy.id });
      }
      await store.simpanPesan({ galaksiId: galaxy.id, teks: text, jenis: "doa", privasi: draft.visibility, tag: ["doa", draft.tradition] });
      useWrittenPrayer.setState({ saved: { name: galaxy.nama, visibility: draft.visibility } });
      updateDraft({ text: "", name: "" });
      try { await refreshScene(); }
      catch { useWrittenPrayer.setState({ error: "Doa sudah tersimpan, tetapi tampilan galaksi belum diperbarui. Coba muat tampilan kembali." }); }
      void targets.refetch();
    } catch (failure) {
      useWrittenPrayer.setState({ error: failure instanceof Error ? failure.message : "Doa belum berhasil disimpan. Silakan coba lagi." });
    } finally {
      saving.current = false;
      useWrittenPrayer.setState({ busy: false });
    }
  }

  if (!open) return null;
  return <div className="um-screen on z-top" id="um-written-prayer" style={{ zIndex: 65 }}>
    <div className="um-wrap narrow" role="dialog" aria-modal="true" aria-labelledby="um-written-prayer-title">
      <div className="um-head"><h1 className="um-h1" id="um-written-prayer-title">Tulis doa untuk seseorang</h1>
        <button type="button" className="um-close" aria-label="Tutup" disabled={busy} onClick={() => close()}>×</button></div>
      {saved ? <section className="um-card">
        <p className="um-p" role="status">Doa untuk <strong>{saved.name}</strong> sudah tersimpan.</p>
        <p className="um-muted">{saved.visibility === "privat" ? "Doa privatmu tersimpan terenkripsi di galaksi tujuan." : "Doamu menunggu peninjauan sebelum dapat dibaca melalui publikasi atau tautan."}</p>
        <p className="um-hint">Baca kembali doamu di bagian Doa tertulis pada Ruang Pribadi.</p>
        {error && <><p className="um-error" role="alert">{error}</p><button type="button" className="um-btn" disabled={busy} onClick={() => {
          useWrittenPrayer.setState({ busy: true });
          void refreshScene().then(() => useWrittenPrayer.setState({ error: "" }))
            .catch(() => useWrittenPrayer.setState({ error: "Doa tetap tersimpan. Tampilan belum dapat dimuat; coba lagi." }))
            .finally(() => useWrittenPrayer.setState({ busy: false }));
        }}>Muat ulang tampilan</button></>}
        <div className="um-btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="um-btn primary" disabled={busy} onClick={() => useWrittenPrayer.setState({ saved: null, error: "" })}>Tulis doa lagi</button>
          <button type="button" className="um-btn" disabled={busy} onClick={() => { close(false); window.UM.ui.bukaDash(); }}>Lihat di Ruang Pribadi</button>
          <button type="button" className="um-btn ghost" disabled={busy} onClick={() => close()}>Kembali ke Doa</button>
        </div>
      </section> : <form className="um-card" onSubmit={event => void submit(event)}>
        <p className="um-p">Tulis doa dengan kata-katamu sendiri. Doamu akan disimpan pada galaksi orang atau kenangan yang dipilih.</p>
        {loadingTargets && <p className="um-muted" role="status">Memuat tujuan doa…</p>}
        {targets.error && <div className="um-note warn"><p>Tujuan lama belum dapat dimuat. Kamu tetap dapat membuat tujuan baru.</p>
          <button type="button" className="um-btn small" disabled={busy || targets.isFetching} onClick={() => void targets.refetch()}>Coba muat tujuan</button></div>}
        <fieldset disabled={busy || loadingTargets} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="um-field"><label className="um-label" htmlFor="um-written-target">Untuk siapa doa ini?</label>
            <select className="um-select" id="um-written-target" value={targetId} onChange={event => updateDraft({ targetId: event.target.value })}>
              <option value="new">+ Galaksi baru untuk seseorang</option>
              {targetId !== "new" && !selected && <option value={targetId} disabled>Tujuan tidak tersedia; pilih kembali</option>}
              {galaxies.map(galaxy => <option key={galaxy.id} value={galaxy.id}>{galaxy.nama}</option>)}
            </select>
            <p className="um-hint">Pilih galaksi yang sudah ada, atau buat galaksi baru untuk menyimpan doa ini.</p>
            {targetId !== "new" && <button type="button" className="um-btn small" onClick={() => updateDraft({ targetId: "new" })}>+ Galaksi baru</button>}
          </div>
          {targetId === "new" && <>
            <div className="um-field"><label className="um-label" htmlFor="um-written-name">Nama orang yang didoakan</label>
              <input className="um-input" id="um-written-name" required maxLength={100} value={draft.name} onChange={event => updateDraft({ name: event.target.value })} /></div>
            <div className="um-field"><label className="um-label" htmlFor="um-written-category">Hubungan atau kategori</label>
              <select className="um-select" id="um-written-category" value={draft.category} onChange={event => updateDraft({ category: event.target.value })}>
                <option value="seseorang">Seseorang</option><option value="orang-tua">Orang tua</option><option value="keluarga">Keluarga</option>
                <option value="sahabat">Sahabat</option><option value="pasangan">Pasangan</option><option value="diri-sendiri">Diri sendiri</option>
              </select></div>
            <div className="um-field"><label className="um-label" htmlFor="um-written-kind">Bentuk galaksi baru</label>
              <select className="um-select" id="um-written-kind" value={draft.kind} onChange={event => updateDraft({ kind: event.target.value as Galaxy["kind"] })}>
                <option value="spiral">Spiral</option><option value="ellipsoid">Elips</option><option value="irregular">Tidak beraturan</option>
              </select></div>
            <div className="um-field"><label className="um-label" htmlFor="um-written-color">Warna galaksi</label>
              <input className="um-input" style={{ height: 44 }} id="um-written-color" type="color" value={draft.color} onChange={event => updateDraft({ color: event.target.value })} /></div>
            <div className="um-field"><label className="um-label" htmlFor="um-written-radius">Ukuran galaksi</label>
              <select className="um-select" id="um-written-radius" value={draft.radius} onChange={event => updateDraft({ radius: Number(event.target.value) as Galaxy["radius"] })}>
                <option value={110}>Kecil</option><option value={140}>Sedang</option><option value={175}>Besar</option>
              </select>
              <p className="um-hint">Galaksi dibuat saat doa disimpan. Bentuk, warna, dan ukurannya akan terlihat di ruang galaksi.</p></div>
          </>}
          {selected && <p className="um-note">Doa akan ditambahkan ke galaksi <strong>{selected.nama}</strong>.</p>}
          <div className="um-field"><label className="um-label" htmlFor="um-written-tradition">Agama atau tradisi doa</label>
            <select className="um-select" id="um-written-tradition" value={draft.tradition} onChange={event => updateDraft({ tradition: event.target.value })}>
              {traditions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></div>
          <div className="um-field"><label className="um-label" htmlFor="um-written-text">Isi doa</label>
            <textarea className="um-textarea" id="um-written-text" required rows={7} maxLength={40000} placeholder="Tuliskan doa dengan kata-katamu sendiri…" value={draft.text} onChange={event => updateDraft({ text: event.target.value })} /></div>
          <div className="um-field"><label className="um-label" htmlFor="um-written-privacy">Privasi doa</label>
            <select className="um-select" id="um-written-privacy" value={draft.visibility} onChange={event => updateDraft({ visibility: event.target.value as Visibility })}>
              <option value="privat">Privat — hanya untukku</option><option value="publik">Publik anonim</option><option value="unlisted">Tautan terbatas</option>
            </select>
            <p className="um-hint">{draft.visibility === "privat" ? "Isi doa dienkripsi pada perangkatmu. Hanya kamu yang dapat membuka isinya." : "Isi doa dapat dibaca moderator. Nama akunmu tidak ditampilkan pada publikasi; nama dalam isi doa tetap terbaca. Terbit setelah disetujui."}</p></div>
          {locked && <div className="um-note warn"><p>Buka kunci enkripsi untuk menyimpan doa privat. Tulisanmu tetap tersedia saat kembali ke formulir.</p>
            <button type="button" className="um-btn" onClick={() => { close(false); window.UM.ui.bukaSetup(); }}>Buka kunci enkripsi</button></div>}
          {error && <p className="um-error" role="alert">{error}</p>}
          <div className="um-btn-row end" style={{ marginTop: 16 }}>
            <button type="button" className="um-btn ghost" onClick={() => close()}>Batal</button>
            <button type="submit" className="um-btn primary" disabled={locked}>{busy ? "Menyimpan doa…" : "Simpan doa"}</button>
          </div>
        </fieldset>
      </form>}
    </div>
  </div>;
}
