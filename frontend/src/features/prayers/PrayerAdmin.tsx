import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { inspectRecording } from "./audio";
interface Entry {
  id: string;
  tradition: string;
  tradition_label: string;
  catalog_title: string;
  publicly_available: boolean;
  content: {
    nama: { id: string };
    teks?: { id: string } | null;
    arti?: { id: string } | null;
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
function statusLabel(entry: Entry) {
  if (entry.publicly_available) return "Tampil ke publik";
  return entry.has_audio ? "Menunggu kurasi" : "Draf tanpa audio";
}
type StatusFilter = "" | "needs-audio" | "needs-review" | "ready";
function matchesStatus(entry: Entry, filter: StatusFilter) {
  if (filter === "needs-audio") return !entry.has_audio;
  if (filter === "needs-review") return entry.has_audio && !entry.publicly_available;
  if (filter === "ready") return entry.publicly_available;
  return true;
}
interface UploadedRecording {
  entryId: string;
  file: File;
  attribution: string;
  license: string;
  completed: boolean;
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
  const [tradition, setTradition] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [stage, setStage] = useState("");
  const uploadedRecording = useRef<UploadedRecording | null>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const entries = catalog.data || [];
  const traditions = Array.from(
    new Map(entries.map((entry) => [entry.tradition, entry.tradition_label])),
  );
  const visibleEntries = entries.filter(
    (entry) => (!tradition || entry.tradition === tradition) && matchesStatus(entry, statusFilter),
  );
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
  useEffect(() => {
    editorHeading.current?.focus();
  }, [selected?.id]);
  function selectEntry(entry: Entry | null) {
    setSelected(entry);
    setError("");
    setNotice("");
    setLocalAudio(null);
    uploadedRecording.current = null;
  }
  async function chooseAudio(input: HTMLInputElement) {
    setLocalAudio(null);
    setError("");
    setNotice("");
    uploadedRecording.current = null;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setStage("Memeriksa durasi dan format audio…");
    try {
      const metadata = await inspectRecording(file);
      const duration = input.form?.elements.namedItem("duration_seconds");
      if (duration instanceof HTMLInputElement) duration.value = String(metadata.durationSeconds);
      const approval = input.form?.elements.namedItem("reviewed");
      if (approval instanceof HTMLInputElement) approval.checked = false;
      setLocalAudio(URL.createObjectURL(file));
      setNotice(
        `Audio dapat diputar. Durasi terbaca ${metadata.durationSeconds} detik. Tinjau rekaman dan sumber sebelum menyetujui.`,
      );
    } catch (failure) {
      input.value = "";
      setError(failure instanceof Error ? failure.message : "Audio tidak dapat dibaca.");
    } finally {
      setBusy(false);
      setStage("");
    }
  }
  async function save(form: HTMLFormElement, continueCuration = false) {
    if (!selected || busy) return;
    const values = new FormData(form),
      text = (name: string) => String(values.get(name) || "");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Use the input's File so the successful metadata inspection can be reused.
      const audioInput = form.elements.namedItem("audio");
      const file = audioInput instanceof HTMLInputElement ? audioInput.files?.[0] : null;
      let durationSeconds = Number(text("duration_seconds"));
      if (file instanceof File && file.size) {
        setStage("Memeriksa audio yang dipilih…");
        const metadata = await inspectRecording(file);
        durationSeconds = metadata.durationSeconds;
        const previous = uploadedRecording.current;
        const sameUpload =
          previous?.entryId === selected.id &&
          previous.file === file &&
          previous.license === text("license") &&
          previous.attribution === text("attribution");
        if (!sameUpload) {
          uploadedRecording.current = null;
          setStage("Menyiapkan unggahan audio…");
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
          setStage("Mengunggah berkas audio…");
          const result = await fetch(signed.upload.url, {
            method: "POST",
            body: upload,
            credentials: "omit",
          });
          if (!result.ok) throw new Error("Unggahan audio gagal.");
          uploadedRecording.current = {
            entryId: selected.id,
            file,
            license: text("license"),
            attribution: text("attribution"),
            completed: false,
          };
        }
        if (!uploadedRecording.current?.completed) {
          setStage("Memverifikasi unggahan audio…");
          await api(`/admin/prayers/${selected.id}/audio/complete`, { method: "POST" });
          uploadedRecording.current!.completed = true;
        }
      }
      setStage("Menyimpan teks, sumber, dan keputusan kurasi…");
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
      setStage("Memperbarui daftar doa…");
      const refreshed = await catalog.refetch();
      let next: Entry | undefined;
      if (continueCuration) {
        const rows = refreshed.data || entries;
        const index = rows.findIndex((entry) => entry.id === selected.id);
        const following = [...rows.slice(index + 1), ...rows.slice(0, index)];
        next = following.find(
          (entry) =>
            !entry.publicly_available &&
            (!tradition || entry.tradition === tradition) &&
            matchesStatus(entry, statusFilter),
        );
      }
      setSelected(next || null);
      setLocalAudio(null);
      uploadedRecording.current = null;
      setNotice(
        next
          ? `Kurasi tersimpan. Lanjut ke ${next.catalog_title} (${next.tradition_label}).`
          : continueCuration
            ? "Kurasi tersimpan. Tidak ada entri berikutnya yang belum siap dalam filter ini."
            : "Kurasi tersimpan.",
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Penyimpanan gagal.");
      if (uploadedRecording.current?.completed)
        setNotice(
          "Audio sudah tersimpan. Isian tetap tersedia; simpan kembali untuk melanjutkan kurasi.",
        );
    } finally {
      setBusy(false);
      setStage("");
    }
  }
  return (
    <section className="um-admin-prayers" aria-labelledby="um-admin-prayers-title" aria-busy={busy}>
      <div className="um-admin-section-head">
        <div>
          <h2 className="um-h3" id="um-admin-prayers-title">
            Kurasi doa dan audio
          </h2>
          <p className="um-admin-subtitle">
            Pilih agama atau tradisi, lalu pilih doa untuk melengkapi teks, sumber, dan rekamannya.
          </p>
        </div>
        <span className="um-admin-status">{entries.length} entri katalog</span>
      </div>
      <p className="um-muted">
        Tinjau teks bersama kurator tradisi terkait. Audio memerlukan izin penggunaan, atribusi, dan
        durasi yang sesuai berkas. Draf tanpa audio atau yang belum disetujui tidak tampil dalam
        pilihan doa publik.
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
      {stage && (
        <p role="status" aria-live="polite" className="um-note" data-curation-stage>
          {stage}
        </p>
      )}
      <div className="um-admin-panel">
        <div className="um-grid2">
          <div className="um-field">
            <label className="um-label" htmlFor="prayer-tradition">
              Agama atau tradisi
            </label>
            <select
              className="um-select"
              id="prayer-tradition"
              disabled={busy || catalog.isPending}
              value={tradition}
              onChange={(event) => {
                setTradition(event.target.value);
                if (selected && event.target.value && selected.tradition !== event.target.value)
                  selectEntry(null);
              }}
            >
              <option value="">Semua agama dan tradisi</option>
              {traditions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="um-field">
            <label className="um-label" htmlFor="prayer-status">
              Status kurasi
            </label>
            <select
              className="um-select"
              id="prayer-status"
              value={statusFilter}
              disabled={busy || catalog.isPending}
              onChange={(event) => {
                const filter = event.target.value as StatusFilter;
                setStatusFilter(filter);
                if (selected && !matchesStatus(selected, filter)) selectEntry(null);
              }}
            >
              <option value="">Semua status</option>
              <option value="needs-audio">Perlu audio</option>
              <option value="needs-review">Menunggu kurasi</option>
              <option value="ready">Tampil ke publik</option>
            </select>
          </div>
          <div className="um-field">
            <label className="um-label" htmlFor="prayer-catalog">
              Entri katalog
            </label>
            <select
              className="um-select"
              id="prayer-catalog"
              disabled={busy || catalog.isPending}
              value={selected?.id || ""}
              onChange={(event) =>
                selectEntry(entries.find((entry) => entry.id === event.target.value) || null)
              }
            >
              <option value="">Pilih doa untuk dikelola</option>
              {traditions
                .filter(([id]) => !tradition || id === tradition)
                .map(([id, label]) => (
                  <optgroup key={id} label={label}>
                    {visibleEntries
                      .filter((entry) => entry.tradition === id)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.catalog_title} · {statusLabel(entry)}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          </div>
        </div>
        {catalog.isPending && <p className="um-muted">Memuat katalog doa…</p>}
        {!catalog.isPending && !catalog.error && visibleEntries.length === 0 && (
          <p className="um-muted">Belum ada entri katalog untuk pilihan ini.</p>
        )}
        <div className="um-admin-catalog-list" aria-label="Daftar doa dan status rekaman">
          {visibleEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`um-admin-catalog-item${selected?.id === entry.id ? " is-selected" : ""}`}
              aria-pressed={selected?.id === entry.id}
              disabled={busy}
              onClick={() => selectEntry(entry)}
            >
              <span>
                <strong>{entry.catalog_title}</strong>
                <span className="um-admin-subtitle">
                  {entry.tradition_label} · {entry.has_audio ? "Audio tersedia" : "Belum ada audio"}
                </span>
              </span>
              <span
                className={`um-admin-status ${entry.publicly_available ? "is-ready" : "is-draft"}`}
              >
                {statusLabel(entry)}
              </span>
            </button>
          ))}
        </div>
      </div>
      {selected && (
        <form
          key={selected.id}
          className="um-admin-panel um-admin-prayer-form"
          onSubmit={(e) => {
            e.preventDefault();
            const submitter = (e.nativeEvent as SubmitEvent).submitter;
            void save(e.currentTarget, submitter?.getAttribute("value") === "next");
          }}
        >
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="um-admin-section-head">
              <div>
                <h3 className="um-h3" ref={editorHeading} tabIndex={-1}>
                  {selected.catalog_title}
                </h3>
                <p className="um-admin-subtitle">
                  {selected.tradition_label} · {statusLabel(selected)}
                </p>
              </div>
              <span className={`um-admin-status ${selected.has_audio ? "is-ready" : "is-draft"}`}>
                {selected.has_audio ? "Rekaman tersedia" : "Perlu unggah rekaman"}
              </span>
            </div>
            <div className="um-field">
              <label className="um-label" htmlFor="um-prayer-catalog-id">
                ID katalog
              </label>
              <input className="um-input" id="um-prayer-catalog-id" value={selected.id} readOnly />
              <p className="um-hint">
                Teks dan audio akan disimpan untuk entri ini. Pilihan doa mengikuti katalog
                aplikasi.
              </p>
            </div>
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
            <div className="um-grid2">
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
            </div>
            <div className="um-grid2">
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
            </div>
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
                rekaman. Unggahan hanya dipasang ke {selected.catalog_title} (
                {selected.tradition_label}).
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
            <div className="um-grid2">
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
            </div>
            <label className="um-check">
              <input type="checkbox" name="reviewed" defaultChecked={selected.reviewed} /> Teks dan
              audio telah ditinjau kurator, sumber serta izin telah diperiksa
            </label>
            <p className="um-hint">
              Biarkan persetujuan tidak dicentang untuk menyimpan draf. Doa tampil kepada pengunjung
              setelah rekaman tersedia dan kurasi disetujui. Simpan dan lanjut membuka entri
              berikutnya yang belum tampil ke publik, sesuai filter di atas.
            </p>
            <div className="um-btn-row end">
              <button className="um-btn" name="action" value="next" disabled={busy}>
                Simpan dan lanjut
              </button>
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
