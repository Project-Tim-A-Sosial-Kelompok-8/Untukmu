export function enhanceAdvanced(ui, replace) {
  // Keep typed values before React reconciles an asynchronous composer render.
  ui = replace(ui, "compEl.id = 'um-comp';", "compEl.id = 'um-comp'; compEl.addEventListener('input', serapInput, true);");
  ui = replace(ui, 'function renderKomposer() {', 'function renderKomposer() { var renderId = (comp.renderId || 0) + 1; comp.renderId = renderId;');
  ui = replace(ui, 'var petakan = function (body) {', 'var petakan = function (body) { if (comp.renderId !== renderId) return;');
  ui = replace(ui, 'comp.galaksiId = galaksiId || null;', 'comp.galaksiId = galaksiId || null; comp.targets = [];');
  ui = replace(ui, 'return isi +\n', `isi += '<div class="um-field"><div class="um-label">Tujuan tambahan (opsional, maksimal 9)</div><div class="um-chips">' + rows.filter(function(g) { return g.id !== comp.galaksiId; }).map(function(g) { return '<button class="um-chip' + ((comp.targets || []).indexOf(g.id) >= 0 ? ' on' : '') + '" data-act="extra-target" data-id="' + escAttr(g.id) + '">' + escAttr(g.nama) + '</button>'; }).join('') + '</div></div>';\n      return isi +\n`);
  ui = replace(ui, "if (act === 'pick-galaksi') {", "if (act === 'extra-target') { var tid = btn.getAttribute('data-id'), pos = comp.targets.indexOf(tid); if(pos >= 0) comp.targets.splice(pos,1); else if(comp.targets.length < 9) comp.targets.push(tid); else toast('Maksimal 10 tujuan per pesan.'); renderKomposer(); return; }\n      if (act === 'pick-galaksi') {");
  ui = replace(ui, "comp.galaksiId = btn.getAttribute('data-id');", "comp.galaksiId = btn.getAttribute('data-id'); comp.targets = comp.targets.filter(function(id) { return id !== comp.galaksiId; });");
  ui = replace(ui, 'galaksiId: g.id,', 'galaksiId: g.id, galaksiIds: [g.id].concat(comp.targets || []),');
  ui = replace(ui, 'function lampiran(p) { return', `function lampiran(p) { return (p.sendiri ? '<button class="um-btn small" data-act="manage" data-id="' + escAttr(p.originMessageId || p.id) + '">Kelola ' + (p.jenis === 'doa' ? 'doa' : 'pesan') + '</button>' : '') +`);
  ui = ui.replace("teks(T('setReset'))", "'Hapus pesan dan tujuan'").replace("teks(T('setResetNote'))", "'Pesan dan tujuan akan dihapus permanen. Foto serta lampiran tetap dapat diambil melalui ekspor akun.'").replace("teks(T('setResetDo'))", "'Hapus pesan dan tujuan'");
  return ui;
}
