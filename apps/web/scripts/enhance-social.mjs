import { enhanceExplore } from "./enhance-explore.mjs";
export function enhanceSocial(ui, replace) {
  ui = enhanceExplore(ui, replace);
  ui = replace(ui, "comp.privasi = 'privat';", "comp.privasi = UM.store.defaultPrivacy();");
  ui = replace(ui, "if (em) em.onclick = function () { toast(T('empathiToast')); em.disabled = true; };", "if (em) em.onclick = function () { em.disabled = true; UM.store.empathy(p.id).then(function() { toast(T('empathiToast')); }).catch(function(err) { em.disabled = false; toast(err.message); }); };");
  ui = replace(ui, "var langs = [['id', 'Bahasa Indonesia'], ['en', 'English'], ['hans', '简体中文'], ['hant', '繁體中文'], ['ja', '日本語'], ['ko', '한국어']];", "var langs = [['id', 'Bahasa Indonesia']];");
  ui = replace(ui, "'<div class=\"um-h3\" style=\"margin-top:18px\">' + teks(T('setAbout'))", "'<div class=\"um-btn-row\"><button class=\"um-btn\" data-act=\"account\">Akun dan keamanan</button></div>' + '<div class=\"um-h3\" style=\"margin-top:18px\">' + teks(T('setAbout'))");
  ui = replace(ui, "'<div class=\"um-note\">' + teks(T('c4Note')) + '</div>' +", "'<div class=\"um-note\">' + teks(T('c4Note')) + '</div>' + (comp.privasi !== 'privat' ? '<div class=\"um-note\">Isi pesan publik dan tautan terbatas dapat dibaca moderator dan terbit setelah disetujui. Foto serta lampiran tetap privat milik akun.</div>' : '') +");
  ui = replace(ui, "'<span class=\"when\">' + escAttr(ntah(p.dibuat)) + '</span></div>' +", "'<span class=\"when\">' + escAttr(ntah(p.dibuat)) + '</span></div>' + (p.privasi !== 'privat' ? '<div class=\"um-muted\">Status: ' + escAttr({pending:'Menunggu peninjauan',approved:'Terbit',rejected:'Ditolak',removed:'Ditarik'}[p.moderationStatus] || p.moderationStatus) + '</div>' : '') +");
  return ui;
}
