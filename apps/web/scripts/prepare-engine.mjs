import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { portReactUI } from "./port-react-ui.mjs";
import { enhanceAdvanced } from "./enhance-advanced.mjs";
import { enhancePrayers } from "./enhance-prayers.mjs";
import { enhanceSocial } from "./enhance-social.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const original = resolve(root, "legacy");
const output = resolve(root, "public/engine");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const folder of ["images", "vendor", "audio"]) await cp(resolve(original, folder), resolve(output, folder), { recursive: true });
await mkdir(resolve(output, "untukmu/js"), { recursive: true });
await cp(resolve(original, "untukmu/untukmu.css"), resolve(output, "untukmu/untukmu.css"));
const unchanged = ["um-i18n.js", "um-doa.js", "um-sky.js"];
for (const name of unchanged) await cp(resolve(original, "untukmu/js", name), resolve(output, "untukmu/js", name));

function replaceOnce(source, before, after) {
  if (!source.includes(before)) throw new Error(`Source anchor missing: ${before.slice(0, 100)}`);
  return source.replace(before, after);
}
let index = (await readFile(resolve(original, "index.html"), "utf8")).replaceAll("\r\n", "\n");
index = index.replace('<html lang="en">', '<html lang="id">');
index = replaceOnce(index, '<script src="untukmu/js/um-crypto.js"></script>', '<script src="runtime.js"></script>');
index = replaceOnce(index, '<script src="untukmu/js/um-store.js"></script>', "");
index = replaceOnce(index, '<script src="untukmu/js/um-tests.js"></script>', "");
// The archive names a music file that is absent. Do not request a missing asset
// or replace it with unlicensed/generated prayer audio.
index = index.replace(/var MUSIC_TRACKS\s*=\s*\[[\s\S]*?\];/, "var MUSIC_TRACKS = [];");
index = index.replaceAll("rafId = requestAnimationFrame(frame);", "rafId = null;");
index = replaceOnce(index, "  startLoop();", `  window.UM_ENGINE = {
 renderer: renderer, scene: scene, camera: camera, frame: frame,
 cameraForView: function() { return viewMode === 'sky' ? skyCamera : viewMode === 'solar' ? solarCamera : camera; },
 stop: function() { if (rafId != null) cancelAnimationFrame(rafId); rafId = null; },
 metrics: function() { return {frames: videoFrameCount, mode: viewMode, pixelRatio: renderer.getPixelRatio()}; }
};`);
index = index.replace(/var beaconLang = 'en';[^\n]+/, "var beaconLang = 'id';");
index = replaceOnce(index, "function setBeaconLang(lang) {", "function setBeaconLang(lang) { lang = 'id';");
index = index.replace(/<option value="(en|hans|hant|ja|ko)"[^>]*>[^<]*<\/option>/g, "");
const hashes = [...index.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(m => m[1].trim()).map(m => "'sha256-" + createHash("sha256").update(m[1]).digest("base64") + "'");
const storageOrigin = new URL(process.env.S3_PUBLIC_ENDPOINT || "http://localhost:9000").origin;
const csp = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com ${hashes.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${storageOrigin} https://challenges.cloudflare.com; media-src 'self' blob: ${storageOrigin}; worker-src 'self'; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'`;
index = replaceOnce(index, '<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + csp + '">');
await writeFile(resolve(output, "index.html"), index);

let app = await readFile(resolve(original, "untukmu/js/um-app.js"), "utf8");
app = replaceOnce(app, "UM.store.seedIfEmpty()", "UM.store.ready()");
app = replaceOnce(app, "if (!tersimpan && typeof setBeaconLang === 'function')", "if (typeof setBeaconLang === 'function')");
app = replaceOnce(app, "return UM.i18n.setLang(aktif);", "return UM.i18n.setLang('id');");
app = replaceOnce(app, "UM.i18n.setLang(sel.value);", "sel.value = 'id'; if (typeof setBeaconLang === 'function') setBeaconLang('id'); UM.i18n.setLang('id');");
await writeFile(resolve(output, "untukmu/js/um-app.js"), app);

let galaxy = await readFile(resolve(original, "untukmu/js/um-galaksi.js"), "utf8");
galaxy = replaceOnce(galaxy, "UM.galaksi.terbangKeTitik(item, idx, pesan);", "if (pesan) UM.galaksi.terbangKeTitik(item, idx, pesan);");
galaxy = replaceOnce(galaxy, "var orangLain = semua.filter(function (p) { return p.sabuk === true; });", "var orangLain = (doaPer[g.id] || []).map(function(d) { var p = semua.find(function(p) { return p.id === d.pesanId; }); return p ? Object.assign({}, p, { id: 'prayer-' + d.id, originMessageId: p.id, sabuk: true, piringan: false, sendiri: false }) : null; }).filter(Boolean);");
galaxy = replaceOnce(galaxy, "if (d.pesanId && !doaPesan[d.pesanId]) doaPesan[d.pesanId] = d;", "if (d.pesanId) doaPesan['prayer-' + d.id] = d;");
await writeFile(resolve(output, "untukmu/js/um-galaksi.js"), galaxy);

let ui = (await readFile(resolve(original, "untukmu/js/um-ui.js"), "utf8")).replaceAll("\r\n", "\n");
ui = replaceOnce(ui, "function badge(privasi) {", "function lampiran(p) { return (p.attachmentIds || []).map(function(id, i) { return '<button class=\"um-btn small\" data-act=\"download\" data-id=\"' + escAttr(id) + '\">Unduh lampiran ' + (i + 1) + '</button>'; }).join(''); }\n  function badge(privasi) {");
ui = replaceOnce(ui, "'<div class=\"txt um-dim\" data-isi=\"' + escAttr(p.id) + '\">…</div>' +", "'<div class=\"txt um-dim\" data-isi=\"' + escAttr(p.id) + '\">…</div>' + lampiran(p) +");
ui = replaceOnce(ui, "'<div id=\"bp-desc\"><span class=\"um-dim\">…</span></div>' +", "'<div id=\"bp-desc\"><span class=\"um-dim\">…</span></div>' + lampiran(p) +");
for (const [signature, retry] of [
  ["function bukaKomposer(galaksiId) {", "bukaKomposer(galaksiId)"],
  ["function bukaDash() {", "bukaDash()"],
  ["function bukaSetup() {", "bukaSetup()"],
]) ui = replaceOnce(ui, signature, signature + `\n    if (!UM.account.isLogged()) { UM.account.require().then(function(ok) { if(ok) ${retry}; }); return; }\n`);
ui = replaceOnce(ui, "comp.privasi = 'privat'; comp.newFoto = null;", "comp.privasi = 'privat'; comp.newFoto = null; comp.files = []; comp.customCategory = ''; ");
ui = replaceOnce(ui, "if (act === 'cancel') { close(compEl); return; }", "serapInput();\n      if (act === 'cancel') { close(compEl); comp.files = []; return; }");
ui = replaceOnce(ui, "'<div class=\"um-chips\">' + kat + '</div>' +", "'<div class=\"um-chips\">' + kat + '</div>' + '<input class=\"um-input\" data-field=\"custom-category\" aria-label=\"Kategori khusus\" placeholder=\"Kategori khusus (opsional)\" value=\"' + escAttr(comp.customCategory || '') + '\">' +");
ui = replaceOnce(ui, "var i = w.querySelector('[data-field=\"isi\"]');", "var custom = w.querySelector('[data-field=\"custom-category\"]'); if (custom) comp.customCategory = custom.value;\n    var i = w.querySelector('[data-field=\"isi\"]');");
ui = replaceOnce(ui, "kategori: comp.newKategori || 'lain-lain',", "kategori: (comp.customCategory || '').trim() || comp.newKategori || 'seseorang',");
ui = replaceOnce(ui, "return galaksiBaru.then(function (g) {", "return galaksiBaru.then(function (g) {\n      comp.baru = false; comp.galaksiId = g.id;");
ui = replaceOnce(ui, "tag: tagList, dibuat: Date.now()", "tag: tagList, dibuat: Date.now(), attachments: comp.files || []");
ui = replaceOnce(ui, "return '<div class=\"um-h2\">' + teks(T('bentukTitle')) + '</div>' +", "return '<div class=\"um-h2\">' + teks(T('bentukTitle')) + '</div>' + '<div class=\"um-btn-row\" style=\"margin-bottom:14px\"><button class=\"um-btn small\" data-act=\"upload\">' + (comp.newFoto ? 'Ganti foto' : 'Unggah foto (opsional)') + '</button>' + (comp.newFoto ? '<span class=\"um-muted\">Foto dipilih</span>' : '') + '</div>' +");
ui = replaceOnce(ui, "'<div class=\"um-chips\">' + moods + '</div></div>' +", "'<div class=\"um-chips\">' + moods + '</div></div>' + '<div class=\"um-field\"><label class=\"um-label\" for=\"um-files\">Lampiran terenkripsi (opsional)</label><input id=\"um-files\" class=\"um-input\" type=\"file\" multiple><div class=\"um-hint\">' + ((comp.files || []).length) + ' berkas dipilih · maksimal 5</div></div>' +");
ui = replaceOnce(ui, "compEl.appendChild(el('div', 'um-wrap narrow'));", "compEl.appendChild(el('div', 'um-wrap narrow'));\n    compEl.addEventListener('change', function(e) { if(e.target.id === 'um-files') { comp.files = Array.from(e.target.files).slice(0,5); serapInput(); renderKomposer(); } });");
// Keep the old no-op re-encryption hook out: production has no plaintext seed records.
ui = replaceOnce(ui, "return UM.store.reEnkripsiPrivat();", "return Promise.resolve();");
// Preserve entry copy/layout while making the privacy statement a real link.
ui = replaceOnce(ui, "teks(aman ? T('entryFine') : T('entryFineWarn'))", "'<a href=\"/kebijakan-privasi\" target=\"_top\" style=\"color:inherit;text-decoration:none\">' + teks(aman ? T('entryFine') : T('entryFineWarn')) + '</a>'");
ui = enhanceSocial(ui, replaceOnce);
ui = enhancePrayers(ui, replaceOnce);
ui = enhanceAdvanced(ui, replaceOnce);
ui = replaceOnce(ui, "function open(s) { if (s) s.classList.add('on'); }", "function open(s) { if (s) s.classList.add('on'); UM.trackScreen(s, true); }");
ui = replaceOnce(ui, "function close(s) { if (s) s.classList.remove('on'); }", "function close(s) { if (s) s.classList.remove('on'); UM.trackScreen(s, false); }");
await writeFile(resolve(output, "untukmu/js/um-ui.js"), portReactUI(ui));

await build({ entryPoints: [resolve(root, "src/runtime/bootstrap.tsx")], outfile: resolve(output, "runtime.js"), bundle: true,
  format: "iife", platform: "browser", target: "es2022", minify: true, sourcemap: false,
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY": JSON.stringify(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "") } });
await build({ entryPoints: [resolve(root, "src/lib/crypto/argon2.worker.ts")], outfile: resolve(output, "argon2.worker.js"), bundle: true, format: "iife", platform: "browser", target: "es2022", minify: true });

const sha = async path => createHash("sha256").update(await readFile(path)).digest("hex");
const inventory = {};
for (const name of ["untukmu/untukmu.css", "vendor/three.min.js", ...unchanged.map(n => `untukmu/js/${n}`)]) {
  inventory[name] = { original: await sha(resolve(original, name)), built: await sha(resolve(output, name)) };
  if (inventory[name].original !== inventory[name].built) throw new Error(`Preserved source changed: ${name}`);
}
await writeFile(resolve(output, "preservation.json"), JSON.stringify(inventory, null, 2));
console.log("Engine asli disiapkan; penyimpanan IndexedDB dan kripto prototipe tidak disertakan.");

const runtimeHash = (await sha(resolve(output, "runtime.js"))).slice(0,16);
const swPath = resolve(root,"public/sw.js");
await writeFile(swPath,(await readFile(swPath,"utf8")).replace(/const CACHE = "untukmu-static-[^"]+";/, 'const CACHE = "untukmu-static-' + runtimeHash + '";'));
