import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
import { decryptShare } from "../../lib/crypto/vault";
import type { Cipher } from "../../lib/crypto/types";
export function SharedMessage() {
  const result=useQuery({queryKey:["shared",location.hash],retry:false,queryFn:async()=>{
    const [id,token,key]=location.hash.slice(1).split(".");
    if(!/^[a-f0-9-]{36}$/.test(id||"")||!/^[A-Za-z0-9_-]{43}$/.test(token||"")||!/^[A-Za-z0-9_-]{43}$/.test(key||"")) throw new Error("Tautan tidak lengkap. Minta tautan baru kepada pemilik pesan.");
    const data=await api<{payload:Cipher}>(`/shared/${id}`,{headers:{"X-Share-Token":token}});
    try { return await decryptShare(data.payload,key,id); } catch { throw new Error("Pesan tidak dapat dibuka dengan kunci tautan ini."); }
  }});
  return <div className="um-screen on z-top" style={{zIndex:100}}><div className="um-wrap narrow"><div className="um-head"><h1 className="um-h1">Untukmu</h1><button className="um-btn" onClick={()=>{if(window.top) window.top.location.href="/";}}>Buka Untukmu</button></div><article className="um-card"><p className="um-p" role={result.error?"alert":undefined} style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{result.data||result.error?.message||"Memuat pesan…"}</p></article></div></div>;
}
