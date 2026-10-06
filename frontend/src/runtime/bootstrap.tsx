import { installAccessibility } from "./accessibility";
import { ManageMessage, openMessage } from "../features/messages/ManageMessage";
import { SharedMessage } from "../features/messages/SharedMessage";
import { Challenge } from "../features/account/Challenge";
import { SocialScreens, openSocial } from "../features/social/SocialScreens";
import { renderPreservedScreen, trackScreen } from "../features/screens/PreservedScreens";
import { mountFiberEngine } from "../features/galaxy/FiberBridge";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { api, currentUser, queryClient } from "../lib/api/client";
import { store, clearPrivateMedia } from "../lib/api/store";
import * as vault from "../lib/crypto/vault";
import { AccountScreen, openAccount, signOut } from "../features/account/AccountScreen";
import { requireLogin, requireEntryLogin } from "../features/account/state";

window.UM.renderScreen = renderPreservedScreen;
window.UM.trackScreen = trackScreen;
window.UM.openSocial = openSocial;
if (window.UM_ENGINE) void mountFiberEngine(window.UM_ENGINE).catch(() => { document.body.insertAdjacentHTML("beforeend", '<p role="alert" class="um-toast on">Galaksi gagal dimuat. Muat ulang halaman.</p>'); });
window.UM.store = store;
window.UM.crypto = { ...vault, lock() { vault.lock(); clearPrivateMedia(); }, reason: () => vault.available() ? null : "no-webcrypto", kdfId: () => "Argon2id", iterations: () => 3 };
vault.setRecordReader(async () => currentUser()?.encryption_record || null);
window.addEventListener("untukmu-session-ended", () => { vault.lock(); clearPrivateMedia(); location.reload(); });
window.UM.account = { require: requireLogin, open: openAccount, logout: signOut, isLogged: () => !!currentUser() };
const host = document.createElement("div");
host.id = "um-react-account";
document.body.append(host);
const initialScreen = new URLSearchParams(location.search).get("screen");
if (initialScreen !== "shared") requireEntryLogin();
createRoot(host).render(<QueryClientProvider client={queryClient}><AccountScreen /><SocialScreens /><ManageMessage /><Challenge />{initialScreen === "shared" && <SharedMessage />}</QueryClientProvider>);

if (new URLSearchParams(location.search).get("screen") === "admin") void store.ready().then(() => setTimeout(() => void openSocial("admin"), 100));
let clearingData = false;
document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-act], #um-b-empati") : null;
  if (!target) return;
  const action = target.dataset.act;
  if (action === "download" && target.dataset.id) {
    event.stopImmediatePropagation(); event.preventDefault();
    void store.readFile(target.dataset.id).then(file => {
      const url = URL.createObjectURL(file);
      const link = document.createElement("a"); link.href = url; link.download = file.name;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }).catch(error => window.UM.ui.toast(error instanceof Error ? error.message : "Lampiran gagal dibuka."));
    return;
  }
  if (action === "manage" && target.dataset.id) { event.stopImmediatePropagation(); event.preventDefault(); void openMessage(target.dataset.id); return; }
  if (action === "account") { event.stopImmediatePropagation(); event.preventDefault(); openAccount(); return; }
  if (action === "switch-account") { event.stopImmediatePropagation(); event.preventDefault(); void signOut().catch(error => window.UM.ui.toast(error.message)); return; }
  if (action === "delete-account") { event.stopImmediatePropagation(); event.preventDefault(); openAccount("delete"); return; }
  if (["tulis", "dash", "setup"].includes(action || "") && !currentUser()) {
    event.stopImmediatePropagation(); event.preventDefault();
    void requireLogin().then(success => {
      if (!success) return;
      if (action === "tulis") window.UM.ui.bukaKomposer();
      else if (action === "dash") window.UM.ui.bukaDash();
      else window.UM.ui.bukaSetup();
    });
  }
  if (action === "reset") {
    event.stopImmediatePropagation(); event.preventDefault();
    if(clearingData) return;
    if(!currentUser()) {openAccount();return;}
    if(!confirm("Hapus seluruh pesan dan tujuan dari akun ini? Berkas unggahan tetap tersedia dalam ekspor. Tindakan ini tidak dapat dibatalkan.")) return;
    const password=prompt("Masukkan kata sandi akun untuk mengonfirmasi:"); if(!password) return;
    const email = currentUser()!.email;
    const controls = Array.from(target.closest('.um-screen')?.querySelectorAll<HTMLButtonElement>('button') || []).map(button => ({ button, disabled: button.disabled }));
    const label = target.textContent;
    clearingData = true;
    controls.forEach(({ button }) => { button.disabled = true; });
    target.textContent = 'Menghapus pesan dan tujuan…';
    void vault.authCredential(password,email)
      .then(credential=>api("/users/me/clear",{method:"POST",body:JSON.stringify({password:credential})}))
      .then(()=>location.reload())
      .catch(error=>window.UM.ui.toast(error.message))
      .finally(() => {
        clearingData = false;
        controls.forEach(({ button, disabled }) => { button.disabled = disabled; });
        target.textContent = label;
      });
  }

}, true);

installAccessibility();

let lastPrayerCount: number | null = null;
let lastPublicVersion: string | null = null;
setInterval(()=>{
  if(document.hidden || !currentUser() || document.querySelector('#um-comp.on')) return;
  void Promise.all([api<{prayers_received:number}>("/dashboard/summary"), store.publicVersion()]).then(async ([summary, publicVersion])=>{
    if(lastPrayerCount!==null && lastPrayerCount!==summary.prayers_received || lastPublicVersion !== publicVersion) {
      await queryClient.invalidateQueries({queryKey:["api"]});await Promise.all([window.UM.galaksi.refresh(),window.UM.sky.refresh()]);
      if(document.querySelector('#um-dash.on')) window.UM.ui.renderSemua();
    }
    lastPrayerCount=summary.prayers_received;
    lastPublicVersion=publicVersion;
  }).catch(()=>{/* Retry on the next visible poll; do not interrupt a composition. */});
},20000);
