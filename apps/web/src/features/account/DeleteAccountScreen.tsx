import { useState } from "react";
import { api, clearAccount, currentUser } from "../../lib/api/client";
import { clearPrivateMedia } from "../../lib/api/store";
import * as vault from "../../lib/crypto/vault";

export function DeleteAccountScreen({ onCancel }: { onCancel: () => void }) {
  const [action, setAction] = useState<"keep" | "delete" | "">("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action || !confirmed || busy) return;
    setBusy(true); setError("");
    try {
      const credential = await vault.authCredential(password, currentUser()!.email);
      await api("/users/me", { method: "DELETE", body: JSON.stringify({ password: credential, content_action: action }) });
      clearAccount(); vault.lock(); clearPrivateMedia();
      location.reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Akun belum berhasil dihapus.");
      setBusy(false);
    }
  }
  return <form onSubmit={submit}>
    <p className="um-p">Akun {currentUser()?.email} akan dihapus permanen dan semua sesi akan berakhir. Tentukan nasib pesan dan doa yang telah ditulis.</p>
    <fieldset disabled={busy} className="um-delete-options">
      <legend className="um-label">Pesan dan doa setelah akun dihapus</legend>
      <label className="um-priv-opt"><input type="radio" name="content-action" value="keep" required checked={action === "keep"} onChange={() => setAction("keep")} /><span><b>Pertahankan pesan dan doa</b><span className="um-hint">Konten publik yang disetujui tetap tampil anonim. Pesan privat tetap terenkripsi, tidak menjadi publik, dan tidak dapat dibuka melalui akun yang sudah dihapus. Tautan terbatas dicabut.</span></span></label>
      <label className="um-priv-opt"><input type="radio" name="content-action" value="delete" required checked={action === "delete"} onChange={() => setAction("delete")} /><span><b>Hapus pesan dan doa juga</b><span className="um-hint">Semua tulisan, galaksi, dan lampiran milik akun ini ikut dihapus. Tulisan milik akun lain tetap ada.</span></span></label>
      <p className="um-hint">Ingin menyimpan salinan? Kembali ke pengaturan akun dan unduh ekspor sebelum melanjutkan.</p>
      <div className="um-field"><label className="um-label" htmlFor="delete-account-password">Konfirmasi kata sandi</label><input id="delete-account-password" className="um-input" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} /></div>
      <label className="um-p"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Saya memahami bahwa akun ini tidak dapat dipulihkan setelah dihapus.</label>
    </fieldset>
    {error && <p className="um-error" role="alert">{error}</p>}
    <div className="um-btn-row" style={{ marginTop: 18 }}><button className="um-btn" type="button" disabled={busy} onClick={onCancel}>Batal, kembali ke pengaturan</button><button className="um-btn danger" disabled={busy || !action || !password || !confirmed}>{busy ? "Menghapus akun…" : "Hapus akun permanen"}</button></div>
  </form>;
}
