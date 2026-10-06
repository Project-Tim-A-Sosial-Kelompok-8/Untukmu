/* Untukmu visual scene: only account constellations and approved public messages.
 * Camera controls adapted from Justin Zhang Jun, PolyForm Noncommercial 1.0.0.
 * No astronomical catalogue, stock photos, planets, or default central galaxy.
 */
var scene = new THREE.Scene(), skyScene = new THREE.Scene();
var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x03040a);
document.body.prepend(renderer.domElement);
var camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, .1, 10000);
camera.position.set(0, 700, 1100);
var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .08; controls.maxDistance = 6000; controls.minDistance = 8;
var SKY_R = 1000;
var skyCamera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .01, 3000);
skyCamera.position.set(0, 0, .1);
var skyControls = new THREE.OrbitControls(skyCamera, renderer.domElement);
skyControls.enableDamping = true; skyControls.rotateSpeed = .35; skyControls.enableZoom = false; skyControls.enablePan = false; skyControls.enabled = false;
var viewMode = 'galaxy', beaconLang = 'id', flyState = null, returnBtn = null, videoFrameCount = 0;
var bpEl = document.getElementById('beacon-panel'), bpBody = document.getElementById('bp-body');
function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function setBeaconLang() { beaconLang = 'id'; document.documentElement.lang = 'id'; }
function videoNow() { return performance.now(); }
function mulberry32(seed) { return function() { seed += 0x6d2b79f5; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function glowTexture() {
  var canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  var context = canvas.getContext('2d'), gradient = context.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,1)'); gradient.addColorStop(.15,'rgba(255,255,255,.9)'); gradient.addColorStop(.45,'rgba(255,255,255,.18)'); gradient.addColorStop(1,'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0,0,64,64); return new THREE.CanvasTexture(canvas);
}
var GLOW_TEX = glowTexture(), METEOR_TEX = GLOW_TEX, METEOR_GEO = new THREE.PlaneGeometry(1,1);
function makeAsteroidGeometries() { return [new THREE.IcosahedronGeometry(1, 0)]; }
var galaxyLODs = [];
function buildGalaxyStars(center, options) {
  var count = options.count || 8500, radius = options.radius || 140;
  var positions = new Float32Array(count * 3), scales = new Float32Array(count), colors = new Float32Array(count * 3);
  var warm = new THREE.Color(options.halo || '#ffd9a0'), cool = new THREE.Color('#9fc3f2'), color = new THREE.Color();
  for (var i = 0; i < count; i++) {
    var fraction = Math.pow(Math.random(), .7), angle = Math.random() * Math.PI * 2, x, y, z;
    if (options.kind === 'ellipsoid') {
      var height = Math.random() * 2 - 1, side = Math.sqrt(1 - height * height);
      x = Math.cos(angle) * side * fraction * radius; y = height * fraction * radius * .65; z = Math.sin(angle) * side * fraction * radius;
    } else if (options.kind === 'irregular') {
      x = (Math.random() + Math.random() - 1) * radius; y = (Math.random() - .5) * radius * .35; z = (Math.random() + Math.random() - 1) * radius;
    } else {
      angle = (i % 2) * Math.PI + fraction * Math.PI * 4 + (Math.random() - .5) * .65;
      x = Math.cos(angle) * fraction * radius; y = (Math.random() + Math.random() - 1) * radius * .07; z = Math.sin(angle) * fraction * radius;
    }
    positions[i*3] = x; positions[i*3+1] = y; positions[i*3+2] = z;
    scales[i] = .35 + Math.random() * .65;
    color.copy(warm).lerp(cool, fraction).multiplyScalar(.55 + Math.random() * .3);
    colors[i*3] = color.r; colors[i*3+1] = color.g; colors[i*3+2] = color.b;
  }
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales,1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors,3));
  var material = new THREE.ShaderMaterial({
    uniforms:{uSize:{value:options.pointSize || 2.1},uCap:{value:34}},
    vertexShader:'uniform float uSize;uniform float uCap;attribute float aScale;attribute vec3 aColor;varying vec3 vColor;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=min(uSize*aScale*(300.0/-p.z),uCap);vColor=aColor;}',
    fragmentShader:'varying vec3 vColor;void main(){float d=length(gl_PointCoord-vec2(.5));float a=pow(max(0.0,1.0-2.0*d),2.0);if(a<.01)discard;gl_FragColor=vec4(vColor,a);}',
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
  });
  var points = new THREE.Points(geometry,material), normal = center.clone().negate().normalize();
  var perpendicular = new THREE.Vector3().crossVectors(normal,new THREE.Vector3(0,1,0));
  if (perpendicular.lengthSq() < .001) perpendicular.set(1,0,0);
  normal.applyAxisAngle(perpendicular.normalize(),options.inc || .72);
  var rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),normal);
  rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(normal,options.roll || 0));
  points.position.copy(center); points.quaternion.copy(rotation); points.frustumCulled = false; scene.add(points);
  galaxyLODs.push({pts:points,mat:material,center:center.clone(),axis:normal,q0:rotation,maxN:count,refDist:radius*3,baseSize:options.pointSize || 2.1,spin:options.spin || .02});
  [[radius*.62,.16,options.halo],[radius*.2,.9,options.core]].forEach(function(entry) {
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:GLOW_TEX,color:entry[2] || '#fff4e2',opacity:entry[1],transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    sprite.position.copy(center); sprite.scale.set(entry[0],entry[0],1); scene.add(sprite);
  });
}
window.GX = { buildGalaxyStars: buildGalaxyStars, galaxyLODs: galaxyLODs };
document.getElementById('bp-close').onclick = function() { clearSelection(); if (window.UM && UM.galaksi) UM.galaksi.bersihkanPilihan(); };
function clearSelection() { bpEl.classList.remove('open'); }
function showReturnBtn(show) {
  if (!returnBtn) {
    returnBtn = document.createElement('button'); returnBtn.type = 'button'; returnBtn.id = 'return-home'; returnBtn.textContent = '← Semua kenangan';
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
function flyHome() {
  if (window.UM && UM.galaksi && UM.galaksi.state.daftar.length) UM.galaksi.bingkaiLadang();
  else flyTo(new THREE.Vector3(0,700,1100), new THREE.Vector3(), 2600);
  showReturnBtn(false);
}
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
  viewMode = 'sky'; controls.enabled = false; skyControls.enabled = true; clearSelection();
  document.body.dataset.viewMode = 'sky'; document.getElementById('skyback').style.display = 'block'; showReturnBtn(false); return true;
}
function exitSky() {
  viewMode = 'galaxy'; skyControls.enabled = false; controls.enabled = !flyState;
  document.body.dataset.viewMode = 'galaxy'; document.getElementById('skyback').style.display = 'none'; return true;
}
document.getElementById('skyback').addEventListener('click',function() { window.exitSky(); });
window.addEventListener('keydown',function(event) {
  if (event.target.closest && event.target.closest('input,textarea,select')) return;
  if ((event.key || '').toLowerCase() === 'f') document.body.classList.toggle('gx-cinema');
  if (event.key === 'Escape' && viewMode === 'sky' && !(window.UM && UM.ui && UM.ui.anyScreenOpen())) window.exitSky();
});
function frame() {
  videoFrameCount++;
  if (viewMode === 'galaxy') {
    if (!stepFly()) controls.update();
    galaxyLODs.forEach(function(lod) { var spin = new THREE.Quaternion().setFromAxisAngle(lod.axis,videoNow()*.001*lod.spin); lod.pts.quaternion.copy(spin.multiply(lod.q0)); });
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); updateBeacons(); renderer.render(scene,camera);
  } else {
    skyControls.update(); skyCamera.updateMatrixWorld(true); updateSkyLabels(); renderer.render(skyScene,skyCamera);
  }
}
window.UM_ENGINE = {renderer:renderer,scene:scene,camera:camera,frame:frame,cameraForView:function(){return viewMode === 'sky' ? skyCamera : camera;},stop:function(){},metrics:function(){return {frames:videoFrameCount,mode:viewMode,pixelRatio:renderer.getPixelRatio()};}};
window.addEventListener('resize',function() {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,2)); renderer.setSize(innerWidth,innerHeight);
  [camera,skyCamera].forEach(function(value) {value.aspect=innerWidth/innerHeight;value.updateProjectionMatrix();});
});
