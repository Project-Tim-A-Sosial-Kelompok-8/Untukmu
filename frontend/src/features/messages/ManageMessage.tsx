import { useState } from "react";
import { create } from "zustand";
import { api, invalidate } from "../../lib/api/client";
import { store, type Message } from "../../lib/api/store";
import * as vault from "../../lib/crypto/vault";
import { requestChallenge } from "../account/Challenge";
const useMessage = create<{item:Message|null;text:string}>(()=>({item:null,text:""}));
export async function openMessage(id:string) {try {const item=await store.getPesan(id);const text=await store.bacaIsi(item);if(text===null) throw new Error("Buka kunci enkripsi terlebih dahulu.");useMessage.setState({item,text});} catch(e) {window.UM.ui.toast(e instanceof Error?e.message:"Pesan gagal dibuka.");}}
export function ManageMessage() {
  const {item,text}=useMessage();const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
  if(!item) return null;
  const noun = "pesan";
  async function run(task:()=>Promise<unknown>) {setBusy(true);setStatus("");try{await task();}catch(e){setStatus(e instanceof Error?e.message:"Permintaan gagal.");}finally{setBusy(false);}}
  const close=()=>{useMessage.setState({item:null,text:""});setStatus("");};
  async function refresh(){await invalidate();await Promise.all([window.UM.galaksi.refresh(),window.UM.sky.refresh()]);window.UM.galaksi.bersihkanPilihan();window.UM.ui.renderSemua();close();}
  return <div className="um-screen on z-top" style={{zIndex:70}}><div className="um-wrap narrow" role="dialog" aria-modal="true" aria-labelledby="manage-title"><div className="um-head"><h1 className="um-h1" id="manage-title">Kelola {noun}</h1><button className="um-close" disabled={busy} onClick={close} aria-label="Tutup">×</button></div><div className="um-card"><label htmlFor="manage-text" className="um-label">Isi {noun}</label><textarea id="manage-text" className="um-textarea" maxLength={40000} value={text} onChange={e=>useMessage.setState({text:e.target.value})}/><div className="um-btn-row"><button className="um-btn primary" disabled={busy||!text.trim()} onClick={()=>void run(async()=>{const privateMessage=item.privasi==="privat";await api(`/messages/${item.id}`,{method:"PATCH",body:JSON.stringify({id:item.id,constellation_ids:item.galaksiIds,visibility:privateMessage?"private":item.privasi==="unlisted"?"unlisted":"public_anon",payload:privateMessage?await vault.encryptPesan(text,"privat",item.id):undefined,public_body:privateMessage?undefined:text,turnstile_token:privateMessage?undefined:await requestChallenge("publish"),tags:item.tag,mood:item.mood,date_label:item.tanggal,attachment_ids:item.attachmentIds})});await refresh();})}>Simpan perubahan</button><button className="um-btn danger" disabled={busy} onClick={()=>{if(confirm(`Hapus ${noun} ini secara permanen dari akun?`)) void run(async()=>{await api(`/messages/${item.id}`,{method:"DELETE"});await refresh();});}}>Hapus {noun}</button></div>
  {item.privasi!=="privat"&&<p className="um-note">Perubahan akan ditinjau ulang oleh moderator. Lampiran tetap privat untuk pemilik.</p>}
  {item.privasi==="unlisted"&&<><div className="um-btn-row"><button className="um-btn" disabled={busy} onClick={()=>void run(async()=>{const result=await api<{token:string}>(`/messages/${item.id}/share`,{method:"POST"});setStatus(`${location.origin}/bagi#${item.id}.${result.token}`);})}>Buat tautan baru</button><button className="um-btn" disabled={busy} onClick={()=>void run(async()=>{await api(`/messages/${item.id}/share`,{method:"DELETE"});setStatus("Tautan dicabut.");})}>Cabut tautan</button></div><p className="um-muted">Tautan baru membatalkan tautan sebelumnya. Pesan dapat dibaca setelah disetujui moderator.</p></>}
  {status&&<p className="um-note" role="status" style={{overflowWrap:"anywhere",userSelect:"all"}}>{status}</p>}</div></div></div>;
}
