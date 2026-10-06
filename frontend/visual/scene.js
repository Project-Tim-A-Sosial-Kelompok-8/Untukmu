/* Untukmu — kamera dan adegan kenangan.
 * Visual Milky Way dipertahankan dari Justin Zhang Jun, PolyForm Noncommercial 1.0.0.
 * Galaksi latar tidak memiliki label atau katalog astronomi.
 */
var scene = new THREE.Scene(), skyScene = new THREE.Scene();
var renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('cv'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000); // original renderer clear colour, before bloom/ACES
renderer.toneMapping = THREE.NoToneMapping;
scene.fog = new THREE.FogExp2(0x03040a, 0.0012);
var galaxyRoot = new THREE.Group(); scene.add(galaxyRoot);
var outputWidth = innerWidth, outputHeight = innerHeight;
var camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .5, 5000);
camera.position.set(0, 529, 715);
var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .08; controls.maxDistance = 1600; controls.minDistance = 5;
var SKY_R = 1000;
var skyCamera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 3000);
skyCamera.position.set(0, 0, .1);
var skyControls = new THREE.OrbitControls(skyCamera, renderer.domElement);
skyControls.enableDamping = true; skyControls.dampingFactor = .08; skyControls.rotateSpeed = -.35; skyControls.autoRotate = !reducedMotion(); skyControls.autoRotateSpeed = .12; skyControls.enableZoom = false; skyControls.enablePan = false; skyControls.enabled = false;
var viewMode = 'galaxy', beaconLang = 'id', flyState = null, returnBtn = null, videoFrameCount = 0;
var bpEl = document.getElementById('beacon-panel'), bpBody = document.getElementById('bp-body');
function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function setBeaconLang() { beaconLang = 'id'; document.documentElement.lang = 'id'; }
function videoNow() { return performance.now(); }
function mulberry32(seed) { return function() { seed += 0x6d2b79f5; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function glowTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.28, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  function bulgeTexture() { // per-pixel gaussian falloff — canvas gradients dither with RGB noise (visible as
    // coloured confetti when a huge close-up halo sprite magnifies the texture), so we write exact pixels instead
    var S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data, k = 4.5, base = Math.exp(-k);
    for (var py = 0; py < S; py++) for (var px = 0; px < S; px++) {
      var dx = (px + 0.5) / S * 2 - 1, dy = (py + 0.5) / S * 2 - 1, r2 = dx * dx + dy * dy;
      var a = r2 >= 1 ? 0 : (Math.exp(-k * r2) - base) / (1 - base); // exact gaussian, exactly zero at the rim
      var o4 = (py * S + px) * 4; d[o4] = 255; d[o4 + 1] = 255; d[o4 + 2] = 255; d[o4 + 3] = Math.round(a * 255);
    }
    x.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }
  var BULGE_TEX = bulgeTexture();
  function wispTexture(seed) { // turbulent filament cloud — domain-warped fBm under a radial mask; the "science-documentary nebula" look
    var S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d'), img = x.createImageData(S, S), d = img.data;
    function h2(ix, iy) { var n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453; return n - Math.floor(n); }
    function vn(vx, vy) { var xi = Math.floor(vx), yi = Math.floor(vy), xf = vx - xi, yf = vy - yi;
      var a = h2(xi, yi), b = h2(xi + 1, yi), e = h2(xi, yi + 1), f = h2(xi + 1, yi + 1);
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return a + (b - a) * u + (e - a) * v + (a - b - e + f) * u * v; }
    function fbm(fx, fy) { var s = 0, amp = 0.5, fr = 1; for (var o = 0; o < 4; o++) { s += amp * vn(fx * fr, fy * fr); amp *= 0.5; fr *= 2.1; } return s; }
    for (var py = 0; py < S; py++) for (var px = 0; px < S; px++) {
      var nx = px / S * 4, ny = py / S * 4;
      var wx = fbm(nx + 5.2, ny + 1.3), wy = fbm(nx - 3.1, ny + 7.7);
      var n = fbm(nx + 2.6 * wx, ny + 2.6 * wy);                       // strongly warped fBm → curling strands and knots, not a smooth blob
      var dx = px / S - 0.5, dy = py / S - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 2;
      var mask = Math.max(0, 1 - r); mask *= mask;
      var a = Math.pow(Math.max(0, n - 0.34) * 2.2, 1.5) * mask;       // fewer, bolder strands; melt at the rim
      var o4 = (py * S + px) * 4; d[o4] = 255; d[o4 + 1] = 255; d[o4 + 2] = 255; d[o4 + 3] = Math.min(255, Math.round(a * 255));
    }
    x.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }
var GLOW_TEX = glowTexture(), METEOR_TEX, METEOR_GEO;
function makeAsteroidGeometries() { return [new THREE.IcosahedronGeometry(1, 0)]; }
function reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
document.getElementById('bp-close').onclick = function() { clearSelection(); if (window.UM && UM.galaksi) UM.galaksi.bersihkanPilihan(); };
function clearSelection() { bpEl.classList.remove('open'); }
function showReturnBtn(show) {
  if (!returnBtn) {
    returnBtn = document.createElement('button'); returnBtn.type = 'button'; returnBtn.id = 'return-home'; returnBtn.textContent = '← Kembali ke Milky Way';
    returnBtn.addEventListener('click',function() { if (window.UM && UM.galaksi) UM.galaksi.kembaliKeRumah(); }); document.body.appendChild(returnBtn);
  }
  returnBtn.style.display = show && viewMode === 'galaxy' ? 'block' : 'none';
}
function flyTo(position, target, duration, done) {
  var startPosition = camera.position.clone(), startTarget = controls.target.clone(), damping = controls.enableDamping;
  controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
  camera.position.copy(startPosition); controls.target.copy(startTarget);
  controls.maxDistance = Math.max(controls.maxDistance, position.distanceTo(target) * 1.1);
  flyState = {p0:startPosition,p1:position.clone(),t0:startTarget,t1:target.clone(),offset0:camera.view && camera.view.enabled ? camera.view.offsetY : 0,offset1:window.UM && UM.galaksi ? UM.galaksi.offsetBingkai() : 0,start:videoNow(),dur:duration || 2600,onDone:done};
  controls.enabled = false;
}
function flyHome() { flyTo(new THREE.Vector3(0,390,520), new THREE.Vector3(), 2700, function(){showReturnBtn(false);}); }
function stepFly() {
  if (!flyState) return false;
  var progress = Math.min(1,(videoNow()-flyState.start)/flyState.dur), eased = progress*progress*progress*(progress*(progress*6-15)+10);
  camera.position.lerpVectors(flyState.p0,flyState.p1,eased); controls.target.lerpVectors(flyState.t0,flyState.t1,eased);
  var offset = flyState.offset0 + (flyState.offset1-flyState.offset0)*eased;
  if (offset) camera.setViewOffset(innerWidth,innerHeight,0,offset,innerWidth,innerHeight); else if(camera.view && camera.view.enabled) camera.clearViewOffset();
  camera.lookAt(controls.target);
  if (progress >= 1) { var done = flyState.onDone; flyState = null; controls.enabled = viewMode === 'galaxy'; if(done)done(); }
  return true;
}
var pointerStart = {x:0,y:0};
renderer.domElement.addEventListener('pointerdown',function(event) { pointerStart = {x:event.clientX,y:event.clientY}; });
function clickWasDrag(event) { return Math.abs(event.clientX-pointerStart.x)>6 || Math.abs(event.clientY-pointerStart.y)>6; }
function updateBeacons() {}
function updateSkyLabels() {}
function enterSky() {
  ensureSkyComposer(); viewMode = 'sky'; controls.enabled = false; skyControls.enabled = true; clearSelection();
  document.body.dataset.viewMode = 'sky'; document.getElementById('skyback').style.display = 'block'; showReturnBtn(false); return true;
}
function exitSky() {
  viewMode = 'galaxy'; skyControls.enabled = false; controls.enabled = !flyState;
  perfLast = 0; document.body.dataset.viewMode = 'galaxy'; document.getElementById('skyback').style.display = 'none'; return true;
}
document.getElementById('skyback').addEventListener('click',function() { window.exitSky(); });
window.addEventListener('keydown',function(event) {
  if (event.target.closest && event.target.closest('input,textarea,select')) return;
  if ((event.key || '').toLowerCase() === 'f') document.body.classList.toggle('gx-cinema');
  if (event.key === 'Escape' && viewMode === 'sky' && !(window.UM && UM.ui && UM.ui.anyScreenOpen())) window.exitSky();
});
function frame() {
  if (document.hidden) return;
  videoFrameCount++;
  var nowMs = videoNow(), t = (nowMs - visualStart) / 1000, still = reducedMotion();
  if (viewMode === 'galaxy') {
    if (!still) galaxyRoot.rotation.y = t * GALAXY_SPIN;
    galaxyLODs.forEach(function(L) {
      var dst = camera.position.distanceTo(L.center); L.dst = dst;
      L.pts.geometry.setDrawRange(0, Math.min(L.maxN, Math.max(400, L.minGalaxyDrawCount || 0, L.minDrawCount || 0, Math.floor(L.maxN * Math.min(1, Math.max(.14,L.refDist / dst)) * perfScale))));
      L.mat.uniforms.uSize.value = L.baseSize * Math.min(3.2, Math.max(.8,dst / L.refDist)) * renderer.getPixelRatio();
      if (L.mat.uniforms.uCap) L.mat.uniforms.uCap.value = 34 * renderer.getPixelRatio();
      if (!still) L.pts.quaternion.copy(L.q0).premultiply(galSpinTmp.setFromAxisAngle(L.axis,t * L.spin));
    });
    galaxyVeils.forEach(function(GV) {
      var fade = GV.hn ? Math.min(1,Math.max(0,(GV.lod.dst - GV.hn[0]) / (GV.hn[1] - GV.hn[0]))) : 1;
      GV.mat.opacity = GV.o * fade * (still ? 1 : 1 + GV.amp * Math.sin(t * 6.2832 / GV.T + GV.ph));
      if (GV.dr && !still) GV.mat.rotation = GV.r0 + t * GV.dr;
    });
    galaxyVols.forEach(function(GV) { GV.mesh.visible = perfScale > .3; GV.mesh.lookAt(camera.position); if(!still) GV.mat.uniforms.uTime.value = t; });
    if (bgTwinkleMat && !still) bgTwinkleMat.uniforms.uTime.value = t;
    var breath = still ? 0 : Math.sin(t * .32);
    coreBreath.forEach(function(core) {var s = core.s * (1 + .07 * breath); core.sp.scale.set(s,s,1); core.sp.material.opacity = core.o * (1 + .16 * breath);});
    if (!stepFly()) controls.update();
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); updateBeacons(); render();
    if (!still) updateFx(nowMs);
    if (perfLast) perfEMA += (Math.min(nowMs - perfLast,500) - perfEMA) * .05;
    perfLast = nowMs;
    if (nowMs > perfNextCheck) {
      perfNextCheck = nowMs + 10000;
      if (perfEMA > 40 && perfScale > .26) { perfScale *= .5; buildDust(dustFor()); }
      else if (perfEMA > 40 && renderer.getPixelRatio() > 1) {
        renderer.setPixelRatio(1); renderer.setSize(innerWidth,innerHeight);
        if(composer) composer.setSize(innerWidth,innerHeight);
        if(skyComposer) skyComposer.setSize(innerWidth,innerHeight);
      }
    }
  } else {
    if (!still) {skyTwinkleMat.uniforms.uTime.value = t; memorySkyStars.forEach(function(mat){mat.uniforms.uTime.value = t;}); updateSkyFx(nowMs);}
    skyControls.update(); skyCamera.updateMatrixWorld(true); updateSkyLabels();
    if(skyComposer) skyComposer.render(); else renderer.render(skyScene,skyCamera);
  }
}
window.UM_ENGINE = {renderer:renderer,scene:scene,camera:camera,frame:frame,cameraForView:function(){return viewMode === 'sky' ? skyCamera : camera;},stop:function(){},metrics:function(){return {frames:videoFrameCount,mode:viewMode,pixelRatio:renderer.getPixelRatio()};}};
window.addEventListener('resize',function() {
  outputWidth = innerWidth; outputHeight = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,2)); renderer.setSize(outputWidth,outputHeight);
  if(composer) composer.setSize(outputWidth,outputHeight);
  if(skyComposer) skyComposer.setSize(outputWidth,outputHeight);
  [camera,skyCamera].forEach(function(value) {value.aspect=innerWidth/innerHeight;value.updateProjectionMatrix();});
});
var motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
motionMedia.addEventListener('change',function(){skyControls.autoRotate = !reducedMotion(); if(reducedMotion() && flyState){flyState.p0.copy(camera.position);flyState.t0.copy(controls.target);flyState.start=videoNow();flyState.dur=120;}});
