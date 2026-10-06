import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
interface Entry { id: string; content: { nama: { id: string }; teks?: { id: string }; arti?: { id: string }; sumber: string; source_url?: string; review_note?: string; detik: number }; reviewed: boolean; has_audio: boolean; audio_meta: { license?: string; attribution?: string } }
export function PrayerAdmin() {
  const catalog = useQuery({ queryKey: ["prayer-admin"], queryFn: () => api<Entry[]>("/admin/prayers") });
  const [selected, setSelected] = useState<Entry | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function save(form: HTMLFormElement) {
    if (!selected || busy) return;
    const values = new FormData(form), text = (name: string) => String(values.get(name) || "");
    setBusy(true); setError(""); setNotice("");
    try {
      const file = values.get("audio");
      if (file instanceof File && file.size) {
        const signed = await api<{upload: {url: string; fields: Record<string,string>}}>(`/admin/prayers/${selected.id}/audio/presign`, {method:"POST",body:JSON.stringify({byte_size:file.size,content_type:file.type,license:text("license"),attribution:text("attribution"),duration_seconds:Number(text("duration_seconds"))})});
        const upload = new FormData(); Object.entries(signed.upload.fields).forEach(([key,value]) => upload.append(key,value)); upload.append("file",file);
        const result = await fetch(signed.upload.url,{method:"POST",body:upload,credentials:"omit"}); if(!result.ok) throw new Error("Unggahan audio gagal.");
        await api(`/admin/prayers/${selected.id}/audio/complete`,{method:"POST"});
      }
      await api(`/admin/prayers/${selected.id}`,{method:"PUT",body:JSON.stringify({title:text("title"),text:text("text")||null,translation:text("translation")||null,source_attribution:text("source_attribution"),source_url:text("source_url"),review_note:text("review_note"),duration_seconds:Number(text("duration_seconds")),reviewed:values.get("reviewed")==="on"})});
      await catalog.refetch(); setSelected(null); setNotice("Kurasi tersimpan.");
    } catch(failure) {setError(failure instanceof Error?failure.message:"Penyimpanan gagal.");} finally {setBusy(false);}
  }
  return <section className="um-card"><h2 className="um-h3">Kurasi doa dan audio</h2><p className="um-muted">Tinjau teks bersama kurator tradisi terkait. Audio memerlukan izin penggunaan, atribusi, dan durasi yang sesuai berkas.</p>
    {(error||catalog.error) && <p role="alert" className="um-error">{error||catalog.error?.message}</p>}
    {notice && <p role="status" className="um-note">{notice}</p>}
    <label className="um-label" htmlFor="prayer-catalog">Entri katalog</label><select className="um-select" id="prayer-catalog" disabled={busy} value={selected?.id||""} onChange={e=>{setSelected(catalog.data?.find(x=>x.id===e.target.value)||null);setError("");setNotice("");}}><option value="">Pilih entri</option>{catalog.data?.map(row=><option key={row.id} value={row.id}>{row.id} · {row.reviewed?"disetujui":"menunggu kurasi"}</option>)}</select>
    {selected && <form key={selected.id} onSubmit={e=>{e.preventDefault();void save(e.currentTarget);}}>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {([['title','Judul',selected.content.nama.id],['source_attribution','Atribusi sumber',selected.content.sumber],['source_url','Tautan sumber HTTPS',selected.content.source_url||""],['review_note','Catatan peninjauan',selected.content.review_note||""]] as const).map(([name,label,value])=><div className="um-field" key={name}><label className="um-label" htmlFor={`um-prayer-${name}`}>{label}</label><input className="um-input" id={`um-prayer-${name}`} name={name} defaultValue={value} required maxLength={name==="title"?120:1000}/></div>)}
      {([['text','Teks doa',selected.content.teks?.id||""],['translation','Terjemahan',selected.content.arti?.id||""]] as const).map(([name,label,value])=><div className="um-field" key={name}><label className="um-label" htmlFor={`um-prayer-${name}`}>{label}</label><textarea className="um-textarea" id={`um-prayer-${name}`} name={name} defaultValue={value} maxLength={10000}/></div>)}
      <div className="um-field"><label className="um-label" htmlFor="um-prayer-duration_seconds">Durasi (detik)</label><input className="um-input" id="um-prayer-duration_seconds" name="duration_seconds" type="number" min={5} max={900} defaultValue={selected.content.detik||30} required/></div>
      <div className="um-field"><label className="um-label" htmlFor="prayer-audio">{selected.has_audio?"Ganti audio":"Unggah audio"} (opsional)</label><input className="um-input" type="file" id="prayer-audio" name="audio" accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4"/></div>
      <div className="um-field"><label className="um-label" htmlFor="um-prayer-license">Lisensi audio</label><input className="um-input" name="license" id="um-prayer-license" defaultValue={selected.audio_meta.license||""}/></div>
      <div className="um-field"><label className="um-label" htmlFor="um-prayer-attribution">Atribusi rekaman</label><input className="um-input" name="attribution" id="um-prayer-attribution" defaultValue={selected.audio_meta.attribution||""}/></div>
      <label className="um-check"><input type="checkbox" name="reviewed" defaultChecked={selected.reviewed}/> Teks dan audio telah ditinjau kurator, sumber serta izin telah diperiksa</label>
      <div className="um-btn-row end"><button className="um-btn primary" disabled={busy}>{busy?"Menyimpan…":"Simpan kurasi"}</button></div>
      </fieldset>
    </form>}
  </section>;
}
