import { useState } from "react";
import { api, authenticate, currentUser } from "../../lib/api/client";
import * as vault from "../../lib/crypto/vault";
import type { KeyRecord } from "../../lib/crypto/types";
import { requestChallenge } from "./Challenge";
export function RecoveryScreen({onClose,onSuccess}:{onClose:()=>void;onSuccess:(code:string)=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(form:HTMLFormElement) {
    const data=new FormData(form),email=String(data.get("email")||"").trim().toLowerCase(),code=String(data.get("code")||""),password=String(data.get("password")||"");
    setBusy(true);setError("");
    try {
      if(password!==data.get("repeat")) throw new Error("Ulangan kata sandi belum cocok.");
      if(currentUser()?.email===email && !currentUser()?.recovery_ready) {
        const previousPassword=String(data.get("previous")||"");
        await vault.unlockWithRecovery(code);
        await api("/auth/recovery/enable",{method:"POST",body:JSON.stringify({password:await vault.authCredential(previousPassword,email),recovery_verifier:await vault.recoveryVerifier(code,email)})});
      }
      const result=await api<{challenge:string;encryption_record:KeyRecord}>("/auth/recovery/begin",{method:"POST",body:JSON.stringify({email,recovery_verifier:await vault.recoveryVerifier(code,email),turnstile_token:await requestChallenge("recovery")})});
      const next=await vault.rewrapWithRecovery(code,password,result.encryption_record);
      const user=await authenticate("recovery/finish",{challenge:result.challenge,password:await vault.authCredential(password,email),encryption_record:next.record,recovery_verifier:await vault.recoveryVerifier(next.recoveryCode,email)});
      await vault.unlock(password,user.encryption_record);form.reset();onSuccess(next.recoveryCode);
    } catch(failure) {setError(failure instanceof Error?failure.message:"Pemulihan gagal.");} finally {setBusy(false);}
  }
  return <div className="um-screen on z-top" style={{zIndex:65}}><div className="um-wrap narrow" role="dialog" aria-modal="true" aria-labelledby="recovery-title"><div className="um-head"><h1 className="um-h1" id="recovery-title">Pulihkan akun</h1><button className="um-close" aria-label="Tutup" disabled={busy} onClick={onClose}>×</button></div><form className="um-card" onSubmit={e=>{e.preventDefault();void submit(e.currentTarget);}}><p className="um-p">Gunakan kode yang disimpan saat pendaftaran. Pesan lama tetap dapat dibuka. Setelah berhasil, semua sesi lama dan kode pemulihan lama tidak berlaku.</p>
  {([['email','Surel','email'],['code','Kode pemulihan','password'],['password','Kata sandi baru','password'],['repeat','Ulangi kata sandi baru','password']] as const).map(([name,label,type])=><div className="um-field" key={name}><label className="um-label" htmlFor={`recovery-${name}`}>{label}</label><input className="um-input" id={`recovery-${name}`} name={name} type={type} required minLength={name==="password"||name==="repeat"?12:undefined} maxLength={256} autoComplete={name==="password"||name==="repeat"?"new-password":"off"}/></div>)}
  {currentUser()&&!currentUser()?.recovery_ready&&<div className="um-field"><label className="um-label" htmlFor="recovery-previous">Kata sandi saat ini (aktivasi pemulihan akun lama)</label><input className="um-input" id="recovery-previous" name="previous" type="password" required maxLength={256} autoComplete="current-password"/></div>}
  {error&&<p className="um-error" role="alert">{error}</p>}<div className="um-btn-row end"><button className="um-btn primary" disabled={busy}>{busy?"Memulihkan…":"Pulihkan dan ganti kata sandi"}</button></div></form></div></div>;
}
