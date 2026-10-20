import { AdminPanel } from "./AdminPanel";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { api, currentUser, invalidate } from "../../lib/api/client";
import { store } from "../../lib/api/store";
import { requireLogin } from "../account/state";

type Mode = "report" | "block" | "admin" | "blocks";
const useSocial = create<{ mode: Mode | null; id: string }>(() => ({ mode: null, id: "" }));
export async function openSocial(mode: Mode, id = "") {
  if (mode !== "report" && !currentUser() && !(await requireLogin())) return;
  if (mode === "admin" && currentUser()?.role !== "admin") {
    window.UM.ui.toast("Akses administrator diperlukan.");
    return;
  }
  useSocial.setState({ mode, id });
}
export function SocialScreens() {
  const { mode, id } = useSocial();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const blocks = useQuery({
    queryKey: ["blocks"],
    queryFn: () => api<{ id: string; created_at: string }[]>("/users/blocks"),
    enabled: mode === "blocks",
  });
  if (!mode) return null;
  const close = () => {
    useSocial.setState({ mode: null });
    setReason("");
    setError("");
  };
  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Permintaan gagal.");
    } finally {
      setBusy(false);
    }
  }
  if (mode === "admin") return <AdminPanel onClose={close} />;
  const title = {
    report: "Laporkan pesan",
    block: "Blokir pengirim",
    admin: "Peninjauan konten",
    blocks: "Daftar pemblokiran",
  }[mode];
  return (
    <div className="um-screen on z-top" style={{ zIndex: 70 }}>
      <div
        className="um-wrap narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="um-social-title"
      >
        <div className="um-head">
          <div className="um-h1" id="um-social-title">
            {title}
          </div>
          <button className="um-close" aria-label="Tutup" disabled={busy} onClick={close}>
            ×
          </button>
        </div>
        {(error || blocks.error) && (
          <p className="um-error" role="alert">
            {error || blocks.error?.message}
          </p>
        )}
        {(mode === "report" || mode === "block") && (
          <form
            className="um-card"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                if (mode === "report") await store.report(id, reason);
                else {
                  await store.block(id);
                  await Promise.all([window.UM.galaksi.refresh(), window.UM.sky.refresh()]);
                }
                close();
                window.UM.ui.toast(
                  mode === "report"
                    ? "Laporan tersimpan untuk ditinjau moderator."
                    : "Pengirim telah diblokir.",
                );
                window.UM.ui.bukaJelajah();
              });
            }}
          >
            {mode === "report" ? (
              <div className="um-field">
                <label className="um-label" htmlFor="um-report-reason">
                  Alasan laporan
                </label>
                <textarea
                  id="um-report-reason"
                  className="um-textarea"
                  required
                  minLength={3}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            ) : (
              <p className="um-p">
                Pesan publik dari pengirim ini akan disembunyikan. Pemblokiran dapat dibatalkan
                melalui pengaturan akun.
              </p>
            )}
            <div className="um-btn-row end">
              <button className="um-btn ghost" type="button" onClick={close}>
                Batal
              </button>
              <button className="um-btn primary" disabled={busy}>
                {busy ? "Menyimpan…" : mode === "report" ? "Kirim laporan" : "Blokir"}
              </button>
            </div>
          </form>
        )}
        {mode === "blocks" && (
          <div className="um-card">
            {blocks.isPending && <p className="um-muted">Memuat…</p>}
            {blocks.data?.length === 0 && (
              <p className="um-muted">Belum ada pengirim yang diblokir.</p>
            )}
            {blocks.data?.map((item, index) => (
              <div key={item.id} className="um-item">
                <p className="um-p">
                  Pengirim anonim {index + 1} ·{" "}
                  {new Date(item.created_at).toLocaleDateString("id-ID")}
                </p>
                <button
                  className="um-btn small"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(`/users/blocks/${item.id}`, { method: "DELETE" });
                      await invalidate();
                      await Promise.all([window.UM.galaksi.refresh(), window.UM.sky.refresh()]);
                      await blocks.refetch();
                    })
                  }
                >
                  Batalkan blokir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
