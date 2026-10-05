import { useState } from "react";
import { api } from "../../lib/api/client";
import { store } from "../../lib/api/store";
import * as vault from "../../lib/crypto/vault";
import type { Cipher } from "../../lib/crypto/types";
export function ExportScreen() {
  const [password,setPassword]=useState(""),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
  async function download() {
    setBusy(true);setStatus("");
    try {
      if(!vault.unlocked()) throw new Error("Buka kunci enkripsi sebelum mengekspor.");
      const source=await api<{format:string;messages:{payload:Cipher;visibility:string;public_body:string|null}[];uploads:{id:string}[];constellations:unknown[]}>("/users/me/export");
      const messages=await Promise.all(source.messages.map(async row=>({...row,text:row.visibility==="private"?await vault.decryptPesan(row.payload):row.public_body})));
      if(messages.some(m=>m.text===null)) throw new Error("Kunci ditutup saat ekspor. Ulangi setelah membuka kunci.");
      const uploads=[];
      for(const upload of source.uploads) { const file=await store.readFile(upload.id);uploads.push({...upload,name:file.name,type:file.type,data:vault.b64(await file.arrayBuffer())}); }
      const encrypted=await vault.encryptExport({...source,format:"untukmu-export-data-v1",exported_at:new Date().toISOString(),messages,uploads},password);
      const url=URL.createObjectURL(new Blob([JSON.stringify(encrypted)],{type:"application/json"}));
      const link=document.createElement("a");link.href=url;link.download=`Untukmu-ekspor-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
      setStatus(`Ekspor terenkripsi selesai: ${messages.length} pesan dan ${uploads.length} berkas.`);
    } catch(failure) {setStatus(failure instanceof Error?failure.message:"Ekspor gagal.");} finally {setBusy(false);}
  }
  async function verify(file?:File) {
    if(!file) return;setBusy(true);setStatus("");
    try {const result=await vault.decryptExport(JSON.parse(await file.text()),password);if(result.format!=="untukmu-export-data-v1") throw new Error("Format isi tidak cocok.");setStatus(`Berkas berhasil diverifikasi: ${result.messages.length} pesan, ${result.constellations.length} tujuan, ${result.uploads.length} berkas. Tidak ada data akun yang diubah.`);}
    catch {setStatus("Berkas tidak valid atau kata sandi ekspor tidak cocok.");} finally {setBusy(false);}
  }
  return <section style={{marginTop:20}}><h2 className="um-h3">Ekspor terenkripsi</h2><p className="um-muted">Semua pesan, tujuan, foto, dan lampiran milik akun disertakan. Simpan kata sandi ekspor agar berkas dapat dibuka kembali.</p><label className="um-label" htmlFor="export-password">Kata sandi berkas ekspor (minimal 12 karakter)</label><input className="um-input" id="export-password" type="password" minLength={12} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/><div className="um-btn-row"><button className="um-btn" disabled={busy||password.length<12} onClick={()=>void download()}>Unduh ekspor terenkripsi</button></div><label className="um-label" htmlFor="export-verify">Periksa berkas ekspor dengan kata sandi di atas</label><input id="export-verify" type="file" accept="application/json,.json" disabled={busy||password.length<12} onChange={e=>void verify(e.target.files?.[0])}/>{status&&<p className="um-note" role="status">{status}</p>}</section>;
}
