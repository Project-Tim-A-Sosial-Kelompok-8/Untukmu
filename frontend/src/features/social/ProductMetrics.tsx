import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";

interface Metrics {
  days: number; registered_users: number; created_messages: number; public_messages: number;
  public_messages_with_prayer: number; prayer_support_ratio: number | null;
  retention_7d_eligible: number; retention_7d_returned: number; retention_7d_ratio: number | null;
  reviewed_reports: number; security_audit: string;
}
export function ProductMetrics() {
  const result = useQuery({queryKey: ["product-metrics"], queryFn: () => api<Metrics>("/admin/metrics?days=30"), staleTime: 30000});
  const data = result.data;
  const ratio = (value: number | null) => value === null ? "Belum ada data" : (value * 100).toFixed(1) + "%";
  return <section className="um-card" aria-labelledby="metrics-title"><h2 className="um-h2" id="metrics-title">Metrik keberhasilan · 30 hari</h2>
    {result.isPending && <p role="status">Memuat metrik…</p>}
    {result.error && <p role="alert">{result.error.message}</p>}
    {data && <><dl className="um-grid2">
      <div><dt>Pengguna terdaftar</dt><dd>{data.registered_users}</dd></div>
      <div><dt>Pesan dibuat</dt><dd>{data.created_messages}</dd></div>
      <div><dt>Pesan publik menerima doa</dt><dd>{ratio(data.prayer_support_ratio)} ({data.public_messages_with_prayer}/{data.public_messages})</dd></div>
      <div><dt>Retensi setelah 7 hari</dt><dd>{ratio(data.retention_7d_ratio)} ({data.retention_7d_returned}/{data.retention_7d_eligible})</dd></div>
      <div><dt>Laporan ditindaklanjuti</dt><dd>{data.reviewed_reports}</dd></div>
    </dl><p className="um-hint">Retensi menghitung akun yang masuk atau memperbarui sesi setidaknya tujuh hari setelah pendaftaran. Akun yang belum berumur tujuh hari dikecualikan.</p><p className="um-note">{data.security_audit}</p></>}
  </section>;
}
