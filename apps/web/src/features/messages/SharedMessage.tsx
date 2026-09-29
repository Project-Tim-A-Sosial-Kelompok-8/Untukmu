import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api/client";
export function SharedMessage() {
  const result=useQuery({queryKey:["shared",location.hash],retry:false,queryFn:async()=>{const [id,token]=location.hash.slice(1).split(".");if(!/^[a-f0-9-]{36}$/.test(id||"")||!/^[A-Za-z0-9_-]{43}$/.test(token||"")) throw new Error("Tautan tidak lengkap.");return api<{public_body:string}>(`/shared/${id}`,{headers:{"X-Share-Token":token}});}});
  return <div className="um-screen on z-top" style={{zIndex:100}}><div className="um-wrap narrow"><div className="um-head"><h1 className="um-h1">Untukmu</h1><button className="um-btn" onClick={()=>{if(window.top) window.top.location.href="/";}}>Buka Untukmu</button></div><article className="um-card"><p className="um-p" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{result.data?.public_body||result.error?.message||"Memuat pesan…"}</p></article></div></div>;
}
