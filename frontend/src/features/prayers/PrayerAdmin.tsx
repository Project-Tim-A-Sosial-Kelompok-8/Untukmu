import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { inspectRecording } from "./audio";
interface Entry {
  id: string;
  content: {
    nama: { id: string };
    teks?: { id: string };
    arti?: { id: string };
    sumber: string;
    source_url?: string;
    review_note?: string;
    detik: number;
  };
  reviewed: boolean;
  has_audio: boolean;
  audio_preview_url?: string | null;
  audio_meta: { license?: string; attribution?: string };
}
export function PrayerAdmin() {
  const catalog = useQuery({
    queryKey: ["prayer-admin"],
    queryFn: () => api<Entry[]>("/admin/prayers"),
  });
  const [selected, setSelected] = useState<Entry | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [localAudio, setLocalAudio] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ["prayer-admin-preview", selected?.id],
    queryFn: () => api<{ audio_url: string }>(`/admin/prayers/${selected?.id}/audio/preview`),
    enabled: Boolean(selected?.has_audio && !selected.audio_preview_url),
    staleTime: 0,
  });
  const previewUrl = selected?.audio_preview_url || preview.data?.audio_url;
  useEffect(() => {
    return () => {
      if (localAudio) URL.revokeObjectURL(localAudio);
    };
  }, [localAudio]);
  async function chooseAudio(input: HTMLInputElement) {
    setLocalAudio(null);
    setError("");
    setNotice("");
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const metadata = await inspectRecording(file);
      const duration = input.form?.elements.namedItem("duration_seconds");
      if (duration instanceof HTMLInputElement) duration.value = String(metadata.durationSeconds);
      setLocalAudio(URL.createObjectURL(file));
      setNotice(
        `Audio dapat diputar. Durasi terbaca ${metadata.durationSeconds} detik. Tinjau rekaman dan sumber sebelum menyetujui.`,
      );
    } catch (failure) {
      input.value = "";
      setError(failure instanceof Error ? failure.message : "Audio tidak dapat dibaca.");
    } finally {
      setBusy(false);
    }
  }
  async function save(form: HTMLFormElement) {
    if (!selected || busy) return;
    const values = new FormData(form),
      text = (name: string) => String(values.get(name) || "");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const file = values.get("audio");
      let durationSeconds = Number(text("duration_seconds"));
      if (file instanceof File && file.size) {
        const metadata = await inspectRecording(file);
        durationSeconds = metadata.durationSeconds;
        const signed = await api<{ upload: { url: string; fields: Record<string, string> } }>(
          `/admin/prayers/${selected.id}/audio/presign`,
          {
            method: "POST",
            body: JSON.stringify({
              byte_size: file.size,
              content_type: metadata.contentType,
              license: text("license"),
              attribution: text("attribution"),
              duration_seconds: durationSeconds,
            }),
          },
        );
        const upload = new FormData();
        Object.entries(signed.upload.fields).forEach(([key, value]) => upload.append(key, value));
        upload.append("file", file);
        const result = await fetch(signed.upload.url, {
          method: "POST",
          body: upload,
          credentials: "omit",
        });
        if (!result.ok) throw new Error("Unggahan audio gagal.");
        await api(`/admin/prayers/${selected.id}/audio/complete`, { method: "POST" });
      }
      await api(`/admin/prayers/${selected.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: text("title"),
          text: text("text") || null,
          translation: text("translation") || null,
          source_attribution: text("source_attribution"),
          source_url: text("source_url"),
          review_note: text("review_note"),
          duration_seconds: durationSeconds,
          reviewed: values.get("reviewed") === "on",
        }),
      });
      await catalog.refetch();
      setSelected(null);
      setLocalAudio(null);
      setNotice("Kurasi tersimpan.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Penyimpanan gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="um-card">
      <h2 className="um-h3">Kurasi doa dan audio</h2>
      <p className="um-muted">
        Tinjau teks bersama kurator tradisi terkait. Audio memerlukan izin penggunaan, atribusi, dan
        durasi yang sesuai berkas.
      </p>
      {(error || catalog.error) && (
        <p role="alert" className="um-error">
          {error || catalog.error?.message}
        </p>
      )}
      {notice && (
        <p role="status" className="um-note">
          {notice}
        </p>
      )}
      <label className="um-label" htmlFor="prayer-catalog">
        Entri katalog
      </label>
      <select
        className="um-select"
        id="prayer-catalog"
        disabled={busy}
        value={selected?.id || ""}
        onChange={(e) => {
          setSelected(catalog.data?.find((x) => x.id === e.target.value) || null);
          setError("");
          setNotice("");
          setLocalAudio(null);
        }}
      >
        <option value="">Pilih entri</option>
        {catalog.data?.map((row) => (
          <option key={row.id} value={row.id}>
            {row.id} · {row.reviewed ? "disetujui" : "menunggu kurasi"}
          </option>
        ))}
      </select>
      {selected && (
        <form
          key={selected.id}
          onSubmit={(e) => {
            e.preventDefault();
            void save(e.currentTarget);
          }}
        >
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {preview.isFetching && (
              <p className="um-hint">Menyiapkan pratinjau rekaman tersimpan…</p>
            )}
            {preview.error && (
              <p role="alert" className="um-error">
                Pratinjau gagal: {preview.error.message}
              </p>
            )}
            {previewUrl && (
              <div className="um-field">
                <label className="um-label" htmlFor="prayer-review-audio">
                  Dengarkan rekaman sebelum mengubah kurasi
                </label>
                <audio
                  id="prayer-review-audio"
                  controls
                  preload="none"
                  src={previewUrl}
                  style={{ width: "100%" }}
                />
                <p className="um-hint">
                  {selected.audio_meta.attribution} · {selected.audio_meta.license}
                </p>
              </div>
            )}
            {(
              [
                ["title", "Judul", selected.content.nama.id],
                ["source_attribution", "Atribusi sumber", selected.content.sumber],
                ["source_url", "Tautan sumber HTTPS", selected.content.source_url || ""],
                ["review_note", "Catatan peninjauan", selected.content.review_note || ""],
              ] as const
            ).map(([name, label, value]) => (
              <div className="um-field" key={name}>
                <label className="um-label" htmlFor={`um-prayer-${name}`}>
                  {label}
                </label>
                <input
                  className="um-input"
                  id={`um-prayer-${name}`}
                  name={name}
                  defaultValue={value}
                  required
                  maxLength={name === "title" ? 120 : 1000}
                />
              </div>
            ))}
            {(
              [
                ["text", "Teks doa", selected.content.teks?.id || ""],
                ["translation", "Terjemahan", selected.content.arti?.id || ""],
              ] as const
            ).map(([name, label, value]) => (
              <div className="um-field" key={name}>
                <label className="um-label" htmlFor={`um-prayer-${name}`}>
                  {label}
                </label>
                <textarea
                  className="um-textarea"
                  id={`um-prayer-${name}`}
                  name={name}
                  defaultValue={value}
                  maxLength={10000}
                />
              </div>
            ))}
            <div className="um-field">
              <label className="um-label" htmlFor="um-prayer-duration_seconds">
                Durasi (detik)
              </label>
              <input
                className="um-input"
                id="um-prayer-duration_seconds"
                name="duration_seconds"
                type="number"
                min={5}
                max={900}
                defaultValue={selected.content.detik || 30}
                required
              />
            </div>
            <div className="um-field">
              <label className="um-label" htmlFor="prayer-audio">
                {selected.has_audio ? "Ganti audio" : "Unggah audio"} (opsional)
              </label>
              <input
                className="um-input"
                type="file"
                id="prayer-audio"
                name="audio"
                accept=".mp3,.ogg,.wav,.m4a,audio/mpeg,audio/ogg,audio/wav,audio/mp4"
                onChange={(event) => void chooseAudio(event.currentTarget)}
              />
              <p className="um-hint">
                MP3, OGG, WAV, atau M4A · maksimal 30 MiB · 5 detik–15 menit. Durasi dibaca dari
                rekaman.
              </p>
              {localAudio && (
                <audio
                  aria-label="Pratinjau audio yang akan diunggah"
                  controls
                  preload="metadata"
                  src={localAudio}
                  style={{ width: "100%" }}
                />
              )}
            </div>
            <div className="um-field">
              <label className="um-label" htmlFor="um-prayer-license">
                Lisensi audio
              </label>
              <input
                className="um-input"
                name="license"
                id="um-prayer-license"
                defaultValue={selected.audio_meta.license || ""}
                required={Boolean(localAudio)}
                minLength={3}
                maxLength={500}
              />
            </div>
            <div className="um-field">
              <label className="um-label" htmlFor="um-prayer-attribution">
                Atribusi rekaman
              </label>
              <input
                className="um-input"
                name="attribution"
                id="um-prayer-attribution"
                defaultValue={selected.audio_meta.attribution || ""}
                required={Boolean(localAudio)}
                minLength={3}
                maxLength={1000}
              />
            </div>
            <label className="um-check">
              <input type="checkbox" name="reviewed" defaultChecked={selected.reviewed} /> Teks dan
              audio telah ditinjau kurator, sumber serta izin telah diperiksa
            </label>
            <div className="um-btn-row end">
              <button className="um-btn primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan kurasi"}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
