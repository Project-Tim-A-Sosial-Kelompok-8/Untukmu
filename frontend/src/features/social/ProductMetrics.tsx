import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";

interface Metrics {
  days: number;
  period_start: string;
  period_end: string;
  total_users: number;
  registered_users: number;
  created_messages: number;
  admin_created_messages: number;
  messages_by_visibility: { private: number; public_anon: number; unlisted: number };
  messages_by_author_status: { active_account: number; deleted_account: number };
  public_messages: number;
  public_messages_with_prayer: number;
  prayer_support_ratio: number | null;
  retention_7d_eligible: number;
  retention_7d_returned: number;
  retention_7d_ratio: number | null;
  reviewed_reports: number;
  security_audit: string;
}
const number = (value: number) => value.toLocaleString("id-ID");
const percent = (value: number | null) =>
  value === null
    ? "Belum ada data"
    : (value * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
const date = (value: string) =>
  new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export function ProductMetrics({ onOpenUsers }: { onOpenUsers?: () => void }) {
  const [days, setDays] = useState(30);
  const result = useQuery({
    queryKey: ["product-metrics", days],
    queryFn: () => api<Metrics>("/admin/metrics?days=" + days),
    staleTime: 0,
    refetchInterval: 30000,
  });
  const data = result.data;
  return (
    <section aria-labelledby="metrics-title">
      <div className="um-admin-section-head">
        <div>
          <h2 className="um-h2" id="metrics-title">
            Ringkasan layanan
          </h2>
          <p className="um-admin-subtitle">
            Jumlah seluruh layanan dan pesan akun Anda ditampilkan secara terpisah.
          </p>
        </div>
        <div className="um-admin-metric-controls">
          <div>
            <label className="um-label" htmlFor="admin-metric-period">
              Periode metrik
            </label>
            <select
              id="admin-metric-period"
              className="um-select"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {[7, 30, 90, 365].map((value) => (
                <option key={value} value={value}>
                  {value} hari terakhir
                </option>
              ))}
            </select>
          </div>
          <button
            className="um-btn"
            disabled={result.isFetching}
            onClick={() => void result.refetch()}
          >
            Perbarui metrik
          </button>
        </div>
      </div>
      {result.isPending && (
        <p className="um-admin-empty" role="status">
          Memuat ringkasan layanan…
        </p>
      )}
      {result.error && (
        <p className="um-error" role="alert">
          {result.error.message}
        </p>
      )}
      {data && (
        <>
          <div className="um-admin-metric-grid">
            <div className="um-admin-stat">
              <span className="um-admin-stat-label">Pengguna terdaftar</span>
              <strong data-metric="registered-users">{number(data.total_users)}</strong>
              <p>
                {number(data.registered_users)} akun baru dalam {days} hari
              </p>
              <button className="um-admin-text-button" onClick={onOpenUsers}>
                Lihat daftar pengguna →
              </button>
            </div>
            <div className="um-admin-stat">
              <span className="um-admin-stat-label">Pesan semua akun</span>
              <strong data-metric="global-created-messages">{number(data.created_messages)}</strong>
              <p>Pesan tersimpan yang dibuat dalam {days} hari terakhir</p>
              <span className="um-admin-status">Seluruh layanan</span>
            </div>
            <div className="um-admin-stat is-personal">
              <span className="um-admin-stat-label">Pesan akun saya</span>
              <strong data-metric="account-messages">{number(data.admin_created_messages)}</strong>
              <p>Pesan milik akun admin yang sedang masuk, dalam {days} hari</p>
              <span className="um-admin-status is-ready">Akun Anda</span>
            </div>
            <div className="um-admin-stat">
              <span className="um-admin-stat-label">Pesan publik tersedia</span>
              <strong>{number(data.public_messages)}</strong>
              <p>Sudah disetujui dan dibuka, dibuat dalam periode ini</p>
              <span className="um-admin-status">Dapat dibaca pengunjung</span>
            </div>
          </div>
          <div className="um-admin-callout">
            <strong>Mengapa total pesan bisa berbeda dari pesan saya?</strong>
            <p>
              Total layanan menghitung pesan semua pengguna, termasuk pesan privat dan tautan
              terbatas. Satu pesan yang ditujukan ke beberapa galaksi tetap dihitung satu kali.
              Pesan yang telah dihapus tidak ikut dihitung.
            </p>
          </div>
          <div className="um-admin-overview-grid">
            <section className="um-admin-panel" aria-labelledby="admin-counts-title">
              <h3 className="um-h3" id="admin-counts-title">
                Rincian pesan semua akun
              </h3>
              <p className="um-muted">Berdasarkan pilihan privasi, dalam periode yang sama.</p>
              <dl className="um-admin-number-list">
                <div>
                  <dt>Privat</dt>
                  <dd>{number(data.messages_by_visibility.private)}</dd>
                </div>
                <div>
                  <dt>Publik anonim</dt>
                  <dd>{number(data.messages_by_visibility.public_anon)}</dd>
                </div>
                <div>
                  <dt>Tautan terbatas</dt>
                  <dd>{number(data.messages_by_visibility.unlisted)}</dd>
                </div>
                <div className="is-total">
                  <dt>Total pesan tersimpan</dt>
                  <dd>{number(data.created_messages)}</dd>
                </div>
              </dl>
              <p className="um-hint">
                {number(data.messages_by_author_status.active_account)} pesan terhubung akun
                terdaftar; {number(data.messages_by_author_status.deleted_account)} pesan
                dipertahankan setelah akun penulis dihapus.
              </p>
            </section>
            <section className="um-admin-panel" aria-labelledby="admin-support-title">
              <h3 className="um-h3" id="admin-support-title">
                Dukungan dan peninjauan
              </h3>
              <dl className="um-admin-number-list">
                <div>
                  <dt>
                    Pesan publik menerima doa
                    <small>
                      {data.public_messages_with_prayer} dari {data.public_messages} pesan publik
                      tersedia
                    </small>
                  </dt>
                  <dd>{percent(data.prayer_support_ratio)}</dd>
                </div>
                <div>
                  <dt>Laporan ditindaklanjuti</dt>
                  <dd>{number(data.reviewed_reports)}</dd>
                </div>
                <div>
                  <dt>
                    Retensi setelah 7 hari
                    <small>
                      {data.retention_7d_returned} dari {data.retention_7d_eligible} akun yang
                      memenuhi periode
                    </small>
                  </dt>
                  <dd>{percent(data.retention_7d_ratio)}</dd>
                </div>
              </dl>
              <p className="um-hint">
                Retensi mencakup akun yang masuk atau memperbarui sesi setidaknya tujuh hari setelah
                pendaftaran. Akun yang lebih baru dikecualikan.
              </p>
            </section>
          </div>
          <p className="um-admin-period-note">
            Periode pesan: {date(data.period_start)} – {date(data.period_end)}. Pengguna terdaftar
            mencakup semua akun yang masih tersedia. Diperbarui{" "}
            {new Date(result.dataUpdatedAt).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            .
          </p>
        </>
      )}
    </section>
  );
}
