import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, currentUser, invalidate, queryClient } from "../../lib/api/client";
import { PrayerAdmin } from "../prayers/PrayerAdmin";
import { ProductMetrics } from "./ProductMetrics";
import { AdminUsers } from "./AdminUsers";

const sections = [
  ["overview", "Ringkasan"],
  ["review", "Peninjauan konten"],
  ["users", "Pengguna terdaftar"],
  ["prayers", "Doa & audio"],
] as const;
type Section = (typeof sections)[number][0];
interface Review {
  id: string;
  public_body: string;
  moderation_status: string;
  review_token: string;
  flags: string[];
  reports: { id: string; reason: string }[];
}

function ContentReview() {
  const [offset, setOffset] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const queue = useQuery({
    queryKey: ["moderation", offset],
    queryFn: () => api<Review[]>("/admin/moderation/queue?offset=" + offset + "&limit=50"),
    refetchInterval: 15000,
    staleTime: 0,
  });
  async function decide(item: Review, decision: string) {
    setBusy(item.id);
    setError("");
    setNotice("");
    try {
      await api("/admin/moderation/" + item.id + "/decision", {
        method: "POST",
        body: JSON.stringify({
          decision,
          reason: notes[item.id] || "",
          review_token: item.review_token,
        }),
      });
      window.UM.galaksi.bersihkanPilihan();
      queryClient.setQueryData<Review[]>(["moderation", offset], (previous) =>
        previous?.filter((row) => row.id !== item.id),
      );
      setNotes((previous) => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ["product-metrics"] }),
      ]);
      const result = await queue.refetch();
      if (offset && result.data?.length === 0) setOffset(Math.max(0, offset - 50));
      setNotice(
        result.error
          ? "Keputusan tersimpan. Daftar belum dapat dimuat ulang; pilih Perbarui antrean untuk mencoba lagi."
          : "Keputusan tersimpan. Daftar peninjauan telah diperbarui.",
      );
      void Promise.all([window.UM.galaksi.refresh(), window.UM.sky.refresh()]).catch(() => {
        window.UM.ui.toast(
          "Keputusan tersimpan. Muat ulang galaksi untuk melihat perubahan terbaru.",
        );
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Keputusan belum berhasil disimpan.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section aria-labelledby="admin-review-title">
      <div className="um-admin-section-head">
        <div>
          <h2 className="um-h2" id="admin-review-title">
            Peninjauan konten
          </h2>
          <p className="um-admin-subtitle">
            Periksa pesan publik yang ditandai dan laporan pengguna sebelum mengambil keputusan.
          </p>
        </div>
        <button
          className="um-btn"
          disabled={queue.isFetching || Boolean(busy)}
          onClick={() => void queue.refetch()}
        >
          Perbarui antrean
        </button>
      </div>
      <div className="um-admin-callout">
        Hanya pesan publik yang masuk ke antrean ini. Pesan privat dan tautan terbatas tidak dibuka
        oleh moderator.
      </div>
      {(error || queue.error) && (
        <p role="alert" className="um-error">
          {error || queue.error?.message}
        </p>
      )}
      {notice && (
        <p role="status" className="um-note">
          {notice}
        </p>
      )}
      {queue.isPending && (
        <p role="status" className="um-admin-empty">
          Memuat antrean peninjauan…
        </p>
      )}
      <div className="um-admin-review-list">
        {queue.data?.map((item) => (
          <article className="um-admin-panel um-admin-review-card" key={item.id}>
            <div className="um-admin-section-head">
              <div className="um-admin-badges">
                <span className="um-admin-status is-draft">
                  {item.moderation_status === "pending" ? "Menunggu tinjauan" : "Pesan dilaporkan"}
                </span>
                <span className="um-admin-status">{item.reports.length} laporan</span>
              </div>
              <span className="um-admin-record-id">ID {item.id.slice(0, 8)}</span>
            </div>
            <p className="um-admin-message">{item.public_body}</p>
            <div className="um-admin-review-details">
              <div>
                <h3 className="um-h3">Pemeriksaan awal</h3>
                <p className="um-muted">
                  {item.flags.length ? item.flags.join(", ") : "Tidak ada penanda otomatis."}
                </p>
              </div>
              <div>
                <h3 className="um-h3">Laporan pengguna</h3>
                {item.reports.length ? (
                  <ul className="um-admin-reports">
                    {item.reports.map((report) => (
                      <li key={report.id}>{report.reason}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="um-muted">Belum ada laporan pengguna.</p>
                )}
              </div>
            </div>
            <label className="um-label" htmlFor={"review-note-" + item.id}>
              Catatan keputusan
            </label>
            <textarea
              className="um-textarea um-admin-review-note"
              id={"review-note-" + item.id}
              value={notes[item.id] || ""}
              maxLength={1000}
              disabled={Boolean(busy)}
              placeholder="Tuliskan alasan keputusan untuk pesan ini."
              onChange={(event) =>
                setNotes((previous) => ({ ...previous, [item.id]: event.target.value }))
              }
            />
            <div className="um-admin-decision-help">
              Setujui untuk mengizinkan publikasi, Tolak untuk menahan pesan, atau Tarik dari publik
              untuk menghentikan publikasi yang sudah berjalan.
            </div>
            <div className="um-btn-row end">
              {[
                ["approve", "Setujui"],
                ["reject", "Tolak"],
                ["remove", "Tarik dari publik"],
              ].map(([decision, label]) => (
                <button
                  key={decision}
                  className={
                    "um-btn " +
                    (decision === "approve" ? "primary" : decision === "remove" ? "danger" : "")
                  }
                  disabled={Boolean(busy)}
                  onClick={() => void decide(item, decision)}
                >
                  {busy === item.id ? "Menyimpan…" : label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
      {queue.data?.length === 0 && (
        <div className="um-admin-empty">
          <span className="um-admin-empty-icon" aria-hidden="true">
            ✓
          </span>
          <h3 className="um-h3">Tidak ada pesan yang menunggu peninjauan.</h3>
          <p className="um-muted">Pesan yang ditandai atau dilaporkan akan muncul di bagian ini.</p>
        </div>
      )}
      <div className="um-admin-pagination">
        <span className="um-muted">
          Halaman {Math.floor(offset / 50) + 1} · {queue.data?.length || 0} pesan pada halaman ini
        </span>
        <div className="um-btn-row">
          <button
            className="um-btn"
            disabled={!offset || Boolean(busy) || queue.isFetching}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Sebelumnya
          </button>
          <button
            className="um-btn"
            disabled={(queue.data?.length || 0) < 50 || Boolean(busy) || queue.isFetching}
            onClick={() => setOffset(offset + 50)}
          >
            Berikutnya
          </button>
        </div>
      </div>
    </section>
  );
}

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<Section>("overview");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="um-screen on z-top um-admin-screen" style={{ zIndex: 70 }}>
      <div
        className="um-admin-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="um-social-title"
      >
        <header className="um-admin-header">
          <div>
            <p className="um-admin-eyebrow">Untukmu / Administrasi</p>
            <h1 id="um-social-title">Panel admin</h1>
            <p className="um-admin-subtitle">
              Tinjau konten, lihat pengguna, dan kelola doa dalam satu tempat.
            </p>
          </div>
          <div className="um-admin-header-actions">
            <span className="um-admin-account">{currentUser()?.email}</span>
            <button className="um-btn" onClick={onClose}>
              Kembali ke galaksi
            </button>
          </div>
        </header>
        <nav className="um-admin-tabs" role="tablist" aria-label="Bagian administrasi">
          {sections.map(([id, label], index) => (
            <button
              key={id}
              id={"admin-tab-" + id}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={active === id}
              aria-controls={"admin-panel-" + id}
              tabIndex={active === id ? 0 : -1}
              onClick={() => setActive(id)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % sections.length;
                else if (event.key === "ArrowLeft")
                  next = (index + sections.length - 1) % sections.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = sections.length - 1;
                else return;
                event.preventDefault();
                setActive(sections[next][0]);
                tabs.current[next]?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <div
          className="um-admin-content"
          role="tabpanel"
          id={"admin-panel-" + active}
          aria-labelledby={"admin-tab-" + active}
        >
          {active === "overview" && <ProductMetrics onOpenUsers={() => setActive("users")} />}
          {active === "review" && <ContentReview />}
          {active === "users" && <AdminUsers />}
          {active === "prayers" && <PrayerAdmin />}
        </div>
        <footer className="um-admin-footer">
          Panel ini hanya tersedia bagi administrator. Isi pesan privat tetap terenkripsi.
        </footer>
      </div>
    </div>
  );
}
