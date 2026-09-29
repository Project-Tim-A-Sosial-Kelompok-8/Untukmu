export function enhanceSocial(ui, replace) {
  ui = replace(ui, "var expSort = 'baru';", "var expSort = 'baru', expOffset = 0, expMood = '', expTag = '', expRequest = 0; ");
  ui = replace(ui, "comp.privasi = 'privat';", "comp.privasi = UM.store.defaultPrivacy();");
  ui = replace(ui, "function bukaJelajah() {", "function bukaJelajah() { expOffset = 0;");
  let start = ui.indexOf("  function renderJelajah() {");
  let end = ui.indexOf("  function buildJelajah() {", start);
  let feed = ui.slice(start, end);
  feed = replace(feed, "function renderJelajah() {", `function renderJelajah() {
    var requestId = ++expRequest;
    if (!expEl.querySelector('.um-head')) expEl.querySelector('.um-wrap').innerHTML = '<div class="um-head"><div class="um-h1">Jelajah ucapan</div><button class="um-close" data-act="close" aria-label="Tutup">×</button></div><p class="um-muted" role="status">Memuat ucapan…</p><button class="um-btn" data-act="sort" data-id="baru">Muat ulang</button>';
  `);
  feed = replace(feed, "then(function (rows) {", "then(function (rows) { if (requestId !== expRequest || !expEl.classList.contains('on')) return;");
  feed = replace(feed, "UM.store.listPesan()", "UM.store.explore(expSort, expOffset, expMood, expTag)");
  feed = replace(feed, "var dari = p.seed ? T('expAnon') : T('expMine');", "var dari = p.sendiri ? T('expMine') : T('expAnon');");
  feed = replace(feed, 'data-act="empati">', 'data-act="empati" data-id="\' + escAttr(p.id) + \'">');
  feed = replace(feed, "'</div></li>';", "(p.sendiri ? '' : '<button class=\"um-btn small ghost\" data-act=\"block\" data-id=\"' + escAttr(p.id) + '\">Blokir pengirim</button>') + '</div></li>';");
  feed = replace(feed, "'<div class=\"um-chips\" style=\"margin-bottom:14px\">' +", "'<div class=\"um-grid2\"><div class=\"um-field\"><label class=\"um-label\" for=\"um-filter-mood\">Suasana hati</label><select id=\"um-filter-mood\" class=\"um-select\"><option value=\"\">Semua</option>' + UM.i18n.moodIds().map(function(m) { return '<option value=\"' + escAttr(m) + '\"' + (expMood === m ? ' selected' : '') + '>' + escAttr(UM.i18n.mood(m)) + '</option>'; }).join('') + '</select></div><div class=\"um-field\"><label class=\"um-label\" for=\"um-filter-tag\">Tag</label><input id=\"um-filter-tag\" class=\"um-input\" value=\"' + escAttr(expTag) + '\" maxlength=\"50\"></div></div><button class=\"um-btn small\" data-act=\"filter\">Terapkan filter</button>' + '<div class=\"um-chips\" style=\"margin-bottom:14px;margin-top:14px\">' +");
  feed = replace(feed, "teks(T('expEmpty')) + '</div>');", "teks(T('expEmpty')) + '</div>') + '<div class=\"um-btn-row between\" style=\"margin-top:14px\"><button class=\"um-btn\" data-act=\"prev-page\"' + (expOffset ? '' : ' disabled') + '>Sebelumnya</button><button class=\"um-btn\" data-act=\"next-page\"' + (rows.length === 30 ? '' : ' disabled') + '>Berikutnya</button></div>';");
  feed = replace(feed, "    });\n  }", "    }).catch(function(err) { if (requestId === expRequest && expEl.classList.contains('on')) toast(err.message || 'Jelajah gagal dimuat.'); });\n  }");
  ui = ui.slice(0, start) + feed + ui.slice(end);
  ui = replace(ui, "else if (act === 'sort') { expSort = id; renderJelajah(); }", "else if (act === 'sort') { expSort = id; expOffset = 0; renderJelajah(); }\n      else if (act === 'filter') { expMood = document.getElementById('um-filter-mood').value; expTag = document.getElementById('um-filter-tag').value.trim(); expOffset = 0; renderJelajah(); }\n      else if (act === 'prev-page' || act === 'next-page') { expOffset = Math.max(0, expOffset + (act === 'next-page' ? 30 : -30)); renderJelajah(); }");
  ui = replace(ui, "else if (act === 'empati') { toast(T('empathiToast')); btn.disabled = true; }", "else if (act === 'empati') { btn.disabled = true; UM.store.empathy(id).then(function() { toast(T('empathiToast')); }).catch(function(err) { btn.disabled = false; toast(err.message); }); }");
  start = ui.indexOf("      else if (act === 'lapor') {");
  end = ui.indexOf("    });\n    document.body.appendChild(expEl);", start);
  if (start < 0 || end < 0) throw new Error("Report handler anchor missing");
  ui = ui.slice(0, start) + "      else if (act === 'lapor' || act === 'block') UM.openSocial(act === 'lapor' ? 'report' : 'block', id);\n" + ui.slice(end);
  ui = replace(ui, "if (em) em.onclick = function () { toast(T('empathiToast')); em.disabled = true; };", "if (em) em.onclick = function () { em.disabled = true; UM.store.empathy(p.id).then(function() { toast(T('empathiToast')); }).catch(function(err) { em.disabled = false; toast(err.message); }); };");
  ui = replace(ui, "var langs = [['id', 'Bahasa Indonesia'], ['en', 'English'], ['hans', '简体中文'], ['hant', '繁體中文'], ['ja', '日本語'], ['ko', '한국어']];", "var langs = [['id', 'Bahasa Indonesia']];");
  ui = replace(ui, "'<div class=\"um-h3\" style=\"margin-top:18px\">' + teks(T('setAbout'))", "'<div class=\"um-btn-row\"><button class=\"um-btn\" data-act=\"account\">Akun dan keamanan</button></div>' + '<div class=\"um-h3\" style=\"margin-top:18px\">' + teks(T('setAbout'))");
  ui = replace(ui, "'<div class=\"um-note\">' + teks(T('c4Note')) + '</div>' +", "'<div class=\"um-note\">' + teks(T('c4Note')) + '</div>' + (comp.privasi !== 'privat' ? '<div class=\"um-note\">Isi pesan publik dan tautan terbatas dapat dibaca moderator dan terbit setelah disetujui. Foto serta lampiran tetap privat milik akun.</div>' : '') +");
  ui = replace(ui, "'<span class=\"when\">' + escAttr(ntah(p.dibuat)) + '</span></div>' +", "'<span class=\"when\">' + escAttr(ntah(p.dibuat)) + '</span></div>' + (p.privasi !== 'privat' ? '<div class=\"um-muted\">Status: ' + escAttr({pending:'Menunggu peninjauan',approved:'Terbit',rejected:'Ditolak',removed:'Ditarik'}[p.moderationStatus] || p.moderationStatus) + '</div>' : '') +");
  return ui;
}
