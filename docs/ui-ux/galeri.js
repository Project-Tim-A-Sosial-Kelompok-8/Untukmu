(() => {
  "use strict";
  const data = window.UNTUKMU_UI_UX;
  const root = document.body.dataset.root || "";
  let device = document.body.dataset.device || "mobile";
  let selected = null;
  let part = 0;
  let visible = [];
  const byId = id => document.getElementById(id);
  const dialog = byId("preview");
  const search = byId("search");
  const group = byId("group");
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function manifest() { return data.devices.find(item => item.device === device); }
  const groups = [...new Set(data.devices.flatMap(item => item.screens.map(screen => screen.group)))];
  groups.forEach(name => { const option = node("option", name); option.value = name; group.append(option); });
  if (!document.body.dataset.device) for (const name of ["mobile", "desktop"]) {
    const button = node("button", name === "mobile" ? "Mobile" : "Desktop");
    button.dataset.device = name;
    button.addEventListener("click", () => { device = name; render(); });
    byId("devices").append(button);
  }
  function render() {
    const query = search.value.trim().toLocaleLowerCase("id");
    visible = manifest().screens.filter(screen => (!group.value || screen.group === group.value) &&
      [screen.title, screen.group, screen.entry, screen.action, screen.result].join(" ").toLocaleLowerCase("id").includes(query));
    byId("gallery").replaceChildren();
    document.querySelectorAll("[data-device]").forEach(button => { if (button.tagName === "BUTTON") button.setAttribute("aria-pressed", String(button.dataset.device === device)); });
    for (const screen of visible) {
      const figure = node("figure", undefined, "screen");
      const button = node("button");
      button.type = "button";
      button.setAttribute("aria-label", `Lihat ${screen.title}`);
      const image = node("img"); image.src = root + screen.images[0].path; image.alt = screen.title; image.loading = "lazy";
      button.append(image); button.addEventListener("click", () => open(screen));
      const caption = node("figcaption"); caption.append(node("span", screen.group, "badge"), node("h2", screen.title), node("p", screen.entry), node("p", `${screen.images.length} bagian gambar`));
      figure.append(button, caption); byId("gallery").append(figure);
    }
    byId("summary").textContent = `${visible.length} dari ${manifest().screens.length} layar · ${device} ${manifest().viewport.width} × ${manifest().viewport.height} px`;
    byId("empty").hidden = visible.length !== 0;
  }
  function open(screen) {
    selected = screen; part = 0; updatePreview();
    if (!dialog.open) dialog.showModal();
  }
  function updatePreview() {
    const image = selected.images[part];
    byId("preview-title").textContent = selected.title;
    byId("preview-image").src = root + image.path;
    byId("preview-image").alt = `${selected.title}, bagian ${part + 1}`;
    byId("original").href = root + image.path;
    byId("entry").textContent = selected.entry;
    byId("action").textContent = selected.action;
    byId("result").textContent = selected.result;
    byId("preview-group").textContent = `${device} · ${selected.group}`;
    byId("fixture").textContent = selected.fixture || ""; byId("fixture").hidden = !selected.fixture;
    byId("dimensions").textContent = `${image.width} × ${image.height} px · scroll ${image.scroll} px`;
    byId("part-number").textContent = `Bagian ${part + 1} / ${selected.images.length}`;
    byId("part-prev").disabled = part === 0;
    byId("part-next").disabled = part === selected.images.length - 1;
    const index = visible.indexOf(selected);
    byId("screen-prev").disabled = index <= 0;
    byId("screen-next").disabled = index >= visible.length - 1;
    history.replaceState(null, "", `#${device}/${selected.id}`);
  }
  byId("part-prev").addEventListener("click", () => { if (part > 0) { part--; updatePreview(); } });
  byId("part-next").addEventListener("click", () => { if (part < selected.images.length - 1) { part++; updatePreview(); } });
  byId("screen-prev").addEventListener("click", () => { const index = visible.indexOf(selected); if (index > 0) open(visible[index - 1]); });
  byId("screen-next").addEventListener("click", () => { const index = visible.indexOf(selected); if (index < visible.length - 1) open(visible[index + 1]); });
  byId("close-preview").addEventListener("click", () => dialog.close());
  search.addEventListener("input", render); group.addEventListener("change", render);
  render();
  const [hashDevice, hashId] = location.hash.slice(1).split("/");
  if (hashId && ["mobile", "desktop"].includes(hashDevice)) {
    device = document.body.dataset.device || hashDevice; render();
    const screen = manifest().screens.find(item => item.id === hashId); if (screen) open(screen);
  }
})();
